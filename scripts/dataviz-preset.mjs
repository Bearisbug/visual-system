#!/usr/bin/env node
// Fit a chart series preset (libraries/dataviz/presets.json) to a token set by BD-TOKEN-001 step 8
// (references/system.md) and the tokens-schema §6.3 gates. Reads the resolved snapshots; prints the
// series 1-6 of every mode and writes nothing: the producer copies the colors into tokens.json /
// modes/ and checks them with check-tokens.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseColor, ratio, linearRGB, oklab, deltaE } from './lib/color.mjs';
import { leafAt } from './lib/tokens.mjs';

const LIB = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../libraries/dataviz/presets.json'), 'utf8')).presets;
const USAGE = `Usage: node <visual-system>/scripts/dataviz-preset.mjs TOKENS_DIR --preset ID
TOKENS_DIR holds tokens.json and the resolved snapshots (tokens.resolved.json for meta.defaultMode, tokens.resolved.<mode>.json
for the other mode). ID is one of ${LIB.map(p => p.id).join(', ')} (libraries/dataviz/INDEX.md). A slot whose color fails the
lightness band, chroma floor or 3:1 surface contrast in any mode takes the first spare that passes. Exit code 0 with a set,
1 when no spare fits.`;
const argv = process.argv.slice(2);
if (!argv.length || argv[0].startsWith('--')) { console.log(USAGE); process.exit(argv.includes('--help') ? 0 : 2); }
const die = m => { console.error(`dataviz-preset: ${m}`); process.exit(2); };
const id = argv[argv.indexOf('--preset') + 1], preset = argv.includes('--preset') && LIB.find(p => p.id === id);
if (!preset) die(`--preset must be one of ${LIB.map(p => p.id).join(', ')}`);
const DIR = path.resolve(argv[0]);
const read = f => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
const SRC = read('tokens.json'), ROLES = SRC.meta?.roles ?? {}, BASE = SRC.meta?.defaultMode ?? 'light';
const R = { [BASE]: read('tokens.resolved.json') };
for (const m of ['light', 'dark']) if (m !== BASE && fs.existsSync(path.join(DIR, `tokens.resolved.${m}.json`))) R[m] = read(`tokens.resolved.${m}.json`);

// tokens-schema §6.3 and the visual-system all-pairs floor (same numbers as check-tokens.mjs)
const BAND = { light: [0.43, 0.77], dark: [0.60, 0.92] };
const FLOOR = 0.10, CVD = 8, CVD_WARN = 6, NORMAL = 15, FEEDBACK = 15, ALL_PAIRS = 8, CONTRAST = 3;
const lch = c => { const [L, a, b] = oklab(linearRGB(c)); return { L, C: Math.hypot(a, b), H: (Math.atan2(b, a) * 180 / Math.PI + 360) % 360 }; };
const cvd = (a, b) => Math.min(deltaE(a, b, 'protan'), deltaE(a, b, 'deutan'));
const f1 = x => Math.floor(x * 10) / 10;
const role = (mode, k) => typeof ROLES[k] === 'string' ? parseColor(leafAt(R[mode], ROLES[k])?.$value) : null;

