#!/usr/bin/env node
// Fit a chart series preset (libraries/dataviz/presets.json) to a token set by BD-TOKEN-001 step 8
// (references/system.md) and the tokens-schema §6.3 gates, series and fill tier. Reads the resolved
// snapshots; prints series 1-6 and their fills for every mode and writes nothing: the producer copies
// the colors into tokens.json / modes/ and checks them with check-tokens.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseColor, ratio, linearRGB, oklab, deltaE } from './lib/color.mjs';
import { leafAt } from './lib/tokens.mjs';

const LIB = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../libraries/dataviz/presets.json'), 'utf8')).presets;
const USAGE = `Usage: node <visual-system>/scripts/dataviz-preset.mjs TOKENS_DIR --preset ID [--avoid DEG[:WIDTH]]...
TOKENS_DIR holds tokens.json and the resolved snapshots (tokens.resolved.json for meta.defaultMode, tokens.resolved.<mode>.json
for the other mode). ID is one of ${LIB.map(p => p.id).join(', ')} (libraries/dataviz/INDEX.md). A slot whose series color fails
the lightness band, chroma floor or 3:1 surface contrast, or whose fill fails the fill checks, in any mode takes the first spare
that passes. --avoid warns when a series hue comes within WIDTH degrees (default 30) of a hue the brand reserves, such as an
unread-badge red. Exit code 0 with a set, 1 when no spare fits.`;
const argv = process.argv.slice(2);
if (!argv.length || argv[0].startsWith('--')) { console.log(USAGE); process.exit(argv.includes('--help') ? 0 : 2); }
const die = m => { console.error(`dataviz-preset: ${m}`); process.exit(2); };
const id = argv[argv.indexOf('--preset') + 1], preset = argv.includes('--preset') && LIB.find(p => p.id === id);
if (!preset) die(`--preset must be one of ${LIB.map(p => p.id).join(', ')}`);
const avoid = argv.flatMap((a, i) => a === '--avoid' ? [argv[i + 1]] : []).map(v => { const [h, w] = String(v).split(':').map(Number); if (!Number.isFinite(h)) die(`--avoid ${v} is not DEG[:WIDTH]`); return { h, w: w || 30 }; });
const DIR = path.resolve(argv[0]);
const read = f => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
const SRC = read('tokens.json'), ROLES = SRC.meta?.roles ?? {}, BASE = SRC.meta?.defaultMode ?? 'light';
const R = { [BASE]: read('tokens.resolved.json') };
for (const m of ['light', 'dark']) if (m !== BASE && fs.existsSync(path.join(DIR, `tokens.resolved.${m}.json`))) R[m] = read(`tokens.resolved.${m}.json`);

// tokens-schema §6.3 and the visual-system all-pairs floor (same numbers as check-tokens.mjs)
const BAND = { light: [0.43, 0.77], dark: [0.60, 0.92] };
const FLOOR = 0.10, CVD = 8, CVD_WARN = 6, NORMAL = 15, FEEDBACK = 15, ALL_PAIRS = 8, CONTRAST = 3;
const FILL_FLOOR = 0.07, FILL_HUE = 45, FILL_CVD = 6;          // fill tier
const lch = c => { const [L, a, b] = oklab(linearRGB(c)); return { L, C: Math.hypot(a, b), H: (Math.atan2(b, a) * 180 / Math.PI + 360) % 360 }; };
const cvd = (a, b) => Math.min(deltaE(a, b, 'protan'), deltaE(a, b, 'deutan'));
const f1 = x => Math.floor(x * 10) / 10, f2 = x => (Math.floor(x * 100) / 100).toFixed(2);
const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
// the preset keeps one fill per slot for light; on dark surfaces the series color is its own fill
const fillOf = (slot, band) => band === 'light' ? slot.lightFill : slot.dark;
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
const fillFails = (m, slot) => {
  const f = lch(parseColor(fillOf(slot, m.band))), s = lch(parseColor(slot[m.band])), out = [];
  if (f.C < FILL_FLOOR) out.push(`fill C ${f.C.toFixed(3)} < ${FILL_FLOOR}`);
  if (hueGap(f.H, s.H) > FILL_HUE) out.push(`fill hue ${Math.round(hueGap(f.H, s.H))} deg from the series color`);
  return out;
};
const pairs = []; for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) pairs.push([i, j]);
const worst = (cs, list, f) => list.reduce((w, [i, j]) => { const v = f(cs[i], cs[j]); return v < w.v ? { v, pair: `${i + 1}-${j + 1}` } : w; }, { v: Infinity });
const adjacent = pairs.filter(([i, j]) => j === i + 1), top = pairs.filter(([, j]) => j < 3);
const distinct = hexes => { const cs = hexes.map(parseColor);
  return worst(cs, adjacent, cvd).v >= CVD_WARN && worst(cs, adjacent, deltaE).v >= NORMAL && worst(cs, top, cvd).v >= CVD_WARN && worst(cs, top, deltaE).v >= NORMAL && worst(cs, pairs, deltaE).v >= ALL_PAIRS; };
