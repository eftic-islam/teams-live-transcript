// Every Teams/Stream page selector the extension relies on lives here, so when
// Microsoft changes its markup this is the only file that needs updating.
globalThis.TTS_SELECTORS = {
  // In-meeting Transcript pane (new Teams, seen 2026-11 on teams.cloud.microsoft).
  // Rows: data-tid="transcript-chat-message-<meeting id>/<number>"; the number grows
  // with each paragraph but skips values. Name and time are only filled in on the
  // first paragraph of each speaker block.
  liveTranscript: {
    row: '[data-tid^="transcript-chat-message-"]',
    rowIdPattern: /^transcript-chat-message-(.*)\/(\d+)$/,
    speaker: '[data-tid="transcript-item-author"]',
    timestamp: '[class*="ChatMessageCompact__timestamp"]',
    text: '[data-tid="call-transcript-panel-message"]',
    scroller: '[data-tid="call-transcript-panel-viewport"]',
  },

  // Transcript panel (Recap tab, Stream recording page).
  transcript: {
    containers: ['#scrollToTargetTargetedFocusZone', '#OneTranscript'],
    item: '[id^="listItem-"]',
    itemIdPattern: /^listItem-(\d+)$/,
    speaker: '[class*="itemDisplayName"]',
    timestamp: '[id^="Header-timestamp-"]',
    text: '[id^="sub-entry-"]',
    // Fallback layout: numbered rows inside anything labelled as a transcript.
    regions: ['[aria-label*="transcript" i]', '[data-tid*="transcript" i]', '[id*="transcript" i]'],
    rowIndexAttrs: ['aria-posinset', 'data-index', 'data-item-index', 'data-list-index'],
  },

  // Live captions shown during a meeting.
  captions: {
    containers: [
      "[data-tid='closed-caption-renderer-wrapper']",
      "[data-tid='closed-captions-renderer']",
      "[data-tid='closed-caption-v2-window-wrapper']",
    ],
    item: '.fui-ChatMessageCompact',
    text: '[data-tid="closed-caption-text"]',
    speaker: '[data-tid="author"]',
  },

  // Meeting name/date shown in the Teams header (top frame).
  meeting: {
    title: ['[data-tid="entity-header"] span[dir="auto"]', 'h2[data-tid="chat-title"] span'],
    date: ['[data-tid="intelligent-recap-header"] span[dir="auto"]'],
  },
};
