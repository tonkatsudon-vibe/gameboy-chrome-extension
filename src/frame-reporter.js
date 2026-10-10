// Runs in every frame but only acts inside the handheld's web-mode iframe:
// it tells the handheld the page's real address, which a cross-origin frame
// otherwise hides. That keeps the URL bar honest and lets the handheld reopen
// the same page after you navigate or switch tabs.
(() => {
  const EXT_ORIGIN = new URL(chrome.runtime.getURL('')).origin;
  if (window === window.top || location.ancestorOrigins?.[0] !== EXT_ORIGIN) return;

  const report = () => window.parent.postMessage({ type: 'gameboy:page-location', href: location.href }, EXT_ORIGIN);
  report();
  // Single-page apps change the address without a new document.
  globalThis.navigation?.addEventListener('navigatesuccess', report);
})();
