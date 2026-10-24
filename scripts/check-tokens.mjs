#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { requireValue as assert, sha256, readJSON, report, capture, finish } from './lib/validation.mjs';
import { generate, GENERATED_RE, leafAt } from './lib/tokens.mjs';
import { parseColor, over, ratio, linearRGB, oklab, deltaE } from './lib/color.mjs';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(`Usage: node scripts/check-tokens.mjs DESIGN_SYSTEM_DIR [--lint FILE ...] [--out REPORT.json]
Mechanical checks for a profile-2 token set (see references/system.md#bd-token-001):
  1. regenerates every consumable with vendor/theme-extract (uv run python) in a temp copy and
     requires the delivered tokens.css / adapters / resolved snapshots / DESIGN.md frontmatter to
     match byte for byte, with no extra generated-looking files left over;
  2. contrast matrix per mode over meta.roles (alpha composited, unrounded comparison; state-layer
     rows painted as the browser paints them), plus
     every semantic.color.dataViz.series color against the four surfaces at 3:1;
  3. chart series distinctness per mode (DATAVIZ_DISTINCT): OKLCH lightness band and chroma floor,
     adjacent series and all pairs of series 1-3 under simulated protanopia/deuteranopia and under
     normal vision, every pair of the set under normal vision, and distance from the feedback colors (thresholds in the comment above the check);
  4. state-layer distinctness per mode (STATE_DISTINCT): on every surface that carries a state
     layer, painted as the browser paints it, default and hover are at least CIEDE2000 deltaE00 2
     apart and hover and pressed at least 3;
  5. meta.roles never declares a state.* or focusRing.* role missing;
  6. at full depth, dataViz is present with series 1..6 or notApplicable, never missing;
  7. meta.notUsed lint over the --lint CSS/HTML files.
Requires uv. No network. Does not prove visual quality, font loading or component behavior.`);
  process.exit(0);
}
const result = report('design-system tokens: generator freshness, per-mode role and chart-series contrast, chart-series distinctness, state-layer distinctness, state roles declared, dataViz coverage, notUsed lint');
const outIndex = args.indexOf('--out');
const lintIndex = args.indexOf('--lint');
const dirArg = args[0];
const lintFiles = lintIndex < 0 ? [] : args.slice(lintIndex + 1, outIndex > lintIndex ? outIndex : undefined);
capture(result, 'arguments', () => {
  assert(dirArg && !dirArg.startsWith('--'), 'ARGUMENT', 'First argument must be the design-system directory');
  assert(outIndex < 0 || (args[outIndex + 1] && !args[outIndex + 1].startsWith('--')), 'ARGUMENT', '--out requires a file path');
  assert(lintIndex < 0 || lintFiles.length > 0, 'ARGUMENT', '--lint requires at least one file');
});
const dir = path.resolve(dirArg || '.');
let tree;
capture(result, 'tokens.json', () => {
  assert(fs.existsSync(path.join(dir, 'tokens.json')), 'FILE_MISSING', `Missing tokens.json in ${dir}`);
  tree = readJSON(path.join(dir, 'tokens.json'));
  result.tokens_sha256 = sha256(path.join(dir, 'tokens.json'));
  const cats = tree.meta?.categories;
  result.depth = cats ? 'full' : 'minimal';
  if (cats) result.categories = Object.fromEntries(Object.entries(cats).map(([k, v]) => [k, v?.status]));
  else result.warnings.push('No meta.categories: minimal handoff depth, category coverage not declared.');
});
if (result.errors.length) { finish(result); process.exit(1); }

