#!/usr/bin/env node
// Derive chart series colors 1-6 per mode by BD-TOKEN-001 step 8 (references/system.md) and the
// tokens-schema §6.3 gates. Reads the resolved snapshots; prints a proposal and writes nothing:
// the producer copies the colors into tokens.json / modes/ and checks them with check-tokens.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { parseColor, ratio, linearRGB, oklab, deltaE } from './lib/color.mjs';
import { leafAt } from './lib/tokens.mjs';

const USAGE = `Usage: node <visual-system>/scripts/derive-dataviz.mjs TOKENS_DIR [--series1 MODE=#RRGGBB]... [--hue1 DEG] [--brand-hue DEG]... [--avoid DEG[:WIDTH]]... [--json]
TOKENS_DIR holds tokens.json and the resolved snapshots (tokens.resolved.json for meta.defaultMode, tokens.resolved.<mode>.json
for the other mode). --series1 pins series 1 of a mode; --hue1 is the series-1 hue when the brand is monochrome and none of
link, focus ring and selection reaches the chroma floor; --brand-hue adds a hue from the brand assets; --avoid keeps every
series WIDTH degrees (default 30) away from a reserved hue. Exit code 0 with a proposal, 1 when no set passes.`;
const argv = process.argv.slice(2);
if (!argv.length || argv[0].startsWith('--')) { console.log(USAGE); process.exit(argv.includes('--help') ? 0 : 2); }
const many = name => argv.flatMap((a, i) => a === name ? [argv[i + 1]] : []);
const die = m => { console.error(`derive-dataviz: ${m}`); process.exit(2); };
const DIR = path.resolve(argv[0]);
const read = f => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
const SRC = read('tokens.json'), META = SRC.meta ?? {}, ROLES = META.roles ?? {};
const BASE = META.defaultMode ?? 'light';
const R = { [BASE]: read('tokens.resolved.json') };
for (const m of ['light', 'dark']) if (m !== BASE && fs.existsSync(path.join(DIR, `tokens.resolved.${m}.json`))) R[m] = read(`tokens.resolved.${m}.json`);
const MODES = ['light', 'dark'].filter(m => R[m]);          // light first: its band and surfaces constrain hues the most

