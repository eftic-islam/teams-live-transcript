// Saves transcript text to Downloads/Teams Transcripts/ as a .txt file.

const FOLDER = 'Teams Transcripts';
const pendingNames = new Map(); // data URL -> "Teams Transcripts/<name>.txt"

// Another installed extension (download managers often do this) can rename every
// download, which turned transcripts into "download.txt". Claim the name of our
// own downloads when the browser asks; other downloads are left alone.
chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  if (item.byExtensionId !== chrome.runtime.id) return;
  const name = pendingNames.get(item.url) || pendingNames.get(item.finalUrl);
  if (!name) return;
  pendingNames.delete(item.url);
  pendingNames.delete(item.finalUrl);
  suggest({ filename: name, conflictAction: 'uniquify' });
});

// The file name the browser actually used, once it has picked one.
async function savedName(id) {
  for (let i = 0; i < 25; i++) {
    const [item] = await chrome.downloads.search({ id });
    if (item?.filename) return item.filename.split(/[\\/]/).slice(-2).join('/');
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'TTS_DOWNLOAD') return false;
  const url = 'data:text/plain;charset=utf-8,' + encodeURIComponent(msg.text);
  const filename = `${FOLDER}/${msg.filename}`;
  pendingNames.set(url, filename);
  chrome.downloads
    .download({ url, filename, conflictAction: 'uniquify', saveAs: false })
    .then(async (id) => sendResponse({ ok: true, id, savedAs: await savedName(id) }))
    .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }))
    .finally(() => setTimeout(() => pendingNames.delete(url), 60000));
  return true;
});
