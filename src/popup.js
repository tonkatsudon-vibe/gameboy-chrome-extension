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
const romInput = document.getElementById('rom-input');
const web = document.getElementById('web');
const page = document.getElementById('page');
const urlInput = document.getElementById('url');
const webBackBtn = document.getElementById('web-back');
const modeBtn = document.getElementById('mode');

// game: the cartridge in the slot, or '' when it's been ejected.
const prefs = { skin: 'gray', boot: 'color', mode: 'game', url: HOME, game: 'tobudx.gb' };
const state = { booting: false, savesOpen: false };
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

// One freely licensed homebrew game ships in assets/cartridges/ (see the
// LICENSE file there). Everything else is the player's own .gb/.gbc files,
// kept in local storage (key rom:<file>) so every page can play them. "games"
// lists those; saves stay keyed by file name, so reloading a removed ROM picks
// its save back up.
const BUILT_IN = [
  { file: 'tobudx.gb', name: 'Tobu Tobu Girl Deluxe', url: asset('cartridges/tobudx.gb') },
];
const romKey = (game) => `rom:${game}`;
let games = []; // [{ file, name }]
const allGames = () => [...BUILT_IN, ...games.filter((g) => !BUILT_IN.some((b) => b.file === g.file))];
const isBuiltIn = (game) => BUILT_IN.some((b) => b.file === game);

const LOAD_ROM = '__load__';
const EJECT = '__eject__';
const REMOVE_ROM = '__remove__';

async function loadGames() {
  if (!storage) return;
  ({ games } = await storage.get({ games: [] }));
}

function renderGamePicker() {
  gamePick.textContent = '';
  if (!prefs.game) gamePick.add(new Option('No cartridge', ''));
  for (const g of allGames()) gamePick.add(new Option(g.name || g.file, g.file));
  gamePick.add(new Option('Load ROM…', LOAD_ROM));
  if (prefs.game) gamePick.add(new Option('Eject cartridge', EJECT));
  if (prefs.game && !isBuiltIn(prefs.game)) gamePick.add(new Option('Remove this game', REMOVE_ROM));
  gamePick.value = prefs.game;
  gamePick.disabled = !storage;
}

// The cartridge header's title (0x134-0x143), padded with zeros. Color-era
// carts shorten it to 11 bytes and follow it with a 4-letter maker code.
function romTitle(bytes) {
  const raw = String.fromCharCode(...bytes.subarray(0x134, 0x144));
  let title = raw.replace(/[^\x20-\x7e].*$/, '');
  if (bytes[0x143] & 0x80 && /^[A-Z0-9]{4}$/.test(raw.slice(11, 15))) title = title.slice(0, 11);
  return title.replace(/_/g, ' ').trim();
}

// Every Game Boy cartridge carries the Nintendo logo at 0x104, which the
// boot ROM checks; its first bytes are enough to reject non-ROM files.
const looksLikeRom = (bytes) => bytes.length >= 0x150
  && bytes[0x104] === 0xce && bytes[0x105] === 0xed && bytes[0x106] === 0x66 && bytes[0x107] === 0x66;

async function addRom(file) {
  if (!/\.gbc?$/i.test(file.name)) return alertScreen('Pick a .gb or .gbc file');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!looksLikeRom(bytes)) return alertScreen('Not a Game Boy ROM');
  if (isBuiltIn(file.name)) return switchGame(file.name);
  const entry = { file: file.name, name: romTitle(bytes) || file.name.replace(/\.gbc?$/i, '') };
  games = [...games.filter((g) => g.file !== entry.file), entry];
  await storage.set({ games, [romKey(entry.file)]: toBase64(bytes) });
  switchGame(entry.file);
}

async function removeRom(game) {
  if (emuStarted) toEmu({ type: 'flush' });
  games = games.filter((g) => g.file !== game);
  await storage.set({ games });
  await storage.remove(romKey(game));
  await session.remove(resumeKey(game));
  prefs.game = '';
  savePrefs();
  renderGamePicker();
  unloadCartridge();
  showScreen();
}

// Shown on the no-cartridge screen, which a ROM problem should explain.
function alertScreen(text) {
  noGameHint.textContent = text;
  noGameHint.classList.add('show');
  setTimeout(() => {
    noGameHint.textContent = NO_GAME_HINT;
    noGameHint.classList.remove('show');
  }, 3000);
}
const noGameHint = noGame.querySelector('small');
const NO_GAME_HINT = noGameHint.textContent;

