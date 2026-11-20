# Live Transcript for Microsoft Teams

A Chrome / Edge extension that records a Microsoft Teams meeting's **live transcript while the meeting is still running** and saves it as a `.txt` file.

- **Transcript pane (main feature).** When transcription is on and the Transcript pane is open, the extension records every paragraph that appears. When the pane first opens, it also scrolls back once to catch everything said before you joined or opened it.
- **Live captions (alternative).** If transcription is off but live captions are on, it records the captions instead.

For a meeting that has already ended, download the transcript from the meeting's Recap in Teams.

Recordings are saved to the browser every few seconds, so nothing is lost if the meeting ends or the tab closes before you click Save.

Example output, laid out like the Teams Transcript pane:

```
Database module
Meeting date: 2026-11-20
Saved: 20/11/2026, 11:05:38
Paragraphs: 320 (source: live Transcript pane (Teams meeting transcript))

------------------------------------------------------------

Jordan Lee started transcription

Alex Chen · 10:23 AM
Let's start with the budget numbers.
I've shared the sheet in the chat.

Priya Shah · 10:25 AM
...
```

## Install (one time)

1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and choose the `extension` folder in this project.
4. Pin the extension (puzzle-piece icon → pin) so its button is always visible.

After you change any file in `extension/`, click the reload icon on the extension's card, then reload the Teams tab.

## Use it in a live meeting

**Join the meeting in the browser** at teams.microsoft.com (or teams.cloud.microsoft). A browser extension can't read the Teams desktop app. If Teams offers to open the app, choose "Continue on this browser".

1. Once someone has started transcription, open the Transcript pane. In Teams on the web it's under **More → Record and transcribe → Show transcript**; the exact menu can vary by Teams version.
2. A small **● Recording transcript · N paragraphs** badge appears at the bottom-left of the page. When it first appears it says "catching up on earlier lines…" while it scrolls through the pane once. Leave the pane alone for those few seconds.
3. Carry on with the meeting. You can scroll up in the pane to read. Anything that arrives while you're scrolled up gets filled in when you save.
4. Click **Save .txt** on the badge, or use the extension's popup, at any time. Saving checks for missed paragraphs first. If any couldn't be read, the file starts with a `WARNING:` line listing them, so a gap is never silent.
5. After the meeting, even if the tab closed, open the popup. Every recording is listed under **Recorded during meetings** with **Save** and **Delete** buttons. The 15 most recent are kept.

**Keep the Teams window open while recording.** It's fine in a separate window behind others. Teams may stop updating the pane in a minimized or long-hidden tab.

Files go to `Downloads/Teams Transcripts/`, named like `20th Nov '26, 10.23am - Meeting in General - transcript.txt` (date, meeting start time, meeting name).

If you record the same meeting again (after a reload or rejoining), it's added to that meeting's existing backup instead of starting a new one.

### Live captions instead
If the meeting has no transcription, turn on live captions (**More → Language and speech → Show live captions**). The badge then shows **Recording captions** and works the same way. Each caption line is stamped with the clock time it appeared.

## If it doesn't detect your Transcript pane

The pane's internal structure isn't documented by Microsoft. The extension knows the layout Teams used in November 2026, plus two fallbacks, and Microsoft may change it.

If you open the pane and no badge appears within a few seconds:

1. Click the extension → **Not detecting the transcript? Save a diagnostic file**.
2. Send me `Downloads/Teams Transcripts/teams-transcript-diagnostic.txt`.

The diagnostic contains only the page's structure: element names, ids and labels. Everything people said is replaced by `«text:N»` (its length), and times by `«time»`. All selectors live in [`extension/src/selectors.js`](extension/src/selectors.js), so a fix is usually a one-file change.

## Tests

```bash
node tests/parse.test.js
```

Mock Teams pages that load the real extension scripts, with a stand-in for the `chrome.*` APIs:

```bash
node tests/server.js
```

- http://localhost:8765/tests/mock/meeting.html?layout=teams copies the real in-meeting pane: rows numbered with gaps, names and times only on a speaker's first paragraph, and older paragraphs that load only when you scroll up. `?layout=known` and `?layout=generic` cover the other two layouts. All three simulate a live in-meeting Transcript pane. They start with 120 earlier paragraphs, then 200 more arrive live, with the newest one growing word by word and a stretch where the user is scrolled up. Use `speak()`, `userScrollsUp()` and `userGoesToCurrent()` from the console.
- http://localhost:8765/tests/mock/live.html simulates live captions (`runLive(400)`).

## Privacy

Everything stays on your computer. The extension sends nothing anywhere.

It asks for as little as it can: access to `teams.microsoft.com` and `teams.cloud.microsoft` only, plus permission to save files (`downloads`), keep recordings (`storage`), and start in a Teams tab that was already open when it was installed or reloaded (`scripting`). It reads what's already on your Teams page, keeps recordings in the browser's local extension storage, and writes `.txt` files to your Downloads folder. Check your institution's rules, and tell participants if you're keeping a copy of the transcript.

## Publishing to the Edge Add-ons store

- `bash tools/build-store-zip.sh` builds the upload, `dist/live-transcript-for-microsoft-teams-<version>.zip` (the `extension/` folder only).
- `bash tools/render-store-images.sh` re-renders the store images in `store/` from `store/src/` with headless Edge.
- [`store/listing.md`](store/listing.md) has the listing text, permission justifications and notes for the certification tester.
- The privacy policy and landing page live in `docs/` and are served by GitHub Pages:
  https://eftic-islam.github.io/teams-live-transcript/privacy.html

Bump `version` in `extension/manifest.json` before uploading an update.

## License

MIT, see [LICENSE](LICENSE).
