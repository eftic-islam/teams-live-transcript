// Deterministic fake transcript shared by the mock pages.
globalThis.makeTranscript = (n) => {
  const people = ['Alex Chen', 'Priya Shah', 'Sam Okafor'];
  const words = 'budget roadmap launch metrics customer design review timeline risk owner update next quarter team plan'.split(' ');
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const out = [];
  let t = 2, speaker = people[0];
  for (let i = 0; i < n; i++) {
    if (rnd() < 0.4) speaker = people[Math.floor(rnd() * 3)];
    const len = 3 + Math.floor(rnd() * 25);
    const text = Array.from({ length: len }, () => words[Math.floor(rnd() * words.length)]).join(' ') + ` (#${i}).`;
    out.push({ id: `e${i}`, speaker, start: t, text });
    t += 2 + rnd() * 8;
  }
  return out;
};
globalThis.hms = (s) => { s = Math.floor(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2,'0')}:${String(x).padStart(2,'0')}` : `${m}:${String(x).padStart(2,'0')}`; };
if (typeof module !== 'undefined') module.exports = { makeTranscript: globalThis.makeTranscript };