romInput.addEventListener('change', () => {
  const [file] = romInput.files;
  romInput.value = '';
  if (file) addRom(file).catch((err) => {
    console.warn('[GameBoy Plugin] loading ROM failed:', err);
    alertScreen('Could not load that ROM');
  });
});
noGame.addEventListener('click', () => romInput.click());

// With no cartridge in, the boot animation runs as usual, but the Nintendo
// logo is read from the cartridge, so it comes out as a solid black box. This
// is the boot GIF's resting frame with that box drawn over the logo.
// frame: index into the GIF (negative counts from the end); box: [x, y, w, h]
// of "Nintendo" (not the ®) in that frame, measured from the 498×280 GIFs, plus 1px.
const NO_CARTRIDGE = {
  classic: { frame: 60, box: [155, 124, 191, 33] },
  color: { frame: -1, box: [201, 201, 99, 18] },
};
const noGameArt = document.getElementById('no-game-art');
const restFrames = {}; // boot → Promise<ImageBitmap>

function restFrame(boot) {
  restFrames[boot] ??= (async () => {
    const data = await (await fetch(asset(BOOTS[boot].gif))).arrayBuffer();
    const decoder = new ImageDecoder({ data, type: 'image/gif' });
    await decoder.tracks.ready;
    const { frame } = NO_CARTRIDGE[boot];
    const count = decoder.tracks.selectedTrack.frameCount;
    const { image } = await decoder.decode({ frameIndex: frame < 0 ? count + frame : frame });
    const bitmap = await createImageBitmap(image);
    image.close();
    decoder.close();
    return bitmap;
  })();
  return restFrames[boot];
}

async function drawNoCartridge() {
  const boot = prefs.boot;
  let bitmap = null;
  try {
    bitmap = await restFrame(boot);
  } catch (err) {
    console.warn('[GameBoy Plugin] boot frame failed:', err);
  }
  if (boot !== prefs.boot) return; // switched again while decoding
  const ctx = noGameArt.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, noGameArt.width, noGameArt.height);
  if (bitmap) ctx.drawImage(bitmap, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(...NO_CARTRIDGE[boot].box);
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

function unloadCartridge() {
  emuGame = null;
  emuReady = false;
  emuStarted = false;
  emu.removeAttribute('src');
}

async function sendCartridge() {
  if (!emuReady || !emuGame) return;
  emuReady = false;
  const game = emuGame;
  const entry = allGames().find((g) => g.file === game);
  const [stored, resumed, bundled] = await Promise.all([
    storage.get([romKey(game), saveKey(game)]),
    session.get(resumeKey(game)),
    entry?.url ? fetch(entry.url).then((r) => r.arrayBuffer()) : null,
  ]);
  if (game !== emuGame) return; // switched again while reading
  const rom = bundled ?? (stored[romKey(game)] ? fromBase64(stored[romKey(game)]) : null);
  if (!rom) return;
  const save = stored[saveKey(game)];
  const snapshot = resumed[resumeKey(game)];
  // Paused until the boot animation is over or while web mode is showing.
  if (!screenLive()) toEmu({ type: 'pause' });
  toEmu({
    type: 'load',
    fileName: game,
    name: entry?.name || game,
    // EmulatorJS has no 'gbc' system; its 'gb' core (gambatte) reads the
    // cartridge header and runs Game Boy Color games in color on its own.
    core: 'gb',
    rom,
    save: save ? fromBase64(save) : null,
    state: snapshot ? fromBase64(snapshot) : null,
  }, [rom]);
}

// The game shows and runs only in game mode once the boot animation is done.
const screenLive = () => !state.booting && !state.savesOpen && prefs.mode === 'game' && !!prefs.game;

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
    frozenGame = null;
    syncEmu();
  } else if (msg.game && msg.game === frozenGame) {
    // The old frame's last words after its save was replaced; drop them.
  } else if (msg.type === 'save' && msg.game) {
    storage.set({ [saveKey(msg.game)]: toBase64(msg.data) });
  } else if (msg.type === 'state' && msg.game) {
    session.set({ [resumeKey(msg.game)]: toBase64(msg.data) }).catch(() => {});
  }
});

