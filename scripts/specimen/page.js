// 样例页运行时：标注计算值（C2）、画图表、模式切换、开发视图、动效播放、复制、提交演示、目录高亮、顶栏玻璃。
// 渲染器把本文件原样内联进 specimen.html；它只读 CSS 变量与 DOM，不含品牌数据。
const root = document.documentElement;
const q = new URLSearchParams(location.search);
const px = v => v.endsWith('rem') ? parseFloat(v) * 16 : parseFloat(v);
const css = n => getComputedStyle(root).getPropertyValue(n).trim();
const langProbe = Object.fromEntries(['en', 'zh-CN'].map(l => { const e = document.createElement('span'); e.lang = l; e.hidden = true; document.body.append(e); return [l.slice(0, 2), e]; }));

function fill() {
  document.querySelectorAll('[data-var]').forEach(el => { el.textContent = css(el.dataset.var); });
  const spec = (probe, t) => {
    const v = n => getComputedStyle(probe).getPropertyValue('--semantic-typography-' + t + '-' + n).trim();
    const size = px(v('font-size')), ls = v('letter-spacing');
    return `${size} / ${Math.round(size * parseFloat(v('line-height')))} · ${v('font-weight')}` + (parseFloat(ls) ? ` · ${ls.replace('-', '−')}` : '');
  };
  document.querySelectorAll('[data-type]').forEach(el => {
    const en = spec(langProbe.en, el.dataset.type), zh = spec(langProbe.zh, el.dataset.type);
    el.innerHTML = en === zh ? en : `西文 ${en}<br>中文 ${zh}`;
  });
  charts();
}

function charts() {
  const n = Number(document.body.dataset.series || 0);
  if (!n || !document.getElementById('line-chart')) return;
  const s = i => `var(--semantic-color-data-viz-series-${Math.min(i, n)})`;
  const grid = 'var(--semantic-color-border-subtle)', axis = 'var(--semantic-color-text-tertiary)';
  const label = (x, y, t, a = 'middle', c = axis) => `<text x="${x}" y="${y}" text-anchor="${a}" style="fill:${c};font:11px var(--semantic-typography-caption-font-family)">${t}</text>`;
  const W = 520, H = 260, L = 40, T = 16, B = 28, ph = H - T - B;
  const ys = v => H - B - v / 100 * ph;
  const frame = [0, 25, 50, 75, 100].map(v => `<line x1="${L}" x2="${W - 10}" y1="${ys(v)}" y2="${ys(v)}" style="stroke:${v ? grid : 'var(--semantic-color-border-strong)'}"/>` + label(L - 8, ys(v) + 4, v, 'end')).join('');
  const lines = [['北区', [32,40,38,52,60,58,70,76,72,80,84,88]], ['南区', [20,24,30,28,36,44,42,48,56,54,60,64]], ['西区', [10,14,12,18,22,20,28,26,34,38,36,42]]];
  const LW = W - 64, xs = i => L + 8 + i * ((LW - 18 - L) / 11);
  document.getElementById('line-chart').innerHTML = frame
    + lines.map(([name, d], k) => `<polyline fill="none" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" style="stroke:${s(k + 1)}" points="${d.map((v, i) => xs(i) + ',' + ys(v)).join(' ')}"/>` + label(xs(11) + 8, ys(d[11]) + 4, name, 'start', 'var(--semantic-color-text-secondary)')).join('')
    + [0, 3, 6, 9, 11].map(i => label(xs(i), H - 8, '第 ' + (i + 1) + ' 周')).join('');
  const bars = [[62,48,30],[70,52,36],[58,60,42],[80,66,40],[90,72,56],[96,80,60]], cats = ['周一','周二','周三','周四','周五','周六'];
  const gw = (W - 10 - L) / 6;
  document.getElementById('bar-chart').innerHTML = frame
    + bars.map((g, c) => g.map((v, k) => `<rect x="${L + c * gw + (gw - 50) / 2 + k * 18}" y="${ys(v)}" width="14" height="${v / 100 * ph}" rx="3" style="fill:${s(k + 1)}"/>`).join('') + label(L + c * gw + gw / 2, H - 8, cats[c])).join('');
  const area = [[18,22,30,34,42,48,52,60,66,70,76,82], [8,12,14,20,24,26,32,34,38,44,46,52]];
  const pathOf = d => d.map((v, i) => `${i ? 'L' : 'M'}${xs(i)} ${ys(v)}`).join(' ');
  document.getElementById('area-chart').innerHTML = frame
    + area.map((d, k) => `<path d="${pathOf(d)} L${xs(11)} ${ys(0)} L${xs(0)} ${ys(0)} Z" style="fill:${s(k + 1)};fill-opacity:.24"/><path d="${pathOf(d)}" fill="none" stroke-width="2" style="stroke:${s(k + 1)}"/>`).join('')
    + [0, 3, 6, 9, 11].map(i => label(xs(i), H - 8, '第 ' + (i + 1) + ' 周')).join('');
  const pts = [[[12,30],[18,42],[22,38],[30,55],[26,48],[34,60]], [[40,52],[46,64],[52,58],[58,72],[50,66],[62,80]], [[70,40],[76,50],[82,46],[88,62],[74,56],[92,70]]];
  const xsc = v => L + 8 + v / 100 * (W - 26 - L);
  document.getElementById('scatter').innerHTML = frame
    + pts.map((g, k) => g.map(([x, y]) => `<circle cx="${xsc(x)}" cy="${ys(y)}" r="4" stroke-width="2" style="fill:${s(k + 1)};stroke:var(--semantic-color-surface-background)"/>`).join('')).join('')
    + [0, 50, 100].map(v => label(xsc(v), H - 8, v / 10 + ' 次')).join('');
  const parts = [['直接访问', 46], ['搜索', 28], ['推荐', 16], ['其他', 10]].slice(0, Math.max(2, Math.min(4, n)));
  let a = -Math.PI / 2; const R = 72, C = 100;
  const arc = (p, i) => { const a2 = a + p / 100 * Math.PI * 2, g = 0.03; const d = `M${C + R * Math.cos(a + g)} ${C + R * Math.sin(a + g)} A${R} ${R} 0 ${p > 50 ? 1 : 0} 1 ${C + R * Math.cos(a2 - g)} ${C + R * Math.sin(a2 - g)}`; a = a2; return `<path d="${d}" fill="none" stroke-width="28" style="stroke:${s(i + 1)}"/>`; };
  document.getElementById('donut').innerHTML = `<circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke-width="28" style="stroke:var(--semantic-color-surface-sunken)"/>` + parts.map((p, i) => arc(p[1], i)).join('');
  document.getElementById('donut-legend').innerHTML = parts.map((p, i) => `<span style="display:flex;align-items:center;gap:8px"><i style="width:10px;height:10px;border-radius:3px;background:${s(i + 1)}"></i>${p[0]}<b style="font-weight:600;margin-left:8px">${p[1]}%</b></span>`).join('');
}

