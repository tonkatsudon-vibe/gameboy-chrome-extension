// GameBoy Plugin by Tonkatsudon (https://github.com/tonkatsudon-vibe/gameboy-chrome-extension)
// MIT License, see LICENSE. Keep this notice in copies and forks.

const KEYMAP = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  z: 'b', x: 'a', Enter: 'start', Shift: 'select',
};

// Libretro joypad indices, which EmulatorJS's simulateInput takes.
const BUTTON_INDEX = { b: 0, select: 2, start: 3, up: 4, down: 5, left: 6, right: 7, a: 8 };

const SKINS = ['gray', 'blue', 'red', 'orange', 'yellow', 'lightgreen', 'pink'];

// soundAt lines the sound up with the animation: the classic "ding" lands as
// the Nintendo logo stops scrolling (3.42s in the GIF, sound has 0.2s lead-in).
// length is the GIF's single-loop duration; after it the game screen takes over.
const BOOTS = {
  classic: { label: 'Classic', gif: 'gameboy.gif', sound: 'gameboy.mp3', soundAt: 3220, length: 4500 },
  color: { label: 'Color', gif: 'gameboy-adv.gif', sound: 'gameboy-color.mp3', soundAt: 1350, length: 5300 },
};

// igu=1 is Google's embeddable variant of its homepage and search.
const HOME = 'https://www.google.com/webhp?igu=1';
const searchUrl = (q) => `https://www.google.com/search?igu=1&q=${encodeURIComponent(q)}`;

const skinImg = document.getElementById('skin');
const bootImg = document.getElementById('boot');
const bootModeBtn = document.getElementById('boot-mode');
const emu = document.getElementById('emu');
const noGame = document.getElementById('no-game');
const gamePick = document.getElementById('game-pick');
const web = document.getElementById('web');
const page = document.getElementById('page');
const urlInput = document.getElementById('url');
const webBackBtn = document.getElementById('web-back');
const modeBtn = document.getElementById('mode');

const prefs = { skin: 'gray', boot: 'color', mode: 'game', url: HOME, game: null };
const state = { booting: false };
let bootTimers = [];
let localSound = null;

const asset = (path) => `../assets/${path}`;

// chrome.storage is missing when popup.html is opened directly as a file.
const storage = globalThis.chrome?.storage?.local;
const loadPrefs = () => (storage ? storage.get(prefs) : Promise.resolve(prefs));
const savePrefs = () => storage?.set(prefs);

// The Game Boy is rebuilt on every page and tab, so the running game is
// snapshotted into session storage (lives until the browser closes) and picked
// up on the next page. Battery saves, what the game writes when you save in
// it, go to local storage and last for good. Both are keyed by ROM file.
const session = globalThis.chrome?.storage?.session;
const resumeKey = (game) => `resume:${game}`;
const saveKey = (game) => `save:${game}`;

// chrome.storage holds JSON, so bytes travel as base64.
function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const fromBase64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;

// overlay.js adds ?resume when rebuilding after a page change or tab switch.
const RESUME = new URLSearchParams(location.search).has('resume');

/* ---------- Cartridges ---------- */

// roms/roms.json lists the games; roms/ is gitignored, so a fresh clone has none.
let games = []; // [{ file, name, default }]

async function loadGames() {
  if (!globalThis.chrome?.runtime?.id) return;
  try {
    const res = await fetch(chrome.runtime.getURL('roms/roms.json'));
    if (res.ok) games = await res.json();
  } catch {}
}

function renderGamePicker() {
  gamePick.textContent = '';
  for (const g of games) gamePick.add(new Option(g.name || g.file, g.file));
  if (!games.length) gamePick.add(new Option('No games', ''));
  gamePick.value = prefs.game ?? '';
  gamePick.disabled = !games.length;
}

/* ---------- Emulator ---------- */

// emulator.html is reloaded for every cartridge; EmulatorJS can't swap in place.
let emuGame = null;    // cartridge loaded (or loading) in the frame
let emuReady = false;  // frame said 'ready' and hasn't been handed a game yet
let emuStarted = false;
const toEmu = (msg, transfer) => emu.contentWindow?.postMessage(msg, '*', transfer);

function loadCartridge(game) {
  emuGame = game;
  emuReady = false;
  emuStarted = false;
  emu.src = `emulator.html?${Date.now()}`;
}

