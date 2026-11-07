#!/usr/bin/env node
/**
 * Generates src/styles/dark-mode.css: dark-theme overrides for every colour utility the app uses.
 * Run after adding screens with new colour classes:  node scripts/build-dark-css.mjs
 *
 * How it works: scan src/ for Tailwind colour classes (bg-, text-, border-, divide-, ring-, placeholder:),
 * then map each to a dark equivalent:
 *  - neutrals (white, slate, gray, zinc, neutral, stone) flip: light surfaces become dark surfaces, dark text becomes light;
 *    dark buttons (slate-800/900) stay dark but lift off the page
 *  - colour tints (red-50, emerald-100 …) become translucent glows; their dark text (red-700 …) becomes light (red-300)
 *  - solid brand colours (red-600, emerald-600, #CC1A22 …) stay as they are
 * Only applies on screen with <html class="dark">; printing and PDFs always stay light.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(root, 'src');
const OUT = path.join(SRC, 'styles', 'dark-mode.css');

// Dark surfaces and ink
const SURF = { page: '#0b1220', card: '#111a2b', sub: '#152033', raise: '#1b2840', line: '#24324a', line2: '#2e3e5a', btn: '#2a3a57', btnHover: '#33466a' };
const INK = { 1: '#e8eef8', 2: '#cdd6e4', 3: '#a9b5c7', 4: '#8a97ab', 5: '#6c798e' };

const NEUTRALS = ['slate', 'gray', 'zinc', 'neutral', 'stone'];
const NEUTRAL_BG = { 50: SURF.sub, 100: SURF.raise, 200: SURF.line, 300: SURF.line2, 400: '#3d4f70', 500: '#55688a', 600: '#6c7fa0', 700: SURF.btnHover, 800: SURF.btn, 900: SURF.btn, 950: '#1f2c44' };
const NEUTRAL_TEXT = { 950: INK[1], 900: INK[1], 800: INK[1], 700: INK[2], 600: INK[3], 500: INK[4], 400: INK[5], 300: '#55647a', 200: '#46546a', 100: '#3a475c', 50: '#2f3b4f' };
const NEUTRAL_BORDER = { 50: SURF.line, 100: SURF.line, 200: SURF.line, 300: SURF.line2, 400: '#3d4f70', 500: '#55688a', 600: '#6c7fa0', 700: '#8090ad', 800: '#94a3bf', 900: '#aab7cf' };

// Tailwind 500 and 300 shades (hex) for colour tints
const HUE = {
  red: ['#ef4444', '#fca5a5'], rose: ['#f43f5e', '#fda4af'], pink: ['#ec4899', '#f9a8d4'], orange: ['#f97316', '#fdba74'],
  amber: ['#f59e0b', '#fcd34d'], yellow: ['#eab308', '#fde047'], lime: ['#84cc16', '#bef264'], green: ['#22c55e', '#86efac'],
  emerald: ['#10b981', '#6ee7b7'], teal: ['#14b8a6', '#5eead4'], cyan: ['#06b6d4', '#67e8f9'], sky: ['#0ea5e9', '#7dd3fc'],
  blue: ['#3b82f6', '#93c5fd'], indigo: ['#6366f1', '#a5b4fc'], violet: ['#8b5cf6', '#c4b5fd'], purple: ['#a855f7', '#d8b4fe'], fuchsia: ['#d946ef', '#f0abfc'],
};
const tint = (hex, pct) => `color-mix(in srgb, ${hex} ${pct}%, transparent)`;

function hexLum(hex) {
  const h = hex.replace('#', '');
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const withAlpha = (color, alpha) => (alpha == null ? color : `color-mix(in srgb, ${color} ${Math.round(alpha)}%, transparent)`);

/** Dark value for one utility (no variant), or null to leave it alone. */
function darkValue(kind, color, shade, alpha) {
  if (color === 'white') {
    if (kind === 'bg') return withAlpha(SURF.card, alpha);
    if (kind === 'border' || kind === 'divide' || kind === 'ring') return withAlpha(SURF.line, alpha);
    return null; // text-white stays white
  }
  if (color === 'black') return kind === 'text' ? INK[1] : null;
  if (color === 'transparent' || color === 'current' || color === 'inherit') return null;
  if (color.startsWith('[#')) {
    const hex = color.slice(1, -1);
    if (!/^#[0-9a-f]{3,8}$/i.test(hex)) return null;
    const lum = hexLum(hex);
    if (kind === 'bg' && lum > 0.85) return withAlpha(lum > 0.985 ? SURF.card : SURF.page, alpha);
    if (kind === 'text' && lum < 0.2) return INK[1];
    if ((kind === 'border' || kind === 'divide') && lum > 0.8) return SURF.line;
    return null; // brand colours stay
  }
  if (NEUTRALS.includes(color)) {
    const map = kind === 'bg' ? NEUTRAL_BG : kind === 'text' || kind === 'placeholder' ? NEUTRAL_TEXT : NEUTRAL_BORDER;
    return map[shade] ? withAlpha(map[shade], alpha) : null;
  }
  const hue = HUE[color];
  if (!hue) return null;
  const [c500, c300] = hue;
  if (kind === 'bg') {
    if (shade <= 50) return tint(c500, alpha != null ? Math.min(alpha, 14) : 12);
    if (shade <= 100) return tint(c500, 18);
    if (shade <= 200) return tint(c500, 26);
    return null; // solid colours stay
  }
  if (kind === 'text') {
    if (shade >= 700) return c300;
    if (shade === 600) return c300;
    return null;
  }
  if (kind === 'border' || kind === 'divide' || kind === 'ring') {
    if (shade <= 300) return tint(c500, 38);
    return null;
  }
  return null;
}

const PROP = {
  bg: (v) => `background-color: ${v}`,
  text: (v) => `color: ${v}`,
  border: (v) => `border-color: ${v}`,
  'border-t': (v) => `border-top-color: ${v}`, 'border-b': (v) => `border-bottom-color: ${v}`,
  'border-l': (v) => `border-left-color: ${v}`, 'border-r': (v) => `border-right-color: ${v}`,
  'border-x': (v) => `border-left-color: ${v}; border-right-color: ${v}`, 'border-y': (v) => `border-top-color: ${v}; border-bottom-color: ${v}`,
  divide: (v) => `border-color: ${v}`,
  ring: (v) => `--tw-ring-color: ${v}`,
  placeholder: (v) => `color: ${v}`,
};

const esc = (cls) => cls.replace(/([:/\[\]#.%()!,])/g, '\\$1');

// 1. collect classes
const files = [];
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) walk(p); else if (/\.(jsx?|tsx?)$/.test(e.name)) files.push(p);
});
walk(SRC);
const RE = /(?<![\w-])((?:[a-z0-9-]+:)*)(bg|text|border(?:-[tblrxy])?|divide|ring|placeholder:text)-((?:white|black|transparent|\[#[0-9a-fA-F]{3,8}\])|(?:[a-z]+)-(?:50|100|200|300|400|500|600|700|800|900|950))(?:\/(\d{1,3}))?(?![\w-])/g;
const found = new Set();
for (const f of files) {
  const text = fs.readFileSync(f, 'utf8');
  for (const m of text.matchAll(RE)) found.add(m[0]);
}

// 2. build rules
const rules = [];
for (const cls of [...found].sort()) {
  const m = cls.match(/^((?:[a-z0-9-]+:)*)(bg|text|border(?:-[tblrxy])?|divide|ring|placeholder:text)-(.+?)(?:\/(\d{1,3}))?$/);
  if (!m) continue;
  let [, variants, kind, colorPart, alpha] = m;
  const vlist = variants ? variants.slice(0, -1).split(':') : [];
  let color = colorPart;
  let shade = null;
  const sm = colorPart.match(/^([a-z]+)-(\d{2,3})$/);
  if (sm) { color = sm[1]; shade = Number(sm[2]); }
  const baseKind = kind === 'placeholder:text' ? 'placeholder' : kind.startsWith('border') ? 'border' : kind;
  const value = darkValue(baseKind, color, shade, alpha != null ? Number(alpha) : null);
  if (!value) continue;
  const prop = (PROP[kind === 'placeholder:text' ? 'placeholder' : kind] || PROP[baseKind])(value);

  let sel = `.${esc(cls)}`;
  let prefix = 'html.dark ';
  let skip = false;
  for (const v of vlist) {
    if (v === 'hover') sel += ':hover';
    else if (v === 'focus') sel += ':focus';
    else if (v === 'focus-visible') sel += ':focus-visible';
    else if (v === 'focus-within') sel += ':focus-within';
    else if (v === 'active') sel += ':active';
    else if (v === 'disabled') sel += ':disabled';
    else if (v === 'group-hover') prefix = 'html.dark .group:hover ';
    else if (['sm', 'md', 'lg', 'xl', '2xl'].includes(v)) { /* same colour at every width */ }
    else if (v === 'print' || v === 'dark') skip = true;
    else if (v === 'placeholder') sel += '::placeholder';
    else skip = true;
  }
  if (skip) continue;
  if (kind === 'placeholder:text') sel += '::placeholder';
  if (kind === 'divide') sel += ' > :not(:last-child)';
  rules.push(`  ${prefix}${sel} { ${prop}; }`);
}

const css = `/* GENERATED by scripts/build-dark-css.mjs — do not edit by hand. ${rules.length} rules. */
@media screen {
  html.dark { color-scheme: dark; --app-bg: ${SURF.page}; --component-bg: ${SURF.card}; --surface-silver: ${SURF.line}; --text-main: ${INK[1]}; --text-muted: ${INK[4]};
    --color-surface-canvas: ${SURF.page}; --color-surface-card: ${SURF.card}; --color-surface-subtle: ${SURF.sub}; --color-surface-hover: ${SURF.raise};
    --color-border-default: ${SURF.line}; --color-border-subtle: ${SURF.line}; --color-border-strong: ${SURF.line2};
    --color-text-primary: ${INK[1]}; --color-text-secondary: ${INK[4]}; --color-text-muted: ${INK[4]};
    --color-surface-silver: ${SURF.line}; --color-component-bg: ${SURF.card}; --color-app-bg: ${SURF.page}; --color-text-main: ${INK[1]}; --color-main: ${INK[1]}; --color-silver: ${SURF.line}; }
  html.dark body { background-color: ${SURF.page}; color: ${INK[1]}; }
  html.dark input, html.dark select, html.dark textarea { color-scheme: dark; }
  html.dark img[src*="logo"], html.dark img[src*="brands/"] { filter: drop-shadow(0 0 0.5px rgba(255,255,255,0.4)); }
  html.dark * { scrollbar-color: #33466a transparent; }
${rules.join('\n')}
}
`;
fs.writeFileSync(OUT, css);
console.log(`dark-mode.css: ${rules.length} rules from ${found.size} colour classes`);
