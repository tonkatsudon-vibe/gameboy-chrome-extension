// Generates the original artwork and sounds this extension ships with:
//   assets/shells/<colour>.svg   the handheld's shell, one file per colour
//   assets/sounds/chime-*.wav    the two boot chimes
// Everything here is drawn or synthesised from scratch; nothing is traced,
// sampled or recorded from a real console. No dependencies:
//   node tools/build-assets.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');

// ---------------------------------------------------------------- shells ---

// Shells are drawn on a 1076×1845 grid. The screen and every button sit exactly
// where popup.css places its hotspots (in % of that grid), so change both together.
const W = 1076;
const H = 1845;
const SCREEN = { x: 225, y: 153, w: 623, h: 573 };
const DPAD = { x: 82, y: 1077, size: 275 };
const BUTTONS = { a: { cx: 921, cy: 1182 }, b: { cx: 724, cy: 1250 } };
const PILLS = { y: 1504, w: 98, h: 42, select: 409, start: 564 };

const INK = '#2b2414';
const BEZEL = '#2c2b33';
const KEY = { top: '#3d3c46', side: '#222127', mark: '#8d8c9a' };
// Small brand accent under the screen (rust, mustard, cream).
const ACCENT = ['#ab421b', '#e3b12f', '#f1e0c3'];

// body = the face, light = a flat highlight, dark = recesses and the shell's side.
const SHELLS = {
  teal: { body: '#22b5a5', light: '#86e3d7', dark: '#17877b' },
  purple: { body: '#6c4fd1', light: '#ab98f0', dark: '#4b339b' },
  red: { body: '#d8403a', light: '#f3938d', dark: '#a32a25' },
  mustard: { body: '#dba520', light: '#f3d27a', dark: '#a97a10' },
  yellow: { body: '#ffd93b', light: '#fff2ac', dark: '#d4aa12' },
  green: { body: '#62c435', light: '#aee990', dark: '#429021' },
  silver: { body: '#cdd0d5', light: '#f4f5f7', dark: '#9a9ea6' },
};

function dpad() {
  const { x: x0, y: y0, size } = DPAD;
  const arm = size / 3;
  const [x1, x2, x3] = [x0 + arm, x0 + 2 * arm, x0 + size];
  const [y1, y2, y3] = [y0 + arm, y0 + 2 * arm, y0 + size];
  const r = 16;
  const plus = [
    `M${x1 + r} ${y0}H${x2 - r}Q${x2} ${y0} ${x2} ${y0 + r}V${y1}`,
    `H${x3 - r}Q${x3} ${y1} ${x3} ${y1 + r}V${y2 - r}Q${x3} ${y2} ${x3 - r} ${y2}H${x2}`,
    `V${y3 - r}Q${x2} ${y3} ${x2 - r} ${y3}H${x1 + r}Q${x1} ${y3} ${x1} ${y3 - r}V${y2}`,
    `H${x0 + r}Q${x0} ${y2} ${x0} ${y2 - r}V${y1 + r}Q${x0} ${y1} ${x0 + r} ${y1}H${x1}`,
    `V${y0 + r}Q${x1} ${y0} ${x1 + r} ${y0}Z`,
  ].join('');
  const cx = x0 + size / 2;
  const cy = y0 + size / 2;
  // One arrowhead per arm, pointing outwards.
  const arrow = (deg) =>
    `<path d="M${cx} ${y0 + 26}l18 26h-36z" transform="rotate(${deg} ${cx} ${cy})"/>`;
  return `
  <circle cx="${cx}" cy="${cy}" r="172" class="dark"/>
  <path d="${plus}" transform="translate(0 12)" fill="${KEY.side}" stroke="${INK}" stroke-width="10" stroke-linejoin="round"/>
  <path d="${plus}" fill="${KEY.top}" stroke="${INK}" stroke-width="10" stroke-linejoin="round"/>
  <circle cx="${cx}" cy="${cy}" r="22" fill="${KEY.side}"/>
  <g fill="${KEY.mark}">${[0, 90, 180, 270].map(arrow).join('')}</g>`;
}