const fillDistinct = hexes => { const cs = hexes.map(parseColor);
  return worst(cs, adjacent, cvd).v >= FILL_CVD && worst(cs, top, cvd).v >= FILL_CVD && worst(cs, pairs, deltaE).v >= ALL_PAIRS; };
const slotFails = slot => MODES.flatMap(m => [...colorFails(m, slot[m.band]), ...fillFails(m, slot)].map(f => `${m.mode} ${f}`));
const fits = slot => !slotFails(slot).length;
const setPasses = set => MODES.every(m => distinct(set.map(s => s[m.band])) && fillDistinct(set.map(s => fillOf(s, m.band))));

const set = [...preset.series], swaps = [];
for (let i = 0; i < 6; i++) {
  if (fits(set[i])) continue;
  const why = slotFails(set[i]).join('; ');
  const spare = preset.spares.find(s => !set.includes(s) && fits(s) && setPasses(set.map((x, k) => k === i ? s : x)));
  if (!spare) { console.error(`dataviz-preset: slot ${i + 1} (${set[i].name}) fails ${why} and no spare fits: pick another preset, or record the gap in DESIGN.md and ask the user`); process.exit(1); }
  swaps.push(`slot ${i + 1}: ${set[i].name} -> spare ${spare.name} (${why})`);
  set[i] = spare;
}
if (!setPasses(set)) { console.error('dataviz-preset: the set fails the distinctness gates after substitution: pick another preset'); process.exit(1); }

console.log(`preset ${preset.id} (${preset.name})${swaps.length ? `; ${swaps.join('; ')}` : '; no slot replaced'}`);
for (const m of MODES) {
  const hexes = set.map(s => s[m.band]), cs = hexes.map(parseColor), fills = set.map(s => fillOf(s, m.band)), fs_ = fills.map(parseColor);
  console.log(`${m.mode} (${m.band} band): series, fill`);
  hexes.forEach((h, i) => { const x = lch(cs[i]), y = lch(fs_[i]); console.log(`  ${i + 1}  ${h}  ${fills[i]}  series L ${x.L.toFixed(2)} C ${x.C.toFixed(2)} H ${Math.round(x.H)}; fill ${fills[i] === h ? 'is the series color' : `L ${y.L.toFixed(2)} C ${y.C.toFixed(2)} H ${Math.round(y.H)}`}  ${set[i].name}`); });
  const w = (list, c_ = cs) => { const c = worst(c_, list, cvd), n = worst(c_, list, deltaE); return `CVD dE ${f1(c.v)} (${c.pair}), normal dE ${f1(n.v)} (${n.pair})`; };
  const ct = Math.min(...cs.flatMap(c => m.surfaces.map(s => ratio(c, s)))), fct = Math.min(...fs_.flatMap(c => m.surfaces.map(s => ratio(c, s))));
  const near = m.feedback.flatMap(([k, f]) => cs.map((c, i) => ({ k, i, d: deltaE(c, f) })));
  console.log(`  adjacent ${w(adjacent)}; series 1-3 ${w(top)}; all pairs ${w(pairs)}; lowest surface contrast ${f2(ct)}:1${near.length ? `; nearest feedback dE ${f1(Math.min(...near.map(n => n.d)))}` : ''}`);
  console.log(`  fills: adjacent ${w(adjacent, fs_)}; all pairs ${w(pairs, fs_)}; lowest surface contrast ${f2(fct)}:1${fct < CONTRAST ? ', so filled marks draw a 1 px outline in the series color' : ''}`);
  if (worst(cs, adjacent, cvd).v < CVD || worst(cs, top, cvd).v < CVD) console.log('  warning: a CVD dE is in the 6-8 band: the $description and DESIGN.md require secondary encoding (direct labels, gaps or texture)');
  const close = near.filter(n => n.d < FEEDBACK).map(n => `series ${n.i + 1} / ${n.k.slice(9)} ${f1(n.d)}`);
  if (close.length) console.log(`  warning: dE < ${FEEDBACK} from a feedback color (${close.join(', ')}): charts mark status with an icon or a text label beside the feedback color`);
  const reserved = avoid.flatMap(a => cs.map((c, i) => ({ a, i, d: hueGap(lch(c).H, a.h) })).filter(x => x.d < x.a.w)).map(x => `series ${x.i + 1} H ${Math.round(lch(cs[x.i]).H)} is ${Math.round(x.d)} deg from reserved H ${x.a.h}`);
  if (reserved.length) console.log(`  warning: ${reserved.join(', ')}: use a spare or another preset, or keep that series away from the reserved role`);
}
