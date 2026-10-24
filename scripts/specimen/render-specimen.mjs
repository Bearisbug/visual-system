#!/usr/bin/env node
// 标准组件样例页渲染器（references/specimen-spec.md §8）。
// 读品牌目录里的 specimen.json、tokens、状态层、字体、图标与品牌片段，写出 specimen.html 与同目录的 specimen-doc.css。
// 同一输入逐字节同一输出：不读时间、不联网、不经模型。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const USAGE = `Usage: node <visual-system>/scripts/specimen/render-specimen.mjs BRAND_DIR [--config FILE]
BRAND_DIR is the brand root (a product repo's brand/, or a brand repo). FILE defaults to BRAND_DIR/specimen.json;
paths inside it are relative to BRAND_DIR. Writes the page to the config's "out" (default examples/specimen.html)
and specimen-doc.css next to it. Exit code 0 written, 1 input error, 2 usage.`;
const argv = process.argv.slice(2);
if (!argv.length || argv[0].startsWith('--')) { console.log(USAGE); process.exit(argv.includes('--help') ? 0 : 2); }
const opt = (name, d) => { const i = argv.indexOf(name); return i < 0 ? d : argv[i + 1]; };
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(argv[0]);
const die = m => { console.error(`render-specimen: ${m}`); process.exit(1); };
const at = rel => path.resolve(ROOT, rel);
const exists = rel => rel && fs.existsSync(at(rel));
const read = rel => { if (!exists(rel)) die(`missing file ${rel}`); return fs.readFileSync(at(rel), 'utf8'); };
const CFG_PATH = path.resolve(ROOT, opt('--config', 'specimen.json'));
if (!fs.existsSync(CFG_PATH)) die(`missing config ${CFG_PATH}`);
const cfg = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'));
const OUT = cfg.out ?? 'examples/specimen.html';
const TOK = cfg.tokens ?? '.';
const tok = f => path.join(TOK, f);
const rel = p => path.relative(path.dirname(at(OUT)), at(p)).split(path.sep).join('/');

// ---- tokens ----
const SRC = JSON.parse(read(tok('tokens.json')));
const R = { light: JSON.parse(read(tok('tokens.resolved.json'))) };
if (exists(tok('tokens.resolved.dark.json'))) R.dark = JSON.parse(read(tok('tokens.resolved.dark.json')));
const MODES = Object.keys(R);
const CSS = read(tok('tokens.css'));
const VARS = new Set([...CSS.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));
const kebab = p => '--' + p.split('.').map(s => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()).join('-');
const has = p => VARS.has(kebab(p));
const V = p => { const n = kebab(p); if (!VARS.has(n)) die(`tokens.css has no ${n} (token ${p})`); return `var(${n})`; };
const get = (tree, p) => p.split('.').reduce((n, k) => n?.[k], tree);
const val = (p, mode = 'light') => get(R[mode], p)?.$value;
const desc = p => get(R.light, p)?.$description;
const kids = (p, tree = R.light) => { const n = get(tree, p); return n ? Object.keys(n).filter(k => !k.startsWith('$') && n[k] && typeof n[k] === 'object') : []; };
const leaves = (p, tree = R.light) => { const out = []; const walk = q => { const n = get(tree, q); if (!n || typeof n !== 'object') return; if ('$value' in n) out.push(q); else for (const k of Object.keys(n)) if (!k.startsWith('$')) walk(`${q}.${k}`); }; walk(p); return out; };
const META = SRC.meta ?? {};
const ROLES = META.roles ?? {};
const CATS = META.categories ?? {};
const rolePath = k => typeof ROLES[k] === 'string' ? ROLES[k] : null;
const RV = k => rolePath(k) ? V(rolePath(k)) : null;
const roleStatus = k => typeof ROLES[k] === 'object' ? ROLES[k] : rolePath(k) ? { status: 'present' } : { status: 'missing', reason: 'meta.roles 没有这个角色' };
const catStatus = k => CATS[k]?.status ?? 'missing';

// ---- small helpers ----
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const MISS = '<span class="miss">缺</span>', NA = '<span class="na">不适用</span>';
const cap = ({ name, val: v, dataVar, use, dev, style }) => `<div class="cap"${style ? ` style="${style}"` : ''}><div class="name">${name}</div>${dataVar ? `<div class="val" data-var="${dataVar}"></div>` : v ? `<div class="val">${v}</div>` : ''}${use ? `<div class="use">${use}</div>` : ''}${dev ? `<div class="dev">${dev}</div>` : ''}</div>`;
const grid = (n, items, extra = '') => `<div class="grid g${n}"${extra}>${items.join('\n')}</div>`;
const group = (title, note) => `<h3 class="group">${title}${note ? `<span>${note}</span>` : ''}</h3>`;
const head = (name, use) => `<div class="cardhead"><span class="name">${name}</span>${use ? `<span class="use">${use}</span>` : ''}</div>`;
const pre = code => `<pre class="code"><button class="btn btn-text state-layer focus-ring copy q">复制</button><code>${code}</code></pre>`;
const fmt = n => Number.isInteger(n) ? String(n) : String(+n.toFixed(3));
const size = rp => { const n = fs.statSync(at(rp)).size; return n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`; };

// WCAG contrast with alpha composited over the page surface
const rgba = h => { const x = h.replace('#', ''); const s = x.length === 3 ? x.split('').map(c => c + c).join('') + 'ff' : x.length === 6 ? x + 'ff' : x; return [0, 2, 4, 6].map(i => parseInt(s.slice(i, i + 2), 16) / 255); };
const over = (fg, bg) => { const [r, g, b, a] = rgba(fg), [R0, G0, B0] = bg; return [r * a + R0 * (1 - a), g * a + G0 * (1 - a), b * a + B0 * (1 - a)]; };
const lum = c => { const f = x => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const contrast = (fg, bg, mode) => {
  const page = over(val(rolePath('surface.default'), mode), [1, 1, 1]);
  const b = over(bg, page), f = over(fg, b);
  const [l1, l2] = [lum(f), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

// ---- adapters: semantic variable -> Tailwind / shadcn utility name ----
const adapter = f => exists(tok(f)) ? read(tok(f)) : '';
const TWSRC = adapter('tokens.tailwind.css'), SHSRC = adapter('tokens.shadcn.css');
const TW = new Map(), SH = new Map(), SHT = new Map();
for (const m of SHSRC.matchAll(/--(text)-([a-z0-9]+(?:-[a-z0-9]+)*):\s*var\((--[\w-]+)\)/g)) if (!SHT.has(m[3])) SHT.set(m[3], `text-${m[2]}`);
for (const m of TWSRC.matchAll(/--(color|radius|text|shadow|font|ease|transition-duration)-([a-z0-9]+(?:-[a-z0-9]+)*):\s*var\((--[\w-]+)\)/g)) if (!TW.has(m[3])) TW.set(m[3], [m[1], m[2]]);
const shRoot = SHSRC.match(/:root\s*\{([\s\S]*?)\}/)?.[1] ?? '';
for (const m of shRoot.matchAll(/--([\w-]+):\s*var\((--[\w-]+)\)/g)) if (!SH.has(m[2])) SH.set(m[2], m[1]);
const TWP = { color: null, radius: 'rounded', text: 'text', shadow: 'shadow', font: 'font', ease: 'ease', 'transition-duration': 'duration' };
const twClass = (v, prefix) => { const t = TW.get(v); if (!t) return null; return t[0] === 'color' ? `${prefix}-${t[1]}` : `${TWP[t[0]]}-${t[1]}`; };
const shClass = (v, prefix) => SH.has(v) ? `${prefix}-${SH.get(v)}` : null;
const devFor = (v, prefix) => {
  const parts = [v];
  if (TWSRC) parts.push(`Tailwind ${twClass(v, prefix) ?? `${prefix}-(${v})`}`);
  if (SHSRC) parts.push(`shadcn ${shClass(v, prefix) ?? `${prefix}-(${v})`}`);
  return parts[0] + (parts.length > 1 ? '<br>' + parts.slice(1).join(' · ') : '');
};
const unwrap = s => s.slice(4, -1); // var(--x) -> --x

// ---- icons ----
const ICON_DIR = cfg.icons;
const ICON_FILES = ICON_DIR && exists(ICON_DIR) ? fs.readdirSync(at(ICON_DIR)).filter(f => f.endsWith('.svg')).sort() : [];
const ICONSET = new Set(ICON_FILES.map(f => f.slice(0, -4)));
const ICON_ROLES = {
  success: ['circle-check', 'check-circle', 'check'], warning: ['triangle-alert', 'alert-triangle', 'circle-alert'],
  error: ['circle-alert', 'alert-circle', 'circle-x', 'triangle-alert'], close: ['x'], next: ['chevron-right'], down: ['chevron-down'],
  search: ['search'], add: ['plus'], loading: ['loader-circle', 'loader', 'loader-2'], settings: ['settings', 'settings-2'],
  notification: ['bell', 'inbox', 'message-square'], home: ['house', 'home', 'layout-grid'], user: ['user', 'circle-user', 'user-round'],
  calendar: ['calendar', 'calendar-days'], time: ['clock', 'history'], check: ['check'],
};
const ICON_MISSING = new Set();
const iconName = role => { const want = cfg.components?.icons?.[role] ? [cfg.components.icons[role]] : ICON_ROLES[role]; const n = want.find(x => ICONSET.has(x)); if (!n) ICON_MISSING.add(role); return n; };
const icon = (role, cls = 'ic', extra = '') => { const n = iconName(role); return n ? `<svg class="${cls}" aria-hidden="true"${extra}><use href="#i-${n}"/></svg>` : ''; };
const svgInner = f => { const t = fs.readFileSync(at(path.join(ICON_DIR, f)), 'utf8'); return [t.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 24 24', t.match(/<svg\b[^>]*>([\s\S]*)<\/svg>/)[1].replace(/\s+/g, ' ').trim()]; };

// ---- sample-layer aliases ----
const spaces = kids('primitive.dimension.space').map(k => ({ k, v: val(`primitive.dimension.space.${k}`) })).filter(x => typeof x.v === 'number').sort((a, b) => a.v - b.v);
if (!spaces.length) die('tokens have no primitive.dimension.space scale');
const nearest = (list, px) => list.reduce((b, x) => Math.abs(x.v - px) < Math.abs(b.v - px) ? x : b);
const radii = kids('semantic.radius').filter(k => !['pill', 'innerMin'].includes(k)).map(k => ({ k, v: val(`semantic.radius.${k}`) })).filter(x => typeof x.v === 'number').sort((a, b) => a.v - b.v);
if (!radii.length) die('tokens have no semantic.radius steps besides pill and innerMin');
const RADIUS = {
  control: cfg.components?.radius?.control ?? `semantic.radius.${nearest(radii, 10).k}`,
  card: cfg.components?.radius?.card ?? `semantic.radius.${nearest(radii, 16).k}`,
  sheet: cfg.components?.radius?.sheet ?? `semantic.radius.${radii.at(-1).k}`,
};
const BADGE = cfg.components?.badge ?? { fill: rolePath('selection'), text: rolePath('text.primary') };
const SCRIM = has('semantic.color.scrim') ? 'semantic.color.scrim' : null;
const aliasCss = [
  ':root, [data-theme] {',
  ...Object.entries({ 1: 4, 2: 8, 3: 12, 4: 16, 6: 24 }).map(([n, px]) => `  --sp-${n}: ${V(`primitive.dimension.space.${nearest(spaces, px).k}`)};`),
  `  --sp-radius-control: ${V(RADIUS.control)};`, `  --sp-radius-card: ${V(RADIUS.card)};`, `  --sp-radius-sheet: ${V(RADIUS.sheet)};`,
  `  --sp-badge-fill: ${V(BADGE.fill)};`, `  --sp-badge-text: ${V(BADGE.text)};`,
  `  --sp-scrim: ${SCRIM ? V(SCRIM) : `color-mix(in srgb, ${RV('text.primary')} 40%, transparent)`};`,
  '}',
  // without a scrim token the dark stand-in has to darken too: the dark primary text is light
  ...(!SCRIM && MODES.includes('dark') ? ['[data-theme="dark"] {', `  --sp-scrim: color-mix(in srgb, ${RV('surface.sunken')} 72%, transparent);`, '}'] : []),
].join('\n');

// ---- typography ----
const TYPE_NAME = { heading1: '一级标题', heading2: '二级标题', heading3: '三级标题', body: '正文', bodyStrong: '正文强调', label: '标签', caption: '注释', overline: '眉题', code: '代码' };
const TYPE_SAMPLE = {
  heading1: ['Design once, ship everywhere', '一次定稿，处处一致'], heading2: ['Weekly overview', '本周概览'], heading3: ['Account settings', '账号设置'],
  body: ['Changes are saved automatically and synced to every device.', '修改会自动保存，并同步到你的每一台设备。'],
  bodyStrong: ['$1,280.00 due on 12 Oct', '10月12日到期 ¥1,280.00'], label: ['Display name', '显示名称'], caption: ['Updated 3 minutes ago', '3 分钟前更新'],
  overline: ['RECENT ACTIVITY', '最近动态'], code: ['npm run build', 'npm run build'],
};
const DISPLAY_SAMPLE = { hero: '做你自己的', headline: '随时开始', title: '春季更新', subhead: '今天起在网页与手机上可用', eyebrow: 'WHAT’S NEW', caption: 'DESIGN SAMPLE' };
const steps = base => kids(base).filter(k => typeof val(`${base}.${k}`)?.fontSize === 'number').sort((a, b) => val(`${base}.${b}`).fontSize - val(`${base}.${a}`).fontSize);
const UI_STEPS = steps('semantic.typography'), DISPLAY_STEPS = steps('semantic.typographyDisplay');
for (const k of ['heading1', 'heading2', 'heading3', 'body', 'bodyStrong', 'label', 'caption']) if (!UI_STEPS.includes(k)) die(`semantic.typography.${k} is required by the component samples`);
const typeCss = (base, cls) => (k => `.${cls}-${kebab(k).slice(2)} { font-family: ${V(`${base}.${k}.fontFamily`)}; font-size: ${V(`${base}.${k}.fontSize`)}; font-weight: ${V(`${base}.${k}.fontWeight`)}; line-height: ${V(`${base}.${k}.lineHeight`)}; letter-spacing: ${V(`${base}.${k}.letterSpacing`)}; }`);
const generatedTypeCss = [...UI_STEPS.map(typeCss('semantic.typography', 't')), ...DISPLAY_STEPS.map(typeCss('semantic.typographyDisplay', 'td'))].join('\n');

// ---- fragments ----
const fillFragment = (html, where) => {
  html = html.replace(/\{\{inline:([^}]+)\}\}/g, (_, p) => read(p.trim()).replace(/<\?xml[^>]*>\s*/, '').trim());
  html = html.replace(/\{\{size:([^}]+)\}\}/g, (_, p) => size(p.trim()));
  html = html.replace(/\{\{src:([^}]+)\}\}/g, (_, p) => { if (!exists(p.trim())) die(`${where}: {{src:${p}}} does not exist`); return esc(rel(p.trim())); });
  html = html.replace(/\{\{(hex|hex-dark):([^}]+)\}\}/g, (_, k, p) => { const v = val(p.trim(), k === 'hex' ? 'light' : 'dark'); if (v === undefined) die(`${where}: no token ${p}`); return v; });
  html = html.replace(/\{\{icon-count\}\}/g, String(ICON_FILES.length));
  const left = html.match(/\{\{[^}]*\}\}/g);
  if (left) die(`${where}: unfilled placeholders ${[...new Set(left)].join(' ')}`);
  return html;
};
const SECTION_CFG = cfg.sections ?? {};
const fragment = (id, title) => {
  const s = SECTION_CFG[id];
  if (typeof s === 'string') return fillFragment(read(s), s);
  if (s?.status === 'notApplicable') return `<h2>${title}</h2><p class="sub">${NA}${s.reason ?? ''}</p>`;
  return `<h2>${title}</h2><p class="sub">${MISS}${s?.reason ?? `specimen.json 的 sections.${id} 没有提供本节`}</p>`;
};
const T = s => s == null ? s : fillFragment(String(s), 'specimen.json');
const note = (id, fallback) => cfg.notes?.[id] != null ? T(cfg.notes[id]) : fallback;
const use = (p, fallback = '') => cfg.uses?.[p] != null ? T(cfg.uses[p]) : desc(p) ? esc(desc(p)) : fallback;