async function sendCartridge() {
  if (!emuReady || !emuGame) return;
  emuReady = false;
  const game = emuGame;
  const entry = games.find((g) => g.file === game);
  const [rom, stored, resumed] = await Promise.all([
    fetch(chrome.runtime.getURL(`roms/${game}`)).then((r) => r.arrayBuffer()),
    storage.get(saveKey(game)),
    session.get(resumeKey(game)),
  ]);
  if (game !== emuGame) return; // switched again while reading
  const save = stored[saveKey(game)];
  const snapshot = resumed[resumeKey(game)];
  // Paused until the boot animation is over or while web mode is showing.
  if (!screenLive()) toEmu({ type: 'pause' });
  toEmu({
    type: 'load',
    fileName: game,
    name: entry?.name || game,
    core: /\.gbc$/i.test(game) ? 'gbc' : 'gb',
    rom,
    save: save ? fromBase64(save) : null,
    state: snapshot ? fromBase64(snapshot) : null,
  }, [rom]);
}

// The game shows and runs only in game mode once the boot animation is done.
const screenLive = () => !state.booting && prefs.mode === 'game' && !!prefs.game;

function syncEmu() {
  const live = screenLive();
  emu.style.visibility = live ? 'visible' : 'hidden';
  noGame.hidden = state.booting || prefs.mode !== 'game' || !!prefs.game;
  if (emuStarted) toEmu({ type: live ? 'play' : 'pause' });
}

window.addEventListener('message', (e) => {
  if (e.source !== emu.contentWindow || !e.data) return;
  const msg = e.data;
  if (msg.type === 'ready') {
    emuReady = true;
    sendCartridge();
  } else if (msg.type === 'started') {
    emuStarted = true;
    syncEmu();
  } else if (msg.type === 'save' && msg.game) {
    storage.set({ [saveKey(msg.game)]: toBase64(msg.data) });
  } else if (msg.type === 'state' && msg.game) {
    session.set({ [resumeKey(msg.game)]: toBase64(msg.data) }).catch(() => {});
  }
});

gamePick.addEventListener('change', () => {
  if (!gamePick.value || gamePick.value === prefs.game) return;
  // Leave the old game where it was, so picking it again resumes it.
  if (emuStarted) toEmu({ type: 'flush' });
  prefs.game = gamePick.value;
  savePrefs();
  if (prefs.mode !== 'game') {
    prefs.mode = 'game';
    leaveWeb();
    renderMode();
  }
  // Give the flushed save/state a moment to arrive before the frame goes.
  setTimeout(() => {
    loadCartridge(prefs.game);
    showScreen();
  }, 150);
});

/* ---------- Buttons ---------- */

function press(key) {
  if (state.booting) return;
  if (prefs.mode === 'web') {
    if (key === 'b') webBack();
    if (key === 'start') urlInput.focus();
    return;
  }
  toEmu({ type: 'input', index: BUTTON_INDEX[key], value: 1 });
}

function release(key) {
  toEmu({ type: 'input', index: BUTTON_INDEX[key], value: 0 });
}

// action: 'prepare' (warm up the player), 'play', or 'stop'.
// This frame lives inside a web page, where Chrome often blocks sound until the
// page is clicked, so the background plays it from an offscreen document.
function bootAudio(action, sound) {
  if (globalThis.chrome?.runtime?.id) {
    chrome.runtime.sendMessage({ type: 'gameboy:sound', action, sound }).catch(() => {});
    return;
  }
  // Opened as a plain file (no extension APIs): play it here instead.
  localSound?.pause();
  localSound = null;
  if (action === 'play') {
    localSound = new Audio(asset(`sounds/${sound}`));
    localSound.play().catch(() => {});
  }
}

function boot() {
  bootTimers.forEach(clearTimeout);
  bootAudio('stop');

  const { gif, sound, soundAt, length } = BOOTS[prefs.boot];
  state.booting = true;
  syncEmu();
  web.hidden = true;
  bootImg.hidden = false;
  // Cache-bust so the GIF restarts from frame 0 on every boot.
  bootImg.src = `${asset(gif)}?t=${Date.now()}`;

  // Create the offscreen player now so it's ready when the sound is due.
  bootAudio('prepare');
  bootTimers = [
    setTimeout(() => bootAudio('play', sound), soundAt),
    setTimeout(() => {
      state.booting = false;
      bootImg.hidden = true;
      bootImg.removeAttribute('src');
      showScreen();
    }, length),
  ];
}