// 1. Freshness: the generator is the only author of consumables.
const frontmatter = source => (source.match(/^---\n[\s\S]*?\n---\n?/) || [''])[0];
let scratch;
capture(result, 'generator', () => {
  const run = generate(dir);
  scratch = run.scratch;
  for (const line of run.stderr.split('\n')) if (line.startsWith('WARN')) result.warnings.push(line);
  const generated = fs.readdirSync(scratch).filter(name => GENERATED_RE.test(name));
  for (const name of fs.readdirSync(dir)) if (GENERATED_RE.test(name) && !generated.includes(name)) {
    result.errors.push({ context: 'generator', code: 'GENERATED_UNEXPECTED', message: `${name} is not produced by the current tokens (left over from a removed mode?); delete it` });
    result.result = 'FAIL';
  }
  for (const name of [...generated, 'DESIGN.md']) {
    const delivered = path.join(dir, name);
    if (!fs.existsSync(delivered)) {
      result.errors.push({ context: 'generator', code: 'GENERATED_MISSING', message: `Missing generated file ${name}; run the generator (see BD-TOKEN-001)` });
      result.result = 'FAIL'; continue;
    }
    const want = fs.readFileSync(path.join(scratch, name), 'utf8');
    const have = fs.readFileSync(delivered, 'utf8');
    if (name === 'DESIGN.md' ? frontmatter(want) !== frontmatter(have) : want !== have) {
      result.errors.push({ context: 'generator', code: 'GENERATED_STALE', message: `${name} differs from the generator output; edit tokens.json and regenerate, never the output` });
      result.result = 'FAIL';
    }
  }
  result.counts.generated_files = generated.length + 1;
});

