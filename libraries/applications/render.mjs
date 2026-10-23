#!/usr/bin/env node
// Node.js built-ins only. This renderer does not perform browser or visual validation.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.dirname(SELF);
const GENERATOR = 'brand-application-renderer-v2';
const ID = /^[a-z][a-z0-9-]{0,63}$/;
const SHA = /^[a-f0-9]{64}$/;
const MARKERS = new Set(['LANG', 'BRAND_NAME', 'TITLE', 'BODY', 'KICKER', 'FOOTER', 'THEME', 'LOGO_SRC', 'GRAPHIC', 'WIDTH', 'HEIGHT', 'LAYOUT_STYLE']);
const TEXT_SLOTS = ['title', 'body', 'kicker', 'footer'];
const LAYOUT_SLOTS = ['logo', ...TEXT_SLOTS, 'graphic'];
const LAYOUT_DIMENSIONS = { x: 'x', y: 'y', width: 'w', height: 'h', font_size: 'font-size', line_height_px: 'leading' };
// Every custom property makeLayoutStyle can emit; brand.css adds its own names at build time.
const LAYOUT_VARIABLES = LAYOUT_SLOTS.flatMap(name => TEXT_SLOTS.includes(name)
  ? [...Object.values(LAYOUT_DIMENSIONS), 'align', 'max-lines'].map(suffix => `${name}-${suffix}`)
  : ['x', 'y', 'w', 'h'].map(suffix => `${name}-${suffix}`));
