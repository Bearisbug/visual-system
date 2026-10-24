#!/usr/bin/env node
// Render the chart series presets (libraries/dataviz/presets.json) as dashboard cards in light and dark:
// a dot strip by hour, a coverage matrix, a segmented bar with a timeline, and a relation graph with its legend.
// Filled marks use the fill tier with a 1 px outline in the series color; dots, lines and small marks use the
// series color. Surfaces and text come from a token set's resolved snapshots, or neutral grays without one.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { leafAt } from './lib/tokens.mjs';
import { parseColor, ratio } from './lib/color.mjs';

const USAGE = `Usage: node <visual-system>/scripts/dataviz-preview.mjs [TOKENS_DIR] --out FILE.html [--presets FILE.json] [--preset ID]...
TOKENS_DIR holds tokens.json and the resolved snapshots; without it the cards sit on neutral gray surfaces.
--presets reads another file in the presets.json format; --preset limits the page to the named presets.`;
const argv = process.argv.slice(2);
if (argv.includes('--help')) { console.log(USAGE); process.exit(0); }
const opt = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const many = name => argv.flatMap((a, i) => a === name ? [argv[i + 1]] : []);
const OUT = opt('--out');
if (!OUT) { console.error(USAGE); process.exit(2); }
const DIR = argv[0] && !argv[0].startsWith('--') ? path.resolve(argv[0]) : null;
const LIB = JSON.parse(fs.readFileSync(opt('--presets') ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '../libraries/dataviz/presets.json'), 'utf8')).presets
  .filter(p => !many('--preset').length || many('--preset').includes(p.id));

const NEUTRAL = {
  light: { page: '#EFEFF1', card: '#FFFFFF', inset: '#F4F4F5', text: '#18181B', muted: '#52525B', faint: '#A1A1AA', line: '#E4E4E7' },
  dark: { page: '#0E0E10', card: '#141416', inset: '#1C1C1F', text: '#EDEDEF', muted: '#A1A1AA', faint: '#71717A', line: '#27272A' } };
function themes() {
  if (!DIR) return NEUTRAL;
  const read = f => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  const src = read('tokens.json'), roles = src.meta?.roles ?? {}, base = src.meta?.defaultMode ?? 'light', out = {};
  for (const mode of ['light', 'dark']) {
    const file = mode === base ? 'tokens.resolved.json' : `tokens.resolved.${mode}.json`;
    if (!fs.existsSync(path.join(DIR, file))) continue;
    const r = read(file), role = (k, fb) => (typeof roles[k] === 'string' && leafAt(r, roles[k])?.$value) || fb;
    out[mode] = { page: role('surface.default'), card: role('surface.raised'), inset: role('surface.sunken'), text: role('text.primary'), muted: role('text.secondary'), faint: role('text.tertiary'), line: role('divider', NEUTRAL[mode].line) };
  }
  return out;
}
const T = themes();

let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// a mark painted in the fill tier: light mode adds the outline in the series color
const fillMark = (s, mode) => mode === 'light' ? `fill="${s.lightFill}" stroke="${s.light}" stroke-width="1"` : `fill="${s.dark}"`;
const mark = (s, mode) => mode === 'light' ? s.light : s.dark;
// label on a filled mark: whichever of the text colors and the series color reads best on the fill
const onFill = (s, mode, t) => { const f = parseColor(mode === 'light' ? s.lightFill : s.dark); return [t.text, t.page, '#FFFFFF', mark(s, mode)].sort((a, b) => ratio(parseColor(b), f) - ratio(parseColor(a), f))[0]; };

