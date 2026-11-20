# Store listing: Microsoft Edge Add-ons (Partner Center)

Copy each section into the matching Partner Center field.

## Package

- **Upload:** `dist/live-transcript-for-microsoft-teams-1.3.0.zip` (build it with `bash tools/build-store-zip.sh`)
- **Display name** (taken from the package): Live Transcript for Microsoft Teams

## Availability

- **Visibility:** Public
- **Markets:** All markets

## Properties

- **Category:** Productivity
- **Privacy policy required:** Yes
- **Privacy policy URL:** https://eftic-islam.github.io/teams-live-transcript/privacy.html
- **Website URL:** https://eftic-islam.github.io/teams-live-transcript/
- **Support contact:** https://github.com/eftic-islam/teams-live-transcript/issues
- **Mature content:** No

## Store listing (English)

### Short description

Save a Microsoft Teams meeting's transcript as a text file while the meeting is live. Nothing is missed, and nothing leaves your computer.

### Description

Live Transcript for Microsoft Teams saves the transcript of a Teams meeting as a .txt file while the meeting is still going, so you don't have to wait for the recording or the recap.

How it works
• Join your meeting in the browser (teams.microsoft.com) and open the Transcript pane once transcription is on.
• A small "Recording transcript" badge appears. Every paragraph is recorded as it appears, including the one still being spoken.
• When the pane opens, the extension scrolls back once to pick up everything said before you joined or opened it.
• Scrolled up to re-read something? Lines that arrived meanwhile are filled in when you save.
• Click "Save .txt" on the badge or in the popup at any time.

Nothing missed, nothing silent
• If a paragraph can't be read, the file says so at the top and marks the exact spot.
• A backup is kept as you go, so the transcript survives the meeting ending, the tab closing or a reload. Saved meetings are listed in the popup.
• Rejoining or reloading adds to the same meeting's backup instead of starting over.

Tidy files
• Named by date, start time and meeting, e.g. "20th Nov '26, 10.23am - Weekly sync - transcript.txt".
• Laid out like the Transcript pane: speaker and time, then their paragraphs.

No transcription? It can record live captions instead.

Private by design
• Works only on teams.microsoft.com and teams.cloud.microsoft.
• Nothing is uploaded or shared. There is no account, server, analytics or tracking. Transcripts stay in your browser and your Downloads folder.

Please follow your organisation's rules about keeping meeting records and let participants know if you keep a copy.

This is an independent project and is not affiliated with or endorsed by Microsoft. Microsoft Teams is a trademark of Microsoft Corporation.

### Search terms (up to 7)

1. Teams transcript
2. meeting transcript
3. live transcript
4. Teams captions
5. meeting notes
6. save transcript
7. transcription

### Images

| Field | File | Size |
|---|---|---|
| Extension store logo (required) | `store/logo-300.png` | 300 × 300 |
| Small promotional tile | `store/promo-small-440x280.png` | 440 × 280 |
| Large promotional tile | `store/promo-large-1400x560.png` | 1400 × 560 |
| Screenshot 1 | `store/screenshot-1-recording.png` | 1280 × 800 |
| Screenshot 2 | `store/screenshot-2-saved-file.png` | 1280 × 800 |

The screenshots use made-up meeting content.

## Notes for certification

Paste this into "Notes for certification" so the tester knows how to see it working:

> The extension works on Microsoft Teams in the browser (teams.microsoft.com / teams.cloud.microsoft) during a meeting where transcription or live captions are turned on. It needs no account or sign-in of its own.
>
> To test: join any Teams meeting in Edge, start transcription (More → Record and transcribe → Start transcription), then open the Transcript pane (More → Record and transcribe → Show transcript). A "Recording transcript" badge appears at the bottom-left within a few seconds. Speak a few sentences, then click "Save .txt" on the badge. A file appears in Downloads/Teams Transcripts/. The extension's toolbar popup shows the same recording and a list of saved meetings.
>
> Without transcription, turn on live captions (More → Language and speech → Show live captions); the badge then says "Recording captions".
>
> The extension makes no network requests. Data stays in chrome.storage.local and in files the user saves. Permissions: host access to the two Teams domains (read the transcript/captions), storage (local backup), downloads (save the .txt), scripting (popup status and starting in an already-open Teams tab).

## Permission justifications

Use these if a form asks for a reason for each permission (the Chrome Web Store always does).

- **Host access, teams.microsoft.com and teams.cloud.microsoft:** read the meeting transcript or live captions that Teams displays, so they can be saved.
- **storage:** keep a local backup of each meeting's transcript so it isn't lost if the tab closes.
- **downloads:** save the transcript as a .txt file in the user's Downloads folder when they click Save.
- **scripting:** let the toolbar popup show what the Teams tab is recording, and start the extension in a Teams tab that was already open when it was installed or updated.
- **Single purpose:** save the transcript of a Microsoft Teams meeting as a text file.
- **Remote code:** none. All code ships in the package.
- **Data usage:** the transcript (website content) is read and stored locally only. Not sold, not transferred, not used for anything unrelated to the single purpose.