function roundKey({ cx, cy }, letter) {
  return `
  <circle cx="${cx}" cy="${cy}" r="82" class="dark"/>
  <circle cx="${cx}" cy="${cy + 10}" r="60" fill="${KEY.side}" stroke="${INK}" stroke-width="10"/>
  <circle cx="${cx}" cy="${cy}" r="60" fill="${KEY.top}" stroke="${INK}" stroke-width="10"/>
  <text x="${cx}" y="${cy + 19}" font-size="54" font-weight="800" fill="${KEY.mark}">${letter}</text>`;
}

function pill(x, label) {
  const { y, w, h } = PILLS;
  return `
  <rect x="${x}" y="${y + 8}" width="${w}" height="${h}" rx="${h / 2}" fill="${KEY.side}" stroke="${INK}" stroke-width="8"/>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${KEY.top}" stroke="${INK}" stroke-width="8"/>
  <text x="${x + w / 2}" y="${y + 96}" font-size="25" font-weight="700" letter-spacing="2" class="dark">${label}</text>`;
}

// Round speaker grille: a centre hole and two rings.
function speaker(cx, cy) {
  const ring = (n, radius, turn = 0) =>
    Array.from({ length: n }, (_, i) => {
      const a = turn + (i / n) * 2 * Math.PI;
      const x = (cx + radius * Math.cos(a)).toFixed(1);
      const y = (cy + radius * Math.sin(a)).toFixed(1);
      return `<circle cx="${x}" cy="${y}" r="10"/>`;
    }).join('');
  return `
  <g fill="${INK}" opacity="0.55"><circle cx="${cx}" cy="${cy}" r="10"/>${ring(6, 36)}${ring(12, 72, Math.PI / 12)}</g>`;
}

