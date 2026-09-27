let audio = null;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.target !== 'offscreen') return;
  audio?.pause();
  audio = null;
  if (msg.action === 'play') {
    audio = new Audio(chrome.runtime.getURL(`assets/sounds/${msg.sound}`));
    audio.play().catch((err) => console.warn('[Game Boy] sound failed:', err));
  }
});
