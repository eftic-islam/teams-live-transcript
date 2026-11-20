// Runs in every Teams frame (extension's isolated world).
// Ways of getting a transcript:
//   1. Live Transcript pane: while a meeting is running, every paragraph that
//      appears in the Transcript pane is recorded (and earlier ones are caught up
//      by scrolling through the pane once). Saved to chrome.storage continuously.
//   2. Live captions: the same, for the live captions strip.
(() => {
  // After the extension is reloaded, the copy already running in an open tab is cut
  // off from the extension; let the new copy take over (the old one stops itself).
  if (globalThis.__ttsContentLoaded && globalThis.__ttsAlive?.()) return;
  const instance = Symbol('tts');
  globalThis.__ttsContentLoaded = true;
  globalThis.__ttsInstance = instance;
  globalThis.__ttsAlive = () => !!chrome.runtime?.id;
  const superseded = () => globalThis.__ttsInstance !== instance || !chrome.runtime?.id;

  const P = globalThis.TTSParse;
  const S = globalThis.TTS_SELECTORS;
  const T = S.transcript;
  const C = S.captions;
  const LIVE_KEY_PREFIX = 'live:';
  const MAX_STORED_SESSIONS = 15;
  const TIME_RE = /^\d{1,2}:\d{2}(:\d{2})?\s*([AaPp]\.?\s?[Mm]\.?)?$/;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const pad = (n) => String(n).padStart(2, '0');
  const clockOf = (ms) => {
    const d = new Date(ms);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };
  const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromMeeting = (meeting) => Object.fromEntries(Object.entries(meeting || {}).filter(([, v]) => v));

  // ---------------------------------------------------------------- meeting info

  function firstText(selectors) {
    for (const s of selectors) {
      const t = P.cleanText(document.querySelector(s)?.textContent);
      if (t) return t;
    }
    return '';
  }

  function meetingInfo() {
    const pageTitle = document.title || '';
    const title = P.cleanMeetingTitle(
      firstText(S.meeting.title) ||
        pageTitle
          .replace(/\.(mp4|m4a|webm|mov)$/i, '')
          .replace(/-Meeting Recording$/i, '')
          .replace(/-\d{8}_\d{6}$/, ''),
    );
    let date = '';
    const dateText = firstText(S.meeting.date);
    const m = dateText.match(/[A-Za-z]+ \d{1,2},? \d{4}/) || dateText.match(/\d{4}-\d{2}-\d{2}/);
    if (m && !isNaN(Date.parse(m[0]))) date = isoDate(new Date(Date.parse(m[0])));
    if (!date) {
      const r = pageTitle.match(/-(\d{4})(\d{2})(\d{2})_\d{6}/); // Stream recording file names
      if (r) date = `${r[1]}-${r[2]}-${r[3]}`;
    }
    return { title, date };
  }

  // ---------------------------------------------------------------- storage

  async function pruneOldSessions() {
    try {
      const all = await chrome.storage.local.get(null);
      const old = Object.entries(all)
        .filter(([k]) => k.startsWith(LIVE_KEY_PREFIX))
        .sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0))
        .slice(MAX_STORED_SESSIONS - 1)
        .map(([k]) => k);
      if (old.length) await chrome.storage.local.remove(old);
    } catch {}
  }

  function newSession(kind) {
    const info = meetingInfo();
    const now = Date.now();
    pruneOldSessions();
    return { id: `${now}-${kind}`, kind, startedAt: now, title: info.title, date: info.date || isoDate(new Date(now)), url: location.href };
  }

  async function storeSession(session, entries, extra = {}) {
    const info = meetingInfo();
    if (info.title) session.title = info.title;
    const key = LIVE_KEY_PREFIX + session.id;
    const record = { [key]: { ...session, ...extra, updatedAt: Date.now(), entries } };
    try {
      await chrome.storage.local.set(record);
    } catch (err) {
      // Storage full (about 10 MB): drop the oldest other backups, then retry.
      const all = await chrome.storage.local.get(null);
      const others = Object.entries(all)
        .filter(([k]) => k.startsWith(LIVE_KEY_PREFIX) && k !== key)
        .sort((a, b) => (a[1].updatedAt || 0) - (b[1].updatedAt || 0))
        .map(([k]) => k);
      if (!others.length) throw err;
      await chrome.storage.local.remove(others.slice(0, Math.max(1, Math.ceil(others.length / 2))));
      await chrome.storage.local.set(record);
    }
  }

  function download(text, filename) {
    return chrome.runtime.sendMessage({ type: 'TTS_DOWNLOAD', text, filename });
  }

  function fileName(meeting, suffix) {
    return P.transcriptFilename(meeting, suffix);
  }

  // ---------------------------------------------------------------- transcript pane layouts
  // A layout knows how to list the rendered rows, give each its position in the
  // whole transcript (a number that only grows), and read speaker / time / text.
  // `contiguous` layouts number rows base, base+1, base+2...; others only keep order.

  const LT = S.liveTranscript;

  function outermost(els) {
    return els.filter((el) => !els.some((o) => o !== el && o.contains(el)));
  }

  function textOf(el, sel) {
    return P.cleanText(outermost([...el.querySelectorAll(sel)]).map((n) => n.textContent).join(' '));
  }

  const meetingLayout = {
    name: 'Teams meeting transcript',
    contiguous: false,
    rowSelector: LT.row,
    rows: () => [...document.querySelectorAll(LT.row)].filter((el) => LT.rowIdPattern.test(el.getAttribute('data-tid'))),
    index: (el) => Number(el.getAttribute?.('data-tid')?.match(LT.rowIdPattern)?.[2] ?? NaN),
    meetingId: (el) => el.getAttribute('data-tid')?.match(LT.rowIdPattern)?.[1] || '',
    read: (el) => ({
      speaker: P.cleanText(el.querySelector(LT.speaker)?.textContent),
      timeText: P.cleanText(el.querySelector(LT.timestamp)?.textContent),
      text: textOf(el, LT.text),
    }),
  };

  function readKnownRow(el) {
    const speaker = P.cleanText(el.querySelector(T.speaker)?.textContent);
    const timeText = P.cleanText(el.querySelector(T.timestamp)?.textContent);
    let text = textOf(el, T.text);
    if (!text) {
      const clone = el.cloneNode(true);
      clone.querySelectorAll(`${T.speaker}, ${T.timestamp}`).forEach((n) => n.remove());
      text = P.cleanText(clone.textContent);
    }
    return { speaker, timeText, text };
  }

  const knownLayout = {
    name: 'Teams transcript layout',
    contiguous: true,
    base: 0,
    rowSelector: T.item,
    rows: () => [...document.querySelectorAll(T.item)].filter((el) => T.itemIdPattern.test(el.id)),
    index: (el) => Number(el.id?.match(T.itemIdPattern)?.[1] ?? NaN),
    read: readKnownRow,
  };

  function genericIndex(el) {
    for (const a of T.rowIndexAttrs) {
      const v = el.getAttribute?.(a);
      if (v != null && /^\d+$/.test(v)) return Number(v);
    }
    return NaN;
  }

  // Row text laid out as: [avatar initials] / Name / 10:23 AM / paragraph...
  function readGenericRow(el) {
    const lines = (el.isConnected ? el.innerText : el.textContent).split('\n').map(P.cleanText).filter(Boolean);
    const ti = lines.findIndex((l) => TIME_RE.test(l));
    if (ti >= 1 && ti <= 3) return { speaker: lines[ti - 1], timeText: lines[ti], text: P.cleanText(lines.slice(ti + 1).join(' ')) };
    return { speaker: '', timeText: '', text: P.cleanText(lines.join(' ')) };
  }

  const genericRowSelector = T.rowIndexAttrs.map((a) => `[${a}]`).join(',');
  const genericLayout = {
    name: 'generic transcript layout',
    contiguous: true,
    base: 1,
    rowSelector: genericRowSelector,
    rows: () => {
      for (const region of document.querySelectorAll(T.regions.join(','))) {
        const rows = outermost([...region.querySelectorAll(genericRowSelector)].filter((el) => !isNaN(genericIndex(el))));
        if (rows.length) return rows;
      }
      return [];
    },
    index: genericIndex,
    read: readGenericRow,
  };

  function detectLayout() {
    for (const L of [meetingLayout, knownLayout, genericLayout]) if (L.rows().length) return L;
    return null;
  }

  function isScrollable(el) {
    if (el.scrollHeight <= el.clientHeight + 2) return false;
    const oy = getComputedStyle(el).overflowY;
    return oy === 'auto' || oy === 'scroll' || oy === 'overlay';
  }

  function findScroller(L) {
    const first = L?.rows()[0];
    for (let el = first?.parentElement; el; el = el.parentElement) if (isScrollable(el)) return el;
    for (const s of [LT.scroller, ...T.containers, ...T.regions]) {
      for (const c of document.querySelectorAll(s)) {
        if (isScrollable(c)) return c;
        const inner = [...c.querySelectorAll('*')].find(isScrollable);
        if (inner) return inner;
      }
    }
    return null;
  }

  // Total number of rows the list says it has (Fluent lists expose aria-setsize).
  function expectedRowCount() {
    let max = 0;
    for (const el of document.querySelectorAll('[aria-setsize]')) {
      if (!el.closest(`${T.item}, ${T.containers.join(', ')}, ${T.regions.join(', ')}`)) continue;
      const n = Number(el.getAttribute('aria-setsize'));
      if (n > max) max = n;
    }
    return max || null;
  }

  // Resolves once the element stops changing (or after `max` ms).
  function settle(el, quiet = 120, max = 1200) {
    return new Promise((resolve) => {
      let timer;
      const done = () => {
        obs.disconnect();
        clearTimeout(timer);
        clearTimeout(cap);
        resolve();
      };
      const obs = new MutationObserver(() => {
        clearTimeout(timer);
        timer = setTimeout(done, quiet);
      });
      obs.observe(el, { childList: true, subtree: true, characterData: true });
      timer = setTimeout(done, quiet);
      const cap = setTimeout(done, max);
    });
  }

  // ---------------------------------------------------------------- reading rows, finding gaps
  // A collector holds everything read from one transcript: rows by position, plus
  // the runs of rows that were on screen together ("spans"). A virtual list always
  // draws an unbroken run of rows, so where two spans overlap nothing in between
  // can have been skipped. Wherever they don't overlap is a possible gap, which
  // gets re-read, and is marked in the saved file if it still can't be.

  const newCollector = () => ({ rows: new Map(), spans: [] });

  function mergeSpans(L, spans) {
    const slack = L.contiguous ? 1 : 0; // numbered rows 4 and 5 are neighbours
    const out = [];
    for (const [a, b] of spans.slice().sort((x, y) => x[0] - y[0])) {
      const last = out[out.length - 1];
      if (last && a <= last[1] + slack) last[1] = Math.max(last[1], b);
      else out.push([a, b]);
    }
    return out;
  }

  // Read rows into the collector. Returns true if anything new was read.
  function harvestRows(L, col, scroller, els = L.rows(), recordSpan = true) {
    let changed = false;
    const sTop = scroller?.isConnected ? scroller.getBoundingClientRect().top : null;
    const found = els.map((el) => [L.index(el), el]).filter(([i]) => !isNaN(i)).sort((a, b) => a[0] - b[0]);
    let run = null;
    const endRun = () => {
      if (run && recordSpan) col.spans.push(run);
      run = null;
    };
    for (const [i, el] of found) {
      const row = L.read(el);
      if (!row.text) {
        endRun(); // a row still loading breaks the run
        continue;
      }
      run = run ? [run[0], i] : [i, i];
      const prev = col.rows.get(i);
      if (el.isConnected && sTop != null) row.top = el.getBoundingClientRect().top - sTop + scroller.scrollTop;
      else if (prev) row.top = prev.top;
      if (prev && prev.text === row.text && prev.speaker === row.speaker && prev.timeText === row.timeText) {
        prev.top = row.top;
        continue;
      }
      col.rows.set(i, row); // re-reading keeps the latest (fully spoken / corrected) text
      changed = true;
    }
    endRun();
    if (col.spans.length > 300) col.spans = mergeSpans(L, col.spans);
    return changed;
  }

  // Possible gaps as [last row before, first row after]; null = start / end of transcript.
  function findHoles(L, col) {
    col.spans = mergeSpans(L, col.spans);
    const holes = [];
    for (let k = 0; k + 1 < col.spans.length; k++) holes.push([col.spans[k][1], col.spans[k + 1][0]]);
    if (L.contiguous && col.rows.size) {
      const keys = [...col.rows.keys()];
      const min = Math.min(...keys);
      const max = Math.max(...keys);
      const expected = expectedRowCount();
      if (min > L.base) holes.unshift([null, min]);
      if (expected && max < expected - 1 + L.base) holes.push([max, null]);
    }
    return holes;
  }

  // Scroll through the pane reading every row.
  //   'full': from the newest paragraph up to the very first one, then fix gaps.
  //   'fill': only re-read the gaps (after jumping to the newest paragraph).
  async function sweep(L, col, onProgress, mode = 'full') {
    let scroller = findScroller(L);
    if (!scroller) throw new Error('Transcript panel not found. Open the Transcript pane first.');
    const harvest = () => {
      harvestRows(L, col, scroller);
      onProgress?.(col.rows.size, expectedRowCount());
    };
    const scrollTo = async (top) => {
      if (!scroller.isConnected) scroller = findScroller(L) || scroller;
      scroller.scrollTop = top;
      // Chrome only fires scroll events while it's drawing the page; a minimized or
      // covered window would otherwise leave the list showing stale rows.
      scroller.dispatchEvent(new Event('scroll'));
      await settle(scroller);
      harvest();
    };
    const firstIndex = () => {
      let m = Infinity;
      for (const k of col.rows.keys()) if (k < m) m = k;
      return m;
    };

    const startTop = scroller.scrollTop;
    const wasAtBottom = startTop + scroller.clientHeight >= scroller.scrollHeight - 5;
    await scrollTo(scroller.scrollHeight);

    if (mode === 'full') {
      // Walk up to the first paragraph. The pane loads older paragraphs as it nears
      // the top, so only stop once nothing more appears for a couple of seconds.
      for (let guard = 0, idle = 0; guard < 20000 && idle < 4; guard++) {
        const before = { top: scroller.scrollTop, height: scroller.scrollHeight, first: firstIndex() };
        await scrollTo(Math.max(0, before.top - scroller.clientHeight * 0.6));
        if (scroller.scrollTop < before.top - 1 || scroller.scrollHeight !== before.height || firstIndex() !== before.first) idle = 0;
        else {
          idle++;
          await sleep(500);
        }
      }
    }

    // Re-read gaps top-down in smaller steps, starting just above the first gap.
    for (let attempt = 0; attempt < 2; attempt++) {
      const holes = findHoles(L, col);
      if (!holes.length) break;
      const anchor = holes[0][0] == null || attempt ? null : col.rows.get(holes[0][0])?.top;
      await scrollTo(anchor == null ? 0 : Math.max(0, anchor - scroller.clientHeight));
      for (let guard = 0, idle = 0; guard < 20000 && idle < 3; guard++) {
        const before = scroller.scrollTop;
        await scrollTo(before + scroller.clientHeight * (attempt ? 0.25 : 0.45));
        if (scroller.scrollTop <= before + 1) {
          idle++; // bottom reached; wait a little in case more rows load
          await sleep(400);
        } else {
          idle = 0;
        }
      }
    }

    // Back to where you were, or to the newest paragraph if you were following along.
    await scrollTo(wasAtBottom ? scroller.scrollHeight : startTop);
    return findHoles(L, col);
  }

  const GAP_TEXT = '[… some paragraphs here could not be read …]';

  // Rows (by position) -> entries. A row without its own name/time header
  // continues the paragraph block of the speaker above it.
  function rowsToEntries(col, holes = []) {
    const gapAfter = new Set(holes.map(([a]) => a));
    const gap = { speaker: '', clock: '', header: false, text: GAP_TEXT };
    const out = gapAfter.has(null) ? [gap] : [];
    let speaker = '';
    for (const i of [...col.rows.keys()].sort((a, b) => a - b)) {
      const r = col.rows.get(i);
      if (r.speaker) speaker = r.speaker;
      out.push({ speaker, clock: r.timeText || '', header: !!(r.speaker || r.timeText), text: r.text });
      if (gapAfter.has(i)) out.push(gap);
    }
    return out;
  }

  function gapWarning(holes) {
    if (!holes.length) return [];
    return [`${holes.length} place(s) in this transcript may be missing paragraphs. Each is marked "${GAP_TEXT}" below.`];
  }

  // ---------------------------------------------------------------- 1. live Transcript pane recorder

  const pane = {
    layout: null,
    col: newCollector(),
    meetingId: '',
    session: null,
    scroller: null,
    observer: null,
    sweeping: null, // promise while a sweep runs
    caughtUp: false,
    failures: 0,
    dirty: false,
    note: '',
  };

  // Is the pane now showing a different meeting? (Teams doesn't always reload.)
  function looksLikeNewMeeting(L) {
    const rows = L.rows();
    if (L.meetingId) {
      const id = rows.length ? L.meetingId(rows[0]) : '';
      return !!(id && pane.meetingId && id !== pane.meetingId);
    }
    // Numbered layouts: same position, different speaker AND time.
    for (const el of rows) {
      const prev = pane.col.rows.get(L.index(el));
      if (!prev?.speaker || !prev.timeText) continue;
      const row = L.read(el);
      if (row.speaker && row.timeText && row.speaker !== prev.speaker && row.timeText !== prev.timeText) return true;
    }
    return false;
  }

  // One backup per meeting: if this meeting already has one (you reloaded the page
  // or the extension, rejoined, or reopened the pane), carry on with it and keep
  // the paragraphs it already has, rather than starting a second entry.
  async function startPaneSession(meetingId) {
    const session = newSession('transcript');
    session.meetingId = meetingId || '';
    pane.session = session;
    pane.meetingId = session.meetingId;
    pane.col = newCollector();
    pane.caughtUp = false;
    pane.failures = 0;
    if (!meetingId) return;
    session.resuming = true; // don't write a new entry until we know
    try {
      const all = await chrome.storage.local.get(null);
      const prev = Object.values(all)
        .filter((s) => s?.kind === 'transcript' && s.meetingId === meetingId && Array.isArray(s.rows))
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
      if (prev && pane.session === session) {
        Object.assign(session, { id: prev.id, startedAt: prev.startedAt, date: prev.date });
        for (const [i, r] of prev.rows) if (!pane.col.rows.has(i)) pane.col.rows.set(i, r);
        pane.col.spans.push(...(prev.spans || []));
        pane.dirty = true;
      }
    } catch {}
    session.resuming = false;
  }

  function onPaneMutations(records) {
    const L = pane.layout;
    if (!L) return;
    // Rows Teams removed while scrolling get read one last time.
    const removed = [];
    for (const r of records) {
      for (const node of r.removedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches(L.rowSelector)) removed.push(node);
        else removed.push(...node.querySelectorAll(L.rowSelector));
      }
    }
    if (removed.length && harvestRows(L, pane.col, pane.scroller, removed, false)) pane.dirty = true;
    if (harvestRows(L, pane.col, pane.scroller)) pane.dirty = true;
    updateBadge();
  }

  function catchUp(reason, mode = 'full') {
    if (pane.sweeping) return pane.sweeping;
    pane.note = reason;
    updateBadge();
    pane.sweeping = sweep(pane.layout, pane.col, () => updateBadge(), mode)
      .then((holes) => {
        if (mode === 'full') pane.caughtUp = true;
        pane.dirty = true;
        return holes;
      })
      .catch((err) => {
        pane.failures++;
        throw err;
      })
      .finally(() => {
        pane.sweeping = null;
        pane.note = '';
        updateBadge();
        persistPane();
      });
    return pane.sweeping;
  }

  function paneTick() {
    const L = detectLayout();
    if (!L) {
      updateBadge();
      return;
    }
    const meetingId = L.meetingId ? L.meetingId(L.rows()[0]) : '';
    if (pane.session && !pane.sweeping && looksLikeNewMeeting(L)) {
      persistPane();
      startPaneSession(meetingId);
    }
    if (!pane.session) startPaneSession(meetingId);
    pane.layout = L;
    const scroller = findScroller(L);
    if (scroller && scroller !== pane.scroller) {
      pane.observer?.disconnect();
      pane.scroller = scroller;
      pane.observer = new MutationObserver(onPaneMutations);
      pane.observer.observe(scroller, { childList: true, subtree: true, characterData: true });
    }
    if (harvestRows(L, pane.col, pane.scroller)) pane.dirty = true;
    if (!pane.caughtUp && !pane.sweeping && pane.scroller && pane.failures < 3) {
      catchUp('catching up on earlier lines…').catch(() => {});
    }
    updateBadge();
  }

  async function persistPane() {
    if (!pane.dirty || !pane.session || pane.session.resuming || !pane.col.rows.size || !pane.layout) return;
    pane.dirty = false;
    const { resuming, ...session } = pane.session;
    try {
      await storeSession(pane.session, rowsToEntries(pane.col, findHoles(pane.layout, pane.col)), {
        ...session,
        // Numbered paragraphs, so a later recording of this meeting can merge in.
        rows: [...pane.col.rows].map(([i, r]) => [i, { speaker: r.speaker, timeText: r.timeText, text: r.text }]),
        spans: mergeSpans(pane.layout, pane.col.spans),
      });
    } catch {
      pane.dirty = true;
    }
  }

  function paneActive() {
    return !!(pane.session && pane.scroller?.isConnected && pane.col.rows.size);
  }

  async function savePane({ meeting } = {}) {
    if (!pane.session || !pane.layout) throw new Error('The Transcript pane is not open.');
    if (pane.sweeping) await pane.sweeping.catch(() => {});
    const L = pane.layout;
    const s = pane.scroller;
    if (s?.isConnected) {
      const atBottom = s.scrollTop + s.clientHeight >= s.scrollHeight - 5;
      // Not caught up yet: read everything. Otherwise only fill gaps, e.g. lines
      // that arrived while you were scrolled up.
      if (!pane.caughtUp) await catchUp('reading the whole transcript…', 'full');
      else if (findHoles(L, pane.col).length || !atBottom) await catchUp('checking for missed lines…', 'fill');
    }
    const holes = findHoles(L, pane.col);
    pane.dirty = true;
    await persistPane();
    const entries = rowsToEntries(pane.col, holes);
    if (!entries.length) throw new Error('The transcript is empty.');
    const info = { ...pane.session, ...fromMeeting(meeting), time: P.liveStartTime(entries, pane.session.startedAt) };
    const warnings = gapWarning(holes);
    const text = P.formatTranscript(entries, {
      title: info.title,
      date: info.date,
      source: `live Transcript pane (${L.name})`,
      warnings,
      grouped: true,
    });
    const filename = fileName(info, 'transcript');
    const res = await download(text, filename);
    if (!res?.ok) throw new Error(res?.error || 'Download failed.');
    return { ok: true, count: pane.col.rows.size, filename: res.savedAs || filename, warnings };
  }

  // ---------------------------------------------------------------- 2. live captions recorder

  const live = {
    session: null,
    entries: [], // { speaker, text, firstSeen, ref: WeakRef<Element> }
    byEl: new WeakMap(), // caption element -> entry index
    container: null,
    observer: null,
    dirty: false,
  };

  function findCaptionContainer() {
    for (const s of C.containers) {
      const el = document.querySelector(s);
      if (el) return el;
    }
    const text = document.querySelector(C.text);
    return text ? text.closest('[data-tid*="caption"]') || text.parentElement?.parentElement : null;
  }

  function captionItems(container) {
    const items = [...container.querySelectorAll(C.item)].filter((el) => el.querySelector(C.text));
    if (items.length) return items;
    return [...container.querySelectorAll(C.text)].map((t) => t.closest(C.item) || t.parentElement);
  }

  // Is this new caption element really an existing line that Teams re-created?
  // Lines whose element was removed in the same update may have grown meanwhile,
  // so a prefix match is enough; otherwise only identical text counts (a new line
  // that merely starts with the same words as an old one is a different line).
  function matchRecentEntry(speaker, text, removedNow) {
    for (let i = live.entries.length - 1; i >= Math.max(0, live.entries.length - 8); i--) {
      const e = live.entries[i];
      if (e.ref?.deref()?.isConnected) continue;
      if (speaker && e.speaker && speaker !== e.speaker) continue;
      if (text === e.text) return i;
      if (removedNow?.has(i) && (text.startsWith(e.text) || e.text.startsWith(text))) return i;
    }
    return undefined;
  }

  function recordCaption(item, now, removedNow) {
    const text = P.cleanText((item.querySelector(C.text) || item).textContent);
    if (!text) return;
    let speaker = P.cleanText(item.querySelector(C.speaker)?.textContent);
    let idx = live.byEl.get(item);
    if (idx === undefined) {
      idx = item.isConnected ? matchRecentEntry(speaker, text, removedNow) : undefined;
      if (idx === undefined) {
        if (!live.session) live.session = newSession('captions');
        speaker = speaker || live.entries[live.entries.length - 1]?.speaker || '';
        live.entries.push({ speaker, text, firstSeen: now, ref: null });
        idx = live.entries.length - 1;
      }
      live.byEl.set(item, idx);
      live.entries[idx].ref = new WeakRef(item);
      live.dirty = true;
    }
    const e = live.entries[idx];
    if (e.text !== text || (speaker && e.speaker !== speaker)) {
      e.text = text; // captions get corrected while someone is still talking
      if (speaker) e.speaker = speaker;
      live.dirty = true;
    }
  }

  function processCaptions(removedNow) {
    const c = live.container;
    if (!c?.isConnected) return;
    const now = Date.now();
    for (const item of captionItems(c)) recordCaption(item, now, removedNow);
  }

  // Runs synchronously on every change (not on a timer), so background-tab timer
  // throttling can't make us miss a line. Removed captions are read one last time,
  // in case their final words and their removal happened in the same update.
  function onCaptionMutations(records) {
    const now = Date.now();
    const removedNow = new Set();
    for (const r of records) {
      for (const node of r.removedNodes) {
        if (node.nodeType !== 1) continue;
        const items = node.matches(C.item) ? [node] : [...node.querySelectorAll(C.item)];
        for (const item of items) {
          if (!live.byEl.has(item)) continue;
          recordCaption(item, now);
          removedNow.add(live.byEl.get(item));
        }
      }
    }
    processCaptions(removedNow);
    updateBadge();
  }

  function captionEntries() {
    return live.entries.map((e) => ({ speaker: e.speaker, text: e.text, clock: clockOf(e.firstSeen) }));
  }

  async function persistCaptions() {
    if (!live.dirty || !live.session || !live.entries.length) return;
    live.dirty = false;
    try {
      await storeSession(live.session, captionEntries());
    } catch {
      live.dirty = true; // try again next tick
    }
  }

  function captionsTick() {
    const container = findCaptionContainer();
    if (container !== live.container) {
      live.observer?.disconnect();
      live.container = container;
      live.observer = null;
      if (container) {
        live.observer = new MutationObserver(onCaptionMutations);
        live.observer.observe(container, { childList: true, subtree: true, characterData: true });
      }
    }
    if (container) processCaptions();
  }

  function captionsActive() {
    return !!(live.session && live.container?.isConnected);
  }

  async function saveCaptions({ meeting } = {}) {
    processCaptions();
    live.dirty = true;
    await persistCaptions();
    if (!live.entries.length) throw new Error('No captions recorded yet.');
    const info = { ...live.session, ...fromMeeting(meeting), time: P.liveStartTime(captionEntries(), live.session.startedAt) };
    const text = P.formatTranscript(captionEntries(), {
      title: info.title,
      date: info.date,
      source: `live captions recorded from ${clockOf(live.session.startedAt)}`,
    });
    const filename = fileName(info, 'live captions');
    const res = await download(text, filename);
    if (!res?.ok) throw new Error(res?.error || 'Download failed.');
    return { ok: true, count: live.entries.length, filename: res.savedAs || filename };
  }

  // ---------------------------------------------------------------- on-page recording badge

  const badge = { host: null, label: null, button: null, busy: false };

  function buildBadge() {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:2147483647;';
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      .pill{display:flex;align-items:center;gap:8px;padding:6px 8px 6px 12px;border-radius:999px;
        background:rgba(32,31,31,.92);color:#fff;font:12px/1.3 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        box-shadow:0 2px 10px rgba(0,0,0,.35)}
      .dot{width:8px;height:8px;border-radius:50%;background:#e5484d;animation:p 1.4s infinite}
      @keyframes p{50%{opacity:.3}}
      button{font:inherit;font-weight:600;border:0;border-radius:999px;padding:4px 10px;background:#7f85f5;color:#111;cursor:pointer}
      button:disabled{opacity:.6;cursor:default}`;
    const pill = document.createElement('div');
    pill.className = 'pill';
    const dot = document.createElement('span');
    dot.className = 'dot';
    badge.label = document.createElement('span');
    badge.button = document.createElement('button');
    badge.button.textContent = 'Save .txt';
    badge.button.addEventListener('click', onBadgeSave);
    pill.append(dot, badge.label, badge.button);
    root.append(style, pill);
    document.documentElement.append(host);
    badge.host = host;
  }

  function updateBadge() {
    const showPane = paneActive();
    const showCaptions = !showPane && captionsActive();
    if (!showPane && !showCaptions) {
      badge.host?.remove();
      badge.host = null;
      return;
    }
    if (!badge.host?.isConnected) buildBadge();
    if (badge.busy) return;
    badge.label.textContent = showPane
      ? `Recording transcript · ${pane.col.rows.size} paragraphs${pane.note ? ` · ${pane.note}` : ''}`
      : `Recording captions · ${live.entries.length} lines`;
    badge.button.disabled = !!pane.sweeping;
  }

  async function onBadgeSave() {
    badge.busy = true;
    badge.button.disabled = true;
    badge.label.textContent = 'Saving…';
    try {
      const res = paneActive() ? await savePane() : await saveCaptions();
      badge.label.textContent = `${res.warnings?.length ? 'Saved with gaps (see file)' : 'Saved'}: ${res.filename}`;
    } catch (err) {
      badge.label.textContent = `Couldn't save: ${err?.message || err}`;
    }
    setTimeout(() => {
      badge.busy = false;
      updateBadge();
    }, 4000);
  }

  // ---------------------------------------------------------------- timers

  const tickTimer = setInterval(() => {
    if (superseded()) {
      clearInterval(tickTimer);
      clearInterval(persistTimer);
      pane.observer?.disconnect();
      live.observer?.disconnect();
      badge.host?.remove();
      return;
    }
    captionsTick();
    paneTick();
  }, 1500);
  const persistTimer = setInterval(() => {
    persistCaptions();
    persistPane();
  }, 4000);
  const flush = () => {
    persistCaptions();
    persistPane();
  };
  document.addEventListener('visibilitychange', flush);
  window.addEventListener('pagehide', flush);

  // ---------------------------------------------------------------- popup interface

  // The popup calls this (via chrome.scripting) to see what each frame can offer.
  globalThis.__ttsStatus = () => {
    return {
      top: window === window.top,
      meeting: window === window.top ? meetingInfo() : null,
      pane: pane.session ? { count: pane.col.rows.size, active: paneActive(), catchingUp: !!pane.sweeping, layout: pane.layout?.name } : null,
      captions: live.session || live.container ? { count: live.entries.length, active: !!live.container } : null,
    };
  };

  // Structure of the page with every piece of spoken text replaced by its length,
  // so selectors can be fixed without sharing what was said.
  globalThis.__ttsDiagnose = () => {
    const out = [`== Frame: ${location.origin}${location.pathname}`];
    const describe = (el) => {
      const bits = [el.tagName.toLowerCase()];
      if (el.id) bits.push(`#${el.id}`);
      for (const a of ['data-tid', 'role', 'aria-label', 'aria-posinset', 'aria-setsize', 'data-index', 'aria-live']) {
        const v = el.getAttribute(a);
        if (v != null) bits.push(`[${a}="${a === 'aria-label' ? v.slice(0, 40) : v}"]`);
      }
      const cls = [...el.classList].slice(0, 4).join('.');
      if (cls) bits.push(`.${cls}`);
      if (el.nodeType === 1 && isScrollable(el)) bits.push(`{scrollable ${el.clientHeight}/${el.scrollHeight}}`);
      return bits.join('');
    };
    const redact = (t) => {
      const s = P.cleanText(t);
      if (!s) return '';
      if (TIME_RE.test(s)) return '«time»';
      if (/^(transcript|live captions|go to current)$/i.test(s)) return `«${s}»`;
      return `«text:${s.length}»`;
    };
    const dump = (el, depth, budget) => {
      if (budget.n-- <= 0) return;
      const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => redact(n.textContent)).filter(Boolean).join(' ');
      out.push(`${'  '.repeat(depth)}${describe(el)}${own ? ' ' + own : ''}`);
      if (depth < 30) for (const c of [...el.children].slice(0, 10)) dump(c, depth + 1, budget);
    };
    const seen = new Set();
    const roots = [];
    const add = (el) => {
      if (el && !seen.has(el)) {
        seen.add(el);
        roots.push(el);
      }
    };
    document.querySelectorAll([...T.containers, ...T.regions, ...C.containers].join(',')).forEach(add);
    // The pane under a heading that reads "Transcript".
    for (const h of document.querySelectorAll('h1, h2, h3, h4, [role="heading"], span, div')) {
      if (h.childElementCount > 1 || P.cleanText(h.textContent).toLowerCase() !== 'transcript') continue;
      for (let p = h.parentElement, k = 0; p && k < 8; p = p.parentElement, k++) {
        const sc = [...p.querySelectorAll('*')].find((n) => n.clientHeight > 150 && isScrollable(n));
        if (sc) {
          out.push(`Transcript heading: ${describe(h)}; its pane: ${describe(p)}; scroll area: ${describe(sc)}`);
          add(sc);
          break;
        }
      }
    }
    // Every other large scrollable area (transcript, chat, ...).
    for (const el of document.querySelectorAll('div, section, ul, ol')) {
      if (roots.length > 10) break;
      if (el.clientHeight > 150 && isScrollable(el)) add(el);
    }
    out.push(`Roots found: ${roots.length}. Detected layout: ${detectLayout()?.name || 'none'}. Captions container: ${findCaptionContainer() ? 'yes' : 'no'}.`);
    for (const r of roots) {
      const path = [];
      for (let p = r.parentElement, k = 0; p && k < 4; p = p.parentElement, k++) path.unshift(describe(p));
      out.push('', `-- Root: ${path.join(' > ')}`);
      dump(r, 0, { n: 500 });
    }
    return out.join('\n');
  };

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    const handlers = { TTS_SAVE_PANE: savePane, TTS_SAVE_LIVE: saveCaptions };
    const handler = handlers[msg?.type];
    if (!handler) return false;
    handler(msg).then(sendResponse, (err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  });
})();