// ---- page skeleton ----
const GROUPS = { brand: '01 — 品牌基础', base: '02 — 基础', comp: '03 — 组件', page: '04 — 页面模式', apps: '05 — 物料', dev: '06 — 开发参考' };
const section = (id, g, body, tag) => `  <section id="${id}">\n    <p class="eyebrow">${GROUPS[g]}${tag ? ` · ${tag}` : ''}</p>\n${body}\n  </section>`;
const SERIES = catStatus('dataViz') === 'present' ? kids('semantic.color.dataViz.series').length : 0;
const brand = cfg.brand ?? 'Brand';
const logo = cfg.logo ?? {};
const img = (p, attrs) => p ? `<img src="${esc(rel(p))}" ${attrs}>` : '';
const themed = (light, dark, attrs) => dark ? img(light, `class="theme-light-only" ${attrs}`) + img(dark, `class="theme-dark-only" ${attrs}`) : img(light, attrs);
for (const k of Object.keys(logo)) if (logo[k] && !exists(logo[k])) die(`logo.${k}: ${logo[k]} does not exist`);

// 01 brand sections come from the brand's fragments
const BRAND_SECTIONS = [['brand', '品牌概述'], ['logo', '标志'], ['app-icon', '应用图标与网页图标'], ['brand-color', '品牌色'], ['brand-type', '品牌字体'], ['motif', '辅助图形'], ['voice', '语气与文案']];