function showScreen() {
  if (state.booting) return;
  web.hidden = prefs.mode !== 'web';
  if (prefs.mode === 'game' && prefs.game && emuGame !== prefs.game) loadCartridge(prefs.game);
  if (prefs.mode === 'web' && !webOpen) openWeb(prefs.url);
  syncEmu();
}

// Most sites forbid being framed; the background worker lifts that for frames
// in this tab while web mode is on. Resolves once the rule is in place.
function allowFraming(on) {
  if (!globalThis.chrome?.runtime?.id) return Promise.resolve();
  return chrome.runtime.sendMessage({ type: 'gameboy:framing', on }).catch(() => {});
}

function toUrl(text) {
  const t = text.trim();
  if (!t) return HOME;
  const withScheme = /^[a-z][\w+.-]*:/i.test(t) ? t : `https://${t}`;
  try {
    const url = new URL(withScheme);
    // "foo bar" or "localhost-less" words are searches, not hostnames.
    const looksLikeHost = /^https?:$/.test(url.protocol) && (url.hostname.includes('.') || url.hostname === 'localhost');
    if (looksLikeHost && !/\s/.test(t)) return url.href;
  } catch {}
  return searchUrl(t);
}

// Cross-origin frames hide their history, so count loads ourselves to know
// whether Back has anywhere to go.
let webDepth = 0;
let goingBack = false;
let webOpen = false;

async function openWeb(url) {
  prefs.url = url;
  urlInput.value = url === HOME ? '' : url;
  savePrefs();
  webOpen = true;
  await allowFraming(true);
  page.src = url;
}

function webBack() {
  if (webDepth <= 1) return;
  goingBack = true;
  // Our frame's history.back() steps through the embedded page's navigations.
  history.back();
}

// frame-reporter.js, running inside the embedded site, tells us where it is.
window.addEventListener('message', (e) => {
  if (e.source !== page.contentWindow || e.data?.type !== 'gameboy:page-location') return;
  const { href } = e.data;
  if (!webOpen || !/^https?:/.test(href)) return;
  prefs.url = href;
  if (document.activeElement !== urlInput) urlInput.value = href === HOME ? '' : href;
  savePrefs();
});

page.addEventListener('load', () => {
  if (!webOpen) return;
  webDepth += goingBack ? -1 : 1;
  goingBack = false;
  webBackBtn.disabled = webDepth <= 1;
});

document.getElementById('urlbar').addEventListener('submit', (e) => {
  e.preventDefault();
  urlInput.blur();
  openWeb(toUrl(urlInput.value));
});
webBackBtn.addEventListener('click', webBack);

// Unload the page (and its audio/video) rather than just hiding it.
function leaveWeb() {
  webOpen = false;
  page.src = 'about:blank';
  allowFraming(false);
  webDepth = 0;
  webBackBtn.disabled = true;
}

function renderMode() {
  const toWeb = prefs.mode === 'game';
  modeBtn.textContent = toWeb ? 'Web' : 'Game';
  modeBtn.title = toWeb ? 'Browse the web on the screen' : 'Back to the game';
}

modeBtn.addEventListener('click', () => {
  prefs.mode = prefs.mode === 'game' ? 'web' : 'game';
  if (prefs.mode === 'game') leaveWeb();
  renderMode();
  savePrefs();
  showScreen();
});

function setSkin(name) {
  prefs.skin = name;
  skinImg.src = asset(`skins/${name}.jpg`);
  document.querySelectorAll('.swatch').forEach((el) => {
    el.setAttribute('aria-pressed', el.dataset.skin === name);
  });
  savePrefs();
}

function renderSkinPicker() {
  const container = document.getElementById('skins');
  for (const name of SKINS) {
    const el = document.createElement('button');
    el.className = 'swatch';
    el.dataset.skin = name;
    el.title = name;
    el.style.backgroundImage = `url(${asset(`skins/${name}.jpg`)})`;
    el.addEventListener('click', () => setSkin(name));
    container.append(el);
  }
}

function renderBootMode() {
  bootModeBtn.textContent = BOOTS[prefs.boot].label;
}

