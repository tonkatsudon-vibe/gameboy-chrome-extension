// The boot animation, drawn straight onto the 160×144 screen canvas: a bowl of
// katsudon slides up, the name types in under it, and steam starts to rise as
// the chime plays. All of it is original pixel art defined in this file.

// 5×7 dot-matrix letters, one number per row (bit 4 is the left-hand pixel).
const BOOT_FONT = {
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30], E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17], I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 25, 21, 19, 17, 17, 17], O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16], Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4], U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 27, 17], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14], 2: [14, 17, 1, 2, 4, 8, 31],
  3: [31, 2, 4, 2, 1, 17, 14], 4: [2, 6, 10, 18, 31, 2, 2], 5: [31, 16, 30, 1, 1, 17, 14],
  6: [6, 8, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8], 8: [14, 17, 17, 14, 17, 17, 14],
  9: [14, 17, 17, 15, 1, 2, 12],
};

// 32×22 sprite. Each letter is a key into the theme's colours:
// k outline, c crust, m cut side of the cutlet, r rice, g garnish, w rim highlight,
// b bowl, d bowl shade.
const BOOT_BOWL = [
  '................................',
  '................................',
  '.......kkkkkkkkkkkkkkkkkkk......',
  '......kcccckcccckcccckcccck.....',
  '.....kkcccckcccckcccckcccckk....',
  '....krkmmmmkmmmmkmmmmkmmmmkrk...',
  '...krgkmmmmkmmmmkmmmmkmmmmkrrk..',
  '...krrrkkkkkkkkkkkkkkkkkkkrgrk..',
  '..krrrrgrrrrrrrrrrrrrrgrrrrrrk..',
  '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
  'kwwbbbbbbbbbbbbbbbbbbbbbbbbbbbdk',
  'kbbbbbbbbbbbbbbbbbbbbbbbbbbbbddk',
  '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
  '..kbbbbbbbbbbbbbbbbbbbbbbbbddk..',
  '..kbbbbbbbbbbbbbbbbbbbbbbbdddk..',
  '...kbbbbbbbbbbbbbbbbbbbbbdddk...',
  '....kbbbbbbbbbbbbbbbbbbbdddk....',
  '.....kkbbbbbbbbbbbbbbbdddkk.....',
  '.......kkkbbbbbbbbbdddkkk.......',
  '..........kkkkkkkkkkkk..........',
  '...........kbbbbbbbdk...........',
  '..........kkkkkkkkkkkk..........',
];

const BOOT_PX = 2; // the sprite and the name are drawn at double size
const BOWL_X = (160 - 32 * BOOT_PX) / 2;
const BOWL_Y = 36;
const NAME_Y = 100;
const BOOT_T = { stripes: 150, rise: 300, landed: 900, perLetter: 50 };

// When the last letter of the name lands: the moment to start the chime.
const bootChimeAt = (name) => BOOT_T.landed + name.length * BOOT_T.perLetter;

function bootText(ctx, text, y, color) {
  // Double size, unless the name is too long to fit the screen that way.
  const px = text.length * 6 * BOOT_PX <= 156 ? BOOT_PX : 1;
  let x = Math.round((160 - (text.length * 6 - 1) * px) / 2);
  ctx.fillStyle = color;
  for (const ch of text) {
    (BOOT_FONT[ch] ?? []).forEach((bits, row) => {
      for (let col = 0; col < 5; col++) {
        if (bits & (16 >> col)) ctx.fillRect(x + col * px, y + row * px, px, px);
      }
    });
    x += 6 * px;
  }
}

function bootBowl(ctx, y, colors) {
  BOOT_BOWL.forEach((line, row) => {
    [...line].forEach((key, col) => {
      if (key === '.') return;
      ctx.fillStyle = colors[key];
      ctx.fillRect(BOWL_X + col * BOOT_PX, y + row * BOOT_PX, BOOT_PX, BOOT_PX);
    });
  });
}

// Three wisps that ripple upwards from the bowl.
function bootSteam(ctx, ms, color) {
  ctx.fillStyle = color;
  [10, 16, 22].forEach((col, wisp) => {
    for (let row = 0; row < 6; row++) {
      const sway = Math.round(Math.sin(row * 1.1 - ms / 160 + wisp * 2));
      ctx.fillRect(BOWL_X + (col + sway) * BOOT_PX, BOWL_Y - (row + 1) * BOOT_PX, BOOT_PX, BOOT_PX);
    }
  });
}

const easeOutBack = (p) => 1 + 2.4 * (p - 1) ** 3 + 1.4 * (p - 1) ** 2;
const progress = (ms, from, to) => Math.min(1, Math.max(0, (ms - from) / (to - from)));

// theme: { bg, text, steam, stripes?: [colour, …], bowl: { k, c, m, r, g, w, b, d } }
function drawBoot(ctx, ms, theme, name) {
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, 160, 144);

  // Bands that sweep in from the left, one after another, behind the bowl.
  (theme.stripes ?? []).forEach((color, i) => {
    const p = progress(ms, BOOT_T.stripes + i * 90, BOOT_T.stripes + i * 90 + 420);
    ctx.fillStyle = color;
    ctx.fillRect(0, BOWL_Y + 20 + i * 8, Math.round(160 * (1 - (1 - p) ** 3)), 6);
  });

  const rise = progress(ms, BOOT_T.rise, BOOT_T.landed);
  if (rise > 0) bootBowl(ctx, Math.round(144 + (BOWL_Y - 144) * easeOutBack(rise)), theme.bowl);

  const letters = Math.floor((ms - BOOT_T.landed) / BOOT_T.perLetter);
  if (letters > 0) bootText(ctx, name.slice(0, letters).padEnd(name.length), NAME_Y, theme.text);
  if (ms >= bootChimeAt(name)) bootSteam(ctx, ms, theme.steam);
}