// 02 color
function colorSection() {
  const chip = (k, name, fallbackUse, prefix = 'bg') => {
    const st = roleStatus(k);
    if (st.status !== 'present') return `<div class="card pad"><h4>${st.status === 'notApplicable' ? NA : MISS}${name}</h4><p>${esc(st.reason ?? '')}</p></div>`;
    const p = rolePath(k), v = kebab(p);
    return `<div class="card"><div class="chip" data-token="${p}" style="background:var(${v})"></div>${cap({ name, dataVar: v, use: use(p, fallbackUse), dev: devFor(v, prefix) })}</div>`;
  };
  const leafChip = (p, name, fallbackUse, prefix = 'bg') => { const v = kebab(p); return `<div class="card"><div class="chip" data-token="${p}" style="background:var(${v})"></div>${cap({ name, dataVar: v, use: use(p, fallbackUse), dev: devFor(v, prefix) })}</div>`; };
  const covered = new Set(Object.values(ROLES).filter(x => typeof x === 'string'));
  const strong = has('semantic.color.border.strong') ? 'semantic.color.border.strong' : null;
  if (strong) covered.add(strong);
  const rest = leaves('semantic.color').filter(p => !covered.has(p) && !p.startsWith('semantic.color.dataViz.') && /^#/.test(String(val(p))));
  const restGroups = [...new Set(rest.map(p => p.split('.')[2]))];
  // contrast matrix: each foreground role against the four surfaces, every mode side by side
  const surfaces = ['surface.sunken', 'surface.default', 'surface.raised', 'surface.overlay'].filter(rolePath);
  const fgs = [['text.primary', 4.5], ['text.secondary', 4.5], ['text.tertiary', 4.5], ['accent', 4.5], ['feedback.success', 4.5], ['feedback.warning', 4.5], ['feedback.error', 4.5]].filter(([k]) => rolePath(k));
  if (strong) fgs.push(['@strong', 3]);
  const fgPath = k => k === '@strong' ? strong : rolePath(k);
  const fgName = k => k === '@strong' ? '控件边框' : ROLE_NAME[k];
  const rows = fgs.map(([k, min]) => `<tr><td>${fgName(k)} <span style="color:var(--semantic-color-text-tertiary)">≥ ${min}</span></td>${MODES.map(m => surfaces.map(s => { const r = contrast(val(fgPath(k), m), val(rolePath(s), m), m); return `<td class="${r < min ? 'bad' : ''}">${r.toFixed(2)}</td>`; }).join('')).join('')}</tr>`).join('');
  const onAcc = rolePath('onAccent') && rolePath('accent') ? `<tr><td>强调上的文字 / 强调 <span style="color:var(--semantic-color-text-tertiary)">≥ 4.5</span></td>${MODES.map(m => { const r = contrast(val(rolePath('onAccent'), m), val(rolePath('accent'), m), m); return `<td class="${r < 4.5 ? 'bad' : ''}" colspan="${surfaces.length}">${r.toFixed(2)}</td>`; }).join('')}</tr>` : '';
  const sName = { 'surface.sunken': '凹陷', 'surface.default': '页面', 'surface.raised': '抬升', 'surface.overlay': '浮层' };
  const table = `<div class="card hscroll"><table class="ttable ctable" style="min-width:${260 + 80 * surfaces.length * MODES.length}px"><tr><th>前景</th>${MODES.map(m => `<th colspan="${surfaces.length}">${m === 'light' ? '浅色' : '深色'}</th>`).join('')}</tr><tr><th></th>${MODES.map(() => surfaces.map(s => `<th>${sName[s]}</th>`).join('')).join('')}</tr>${rows}${onAcc}</table></div>`;
  const absent = [];
  if (!SCRIM) absent.push(['遮罩 scrim', `对话框与底部弹层的遮罩。本页样本临时用主文字色 40%${MODES.includes('dark') ? '，深色模式用凹陷表面 72%' : ''}（<code>color-mix</code>），补 token 前产品里不要照抄这个值。`]);
  if (!has('semantic.color.surface.inverse')) absent.push(['反色表面 inverse', '提示条与工具提示没有反色表面可用，本页用浮层表面加阴影。']);
  if (SERIES && !['gridline', 'axis', 'track'].every(k => has(`semantic.color.dataViz.${k}`))) absent.push(['图表网格线、坐标轴、轨道', 'dataViz 没有 gridline / axis / track，本页图表分别借用分隔线、弱文字与凹陷表面。']);
  return [
    `    <h2>颜色</h2>`,
    `    <p class="sub">${note('color', '按用途命名，不按色相命名。组件只引用语义色，切换深色时值随之替换，名字不变。卡片下的计算值随当前模式更新；对比度矩阵亮暗并排，低于阈值的标红。')}</p>`,
    group('表面', '浅色由凹陷到浮层逐层区分；暗色层级越高越亮'),
    grid(4, [chip('surface.sunken', '凹陷', '输入框底、凹陷区、分段控件轨道'), chip('surface.default', '页面', '页面底'), chip('surface.raised', '抬升', '卡片、列表、次按钮'), chip('surface.overlay', '浮层', '菜单、弹层、对话框、提示条')]),
    group('文字与强调', '弱文字仍是可读文字，对每层表面 ≥ 4.5:1'),
    grid(4, [chip('text.primary', '文字 · 主', '标题、正文、输入内容', 'text'), chip('text.secondary', '文字 · 次', '说明、副标题、字段标签', 'text'), chip('text.tertiary', '文字 · 弱', '占位符、元信息', 'text'), chip('accent', '强调', '主按钮底、链接、焦点环')]),
    group('强调上的文字、选中与边框', '分隔线只作装饰，控件边界用控件边框'),
    grid(4, [chip('onAccent', '强调上的文字', '主按钮的文字和图标', 'text'), chip('selection', '选中高亮', '选中行、按下的切换按钮'), chip('divider', '分隔线', '发丝线、卡片描边；不当控件边界', 'border'), strong ? leafChip(strong, '控件边框', '输入框、次按钮、开关描边，对四层表面 ≥ 3:1', 'border') : `<div class="card pad"><h4>${MISS}控件边框</h4><p>没有 semantic.color.border.strong，输入框与次按钮的边界只能借用分隔线，对比度不足 3:1。</p></div>`]),
    group('反馈', '反馈色只表达状态，一律同时给图标或文字'),
    grid(4, [chip('feedback.success', '成功', '必须同时给图标或文字', 'text'), chip('feedback.warning', '警告', '需要留意但不阻断', 'text'), chip('feedback.error', '错误', '出错文字、图标、输入框出错边框', 'text')]),
    ...restGroups.map(g => [group(`其他 · ${g}`, `semantic.color.${g}`), grid(4, rest.filter(p => p.split('.')[2] === g).map(p => leafChip(p, p.split('.').slice(3).join('.') || g, '')))]).flat(),
    group('对比度', `按 WCAG 2.x 公式计算，半透明色先与底色合成；完整矩阵另见 check-tokens 报告`),
    table,
    absent.length ? group('缺的角色', 'tokens 没有定义，下面的样本里临时处理') + grid(3, absent.map(([h, p]) => `<div class="card pad"><h4>${MISS}${h}</h4><p>${p}</p></div>`)) : '',
  ].filter(Boolean).join('\n');
}
const ROLE_NAME = { 'text.primary': '文字 · 主', 'text.secondary': '文字 · 次', 'text.tertiary': '文字 · 弱', accent: '强调', 'feedback.success': '成功', 'feedback.warning': '警告', 'feedback.error': '错误' };

// 02 type
function typeSection() {
  const row = (base, k, cls, samples, extraUse = '') => {
    const kb = kebab(k).slice(2), dt = base === 'semantic.typography' ? kb : `display-${kb}`;
    const tw = twClass(`--semantic-typography-${dt}-font-size`, 'text');
    return `<div class="trow"><div class="cap" style="padding:0"><div class="name">${base === 'semantic.typography' ? (TYPE_NAME[k] ?? k) : k}</div><div class="val" data-type="${dt}"></div>${use(`${base}.${k}`, extraUse) ? `<div class="use">${use(`${base}.${k}`, extraUse)}</div>` : ''}<div class="dev">--semantic-typography-${dt}-*${tw ? `<br>Tailwind / shadcn ${tw}` : ''}</div></div><div class="samples">${samples.map(([lang, text]) => `<div class="sample ${cls}-${kb}" lang="${lang}" style="color:var(--semantic-color-text-primary)">${text}</div>`).join('')}</div></div>`;
  };
  const ui = UI_STEPS.map(k => row('semantic.typography', k, 't', [['en', TYPE_SAMPLE[k]?.[0] ?? 'The quick brown fox'], ['zh-CN', TYPE_SAMPLE[k]?.[1] ?? '永和九年，岁在癸丑']]));
  const disp = DISPLAY_STEPS.map(k => row('semantic.typographyDisplay', k, 'td', [[/eyebrow|caption/.test(k) ? 'en' : 'zh-CN', DISPLAY_SAMPLE[k] ?? '品牌标题']]));
  const weights = [...new Set([...UI_STEPS.map(k => val(`semantic.typography.${k}`).fontWeight)])].sort((a, b) => a - b);
  const zhPara = '样例页把一套设计系统的全部基础 token 和组件状态排在一起，真实页面开工前先在这里定稿。正文按中文阅读行宽排版，每行 35 到 45 个字；中英混排时，英文单词 Design Token 与数字 2026 前后的间距由排版规则决定，不手打空格。引号用“”，书名用《》，省略号用……，破折号用——。段落之间留出一行的间距，标题不超过两行。本段用来检查行高、字距和标点在中文字体下是否落在全角位置上，引号不应被西文字体渲染成窄宽度。';
  const enPara = 'A specimen lays out every foundation token and component state of a design system on one page, so the decisions are settled before real pages are built. Body text is set at a reading measure of 65 to 75 characters, with figures such as 1,280.00 and 09:41 aligned in tables.';
  return [
    `    <h2>字体与字阶</h2>`,
    `    <p class="sub">${note('type', `界面字阶 ${UI_STEPS.length} 档${DISPLAY_STEPS.length ? `，另有展示字阶 ${DISPLAY_STEPS.length} 档只给固定画布的物料` : ''}；本系统字重 ${weights.join(' / ')}。每档西文、中文各一行样本，计算值按语言分别读取（中文覆盖只在带 lang 的元素上生效）。`)}</p>`,
    `<div class="card type q">${ui.join('\n')}</div>`,
    DISPLAY_STEPS.length ? group('展示字阶', '物料画布用；样本按画布原尺寸绘制') + `<div class="card type q">${disp.join('\n')}</div>` : '',
    group('排版细节', '阅读行宽、标题折行、等宽数字与中文标点'),
    grid(2, [
      `<div class="card q"><div class="stage plain" style="flex-direction:column;align-items:flex-start;gap:16px"><p class="body prose-sample" lang="zh-CN" style="color:var(--semantic-color-text-primary)">${zhPara}</p></div>${cap({ name: '中文正文 · 阅读行宽 40em', use: '中文 35–45em；引号、书名号、省略号与破折号按全角渲染' })}</div>`,
      `<div class="card q"><div class="stage plain" style="flex-direction:column;align-items:flex-start;gap:20px"><p class="body prose-sample" lang="en" style="color:var(--semantic-color-text-primary)">${enPara}</p><h4 class="h2" lang="zh-CN" style="text-wrap:balance;max-width:16em">两行标题用 text-wrap: balance 让两行长度接近</h4><table class="body" style="font-variant-numeric:tabular-nums;color:var(--semantic-color-text-primary)"><tr><td>本月</td><td style="text-align:right;padding-left:32px">1,280.00</td></tr><tr><td>上月</td><td style="text-align:right;padding-left:32px">96.50</td></tr><tr><td>合计</td><td style="text-align:right;padding-left:32px">1,376.50</td></tr></table></div>${cap({ name: '西文行宽 · 平衡折行 · 等宽数字', use: '西文 65–75ch；数字列 tabular-nums 右对齐' })}</div>`,
    ]),
    group('正文行内元素', '链接三态、行内代码、按键、高亮、强调、选中与插入符'),
    `<div class="card q"><div class="stage plain" style="flex-direction:column;align-items:flex-start;gap:14px;padding:28px"><p class="inline-sample">链接：<a class="link state-layer focus-ring" href="#type">默认</a>　<a class="link state-layer focus-ring is-hover" href="#type">悬停</a>　<a class="link state-layer focus-ring is-focus" href="#type">焦点</a></p><p class="inline-sample">运行 <code>npm run build</code>，按 <kbd>⌘</kbd> <kbd>K</kbd> 打开搜索；<mark>高亮的词</mark>用选中色；<strong>加粗强调</strong>；中文不用斜体，用<span class="dot">着重号</span>。</p><p class="inline-sample">拖选这一行文字查看 ::selection；输入框里的插入符用强调色：<input aria-label="插入符示例" value="光标在这里" style="all:revert;font:inherit;color:inherit;background:transparent;border:0;caret-color:var(--semantic-color-action-primary)"></p></div>${cap({ name: '行内元素', use: '链接用强调色加下划线；行内代码与按键用凹陷表面；高亮与选中用选中高亮色' })}</div>`,
  ].filter(Boolean).join('\n');
}

// 02 shape: space, radius, elevation, layout
function shapeSection() {
  const sem = ['withinGroup', 'betweenGroups', 'section'].filter(k => has(`semantic.space.${k}`));
  const spaceRows = spaces.map(x => `<div class="space-row"><span>${fmt(x.v)}</span><div><div class="bar-s" style="width:${V(`primitive.dimension.space.${x.k}`)}"></div></div><code>space-${x.k}</code></div>`).join('\n');
  const semName = { withinGroup: '组内', betweenGroups: '组间', section: '区块' };
  const rlist = kids('semantic.radius').map(k => ({ k, v: val(`semantic.radius.${k}`) })).filter(x => typeof x.v === 'number').sort((a, b) => a.v - b.v);
  const tiles = rlist.map(x => `<div><div class="tile" style="border-radius:${V(`semantic.radius.${x.k}`)}"></div><div class="cap" style="padding:12px 0 0;text-align:center"><div class="name" style="justify-content:center">${x.k}</div><div class="val" style="text-align:center">${fmt(x.v)}</div>${use(`semantic.radius.${x.k}`, x.k === 'innerMin' ? '内圆角下限' : x.k === 'pill' ? '胶囊' : '') ? `<div class="use" style="margin-top:2px">${use(`semantic.radius.${x.k}`, x.k === 'innerMin' ? '内圆角下限' : x.k === 'pill' ? '胶囊' : '')}</div>` : ''}</div></div>`).join('\n');
  const inner = has('semantic.radius.innerMin') ? `内圆角 = max(外圆角 − 内边距, ${fmt(val('semantic.radius.innerMin'))})` : '';
  const elev = kids('semantic.elevation').filter(k => val(`semantic.elevation.${k}`) !== undefined);
  const lifts = elev.map(k => `<div><div class="lift" style="box-shadow:${V(`semantic.elevation.${k}`)}${k === 'overlay' && rolePath('surface.overlay') ? `;background:${RV('surface.overlay')}` : ''}"></div><div class="cap" style="padding:14px 0 0;text-align:center"><div class="name" style="justify-content:center">${k}</div><div class="val" data-var="${kebab(`semantic.elevation.${k}`)}" style="font-size:11px"></div>${use(`semantic.elevation.${k}`) ? `<div class="use" style="margin-top:2px">${use(`semantic.elevation.${k}`)}</div>` : ''}</div></div>`).join('\n');
  const naElev = ['sunken', 'default', 'raised', 'overlay'].map(k => [k, ROLES[`elevation.${k}`]]).filter(([, r]) => r && typeof r === 'object').map(([k, r]) => `${k}：${esc(r.reason ?? r.status)}`);
  const list = p => kids(p).map(k => `${k} <span data-var="${kebab(`${p}.${k}`)}"></span>`).join(' · ');
  const other = [
    has('semantic.layout.hairline') ? ['发丝线', '<span data-var="--semantic-layout-hairline"></span>', '分隔线与卡片描边'] : null,
    kids('semantic.layout.breakpoint').length ? ['断点', list('semantic.layout.breakpoint'), 'CSS 媒体查询不能读变量，按数值手写'] : catStatus('breakpoint') === 'notApplicable' ? ['断点', NA, esc(CATS.breakpoint?.reason ?? '')] : null,
    kids('semantic.layout.zIndex').length ? ['z-index', list('semantic.layout.zIndex'), '叠层按这一组取值'] : catStatus('zIndex') === 'notApplicable' ? ['z-index', NA, esc(CATS.zIndex?.reason ?? '')] : null,
  ].filter(Boolean);
  return [
    `    <h2>间距、圆角与层级</h2>`,
    `    <p class="sub">${note('shape', `间距 ${spaces.length} 档（${fmt(spaces[0].v)}–${fmt(spaces.at(-1).v)}）${sem.length ? `，语义档${sem.map(k => `${semName[k]} ${fmt(val(`semantic.space.${k}`))}`).join('、')}` : ''}。圆角 ${rlist.length} 档。层级是表面色与阴影成对：暗色模式里层级越高表面越亮。`)}</p>`,
    `<div class="grid g3">`,
    `<div class="card" style="grid-row:span 2">${head('间距', 'primitive.dimension.space')}<div style="padding:14px 0">${spaceRows}</div>${sem.length ? cap({ name: '语义档', use: sem.map(k => `${semName[k]} ${fmt(val(`semantic.space.${k}`))}`).join(' · '), dev: sem.map(k => kebab(`semantic.space.${k}`)).join(' / '), style: 'border-top:1px solid var(--semantic-color-border-subtle)' }) : ''}</div>`,
    `<div class="card span2">${head('圆角', inner)}<div class="stage" style="justify-content:space-around;flex-wrap:wrap">${tiles}</div></div>`,
    `<div class="card span2">${head('层级', 'semantic.elevation')}<div class="stage" style="justify-content:space-around;min-height:200px;flex-wrap:wrap">${lifts || `${MISS}没有 semantic.elevation`}</div>${naElev.length ? cap({ name: '不投影的层', use: naElev.join('；') }) : ''}</div>`,
    `</div>`,
    other.length ? group('其他') + `<div class="card hscroll"><table class="ttable prose" style="min-width:640px"><tr><th>类别</th><th>取值</th><th>说明</th></tr>${other.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</table></div>` : '',
  ].filter(Boolean).join('\n');
}

// 02 material
function materialSection() {
  const st = catStatus('material');
  if (st !== 'present') return `    <h2>材质</h2>\n    <p class="sub">${st === 'notApplicable' ? NA : MISS}${esc(CATS.material?.reason ?? (st === 'notApplicable' ? '界面表面全部不透明' : 'tokens 没有声明材质类别'))}${note('material', '')}</p>`;
  const mats = kids('semantic.material').filter(k => has(`semantic.material.${k}.tint`));
  const cards = mats.map(k => {
    const p = `semantic.material.${k}`, blur = has(`${p}.blur`) ? `blur(${V(`${p}.blur`)})` : '', sat = has(`${p}.saturate`) ? ` saturate(${V(`${p}.saturate`)})` : '';
    const style = `background:${V(`${p}.tint`)};-webkit-backdrop-filter:${blur}${sat};backdrop-filter:${blur}${sat}`;
    const sample = `<div class="material-sample" style="${style}">${icon('search', 'ic')}${k} 材质上的文字</div>`;
    const series = n => SERIES >= n ? V(`semantic.color.dataViz.series.${n}`) : RV('accent');
    return `<div class="card q">${head(k, `tint · ${has(`${p}.blur`) ? 'blur' : ''}${sat ? ' · saturate' : ''}`)}<div class="backdrops"><div class="bd-white"><span class="bd-text" lang="en" aria-hidden="true">Aa Bb Cc 永</span>${sample}</div><div class="bd-black"><span class="bd-text" lang="en" aria-hidden="true">Aa Bb Cc 永</span>${sample}</div><div style="background:${series(1)}"><span style="position:absolute;inset:0 50% 0 0;background:${series(2)}"></span><span style="position:absolute;inset:50% 0 0 0;background:${series(3)}"></span>${sample}</div></div>${cap({ name: `${k} · 压在白、黑与彩色内容上`, use: use(p, ''), dev: [`${p}.tint`, `${p}.blur`, `${p}.saturate`].filter(has).map(kebab).join(' · ') })}</div>`;
  });
  const fallback = `<div class="card q">${head('回退', '降低透明度与高对比')}<div class="stage" style="gap:16px;flex-wrap:wrap"><div class="material-sample solid">${icon('search', 'ic')}实底表面</div></div>${cap({ name: '降低透明度、高对比、不支持 backdrop-filter', use: 'prefers-reduced-transparency 与 prefers-contrast: more 下改用浮层实底表面；浏览器不支持 backdrop-filter 时同样用实底' })}</div>`;
  return [`    <h2>材质</h2>`, `    <p class="sub">${note('material', esc(desc('semantic.material') ?? '半透明表面压在复杂底图上的样子，文字对合成底色的对比度按最坏情况计算。'))}</p>`, `<div class="grid">${cards.join('\n')}\n${fallback}</div>`].join('\n');
}

// 02 states
function statesSection() {
  const st = ['hover', 'focus', 'pressed', 'dragged', 'disabled'];
  const names = { hover: '悬停', focus: '焦点', pressed: '按下', dragged: '拖动', disabled: '禁用' };
  const cells = [`<div><button class="btn btn-secondary state-layer focus-ring">保存</button><small>默认</small></div>`, ...st.map(s => `<div><button class="btn btn-secondary state-layer focus-ring${s === 'disabled' ? '' : ` is-${s}`}"${s === 'disabled' ? ' disabled' : ''}>保存</button><small>${names[s]} <span data-var="${kebab(`semantic.state.${s}.opacity`)}"></span></small></div>`)];
  const surf = ['surface.sunken', 'surface.default', 'surface.raised', 'surface.overlay'].filter(rolePath);
  const ring = rolePath('focusRing.color');
  const minRing = ring ? Math.min(...MODES.flatMap(m => surf.map(s => contrast(val(ring, m), val(rolePath(s), m), m)))).toFixed(2) : null;
  return [
    `    <h2>状态与焦点</h2>`,
    `    <p class="sub">${note('states', '悬停、焦点、按下、拖动是一层 currentColor 叠加，规则统一写在状态层 CSS（规格附录 A），组件不各自写状态色。禁用是元素整体变淡；选中用选中高亮色，不走叠加层。每一格都是真实伪类可以触发的元素，强制类只用于静态展示。')}</p>`,
    `<div class="card q">${head('状态层', '次按钮上的六种状态')}<div class="dev devbar">宿主元素加 state-layer，需要焦点环的再加 focus-ring；强制类 .is-hover / .is-focus / .is-pressed / .is-dragged / .is-disabled</div><div class="states s6">${cells.join('')}</div></div>`,
    `<div class="card q" style="margin-top:16px">${head('焦点环压在四层表面上', ring ? `宽 ${fmt(val(rolePath('focusRing.width')))} · 外扩 ${fmt(val(rolePath('focusRing.offset')))}` : '')}<div class="grid g4" style="gap:0">${surf.map(s => `<div class="stage" style="background:${RV(s)};min-height:140px"><button class="btn btn-primary state-layer focus-ring is-focus">保存</button></div>`).join('')}</div>${cap({ name: '凹陷 · 页面 · 抬升 · 浮层', dataVar: ring ? kebab(ring) : null, use: minRing ? `焦点环对四层表面最低 ${minRing}:1（所有模式）` : `${MISS}meta.roles 没有 focusRing.color`, dev: '--semantic-state-focus-ring · -width · -offset；焦点环由 .focus-ring 画，不用 ring-* 或 box-shadow' })}</div>`,
  ].join('\n');
}

// 02 icons
function iconsSection() {
  if (!ICON_FILES.length) return `    <h2>图标</h2>\n    <p class="sub">${MISS}specimen.json 没有 icons 目录，或目录里没有 SVG。</p>`;
  const sizes = kids('semantic.icon.size').map(k => ({ k, v: val(`semantic.icon.size.${k}`) })).sort((a, b) => a.v - b.v);
  const demo = ['calendar', 'search', 'settings'].find(n => ICONSET.has(n)) ?? ICON_FILES[0].slice(0, -4);
  const sizeCells = sizes.map(x => `<div style="display:flex;flex-direction:column;align-items:center;gap:12px"><svg class="ic" aria-hidden="true" style="width:${V(`semantic.icon.size.${x.k}`)};height:${V(`semantic.icon.size.${x.k}`)}"><use href="#i-${demo}"/></svg><span class="cap-t">${fmt(x.v)} · ${x.k}</span></div>`).join('');
  const missing = [...ICON_MISSING].sort();
  return [
    `    <h2>图标</h2>`,
    `    <p class="sub">${note('icons', `图标集 ${ICON_FILES.length} 个，描边 ${has('semantic.icon.stroke') ? fmt(val('semantic.icon.stroke')) : '未定义'}，颜色跟随文字。`)}</p>`,
    `<div class="card" style="margin-bottom:16px"><div class="stage icon-sizes" style="min-height:140px;gap:56px;color:var(--semantic-color-text-primary)">${sizeCells}</div>${cap({ name: '尺寸', use: sizes.map(x => `${x.k} ${fmt(x.v)}`).join(' · '), dev: sizes.map(x => kebab(`semantic.icon.size.${x.k}`)).join(' / ') + (has('semantic.icon.stroke') ? ' · --semantic-icon-stroke' : '') })}</div>`,
    `<div class="card"><div class="icon-grid">${ICON_FILES.map(f => `<div><svg class="ic" aria-hidden="true"><use href="#i-${f.slice(0, -4)}"/></svg><span>${f.slice(0, -4)}</span></div>`).join('\n')}</div></div>`,
    missing.length ? `<p class="sub" style="margin:16px 0 0">${MISS}图标集里没有这些用途的图标，相应样本不画图标：${missing.join('、')}。可在 specimen.json 的 components.icons 指定替代图标名。</p>` : '',
  ].filter(Boolean).join('\n');
}

// 02 motion
function motionSection() {
  const durs = kids('semantic.motion.duration').map(k => ({ k, v: val(`semantic.motion.duration.${k}`) })).sort((a, b) => a.v - b.v);
  const eases = kids('semantic.motion.easing');
  const ease0 = eases.includes('standard') ? 'standard' : eases[0];
  const cards = durs.map(x => `<div class="card q"><div class="stage plain" style="flex-direction:column;align-items:stretch;gap:20px"><div class="track" style="--d:${V(`semantic.motion.duration.${x.k}`)}"><i style="transition-duration:${V(`semantic.motion.duration.${x.k}`)};transition-timing-function:${V(`semantic.motion.easing.${ease0}`)}"></i></div><button class="btn btn-secondary state-layer focus-ring play" style="align-self:flex-start">播放</button></div>${cap({ name: x.k, dataVar: kebab(`semantic.motion.duration.${x.k}`), use: use(`semantic.motion.duration.${x.k}`), dev: kebab(`semantic.motion.duration.${x.k}`) + (twClass(kebab(`semantic.motion.duration.${x.k}`)) ? ` · Tailwind ${twClass(kebab(`semantic.motion.duration.${x.k}`))}` : '') })}</div>`);
  const curves = eases.map(k => { const [x1, y1, x2, y2] = val(`semantic.motion.easing.${k}`); return `<div class="card"><div class="stage plain"><svg class="curve" viewBox="-10 -10 120 120" aria-hidden="true"><path d="M0 100 H100 M0 100 V0" style="stroke:var(--semantic-color-border-strong)" fill="none"/><path d="M0 100 C${fmt(x1 * 100)} ${fmt(100 - y1 * 100)} ${fmt(x2 * 100)} ${fmt(100 - y2 * 100)} 100 0" style="stroke:var(--semantic-color-text-primary)" stroke-width="2" fill="none"/></svg></div>${cap({ name: k, dataVar: kebab(`semantic.motion.easing.${k}`), use: use(`semantic.motion.easing.${k}`), dev: kebab(`semantic.motion.easing.${k}`) + (twClass(kebab(`semantic.motion.easing.${k}`)) ? ` · Tailwind ${twClass(kebab(`semantic.motion.easing.${k}`))}` : '') })}</div>`; });
  const reduced = has('semantic.motion.reducedMotion') ? `<div class="card pad"><div class="k">减少动态效果</div><p style="margin-bottom:14px">位移、缩放的时长乘以 <code>--semantic-motion-reduced-motion</code>（<span data-var="--semantic-motion-reduced-motion"></span>）。</p><p style="margin-bottom:14px">淡入与状态层的透明度过渡保留；加载转圈停转，骨架屏不再呼吸。</p><p>${use('semantic.motion.reducedMotion')}</p></div>` : `<div class="card pad"><div class="k">${MISS}减少动态效果</div><p>没有 semantic.motion.reducedMotion。</p></div>`;
  return [
    `    <h2>动效</h2>`,
    `    <p class="sub">${note('motion', `时长 ${durs.length} 档（${durs.map(x => fmt(x.v)).join(' / ')} ms），缓动 ${eases.length} 条。点「播放」看实际速度；系统开启「减少动态效果」时位移与缩放直接到终态。`)}</p>`,
    grid(3, cards), grid(2, [...curves, reduced], ' style="margin-top:16px"'),
  ].join('\n');
}

// 02 charts
function chartsSection() {
  if (!SERIES) return `    <h2>数据可视化</h2>\n    <p class="sub">${catStatus('dataViz') === 'notApplicable' ? NA : MISS}${esc(CATS.dataViz?.reason ?? 'tokens 没有系列色')}</p>`;
  const chips = kids('semantic.color.dataViz.series').map(k => { const p = `semantic.color.dataViz.series.${k}`, v = kebab(p), sh = SH.get(v); return `<div class="card"><div class="chip" data-token="${p}" style="background:var(${v})"></div>${cap({ name: `系列 ${k}`, dataVar: v, dev: sh ? `shadcn fill-${sh}` : `var(${v})` })}</div>`; });
  const strip = kind => kids(`semantic.color.dataViz.${kind}`).length ? `<div><div class="ramp-label">${kind === 'sequential' ? '顺序色' : '发散色'} ${kind} 1–${kids(`semantic.color.dataViz.${kind}`).length}</div><div style="display:flex;height:36px;border-radius:8px;overflow:hidden">${kids(`semantic.color.dataViz.${kind}`).map(k => `<i data-token="semantic.color.dataViz.${kind}.${k}" style="flex:1;background:${V(`semantic.color.dataViz.${kind}.${k}`)}"></i>`).join('')}</div></div>` : '';
  const borrowed = !['gridline', 'axis', 'track'].every(k => has(`semantic.color.dataViz.${k}`));
  const ramps = [strip('sequential'), strip('diverging')].filter(Boolean);
  return [
    `    <h2>数据可视化</h2>`,
    `    <p class="sub">${note('charts', '系列色按编号顺序取用，两条数据用 1、2，三条用 1–3，不跳号挑色；系列色不当文字颜色。散点、气泡、小倍数这类任意两个系列都可能挨在一起的图最多用系列 1–3；折线、柱状图用到 4 个及以上时在线尾或数据点旁直接标注系列名。')}</p>`,
    grid(6, chips, ' style="margin-bottom:16px"'),
    `<div class="grid g2">`,
    `<div class="card"><div class="stage plain" style="padding:28px"><svg id="line-chart" viewBox="0 0 520 260" style="width:100%" role="img" aria-label="折线图：三个区域十二周的数值"></svg></div>${cap({ name: '折线 · 系列 1–3', val: '线宽 2 · 线尾直接标注', use: borrowed ? `${MISS}网格线借用分隔线色，坐标轴文字借用弱文字色` : '' })}</div>`,
    `<div class="card"><div class="stage plain" style="padding:28px"><svg id="bar-chart" viewBox="0 0 520 260" style="width:100%" role="img" aria-label="柱状图：三个系列六天的数值"></svg></div>${cap({ name: '分组柱状 · 系列 1–3', val: '柱宽 14 · 柱间 4' })}</div>`,
    `<div class="card"><div class="stage plain" style="padding:28px"><svg id="area-chart" viewBox="0 0 520 260" style="width:100%" role="img" aria-label="面积图：两个系列十二周的累计值"></svg></div>${cap({ name: '面积 · 系列 1–2', val: '填充 24% · 描边 2' })}</div>`,
    `<div class="card"><div class="stage plain" style="padding:28px"><svg id="scatter" viewBox="0 0 520 260" style="width:100%" role="img" aria-label="散点图：三组样本的次数与数值"></svg></div>${cap({ name: '散点 · 只用系列 1–3', val: '点径 8 · 描边 2 页面色' })}</div>`,
    `<div class="card"><div class="stage plain" style="padding:28px;gap:40px;flex-wrap:wrap"><svg id="donut" viewBox="0 0 200 200" style="width:180px" role="img" aria-label="环形图：四类来源占比"></svg><div id="donut-legend" class="q" style="display:flex;flex-direction:column;gap:10px;font-size:13px"></div></div>${cap({ name: `环形 · 系列 1–${Math.min(4, SERIES)}`, val: '环宽 28', use: borrowed ? `${MISS}轨道借用凹陷表面` : '' })}</div>`,
    ramps.length ? `<div class="card"><div class="stage plain" style="flex-direction:column;align-items:stretch;gap:20px;padding:36px 28px">${ramps.join('')}</div>${cap({ name: '顺序与发散', val: '热力图用顺序色；高于或低于基准的值用发散色', dev: '--semantic-color-data-viz-sequential-&lt;n&gt; / -diverging-&lt;n&gt;' })}</div>` : '',
    `</div>`,
  ].filter(Boolean).join('\n');
}

// 03 components
const stateRow = (btn, label) => ['默认', '悬停', '按下', '键盘焦点', '禁用'].map((n, i) => `<div>${btn(['', ' is-hover', ' is-pressed', ' is-focus', ''][i], i === 4 ? ' disabled' : '', label)}<small>${n}</small></div>`).join('');
function buttonsSection() {
  const b = cls => (s, d, l) => `<button class="btn ${cls} state-layer focus-ring${s}"${d}>${l}</button>`;
  const noti = iconName('notification') ? 'notification' : iconName('settings') ? 'settings' : 'add';
  const ib = (s, d) => `<button class="btn btn-icon state-layer focus-ring${s}"${d} aria-label="通知">${icon(noti)}</button>`;
  const dv = (k, p) => [twClass(kebab(p), k) ? `Tailwind ${twClass(kebab(p), k)}` : '', shClass(kebab(p), k) ? `shadcn ${shClass(kebab(p), k)}` : ''].filter(Boolean).join(' · ');
  const sizes = has('semantic.size.control.md') || kids('semantic.size').length;
  return [
    `    <h2>按钮</h2>`,
    `    <p class="sub">${note('buttons', '四种按钮 × 五种状态。悬停、按下、焦点由状态层统一叠加，组件里不另写状态色；需要被发现的禁用用 aria-disabled。')}</p>`,
    `<div class="grid">`,
    `<div class="card q">${head('主按钮', '强调色底 + 强调上的文字')}<div class="dev devbar">${dv('bg', rolePath('accent'))}</div><div class="states">${stateRow(b('btn-primary'), '保存')}</div></div>`,
    `<div class="card q">${head('次按钮', '抬升表面 + 控件边框')}<div class="states">${stateRow(b('btn-secondary'), '分享')}</div></div>`,
    `<div class="card q">${head('文字按钮', '强调色字，无底')}<div class="states">${stateRow(b('btn-text'), '查看全部')}</div></div>`,
    `<div class="card q">${head('图标按钮', '44 × 44；必须有 aria-label')}<div class="states">${stateRow(ib)}</div></div>`,
    `</div>`,
    `<div class="grid g2" style="margin-top:16px">`,
    `<div class="card q">${head('提交中', '仍可聚焦，事件里拦截')}<div class="stage plain" style="flex-wrap:wrap;gap:16px"><button class="btn btn-primary state-layer focus-ring" data-demo="submit">${icon('loading', 'ic spin', ' hidden')}<span>提交</span></button><button class="btn btn-primary state-layer focus-ring" aria-disabled="true">${icon('loading', 'ic spin')}提交中</button><button class="btn btn-secondary state-layer focus-ring" aria-disabled="true">已售罄</button></div>${cap({ name: '点第一个按钮看提交过程', use: '提交中除禁用外还要有可见的进行中状态；需要被发现的禁用仍可聚焦，按下时说明原因' })}</div>`,
    `<div class="card q">${head('危险操作', '只在确认弹层里出现')}<div class="stage plain" style="flex-wrap:wrap;gap:16px"><button class="btn btn-danger state-layer focus-ring">删除</button><button class="btn btn-danger state-layer focus-ring is-hover">删除</button><button class="btn btn-danger state-layer focus-ring is-focus">删除</button></div>${cap({ name: '错误色字 + 错误色边框', use: '抬升表面加错误色；实心危险按钮需要单独的 token' })}</div>`,
    `</div>`,
    sizes ? '' : `<p class="sub" style="margin:16px 0 0">${MISS}控件尺寸没有进 token（如 semantic.size.control），本页按钮与输入框按最小高度 44 绘制，只有一档。</p>`,
  ].filter(Boolean).join('\n');
}
function formsSection() {
  return [
    `    <h2>表单</h2>`,
    `    <p class="sub">${note('forms', '输入框是抬升表面加控件边框，聚焦时只显示焦点环、叠加层归零。出错时边框换错误色，下方给图标和一句说明。')}</p>`,
    `<div class="grid g3">`,
    `<div class="card q">${head('输入框', '空 · 聚焦 · 出错 · 禁用 · 只读')}<div class="dev devbar">外层 state-layer focus-ring is-field；标签在输入框上方</div><div class="stage plain" style="padding:28px 24px 32px"><div class="stack">
<div><label class="lbl" for="f1">显示名称</label><div class="field state-layer focus-ring is-field"><input id="f1" autocomplete="nickname" placeholder="例如：林一"></div></div>
<div><label class="lbl" for="f2">搜索</label><div class="field state-layer focus-ring is-field is-focus">${icon('search')}<input id="f2" type="search" value="设计" aria-describedby="f2h"></div><div class="help" id="f2h">键盘焦点</div></div>
<div><label class="lbl" for="f3">数量</label><div class="field is-error"><input id="f3" inputmode="numeric" value="12" aria-invalid="true" aria-describedby="f3h"></div><div class="help err" id="f3h" role="alert">${icon('error', 'ic sm')}最多 10 个</div></div>
<div><label class="lbl" for="f4">账号</label><div class="field state-layer is-field"><input id="f4" value="lin@example.com" disabled></div></div>
<div><label class="lbl" for="f5">编号</label><div class="field is-readonly"><input id="f5" value="A-2048" readonly></div></div>
<div><label class="lbl" for="f6">备注</label><textarea id="f6" class="area" placeholder="多行输入"></textarea></div>
</div></div></div>`,
    `<div class="card q">${head('开关、复选与单选', '开关 48 × 28')}<div class="stage plain" style="padding:28px 24px 32px;align-items:flex-start"><div class="stack" style="gap:18px">
<div class="opt" style="justify-content:space-between"><span>接收通知</span><span class="switch on"></span></div>
<div class="opt" style="justify-content:space-between"><span>自动备份</span><span class="switch"></span></div>
<div class="opt" style="justify-content:space-between;opacity:var(--semantic-state-disabled-opacity)"><span>离线模式（不可用）</span><span class="switch"></span></div>
<div style="height:1px;background:var(--semantic-color-border-subtle)"></div>
<div class="opt"><span class="check on">${icon('check')}</span>已选</div>
<div class="opt"><span class="check mixed"></span>部分选中</div>
<div class="opt"><span class="check"></span>未选</div>
<div class="opt" style="opacity:var(--semantic-state-disabled-opacity)"><span class="check"></span>禁用</div>
<div style="height:1px;background:var(--semantic-color-border-subtle)"></div>
<div class="opt"><span class="radio on"></span>按月</div>
<div class="opt"><span class="radio"></span>按年</div>
</div></div></div>`,
    `<div class="card q">${head('分段控件', '凹陷轨道 + 抬升滑块')}<div class="dev devbar">当前项标 aria-pressed；超过 4 个选项改用列表或选择器</div><div class="stage plain" style="flex-direction:column;gap:20px;padding:40px 24px">
<div class="seg"><button class="on" aria-pressed="true">列表</button><button aria-pressed="false">网格</button></div>
<div class="seg"><button aria-pressed="false">日</button><button aria-pressed="false">周</button><button class="on" aria-pressed="true">月</button><button aria-pressed="false">年</button></div>
<div class="seg" style="opacity:var(--semantic-state-disabled-opacity)"><button aria-pressed="true" class="on" disabled>禁用</button><button aria-pressed="false" disabled>不可选</button></div>
</div></div>`,
    `</div>`,
  ].join('\n');
}
function navsSection() {
  const tab = (role, label, cur) => `<a class="state-layer focus-ring" href="#navs"${cur ? ' aria-current="page"' : ''}>${icon(role)}${label}</a>`;
  return [
    `    <h2>导航与列表</h2>`,
    `    <p class="sub">${note('navs', '当前项用强调色与加粗。列表选中用选中高亮色，不走叠加层；分组列表行间发丝线从左侧内缩。')}</p>`,
    `<div class="grid g2">`,
    `<div class="card q">${head('标签栏', '每项最小高 52')}<div class="stage" style="align-items:flex-end;padding:40px 0 0"><nav class="tabbar" style="width:100%" aria-label="主导航">${tab('home', '首页', true)}${tab('search', '发现')}${tab('notification', '消息')}${tab('user', '我的')}</nav></div>${cap({ name: '当前项 · 其他项', use: '当前项强调色 + 字重加一档；其他项弱文字色。底部内边距加上安全区' })}</div>`,
    `<div class="card q">${head('标签页', '下划线指示当前项')}<div class="stage plain" style="padding:40px 24px"><nav class="tabs" aria-label="标签页"><a class="state-layer focus-ring" href="#navs" aria-current="page">概览</a><a class="state-layer focus-ring" href="#navs">成员</a><a class="state-layer focus-ring is-hover" href="#navs">账单</a><a class="state-layer focus-ring" href="#navs">设置</a></nav></div>${cap({ name: '当前 · 悬停 · 默认', use: '第 3 项悬停；当前项文字主色 + 强调色下划线' })}</div>`,
    `<div class="card q">${head('列表', '选中行用选中高亮')}<div class="stage plain" style="padding:24px 16px"><div class="list">
<button class="state-layer focus-ring" aria-pressed="false">项目一<span class="v">3 项${icon('next', 'ic sm')}</span></button>
<button class="state-layer focus-ring" aria-pressed="true">项目二<span class="v">12 项${icon('check', 'ic sm')}</span></button>
<button class="state-layer focus-ring is-hover" aria-pressed="false">项目三<span class="v">5 项${icon('next', 'ic sm')}</span></button>
<button class="state-layer focus-ring" aria-pressed="false">项目四<span class="v">8 项${icon('next', 'ic sm')}</span></button>
</div></div>${cap({ name: '选中 · 悬停 · 默认', use: '第 2 行选中（同时给对勾），第 3 行悬停' })}</div>`,
    `<div class="card q">${head('分组列表', '发丝线内缩')}<div class="stage plain" style="padding:24px 16px;align-items:stretch"><div class="glist" style="width:100%">
<div><span>语言</span><span class="v">简体中文${icon('next', 'ic sm')}</span></div>
<div><span>时区</span><span class="v">UTC+8${icon('next', 'ic sm')}</span></div>
<div><span>接收通知</span><span class="switch on"></span></div>
<div><span>自动备份</span><span class="switch"></span></div>
</div></div>${cap({ name: '设置项', use: '右侧值用弱文字色，可进入的行带箭头' })}</div>`,
    `</div>`,
  ].join('\n');
}
function feedbackSection() {
  return [
    `    <h2>反馈与浮层</h2>`,
    `    <p class="sub">${note('feedback', '成功、警告、错误一律同时给图标和文字。提示条和菜单用浮层表面加浮层阴影；底部弹层见「页面模式 · 危险操作确认」。')}</p>`,
    `<div class="grid g3">`,
    `<div class="card q">${head('提示', '状态色图标 + 正文色文字')}<div class="stage plain" style="flex-direction:column;align-items:stretch;gap:10px;padding:24px 20px">
<div class="notice success" role="status">${icon('success')}<span>已保存，所有设备都会同步。</span></div>
<div class="notice warning" role="status">${icon('warning')}<span>存储空间还剩 10%，满了以后不能上传。</span></div>
<div class="notice error" role="alert">${icon('error')}<span>上传没有完成，文件已保留，可以重试。</span></div>
</div>${cap({ name: '成功 · 警告 · 错误' })}</div>`,
    `<div class="card q">${head('徽标与状态标签', '徽标填色；状态标签描边')}<div class="stage plain" style="flex-direction:column;align-items:flex-start;gap:20px;padding:28px 24px">
<div style="display:flex;flex-wrap:wrap;gap:8px"><span class="badge">新</span><span class="badge">3 条未读</span></div>
<div style="display:flex;flex-wrap:wrap;gap:8px"><span class="tag ok">${icon('success', 'ic sm')}已完成</span><span class="tag warn">${icon('time', 'ic sm')}待处理</span><span class="tag err">${icon('close', 'ic sm')}已取消</span><span class="tag neu">已归档</span></div>
</div>${cap({ name: '徽标 · 状态标签', use: '状态标签图标 + 文字，不只靠颜色', dev: `徽标底 ${kebab(BADGE.fill)} · 字 ${kebab(BADGE.text)}` })}</div>`,
    `<div class="card q">${head('提示条与菜单', '浮层表面 · 浮层阴影')}<div class="stage" style="flex-direction:column;align-items:stretch;gap:20px;padding:28px 20px">
<div class="toast" role="status">${icon('success')}已移到回收站<button class="btn btn-text state-layer focus-ring">撤销</button></div>
<div class="menu" style="align-self:flex-end"><div class="row">${icon('settings')}设置</div><div class="row state-layer is-hover">${icon('user')}邀请成员</div><hr><div class="row" style="color:var(--semantic-color-feedback-error)">${icon('close')}删除</div></div>
</div>${cap({ name: '提示条 · 菜单', use: '菜单第 2 项悬停；危险项放最后，用分隔线隔开' })}</div>`,
    `</div>`,
  ].join('\n');
}

// 04 page patterns (neutral copy)
function patternsSection() {
  const tabbar = cur => `<nav class="tabbar" aria-label="主导航">${[['home', '首页'], ['search', '发现'], ['notification', '消息'], ['user', '我的']].map(([r, l], i) => `<a href="#patterns"${i === cur ? ' aria-current="page"' : ''}>${icon(r)}${l}</a>`).join('')}</nav>`;
  const phone = (body, name, useText) => `<div class="card"><div class="pattern"><div class="phone q"><div class="sbar"><span>9:41</span></div>${body}</div></div>${cap({ name, use: useText })}</div>`;
  const mark = (w, attrs = '') => logo.symbol ? themed(logo.symbol, logo.symbolReverse, `alt="" style="width:${w}px"${attrs}`) : '';
  const lockup = logo.lockup ? themed(logo.lockup, logo.lockupReverse, `alt="${esc(brand)}" style="height:36px;width:auto;align-self:flex-start"`) : mark(40, ' ');
  return [
    `    <h2>页面模式 · 通用</h2>`,
    `    <p class="sub">${note('patterns', '组件拼成页面后的样子，按 390 宽 1:1 绘制，只用前面各节已有的组件。文案是渲染器内置的中性示例，不读项目业务数据。')}</p>`,
    `<div class="grid g2">`,
    phone(`<div class="scr" style="padding-top:calc(var(--sp-6) * 2);gap:calc(var(--sp-4) + var(--sp-1))">${lockup}<div><h3 class="h1">登录</h3><p class="body" style="margin-top:calc(var(--sp-1) * 1.5)">用邮箱登录，数据会同步到这台设备。</p></div><div><label class="lbl" for="l1">邮箱</label><div class="field state-layer focus-ring is-field"><input id="l1" type="email" autocomplete="email" placeholder="name@example.com"></div></div><div><label class="lbl" for="l2">密码</label><div class="field state-layer focus-ring is-field"><input id="l2" type="password" autocomplete="current-password" placeholder="至少 8 位"></div></div><button class="btn btn-primary btn-block state-layer focus-ring">登录</button><p class="cap-t" style="text-align:center">登录即表示同意 <a class="link" href="#patterns">用户协议</a> 和 <a class="link" href="#patterns">隐私政策</a></p></div>`, '登录', '一个主按钮；链接带下划线；字段标签在输入框上方'),
    phone(`<div class="appbar"><h3 class="h2">文件</h3></div><div class="scr"><div class="item-card"><span class="badge">新</span><h4 class="h3">季度报告.pdf</h4><p class="body">2.4 MB · 今天 10:20</p></div></div><div class="scrim"><div class="sheet"><span class="grab" aria-hidden="true"></span><h3 class="h3">删除这个文件？</h3><p class="body">「季度报告.pdf」会移到回收站，30 天后彻底删除。</p><button class="btn btn-danger btn-block state-layer focus-ring">删除</button><button class="btn btn-secondary btn-block state-layer focus-ring">取消</button></div></div>`, '危险操作确认', `底部弹层 · 顶角大圆角 · 浮层阴影；打开时焦点落在「取消」，Esc 与「取消」都能关闭。${SCRIM ? '' : `${MISS}遮罩是临时值，见颜色一节「缺的角色」`}`),
    phone(`<div class="appbar"><h3 class="h2">设置</h3></div><div class="scr" style="gap:0"><div class="cap-t ghead" style="margin-top:var(--sp-2)">通知</div><div class="glist"><div><span>接收通知<span class="cap-t" style="display:block">新消息与提醒</span></span><span class="switch on"></span></div><div><span>邮件摘要</span><span class="switch"></span></div></div><div class="cap-t ghead">偏好</div><div class="glist"><div><span>语言</span><span class="v">简体中文${icon('next', 'ic sm')}</span></div><div><span>外观</span><span class="v">跟随系统${icon('next', 'ic sm')}</span></div></div><div class="cap-t ghead">账号</div><div class="glist"><div><span style="color:var(--semantic-color-feedback-error)">退出登录</span></div></div></div>${tabbar(3)}`, '设置', '分组标题用注释字阶；退出登录用错误色字，不做成按钮'),
    phone(`<div class="appbar"><h3 class="h2">文件</h3></div><div class="center">${mark(64)}<h3 class="h2" style="margin-top:var(--sp-2)">还没有文件</h3><p class="body">上传第一个文件，团队成员都能看到。</p><button class="btn btn-primary state-layer focus-ring" style="margin-top:var(--sp-2)">${icon('add')}上传文件</button></div>${tabbar(0)}`, '空状态', '品牌符号 + 一句说明 + 一个主按钮'),
    phone(`<div class="appbar"><h3 class="h2">首页</h3></div><div class="scr"><div class="skel" style="height:40px"></div><div class="skel" style="height:196px;border-radius:var(--sp-radius-card)"></div><div class="skel" style="height:196px;border-radius:var(--sp-radius-card)"></div></div>${tabbar(0)}`, '加载中', '骨架屏用凹陷表面，整块透明度呼吸；减少动态效果时静止。加载不用标志自旋'),
    phone(`<div class="appbar"><h3 class="h2">发现</h3></div><div class="center">${icon('error', 'ic', ' style="width:48px;height:48px;color:var(--semantic-color-feedback-error)"')}<h3 class="h2" style="margin-top:var(--sp-2)">没连上网络</h3><p class="body">检查网络后重试，已填的内容会保留。</p><button class="btn btn-secondary state-layer focus-ring" style="margin-top:var(--sp-2)">重试</button></div>${tabbar(1)}`, '整页错误', '标题说发生了什么，正文说怎么办；重试用次按钮'),
    `</div>`,
  ].join('\n');
}

// 06 dev
function devSection() {
  const P = cfg.devPrefix ?? 'brand/';
  const files = [[tok('tokens.css'), 'token'], cfg.fonts && [cfg.fonts, '字体'], cfg.stateLayer && [cfg.stateLayer, '状态层']].filter(Boolean);
  const link = f => `&lt;link rel="stylesheet" href="${P}${path.posix.normalize(f[0])}"&gt;`;
  const tw = TWSRC ? pre([`@import "tailwindcss";`, `@import "./${P}${path.posix.normalize(tok('tokens.tailwind.css'))}";`, cfg.fonts ? `@import "./${P}${cfg.fonts}";` : '', `<span class="c">/* 不进 base 层时，状态层的 position: relative 会压过 absolute / fixed */</span>`, cfg.stateLayer ? `@import "./${P}${cfg.stateLayer}" layer(base);` : ''].filter(Boolean).join('\n')) : '';
  const rows = [
    ['页面底', 'surface.default', 'bg'], ['卡片', 'surface.raised', 'bg'], ['浮层', 'surface.overlay', 'bg'], ['凹陷', 'surface.sunken', 'bg'], ['选中', 'selection', 'bg'],
    ['正文', 'text.primary', 'text'], ['次要文字', 'text.secondary', 'text'], ['弱文字', 'text.tertiary', 'text'], ['强调', 'accent', 'bg'], ['强调上的文字', 'onAccent', 'text'],
    ['分隔线', 'divider', 'border'], ['成功', 'feedback.success', 'text'], ['警告', 'feedback.warning', 'text'], ['错误', 'feedback.error', 'text'],
  ].filter(r => rolePath(r[1])).map(([n, k, pfx]) => { const v = kebab(rolePath(k)); return `<tr><td>${n}</td><td><code>${v}</code></td>${TWSRC ? `<td>${twClass(v, pfx) ? `<code>${twClass(v, pfx)}</code>` : `<code>${pfx}-(${v})</code>`}</td>` : ''}${SHSRC ? `<td>${shClass(v, pfx) ? `<code>${shClass(v, pfx)}</code>` : `<code>${pfx}-(${v})</code>`}</td>` : ''}</tr>`; });
  const typeRows = UI_STEPS.map(k => { const v = `--semantic-typography-${kebab(k).slice(2)}-font-size`; return `<tr><td>字阶 ${TYPE_NAME[k] ?? k}</td><td><code>--semantic-typography-${kebab(k).slice(2)}-*</code></td>${TWSRC ? `<td>${twClass(v, 'text') ? `<code>${twClass(v, 'text')}</code>` : '—'}</td>` : ''}${SHSRC ? `<td>${SHT.has(v) ? `<code>${SHT.get(v)}</code>` : '—'}</td>` : ''}</tr>`; });
  const rebuild = (cfg.rebuild ?? [`<span class="c"># 改值只改 tokens.json 或 modes/，然后重新生成派生文件与本页</span>`, `uv run --quiet python &lt;visual-system 技能目录&gt;/vendor/theme-extract/scripts/build_tokens.py ${TOK} --emit all`, `node &lt;visual-system 技能目录&gt;/scripts/specimen/render-specimen.mjs .`, `NODE_PATH=$(npm root -g) node &lt;visual-system 技能目录&gt;/scripts/specimen/check-specimen.mjs .`]).join('\n');
  return [
    `    <h2>接入</h2>`,
    `    <p class="sub">${note('dev', `样例页和产品页面引用同一组文件，按顺序引入；模式只由 &lt;html&gt; 的 data-theme 决定，不设时跟随系统。打开顶栏的「开发视图」，每张卡下方显示变量名与类名。`)}</p>`,
    `<div class="grid g2">`,
    `<div class="card">${head('引入顺序', 'HTML')}${pre([`<span class="c">&lt;!-- ${files.map((f, i) => `${i + 1} ${f[1]}`).join(' · ')} --&gt;</span>`, ...files.map(link), '', `<span class="c">&lt;!-- light / dark，不设 = 跟随系统 --&gt;</span>`, `&lt;html lang="${esc(cfg.lang ?? 'zh-CN')}" data-theme="dark"&gt;`].join('\n'))}</div>`,
    tw ? `<div class="card">${head('Tailwind v4', '适配文件会带上 tokens.css；状态层进 base 层')}${tw}</div>` : '',
    `<div class="card">${head('全局规则', '写在引入 token 与字体之后')}${pre([`<span class="c">/* 可变字体必须显式写字重，不让浏览器合成 */</span>`, `:root { font-synthesis: none; color-scheme: light; }`, `:root[data-theme="dark"] { color-scheme: dark; }`, `@media (prefers-color-scheme: dark) {`, `  :root:not([data-theme="light"]) { color-scheme: dark; }`, `}`, `<span class="c">/* 带 lang 的元素重套正文字阶：继承来的字体栈不随 :lang 覆盖切换 */</span>`, `:where(body, body [lang]) {`, `  font-family: var(--semantic-typography-body-font-family);`, `  font-size: var(--semantic-typography-body-font-size);`, `  line-height: var(--semantic-typography-body-line-height);`, `  letter-spacing: var(--semantic-typography-body-letter-spacing);`, `}`, ...(TWSRC ? [`<span class="c">/* Tailwind 的 dark: 与 tokens.css 同一判据 */</span>`, `@custom-variant dark {`, `  &amp;:where([data-theme="dark"], [data-theme="dark"] *) { @slot; }`, `  @media (prefers-color-scheme: dark) {`, `    &amp;:where(:root:not([data-theme="light"]), :root:not([data-theme="light"]) *) { @slot; }`, `  }`, `}`] : [])].join('\n'))}</div>`,
    `<div class="card">${head('主按钮', '状态全部来自状态层')}${pre([`&lt;button class="state-layer focus-ring …"&gt;保存&lt;/button&gt;`, '', `<span class="c">&lt;!-- 提交中：仍可聚焦，事件里拦截 --&gt;</span>`, `&lt;button aria-disabled="true" class="state-layer focus-ring …"&gt;`, `  &lt;svg class="animate-spin"&gt;…&lt;/svg&gt;提交中`, `&lt;/button&gt;`].join('\n'))}</div>`,
    `</div>`,
    group('产品代码里的写法', '从适配文件读出；适配文件没映射的写变量'),
    `<div class="card hscroll"><table class="ttable prose" style="min-width:760px"><tr><th>用途</th><th>CSS 变量</th>${TWSRC ? '<th>tokens.tailwind.css</th>' : ''}${SHSRC ? '<th>tokens.shadcn.css</th>' : ''}</tr>${rows.join('')}${typeRows.join('')}</table></div>`,
    group('修改与重建', 'tokens.css、适配文件与本页都是生成物，不手改'),
    `<div class="card">${pre(rebuild)}</div>`,
    typeof SECTION_CFG.dev === 'string' ? fillFragment(read(SECTION_CFG.dev), SECTION_CFG.dev) : '',
  ].filter(Boolean).join('\n');
}

// 06 token tables
function tokensSection() {
  const block = sel => { const m = CSS.match(new RegExp(`^${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{\\n([\\s\\S]*?)^\\}`, 'm')); return m ? Object.fromEntries([...m[1].matchAll(/^\s*(--[\w-]+):\s*(.+?);\s*$/gm)].map(x => [x[1], x[2]])) : null; };
  const light = block(':root');
  if (!light) die('tokens.css has no top-level :root block');
  const dark = block('[data-theme="dark"]') ?? {};
  const cell = v => /^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/.test(v) ? `<span class="sw" style="background:${esc(v)}"></span>${esc(v)}` : esc(v);
  const table = (h, rows) => `<div class="hscroll"><table class="ttable" style="min-width:640px"><tr><th>变量</th><th>${h[0]}</th><th>${h[1]}</th></tr>${rows.map(([n, a, b]) => `<tr><td>${esc(n)}</td><td>${a}</td><td>${b}</td></tr>`).join('')}</table></div>`;
  const GROUPS_T = [['语义 · 颜色', ['--semantic-color-']], ['语义 · 字阶', ['--semantic-typography-']], ['语义 · 间距、圆角、布局与图标', ['--semantic-space-', '--semantic-radius-', '--semantic-layout-', '--semantic-icon-']], ['语义 · 层级、状态、动效与材质', ['--semantic-elevation-', '--semantic-state-', '--semantic-motion-', '--semantic-material-']], ['基础值 primitive', ['--primitive-']]];
  const out = GROUPS_T.map(([t, pf]) => { const rows = Object.keys(light).filter(n => pf.some(p => n.startsWith(p))).map(n => [n, cell(light[n]), n in dark && dark[n] !== light[n] ? cell(dark[n]) : '同浅色']); return rows.length ? `<details class="tok"><summary><b>${t}</b><span>${rows.length} 项</span></summary>${table(['浅色', '深色'], rows)}</details>` : ''; });
  const langs = [...CSS.matchAll(/^\[lang\]:lang\((\w+)\) \{/gm)].map(m => m[1]);
  for (const l of langs) { const other = block(`[lang]:not(:lang(${l}))`) ?? {}, ov = block(`[lang]:lang(${l})`) ?? {}; const rows = Object.keys(ov).map(n => [n, cell(other[n] ?? light[n] ?? ''), cell(ov[n])]); out.push(`<details class="tok"><summary><b>语言覆盖 · <code>[lang]:lang(${l})</code></b><span>${rows.length} 项</span></summary>${table([`其他语言`, l], rows)}</details>`); }
  return [`    <h2>全部 token</h2>`, `    <p class="sub">${note('tokens', `从 tokens.css 逐项列出，浅色与深色并排。字阶的字体族与字距按语言覆盖：元素带 lang 时取「语言覆盖」表。展开分组查看。`)}</p>`, `<div class="card">${out.filter(Boolean).join('\n')}</div>`].join('\n');
}

// 06 notUsed
function notUsedSection() {
  const items = META.notUsed ?? [];
  const cards = items.map(x => { const c = x.css; const how = c ? `机械检查：${c.property ? `属性 <code>${esc(c.property)}</code>` : ''}${c.property && c.valuePattern ? '，' : ''}${c.valuePattern ? `值匹配 <code>${esc(c.valuePattern)}</code>` : ''}` : '人工核对'; return `<div class="card pad"><div class="dont" style="margin-bottom:14px">${icon('close', 'ic sm')}${esc(x.id)}</div><p>${esc(x.note ?? '')}</p><p class="nu-how">${how}</p></div>`; });
  return [`    <h2>本系统不用</h2>`, `    <p class="sub">${note('notused', `tokens.json meta.notUsed 共 ${items.length} 条：带 CSS 匹配的由 check-tokens --lint 与样例页验收脚本机械检查（只扫样本层），其余人工核对。`)}</p>`, items.length ? grid(4, cards) : `<p class="sub">${MISS}meta.notUsed 为空。</p>`].join('\n');
}

// 06 stress tests
function stressSection() {
  return [
    `    <h2>压力测试</h2>`,
    `    <p class="sub">${note('stress', '中英混排、超长标题与超长按钮文字。验收脚本在 390 宽与 WCAG 1.4.12 文字间距覆盖下检查每节不横向溢出，390 宽代替 200% 缩放。')}</p>`,
    grid(3, [
      `<div class="card q"><div class="stage plain" style="padding:28px"><p class="body" lang="zh-CN" style="text-autospace:normal;color:var(--semantic-color-text-primary)">用Design Token管理2026版的颜色与间距，导出到iOS、Android和Web三个平台。</p></div>${cap({ name: '中英混排', use: '中西文间距交给 text-autospace: normal，源文本不手打空格；不支持的浏览器显示为紧排' })}</div>`,
      `<div class="card q"><div class="stage plain" style="padding:28px"><h4 class="h2" lang="zh-CN" style="max-width:16em">一个非常长的标题用来检查折行之后的行高与段前段后间距是否仍然成立</h4></div>${cap({ name: '超长标题', use: '折行，不截断，不缩字号' })}</div>`,
      `<div class="card q"><div class="stage plain" style="padding:28px;flex-direction:column;gap:12px"><button class="btn btn-primary state-layer focus-ring truncate"><span>把所有选中的文件移动到共享文件夹</span></button><button class="btn btn-secondary state-layer focus-ring">取消</button></div>${cap({ name: '超长按钮文字', use: '按钮不折行时截断加省略号，完整文字放在 title 或旁边的说明里' })}</div>`,
    ]),
  ].join('\n');
}

// ---- assemble ----
const facts = cfg.hero?.facts?.map(f => f.map(T)) ?? [
  [`${UI_STEPS.length} 档`, `界面字阶${DISPLAY_STEPS.length ? `，另有展示字阶 ${DISPLAY_STEPS.length} 档` : ''}`],
  [`${SERIES || '—'} 色`, SERIES ? '图表系列色' : '没有图表系列色'],
  [`${ICON_FILES.length} 个`, '图标'],
  [`${MODES.length} 套`, MODES.length > 1 ? '浅色与深色逐项对应' : '只有浅色'],
];
const hero = Object.fromEntries(Object.entries(cfg.hero ?? {}).map(([k, v]) => [k, typeof v === 'string' && !['panel', 'panelImage', 'titleLang'].includes(k) ? T(v) : v]));
const symbolSmall = logo.symbolSmall ?? logo.symbol, symbolSmallRev = logo.symbolSmallReverse ?? logo.symbolReverse;
const topMark = [symbolSmall && themed(symbolSmall, symbolSmallRev, 'width="28" height="28" alt=""'), logo.wordmark && themed(logo.wordmark, logo.wordmarkReverse, 'class="wm" alt=""').replace(/class="theme-(light|dark)-only" class="wm"/g, 'class="wm theme-$1-only"')].filter(Boolean).join('');
const BODY = [
  section('brand', 'brand', fragment('brand', '品牌概述')),
  ...BRAND_SECTIONS.slice(1).map(([id, t]) => section(id, 'brand', fragment(id, t))),
  section('color', 'base', colorSection()), section('type', 'base', typeSection()), section('shape', 'base', shapeSection()),
  section('material', 'base', materialSection()), section('states', 'base', statesSection()), section('icons', 'base', iconsSection()),
  section('motion', 'base', motionSection()), section('charts', 'base', chartsSection()),
  section('buttons', 'comp', buttonsSection()), section('forms', 'comp', formsSection()), section('navs', 'comp', navsSection()), section('feedback', 'comp', feedbackSection()),
  section('patterns', 'page', patternsSection(), '通用'), section('product', 'page', fragment('product', '本产品界面'), '本产品'),
  section('apps', 'apps', fragment('apps', '物料')),
  section('dev', 'dev', devSection()), section('tokens', 'dev', tokensSection()), section('downloads', 'dev', fragment('downloads', '文件')),
  section('notused', 'dev', notUsedSection()), section('stress', 'dev', stressSection()),
].join('\n\n');
const productCss = cfg.sampleCss ? read(cfg.sampleCss).trim() : '';
const sampleCss = [aliasCss, fs.readFileSync(path.join(HERE, 'sample.css'), 'utf8').trim(), '/* 字阶工具类：渲染器按 tokens 生成 */', generatedTypeCss, productCss && `/* 品牌样本层：${cfg.sampleCss} */\n${productCss}`].filter(Boolean).join('\n');
const docFonts = cfg.doc?.fonts ?? {};
const fontVar = (p, fb) => p ? V(p) : fb;
const docVars = [
  '/* 以下由渲染器按 specimen.json 生成 */',
  `:root { --doc-zh: ${fontVar(docFonts.zh, V('semantic.typography.body.fontFamily'))}; --doc-en: ${fontVar(docFonts.en, V('semantic.typography.body.fontFamily'))}; --doc-display: ${fontVar(docFonts.display, DISPLAY_STEPS.length ? V(`semantic.typographyDisplay.${DISPLAY_STEPS[0]}.fontFamily`) : V('semantic.typography.heading1.fontFamily'))}; --doc-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace; --doc-panel: ${hero.panel ? V(hero.panel) : RV('accent')}; }`,
  ...Object.entries(cfg.doc?.stages ?? {}).map(([n, p]) => `.stage.${n} { background: ${V(p)}; }`),
].join('\n');
for (const v of new Set([...sampleCss.matchAll(/var\((--[\w-]+)/g)].map(m => m[1]))) if (!v.startsWith('--sp-') && !v.startsWith('--doc-') && !VARS.has(v) && !/^--(state|focus-ring|motion)-/.test(v)) die(`sample layer uses ${v}, which tokens.css does not define`);

const html = `<!doctype html>
<html lang="${esc(cfg.lang ?? 'zh-CN')}" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(brand)} 视觉系统</title>
${cfg.favicon ? `<link rel="icon" href="${esc(rel(cfg.favicon))}"${cfg.favicon.endsWith('.svg') ? ' type="image/svg+xml"' : ''}>\n` : ''}<link rel="stylesheet" href="${esc(rel(tok('tokens.css')))}">
${cfg.fonts ? `<link rel="stylesheet" href="${esc(rel(cfg.fonts))}">\n` : ''}${cfg.stateLayer ? `<link rel="stylesheet" href="${esc(rel(cfg.stateLayer))}">\n` : ''}<link rel="stylesheet" href="specimen-doc.css">
<style id="sample-layer">
${sampleCss}
</style>
</head>
<body data-series="${SERIES}">
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
<filter id="glass" color-interpolation-filters="sRGB" x="0%" y="0%" width="100%" height="100%">
  <feImage id="glass-map" x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map"/>
  <feDisplacementMap in="SourceGraphic" in2="map" scale="50" xChannelSelector="R" yChannelSelector="G" result="dispRed"/>
  <feColorMatrix in="dispRed" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="red"/>
  <feDisplacementMap in="SourceGraphic" in2="map" scale="50" xChannelSelector="R" yChannelSelector="G" result="dispGreen"/>
  <feColorMatrix in="dispGreen" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="green"/>
  <feDisplacementMap in="SourceGraphic" in2="map" scale="50" xChannelSelector="R" yChannelSelector="G" result="dispBlue"/>
  <feColorMatrix in="dispBlue" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="blue"/>
  <feBlend in="red" in2="green" mode="screen" result="rg"/>
  <feBlend in="rg" in2="blue" mode="screen" result="output"/>
  <feGaussianBlur in="output" stdDeviation="3"/>
</filter>
${ICON_FILES.map(f => { const [vb, inner] = svgInner(f); return `<symbol id="i-${f.slice(0, -4)}" viewBox="${vb}">${inner}</symbol>`; }).join('\n')}
</svg>

<header class="topbar">
  <div class="shell" id="shell">
    <div class="seg-area"><a class="wordmark focus-ring" href="#top" aria-label="${esc(brand)} 视觉系统首页">${topMark || esc(brand)}</a></div>
    <div class="divider"></div>
    <nav class="topnav" aria-label="章节">
      <a class="focus-ring" href="#brand">${cfg.version ? `<span class="badge-v">v${esc(cfg.version)}</span>` : ''}品牌</a>
      <a class="focus-ring" href="#color">基础</a>
      <a class="focus-ring" href="#buttons">组件</a>
      <a class="focus-ring" href="#patterns">页面</a>
      <a class="focus-ring" href="#apps">物料</a>
      <a class="focus-ring" href="#dev">开发</a>
    </nav>
    <div class="seg-area tools q">
      ${MODES.length > 1 ? '<div class="seg" id="mode"><button class="on state-layer focus-ring" data-mode="light" aria-pressed="true">浅色</button><button class="state-layer focus-ring" data-mode="dark" aria-pressed="false">深色</button></div>' : ''}
      <button class="opt focus-ring dev-toggle" id="devtoggle" role="switch" aria-checked="false"><span class="switch" id="devsw"></span>开发视图</button>
    </div>
    <div class="divider"></div>
    <a class="cta-link focus-ring" href="#downloads">文件</a>
  </div>
</header>

<div class="wrap hero" id="top">
  <div class="hero-grid">
    <div>
    <p class="eyebrow">${hero.eyebrow ?? `${esc(brand)} 视觉系统${cfg.version ? ` · v${esc(cfg.version)}` : ''}`}</p>
    <h1${hero.titleLang ? ` lang="${esc(hero.titleLang)}"` : ''}>${hero.title ?? esc(brand)}</h1>
    ${hero.tagline ? `<p class="zh">${hero.tagline}</p>` : ''}
    <p class="lead">${hero.lead ?? `本页的标志、色版和物料取自 ${esc(brand)} 的品牌文件，界面样本直接用 tokens.css 渲染，设计和开发都照这一页做。`}</p>
    <div class="cta q">
      <a class="btn btn-primary state-layer focus-ring" href="#dev">开始接入</a>
      <a class="btn btn-secondary state-layer focus-ring" href="#downloads">下载文件</a>
    </div>
    <div class="facts">
${facts.map(([b, s]) => `      <div><b>${b}</b><span>${s}</span></div>`).join('\n')}
    </div>
    </div>
    <div class="hero-panel" aria-hidden="true">${hero.panelImage ? img(hero.panelImage, 'class="sym" alt=""') : ''}</div>
  </div>
</div>

<main class="wrap">

${BODY}
</main>

<script>
${fs.readFileSync(path.join(HERE, 'page.js'), 'utf8').trim()}
</script>
</body>
</html>
`;
fs.mkdirSync(path.dirname(at(OUT)), { recursive: true });
fs.writeFileSync(at(OUT), html);
fs.writeFileSync(path.join(path.dirname(at(OUT)), 'specimen-doc.css'), fs.readFileSync(path.join(HERE, 'doc.css'), 'utf8').trimEnd() + '\n\n' + docVars + '\n');
console.log(`${OUT}: ${html.length} bytes, ${ICON_FILES.length} icons, ${SERIES} series, modes ${MODES.join('/')}${ICON_MISSING.size ? `; no icon for ${[...ICON_MISSING].sort().join(', ')}` : ''}`);