// tokens-schema §6.3 and the visual-system all-pairs floor (same numbers as check-tokens.mjs)
const BAND = { light: [0.43, 0.77], dark: [0.48, 0.67] };
const FLOOR = 0.10, CVD = 8, NORMAL = 15, FEEDBACK = 15, ALL_PAIRS = 8, CONTRAST = 3, N = 6, MAX_WIDTH = 0.05;
const r2 = x => Math.round(x * 100) / 100;
const lch = c => { const [L, a, b] = oklab(linearRGB(c)); return { L, C: Math.hypot(a, b), H: (Math.atan2(b, a) * 180 / Math.PI + 360) % 360 }; };
const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
function fromLch(L, C, H) {                                      // OKLCH -> 8-bit sRGB, null when out of gamut
  const a = C * Math.cos(H * Math.PI / 180), b = C * Math.sin(H * Math.PI / 180);
  const [l, m, s] = [L + 0.3963377774 * a + 0.2158037573 * b, L - 0.1055613458 * a - 0.0638541728 * b, L - 0.0894841775 * a - 1.2914855480 * b].map(x => x ** 3);
  const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
  if (rgb.some(x => x < -1e-4 || x > 1 + 1e-4)) return null;
  const [r, g, bl] = rgb.map(x => Math.round(255 * (x <= 0.0031308 ? 12.92 * Math.max(0, x) : 1.055 * Math.min(1, x) ** (1 / 2.4) - 0.055)));
  return { r, g, b: bl, a: 1 };
}
const hex = c => '#' + [c.r, c.g, c.b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
const cvd = (a, b) => Math.min(deltaE(a, b, 'protan'), deltaE(a, b, 'deutan'));
const role = (mode, k) => typeof ROLES[k] === 'string' ? parseColor(leafAt(R[mode], ROLES[k])?.$value) : null;

const avoid = many('--avoid').map(s => { const [h, w] = s.split(':').map(Number); return { h, w: w || 30 }; });
const brandLeaves = leaf => { const n = leafAt(R[BASE], leaf) ?? {}; return Object.values(n).filter(v => v && typeof v === 'object' && '$value' in v).map(v => parseColor(v.$value)).filter(Boolean); };
// brand hues: primitive.color.brand.* with a visible hue (C >= 0.04) plus --brand-hue, 15 degrees apart
const BRAND_HUES = [];
for (const h of [...brandLeaves('primitive.color.brand').map(lch).filter(x => x.C >= 0.04).map(x => x.H), ...many('--brand-hue').map(Number)])
  if (BRAND_HUES.every(b => hueGap(b, h) >= 15)) BRAND_HUES.push(h);
const MONOCHROME = brandLeaves('primitive.color.brand').every(c => lch(c).C < FLOOR);

function context(mode) {
  const surfaces = ['surface.sunken', 'surface.default', 'surface.raised', 'surface.overlay'].map(k => role(mode, k)).filter(Boolean);
  if (surfaces.length < 4) die(`${mode}: meta.roles needs surface.sunken / default / raised / overlay`);
  const feedback = ['feedback.success', 'feedback.warning', 'feedback.error'].map(k => role(mode, k)).filter(Boolean);
  const band = lch(role(mode, 'surface.default')).L < 0.5 ? 'dark' : 'light';
  const ok = c => surfaces.every(s => ratio(c, s) >= CONTRAST) && feedback.every(f => deltaE(c, f) >= FEEDBACK) && avoid.every(a => hueGap(lch(c).H, a.h) >= a.w);
  return { mode, band, ok };
}
// every in-band, in-gamut, passing lightness for one hue and chroma, after 8-bit rounding
function feasible(ctx, H, C) {
  const [lo, hi] = BAND[ctx.band], out = [];
  for (let L = lo; L <= hi + 1e-9; L += 0.005) {
    const c = fromLch(L, C, H); if (!c) continue;
    const t = lch(c);
    if (t.L >= lo && t.L <= hi && t.C >= FLOOR && Math.abs(r2(t.C) - C) < 0.005 && ctx.ok(c) && !out.some(o => hex(o.c) === hex(c))) out.push({ c, ...t });
  }
  return out;
}
const pick4 = list => list.length <= 4 ? list : [0, 1, 2, 3].map(i => list[Math.round(i * (list.length - 1) / 3)]);

function series1(ctx) {
  const pinned = many('--series1').map(s => s.split('=')).find(([m]) => m === ctx.mode);
  if (pinned) { const c = parseColor(pinned[1]); if (!c) die(`--series1 ${pinned[1]} is not #RRGGBB`); return { c, ...lch(c), rule: 'pinned' }; }
  const accent = role(ctx.mode, 'accent'), a = accent && lch(accent);
  const [lo, hi] = BAND[ctx.band];
  if (a && a.C >= FLOOR && a.L >= lo && a.L <= hi && ctx.ok(accent)) return { c: accent, ...a, rule: 'accent' };
  let H, C, nearL, rule;
  if (!MONOCHROME && a && a.C >= 0.04) { H = a.H; C = Math.max(FLOOR, r2(a.C)); nearL = a.L; rule = 'accent hue'; }
  else {
    const src = ['link', 'focusRing.color', 'selection'].map(k => role(ctx.mode, k)).filter(Boolean).map(lch).filter(x => x.C >= FLOOR).sort((x, y) => y.C - x.C)[0];
    const hue1 = many('--hue1')[0];
    if (src) { H = src.H; nearL = src.L; rule = 'monochrome: most chromatic of link / focus ring / selection'; }
    else if (hue1 !== undefined) { H = Number(hue1); nearL = (lo + hi) / 2; rule = 'monochrome: --hue1'; }
    else die(`${ctx.mode}: monochrome brand and link / focus ring / selection are all below C ${FLOOR}; choose the series-1 hue from the brand mood and pass --hue1 DEG`);
    C = FLOOR; rule += ', chroma at the floor';
  }
  for (let c = C; c >= FLOOR - 1e-9; c = r2(c - 0.01)) for (const cc of [c, ...(rule.startsWith('monochrome') ? [r2(c + 0.01)] : [])]) {
    const f = feasible(ctx, H, cc);
    if (f.length) return { ...f.sort((x, y) => Math.abs(x.L - nearL) - Math.abs(y.L - nearL))[0], rule };
  }
  die(`${ctx.mode}: no in-band series 1 at hue ${H.toFixed(0)}; pass --series1 ${ctx.mode}=#RRGGBB or --hue1`);
}

// branch and bound over slots 2-6, lexicographic: slots that keep the light hue (prefer), brand hues used, worst adjacent CVD
// deltaE. hues forces one hue per slot; prefer only scores them.
function search(ctx, s1, width, hues, prefer) {
  const H1 = s1.H, C1 = r2(s1.C);
  const levels = []; for (let d = -width; d <= width + 1e-9; d = r2(d + 0.01)) if (r2(C1 + d) >= FLOOR) levels.push(r2(C1 + d));
  const grid = []; for (let k = 1; k < 12; k++) grid.push((H1 + 30 * k) % 360);
  const pool = hues ?? [...(prefer ?? []), ...BRAND_HUES.filter(h => hueGap(h, H1) >= 15), ...grid.filter(g => BRAND_HUES.every(b => hueGap(b, g) >= 15))];
  const uniq = pool.filter((h, i) => pool.findIndex(g => hueGap(g, h) < 15) === i);
  const byHue = new Map(uniq.map(h => [h, levels.flatMap(C => pick4(feasible(ctx, h, C)))]));
  const isBrand = h => BRAND_HUES.some(b => hueGap(b, h) < 1);
  let best = null;
  const seq = [s1], used = new Set();
  const score = (same, brand, worst) => [same, brand, worst];
  const better = (a, b) => { for (let k = 0; k < 3; k++) if (a[k] !== b[k]) return a[k] > b[k]; return false; };
  const walk = (worst, brand, same) => {
    const i = seq.length;
    if (i === N) { const sc = score(same, brand, worst); if (!best || better(sc, best.score)) best = { seq: [...seq], worst, brand, same, score: sc }; return; }
    const left = N - i, brandLeft = uniq.filter(h => !used.has(h) && isBrand(h)).length;
    if (best && !better(score(same + (prefer ? left : 0), brand + Math.min(left, brandLeft), worst), best.score) && !(same + (prefer ? left : 0) === best.same && brand + Math.min(left, brandLeft) === best.brand && worst > best.worst)) return;
    for (const h of hues ? [hues[i - 1]] : uniq) {
      if (used.has(h)) continue;
      for (const cand of byHue.get(h)) {
        const prev = seq[i - 1].c, adj = cvd(prev, cand.c);
        if (adj < CVD || deltaE(prev, cand.c) < NORMAL) continue;
        if (i <= 2 && seq.slice(0, i).some(s => cvd(s.c, cand.c) < CVD || deltaE(s.c, cand.c) < NORMAL)) continue;   // series 1-3 all pairs
        if (seq.some(s => deltaE(s.c, cand.c) < ALL_PAIRS)) continue;
        seq.push({ ...cand, H: h }); used.add(h);
        walk(Math.min(worst, adj), brand + (isBrand(h) ? 1 : 0), same + (prefer && hueGap(prefer[i - 1], h) < 1 ? 1 : 0));
        seq.pop(); used.delete(h);
      }
    }
  };
  walk(Infinity, 0, 0);
  return best && { ...best, width, C1 };
}
function ladder(ctx, s1, hues, prefer) { for (let w = 0.01; w <= MAX_WIDTH + 1e-9; w = r2(w + 0.01)) { const b = search(ctx, s1, w, hues, prefer); if (b) return b; } return null; }

function report(ctx, b, note) {
  const cs = b.seq.map(s => s.c), pairs = [];
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) pairs.push([i, j]);
  const worst = (list, f) => list.reduce((w, [i, j]) => { const v = f(cs[i], cs[j]); return v < w.v ? { v, pair: `${i + 1}-${j + 1}` } : w; }, { v: Infinity });
  const adjacent = pairs.filter(([i, j]) => j === i + 1), top = pairs.filter(([, j]) => j < 3);
  const f1 = x => Math.floor(x * 10) / 10;
  return { mode: ctx.mode, band: ctx.band, chroma_band: `${r2(Math.max(FLOOR, b.C1 - b.width)).toFixed(2)}-${r2(b.C1 + b.width).toFixed(2)}`, width: b.width, note,
    series: b.seq.map((s, i) => ({ slot: i + 1, hex: hex(s.c), L: +s.L.toFixed(3), C: +s.C.toFixed(3), H: Math.round(lch(s.c).H), brand_hue: i > 0 && BRAND_HUES.some(h => hueGap(h, s.H) < 1) })),
    worst_adjacent: { cvd: f1(worst(adjacent, cvd).v), cvd_pair: worst(adjacent, cvd).pair, normal: f1(worst(adjacent, deltaE).v), normal_pair: worst(adjacent, deltaE).pair },
    worst_pairs_1_3: { cvd: f1(worst(top, cvd).v), cvd_pair: worst(top, cvd).pair, normal: f1(worst(top, deltaE).v), normal_pair: worst(top, deltaE).pair },
    worst_pairs_all: { cvd: f1(worst(pairs, cvd).v), cvd_pair: worst(pairs, cvd).pair, normal: f1(worst(pairs, deltaE).v), normal_pair: worst(pairs, deltaE).pair } };
}