const SLOT_ROLE = { title: 'heading', body: 'body', kicker: 'label', footer: 'label' };
const ROLES = ['heading', 'body', 'label'];
const GENERIC_FAMILIES = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'math', 'emoji', 'fangsong']);
const FONT_FORMATS = { '.ttf': 'truetype', '.otf': 'opentype', '.woff2': 'woff2' };
// Chinese and Western text share these marks; in Chinese materials the Chinese face renders them
// (BD-TOKEN-001 step 6), so a range-limited Latin face must not cover them.
const SHARED_PUNCTUATION = [0x00B7, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2026];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw new Error(message); };
const object = (value, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}: expected object`);
  return value;
};
const string = (value, label, { optional = false, max = 20000 } = {}) => {
  if (optional && value === undefined) return '';
  if (typeof value !== 'string' || value.length > max || value.includes('\0')) fail(`${label}: expected string, at most ${max} characters`);
  return value;
};
const id = (value, label) => {
  if (typeof value !== 'string' || !ID.test(value)) fail(`${label}: expected lowercase ASCII ID (1..64 characters)`);
  return value;
};
const integer = (value, min, max, label) => {
  if (!Number.isInteger(value) || value < min || value > max) fail(`${label}: expected integer ${min}..${max}`);
  return value;
};
const escapeHTML = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const canonical = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
const jsonBytes = value => Buffer.from(JSON.stringify(JSON.parse(canonical(value)), null, 2) + '\n');
const within = (root, target) => {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel));
};
const statOrNull = async target => {
  try { return await fs.lstat(target); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
};

async function readFile(target, label, max = 32 * 1024 * 1024) {
  const real = await fs.realpath(target).catch(() => fail(`${label}: missing or inaccessible file ${target}`));
  const stat = await fs.stat(real);
  if (!stat.isFile() || stat.size === 0 || stat.size > max) fail(`${label}: expected nonempty regular file, at most ${max} bytes`);
  const bytes = await fs.readFile(real);
  return { path: real, bytes, sha256: hash(bytes), size: bytes.length };
}

async function readJSON(target, label) {
  const file = await readFile(target, label, 2 * 1024 * 1024);
  try { return { ...file, value: object(JSON.parse(file.bytes.toString('utf8')), label) }; }
  catch (e) { fail(`${label}: invalid JSON (${e.message})`); }
}

async function relativeFile(root, value, label, extensions) {
  string(value, label, { max: 1000 });
  if (!value || path.isAbsolute(value) || value.includes('\\')) fail(`${label}: expected relative path using / separators`);
  const candidate = path.resolve(root, value);
  if (!within(root, candidate)) fail(`${label}: path escapes source root`);
  if (extensions && !extensions.includes(path.extname(value).toLowerCase())) fail(`${label}: unsupported file extension`);
  const file = await readFile(candidate, label);
  if (!within(root, file.path)) fail(`${label}: real path escapes source root`);
  return file;
}

function version(value, label, expected = 1) {
  if (value.schema_version !== expected) fail(`${label}.schema_version: expected ${expected}`);
}

function validateItems(content) {
  version(content, 'content', 2);
  if (!Array.isArray(content.items) || !content.items.length || content.items.length > 100) fail('content.items: expected 1..100 items');
  const ids = new Set();
  return content.items.map(item => {
    object(item, 'item');
    id(item.id, 'item.id');
    if (ids.has(item.id)) fail(`duplicate item ID: ${item.id}`);
    ids.add(item.id);
    id(item.template, 'item.template');
    if (!['paper', 'brand'].includes(item.theme)) fail(`item ${item.id}: theme must be paper or brand`);
    if (!string(item.title, 'item.title').trim()) fail(`item ${item.id}: title required`);
    return { ...item, body: string(item.body, 'item.body', { optional: true }), kicker: string(item.kicker, 'item.kicker', { optional: true }), footer: string(item.footer, 'item.footer', { optional: true }) };
  });
}

function unicodeRanges(value, label) {
  string(value, label, { max: 2000 });
  return value.split(',').map(part => {
    const m = /^\s*U\+([0-9A-Fa-f?]{1,6})(?:-([0-9A-Fa-f]{1,6}))?\s*$/.exec(part);
    if (!m || (m[1].includes('?') && (m[2] || !/^[0-9A-Fa-f]*\?+$/.test(m[1])))) fail(`${label}: expected comma-separated U+XXXX, U+XXXX-YYYY or U+XX?? items`);
    const lo = parseInt(m[1].replaceAll('?', '0'), 16), hi = m[2] ? parseInt(m[2], 16) : parseInt(m[1].replaceAll('?', 'F'), 16);
    if (lo > hi || hi > 0x10FFFF) fail(`${label}: invalid range ${part.trim()}`);
    return [lo, hi];
  });
}

function validateFonts(brand) {
  const type = brand.type;
  if (!Array.isArray(type.fonts) || !type.fonts.length || type.fonts.length > 8) fail('brand.type.fonts: expected 1..8 font entries');
  const families = new Map();
  type.fonts.forEach((font, index) => {
    const label = `brand.type.fonts[${index}]`;
    object(font, label);
    const family = string(font.family, `${label}.family`, { max: 100 });
    if (!/^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u.test(family)) fail(`${label}.family: expected the real family name in letters, digits, spaces, dots, underscores or hyphens`);
    if (families.has(family)) fail(`${label}.family: duplicate family ${family}`);
    integer(font.weight_min, 1, 1000, `${label}.weight_min`);
    integer(font.weight_max, font.weight_min, 1000, `${label}.weight_max`);
    if (font.unicode_range !== undefined) {
      const ranges = unicodeRanges(font.unicode_range, `${label}.unicode_range`);
      const covered = /^zh\b/i.test(brand.language) ? SHARED_PUNCTUATION.filter(code => ranges.some(([lo, hi]) => code >= lo && code <= hi)) : [];
      if (covered.length) fail(`${label}.unicode_range covers ${covered.map(code => `U+${code.toString(16).toUpperCase().padStart(4, '0')} ${String.fromCodePoint(code)}`).join(', ')}; exclude these shared marks so the Chinese face renders them`);
    }
    families.set(family, font);
  });
  const stacks = object(type.stacks, 'brand.type.stacks');
  for (const key of Object.keys(stacks)) if (!ROLES.includes(key)) fail(`brand.type.stacks: unknown role ${key}`);
  const used = new Set();
  for (const role of ROLES) {
    const label = `brand.type.stacks.${role}`;
    const stack = stacks[role];
    if (!Array.isArray(stack) || !stack.length || stack.length > 9) fail(`${label}: expected 1..9 family names`);
    stack.forEach((name, index) => {
      if (GENERIC_FAMILIES.has(name) && index === stack.length - 1 && index > 0) return;
      if (!families.has(name)) fail(`${label}[${index}]: ${JSON.stringify(name)} is not a brand.type.fonts family${index > 0 ? ' or a final generic family' : ''}`);
      if (stack.indexOf(name) !== index) fail(`${label}: duplicate family ${name}`);
      const font = families.get(name);
      const weight = type[`${role}_weight`];
      if (weight < font.weight_min || weight > font.weight_max) fail(`brand.type.${role}_weight ${weight} is outside ${name} ${font.weight_min}..${font.weight_max}`);
      used.add(name);
    });
  }
  for (const family of families.keys()) if (!used.has(family)) fail(`brand.type.fonts: ${family} is not used by any stack`);
}

function validateBrand(brand, themes) {
  if (brand.schema_version !== 2) fail('brand.schema_version: expected 2; migrate a schema 1 brand.json as described under "从 brand.json schema 1 迁移" in libraries/applications/contract.md');
  id(brand.id, 'brand.id');
  if (!string(brand.name, 'brand.name', { max: 300 }).trim()) fail('brand.name: required');
  if (!/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(string(brand.language, 'brand.language', { max: 64 }))) fail('brand.language: invalid language tag');
  object(brand.colors, 'brand.colors');
  for (const key of ['paper', 'text', 'muted', 'brand', 'on_brand', 'rule']) {
    if (typeof brand.colors[key] !== 'string' || !/^#[a-fA-F0-9]{6}$/.test(brand.colors[key])) fail(`brand.colors.${key}: expected #RRGGBB`);
  }
  const type = object(brand.type, 'brand.type');
  for (const key of ['heading_weight', 'body_weight', 'label_weight']) integer(type[key], 1, 1000, `brand.type.${key}`);
  for (const key of ['heading_line_height', 'body_line_height', 'label_line_height']) {
    if (typeof type[key] !== 'number' || !Number.isFinite(type[key]) || type[key] < 1 || type[key] > 3) fail(`brand.type.${key}: expected finite number 1..3`);
  }
  if (typeof type.heading_tracking_em !== 'number' || !Number.isFinite(type.heading_tracking_em) || Math.abs(type.heading_tracking_em) > 2) fail('brand.type.heading_tracking_em: expected finite number -2..2');
  if (!['auto', 'normal', 'none'].includes(type.kerning)) fail('brand.type.kerning: expected auto, normal, or none');
  if (!['normal', 'none'].includes(type.ligatures)) fail('brand.type.ligatures: expected normal or none');
  validateFonts(brand);
  object(brand.assets, 'brand.assets');
  if (brand.assets.graphic != null) object(brand.assets.graphic, 'brand.assets.graphic');
  for (const theme of themes) {
    if (!string(brand.assets[`logo_on_${theme}`], `brand.assets.logo_on_${theme}`).trim()) fail(`brand.assets.logo_on_${theme}: required for used theme`);
    const graphic = brand.assets.graphic?.[theme];
    if (graphic != null && typeof graphic !== 'string') fail(`brand.assets.graphic.${theme}: expected relative SVG path, null, or omitted`);
  }
}

