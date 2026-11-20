// Run: node tests/parse.test.js
const assert = require('assert');
const P = require('../extension/src/parse.js');

// Formatting
const out = P.formatTranscript([{ speaker: 'A', start: 3725, text: 'hi' }, { speaker: '', clock: '14:03:12', text: 'yo' }], { title: 'Weekly sync', date: '2026-10-27', source: 'test', warnings: ['w'] });
assert.ok(out.startsWith('Weekly sync\nMeeting date: 2026-10-27\n'));
assert.ok(out.includes('WARNING: w'));
assert.ok(out.includes('[01:02:05] A: hi\n[14:03:12] yo\n'));
assert.equal(P.sanitizeFilename('a/b:c?  d.'), 'a b c d');
// Meeting names from browser tab titles, and the resulting file names
assert.equal(P.cleanMeetingTitle('(5) Teams and Channels | Meeting in "General" | Microsoft Teams'), 'Meeting in General');
assert.equal(P.cleanMeetingTitle('(12) Chat | Database module – Lecture 7 | Microsoft Teams'), 'Database module - Lecture 7');
assert.equal(P.transcriptFilename({ title: '(5) Teams and Channels | Meeting in "General" | Microsoft Teams', date: '2026-11-20' }, 'transcript'), "20th Nov '26 - Meeting in General - transcript.txt");
assert.equal(P.transcriptFilename({ title: 'Weekly sync: Q4 / budget?', date: '2026-11-22' }, 'live captions'), "22nd Nov '26 - Weekly sync Q4 budget - live captions.txt");
assert.equal(P.transcriptFilename({ title: '', date: '' }, 'transcript'), 'Teams meeting - transcript.txt');
// Grouped layout (live Transcript pane): one heading per speaker block
const g = P.formatTranscript([
  { speaker: '', clock: '', header: false, text: 'Jordan Lee started transcription' },
  { speaker: 'Alex Chen', clock: '10:23 AM', header: true, text: 'Let us start with the budget.' },
  { speaker: 'Alex Chen', clock: '', header: false, text: 'The sheet is in the chat.' },
  { speaker: 'Priya', clock: '10:25 AM', header: true, text: 'Okay.' },
], { title: 'T', grouped: true });
assert.ok(g.endsWith('Jordan Lee started transcription\n\nAlex Chen · 10:23 AM\nLet us start with the budget.\nThe sheet is in the chat.\n\nPriya · 10:25 AM\nOkay.\n'), g);
assert.ok(g.includes('Paragraphs: 4'));
for (const [iso, want] of [['2026-11-20', "20th Nov '26"], ['2026-01-01', "1st Jan '26"], ['2026-03-02', "2nd Mar '26"], ['2026-05-03', "3rd May '26"], ['2026-07-11', "11th Jul '26"], ['2026-08-12', "12th Aug '26"], ['2026-09-13', "13th Sep '26"], ['2026-10-21', "21st Oct '26"], ['2026-12-22', "22nd Dec '26"], ['2026-12-23', "23rd Dec '26"], ['2027-02-31', "31st Feb '27"]]) assert.equal(P.shortDate(iso), want);
// Start time in file names
for (const [v, want] of [['10:23 AM', '10.23am'], ['12:05 PM', '12.05pm'], ['12:40 AM', '12.40am'], ['3:07 p.m.', '3.07pm'], ['14:05', '2.05pm'], ['09:30:12', '9.30am'], ['0:03', '12.03am'], ['nope', ''], ['', '']]) assert.equal(P.shortTime(v), want, v);
assert.equal(P.shortTime(new Date(2026, 10, 20, 15, 4).getTime()), '3.04pm');
assert.equal(P.liveStartTime([{ text: 'x', clock: '' }, { text: 'y', clock: '10:23 AM' }], 0), '10.23am');
assert.equal(P.liveStartTime([{ text: 'x', clock: '' }], new Date(2026, 10, 20, 9, 5).getTime()), '9.05am');
assert.equal(P.transcriptFilename({ title: 'Meeting in General', date: '2026-11-20', time: '10.23am' }, 'transcript'), "20th Nov '26, 10.23am - Meeting in General - transcript.txt");
console.log('parse tests passed');