function dotStrip(series, mode, t) {
  const peaks = [11, 13, 18, 12, 3, 14], share = [25, 25, 13, 15, 13, 9];
  const rows = series.map((s, k) => {
    let dots = '';
    for (let col = 0; col < 40; col++) {
      const x = 6 + col * 6.5, d = Math.abs(col / 40 * 24 - peaks[k]), n = Math.max(0, Math.round(4.2 * Math.exp(-d * d / 10) + (rnd() - 0.6)));
      dots += `<circle cx="${x}" cy="15" r="2" fill="${n ? mark(s, mode) : t.line}"/>`;
      for (let j = 1; j <= n; j++) for (const sign of [-1, 1]) dots += `<circle cx="${x}" cy="${15 + sign * j * 5.2}" r="2" fill="${mark(s, mode)}"/>`;
    }
    return `<div class="dr"><div class="dl"><span>${esc(s.name)}</span><b>${share[k]}%</b></div><svg width="266" height="34" viewBox="0 -2 266 34">${dots}</svg></div>`;
  }).join('');
  return card('按小时分布', '近 7 天', 'UTC', `<div class="strip">${rows}<div class="axis"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div></div>`, t);
}
function coverage(series, mode, t) {
  const rows = ['初始访问', '执行', '持久化', '权限提升', '防御规避', '凭证访问', '横向移动', '数据外传'];
  const head = series.map(s => `<div class="ch"><span>${esc(s.name)}</span><i style="background:${mark(s, mode)}"></i></div>`).join('');
  const body = rows.map(r => `<div class="cr"><span>${r}</span>${series.map(s => {
    const v = Math.floor(rnd() * 5);
    if (!v) return `<svg width="22" height="22"><rect x="0.5" y="0.5" width="21" height="21" rx="5" fill="none" stroke="${t.faint}" stroke-dasharray="2 2"/></svg>`;
    const h = Math.max(4, Math.round(v / 4 * 21));
    return `<svg width="22" height="22"><rect x="0.5" y="0.5" width="21" height="21" rx="5" fill="${mark(s, mode)}" fill-opacity="${mode === 'light' ? 0.12 : 0.16}"/><rect x="0.5" y="${21.5 - h}" width="21" height="${h}" rx="${h > 8 ? 5 : 2}" ${fillMark(s, mode)}/></svg>`;
  }).join('')}</div>`).join('');
  return card('覆盖矩阵', '按来源统计战术', '38 / 48', `<div class="cov"><div class="cr ch-row"><span></span>${head}</div>${body}<div class="note">虚线框 = 没有规则 · 色块高度 = 规则数</div></div>`, t);
}
function verdict(series, mode, t) {
  const w = [40, 29, 17, 14];
  const bar = series.slice(0, 4).map((s, k) => `<svg width="${w[k]}%" height="10" preserveAspectRatio="none" viewBox="0 0 100 10"><rect x="0.5" y="0.5" width="99" height="9" rx="2.5" ${fillMark(s, mode)} vector-effect="non-scaling-stroke"/></svg>`).join('');
  const steps = [['09:12', '点开发票邮件里的链接', 3], ['09:14', '通过了一次 MFA 推送', 0], ['09:15', '从新设备登录', 0], ['09:21', '创建云访问密钥', 2], ['09:24', '压缩 2.1 GB 文件', 1]];
  const list = steps.map(([time, text, k], i) => `<li><time>${time}</time><svg width="12" height="12"><circle cx="6" cy="6" r="${i === steps.length - 1 ? 5 : 4}" fill="${mark(series[k], mode)}"${i === steps.length - 1 ? ` stroke="${t.text}" stroke-width="1.5"` : ''}/></svg><div><p>${text}</p><small>${esc(series[k].name)}</small></div></li>`).join('');
  return card('事件 2041', '14 分钟前打开', '恶意', `<div class="ver"><small>判定</small><p class="big">94% <span>置信度</span></p><div class="seg">${bar}</div><small>攻击链</small><ul>${list}</ul></div>`, t);
}
function graph(series, mode, t) {
  const cx = 150, cy = 120, ring = (r, n, off) => [...Array(n)].map((_, i) => { const a = off + i * 2 * Math.PI / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
  const inner = ring(58, 6, -Math.PI / 2), outer = ring(104, 12, -Math.PI / 2 + 0.26);
  let edges = '', nodes = '';
  inner.forEach(([x, y]) => { edges += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${t.faint}" stroke-width="1"/>`; });
  outer.forEach(([x, y], i) => { const [px, py] = inner[Math.floor(i / 2)]; edges += `<line x1="${px}" y1="${py}" x2="${x}" y2="${y}" stroke="${t.faint}" stroke-opacity=".6" stroke-dasharray="${i % 3 ? '' : '2 3'}"/>`; });
  inner.forEach(([x, y], i) => { nodes += `<circle cx="${x}" cy="${y}" r="8" ${fillMark(series[i], mode)}/>`; });
  outer.forEach(([x, y], i) => { const s = series[(i * 5) % 6]; nodes += i % 4 === 1 ? `<circle cx="${x}" cy="${y}" r="5" ${fillMark(s, mode)}/>` : `<circle cx="${x}" cy="${y}" r="3.2" fill="${mark(s, mode)}"/>`; });
  nodes += `<circle cx="${cx}" cy="${cy}" r="16" ${fillMark(series[0], mode)}/><text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="11" font-weight="600" fill="${onFill(series[0], mode, t)}">MR</text>`;
  const legend = series.map(s => `<span><i style="background:${mode === 'light' ? s.lightFill : s.dark};box-shadow:inset 0 0 0 1px ${mark(s, mode)}"></i>${esc(s.name)}</span>`).join('');
  return card('影响范围', '从 m.ruiz 出发', '2 跳', `<svg width="300" height="240" viewBox="0 0 300 240"><circle cx="${cx}" cy="${cy}" r="58" fill="none" stroke="${t.line}" stroke-dasharray="2 4"/><circle cx="${cx}" cy="${cy}" r="104" fill="none" stroke="${t.line}" stroke-dasharray="2 4"/>${edges}${nodes}</svg><div class="lg">${legend}</div>`, t);
}
function card(title, sub, chip, body, t) {
  return `<section class="card" style="background:${t.card};border-color:${t.line}"><header><div><h3>${title}</h3><p style="color:${t.faint}">${sub}</p></div><span class="chip" style="border-color:${t.line};color:${t.muted}">${chip}</span></header><div class="body">${body}</div></section>`;
}

let html = `<!doctype html><meta charset="utf-8"><title>图表系列色预置色板</title><style>
body{margin:0;font:13px/1.45 -apple-system,"PingFang SC","Noto Sans SC",system-ui,sans-serif;background:#fff;color:#18181b}
h2{font-size:20px;margin:0 0 4px}h2 small{font-weight:400;color:#71717a;font-size:13px;margin-left:10px}
.preset{padding:28px 28px 8px}.mode{border-radius:20px;padding:18px;margin:12px 0 18px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
.mode>h4{grid-column:1/-1;margin:0;font-size:12px;font-weight:600;display:flex;justify-content:space-between}.mode>h4 code{font:11px ui-monospace,Menlo,monospace;opacity:.7}
.card{border:1px solid;border-radius:16px;overflow:hidden}.card header{display:flex;justify-content:space-between;align-items:flex-start;padding:14px 16px 10px}
.card h3{margin:0;font-size:14px;font-weight:600}.card header p{margin:2px 0 0;font-size:12px}.chip{border:1px solid;border-radius:7px;padding:2px 7px;font-size:11px;font-family:ui-monospace,Menlo,monospace}
.body{padding:4px 16px 16px}.strip .dr{display:flex;align-items:center;gap:8px;height:38px}.dl{width:58px;font-size:11.5px;line-height:1.25}.dl b{display:block;font-weight:600}
.axis{display:flex;justify-content:space-between;margin-left:66px;font:10.5px ui-monospace,Menlo,monospace;opacity:.55}
.cov .cr{display:flex;align-items:center;gap:5px;height:26px}.cov .cr>span{flex:1;font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cov .ch-row{height:64px;align-items:flex-end}.ch{width:22px;display:flex;flex-direction:column;align-items:center;gap:5px}.ch span{writing-mode:vertical-rl;transform:rotate(180deg);font-size:10.5px;white-space:nowrap}.ch i{width:7px;height:7px;border-radius:2px}
.note{font-size:11px;opacity:.6;margin-top:8px}.ver small{display:block;font-size:11px;opacity:.6;margin:6px 0}.big{font-size:22px;font-weight:600;margin:0 0 8px}.big span{font-size:12px;font-weight:400;opacity:.6}
.seg{display:flex;gap:3px;margin-bottom:12px}.ver ul{list-style:none;margin:0;padding:0}.ver li{display:flex;gap:9px;align-items:flex-start;padding:4px 0}.ver time{font:11px ui-monospace,Menlo,monospace;opacity:.6;width:36px;padding-top:1px}
.ver li svg{margin-top:3px;flex:none}.ver li p{margin:0;font-size:12px}.ver li small{margin:0;font-size:11px}
.lg{display:flex;flex-wrap:wrap;gap:5px 12px;font-size:11.5px}.lg i{display:inline-block;width:9px;height:9px;border-radius:2.5px;margin-right:5px;vertical-align:-1px}
</style>`;
for (const p of LIB) {
  html += `<div class="preset"><h2>${esc(p.name)} · ${esc(p.id)}<small>备用 ${p.spares.map(s => esc(s.name)).join('、')}</small></h2>`;
  for (const mode of ['dark', 'light']) {
    const t = T[mode]; if (!t) continue;
    seed = 7;
    const hexes = mode === 'light' ? `描边 ${p.series.map(s => s.light).join(' ')} · 填充 ${p.series.map(s => s.lightFill).join(' ')}` : p.series.map(s => s.dark).join(' ');
    html += `<div class="mode" style="background:${t.page};color:${t.text}"><h4><span>${mode === 'dark' ? '暗色' : '浅色'}</span><code>${hexes}</code></h4>${dotStrip(p.series, mode, t)}${coverage(p.series, mode, t)}${verdict(p.series, mode, t)}${graph(p.series, mode, t)}</div>`;
  }
  html += `</div>`;
}
fs.writeFileSync(OUT, html);
console.log(`wrote ${OUT}: ${LIB.length} presets, modes ${Object.keys(T).join('/')}`);
