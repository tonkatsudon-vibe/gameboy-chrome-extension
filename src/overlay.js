// GameBoy Plugin by Tonkatsudon (https://github.com/tonkatsudon-vibe/gameboy-chrome-extension)
// MIT License, see LICENSE. Keep this notice in copies and forks.

// Runs on every page (and is injected on toolbar click into tabs that predate
// the extension). While the Game Boy is switched on, it floats as a draggable,
// resizable iframe (popup.html) over whichever tab is visible. Navigating or
// switching tabs rebuilds it here from saved state, skipping the boot.
(() => {
  // Guard against running twice: the manifest content script plus executeScript.
  if (window.__gameboyOverlay) return;
  window.__gameboyOverlay = true;

  const ID = 'gameboy-extension-overlay';
  // Skin aspect ratio (1076×1845). popup.html zooms its 300px layout to fit.
  const ASPECT = 1845 / 1076;
  const MIN_WIDTH = 100;
  const MAX_WIDTH = 900;
  const MARGIN = 16;
  const EXT_ORIGIN = new URL(chrome.runtime.getURL('')).origin;
  const heightFor = (w) => Math.ceil(w * ASPECT);

  let frame = null;
  // `width` is what's shown; `wanted` is the user's chosen size, restored when
  // a window that was too small to fit it grows again. Kept unrounded so slow
  // drags still accumulate.
  let width = 300;
  let wanted = width;

  // Keep the whole shell on screen, even after the window shrinks.
  function moveTo(left, top) {
    const maxLeft = Math.max(0, window.innerWidth - Math.round(width));
    const maxTop = Math.max(0, window.innerHeight - heightFor(width));
    frame.style.left = `${Math.min(Math.max(0, left), maxLeft)}px`;
    frame.style.top = `${Math.min(Math.max(0, top), maxTop)}px`;
  }

  // Resizing keeps the top-left corner fixed; the shell never outgrows the window.
  function resizeTo(w) {
    const fit = Math.min(window.innerWidth, window.innerHeight / ASPECT);
    width = Math.min(Math.max(w, MIN_WIDTH), MAX_WIDTH, Math.max(fit, MIN_WIDTH));
    frame.style.width = `${Math.round(width)}px`;
    frame.style.height = `${heightFor(width)}px`;
    moveTo(frame.offsetLeft, frame.offsetTop);
  }

  const saveLayout = () => chrome.storage.local.set({
    width: Math.round(width),
    position: { left: frame.offsetLeft, top: frame.offsetTop },
  });

  function onMessage(e) {
    if (!frame || e.source !== frame.contentWindow || e.origin !== EXT_ORIGIN) return;
    const { type, dx, dy } = e.data ?? {};
    if (type === 'gameboy:drag') {
      moveTo(frame.offsetLeft + dx, frame.offsetTop + dy);
    } else if (type === 'gameboy:resize') {
      // Project the pointer's movement onto the shell's diagonal so the
      // aspect ratio holds whichever way the grip is dragged.
      resizeTo(width + (dx + dy / ASPECT) / 2);
      wanted = width;
    } else if (type === 'gameboy:dragend' || type === 'gameboy:resizeend') {
      saveLayout();
    } else if (type === 'gameboy:close') {
      chrome.storage.local.set({ overlayOpen: false });
    }
  }

  const onResize = () => frame && resizeTo(wanted);

  async function mount({ resume }) {
    if (frame) return;
    const saved = await chrome.storage.local.get({ position: null, width: null });
    if (frame) return; // mounted by another call while we were reading storage

    frame = document.createElement('iframe');
    frame.id = ID;
    frame.src = chrome.runtime.getURL(`src/popup.html${resume ? '?resume' : ''}`);
    frame.allow = 'autoplay';
    frame.setAttribute('allowtransparency', 'true');
    Object.assign(frame.style, {
      position: 'fixed',
      left: `${window.innerWidth - width - MARGIN}px`,
      top: `${MARGIN}px`,
      border: 'none',
      background: 'transparent',
      // Must match popup.html's color-scheme, or Chrome paints the frame opaque.
      colorScheme: 'light',
      zIndex: '2147483647',
      filter: 'drop-shadow(0 8px 24px rgba(0, 0, 0, 0.35))',
    });
    document.documentElement.append(frame);

    if (saved.width) wanted = saved.width;
    resizeTo(wanted);
    if (saved.position) moveTo(saved.position.left, saved.position.top);
  }

  function unmount() {
    if (!frame) return;
    frame.remove();
    frame = null;
    // Lift the web-mode framing rule for this tab; pagehide in the frame may not get it out in time.
    chrome.runtime.sendMessage({ type: 'gameboy:framing', on: false }).catch(() => {});
  }

  // Only the visible tab gets a live Game Boy, so there's one running at a
  // time: no duplicate sounds or pages playing in background tabs.
  async function sync() {
    const { overlayOpen } = await chrome.storage.local.get({ overlayOpen: false });
    if (overlayOpen && document.visibilityState === 'visible') mount({ resume: true });
    else unmount();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.overlayOpen) {
      // Switched on from the toolbar: this tab boots it; other tabs resume later.
      if (changes.overlayOpen.newValue && document.visibilityState === 'visible') mount({ resume: false });
      else if (!changes.overlayOpen.newValue) unmount();
    }
    // Follow moves/resizes made in another window's copy.
    if (frame && changes.width?.newValue) resizeTo((wanted = changes.width.newValue));
    if (frame && changes.position?.newValue) moveTo(changes.position.newValue.left, changes.position.newValue.top);
  });

  document.addEventListener('visibilitychange', sync);
  window.addEventListener('message', onMessage);
  window.addEventListener('resize', onResize);
  // Some pages rebuild <html>'s children (e.g. document.open); put the Game Boy back.
  new MutationObserver(() => {
    if (frame && !frame.isConnected) {
      frame = null;
      sync();
    }
  }).observe(document.documentElement, { childList: true });

  sync();
})();