// 2. Contrast matrix per mode, from snapshots regenerated from the current tokens.
// A state layer as Chromium paints it (8-bit source-over, opacity stored as round(alpha * 255));
// see the state-distinctness note below.
const paint8 = (layer, surface, alpha) => {
  const A = Math.round(alpha * 255);
  const channel = key => Math.min(255, Math.round(layer[key] * A / 255) + ((surface[key] * (256 - A)) >> 8));
  return { r: channel('r'), g: channel('g'), b: channel('b'), a: 1 };
};
const round8 = c => ({ r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b), a: 1 });
const SURFACES = ['surface.sunken', 'surface.default', 'surface.raised', 'surface.overlay'];
const PAIRS = [
  ...['text.primary', 'text.secondary', 'text.tertiary', 'accent', 'feedback.success', 'feedback.warning', 'feedback.error']
    .flatMap(fg => SURFACES.map(bg => [fg, bg, 4.5])),
  ...['text.primary', 'text.secondary', 'text.tertiary'].map(fg => [fg, 'selection', 4.5]),
  ['onAccent', 'accent', 4.5],
  ...SURFACES.map(bg => ['focusRing.color', bg, 3]),
  ...SURFACES.map(bg => ['divider', bg, null])
];
// Text on an interactive fill keeps 4.5:1 after the state layer (an overlay of the
// text's own color, i.e. currentColor, at the state opacity) is composited as the browser
// paints it (paint8). Controls
// (filled and text buttons, links) take hover/focus/pressed; dragged applies to
// draggable rows and cards, i.e. body text on surfaces. The primary button pair is
// enforced at every depth; the others describe the specimen's full component set
// (plain buttons, draggable rows) and are enforced at full depth, advisory otherwise.
const CONTROL = ['state.hover', 'state.focus', 'state.pressed'];
const STATE_PAIRS = [
  ['onAccent', 'accent', CONTROL], ['accent', 'surface.default', CONTROL], ['accent', 'surface.raised', CONTROL],
  ['text.primary', 'surface.default', [...CONTROL, 'state.dragged']], ['text.primary', 'surface.raised', [...CONTROL, 'state.dragged']]
];
if (scratch) capture(result, 'contrast', () => {
  const roles = tree.meta?.roles;
  assert(roles, 'ROLES_MISSING', 'meta.roles is required at every depth; map unused roles to {status, reason} (BD-TOKEN-001)');
  const modes = {};
  const skipped = new Set();
  let failures = 0;
  for (const file of fs.readdirSync(scratch).filter(name => /^tokens\.resolved(\.[\w-]+)?\.json$/.test(name)).sort()) {
    const resolved = readJSON(path.join(scratch, file));
    const mode = resolved.meta?.resolvedMode || tree.meta?.defaultMode || 'base';
    const color = role => {
      const target = roles[role];
      if (typeof target !== 'string') { skipped.add(`${role}: ${target?.status || 'undeclared'}`); return null; }
      const parsed = parseColor(leafAt(resolved, target)?.$value);
      assert(parsed, 'COLOR_FORMAT', `${mode}: role ${role} (${target}) is not a hex/rgb color the checker can compute`);
      return parsed;
    };
    const base = color('surface.default');
    assert(!base || base.a === 1, 'SURFACE_ALPHA', `${mode}: surface.default must be opaque to composite other layers`);
    const pairs = [];
    for (const [fgRole, bgRole, threshold] of PAIRS) {
      const fg = color(fgRole), bgRaw = color(bgRole);
      if (!fg || !bgRaw || !base) continue;
      const bg = bgRaw.a < 1 ? over(bgRaw, base) : bgRaw;
      const exact = ratio(fg.a < 1 ? over(fg, bg) : fg, bg);
      const pass = threshold === null ? null : exact >= threshold;
      if (pass === false) failures++;
      pairs.push({ fg: fgRole, bg: bgRole, ratio: Math.floor(exact * 100) / 100, threshold, pass });
    }
    for (const [fgRole, bgRole, states] of STATE_PAIRS) for (const state of states) {
      const strict = fgRole === 'onAccent' || result.depth === 'full';
      const target = roles[state];
      if (typeof target !== 'string') continue;
      const alpha = leafAt(resolved, target)?.$value;
      const fg = color(fgRole), bgRaw = color(bgRole);
      if (!fg || !bgRaw || !base || typeof alpha !== 'number') continue;
      const bg = round8(bgRaw.a < 1 ? over(bgRaw, base) : bgRaw);
      const text = round8(fg.a < 1 ? over(fg, bg) : fg);
      const exact = ratio(text, paint8(text, bg, alpha));
      const pass = exact >= 4.5;
      const row = { fg: fgRole, bg: `${bgRole}+${state.slice(6)}`, ratio: Math.floor(exact * 100) / 100, threshold: 4.5, pass };
      if (!strict) row.advisory = true;
      if (!pass && strict) failures++;
      if (!pass && !strict) result.warnings.push(`advisory (minimal depth): ${mode}: ${fgRole} on ${row.bg} = ${row.ratio}:1 < 4.5:1`);
      pairs.push(row);
    }
    // Chart series are graphical objects: 3:1 against every surface layer (WCAG 1.4.11).
    const series = leafAt(resolved, 'semantic.color.dataViz.series') || {};
    for (const key of Object.keys(series).filter(key => !key.startsWith('$'))) {
      const fg = parseColor(series[key]?.$value);
      assert(fg, 'COLOR_FORMAT', `${mode}: dataViz.series.${key} is not a hex/rgb color the checker can compute`);
      for (const bgRole of SURFACES) {
        const bgRaw = color(bgRole);
        if (!bgRaw || !base) continue;
        const bg = bgRaw.a < 1 ? over(bgRaw, base) : bgRaw;
        const exact = ratio(fg.a < 1 ? over(fg, bg) : fg, bg);
        if (exact < 3) failures++;
        pairs.push({ fg: `dataViz.series.${key}`, bg: bgRole, ratio: Math.floor(exact * 100) / 100, threshold: 3, pass: exact >= 3 });
      }
    }
    modes[mode] = { file, pairs };
  }
  result.contrast = { modes, skipped: [...skipped].sort(), failures };
  result.counts.contrast_pairs = Object.values(modes).reduce((n, m) => n + m.pairs.length, 0);
  for (const [mode, data] of Object.entries(modes)) for (const p of data.pairs) {
    if (p.pass === false && !p.advisory) result.errors.push({ context: 'contrast', code: p.fg.startsWith('dataViz.') ? 'DATAVIZ_CONTRAST' : 'CONTRAST_FAIL', message: `${mode}: ${p.fg} on ${p.bg} = ${p.ratio}:1 < ${p.threshold}:1` });
  }
  if (failures) result.result = 'FAIL';
});

