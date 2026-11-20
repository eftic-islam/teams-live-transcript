// Pure helpers: format transcript entries as text and build file names.
// Entry shape: { speaker, text, clock? ("10:23 AM"), start? (seconds), header? }
(function (root) {
  function cleanText(s) {
    return String(s ?? '').replace(/\s+/g, ' ').trim();
  }

  function formatClock(sec) {
    const t = Math.max(0, Math.floor(sec));
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(Math.floor(t / 3600))}:${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)}`;
  }

  // meta: { title, date, source, warnings[], grouped }
  // grouped: lay it out like the Teams Transcript pane, one "Speaker · time" heading
  // per block of paragraphs, instead of one "[time] Speaker: text" line each.
  function formatTranscript(entries, meta = {}) {
    const lines = [];
    lines.push(meta.title || 'Teams meeting transcript');
    if (meta.date) lines.push(`Meeting date: ${meta.date}`);
    lines.push(`Saved: ${new Date().toLocaleString()}`);
    lines.push(`${meta.grouped ? 'Paragraphs' : 'Lines'}: ${entries.length}${meta.source ? ` (source: ${meta.source})` : ''}`);
    for (const w of meta.warnings || []) lines.push(`WARNING: ${w}`);
    lines.push('', '-'.repeat(60), '');
    let prevSpeaker = null;
    for (const e of entries) {
      const time = e.clock || (e.start != null ? formatClock(e.start) : '');
      if (meta.grouped) {
        if (e.header || e.speaker !== prevSpeaker) {
          if (prevSpeaker !== null) lines.push('');
          const heading = [e.speaker, time].filter(Boolean).join(' · ');
          if (heading) lines.push(heading);
          prevSpeaker = e.speaker;
        }
        lines.push(e.text);
      } else {
        const prefix = [time && `[${time}]`, e.speaker && `${e.speaker}:`].filter(Boolean).join(' ');
        lines.push(prefix ? `${prefix} ${e.text}` : e.text);
      }
    }
    return lines.join('\n') + '\n';
  }

  // Only letters, digits and a few safe punctuation marks: browsers quietly fall
  // back to "download.txt" when they dislike a character in a suggested name.
  function sanitizeFilename(name) {
    const clean = String(name || '')
      .normalize('NFC')
      .replace(/[^\p{L}\p{N} ._,()&'+-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[.\s-]+|[.\s-]+$/g, '')
      .slice(0, 120)
      .trim();
    return clean || 'Teams meeting';
  }

  // Browser tab titles look like `(5) Teams and Channels | Meeting in "General" | Microsoft Teams`;
  // keep just the meeting's own name: `Meeting in General`.
  const TEAMS_SECTIONS = /^(microsoft teams|teams and channels|teams|chat|calendar|activity|calls|files|apps|assignments|onedrive)$/i;
  function cleanMeetingTitle(title) {
    const parts = String(title || '')
      .replace(/^\s*\(\d+\)\s*/, '')
      .split(/\s+[|–]\s+/)
      .map(cleanText)
      .filter((p) => p && !TEAMS_SECTIONS.test(p));
    return cleanText(parts.join(' - ').replace(/["“”]/g, ''));
  }

  // "2026-11-20" -> "20th Nov '26"
  function shortDate(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return iso || '';
    const day = Number(m[3]);
    const suffix = day % 100 >= 11 && day % 100 <= 13 ? 'th' : { 1: 'st', 2: 'nd', 3: 'rd' }[day % 10] || 'th';
    const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m[2]) - 1];
    return `${day}${suffix} ${month} '${m[1].slice(2)}`;
  }

  // "10:23 AM", "14:05", "14:05:09" or a timestamp in ms -> "10.23am" / "2.05pm"
  // (no colon: macOS shows ":" in file names as "/").
  function shortTime(value) {
    let h;
    let m;
    if (typeof value === 'number') {
      const d = new Date(value);
      [h, m] = [d.getHours(), d.getMinutes()];
    } else {
      const t = String(value || '').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(?:([AaPp])\.?\s?[Mm]\.?)?$/);
      if (!t) return '';
      [h, m] = [Number(t[1]), Number(t[2])];
      if (t[3]) h = (h % 12) + (/p/i.test(t[3]) ? 12 : 0);
    }
    return `${h % 12 || 12}.${String(m).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`;
  }

  // When a live recording's meeting started: the first paragraph's time shown by
  // Teams, else when recording began.
  function liveStartTime(entries, fallbackMs) {
    for (const e of entries || []) {
      const t = shortTime(e.clock);
      if (t) return t;
    }
    return fallbackMs ? shortTime(fallbackMs) : '';
  }

  // "20th Nov '26, 10.23am - Meeting in General - transcript.txt"
  function transcriptFilename(meeting, suffix) {
    const when = [shortDate(meeting?.date), meeting?.time].filter(Boolean).join(', ');
    const parts = [when, cleanMeetingTitle(meeting?.title) || 'Teams meeting', suffix].filter(Boolean);
    return `${sanitizeFilename(parts.join(' - '))}.txt`;
  }

  const api = { formatClock, formatTranscript, sanitizeFilename, cleanMeetingTitle, shortDate, shortTime, liveStartTime, transcriptFilename, cleanText };
  root.TTSParse = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