gamePick.addEventListener('change', () => {
  const picked = gamePick.value;
  gamePick.value = prefs.game;
  if (picked === LOAD_ROM) romInput.click();
  else if (picked === EJECT) switchGame('');
  else if (picked === REMOVE_ROM) removeRom(prefs.game);
  else if (picked && picked !== prefs.game) switchGame(picked);
});

// game: a cartridge to put in, or '' to eject and show the empty boot screen.
function switchGame(game) {
  // Leave the old game where it was, so picking it again resumes it.
  if (emuStarted) toEmu({ type: 'flush' });
  prefs.game = game;
  savePrefs();
  renderGamePicker();
  if (prefs.mode !== 'game') {
    prefs.mode = 'game';
    leaveWeb();
    renderMode();
  }
  // Give the flushed save/state a moment to arrive before the frame goes.
  setTimeout(() => {
    if (prefs.game) loadCartridge(prefs.game);
    else unloadCartridge();
    showScreen();
  }, 150);
}

/* ---------- Save files ---------- */

const savesPanel = document.getElementById('saves');
const savesList = document.getElementById('saves-list');
const saveInput = document.getElementById('save-input');
const MAX_SAVE = 256 * 1024; // real cartridges top out at 128KB of SRAM

// Set while a game's save is being replaced: messages from its old frame are
// ignored until the reloaded frame says 'started'.
let frozenGame = null;
let importFor = null;
const saveMeta = new Map(); // file → its row's status line