function shell({ body, light, dark }) {
  const s = SCREEN;
  const dots = ACCENT.map((fill, i) => `<circle cx="${W / 2 + (i - 1) * 46}" cy="776" r="11" fill="${fill}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <style>
    .dark { fill: ${dark}; }
    text { font-family: "Helvetica Neue", Arial, sans-serif; text-anchor: middle; }
  </style>
  <rect x="7" y="7" width="${W - 14}" height="${H - 14}" rx="96" class="dark"/>
  <rect x="7" y="7" width="${W - 28}" height="${H - 46}" rx="92" fill="${body}"/>
  <path d="M52 430V140Q52 52 140 52H430" fill="none" stroke="${light}" stroke-width="14" stroke-linecap="round"/>
  <rect x="7" y="7" width="${W - 14}" height="${H - 14}" rx="96" fill="none" stroke="${INK}" stroke-width="14"/>

  <rect x="112" y="84" width="852" height="734" rx="52" fill="${BEZEL}" stroke="${INK}" stroke-width="12"/>
  <rect x="${s.x - 12}" y="${s.y - 12}" width="${s.w + 24}" height="${s.h + 24}" rx="14" fill="#0c0e0d"/>
  <rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="#151b17"/>
  ${dots}
${dpad()}
${roundKey(BUTTONS.a, 'A')}
${roundKey(BUTTONS.b, 'B')}
${pill(PILLS.select, 'SELECT')}
${pill(PILLS.start, 'START')}
${speaker(896, 1636)}
</svg>
`;
}

// ---------------------------------------------------------------- chimes ---

const RATE = 22050;
const LOUDNESS = 0.14;
const OVERSAMPLE = 8; // render naive waveforms high, then average down: cheap anti-aliasing

const WAVES = {
  square: (p) => (p < 0.5 ? 1 : -1),
  pulse: (p) => (p < 0.25 ? 1.5 : -0.5), // 25% duty, shifted so it averages to zero
  triangle: (p) => 1 - 4 * Math.abs(p - 0.5),
};

// notes: { at, len (seconds), hz, wave, gain, fade (decay time constant, seconds) }
function render(notes, { echo } = {}) {
  const seconds = Math.max(...notes.map((n) => n.at + n.len)) + (echo ? echo.delay * 3 : 0) + 0.05;
  const hi = new Float64Array(Math.ceil(seconds * RATE) * OVERSAMPLE);
  const hiRate = RATE * OVERSAMPLE;

  for (const { at, len, hz, wave, gain, fade = Infinity } of notes) {
    const start = Math.round(at * hiRate);
    const count = Math.round(len * hiRate);
    for (let i = 0; i < count; i++) {
      const t = i / hiRate;
      const attack = Math.min(1, t / 0.004);
      const release = Math.min(1, (len - t) / 0.012);
      hi[start + i] += WAVES[wave]((t * hz) % 1) * gain * attack * release * Math.exp(-t / fade);
    }
  }

  const out = new Float64Array(hi.length / OVERSAMPLE);
  for (let i = 0; i < out.length; i++) {
    let sum = 0;
    for (let j = 0; j < OVERSAMPLE; j++) sum += hi[i * OVERSAMPLE + j];
    out[i] = sum / OVERSAMPLE;
  }

  if (echo) {
    const d = Math.round(echo.delay * RATE);
    for (let i = d; i < out.length; i++) out[i] += out[i - d] * echo.gain;
  }

  // Level by loudness, not peak: the loudest tenth of a second sits at LOUDNESS
  // (RMS, full scale = 1), so both chimes play back about equally loud.
  const win = Math.round(RATE / 10);
  let loudest = 0;
  for (let i = 0; i + win <= out.length; i += win >> 1) {
    let sum = 0;
    for (let j = i; j < i + win; j++) sum += out[j] ** 2;
    loudest = Math.max(loudest, Math.sqrt(sum / win));
  }
  return out.map((v) => (v / loudest) * LOUDNESS);
}

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.round(v * 32767), i * 2));
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20); // PCM
  head.writeUInt16LE(1, 22); // mono
  head.writeUInt32LE(RATE, 24);
  head.writeUInt32LE(RATE * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

const [E5, Fs5, G5, A5, B5, Cs6, D6, E6] = [659.26, 739.99, 783.99, 880, 987.77, 1108.73, 1174.66, 1318.51];

const CHIMES = {
  // Three notes: up a fifth, then settling on the third with a soft root under it.
  classic: render([
    { at: 0.0, len: 0.08, hz: G5, wave: 'square', gain: 0.5 },
    { at: 0.08, len: 0.08, hz: D6, wave: 'square', gain: 0.5 },
    { at: 0.16, len: 0.7, hz: B5, wave: 'square', gain: 0.5, fade: 0.2 },
    { at: 0.16, len: 0.7, hz: G5, wave: 'square', gain: 0.18, fade: 0.2 },
  ]),
  // A four-note figure landing on an open chord over a bass note, with a short echo.
  color: render([
    { at: 0.0, len: 0.09, hz: A5, wave: 'pulse', gain: 0.4 },
    { at: 0.09, len: 0.09, hz: E5, wave: 'pulse', gain: 0.4 },
    { at: 0.18, len: 0.09, hz: Fs5, wave: 'pulse', gain: 0.4 },
    { at: 0.27, len: 0.15, hz: Cs6, wave: 'pulse', gain: 0.4 },
    { at: 0.42, len: 1.0, hz: A5, wave: 'pulse', gain: 0.3, fade: 0.3 },
    { at: 0.42, len: 1.0, hz: E6, wave: 'pulse', gain: 0.3, fade: 0.3 },
    { at: 0.42, len: 1.0, hz: 220, wave: 'triangle', gain: 0.45, fade: 0.35 },
  ], { echo: { delay: 0.15, gain: 0.3 } }),
};

// ----------------------------------------------------------------- write ---

mkdirSync(join(ASSETS, 'shells'), { recursive: true });
for (const [name, colours] of Object.entries(SHELLS)) {
  writeFileSync(join(ASSETS, 'shells', `${name}.svg`), shell(colours));
}
for (const [name, samples] of Object.entries(CHIMES)) {
  writeFileSync(join(ASSETS, 'sounds', `chime-${name}.wav`), wav(samples));
}
console.log(`Wrote ${Object.keys(SHELLS).length} shells and ${Object.keys(CHIMES).length} chimes to assets/`);