// Returns the validated layout and the text slots whose explicit line height differs from
// font_size x the brand line height of their role (canvas-specific leading is allowed, and recorded).
function validateLayout(item, template, brand) {
  const label = `item ${item.id}.layout`;
  const input = object(item.layout, label);
  for (const key of Object.keys(input)) if (!LAYOUT_SLOTS.includes(key)) fail(`${label}: unknown slot ${key}`);
  const result = {}, overrides = [];
  for (const name of LAYOUT_SLOTS) {
    const slotLabel = `${label}.${name}`;
    const required = name === 'logo' || name === 'title' || (name === 'graphic' ? brand.assets.graphic?.[item.theme] != null : Boolean(item[name].trim()));
    if (input[name] == null) {
      if (required) fail(`${slotLabel}: required for used content`);
      continue;
    }
    const slot = object(input[name], slotLabel);
    const text = TEXT_SLOTS.includes(name);
    const fields = ['x', 'y', 'width', 'height', ...(text ? ['font_size', 'line_height_px', 'max_lines', 'align'] : [])];
    for (const key of Object.keys(slot)) if (!fields.includes(key)) fail(`${slotLabel}: unknown field ${key}`);
    for (const key of ['x', 'y', 'width', 'height', ...(text ? ['font_size', ...(slot.line_height_px === undefined ? [] : ['line_height_px'])] : [])]) {
      if (typeof slot[key] !== 'number' || !Number.isFinite(slot[key])) fail(`${slotLabel}.${key}: expected finite number`);
    }
    const resolved = { ...slot };
    if (slot.x < 0 || slot.y < 0 || slot.width <= 0 || slot.height <= 0 || slot.x + slot.width > template.width || slot.y + slot.height > template.height) fail(`${slotLabel}: rectangle must have nonnegative position and positive dimensions within the template canvas`);
    if (text) {
      if (slot.font_size <= 0 || slot.font_size > template.height) fail(`${slotLabel}.font_size: expected positive size no larger than the canvas height`);
      const brandLineHeight = Math.round(slot.font_size * brand.type[`${SLOT_ROLE[name]}_line_height`]);
      if (slot.line_height_px === undefined) resolved.line_height_px = brandLineHeight;
      else if (Math.round(slot.line_height_px) !== brandLineHeight) overrides.push({ slot: name, line_height_px: slot.line_height_px, brand_line_height_px: brandLineHeight });
      if (resolved.line_height_px < slot.font_size || slot.height < resolved.line_height_px) fail(`${slotLabel}.line_height_px: must be at least font_size and fit one line in height`);
      integer(slot.max_lines, 1, 50, `${slotLabel}.max_lines`);
      if (!['left', 'center', 'right'].includes(slot.align)) fail(`${slotLabel}.align: expected left, center, or right`);
      if (item[name].split(/\r\n|\r|\n/).length > slot.max_lines) fail(`${slotLabel}: explicit line count exceeds max_lines ${slot.max_lines}`);
    }
    result[name] = Object.fromEntries(fields.map(key => [key, resolved[key]]));
  }
  return { layout: result, overrides };
}

