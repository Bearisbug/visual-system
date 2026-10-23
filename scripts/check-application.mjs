#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(`Usage: node scripts/check-application.mjs BUILD_DIR [--out EVIDENCE_DIR]
Measures the materials of one application-renderer build (libraries/applications/render.mjs) in a
headless Chromium-family browser over the DevTools protocol, with Node.js 22+'s built-in WebSocket
and no npm packages. One browser is started for all items and closed at the end.
  - inputs: build.json and every file it lists as output must still match their recorded SHA-256;
  - per text slot ([data-slot] title / body / kicker / footer): rendered line count against the
    layout's max_lines, the last line box bottom (Range.getClientRects) and content width against
    the slot box (scrollHeight is recorded for information), computed font size and
    line height, and the fonts the browser rendered (CSS.getPlatformFontsForNode); a slot with a
    layout must render when it has copy, and a hidden slot without copy is recorded, not measured;
  - the canvas is the page's <main> element; visible slot boxes (text, logo, graphic) must not intersect;
  - each item is exported as a 1x PNG of the canvas.
Writes EVIDENCE_DIR/application-check.json and EVIDENCE_DIR/<item>.png (default EVIDENCE_DIR is
BUILD_DIR/qa; a missing BUILD_DIR without --out only prints) and prints the evidence, which records
the checker's own SHA-256. build.json is never modified. A browser that exits mid-run, or a
DevTools request without a response within 30 s, ends the run with a BROWSER error.
Browser lookup: VISUAL_SYSTEM_BROWSER (an executable; when set, nothing else is tried), then
Playwright's chromium-headless-shell cache (PLAYWRIGHT_BROWSERS_PATH or the platform default),
then Google Chrome / Chromium, then Microsoft Edge. Without a browser the result is not_run.
Exit code 0 PASS, 1 FAIL, 2 not_run. Does not check contrast, copy quality or visual design.`);
  process.exit(0);
}

const SCOPE = 'application materials: rendered slot lines, overflow, slot intersections, rendered fonts and 1x PNG export';
const TEXT_SLOTS = ['title', 'body', 'kicker', 'footer'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const evidence = { schema_version: 1, generator: 'scripts/check-application.mjs', checker_sha256: sha(fs.readFileSync(fileURLToPath(import.meta.url))), scope: SCOPE, checked_at: new Date().toISOString(), result: 'PASS', browser: null, inputs: null, items: [], warnings: [], errors: [] };
const fail = (code, message) => { evidence.errors.push({ code, message }); evidence.result = 'FAIL'; };
const canonical = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);

const outIndex = args.indexOf('--out');
const buildArg = args[0];
if (!buildArg || buildArg.startsWith('--') || (outIndex >= 0 && (!args[outIndex + 1] || args[outIndex + 1].startsWith('--'))) || args.length !== (outIndex >= 0 ? 3 : 1)) {
  console.error('Usage: node scripts/check-application.mjs BUILD_DIR [--out EVIDENCE_DIR]');
  process.exit(1);
}
const buildDir = path.resolve(buildArg);
const outDir = path.resolve(outIndex >= 0 ? args[outIndex + 1] : path.join(buildDir, 'qa'));

// Inputs: the measured pages are exactly the renderer's recorded outputs.
let build = null;
try {
  const bytes = fs.readFileSync(path.join(buildDir, 'build.json'));
  build = JSON.parse(bytes.toString('utf8'));
  const { integrity, ...unsigned } = build;
  if (!/^brand-application-renderer-/.test(build.generator || '') || !Array.isArray(build.items) || !Array.isArray(build.outputs)) throw new Error('build.json is not an application renderer manifest');
  if (integrity?.sha256 !== sha(canonical(unsigned))) throw new Error('build.json integrity digest does not match its content');
  const files = [];
  for (const record of build.outputs) {
    const file = path.join(buildDir, record.path);
    const actual = fs.existsSync(file) ? sha(fs.readFileSync(file)) : null;
    if (actual !== record.sha256) fail('BUILD_MODIFIED', `${record.path} ${actual ? 'changed' : 'is missing'} since the build; rebuild before measuring`);
    files.push({ path: record.path, sha256: record.sha256 });
  }
  evidence.inputs = { build_json_sha256: sha(bytes), generator: build.generator, files };
} catch (error) {
  fail('BUILD_INPUT', `${path.join(buildArg, 'build.json')}: ${error.message}`);
}

// Browser lookup. Headless batch measurement prefers a dedicated headless build so it does not
// start a second instance of a browser application the user is working in.
const executable = file => {
  try { if (!fs.statSync(file).isFile()) return false; if (process.platform !== 'win32') fs.accessSync(file, fs.constants.X_OK); return true; } catch { return false; }
};
const onPath = names => names.flatMap(name => (process.env.PATH || '').split(path.delimiter).filter(Boolean).map(dir => path.join(dir, name)));
function playwrightShells() {
  const custom = process.env.PLAYWRIGHT_BROWSERS_PATH;
  const home = os.homedir();
  const root = custom && custom !== '0' ? custom
    : process.platform === 'darwin' ? path.join(home, 'Library', 'Caches', 'ms-playwright')
    : process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'ms-playwright')
    : path.join(process.env.XDG_CACHE_HOME || path.join(home, '.cache'), 'ms-playwright');
  let revisions = [];
  try { revisions = fs.readdirSync(root).map(name => /^chromium_headless_shell-(\d+)$/.exec(name)).filter(Boolean).sort((a, b) => b[1] - a[1]); } catch { return []; }
  return revisions.flatMap(([name]) => {
    let platforms = [];
    try { platforms = fs.readdirSync(path.join(root, name)).filter(dir => dir.startsWith('chrome-headless-shell-')); } catch { return []; }
    return platforms.map(dir => path.join(root, name, dir, process.platform === 'win32' ? 'chrome-headless-shell.exe' : 'chrome-headless-shell'));
  });
}
function installed(kind) {
  const home = os.homedir();
  const programs = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
  const mac = app => [path.join('/Applications', `${app}.app`, 'Contents', 'MacOS', app), path.join(home, 'Applications', `${app}.app`, 'Contents', 'MacOS', app)];
  if (kind === 'chrome') return process.platform === 'darwin' ? [...mac('Google Chrome'), ...mac('Chromium')]
    : process.platform === 'win32' ? programs.flatMap(dir => [path.join(dir, 'Google', 'Chrome', 'Application', 'chrome.exe'), path.join(dir, 'Chromium', 'Application', 'chrome.exe')])
    : onPath(['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']);
  return process.platform === 'darwin' ? mac('Microsoft Edge')
    : process.platform === 'win32' ? programs.map(dir => path.join(dir, 'Microsoft', 'Edge', 'Application', 'msedge.exe'))
    : onPath(['microsoft-edge', 'microsoft-edge-stable']);
}
function findBrowser() {
  const chosen = process.env.VISUAL_SYSTEM_BROWSER;
  if (chosen) return executable(chosen) ? { source: 'VISUAL_SYSTEM_BROWSER', file: chosen, shell: /headless-shell/.test(path.basename(chosen)) } : { reason: 'VISUAL_SYSTEM_BROWSER is set but does not point to an executable file' };
  for (const [source, files, shell] of [['playwright chromium-headless-shell', playwrightShells(), true], ['chrome', installed('chrome'), false], ['edge', installed('edge'), false]]) {
    const file = files.find(executable);
    if (file) return { source, file, shell };
  }
  return { reason: 'no Chromium-family browser found (VISUAL_SYSTEM_BROWSER, Playwright chromium-headless-shell, Google Chrome / Chromium, Microsoft Edge)' };
}

// Minimal DevTools protocol client over one browser-level WebSocket with flattened sessions.
// A closed connection (browser exited or crashed) rejects every pending request and wait, and every
// request times out after 30 s, so a lost browser ends the run with a BROWSER error instead of hanging.
function connect(url) {
  const ws = new WebSocket(url);
  let id = 0, closed = null;
  const pending = new Map(), waits = new Set();
  const settle = (key, error, result) => {
    const request = pending.get(key);
    if (!request) return;
    pending.delete(key); clearTimeout(request.timer);
    error ? request.reject(error) : request.resolve(result);
  };
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) settle(message.id, message.error && new Error(`${pending.get(message.id)?.method}: ${message.error.message}`), message.result);
    else for (const wait of [...waits]) wait.event(message);
  });
  ws.addEventListener('close', () => {
    closed = new Error('DevTools connection closed: the browser exited or crashed');
    for (const key of [...pending.keys()]) settle(key, closed);
    for (const wait of [...waits]) wait.end(closed);
  });
  const opened = new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', () => reject(new Error('DevTools WebSocket failed to open'))); });
  return {
    opened, close: () => ws.close(),
    send: (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      if (closed) return reject(closed);
      const key = ++id;
      pending.set(key, { method, resolve, reject, timer: setTimeout(() => settle(key, new Error(`${method}: no response within 30 s`)), 30000) });
      ws.send(JSON.stringify({ id: key, method, params, ...(sessionId ? { sessionId } : {}) }));
    }),
    once: (method, sessionId, ms) => {
      const waiting = new Promise((resolve, reject) => {
        if (closed) return reject(closed);
        const wait = {
          end: (error, params) => { clearTimeout(timer); waits.delete(wait); error ? reject(error) : resolve(params); },
          event: message => { if (message.method === method && message.sessionId === sessionId) wait.end(null, message.params); },
        };
        const timer = setTimeout(() => wait.end(new Error(`timed out waiting for ${method}`)), ms);
        waits.add(wait);
      });
      waiting.catch(() => {}); // the caller awaits it later; a rejection before then is not unhandled
      return waiting;
    },
  };
}
const pngSize = bytes => bytes.length > 24 && bytes.readUInt32BE(12) === 0x49484452 ? { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) } : null;

// Runs in the page. Range.getClientRects returns one text box per line fragment, as tall as the
// font's content area and centered on its line box; fragments with the same top form one line, and
// the line box is that center +/- line-height / 2. Vertical overflow is the last line box ending
// below the slot: a content area taller than the line height (large display sizes) overhangs the
// line box and inflates scrollHeight without the text leaving the slot, so scrollHeight is
// recorded for information only.
function measure(textSlots) {
  const rect = el => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; };
  const sheet = document.querySelector('main');
  const slots = {};
  for (const el of document.querySelectorAll('[data-slot]')) {
    const style = getComputedStyle(el);
    const text = textSlots.includes(el.dataset.slot);
    const entry = { box: rect(el), hidden: !el.checkVisibility({ visibilityProperty: true }), ...(text ? { empty: !el.textContent.trim() } : {}) };
    if (text && !entry.hidden) {
      const lineHeight = parseFloat(style.lineHeight);
      const range = document.createRange(); range.selectNodeContents(el);
      const lines = [];
      for (const r of range.getClientRects()) {
        if (r.width <= 0) continue;
        const line = lines.find(l => Math.abs(l.top - r.top) < lineHeight / 2);
        if (line) { line.top = Math.min(line.top, r.top); line.bottom = Math.max(line.bottom, r.bottom); } else lines.push({ top: r.top, bottom: r.bottom });
      }
      const top = el.getBoundingClientRect().top + el.clientTop;
      const lineBoxBottom = lines.reduce((max, l) => Math.max(max, (l.top + l.bottom) / 2 + lineHeight / 2 - top), 0);
      Object.assign(entry, { lines: lines.length, line_box_bottom_px: Math.round(lineBoxBottom * 100) / 100, scroll_height: el.scrollHeight, scroll_width: el.scrollWidth, client_height: el.clientHeight, client_width: el.clientWidth, font_size_px: parseFloat(style.fontSize), line_height_px: lineHeight, font_family: style.fontFamily });
    }
    slots[el.dataset.slot] = entry;
  }
  return { sheet: sheet && rect(sheet), slots };
}

async function run(found) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'check-application-'));
  const flags = ['--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--force-device-scale-factor=1', ...(found.shell ? [] : ['--headless=new']), 'about:blank'];
  const child = spawn(found.file, flags, { stdio: ['ignore', 'ignore', 'pipe'] });
  let client;
  try {
    const url = await new Promise((resolve, reject) => {
      let log = '';
      const timer = setTimeout(() => reject(new Error('browser did not report a DevTools endpoint within 20 s')), 20000);
      child.stderr.on('data', data => { log += data; const m = /DevTools listening on (ws:\/\/\S+)/.exec(log); if (m) { clearTimeout(timer); resolve(m[1]); } });
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('exit', code => { clearTimeout(timer); reject(new Error(`browser exited with code ${code} before DevTools was ready`)); });
    });
    client = connect(url);
    await client.opened;
    const version = await client.send('Browser.getVersion');
    evidence.browser = { source: found.source, product: version.product, revision: version.revision };
    const { targetId } = await client.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params) => client.send(method, params, sessionId);
    await send('Page.enable'); await send('DOM.enable'); await send('CSS.enable');
    fs.mkdirSync(outDir, { recursive: true });
    for (const item of build.items) {
      const report = { id: item.id, template: item.template, html: item.output, canvas: { width: item.width, height: item.height }, slots: {}, overlaps: [], png: null, errors: [] };
      const itemFail = (code, message) => { report.errors.push({ code, message }); fail(code, `${item.id}: ${message}`); };
      await send('Emulation.setDeviceMetricsOverride', { width: item.width, height: item.height, deviceScaleFactor: 1, mobile: false });
      const loaded = client.once('Page.loadEventFired', sessionId, 30000);
      await send('Page.navigate', { url: pathToFileURL(path.join(buildDir, item.output)).href });
      await loaded;
      await send('Runtime.evaluate', { expression: 'document.fonts.ready.then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))', awaitPromise: true });
      const { result } = await send('Runtime.evaluate', { expression: `(${measure})(${JSON.stringify(TEXT_SLOTS)})`, returnByValue: true });
      const { sheet, slots } = result.value;
      if (!sheet) { itemFail('SHEET_MISSING', `${item.output} has no <main> canvas`); evidence.items.push(report); continue; }
      const { root } = await send('DOM.getDocument', { depth: 0 });
      for (const [name, layout] of Object.entries(item.layout)) {
        const slot = slots[name];
        if (!slot) {
          if (TEXT_SLOTS.includes(name)) itemFail('SLOT_MISSING', `${name}: the page has no [data-slot="${name}"] element to measure`);
          continue;
        }
        if (slot.hidden) {
          if (TEXT_SLOTS.includes(name) && !slot.empty) itemFail('SLOT_MISSING', `${name}: [data-slot="${name}"] has copy but is not rendered`);
          report.slots[name] = slot;
          continue;
        }
        const entry = { ...slot };
        if (TEXT_SLOTS.includes(name)) {
          entry.max_lines = layout.max_lines;
          const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: `[data-slot="${name}"]` });
          entry.fonts = (await send('CSS.getPlatformFontsForNode', { nodeId })).fonts;
          if (slot.lines > layout.max_lines) itemFail('SLOT_LINES', `${name} renders ${slot.lines} lines, max_lines ${layout.max_lines}`);
          if (slot.line_box_bottom_px > slot.client_height + 0.5) itemFail('SLOT_OVERFLOW', `${name} line boxes end ${slot.line_box_bottom_px}px below the slot top in a ${slot.client_height}px slot`);
          if (slot.scroll_width > slot.client_width + 0.5) itemFail('SLOT_OVERFLOW', `${name} content is ${slot.scroll_width}px wide in a ${slot.client_width}px slot`);
          for (const font of entry.fonts.filter(font => !font.isCustomFont)) evidence.warnings.push(`${item.id}: ${name} has ${font.glyphCount} glyph(s) in platform font ${font.familyName}, not a brand.css face; check for missing glyphs`);
        }
        report.slots[name] = entry;
      }
      const names = Object.keys(report.slots).filter(name => !report.slots[name].hidden);
      for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
        const a = report.slots[names[i]].box, b = report.slots[names[j]].box;
        const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x), h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
        if (w > 0.5 && h > 0.5) { report.overlaps.push({ slots: [names[i], names[j]], width: w, height: h }); itemFail('SLOT_OVERLAP', `${names[i]} and ${names[j]} slot boxes intersect by ${Math.round(w)} x ${Math.round(h)} px`); }
      }
      const shot = await send('Page.captureScreenshot', { format: 'png', clip: { ...sheet, scale: 1 }, captureBeyondViewport: true });
      const bytes = Buffer.from(shot.data, 'base64');
      const file = `${item.id}.png`;
      fs.writeFileSync(path.join(outDir, file), bytes);
      const size = pngSize(bytes);
      report.png = { path: file, sha256: sha(bytes), ...size };
      if (size?.width !== item.width || size?.height !== item.height) itemFail('PNG_SIZE', `export is ${size?.width}x${size?.height}, canvas ${item.width}x${item.height}`);
      evidence.items.push(report);
    }
  } finally {
    // Bounded shutdown: ask the browser to close, then kill it if it is still running.
    const running = () => child.pid !== undefined && child.exitCode === null && child.signalCode === null;
    const delay = ms => new Promise(r => setTimeout(r, ms).unref()); // a pending race timer must not keep the process alive
    if (client) { await Promise.race([client.send('Browser.close').catch(() => {}), delay(3000)]); client.close(); }
    const exited = () => Promise.race([new Promise(r => child.once('exit', r)), delay(5000)]);
    if (running()) await exited();
    if (running()) { child.kill('SIGKILL'); await exited(); }
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

if (evidence.result === 'PASS') {
  const found = typeof WebSocket === 'undefined' ? { reason: 'Node.js 22+ is required for the built-in WebSocket client' } : findBrowser();
  if (found.reason) { evidence.result = 'not_run'; evidence.reason = found.reason; }
  else {
    try { await run(found); }
    catch (error) { fail('BROWSER', error.message); }
  }
}
const output = JSON.stringify(evidence, null, 2) + '\n';
// Without --out the evidence belongs inside the build; a missing build directory is not created.
if (outIndex >= 0 || fs.existsSync(buildDir)) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'application-check.json'), output);
}
process.stdout.write(output);
process.exitCode = evidence.result === 'PASS' ? 0 : evidence.result === 'not_run' ? 2 : 1;
