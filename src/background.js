// GameBoy Plugin by Tonkatsudon (https://github.com/tonkatsudon-vibe/gameboy-chrome-extension)
// MIT License, see LICENSE. Keep this notice in copies and forks.

chrome.runtime.onInstalled.addListener(() => {
  console.log('[GameBoy Plugin] installed');
});

// Clicking the toolbar icon switches the Game Boy on or off in every tab.
// overlay.js runs on each page and reacts to the stored flag.
chrome.action.onClicked.addListener(async (tab) => {
  try {
    // Tabs opened before the extension was (re)loaded don't have the content
    // script yet. Inject first so the flag change below finds it listening.
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['src/overlay.js'],
    });
  } catch (err) {
    // chrome://, the Web Store and other protected pages can't be scripted.
    console.warn('[GameBoy Plugin] cannot open on this page:', err.message);
  }
  const { overlayOpen } = await chrome.storage.local.get({ overlayOpen: false });
  await chrome.storage.local.set({ overlayOpen: !overlayOpen });
});

// Web mode embeds sites in the Game Boy screen, but most sites send
// X-Frame-Options / CSP frame-ancestors to refuse being framed. This session
// rule strips those headers for sub-frames, limited to the tabs that currently
// have web mode open. DNR can't target "frames inside our frame" directly, so
// other frames in those tabs are affected too while web mode is on.
const FRAMING_RULE_ID = 1;

function framingRule(tabIds) {
  return {
    id: FRAMING_RULE_ID,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      responseHeaders: [
        { header: 'x-frame-options', operation: 'remove' },
        { header: 'content-security-policy', operation: 'remove' },
      ],
    },
    condition: { resourceTypes: ['sub_frame'], tabIds },
  };
}

// Serialise updates so concurrent on/off messages can't clobber each other.
// The rule itself is the source of truth, so this survives worker restarts.
let framingQueue = Promise.resolve();

function setFraming(tabId, on) {
  framingQueue = framingQueue.then(async () => {
    const [rule] = await chrome.declarativeNetRequest.getSessionRules({ ruleIds: [FRAMING_RULE_ID] });
    const tabIds = new Set(rule?.condition.tabIds ?? []);
    if (on) tabIds.add(tabId);
    else tabIds.delete(tabId);
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [FRAMING_RULE_ID],
      addRules: tabIds.size ? [framingRule([...tabIds])] : [],
    });
  }).catch((err) => console.warn('[GameBoy Plugin] framing rule update failed:', err));
  return framingQueue;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== 'gameboy:framing' || sender.id !== chrome.runtime.id) return;
  const tabId = sender.tab?.id;
  if (tabId == null) return;
  setFraming(tabId, msg.on).then(() => sendResponse());
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => setFraming(tabId, false));

// Boot sounds play from an offscreen document: the Game Boy frame sits inside
// a web page, where Chrome often blocks sound until the page has been clicked.
const SOUNDS = new Set(['gameboy.mp3', 'gameboy-color.mp3']);
let offscreenReady = null;

async function ensureOffscreen() {
  const existing = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (existing.length) return;
  // Chrome closes idle audio documents after ~30s, so this can run again later.
  offscreenReady ??= chrome.offscreen.createDocument({
    url: 'src/offscreen.html',
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Play the Game Boy boot sound.',
  }).finally(() => { offscreenReady = null; });
  await offscreenReady;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== 'gameboy:sound' || sender.id !== chrome.runtime.id) return;
  if (msg.action === 'play' && !SOUNDS.has(msg.sound)) return;
  // Nothing to stop if the player isn't open; don't create one just for that.
  const ready = msg.action === 'stop' ? Promise.resolve() : ensureOffscreen();
  ready
    .then(() => {
      if (msg.action === 'prepare') return;
      return sendToOffscreen(msg.action, msg.sound);
    })
    .catch((err) => console.warn('[GameBoy Plugin] sound failed:', err))
    .finally(() => sendResponse());
  return true;
});

// Fails quietly when no offscreen document is open (nothing is listening).
const sendToOffscreen = (action, sound) =>
  chrome.runtime.sendMessage({ target: 'offscreen', action, sound }).catch(() => {});

// Switching the Game Boy off (toolbar or ×) cuts a boot sound that's still playing.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.overlayOpen?.newValue === false) sendToOffscreen('stop');
});