const MODES = Object.keys(R).map(mode => {
  const surfaces = ['surface.sunken', 'surface.default', 'surface.raised', 'surface.overlay'].map(k => role(mode, k));
  if (surfaces.some(s => !s)) die(`${mode}: meta.roles needs surface.sunken / default / raised / overlay`);
  const feedback = ['feedback.success', 'feedback.warning', 'feedback.error'].map(k => [k, role(mode, k)]).filter(([, c]) => c);
  return { mode, band: lch(surfaces[1]).L < 0.5 ? 'dark' : 'light', surfaces, feedback };
});
// per-color gates of one mode: band, chroma floor, contrast against the four surfaces
const colorFails = (m, hex) => {
  const c = parseColor(hex), x = lch(c), [lo, hi] = BAND[m.band], out = [];
  if (x.L < lo || x.L > hi) out.push(`L ${x.L.toFixed(2)} outside ${lo}-${hi}`);
  if (x.C < FLOOR) out.push(`C ${x.C.toFixed(3)} < ${FLOOR}`);
  const ct = Math.min(...m.surfaces.map(s => ratio(c, s)));
  if (ct < CONTRAST) out.push(`contrast ${ct.toFixed(2)}:1 < ${CONTRAST}:1`);
  return out;
};
const pairs = []; for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) pairs.push([i, j]);
const worst = (cs, list, f) => list.reduce((w, [i, j]) => { const v = f(cs[i], cs[j]); return v < w.v ? { v, pair: `${i + 1}-${j + 1}` } : w; }, { v: Infinity });
const adjacent = pairs.filter(([i, j]) => j === i + 1), top = pairs.filter(([, j]) => j < 3);
const distinct = hexes => { const cs = hexes.map(parseColor);
  return worst(cs, adjacent, cvd).v >= CVD_WARN && worst(cs, adjacent, deltaE).v >= NORMAL && worst(cs, top, cvd).v >= CVD_WARN && worst(cs, top, deltaE).v >= NORMAL && worst(cs, pairs, deltaE).v >= ALL_PAIRS; };
const fits = slot => MODES.every(m => !colorFails(m, slot[m.band]).length);
const setPasses = set => MODES.every(m => distinct(set.map(s => s[m.band])));

const set = [...preset.series], swaps = [];
for (let i = 0; i < 6; i++) {
  if (fits(set[i])) continue;
  const why = MODES.flatMap(m => colorFails(m, set[i][m.band]).map(f => `${m.mode} ${f}`)).join('; ');
  const spare = preset.spares.find(s => !set.includes(s) && fits(s) && setPasses(set.map((x, k) => k === i ? s : x)));
  if (!spare) { console.error(`dataviz-preset: slot ${i + 1} (${set[i].name}) fails ${why} and no spare fits: pick another preset, or record the gap in DESIGN.md and ask the user`); process.exit(1); }
  swaps.push(`slot ${i + 1}: ${set[i].name} -> spare ${spare.name} (${why})`);
  set[i] = spare;
}
if (!setPasses(set)) { console.error('dataviz-preset: the set fails the distinctness gates after substitution: pick another preset'); process.exit(1); }

console.log(`preset ${preset.id} (${preset.name})${swaps.length ? `; ${swaps.join('; ')}` : '; no slot replaced'}`);
for (const m of MODES) {
  const hexes = set.map(s => s[m.band]), cs = hexes.map(parseColor);
  console.log(`${m.mode} (${m.band} band)`);
  hexes.forEach((h, i) => { const x = lch(cs[i]); console.log(`  ${i + 1}  ${h}  L ${x.L.toFixed(2)}  C ${x.C.toFixed(2)}  H ${Math.round(x.H)}  ${set[i].name}`); });
  const w = list => { const c = worst(cs, list, cvd), n = worst(cs, list, deltaE); return `CVD dE ${f1(c.v)} (${c.pair}), normal dE ${f1(n.v)} (${n.pair})`; };
  const ct = Math.min(...cs.flatMap(c => m.surfaces.map(s => ratio(c, s))));
  const near = m.feedback.flatMap(([k, f]) => cs.map((c, i) => ({ k, i, d: deltaE(c, f) })));
  console.log(`  adjacent ${w(adjacent)}; series 1-3 ${w(top)}; all pairs ${w(pairs)}; lowest surface contrast ${ct.toFixed(2)}:1${near.length ? `; nearest feedback dE ${f1(Math.min(...near.map(n => n.d)))}` : ''}`);
  if (worst(cs, adjacent, cvd).v < CVD || worst(cs, top, cvd).v < CVD) console.log('  warning: a CVD dE is in the 6-8 band: the $description and DESIGN.md require secondary encoding (direct labels, gaps or texture)');
  const close = near.filter(n => n.d < FEEDBACK).map(n => `series ${n.i + 1} / ${n.k.slice(9)} ${f1(n.d)}`);
  if (close.length) console.log(`  warning: dE < ${FEEDBACK} from a feedback color (${close.join(', ')}): charts mark status with an icon or a text label beside the feedback color`);
}
