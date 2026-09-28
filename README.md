# GameBoy Plugin by Tonkatsudon

A Chrome extension (Manifest V3) that floats a tiny Game Boy over every page
you visit and plays real Game Boy games on it.

Created by **Tonkatsudon** ·
Instagram [@tonkatsudon.vibe](https://instagram.com/tonkatsudon.vibe) ·
GitHub [@tonkatsudon-vibe](https://github.com/tonkatsudon-vibe) ·
[MIT License](LICENSE)

> Forking or reusing this project? The MIT License asks you to keep the
> copyright notice, so please keep `LICENSE` and the credit to Tonkatsudon.

## Load it

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. Click **Load unpacked** and pick this `gameboy/` folder
4. Click the toolbar icon to switch the Game Boy on or off. Once on, it follows
   you to every page and tab until you switch it off (toolbar icon or **×**).
   Drag it anywhere by its shell, or resize it with the grip in its bottom-right
   corner; it remembers its position and size.
   (Chrome doesn't allow it on `chrome://` pages or the Web Store.)

## Controls

| Game Boy | Keyboard |
| -------- | -------- |
| D-pad    | Arrow keys |
| A / B    | X / Z |
| Start    | Enter |
| Select   | Shift |

You can also press and hold the buttons on the skin itself. Click the Game Boy
first so it has keyboard focus.

## Games

The screen runs a real Game Boy / Game Boy Color emulator
([EmulatorJS](https://emulatorjs.org), gambatte core, pinned to 4.2.3 and loaded
from jsDelivr). Hover the bottom edge of the shell and pick a game from the
dropdown in the toolbar.

Games come from the `roms/` folder, listed in `roms/roms.json`. The entry
marked `"default": true` plays first:

```json
[
  { "file": "pokemon_yellow.gb", "name": "Pokémon Yellow", "default": true },
  { "file": "pokemon_red.gb", "name": "Pokémon Red" }
]
```

**No ROMs are included.** Game ROMs are copyrighted, so `roms/` is gitignored.
Put `.gb` / `.gbc` files you own there, list them in `roms.json`, and reload the
extension.

- **Page changes.** The Game Boy is rebuilt on every page and tab, so the
  running game is snapshotted every 2s and picks up where it was on the next
  page. Switching games keeps each one's place.
- **Web mode and the boot animation** pause the game.

## Saves

| What | Stored in | Survives closing Chrome? |
| ---- | --------- | :----------------------: |
| **In-game save** (choosing SAVE in the game) | `chrome.storage.local`, key `save:<rom file>` (e.g. `save:pokemon_yellow.gb`) | ✅ Yes |
| **Exact spot you left off** (snapshot every 2s) | `chrome.storage.session`, key `resume:<rom file>` | ❌ No, only between pages and tabs while Chrome is open |

On disk, `chrome.storage.local` lives in your Chrome profile, e.g.
`~/Library/Application Support/Google/Chrome/Default/Local Extension Settings/<extension-id>/`
on macOS. It's Chrome's internal database, not a file you can open.

### Before closing Chrome

1. Save inside the game. In Pokémon, press **Start** (Enter), choose **SAVE**,
   and confirm.
2. Wait about **5 seconds** after the game says it saved. The extension copies
   the save out every 4 seconds, so quitting right away can lose the last one.

### Coming back later

1. Open Chrome. If the Game Boy was on when you quit, it's still on.
   Otherwise, click the toolbar icon.
2. After the boot animation, your last picked game loads.
3. Choose **CONTINUE** on the title screen.

### What keeps or loses a save

- ✅ **Safe:** closing Chrome, restarting the computer, and reloading the
  extension (↻ in `chrome://extensions`) from the same folder.
- ❌ **Removing the extension** in `chrome://extensions` deletes its storage,
  saves included.
- ❌ **Moving or renaming the extension's folder** can give it a new extension
  ID, and then it can't see its old saves.
- ⚠️ **Saves are tied to the ROM's file name.** Renaming `pokemon_yellow.gb`
  means the game won't find its old save.

## Skins & boot

When you switch it on it plays a boot animation on the screen with its
startup sound, then hands over to the game. Hover the bottom edge of the shell
to reveal the toolbar: pick a colour from the swatches, toggle **Classic / Color** to switch
between `gameboy.gif` + `gameboy.mp3` and `gameboy-adv.gif` + `gameboy-color.mp3`.
Both choices are remembered. The **×** closes it.

## Web mode

Hover the bottom edge and click **Web** to browse the internet on the Game Boy
screen (click **Game** to go back). Type a URL or a search into the bar at the
top of the screen. **B** or **‹** goes back; **Start** jumps to the URL bar.

Pages are laid out in a ~385px phone-sized viewport and scaled down to fit.
Most sites refuse to be embedded, so while web mode is open in a tab the
extension strips `X-Frame-Options` and `Content-Security-Policy` from frames
in that tab. That's why it asks for access to all sites. Some caveats:

- Sites see you as an embedded third party, so you'll usually be signed out.
- Sites that detect framing with JavaScript may still refuse to render.
- Changing page or tab reloads the embedded site (it reopens the same address).

## Layout

```
gameboy/
├── manifest.json
├── assets/
│   ├── icons/           # 16/48/128 toolbar icons
│   ├── skins/           # 1076×1845 shell images
│   ├── sounds/          # startup sounds
│   └── *.gif            # boot animations
└── src/
    ├── background.js    # toolbar click injects overlay.js; web-mode framing rule
    ├── emulator.html/js # sandboxed EmulatorJS screen, driven by popup.js
    ├── overlay.js       # content script: floating, draggable, resizable frame
    ├── frame-reporter.js # reports the web-mode page's address to the Game Boy
    ├── offscreen.html/js # plays boot sounds (web pages would block autoplay)
    ├── popup.html       # skin + screen + button hotspots (loaded in the frame)
    ├── popup.css
    └── popup.js         # boot, skin picker, game picker, web mode + input
```

`emulator.html` is a **sandbox** page (see `manifest.json`). MV3 extension
pages can't run code from a CDN, and EmulatorJS loads its scripts from one and
compiles the core from a blob. The sandbox has an opaque origin, so it can't
use storage. `popup.js` sends it the ROM and saved data over `postMessage`,
forwards button presses, and stores what it reports back.

## Credits & license

- **GameBoy Plugin** is created by **Tonkatsudon**
  ([Instagram](https://instagram.com/tonkatsudon.vibe) ·
  [GitHub](https://github.com/tonkatsudon-vibe)) and released under the
  [MIT License](LICENSE). Copyright (c) 2026 Tonkatsudon.
- Emulation by [EmulatorJS](https://github.com/EmulatorJS/EmulatorJS)
  (GPL-3.0). It's fetched from jsDelivr at runtime and isn't part of this
  repository.
- Game Boy, Game Boy Color and Pokémon are trademarks of Nintendo. This is a
  fan project with no affiliation to Nintendo.