bootModeBtn.addEventListener('click', () => {
  prefs.boot = prefs.boot === 'classic' ? 'color' : 'classic';
  renderBootMode();
  savePrefs();
  boot();
});

// Held, not clicked: games read how long a button stays down (walking, menus).
document.querySelectorAll('[data-key]').forEach((btn) => {
  const key = btn.dataset.key;
  let down = false;
  const up = () => {
    if (!down) return;
    down = false;
    release(key);
  };
  btn.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    down = true;
    btn.setPointerCapture(e.pointerId);
    press(key);
  });
  btn.addEventListener('pointerup', up);
  btn.addEventListener('pointercancel', up);
  btn.addEventListener('lostpointercapture', up);
});

// The page hosting this frame (overlay.js) moves and resizes it; we only
// report pointer deltas. Screen coordinates stay stable while the frame itself
// moves or grows under the pointer.
const shell = document.getElementById('gameboy');
const grip = document.getElementById('grip');
const toHost = (msg) => window.parent !== window && window.parent.postMessage(msg, '*');

function trackPointer(el, { canStart = () => true, moveType, endType }) {
  let from = null;
  const end = () => {
    if (!from) return;
    from = null;
    el.classList.remove('dragging');
    toHost({ type: endType });
  };
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !canStart(e)) return;
    from = { x: e.screenX, y: e.screenY };
    el.setPointerCapture(e.pointerId);
    el.classList.add('dragging');
  });
  el.addEventListener('pointermove', (e) => {
    if (!from) return;
    toHost({ type: moveType, dx: e.screenX - from.x, dy: e.screenY - from.y });
    from = { x: e.screenX, y: e.screenY };
  });
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

trackPointer(shell, {
  canStart: (e) => !e.target.closest('button, input, select'),
  moveType: 'gameboy:drag',
  endType: 'gameboy:dragend',
});
trackPointer(grip, { moveType: 'gameboy:resize', endType: 'gameboy:resizeend' });

// Everything is laid out for a 300px-wide shell; zoom it to the frame's size.
function fitToFrame() {
  const zoom = window.innerWidth / 300;
  document.documentElement.style.zoom = zoom;
  document.documentElement.style.setProperty('--zoom', zoom);
}
if (window.parent !== window) {
  fitToFrame();
  window.addEventListener('resize', fitToFrame);
}

document.getElementById('close').addEventListener('click', () => {
  toHost({ type: 'gameboy:close' });
});

window.addEventListener('pagehide', () => allowFraming(false));

const buttonFor = (key) => document.querySelector(`[data-key="${key}"]`);

// Keys typed into the URL bar are text, not Game Boy buttons.
const isTyping = (e) => e.target.closest?.('input');

document.addEventListener('keydown', (e) => {
  const key = KEYMAP[e.key];
  if (key && !isTyping(e)) {
    e.preventDefault();
    if (e.repeat) return; // held keys stay held in the emulator
    buttonFor(key).classList.add('pressed');
    press(key);
  }
});

document.addEventListener('keyup', (e) => {
  const key = KEYMAP[e.key];
  if (!key) return;
  buttonFor(key).classList.remove('pressed');
  release(key);
});

// Don't leave a button stuck down when focus leaves the Game Boy.
window.addEventListener('blur', () => {
  document.querySelectorAll('[data-key].pressed').forEach((btn) => btn.classList.remove('pressed'));
  Object.keys(BUTTON_INDEX).forEach(release);
});

Promise.all([loadPrefs(), loadGames()]).then(([saved]) => {
  Object.assign(prefs, saved);
  if (!games.some((g) => g.file === prefs.game)) {
    prefs.game = (games.find((g) => g.default) ?? games[0])?.file ?? null;
  }
  renderGamePicker();
  // Start loading the cartridge under the boot animation; it waits paused.
  if (prefs.mode === 'game' && prefs.game) loadCartridge(prefs.game);
  if (!SKINS.includes(prefs.skin)) prefs.skin = 'gray';
  if (!BOOTS[prefs.boot]) prefs.boot = 'color';
  if (prefs.mode !== 'web') prefs.mode = 'game';
  renderSkinPicker();
  setSkin(prefs.skin);
  renderBootMode();
  renderMode();
  if (RESUME) showScreen();
  else boot();
});
