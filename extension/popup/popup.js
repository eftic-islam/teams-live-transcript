const P = globalThis.TTSParse;
const $ = (id) => document.getElementById(id);

let tabId = null;
let meeting = null; // { title, date } from the top frame
const frameFor = { pane: null, captions: null };

function show(el, visible) {
  el.hidden = !visible;
}

function setResult(text, kind) {
  const el = $('result');
  el.textContent = text;
  el.className = `result ${kind}`;
  show(el, !!text);
}

function setBusy(busy) {
  for (const id of ['save-pane', 'save-live']) $(id).disabled = busy;
}

const TEAMS_URL = /^https:\/\/(teams\.microsoft\.com|teams\.cloud\.microsoft)\//i;
let startedInTab = false;

// Tabs opened before the extension was installed (or reloaded) don't have its
// scripts yet; start them now instead of making you reload and rejoin the meeting.
async function startInOpenTab(tab) {
  if (startedInTab || !TEAMS_URL.test(tab?.url || '')) return false;
  startedInTab = true;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: ['src/selectors.js', 'src/parse.js', 'src/content.js'],
    });
    return true;
  } catch {
    return false;
  }
}

async function frameStatuses() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id;
  let frames = await queryFrames();
  if (!frames.length && (await startInOpenTab(tab))) frames = await queryFrames();
  return frames;
}

async function queryFrames() {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => (globalThis.__ttsStatus ? globalThis.__ttsStatus() : null),
    });
    return results.filter((r) => r.result).map((r) => ({ frameId: r.frameId, ...r.result }));
  } catch {
    return [];
  }
}

function best(frames, key) {
  return frames.filter((f) => f[key]).sort((a, b) => b[key].count - a[key].count)[0] || null;
}

async function scanPage() {
  const frames = await frameStatuses();
  meeting = frames.find((f) => f.top)?.meeting || null;
  const pane = best(frames, 'pane');
  const captions = best(frames, 'captions');
  frameFor.pane = pane?.frameId ?? null;
  frameFor.captions = captions?.frameId ?? null;

  const status = $('status');
  status.textContent = '';
  const lines = [];
  if (pane) {
    lines.push(
      pane.pane.active
        ? `Recording the Transcript pane: ${pane.pane.count} paragraphs${pane.pane.catchingUp ? ' (catching up on earlier lines…)' : ''}.`
        : `Transcript pane recorded: ${pane.pane.count} paragraphs (pane is closed now).`,
    );
  }
  if (captions?.captions.count) lines.push(`${captions.captions.active ? 'Recording' : 'Recorded'} live captions: ${captions.captions.count} lines.`);
  if (pane?.pane.active || captions?.captions.active) {
    const dot = document.createElement('span');
    dot.className = 'dot';
    status.append(dot);
  }
  if (!lines.length) {
    lines.push(
      frames.length
        ? 'Running. Now open the Transcript pane in the meeting (More → Record and transcribe → Show transcript), or turn on live captions. A “Recording” badge appears at the bottom-left of the page within a few seconds.'
        : TEAMS_URL.test((await chrome.tabs.get(tabId).catch(() => null))?.url || '')
          ? 'The extension couldn’t start on this tab. Reload the tab (you may need to rejoin the meeting) and try again.'
          : 'Open Teams in the browser (teams.microsoft.com) and join the meeting there. The Teams desktop app can’t be read by a browser extension.',
    );
  }
  status.append(lines.join(' '));

  show($('save-pane'), !!pane?.pane.count);
  show($('save-live'), !!captions?.captions.count);
}

async function saveFromPage(type, frameId, extra = {}) {
  setBusy(true);
  setResult('Saving… (this can take a few seconds while missed lines are checked)', '');
  try {
    const res = await chrome.tabs.sendMessage(tabId, { type, meeting, ...extra }, { frameId });
    if (!res?.ok) throw new Error(res?.error || 'No response from the page. Try reloading it.');
    const msg = [`Saved ${res.count} paragraphs/lines as ${res.filename}`, ...(res.warnings || [])].join('\n');
    setResult(msg, res.warnings?.length ? 'warn' : 'ok');
  } catch (err) {
    setResult(String(err?.message || err), 'err');
  } finally {
    setBusy(false);
    renderSessions();
  }
}