function setMode(m) {
  root.dataset.theme = m;
  document.querySelectorAll('#mode button').forEach(x => { const on = x.dataset.mode === m; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
  fill();
}
document.querySelectorAll('#mode button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
const dev = document.getElementById('devtoggle');
dev.addEventListener('click', () => { const on = document.body.classList.toggle('devview'); document.getElementById('devsw').classList.toggle('on', on); dev.setAttribute('aria-checked', on); });
document.querySelectorAll('.play').forEach(b => b.addEventListener('click', () => {
  const t = b.parentElement.querySelector('.track');
  t.style.setProperty('--dist', (t.clientWidth - 48) + 'px');
  t.classList.toggle('go');
}));
document.querySelectorAll('.copy').forEach(b => b.addEventListener('click', () => navigator.clipboard?.writeText(b.nextElementSibling.textContent)));
document.querySelectorAll('[data-demo="submit"]').forEach(b => b.addEventListener('click', () => {
  if (b.getAttribute('aria-disabled') === 'true') return;
  const [spin, label] = b.children, text = label.textContent;
  b.setAttribute('aria-disabled', 'true'); spin.hidden = false; label.textContent = '提交中';
  setTimeout(() => { b.removeAttribute('aria-disabled'); spin.hidden = true; label.textContent = text; }, 1500);
}));
const links = [...document.querySelectorAll('.topnav a')];
const groups = links.map(a => document.querySelector(a.getAttribute('href')));
const spy = () => { let cur = -1; groups.forEach((g, i) => { if (g && g.getBoundingClientRect().top < 140) cur = i; }); links.forEach((a, i) => a.classList.toggle('on', i === cur)); };
addEventListener('scroll', spy, { passive: true });
const shell = document.getElementById('shell');
function glassMap() {
  const { width: w, height: h } = shell.getBoundingClientRect();
  const svg = `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="r" x1="100%" y1="0%" x2="0%" y2="0%"><stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="red"/></linearGradient><linearGradient id="b" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="blue"/></linearGradient></defs><rect width="${w}" height="${h}" fill="black"/><rect width="${w}" height="${h}" fill="url(#r)"/><rect width="${w}" height="${h}" fill="url(#b)" style="mix-blend-mode:difference"/><rect width="${w}" height="${h}" fill="hsl(0 0% 50% / 0.36)" style="filter:blur(25px)"/></svg>`;
  document.getElementById('glass-map').setAttribute('href', 'data:image/svg+xml,' + encodeURIComponent(svg));
}
const probe = document.createElement('div'); probe.style.backdropFilter = 'url(#glass)';
const ua = navigator.userAgent, webkitOnly = /Safari/.test(ua) && !/Chrome/.test(ua);
if (probe.style.backdropFilter !== '' && !webkitOnly) { shell.classList.add('svg-glass'); glassMap(); new ResizeObserver(glassMap).observe(shell); }
if (q.get('mode') === 'dark') setMode('dark'); else fill();
if (q.has('dev')) dev.click();
spy();
