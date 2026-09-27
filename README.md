# Game Boy

A Chrome extension (Manifest V3) that floats a tiny Game Boy over every page you visit.

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

You can also click the buttons on the skin itself. Click the Game Boy first so
it has keyboard focus.

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
    ├── overlay.js       # content script: floating, draggable, resizable frame
    ├── frame-reporter.js # reports the web-mode page's address to the Game Boy
    ├── offscreen.html/js # plays boot sounds (web pages would block autoplay)
    ├── popup.html       # skin + screen + button hotspots (loaded in the frame)
    ├── popup.css
    └── popup.js         # boot, skin picker, game screen, web mode + input
```