$('save-pane').addEventListener('click', () => saveFromPage('TTS_SAVE_PANE', frameFor.pane));
$('save-live').addEventListener('click', () => saveFromPage('TTS_SAVE_LIVE', frameFor.captions));

// ---- recordings kept in storage

async function renderSessions() {
  const all = await chrome.storage.local.get(null);
  const sessions = Object.entries(all)
    .filter(([k]) => k.startsWith('live:'))
    .map(([key, s]) => ({ key, ...s }))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const ul = $('sessions');
  ul.replaceChildren();
  if (!sessions.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Nothing recorded yet.';
    ul.append(li);
    return;
  }
  for (const s of sessions) {
    const li = document.createElement('li');
    const meta = document.createElement('div');
    meta.className = 'meta';
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = P.cleanMeetingTitle(s.title) || 'Teams meeting';
    name.title = name.textContent;
    const sub = document.createElement('div');
    sub.className = 'sub';
    const kind = s.kind === 'transcript' ? 'transcript' : 'captions';
    const unit = s.kind === 'transcript' ? 'paragraphs' : 'lines';
    sub.textContent = `${kind} · ${new Date(s.startedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} · ${s.rows?.length ?? s.entries.length} ${unit}`;
    meta.append(name, sub);

    const save = document.createElement('button');
    save.textContent = 'Save';
    save.addEventListener('click', () => saveSession(s));
    const del = document.createElement('button');
    del.textContent = 'Delete';
    del.addEventListener('click', async () => {
      if (!confirm(`Delete the recorded ${kind} for "${name.textContent}"? This can't be undone.`)) return;
      await chrome.storage.local.remove(s.key);
      renderSessions();
    });
    li.append(meta, save, del);
    ul.append(li);
  }
}

async function saveSession(s) {
  const isTranscript = s.kind === 'transcript';
  const text = P.formatTranscript(s.entries, {
    title: P.cleanMeetingTitle(s.title),
    date: s.date,
    source: isTranscript ? 'live Transcript pane' : 'live captions',
    grouped: isTranscript,
  });
  const filename = P.transcriptFilename({ date: s.date, title: s.title, time: P.liveStartTime(s.entries, s.startedAt) }, isTranscript ? 'transcript' : 'live captions');
  const res = await chrome.runtime.sendMessage({ type: 'TTS_DOWNLOAD', text, filename });
  setResult(res?.ok ? `Saved ${s.entries.length} as ${res.savedAs || filename}` : `Couldn't save: ${res?.error}`, res?.ok ? 'ok' : 'err');
}

// ---- diagnostic file (page structure only; spoken text is replaced by its length)

$('diagnose').addEventListener('click', async () => {
  let reports = [];
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => (globalThis.__ttsDiagnose ? globalThis.__ttsDiagnose() : null),
    });
    reports = results.map((r) => r.result).filter(Boolean);
  } catch {}
  if (!reports.length) {
    setResult('The extension isn’t running on this page. Open Teams in the browser and reload the tab.', 'err');
    return;
  }
  const text = [`Teams Live Transcript diagnostic · ${new Date().toISOString()}`, `Browser: ${navigator.userAgent}`, '', ...reports].join('\n\n');
  let copied = false;
  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch {}
  const res = await chrome.runtime.sendMessage({ type: 'TTS_DOWNLOAD', text, filename: 'teams-transcript-diagnostic.txt' }).catch((e) => ({ ok: false, error: e.message }));
  const lines = [];
  if (copied) lines.push(`Copied to your clipboard (${reports.length} frame(s), ${text.length} characters). Paste it to whoever is helping you.`);
  lines.push(res?.ok ? `Also saved as ${res.savedAs || 'teams-transcript-diagnostic.txt'}.` : `Couldn't save the file: ${res?.error || 'unknown error'}`);
  lines.push('It contains page structure only; what people said is replaced by «text:N».');
  setResult(lines.join('\n'), copied || res?.ok ? 'ok' : 'err');
});

scanPage();
renderSessions();
setInterval(scanPage, 3000);
