// GameBoy Plugin by Tonkatsudon (https://github.com/tonkatsudon-vibe/gameboy-chrome-extension)
// MIT License, see LICENSE. Keep this notice in copies and forks.

let audio = null;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.target !== 'offscreen') return;
  audio?.pause();
  audio = null;
  if (msg.action === 'play') {
    audio = new Audio(chrome.runtime.getURL(`assets/sounds/${msg.sound}`));
    audio.play().catch((err) => console.warn('[GameBoy Plugin] sound failed:', err));
  }
});