const out = { monochrome: MONOCHROME, brand_hues: BRAND_HUES.map(Math.round), modes: [] };
let lightHues = null, failed = false;
for (const mode of MODES) {
  const ctx = context(mode), s1 = series1(ctx);
  let b = null, note = `series 1: ${s1.rule}`;
  if (lightHues) { b = ladder(ctx, s1, lightHues); if (b) note += '; slots 2-6 keep the light hues'; }
  if (!b) { b = ladder(ctx, s1, null, lightHues); if (b && lightHues) note += `; the light hues do not all pass here, ${b.same} of 5 slots keep them`; }
  if (!b) { failed = true; out.modes.push({ mode, band: ctx.band, series1: hex(s1.c), note: `${note}; no set passes up to chroma ±${MAX_WIDTH}: record the gap in DESIGN.md and ask the user` }); continue; }
  if (mode === 'light') lightHues = b.seq.slice(1).map(s => s.H);
  out.modes.push(report(ctx, b, note));
}
if (argv.includes('--json')) console.log(JSON.stringify(out, null, 2));
else for (const m of out.modes) {
  console.log(`${m.mode} (${m.band} band)${m.series ? `, chroma ${m.chroma_band}` : ''}: ${m.note}`);
  if (!m.series) continue;
  for (const s of m.series) console.log(`  ${s.slot}  ${s.hex}  L ${s.L.toFixed(2)}  C ${s.C.toFixed(2)}  H ${s.H}${s.brand_hue ? '  brand hue' : ''}`);
  const w = k => `CVD dE ${m[k].cvd} (${m[k].cvd_pair}), normal dE ${m[k].normal} (${m[k].normal_pair})`;
  console.log(`  adjacent ${w('worst_adjacent')}; series 1-3 ${w('worst_pairs_1_3')}; all pairs ${w('worst_pairs_all')}`);
}
process.exit(failed ? 1 : 0);