function makeLayoutStyle(layout, canvasWidth) {
  // Every value has passed validateLayout; width is the common scale for both axes.
  const declarations = [];
  for (const name of LAYOUT_SLOTS) {
    const slot = layout[name];
    if (!slot) continue;
    for (const [field, suffix] of Object.entries(LAYOUT_DIMENSIONS)) {
      if (slot[field] !== undefined) declarations.push(`--${name}-${suffix}:${slot[field] / canvasWidth * 100}cqw`);
    }
    if (TEXT_SLOTS.includes(name)) declarations.push(`--${name}-align:${slot.align}`, `--${name}-max-lines:${slot.max_lines}`);
  }
  return declarations.join(';') + ';';
}

function displaySlots(html, label) {
  // Restricted template contract: explicit, balanced HTML elements and body text slots.
  // Attributes, comments, raw text, inactive containers, and hidden ancestors do not count.
  // This scanner does not compute CSS visibility, layout, contrast, or browser semantics.
  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  const rawTags = new Set(['script', 'style', 'title', 'textarea', 'xmp', 'iframe', 'noembed', 'noframes']);
  const inactive = new Set(['head', 'template', 'noscript', 'canvas', 'object', 'svg', 'math']);
  const slots = new Set();
  const stack = [];
  let offset = 0;
  let bodies = 0;
  while (offset < html.length) {
    if (html[offset] !== '<') {
      let end = html.indexOf('<', offset);
      if (end < 0) end = html.length;
      if (stack.some(x => x.tag === 'body') && !stack.some(x => x.blocked)) {
        for (const match of html.slice(offset, end).matchAll(/\{\{(TITLE|BODY|KICKER|FOOTER)\}\}/g)) slots.add(match[1]);
      }
      offset = end;
      continue;
    }
    if (html.startsWith('<!--', offset)) {
      const end = html.indexOf('-->', offset + 4);
      if (end < 0) fail(`${label}: unclosed HTML comment`);
      offset = end + 3;
      continue;
    }
    let end = offset + 1;
    let quote = '';
    for (; end < html.length; end++) {
      const ch = html[end];
      if (quote) { if (ch === quote) quote = ''; }
      else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '>') break;
    }
    if (end === html.length) fail(`${label}: unclosed HTML tag`);
    const token = html.slice(offset, end + 1);
    offset = end + 1;
    if (/^<!doctype\s+html\s*>$/i.test(token)) continue;
    const match = /^<(\/?)([A-Za-z][A-Za-z0-9:-]*)([\s\S]*)>$/.exec(token);
    if (!match) fail(`${label}: unsupported markup; escape literal < in text`);
    const [, closing, rawTag, rawAttributes] = match;
    const tag = rawTag.toLowerCase();
    if (closing) {
      if (rawAttributes.trim() || stack.at(-1)?.tag !== tag) fail(`${label}: expected explicitly balanced HTML closing tags (${tag})`);
      stack.pop();
      continue;
    }
    const selfClosing = /\/\s*$/.test(rawAttributes);
    if (selfClosing && !voidTags.has(tag)) fail(`${label}: only void HTML elements may self-close (${tag})`);
    let attributes = selfClosing ? rawAttributes.replace(/\/\s*$/, '') : rawAttributes;
    let hidden = false;
    while (attributes.trim()) {
      const attribute = /^\s+([^\s=<>/"']+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?/.exec(attributes);
      if (!attribute) fail(`${label}: unsupported HTML attribute syntax (${tag})`);
      if (attribute[1].toLowerCase() === 'hidden') hidden = true;
      attributes = attributes.slice(attribute[0].length);
    }
    if (rawTags.has(tag)) {
      const close = new RegExp(`</${tag}\\s*>`, 'ig');
      close.lastIndex = offset;
      const found = close.exec(html);
      if (!found) fail(`${label}: unclosed raw-text element ${tag}`);
      offset = close.lastIndex;
      continue;
    }
    if (tag === 'body' && (++bodies > 1 || stack.some(x => x.tag !== 'html'))) fail(`${label}: expected one body element directly inside html or at document root`);
    if (!voidTags.has(tag)) stack.push({ tag, blocked: hidden || inactive.has(tag) });
  }
  if (stack.length) fail(`${label}: unclosed HTML element ${stack.at(-1).tag}`);
  return slots;
}

function makeCSS(brand, fontOutputs) {
  const t = brand.type;
  const alias = family => `"BrandTemplate ${t.fonts.findIndex(font => font.family === family) + 1}"`;
  const stack = role => t.stacks[role].map(name => GENERIC_FAMILIES.has(name) ? name : alias(name)).join(', ');
  const faces = t.fonts.map((font, index) => {
    const output = fontOutputs[index];
    const src = output.split('/').map(encodeURIComponent).join('/');
    const range = font.unicode_range === undefined ? '' : `  unicode-range: ${font.unicode_range.split(',').map(part => part.trim().toUpperCase()).join(', ')};\n`;
    return `@font-face {\n  font-family: ${alias(font.family)};\n  src: url("${src}") format("${FONT_FORMATS[path.extname(output).toLowerCase()]}");\n  font-style: normal;\n  font-weight: ${font.weight_min} ${font.weight_max};\n  font-display: swap;\n${range}}\n`;
  });
  return `${faces.join('')}:root {\n${Object.entries(brand.colors).filter(([k]) => ['paper', 'text', 'muted', 'brand', 'on_brand', 'rule'].includes(k)).map(([k, v]) => `  --${k.replaceAll('_', '-')}: ${v};`).join('\n')}\n${ROLES.map(role => `  --${role}-font-family: ${stack(role)};`).join('\n')}\n  --font-kerning: ${t.kerning};\n  --font-ligatures: ${t.ligatures};\n  --heading-weight: ${t.heading_weight};\n  --body-weight: ${t.body_weight};\n  --label-weight: ${t.label_weight};\n  --heading-line-height: ${t.heading_line_height};\n  --body-line-height: ${t.body_line_height};\n  --label-line-height: ${t.label_line_height};\n  --heading-tracking: ${t.heading_tracking_em}em;\n}\n`;
}

function sourceRecord(file) {
  return { path: file.path, sha256: file.sha256, size: file.size };
}

async function prepare(args) {
  const [brandFile, contentFile, templateIndex, renderer] = await Promise.all([
    readJSON(args.brand, 'brand'), readJSON(args.content, 'content'),
    readJSON(path.join(ROOT, 'templates.json'), 'templates'), readFile(SELF, 'renderer'),
  ]);
  const contentItems = validateItems(contentFile.value);
  const themes = ['paper', 'brand'].filter(theme => contentItems.some(item => item.theme === theme));
  const brand = brandFile.value;
  validateBrand(brand, themes);
  const brandRoot = path.dirname(brandFile.path);
  const specs = [];
  const fontOutputs = brand.type.fonts.map((font, index) => {
    const label = `brand.type.fonts[${index}]`;
    const names = ['file', 'license'].map(key => {
      const name = path.posix.basename(string(font[key], `${label}.${key}`, { max: 1000 }));
      if (!name || name.startsWith('.') || name.length > 128) fail(`${label}.${key}: expected a file name of 1..128 characters not starting with a dot`);
      return name;
    });
    if (names[0] === names[1]) fail(`${label}: font and license need different file names`);
    const dir = `assets/fonts/${index + 1}`;
    specs.push([`font_${index + 1}`, font.file, Object.keys(FONT_FORMATS), `${dir}/${names[0]}`], [`license_${index + 1}`, font.license, null, `${dir}/${names[1]}`]);
    return `${dir}/${names[0]}`;
  });
  for (const theme of themes) {
    specs.push([`logo_on_${theme}`, brand.assets[`logo_on_${theme}`], ['.svg'], `assets/logo-${theme}.svg`]);
    const graphic = brand.assets.graphic?.[theme];
    if (graphic != null) specs.push([`graphic_${theme}`, graphic, ['.svg'], `assets/graphic-${theme}.svg`]);
  }
  const resources = await Promise.all(specs.map(async ([key, value, extensions, output]) => ({ key, output, file: await relativeFile(brandRoot, value, `brand resource ${key}`, extensions) })));
  version(templateIndex.value, 'templates');
  const definitions = templateIndex.value.templates;
  if (!Array.isArray(definitions) || !definitions.length || definitions.length > 100) fail('templates.templates: expected 1..100 templates');
  const css = makeCSS(brand, fontOutputs);
  const defined = new Set([...LAYOUT_VARIABLES, ...[...css.matchAll(/--([a-z0-9-]+):/g)].map(match => match[1])]);
  const templates = new Map();
  for (const definition of definitions) {
    object(definition, 'template');
    id(definition.id, 'template.id');
    if (templates.has(definition.id)) fail(`duplicate template ID: ${definition.id}`);
    integer(definition.width, 1, 10000, 'template.width');
    integer(definition.height, 1, 10000, 'template.height');
    const file = await relativeFile(await fs.realpath(ROOT), definition.file, `template ${definition.id}`, ['.html']);
    if (file.size > 1024 * 1024) fail(`template ${definition.id}: larger than 1 MiB`);
    const html = file.bytes.toString('utf8');
    for (const match of html.matchAll(/\{\{([^{}]+)\}\}/g)) if (!MARKERS.has(match[1])) fail(`template ${definition.id}: unknown marker ${match[1]}`);
    if (!html.includes('{{LAYOUT_STYLE}}')) fail(`template ${definition.id}: missing required marker {{LAYOUT_STYLE}}`);
    // An undefined var() falls back to the inherited or initial value, so a template written for another
    // renderer version would silently lose the brand font or line height.
    const own = new Set([...html.matchAll(/--([A-Za-z0-9_-]+)\s*:/g)].map(match => match[1]));
    const unknown = [...new Set([...html.matchAll(/var\(\s*--([A-Za-z0-9_-]+)/g)].map(match => match[1]))].filter(name => !defined.has(name) && !own.has(name));
    if (unknown.length) fail(`template ${definition.id}: uses CSS variables this renderer does not define: ${unknown.map(name => `--${name}`).join(', ')}; see "从 brand.json schema 1 迁移" in libraries/applications/contract.md`);
    templates.set(definition.id, { ...definition, file, html, slots: displaySlots(html, `template ${definition.id}`) });
  }
  const plan = new Map(resources.map(({ output, file }) => [output, file.bytes]));
  plan.set('brand.css', Buffer.from(css));
  const items = [];
  const usedTemplates = new Map();
  for (const item of contentItems) {
    const template = templates.get(item.template);
    if (!template) fail(`item ${item.id}: unknown template ${String(item.template)}`);
    for (const field of ['title', 'body', 'kicker', 'footer']) {
      if (item[field].trim() && !template.slots.has(field.toUpperCase())) fail(`item ${item.id}: template ${template.id} lacks display slot {{${field.toUpperCase()}}} for nonempty ${field}`);
    }
    const { layout, overrides } = validateLayout(item, template, brand);
    const values = {
      LANG: brand.language, BRAND_NAME: brand.name, TITLE: item.title,
      BODY: item.body, KICKER: item.kicker,
      FOOTER: item.footer, THEME: item.theme,
      LOGO_SRC: `assets/logo-${item.theme}.svg`, WIDTH: template.width, HEIGHT: template.height,
      LAYOUT_STYLE: makeLayoutStyle(layout, template.width),
    };
    const html = template.html.replace(/\{\{([^{}]+)\}\}/g, (_, key) => key === 'GRAPHIC' ? (brand.assets.graphic?.[item.theme] == null ? '' : `<img class="art" src="assets/graphic-${item.theme}.svg" alt="" aria-hidden="true">`) : escapeHTML(values[key]));
    const output = `${item.id}.html`;
    plan.set(output, Buffer.from(html));
    usedTemplates.set(template.id, template);
    items.push({ id: item.id, template: template.id, theme: item.theme, width: template.width, height: template.height, layout, line_height_overrides: overrides, output });
  }
  const allSources = [brandFile, contentFile, templateIndex, renderer, ...resources.map(x => x.file), ...[...templates.values()].map(x => x.file)];
  return {
    plan, allSources,
    manifest: {
      schema_version: 1, generator: GENERATOR,
      brand: { id: brand.id, name: brand.name, language: brand.language, font_families: brand.type.fonts.map(font => font.family) },
      sources: {
        brand: sourceRecord(brandFile), content: sourceRecord(contentFile), template_index: sourceRecord(templateIndex), renderer: sourceRecord(renderer),
        templates: [...usedTemplates.values()].map(t => ({ id: t.id, width: t.width, height: t.height, ...sourceRecord(t.file) })).sort((a, b) => a.id.localeCompare(b.id)),
        resources: resources.map(x => ({ role: x.key, output: x.output, ...sourceRecord(x.file) })),
      },
      items,
      outputs: [...plan].map(([file, bytes]) => ({ path: file, sha256: hash(bytes), size: bytes.length })).sort((a, b) => a.path.localeCompare(b.path)),
      stale: [],
      validation: { browser: 'not_run', visual: 'not_run', overflow: 'not_run', contrast: 'not_run', font_rendering: 'not_run' },
    },
  };
}

async function outputRoot(requested) {
  const existing = await statOrNull(requested);
  if (existing && (!existing.isDirectory() || existing.isSymbolicLink())) fail('output: must be a directory, not a symlink');
  let ancestor = requested;
  const tail = [];
  while (!(await statOrNull(ancestor))) { tail.unshift(path.basename(ancestor)); ancestor = path.dirname(ancestor); }
  if (!(await fs.stat(ancestor)).isDirectory()) fail('output: ancestor is not a directory');
  return path.join(await fs.realpath(ancestor), ...tail);
}

async function safeDestination(root, relative) {
  const parts = relative.split('/');
  let target = root;
  for (let index = 0; index < parts.length; index++) {
    target = path.join(target, parts[index]);
    const stat = await statOrNull(target);
    if (!stat) continue;
    if (stat.isSymbolicLink()) fail(`output conflict: symlink at ${relative}`);
    if (index < parts.length - 1 && !stat.isDirectory()) fail(`output conflict: parent is not directory for ${relative}`);
    if (index === parts.length - 1 && !stat.isFile()) fail(`output conflict: not a regular file ${relative}`);
  }
  return target;
}

function checkRecord(record) {
  object(record, 'managed output');
  const allowed = /^(?:[a-z][a-z0-9-]{0,63}\.html|brand\.css|assets\/(?:fonts\/[1-8]\/[^/\\\0]{1,128}|logo-paper\.svg|logo-brand\.svg|graphic-paper\.svg|graphic-brand\.svg))$/;
  if (typeof record.path !== 'string' || !allowed.test(record.path) || !SHA.test(record.sha256) || !Number.isInteger(record.size) || record.size < 0) fail('build.json: invalid managed output record');
}

async function preflight(root, prepared) {
  const manifestPath = await safeDestination(root, 'build.json');
  const snapshot = new Map();
  const managed = new Map();
  const oldBytes = await fs.readFile(manifestPath).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
  snapshot.set('build.json', oldBytes);
  if (oldBytes) {
    let old;
    try { old = JSON.parse(oldBytes.toString('utf8')); } catch { fail('output conflict: build.json is not a valid renderer manifest'); }
    object(old, 'build.json');
    const { integrity, ...unsigned } = old;
    if (old.schema_version !== 1 || old.generator !== GENERATOR || integrity?.algorithm !== 'sha256' || integrity?.scope !== 'canonical-json-without-integrity' || integrity.sha256 !== hash(canonical(unsigned))) fail('output conflict: build.json was modified or is not owned by this renderer');
    if (!oldBytes.equals(jsonBytes(old))) fail('output conflict: build.json formatting was modified');
    if (!Array.isArray(old.outputs) || !Array.isArray(old.stale)) fail('build.json: invalid output lists');
    for (const record of [...old.outputs, ...old.stale]) {
      checkRecord(record);
      if (managed.has(record.path)) fail(`build.json: duplicate managed path ${record.path}`);
      managed.set(record.path, record);
      const target = await safeDestination(root, record.path);
      const bytes = await fs.readFile(target).catch(e => { if (e.code === 'ENOENT') fail(`managed file missing: ${record.path}`); throw e; });
      if (hash(bytes) !== record.sha256 || bytes.length !== record.size) fail(`managed file modified: ${record.path}`);
      snapshot.set(record.path, bytes);
    }
  }
  for (const relative of prepared.plan.keys()) {
    const target = await safeDestination(root, relative);
    if (prepared.allSources.some(source => source.path === target)) fail(`output conflict: would overwrite input ${relative}`);
    if (await statOrNull(target)) {
      if (!managed.has(relative)) fail(`unrelated file conflict: ${relative}`);
    } else snapshot.set(relative, null);
  }
  if (prepared.allSources.some(source => source.path === manifestPath)) fail('output conflict: build.json would overwrite input');
  prepared.manifest.stale = [...managed.values()].filter(record => !prepared.plan.has(record.path)).sort((a, b) => a.path.localeCompare(b.path));
  prepared.manifest.integrity = { algorithm: 'sha256', scope: 'canonical-json-without-integrity', sha256: hash(canonical(prepared.manifest)) };
  prepared.plan.set('build.json', jsonBytes(prepared.manifest));
  return snapshot;
}

async function unchanged(root, relative, expected) {
  const target = await safeDestination(root, relative);
  const actual = await fs.readFile(target).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
  if ((expected === null) !== (actual === null) || (expected !== null && !expected.equals(actual))) fail(`output changed during build: ${relative}`);
}

async function commit(root, prepared, snapshot) {
  // Validation finishes before staging. Staging is a sibling, so output never sees incomplete bytes.
  const parent = path.dirname(root);
  await fs.mkdir(parent, { recursive: true });
  const stage = await fs.mkdtemp(path.join(parent, '.brand-render-stage-'));
  const installed = [];
  const createdDirs = [];
  let retainStage = false;
  try {
    for (const [relative, bytes] of prepared.plan) {
      await fs.mkdir(path.dirname(path.join(stage, relative)), { recursive: true });
      await fs.writeFile(path.join(stage, relative), bytes, { flag: 'wx' });
    }
    if (!(await statOrNull(root))) {
      await fs.rename(stage, root);
      return;
    }
    const rootStat = await fs.lstat(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail('output changed during build: root');
    for (const [relative, expected] of snapshot) await unchanged(root, relative, expected);
    for (const [relative, bytes] of prepared.plan) {
      const expected = snapshot.get(relative) ?? null;
      if (expected !== null && expected.equals(bytes)) continue;
      await unchanged(root, relative, expected);
      const destination = path.join(root, relative);
      const dir = path.dirname(destination);
      if (!(await statOrNull(dir))) { await fs.mkdir(dir); createdDirs.push(dir); }
      if (expected === null) {
        // link is exclusive: a newly appeared unrelated file cannot be overwritten.
        await fs.link(path.join(stage, relative), destination);
      } else {
        await fs.rename(path.join(stage, relative), destination);
      }
      installed.push({ relative, bytes, expected });
    }
  } catch (error) {
    const recovery = [];
    for (const { relative, bytes, expected } of installed.reverse()) {
      try {
        await unchanged(root, relative, bytes);
        if (expected === null) await fs.unlink(path.join(root, relative));
        else await fs.writeFile(path.join(root, relative), expected);
      } catch {
        const backup = path.join(stage, 'recovery', relative);
        await fs.mkdir(path.dirname(backup), { recursive: true });
        if (expected !== null) await fs.writeFile(backup, expected);
        recovery.push(relative);
      }
    }
    for (const dir of createdDirs.reverse()) await fs.rmdir(dir).catch(() => {});
    if (recovery.length) { retainStage = true; fail(`${error.message}; concurrent edits prevented rollback of ${recovery.join(', ')}; recovery retained at ${stage}`); }
    throw error;
  } finally {
    if (!retainStage) await fs.rm(stage, { recursive: true, force: true });
  }
}

function argumentsFrom(argv) {
  if (argv.length !== 6) fail('usage: node render.mjs --brand ABS --content ABS --output ABS');
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    if (!['brand', 'content', 'output'].includes(key) || argv[i] !== `--${key}` || args[key] || !path.isAbsolute(argv[i + 1])) fail('arguments: expected each of --brand, --content, --output once, with absolute paths');
    args[key] = path.resolve(argv[i + 1]);
  }
  if (!args.brand || !args.content || !args.output) fail('arguments: missing required option');
  return args;
}

try {
  const args = argumentsFrom(process.argv.slice(2));
  const prepared = await prepare(args);
  const root = await outputRoot(args.output);
  const snapshot = await preflight(root, prepared);
  await commit(root, prepared, snapshot);
  process.stdout.write(JSON.stringify({ output: root, items: prepared.manifest.items.length, outputs: prepared.manifest.outputs.length, stale: prepared.manifest.stale.map(x => x.path), validation: prepared.manifest.validation }) + '\n');
} catch (error) {
  process.stderr.write(`render: ${error.message}\n`);
  process.exitCode = 1;
}
