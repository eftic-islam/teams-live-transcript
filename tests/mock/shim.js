// Minimal stand-in for the chrome.* APIs so content.js can run on a plain test page.
(() => {
  const listeners = [];
  // Kept in sessionStorage so it survives reloads, like the real extension storage.
  const saved = (() => { try { return JSON.parse(sessionStorage.getItem('__ttsStore') || '{}'); } catch { return {}; } })();
  const store = saved;
  const flush = () => { try { sessionStorage.setItem('__ttsStore', JSON.stringify(store)); } catch {} };
  window.__downloads = [];
  window.__progress = [];
  window.chrome = {
    runtime: {
      id: "test-extension",
      sendMessage: async (msg) => {
        if (msg.type === 'TTS_DOWNLOAD') { window.__downloads.push(msg); return { ok: true, id: window.__downloads.length }; }
        if (msg.type === 'TTS_PROGRESS') window.__progress.push(msg);
      },
      onMessage: { addListener: (fn) => listeners.push(fn) },
    },
    storage: { local: {
      get: async () => JSON.parse(JSON.stringify(store)),
      set: async (o) => { Object.assign(store, JSON.parse(JSON.stringify(o))); flush(); },
      remove: async (keys) => { [].concat(keys).forEach((k) => delete store[k]); flush(); },
    } },
  };
  window.__store = store;
  window.__send = (msg) => new Promise((resolve) => { for (const fn of listeners) if (fn(msg, {}, resolve)) return; resolve(undefined); });
})();