// Chart series distinctness per mode (DATAVIZ_DISTINCT; tokens-schema.md §6.3 "Series
// distinctness"). Thresholds and the color-vision model are those of the categorical-palette
// validator in Claude Code's bundled dataviz skill (scripts/validate_palette.js, checks 2-4b):
//   - OKLCH lightness band: light 0.43-0.77, dark 0.48-0.67. The dark band applies when the
//     mode's surface.default has OKLab L < 0.5, so mode names do not matter;
//   - OKLCH chroma >= 0.10 (below it a hue reads as gray);
//   - adjacent series n and n+1, protanopia and deuteranopia simulated with Machado, Oliveira &
//     Fernandes (2009) at severity 1.0, the smaller OKLab deltaE x100 of the two: >= 8 target;
//     6-8 is a warning (legal only with secondary encoding such as direct labels); < 6 fails;
//   - worst adjacent pair under normal vision: OKLab deltaE x100 >= 15;
//   - the pairs of series 1-3 (1/2, 1/3, 2/3) meet the same CVD and normal-vision requirements,
//     because scatter, bubble and small-multiple charts put any two series side by side and use
//     at most those three (tokens-schema.md §6.3);
//   - every pair of the full set under normal vision: OKLab deltaE x100 >= 8. tokens-schema §6.3
//     only reports this pair; visual-system (BD-TOKEN-001 step 8) gates it, because a search that
//     only checks adjacent pairs and 1-3 settles on near-identical colors in non-adjacent slots.
// The feedback floor reuses the normal-vision floor: every series color stays >= 15 from
// feedback.success / warning / error of the same mode, so a series never reads as a status.
// Contrast against the surfaces is DATAVIZ_CONTRAST above.
const BAND = { light: [0.43, 0.77], dark: [0.48, 0.67] };
const CHROMA_FLOOR = 0.10, CVD_TARGET = 8, CVD_FLOOR = 6, NORMAL_FLOOR = 15, FEEDBACK_FLOOR = 15, ALL_PAIRS_NORMAL_FLOOR = 8;
const round1 = x => Math.floor(x * 10) / 10;
if (scratch) capture(result, 'dataViz distinctness', () => {
  const roles = tree.meta?.roles || {};
  const modes = {};
  const fail = message => { result.errors.push({ context: 'dataViz', code: 'DATAVIZ_DISTINCT', message }); result.result = 'FAIL'; };
  for (const file of fs.readdirSync(scratch).filter(name => /^tokens\.resolved(\.[\w-]+)?\.json$/.test(name)).sort()) {
    const resolved = readJSON(path.join(scratch, file));
    const mode = resolved.meta?.resolvedMode || tree.meta?.defaultMode || 'base';
    const series = leafAt(resolved, 'semantic.color.dataViz.series') || {};
    const keys = Object.keys(series).filter(key => /^\d+$/.test(key)).sort((a, b) => a - b);
    if (!keys.length) continue;
    const roleColor = role => typeof roles[role] === 'string' ? parseColor(leafAt(resolved, roles[role])?.$value) : null;
    const base = roleColor('surface.default');
    const opaque = c => c.a < 1 && base ? over(c, base) : c;
    const colors = keys.map(key => {
      const parsed = parseColor(series[key]?.$value);
      assert(parsed, 'COLOR_FORMAT', `${mode}: dataViz.series.${key} is not a hex/rgb color the checker can compute`);
      return opaque(parsed);
    });
    const bandName = base && oklab(linearRGB(base))[0] < 0.5 ? 'dark' : 'light';
    const [lo, hi] = BAND[bandName];
    keys.forEach((key, i) => {
      const [L, a, b] = oklab(linearRGB(colors[i])), C = Math.hypot(a, b);
      if (L < lo || L > hi) fail(`${mode}: dataViz.series.${key} OKLCH L ${L.toFixed(3)} is outside the ${bandName} band ${lo}-${hi}`);
      if (C < CHROMA_FLOOR) fail(`${mode}: dataViz.series.${key} OKLCH C ${C.toFixed(3)} < ${CHROMA_FLOOR} (reads as gray)`);
    });
    let worstCvd = Infinity, worstNormal = Infinity, nearestFeedback = Infinity;
    for (let i = 0; i + 1 < keys.length; i++) {
      const pair = `dataViz.series.${keys[i]} / ${keys[i + 1]}`;
      const cvd = Math.min(deltaE(colors[i], colors[i + 1], 'protan'), deltaE(colors[i], colors[i + 1], 'deutan'));
      const normal = deltaE(colors[i], colors[i + 1]);
      worstCvd = Math.min(worstCvd, cvd); worstNormal = Math.min(worstNormal, normal);
      if (cvd < CVD_FLOOR) fail(`${mode}: ${pair} CVD deltaE ${round1(cvd)} < ${CVD_FLOOR}`);
      else if (cvd < CVD_TARGET) result.warnings.push(`${mode}: ${pair} CVD deltaE ${round1(cvd)} is in the ${CVD_FLOOR}-${CVD_TARGET} band: legal only when the dataViz $description and DESIGN.md require secondary encoding (direct labels, gaps or texture)`);
      if (normal < NORMAL_FLOOR) fail(`${mode}: ${pair} normal-vision deltaE ${round1(normal)} < ${NORMAL_FLOOR}`);
    }
    const pairWorst = indexes => {
      let worst = { cvd: Infinity, normal: Infinity };
      for (const i of indexes) for (const j of indexes) if (i < j) {
        const cvd = Math.min(deltaE(colors[i], colors[j], 'protan'), deltaE(colors[i], colors[j], 'deutan')), normal = deltaE(colors[i], colors[j]);
        if (cvd < worst.cvd) Object.assign(worst, { cvd, cvd_pair: `${keys[i]}-${keys[j]}` });
        if (normal < worst.normal) Object.assign(worst, { normal, normal_pair: `${keys[i]}-${keys[j]}` });
      }
      return worst;
    };
    const firstThree = keys.slice(0, 3).map((_, i) => i);
    for (const i of firstThree) for (const j of firstThree) if (j > i + 1) {
      const pair = `dataViz.series.${keys[i]} / ${keys[j]}`;
      const cvd = Math.min(deltaE(colors[i], colors[j], 'protan'), deltaE(colors[i], colors[j], 'deutan'));
      const normal = deltaE(colors[i], colors[j]);
      if (cvd < CVD_FLOOR) fail(`${mode}: ${pair} CVD deltaE ${round1(cvd)} < ${CVD_FLOOR} (series 1-3 are compared as all pairs)`);
      else if (cvd < CVD_TARGET) result.warnings.push(`${mode}: ${pair} CVD deltaE ${round1(cvd)} is in the ${CVD_FLOOR}-${CVD_TARGET} band: legal only when the dataViz $description and DESIGN.md require secondary encoding (direct labels, gaps or texture)`);
      if (normal < NORMAL_FLOOR) fail(`${mode}: ${pair} normal-vision deltaE ${round1(normal)} < ${NORMAL_FLOOR} (series 1-3 are compared as all pairs)`);
    }
    const top = pairWorst(firstThree), all = pairWorst(keys.map((_, i) => i));
    if (all.normal < ALL_PAIRS_NORMAL_FLOOR) fail(`${mode}: dataViz.series.${all.normal_pair.replace('-', ' / ')} normal-vision deltaE ${round1(all.normal)} < ${ALL_PAIRS_NORMAL_FLOOR} (every pair of the set)`);
    for (const role of ['feedback.success', 'feedback.warning', 'feedback.error']) {
      const feedback = roleColor(role);
      if (!feedback) continue;
      keys.forEach((key, i) => {
        const d = deltaE(colors[i], opaque(feedback));
        nearestFeedback = Math.min(nearestFeedback, d);
        if (d < FEEDBACK_FLOOR) fail(`${mode}: dataViz.series.${key} is deltaE ${round1(d)} from ${role} (< ${FEEDBACK_FLOOR}); a series must not read as a status color`);
      });
    }
    const worstOf = w => Number.isFinite(w.cvd) ? { cvd: round1(w.cvd), cvd_pair: w.cvd_pair, normal: round1(w.normal), normal_pair: w.normal_pair } : null;
    modes[mode] = { band: bandName, series: keys.length, worst_adjacent_cvd: round1(worstCvd), worst_adjacent_normal: round1(worstNormal),
      worst_pairs_1_3: worstOf(top), worst_pairs_all: worstOf(all), nearest_feedback: Number.isFinite(nearestFeedback) ? round1(nearestFeedback) : null };
  }
  result.dataviz_distinct = modes;
});

