#!/usr/bin/env node
// 样例页验收（references/specimen-spec.md §5 与 §8）：在无头 Chromium 里打开 render-specimen.mjs 的输出，
// 390 与 1440 两个宽度 × 每个模式按节截图，并检查 C1–C4、C7–C9 能机械判定的部分。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const USAGE = `Usage: NODE_PATH=$(npm root -g) node <visual-system>/scripts/specimen/check-specimen.mjs BRAND_DIR [--config FILE] [--out DIR] [--dpr N]
Opens the page written by render-specimen.mjs (the config's "out") in Playwright's headless Chromium (no channel; one
browser for the whole run) and writes DIR/specimen-check.json plus per-section screenshots <section>-<width>-<mode>[-n].png
(DIR defaults to the config's "qa", else qa/specimen; N is the device pixel ratio, default 1). Needs a global Playwright (npm i -g playwright) and
npx playwright install --only-shell chromium. Exit code 0 pass, 1 fail, 2 usage or no browser.`;
const argv = process.argv.slice(2);
if (!argv.length || argv[0].startsWith('--')) { console.log(USAGE); process.exit(argv.includes('--help') ? 0 : 2); }
const opt = (name, d) => { const i = argv.indexOf(name); return i < 0 ? d : argv[i + 1]; };
const ROOT = path.resolve(argv[0]);
const CFG_PATH = path.resolve(ROOT, opt('--config', 'specimen.json'));
const cfg = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'));
const OUT_HTML = cfg.out ?? 'examples/specimen.html';
const QA = opt('--out', cfg.qa ?? 'qa/specimen');
const TOK = cfg.tokens ?? '.';
const DPR = Number(opt('--dpr', 1));
const at = rel => path.resolve(ROOT, rel);
let chromium;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch { console.error('check-specimen: Playwright not found; install it globally and run with NODE_PATH=$(npm root -g)'); process.exit(2); }

const SRC = JSON.parse(fs.readFileSync(at(path.join(TOK, 'tokens.json'))));
// same mode layout as render-specimen.mjs: the default mode is tokens.resolved.json
const BASE = SRC.meta?.defaultMode ?? 'light';
const R = { [BASE]: JSON.parse(fs.readFileSync(at(path.join(TOK, 'tokens.resolved.json')))) };
const modeFile = m => path.join(TOK, `tokens.resolved.${m}.json`);
for (const m of ['light', 'dark']) if (m !== BASE && fs.existsSync(at(modeFile(m)))) R[m] = JSON.parse(fs.readFileSync(at(modeFile(m))));
const ROLES = SRC.meta?.roles ?? {};
const leaf = (mode, p) => p.split('.').reduce((n, k) => n?.[k], R[mode])?.$value;
const rgb = hex => { const h = hex.replace('#', ''); const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1; return a === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${+a.toFixed(3)})`; };
const sameColor = (css, hex) => { const want = rgb(hex); if (css === want) return true; const n = s => s.match(/[\d.]+/g)?.map(Number) ?? []; const a = n(css), b = n(want); return a.length >= 3 && a.slice(0, 3).every((x, i) => Math.abs(x - b[i]) <= 1) && Math.abs((a[3] ?? 1) - (b[3] ?? 1)) < 0.01; };
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const relOut = f => path.relative(ROOT, f).split(path.sep).join('/');
const INPUTS = [OUT_HTML, path.join(path.dirname(OUT_HTML), 'specimen-doc.css'), path.join(TOK, 'tokens.css'), path.join(TOK, 'tokens.resolved.json'), ...Object.keys(R).filter(m => m !== BASE).map(modeFile), cfg.stateLayer, cfg.fonts, path.relative(ROOT, CFG_PATH)].filter(Boolean).map(p => path.normalize(p).split(path.sep).join('/'));

// C1 / C8 over the sample layer: the <style id="sample-layer"> block, plus inline styles on sample elements (read in the
// browser below). Inline styles on cards, stages and captions are document layout and are not checked.
const html = fs.readFileSync(at(OUT_HTML), 'utf8');
const sampleCss = html.match(/<style id="sample-layer">([\s\S]*?)<\/style>/)?.[1] ?? '';
const SAMPLE_EL = '.phone *, .samples > *, .states > div > *, main :is(.btn, .field, .notice, .toast, .menu, .menu .row, .tag, .badge, .list, .glist, .seg, .switch, .check, .radio, .tabbar, .tabs, .sheet, .item-card, .h1, .h2, .h3, .body, .label, .cap-t, .strong, .link, .opt, .inline-sample, .material-sample)';
const decls = text => [...text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([a-z-]+)\s*:\s*([^;{}]+)/gi)].map(m => [m[1].toLowerCase(), m[2].trim()]);
const C1_PROPS = /^(color|background|background-color|border(-(top|right|bottom|left))?-color|font-size|line-height|letter-spacing|font-weight|gap|row-gap|column-gap|padding(-[a-z-]+)?|margin(-[a-z-]+)?|border(-[a-z]+)*-radius|box-shadow|transition-duration|transition-timing-function)$/;
const C1_OK = /^(0|0px|auto|none|inherit|initial|unset|normal|transparent|currentcolor|100%|50%|-?\d+(\.\d+)?%? *)$/i;
const literal = (p, v) => C1_PROPS.test(p) && !/var\(|env\(/.test(v) && !C1_OK.test(v);
const c1 = [], c8 = [];
const scan = (where, text) => {
  for (const [p, v] of decls(text)) {
    if (literal(p, v)) c1.push(`${where}: ${p}: ${v}`);
    const prop = p.replace(/^-(webkit|moz|ms)-/, '');
    for (const item of SRC.meta?.notUsed ?? []) { const c = item.css; if (c && ((c.property && prop === c.property.toLowerCase() && (!c.valuePattern || new RegExp(c.valuePattern, 'i').test(v))) || (!c.property && c.valuePattern && new RegExp(c.valuePattern, 'i').test(v)))) c8.push(`${item.id} · ${where}: ${p}: ${v}`); }
  }
};
scan('sample-layer', sampleCss.replace(/^\s*(:root, \[data-theme\]|\[data-theme="\w+"\]) \{[\s\S]*?\n\}/gm, ''));

fs.mkdirSync(at(QA), { recursive: true });
// only this check's own files: the directory may hold other evidence
const OWN = f => /-(390|1440)-[a-z-]+(-\d+)?\.png$/.test(f) || f === 'specimen-check.json';
for (const f of fs.readdirSync(at(QA)).filter(OWN)) fs.rmSync(at(path.join(QA, f)));
const failures = [];
const expect = (ok, what) => { if (!ok) failures.push(what); };

let browser;
try { browser = await chromium.launch(); } catch (e) { console.error(`check-specimen: cannot start headless Chromium (${e.message.split('\n')[0]})`); process.exit(2); }
const result = { schema_version: 1, tool: 'visual-system scripts/specimen/check-specimen.mjs', browser: `Chromium ${browser.version()}`, platform: process.platform, dpr: DPR,
  inputs: Object.fromEntries(INPUTS.map(f => [f, sha(at(f))])), static: { c1, c8 }, runs: [], outputs: {} };
const URL = pathToFileURL(at(OUT_HTML)).href;
const after = (page, sel) => page.$eval(sel, e => getComputedStyle(e, '::after').opacity);
const modes = Object.keys(R);
try {
  for (const [width, height] of [[1440, 900], [390, 844]]) for (const mode of modes) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: DPR, colorScheme: 'light' });
    const page = await ctx.newPage(); const logs = [];
    page.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(`${m.type()}: ${m.text()}`); });
    page.on('pageerror', e => logs.push(`pageerror: ${e.message}`));
    page.on('requestfailed', r => logs.push(`requestfailed: ${r.url().replace(pathToFileURL(ROOT).href, '')}`));
    await page.goto(URL + (mode === BASE ? '' : `?mode=${mode}`));
    await page.evaluate(() => document.fonts.ready);
    await page.$$eval('img[loading="lazy"]', imgs => imgs.forEach(i => { i.loading = 'eager'; }));
    await page.waitForFunction(() => [...document.images].every(i => i.complete), null, { timeout: 15000 });
    const tag = `${width}-${mode}`, run = { width, mode };
    if (!result.runs.length) for (const [i, st] of (await page.$$eval(SAMPLE_EL, els => [...new Set(els.filter(e => e.hasAttribute('style')))].map(e => `${e.tagName.toLowerCase()}.${[...e.classList].join('.')}|${e.getAttribute('style')}`))).entries()) { const [who, css] = st.split('|'); scan(`inline ${who} #${i}`, css); }
    // C7: one screenshot per section, before any interaction leaves hover or focus behind; animations stopped so PNGs are reproducible
    const boxes = await page.$$eval('#top, main > section[id]', els => els.map(e => { const r = e.getBoundingClientRect(); return { id: e.id, y: Math.round(r.top + scrollY), h: Math.round(r.height) }; }));
    run.sections = boxes.map(b => `${b.id}:${b.h}`);
    for (const b of boxes) for (let y = 0, i = 1; y < b.h; y += 8000, i++)
      await page.screenshot({ path: at(path.join(QA, `${b.id}-${tag}${b.h > 8000 ? `-${i}` : ''}.png`)), fullPage: true, animations: 'disabled', clip: { x: 0, y: b.y + y, width, height: Math.min(8000, b.h - y) } });
    run.overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(run.overflow <= 0, `${tag}: page overflows horizontally by ${run.overflow}px`);
    run.wideElements = await page.evaluate(() => [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.right > document.documentElement.clientWidth + 1 && !e.closest('.hscroll, .code'); }).slice(0, 5).map(e => `${e.tagName}.${e.className}`));
    expect(run.wideElements.length === 0, `${tag}: elements past the right edge ${run.wideElements}`);
    run.brokenImages = await page.$$eval('img', imgs => imgs.filter(i => !i.naturalWidth).map(i => i.getAttribute('src')));
    expect(run.brokenImages.length === 0, `${tag}: images not loaded ${run.brokenImages}`);
    run.emptyLabels = await page.$$eval('[data-var], [data-type]', els => els.filter(e => !e.textContent.trim()).map(e => e.dataset.var || e.dataset.type));
    expect(run.emptyLabels.length === 0, `${tag}: empty value labels ${run.emptyLabels}`);
    // C2 / C4: every swatch bound to a token shows that token's value in this mode
    run.swatches = await page.$$eval('[data-token]', els => els.map(e => [e.dataset.token, getComputedStyle(e).backgroundColor]));
    for (const [p, c] of run.swatches) { const v = leaf(mode, p); expect(v && sameColor(c, v), `${tag}: swatch ${p} is ${c}, token is ${v}`); }
    const roleChecks = { 'surface.default': ['body', 'backgroundColor'], 'text.primary': ['body', 'color'], accent: ['#buttons .states .btn-primary', 'backgroundColor'], onAccent: ['#buttons .states .btn-primary', 'color'], selection: ['#navs .list button[aria-pressed="true"]', 'backgroundColor'] };
    run.roles = {};
    for (const [k, [sel, prop]] of Object.entries(roleChecks)) { if (typeof ROLES[k] !== 'string') continue; const c = await page.$eval(sel, (e, p) => getComputedStyle(e)[p], prop); run.roles[k] = c; expect(sameColor(c, leaf(mode, ROLES[k])), `${tag}: ${k} on ${sel} is ${c}, token ${ROLES[k]} is ${leaf(mode, ROLES[k])}`); }
    // §5.2: interface type samples against the resolved tokens, per language
    run.type = await page.$$eval('#type .sample[lang]', ps => ps.map(p => { const s = getComputedStyle(p); return { cls: [...p.classList].find(c => /^td?-/.test(c)), lang: p.lang, size: s.fontSize, lineHeight: s.lineHeight, weight: s.fontWeight, tracking: s.letterSpacing, family: s.fontFamily }; }));
    for (const t of run.type) {
      if (!t.cls) continue;
      const base = t.cls.startsWith('td-') ? 'semantic.typographyDisplay' : 'semantic.typography';
      const key = t.cls.replace(/^td?-/, '').replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
      const node = `${base}.${key}`.split('.').reduce((n, k) => n?.[k], R[mode]);
      if (!node) { failures.push(`${tag}: type sample ${t.cls} has no token ${base}.${key}`); continue; }
      const v = { ...node.$value, ...(t.lang.startsWith('zh') ? node.$extensions?.['com.design-extract']?.langOverrides?.zh : {}) };
      const lh = parseFloat(t.lineHeight), size = parseFloat(t.size);
      expect(Math.abs(size - v.fontSize) < 0.1 && String(v.fontWeight) === t.weight && Math.abs(lh - v.fontSize * v.lineHeight) < 0.6 && Math.abs((parseFloat(t.tracking) || 0) - (v.letterSpacing ?? 0)) < 0.05,
        `${tag}: ${t.cls} ${t.lang} computed ${t.size} / ${t.lineHeight} / ${t.weight} / ${t.tracking}, token ${v.fontSize} / ${v.lineHeight} / ${v.fontWeight} / ${v.letterSpacing}`);
      expect(t.family.split(',')[0].replace(/"/g, '').trim() === v.fontFamily[0], `${tag}: ${t.cls} ${t.lang} font-family ${t.family}, token starts with ${v.fontFamily[0]}`);
    }
    if (width === 1440) {
      // C3: real hover / press / keyboard focus against the forced state classes
      const sel = '#buttons .states .btn-primary';
      const forced = { hover: await after(page, `${sel}.is-hover`), focus: await after(page, `${sel}.is-focus`), pressed: await after(page, `${sel}.is-pressed`) };
      const btn = page.locator(sel).first(); await btn.scrollIntoViewIfNeeded(); await btn.hover(); await page.waitForTimeout(400);
      const hover = await after(page, sel); await page.mouse.down(); await page.waitForTimeout(400);
      const pressed = await after(page, sel); await page.mouse.up(); await page.mouse.move(0, 0); await page.waitForTimeout(400);
      await page.focus(sel); await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab'); await page.waitForTimeout(400);
      const focus = await page.evaluate(() => { const e = document.activeElement, s = getComputedStyle(e); return { after: getComputedStyle(e, '::after').opacity, outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}` }; });
      const forcedOutline = await page.$eval(`${sel}.is-focus`, e => { const s = getComputedStyle(e); return `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`; });
      const disabled = await page.$eval(`${sel}[disabled]`, e => ({ opacity: getComputedStyle(e).opacity, after: getComputedStyle(e, '::after').opacity }));
      const dragged = await after(page, '#states .is-dragged');
      run.states = { forced, hover, pressed, focus, forcedOutline, disabled, dragged };
      const st = k => String(leaf(mode, ROLES[`state.${k}`] ?? `semantic.state.${k}.opacity`));
      expect(hover === forced.hover && hover === st('hover'), `${tag}: real hover ${hover} vs forced ${forced.hover}, token ${st('hover')}`);
      expect(pressed === forced.pressed && pressed === st('pressed'), `${tag}: real pressed ${pressed} vs forced ${forced.pressed}, token ${st('pressed')}`);
      expect(focus.after === forced.focus && focus.outline === forcedOutline && focus.outline.startsWith('solid'), `${tag}: keyboard focus ${JSON.stringify(focus)} vs forced ${forcedOutline}`);
      if (typeof ROLES['focusRing.color'] === 'string') expect(sameColor(focus.outline.replace(/^solid [\d.]+px /, ''), leaf(mode, ROLES['focusRing.color'])), `${tag}: focus ring colour ${focus.outline}`);
      expect(disabled.opacity === st('disabled') && disabled.after === '0', `${tag}: disabled ${JSON.stringify(disabled)}`);
      expect(dragged === st('dragged'), `${tag}: dragged ${dragged}`);
      await page.click('#f1'); await page.waitForTimeout(400);
      run.fieldFocus = await page.$eval('#f1', i => { const s = getComputedStyle(i.parentElement); return { outline: `${s.outlineStyle} ${s.outlineWidth}`, after: getComputedStyle(i.parentElement, '::after').opacity }; });
      expect(run.fieldFocus.after === '0' && run.fieldFocus.outline.startsWith('solid'), `${tag}: focused field ${JSON.stringify(run.fieldFocus)}`);
      run.fieldDisabledOpacity = await page.$eval('#f4', i => getComputedStyle(i.parentElement).opacity);
      expect(run.fieldDisabledOpacity === st('disabled'), `${tag}: disabled field opacity ${run.fieldDisabledOpacity}`);
      const submit = page.locator('[data-demo="submit"]'); const label0 = (await submit.textContent()).trim(); await submit.click();
      run.pending = await submit.evaluate(b => ({ aria: b.getAttribute('aria-disabled'), label: b.textContent.trim(), spinning: !!b.querySelector('.spin') && !b.querySelector('.spin').hidden }));
      expect(run.pending.aria === 'true' && run.pending.label === '提交中', `${tag}: pending state ${JSON.stringify(run.pending)}`);
      await page.waitForTimeout(1800);
      run.restored = await submit.evaluate(b => ({ aria: b.getAttribute('aria-disabled'), label: b.textContent.trim() }));
      expect(run.restored.aria === null && run.restored.label === label0, `${tag}: after pending ${JSON.stringify(run.restored)}`);
      // keyboard order from the top: every stop shows an outline (a text input shows it on the .is-field wrapper)
      await page.evaluate(() => { document.activeElement.blur(); window.scrollTo(0, 0); }); await page.mouse.click(5, 300);
      run.tabOrder = [];
      for (let i = 0; i < 16; i++) {
        await page.keyboard.press('Tab');
        run.tabOrder.push(await page.evaluate(() => { const e = document.activeElement, s = getComputedStyle(e.closest('.is-field') || e); return `${e.tagName} ${(e.textContent || e.value || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 24)} | ${s.outlineStyle} ${s.outlineWidth}`; }));
      }
      expect(run.tabOrder.every(t => /\| solid \d/.test(t)), `${tag}: a tab stop has no visible outline`);
      run.icons = await page.$$eval('.icon-sizes svg', s => s.map(e => Math.round(e.getBoundingClientRect().width)));
      const iconSizes = Object.keys(R[mode].semantic?.icon?.size ?? {}).filter(k => !k.startsWith('$')).map(k => R[mode].semantic.icon.size[k].$value).sort((a, b) => a - b);
      expect(run.icons.join() === iconSizes.join(), `${tag}: icon sizes ${run.icons}, tokens ${iconSizes}`);
      // §4.17: WCAG 1.4.12 text spacing must not make a section overflow sideways; the 390 run stands in for 200 % zoom
      run.stress = await page.evaluate(() => {
        const st = document.createElement('style'); st.textContent = '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }';
        document.head.append(st);
        const bad = [...document.querySelectorAll('main > section')].filter(s => s.scrollWidth > s.clientWidth + 1).map(s => s.id);
        st.remove(); return bad;
      });
      expect(run.stress.length === 0, `${tag}: sections overflow under WCAG 1.4.12 text spacing: ${run.stress}`);
      // console is read before CDP: CSS.enable makes DevTools refetch the page itself, which file:// refuses
      run.logs = [...logs];
      const cdp = await ctx.newCDPSession(page); await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
      const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
      const fonts = async s => { const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: s }); return nodeId ? (await cdp.send('CSS.getPlatformFontsForNode', { nodeId })).fonts.map(f => `${f.familyName}${f.isCustomFont ? ' (web font)' : ''} x${f.glyphCount}`) : []; };
      run.platformFonts = {};
      for (const s of ['#type .sample.t-body[lang="en"]', '#type .sample.t-body[lang="zh-CN"]', '#type .sample.t-heading1[lang="zh-CN"]', '#type [class*="td-"]']) run.platformFonts[s] = await fonts(s);
      await cdp.detach();
    } else run.logs = [...logs];
    expect(run.logs.length === 0, `${tag}: console ${run.logs.join(' / ')}`);
    result.runs.push(run); await ctx.close();
  }
  // §5.1: forced colors and more contrast at 1440, default mode, the whole page
  for (const [name, media] of [['forced-colors', { forcedColors: 'active' }], ['contrast-more', { contrast: 'more' }]]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    try { await page.emulateMedia(media); } catch (e) { result[name] = `not run: ${e.message.split('\n')[0]}`; await ctx.close(); continue; }
    await page.goto(URL); await page.evaluate(() => document.fonts.ready);
    const full = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0, i = 1; y < full; y += 8000, i++) await page.screenshot({ path: at(path.join(QA, `page-1440-${name}-${i}.png`)), fullPage: true, animations: 'disabled', clip: { x: 0, y, width: 1440, height: Math.min(8000, full - y) } });
    result[name] = 'screenshots only; review them by eye';
    await ctx.close();
  }
} finally { await browser.close(); }
expect(c1.length === 0, `C1: literal values in the sample layer: ${c1.slice(0, 12).join(' | ')}${c1.length > 12 ? ` (+${c1.length - 12})` : ''}`);
expect(c8.length === 0, `C8: notUsed matches in the sample layer: ${c8.join(' | ')}`);
for (const f of fs.readdirSync(at(QA)).filter(f => OWN(f) && f.endsWith('.png')).sort()) result.outputs[`${relOut(at(QA))}/${f}`] = sha(at(path.join(QA, f)));
result.failures = failures; result.result = failures.length ? 'fail' : 'pass';
result.scope = 'Headless Chromium on this machine: sample-layer literal and notUsed scan, per-section screenshots at 390 and 1440 in every mode, swatch and role colours, type samples against the resolved tokens, states, keyboard focus, icon sizes, WCAG 1.4.12 text spacing and rendered fonts. Not a full accessibility audit; other platforms not covered; visual review is a separate step.';
fs.writeFileSync(at(path.join(QA, 'specimen-check.json')), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ result: result.result, failures, sections: result.runs[0]?.sections.length, screenshots: Object.keys(result.outputs).length }, null, 1));
process.exitCode = failures.length ? 1 : 0;