const sizeLabel = (bytes) => (bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`);
const savedBytes = (b64) => Math.floor((b64.length * 3) / 4) - (b64.match(/=*$/)[0].length);

// Saves outlive their ROMs, so list every game that has either.
async function renderSaves() {
  const keys = storage.getKeys ? await storage.getKeys() : Object.keys(await storage.get(null));
  const saveKeys = keys.filter((k) => k.startsWith('save:'));
  const saves = await storage.get(saveKeys);
  const rows = allGames().map((g) => ({ file: g.file, name: g.name || g.file }));
  for (const k of saveKeys) {
    const file = k.slice('save:'.length);
    if (!rows.some((r) => r.file === file)) rows.push({ file, name: file, orphan: true });
  }

  savesList.textContent = '';
  saveMeta.clear();
  if (!rows.length) {
    const empty = document.createElement('li');
    empty.className = 'saves-empty';
    empty.textContent = 'No games or saves yet.';
    savesList.append(empty);
  }
  for (const { file, name, orphan } of rows) {
    const save = saves[saveKey(file)];
    const li = document.createElement('li');
    const title = document.createElement('div');
    title.className = 'name';
    title.textContent = name;
    title.title = file;
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = (save ? `${sizeLabel(savedBytes(save))} save` : 'No save') + (orphan ? ' · ROM removed' : '');
    saveMeta.set(file, meta);
    const actions = document.createElement('div');
    actions.className = 'actions';
    const btn = (label, onClick, { disabled = false, danger = false } = {}) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.disabled = disabled;
      if (danger) b.className = 'danger';
      b.addEventListener('click', () => onClick(b));
      actions.append(b);
    };
    btn('Export', () => exportSave(file, save), { disabled: !save });
    btn('Import', () => { importFor = file; saveInput.click(); });
    btn('Delete', (b) => confirmThen(b, () => replaceSave(file, null)), { disabled: !save, danger: true });
    li.append(title, meta, actions);
    savesList.append(li);
  }
}

// A second click within 3s confirms; no blocking dialogs in a framed page.
function confirmThen(button, action) {
  if (button.dataset.armed) return action();
  button.dataset.armed = '1';
  button.textContent = 'Sure?';
  setTimeout(() => {
    delete button.dataset.armed;
    button.textContent = 'Delete';
  }, 3000);
}

function exportSave(file, b64) {
  const url = URL.createObjectURL(new Blob([fromBase64(b64)], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${file.replace(/\.gbc?$/i, '')}.sav`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// data: an ArrayBuffer to store, or null to delete. The resume snapshot holds
// the old save too, so it goes, and a running copy of the game is reloaded.
async function replaceSave(file, data) {
  const running = file === emuGame;
  if (running) {
    frozenGame = file;
    unloadCartridge();
  }
  if (data) await storage.set({ [saveKey(file)]: toBase64(data) });
  else await storage.remove(saveKey(file));
  await session.remove(resumeKey(file));
  if (running) loadCartridge(file);
  renderSaves();
}

saveInput.addEventListener('change', async () => {
  const [picked] = saveInput.files;
  saveInput.value = '';
  const file = importFor;
  importFor = null;
  if (!picked || !file) return;
  if (!picked.size || picked.size > MAX_SAVE) {
    const meta = saveMeta.get(file);
    if (meta) meta.textContent = 'Not a Game Boy save file';
    return;
  }
  await replaceSave(file, await picked.arrayBuffer());
});

function openSaves() {
  if (!storage) return;
  state.savesOpen = true;
  savesPanel.hidden = false;
  syncEmu(); // pausing makes the emulator flush its latest save
  // Give that flushed save a moment to land before listing sizes.
  setTimeout(renderSaves, 150);
}

function closeSaves() {
  state.savesOpen = false;
  savesPanel.hidden = true;
  showScreen();
}

document.getElementById('saves-open').addEventListener('click', openSaves);
document.getElementById('saves-close').addEventListener('click', closeSaves);

/* ---------- Buttons ---------- */

function press(key) {
  if (state.booting || state.savesOpen) return;
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
  drawNoCartridge();
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

function trackPointer(el, { canStart = () => true, startType, moveType, endType }) {
  let from = null;
  let grab = null; // sent with startType on the first move, not on a plain click
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
    // Where on the shell it was grabbed, as fractions, so the host can
    // shrink it around that point and keep it under the pointer.
    const r = el.getBoundingClientRect();
    grab = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  });
  el.addEventListener('pointermove', (e) => {
    if (!from) return;
    if (grab && startType) toHost({ type: startType, ...grab });
    grab = null;
    toHost({ type: moveType, dx: e.screenX - from.x, dy: e.screenY - from.y });
    from = { x: e.screenX, y: e.screenY };
  });
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

trackPointer(shell, {
  canStart: (e) => !document.fullscreenElement && !e.target.closest('button, input, select, .saves'),
  startType: 'gameboy:dragstart',
  moveType: 'gameboy:drag',
  endType: 'gameboy:dragend',
});
trackPointer(grip, { moveType: 'gameboy:resize', endType: 'gameboy:resizeend' });

// A long press opens the browser's context menu or starts a drag/selection,
// which steals focus (dropping full screen) and lets go of the held button.
// The URL bar and web page keep their own menus.
for (const type of ['contextmenu', 'dragstart', 'selectstart']) {
  shell.addEventListener(type, (e) => {
    if (!e.target.closest('input, .web-page')) e.preventDefault();
  });
}

// Everything is laid out for a 300px-wide shell; zoom it to the frame's size.
// The frame keeps the shell's aspect ratio, except in full screen, where the
// shell fits the screen's height instead.
function fitToFrame() {
  const zoom = Math.min(window.innerWidth / 300, window.innerHeight / (300 * 1845 / 1076));
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

// Like F11, but just the Game Boy fills the screen. Esc (or the button) exits.
const fullscreenBtn = document.getElementById('fullscreen');
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
}
fullscreenBtn.addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', () => {
  fullscreenBtn.textContent = document.fullscreenElement ? 'Exit' : 'Full';
  fullscreenBtn.title = document.fullscreenElement ? 'Exit full screen (F11 or Esc)' : 'Full screen (F11)';
});

window.addEventListener('pagehide', () => allowFraming(false));

const buttonFor = (key) => document.querySelector(`[data-key="${key}"]`);

// Keys typed into the URL bar are text, not Game Boy buttons.
const isTyping = (e) => e.target.closest?.('input');

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.savesOpen) return closeSaves();
  // While the Game Boy has focus, F11 makes just it full screen, not the browser.
  if (e.key === 'F11') {
    e.preventDefault();
    return toggleFullscreen();
  }
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
  // A ROM removed in another tab, or null from before eject existed.
  if (prefs.game == null) prefs.game = '';
  if (prefs.game && !allGames().some((g) => g.file === prefs.game)) prefs.game = BUILT_IN[0].file;
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