// State-layer distinctness (STATE_DISTINCT; BD-TOKEN-001 step 7). On every surface that carries a
// state layer (the STATE_PAIRS above: the layer is the text's own color, i.e. currentColor, over
// the fill), in every mode the default and hover paints stay at least deltaE00 2 apart and the
// hover and pressed paints at least deltaE00 3 apart.
//   - Paint as Chromium's 8-bit source-over does: the layer opacity is stored as
//     A = round(alpha * 255), the layer color is premultiplied and rounded to 8 bits, and the
//     surface is scaled by (256 - A) / 256 and truncated. This reproduces every pixel of 280 random
//     layer / surface / opacity triples drawn with the specimen spec's appendix A ::after layer in
//     chrome-headless-shell 156 (software raster, macOS arm64), e.g. white over #315BE8 at 0.04 and
//     0.11 -> (57, 97, 232) and (71, 109, 234). GPU raster can differ by 1 per channel.
//   - Then sRGB (IEC 61966-2-1) -> XYZ -> CIELAB with the D65 white.
//   - deltaE00 is CIEDE2000 (CIE 142-2001) as written out in Sharma, Wu & Dalal, "The CIEDE2000
//     color-difference formula: implementation notes, supplementary test data, and mathematical
//     observations", Color Research & Application 30(1), 2005; deltaE00() reproduces their test pairs.
//   - Hover -> pressed threshold 3 comes from this skill's regression judgments (Harness
//     evals/visual-system.md, REG-021): white text on a blue primary fill with hover/pressed at
//     deltaE00 3.40 was judged distinguishable side by side; 1.38-1.69 was judged indistinguishable.
//   - Default -> hover threshold 2 is a starting value awaiting the same side-by-side calibration.
//     Evidence so far (REG-018, 2026-10-22): white on #315BE8 with hover 0.04 paints at deltaE00
//     1.927 from the default fill and was judged nearly indistinguishable in a screenshot.
// The specimen spec's reference opacities are a starting point, not fixed values; each mode may
// point semantic.state.* at its own opacities. Strictness follows the overlay contrast rows: the
// primary button at every depth, the other surfaces at full depth, advisory at minimal depth.
const DE00_FLOOR = 3, HOVER_DE00_FLOOR = 2;
function cielab(c) {
  const [r, g, b] = linearRGB(c);
  const xyz = [0.4124564 * r + 0.3575761 * g + 0.1804375 * b, 0.2126729 * r + 0.7151522 * g + 0.0721750 * b, 0.0193339 * r + 0.1191920 * g + 0.9503041 * b];
  const [fx, fy, fz] = xyz.map((t, i) => t / [0.95047, 1, 1.08883][i]).map(t => t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
function deltaE00([L1, a1, b1], [L2, a2, b2]) {
  const rad = Math.PI / 180, pow7 = c => c ** 7 / (c ** 7 + 25 ** 7);
  const G = 0.5 * (1 - Math.sqrt(pow7((Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2)));
  const ap1 = (1 + G) * a1, ap2 = (1 + G) * a2, C1 = Math.hypot(ap1, b1), C2 = Math.hypot(ap2, b2);
  const hue = (b, a) => a === 0 && b === 0 ? 0 : (Math.atan2(b, a) / rad + 360) % 360;
  const h1 = hue(b1, ap1), h2 = hue(b2, ap2);
  let dh = 0, hMean = h1 + h2;
  if (C1 * C2 !== 0) {
    dh = h2 - h1 > 180 ? h2 - h1 - 360 : h2 - h1 < -180 ? h2 - h1 + 360 : h2 - h1;
    hMean = Math.abs(h1 - h2) <= 180 ? hMean / 2 : hMean < 360 ? (hMean + 360) / 2 : (hMean - 360) / 2;
  }
  const dL = L2 - L1, dC = C2 - C1, dH = 2 * Math.sqrt(C1 * C2) * Math.sin(dh * rad / 2);
  const LMean = (L1 + L2) / 2, CMean = (C1 + C2) / 2;
  const T = 1 - 0.17 * Math.cos((hMean - 30) * rad) + 0.24 * Math.cos(2 * hMean * rad) + 0.32 * Math.cos((3 * hMean + 6) * rad) - 0.20 * Math.cos((4 * hMean - 63) * rad);
  const SL = 1 + 0.015 * (LMean - 50) ** 2 / Math.sqrt(20 + (LMean - 50) ** 2), SC = 1 + 0.045 * CMean, SH = 1 + 0.015 * CMean * T;
  const RT = -Math.sin(2 * 30 * Math.exp(-(((hMean - 275) / 25) ** 2)) * rad) * 2 * Math.sqrt(pow7(CMean));
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}
if (scratch) capture(result, 'state distinctness', () => {
  const roles = tree.meta?.roles || {};
  const modes = {};
  for (const file of fs.readdirSync(scratch).filter(name => /^tokens\.resolved(\.[\w-]+)?\.json$/.test(name)).sort()) {
    const resolved = readJSON(path.join(scratch, file));
    const mode = resolved.meta?.resolvedMode || tree.meta?.defaultMode || 'base';
    const valueOf = role => typeof roles[role] === 'string' ? leafAt(resolved, roles[role])?.$value : undefined;
    const roleColor = role => parseColor(valueOf(role));
    const hover = valueOf('state.hover'), pressed = valueOf('state.pressed'), base = roleColor('surface.default');
    if (typeof hover !== 'number' || typeof pressed !== 'number' || !base) continue;
    const rows = [];
    for (const [fgRole, bgRole] of STATE_PAIRS) {
      const fg = roleColor(fgRole), bgRaw = roleColor(bgRole);
      if (!fg || !bgRaw) continue;
      const bg = round8(bgRaw.a < 1 ? over(bgRaw, base) : bgRaw);
      const layer = round8(fg.a < 1 ? over(fg, bg) : fg);
      const hoverPaint = cielab(paint8(layer, bg, hover));
      const firstStep = deltaE00(cielab(bg), hoverPaint), secondStep = deltaE00(hoverPaint, cielab(paint8(layer, bg, pressed)));
      const row = { fg: fgRole, bg: bgRole, hover, pressed,
        default_hover_deltaE00: Math.floor(firstStep * 100) / 100, default_hover_threshold: HOVER_DE00_FLOOR,
        deltaE00: Math.floor(secondStep * 100) / 100, threshold: DE00_FLOOR,
        pass: firstStep >= HOVER_DE00_FLOOR && secondStep >= DE00_FLOOR };
      const strict = fgRole === 'onAccent' || result.depth === 'full';
      if (!strict) row.advisory = true;
      const messages = [
        firstStep < HOVER_DE00_FLOOR && `${mode}: ${fgRole} state layer on ${bgRole}: default vs hover ${hover} is deltaE00 ${row.default_hover_deltaE00} < ${HOVER_DE00_FLOOR}`,
        secondStep < DE00_FLOOR && `${mode}: ${fgRole} state layer on ${bgRole}: hover ${hover} vs pressed ${pressed} is deltaE00 ${row.deltaE00} < ${DE00_FLOOR}`
      ].filter(Boolean);
      for (const message of messages) {
        if (strict) { result.errors.push({ context: 'state', code: 'STATE_DISTINCT', message: `${message}; adjust the per-mode opacities within 4.5:1, then derive an interaction color (BD-TOKEN-001 step 7)` }); result.result = 'FAIL'; }
        else result.warnings.push(`advisory (minimal depth): ${message}`);
      }
      rows.push(row);
    }
    modes[mode] = rows;
  }
  result.state_distinct = modes;
});

// State layers and focus rings follow platform conventions, so they are inferred or
// notApplicable, never missing (BD-TOKEN-001 step 3).
capture(result, 'state roles', () => {
  const missing = Object.entries(tree.meta?.roles || {}).filter(([role, target]) => /^(state|focusRing)\./.test(role) && target?.status === 'missing').map(([role]) => role);
  assert(!missing.length, 'STATE_ROLE_MISSING', `${missing.join(', ')} declared missing: map each role to a leaf with confidence inferred from the platform convention, or mark it notApplicable with a reason (BD-TOKEN-001 step 3)`);
});

// Full depth derives chart colors from the accent by default; only a product the
// user says has no charts is notApplicable (BD-TOKEN-001).
if (result.depth === 'full') capture(result, 'dataViz', () => {
  const status = tree.meta.categories.dataViz?.status;
  const series = leafAt(tree, 'semantic.color.dataViz.series') || {};
  assert(status !== 'missing', 'DATAVIZ_REQUIRED', 'meta.categories.dataViz is missing: derive the chart series from the accent, or mark notApplicable only when the user says the product has no charts');
  assert(status !== 'present' || [1, 2, 3, 4, 5, 6].every(n => series[n]?.$value !== undefined), 'DATAVIZ_REQUIRED', 'dataViz is present but semantic.color.dataViz.series lacks leaves 1..6');
});
if (scratch) fs.rmSync(scratch, { recursive: true, force: true });

// 3. notUsed lint over delivered CSS/HTML: every declaration at any nesting depth,
// custom properties included, vendor prefixes folded, patterns case-insensitive.
function declarations(css) {
  const out = [];
  const parts = css.replace(/\/\*[\s\S]*?\*\//g, '').split(/([{};])/);
  for (let i = 0; i < parts.length; i += 2) {
    if (parts[i + 1] === '{') continue; // selector or at-rule prelude
    const m = parts[i].match(/^\s*(--[\w-]+|-?[a-zA-Z][\w-]*)\s*:\s*([\s\S]+?)\s*$/);
    if (m) out.push([m[1].toLowerCase(), m[2]]);
  }
  return out;
}
capture(result, 'notUsed lint', () => {
  if (!lintFiles.length) return;
  const rules = (tree.meta?.notUsed || []).filter(item => item.css);
  const patterns = new Map();
  for (const rule of rules) if (rule.css.valuePattern) {
    try { patterns.set(rule.id, new RegExp(rule.css.valuePattern, 'i')); }
    catch (error) { result.errors.push({ context: 'notUsed', code: 'NOT_USED_PATTERN', message: `${rule.id}: ${error.message}` }); result.result = 'FAIL'; }
  }
  const hits = [];
  for (const rel of lintFiles) {
    const file = path.resolve(rel);
    assert(fs.existsSync(file), 'FILE_MISSING', `Missing lint file: ${rel}`);
    let css = fs.readFileSync(file, 'utf8');
    if (/\.html?$/i.test(file)) css = [...css.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]).join('\n') + '\n'
      + [...css.matchAll(/\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map(m => `{${m[1] ?? m[2]}}`).join('\n');
    for (const [property, value] of declarations(css)) {
      const bare = property.replace(/^-(?:webkit|moz|ms|o)-/, '');
      for (const rule of rules) {
        const byProperty = rule.css.property && bare === rule.css.property.toLowerCase();
        const byValue = patterns.get(rule.id)?.test(value);
        if (byProperty || byValue) hits.push(`${rel}: ${rule.id} -> ${property}: ${value.slice(0, 80)}`);
      }
    }
  }
  result.counts.lint_files = lintFiles.length;
  for (const hit of hits) result.errors.push({ context: 'notUsed', code: 'NOT_USED', message: hit });
  if (hits.length) result.result = 'FAIL';
});

if (outIndex >= 0) fs.writeFileSync(path.resolve(args[outIndex + 1]), JSON.stringify(result, null, 2) + '\n');
finish(result);
