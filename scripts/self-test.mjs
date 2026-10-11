#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sha256, run, fontSignature, requireValue as assert } from './lib/validation.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: node scripts/self-test.mjs [--output /path/to/results.json]\nCreates isolated local fixtures, runs positive and fault cases, removes fixtures, and writes a mechanical test report. Requires Node, xmllint, magick and uv.');
  process.exit(0);
}
assert(args.length === 0 || args.length === 2 && args[0] === '--output', 'ARGUMENT', 'Use --output REPORT.json or no arguments');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-validation-'));
const results = [];
const write = (dir, file, value) => { const target = path.join(dir, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2) + '\n'); return target; };
const rect = (paint = '#152837', x = 4) => `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path fill="${paint}" d="M ${x} 4 H 28 V 28 H 4 Z"/></svg>`;
function invoke(script, parameters) {
  const child = spawnSync(process.execPath, [path.join(here, script), ...parameters], { encoding: 'utf8', timeout: 60000 });
  assert(!child.error, 'CHILD_EXECUTION', child.error?.message);
  let report;
  try { report = JSON.parse(child.stdout); } catch { throw new Error(`Invalid child report: ${child.stdout}\n${child.stderr}`); }
  return { exit_code: child.status, report };
}
function entry(dir, file, role, format, extra = {}) { return { path: file, role, format, sha256: sha256(path.join(dir, file)), ...extra }; }
function release(dir) {
  write(dir, 'master.svg', rect());
  write(dir, 'logo.svg', rect('#ffffff'));
  write(dir, 'optical.svg', rect('#ffffff', 5));
  run('magick', ['-size','32x32','xc:none','-fill','#152837','-draw','rectangle 4,4 27,27',path.join(dir,'logo.png')]);
  run('magick', ['-size','32x32','xc:#708090',path.join(dir,'material.png')]);
  write(dir, 'review.md', '# Fixture evidence\nThis is a mechanical fixture, not a visual approval.\n');
  return {
    schema_version: 1, brand: 'Checker Fixture', version: 'fixture-1',
    masters: [{ path: 'master.svg', kind: 'vector' }],
    files: [
      entry(dir,'master.svg','master','svg',{width:32,height:32,geometry_group:'mark'}),
      entry(dir,'logo.svg','logo','svg',{width:32,height:32,source_master:'master.svg',geometry_group:'mark'}),
      entry(dir,'optical.svg','favicon','svg',{width:32,height:32,source_master:'master.svg',variant_kind:'optical',variant_reason:'Open a one-unit aperture for the fixture size.'}),
      entry(dir,'logo.png','logo','png',{width:32,height:32,source_master:'master.svg',transparency:'required'}),
      entry(dir,'material.png','application','png',{width:32,height:32,source_master:'master.svg',variant_kind:'material',transparency:'opaque'}),
      entry(dir,'review.md','evidence','md')
    ], checks: { fixture: { status: 'pass', evidence: 'review.md' } }
  };
}
function testRelease(name, expected, mutate = () => {}, after) {
  const dir = path.join(temp, name); fs.mkdirSync(dir);
  const j = release(dir); mutate(j, dir);
  const file = write(dir, 'manifest.json', j);
  const { exit_code, report } = invoke('validate-release.mjs', [file]);
  const codes = report.errors.map(error => error.code);
  const passed = expected === 'PASS' ? exit_code === 0 && report.result === 'PASS' : exit_code === 1 && codes.includes(expected);
  if (after) after(report);
  results.push({ case: name, expected, actual: report.result, detected_codes: codes, pass: passed });
}
const htmlLayout = (body = '<main><h1>可编辑标题</h1><p>固定画布排版源</p></main>', head = '<meta charset="utf-8">') => `<!doctype html><html lang="zh-CN"><head>${head}<title>Mechanical layout fixture</title><link rel="stylesheet" href="layout.css"></head><body>${body}</body></html>`;
function htmlRelease(j, dir) {
  write(dir, 'source/layout.html', htmlLayout());
  write(dir, 'source/layout.css', 'html,body{margin:0;width:1200px;height:630px}main{padding:64px}h1{font-size:64px}p{font-size:32px}\n');
  run('magick', ['-size','1200x630','xc:#152837',path.join(dir,'application.png')]);
  j.masters.push({ path: 'source/layout.html', kind: 'html' });
  j.files.push(entry(dir,'source/layout.html','master','html'), entry(dir,'source/layout.css','source','css'), entry(dir,'application.png','application','png',{width:1200,height:630,source_master:'source/layout.html',transparency:'opaque'}));
  fs.appendFileSync(path.join(dir,'review.md'), 'The HTML and PNG are synthetic mechanical fixtures. The PNG is not a browser render; no visual or editability approval is claimed.\n');
  j.files.find(record => record.path === 'review.md').sha256 = sha256(path.join(dir,'review.md'));
}
function testHtml(name, expected, mutate = () => {}, after) {
  testRelease(name, expected, (j, dir) => { htmlRelease(j, dir); mutate(j, dir); }, after);
}
function replaceHtml(j, dir, source) {
  write(dir, 'source/layout.html', source);
  j.files.find(record => record.path === 'source/layout.html').sha256 = sha256(path.join(dir,'source/layout.html'));
}
function skill(dir) {
  write(dir, 'SKILL.md', '---\nname: visual-system\ndescription: Fixture entry for validation tests.\n---\n# Fixture\n[Catalog](references/00-catalog.md)\n');
  write(dir, 'references/CONVENTIONS.md', '# Fixture conventions\n');
  write(dir, 'references/00-catalog.md', '# Catalog\n[BD-TEST-001](rules.md#bd-test-001)\n');
  write(dir, 'references/rules.md', '# Rules\n<a id="bd-test-001"></a>\n## BD-TEST-001 · Fixture\n- 触发：Fixture input.\n- 规则：Fixture rule.\n- 产物：Fixture output.\n- 验证：Fixture verification.\n');
  const styles = path.join(dir, 'libraries/styles');
  const pack = path.join(styles, 'fixture'); fs.mkdirSync(pack, { recursive: true });
  write(styles, 'INDEX.md', '# Styles\n[STYLE](fixture/STYLE.md) [Examples](fixture/EXAMPLES.md)\n');
  write(pack, 'STYLE.md', '---\nid: fixture\nname: Fixture\nversion: 1\nstatus: provisional\n---\n# Fixture\n');
  write(pack, 'EXAMPLES.md', '# Examples\n![one](original.png)\n');
  write(pack, 'PROMPTS.md', '# Prompts\n');
  run('magick', ['-size','32x32','xc:white',path.join(pack,'original.png')]);
  fs.copyFileSync(path.join(pack,'original.png'),path.join(pack,'preview.png'));
  fs.copyFileSync(path.join(pack,'original.png'),path.join(pack,'enhanced.png'));
  fs.copyFileSync(path.join(pack,'original.png'),path.join(styles,'OVERVIEW.png'));
  write(pack, 'PROMPT.json', { id: 'sample-1', prompt: 'Fixture prompt.' });
  const hash = sha256(path.join(pack,'original.png'));
  const source = { schema_version:1, style_id:'fixture', status:'provisional', assets:[{id:'source-1',page_url:'https://example.com/reference',original_file:'original.png',original_sha256:hash,original_content_type:'image/png',width:32,height:32,preview_file:'preview.png',preview_sha256:hash,preview_content_type:'image/png'}], samples:[{id:'sample-1',asset_id:'source-1',observation:'Fixture observation',transfer_suggestion:'Fixture transfer',display_file:'preview.png'}], reference_groups:[{id:'group',sample_ids:['sample-1'],count:1,overview_file:'preview.png',overview_sha256:hash}] };
  write(pack, 'sources.json', source);
  const overview = { members:[{style_id:'fixture',sample_id:'sample-1',sources_file:'fixture/sources.json',file:'fixture/preview.png',sha256:hash,ai_enhanced:false}], output_file:'OVERVIEW.png',sha256:hash,width:32,height:32 };
  write(styles, 'OVERVIEW.sources.json', overview);
  return { source, overview, pack, styles, hash };
}
function testSkill(name, expected, mutate = () => {}, after = () => true) {
  const dir = path.join(temp, name); fs.mkdirSync(dir);
  const data = skill(dir); mutate(data, dir);
  write(data.pack, 'sources.json', data.source); write(data.styles, 'OVERVIEW.sources.json', data.overview);
  if (data.generated) write(data.pack, 'generated.json', data.generated);
  if (data.originals) write(data.pack, 'originals.json', data.originals);
  const { exit_code, report } = invoke('check-skill.mjs', ['--root',dir]);
  const codes = report.errors.map(error => error.code);
  const pass = (expected === 'PASS' ? exit_code === 0 && report.result === 'PASS' : exit_code === 1 && codes.includes(expected)) && after(report);
  results.push({ case:name, expected, actual:report.result, detected_codes:codes, pass });
}
try {
  testRelease('release-standard-optical-material', 'PASS');
  testRelease('release-svg-intrinsic-size-before-viewbox', 'PASS', (j,dir) => {
    write(dir,'master.svg',rect().replace('viewBox="0 0 32 32"','viewBox="0 0 64 64"'));
    j.files[0].sha256=sha256(path.join(dir,'master.svg'));delete j.files[0].geometry_group;delete j.files[1].geometry_group;
  });
  testRelease('release-image-cannot-have-font-role', 'FONT_FORMAT', j => { j.files[3].role='font'; });
  testRelease('release-font-needs-license', 'FONT_LICENSE', (j,dir) => {
    const data=Buffer.alloc(12);data.writeUInt32BE(0x10000,0);write(dir,'fixture.ttf',data);
    j.files.push(entry(dir,'fixture.ttf','font','ttf'));
  });
  testRelease('release-sha-mismatch', 'HASH_MISMATCH', j => { j.files[1].sha256 = '0'.repeat(64); });
  testRelease('release-wrong-dimensions', 'DIMENSION_MISMATCH', j => { j.files[3].width = 33; });
  testRelease('release-missing-source-master', 'SOURCE_MASTER_REQUIRED', j => { delete j.files[3].source_master; });
  testRelease('release-unknown-source-master', 'SOURCE_MASTER', j => { j.files[3].source_master = 'unknown.svg'; });
  testRelease('release-source-master-cycle', 'SOURCE_MASTER_CYCLE', j => { j.masters.push({path:'logo.svg',kind:'vector'});j.files[0].source_master='logo.svg'; });
  testRelease('release-master-not-in-files', 'MASTER_FILE', j => { j.files = j.files.filter(file => file.path !== 'master.svg'); });
  testRelease('release-path-escape', 'PATH_ESCAPE', j => { j.files[1].path = '../outside.svg'; });
  testRelease('release-symlink-escape', 'PATH_ESCAPE', (j,dir) => { const outside=write(temp,'outside.svg',rect()); fs.symlinkSync(outside,path.join(dir,'escape.svg'));j.files[1].path='escape.svg';j.files[1].sha256=sha256(outside); });
  testRelease('release-opaque-as-transparent', 'PNG_ALPHA_REQUIRED', (j,dir) => { fs.copyFileSync(path.join(dir,'material.png'),path.join(dir,'logo.png'));j.files[3].sha256=sha256(path.join(dir,'logo.png')); });
  testRelease('release-empty-transparent-image', 'PNG_ALPHA_REQUIRED', (j,dir) => { run('magick',['-size','32x32','xc:none',path.join(dir,'logo.png')]);j.files[3].sha256=sha256(path.join(dir,'logo.png')); });
  testRelease('release-malformed-svg', 'TOOL_FAILED', (j,dir) => { write(dir,'logo.svg','<svg width="32" height="32"><path></svg>');j.files[1].sha256=sha256(path.join(dir,'logo.svg')); });
  testRelease('release-raster-wrapped-as-vector', 'SVG_EMBED', (j,dir) => { write(dir,'master.svg','<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><image href="data:image/png;base64,abc"/></svg>');j.files[0].sha256=sha256(path.join(dir,'master.svg')); });
  testRelease('release-material-vector-master', 'VECTOR_MASTER', j => { j.files[0].variant_kind = 'material';delete j.files[0].geometry_group;delete j.files[1].geometry_group; });
  testRelease('release-geometry-change', 'GEOMETRY_MISMATCH', (j,dir) => { write(dir,'logo.svg',rect('#fff',6));j.files[1].sha256=sha256(path.join(dir,'logo.svg')); });
  testRelease('release-optical-without-reason', 'OPTICAL_REASON', j => { delete j.files[2].variant_reason; });
  testRelease('release-optical-in-standard-group', 'GEOMETRY_SCOPE', j => { j.files[2].geometry_group='mark'; });
  for (const [name,ref,expected] of [
    ['single-quoted-local',"'#g'",'PASS'],['double-quoted-local','&quot;#g&quot;','PASS'],
    ['single-quoted-external',"'https://example.com/a.svg#g'",'SVG_EXTERNAL'],['double-quoted-external','&quot;https://example.com/a.svg#g&quot;','SVG_EXTERNAL']
  ]) testRelease(`release-${name}`,expected,(j,dir)=>{
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><defs><linearGradient id="g"><stop stop-color="#000"/></linearGradient></defs><path d="M4 4H28V28H4Z" fill="url(${ref})"/></svg>`;
    write(dir,'master.svg',svg);j.files[0].sha256=sha256(path.join(dir,'master.svg'));delete j.files[0].geometry_group;delete j.files[1].geometry_group;
  });
  testRelease('release-declared-fail', 'DECLARED_CHECK_FAILED', j => { j.checks.fixture.status='fail'; });
  testRelease('release-not-run-is-not-ready', 'PASS', j => { j.checks.fixture={status:'not_run',reason:'Fixture intentionally lacks visual review.'}; }, report => assert(report.ready_for_delivery === false,'READINESS','not_run must not be ready'));
  testRelease('release-pass-missing-evidence', 'FILE_MISSING', j => { j.checks.fixture.evidence='missing.md'; });
  testRelease('release-missing-svg-local-reference', 'SVG_LOCAL_REF', (j,dir) => { write(dir,'logo.svg',rect().replace('fill="#152837"','fill="url(#missing)"'));j.files[1].sha256=sha256(path.join(dir,'logo.svg')); });
  testRelease('release-svg-comment-is-not-element', 'PASS', (j,dir) => { write(dir,'logo.svg',rect('#fff').replace('<path','<!-- An <image> is only mentioned here. -->\n<path'));j.files[1].sha256=sha256(path.join(dir,'logo.svg')); });
  testHtml('release-html-fixed-canvas-png', 'PASS');
  testHtml('release-ordinary-html-keeps-existing-contract', 'PASS', (j,dir) => {
    write(dir,'guide.html','<p>HTML documentation fragment: not a layout master.</p>');
    j.files.push(entry(dir,'guide.html','documentation','html'));
  });
  testHtml('release-html-only-master', 'PASS', (j,dir) => {
    const kept = new Set(['source/layout.html','source/layout.css','application.png','review.md']);
    for (const record of j.files) if (!kept.has(record.path)) fs.unlinkSync(path.join(dir,record.path));
    j.files = j.files.filter(record => kept.has(record.path));
    j.masters = j.masters.filter(master => master.kind === 'html');
  });
  testHtml('release-html-optional-script-with-static-content', 'PASS', (j,dir) => {
    const sentinel = path.join(dir,'script-executed.txt');
    replaceHtml(j,dir,htmlLayout(`<main><h1>Static content</h1><p>Optional enhancement</p></main><script>require('node:fs').writeFileSync(${JSON.stringify(sentinel)}, 'unexpected');</script>`));
    j.checks.fixture.reason = 'Script source is a synthetic execution sentinel; the validator must not execute it.';
  }, report => assert(!report.warnings.some(warning => warning.includes('script-executed.txt')), 'HTML_EXECUTION', 'HTML scripts must not execute'));
  testHtml('release-html-charset-http-equiv', 'PASS', (j,dir) => replaceHtml(j,dir,htmlLayout(undefined,'<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">')));
  testHtml('release-html-raster-master-chain', 'PASS', j => {
    j.masters.push({path:'application.png',kind:'raster'});
    j.files.find(record => record.path === 'logo.png').source_master = 'application.png';
  });
  testHtml('release-html-missing-file', 'FILE_MISSING', (_,dir) => fs.unlinkSync(path.join(dir,'source/layout.html')));
  testHtml('release-html-sha-mismatch', 'HASH_MISMATCH', j => { j.files.find(record => record.path === 'source/layout.html').sha256='0'.repeat(64); });
  testHtml('release-html-unknown-master-kind', 'MASTER_KIND', j => { j.masters.find(master => master.kind === 'html').kind='code'; });
  testHtml('release-html-wrong-role', 'HTML_MASTER', j => { j.files.find(record => record.path === 'source/layout.html').role='application'; });
  testHtml('release-html-wrong-format', 'HTML_MASTER', j => { j.files.find(record => record.path === 'source/layout.html').format='md'; });
  testHtml('release-html-image-fields-forbidden', 'IMAGE_FIELDS_SCOPE', j => { j.files.find(record => record.path === 'source/layout.html').width=1200; });
  testHtml('release-html-plain-text-disguise', 'HTML_DOCUMENT', (j,dir) => replaceHtml(j,dir,'This file is not an HTML layout source.'));
  testHtml('release-html-png-disguise', 'HTML_ENCODING', (j,dir) => replaceHtml(j,dir,fs.readFileSync(path.join(dir,'application.png'))));
  testHtml('release-html-incomplete-document', 'HTML_DOCUMENT', (j,dir) => replaceHtml(j,dir,htmlLayout().replace('</body>','')));
  testHtml('release-html-missing-charset', 'HTML_CHARSET', (j,dir) => replaceHtml(j,dir,htmlLayout(undefined,'')));
  testHtml('release-html-charset-mentioned-is-not-declared', 'HTML_CHARSET', (j,dir) => replaceHtml(j,dir,htmlLayout(undefined,'<meta data-note="charset=utf-8">')));
  testHtml('release-html-empty-spa-body', 'HTML_STATIC_CONTENT', (j,dir) => replaceHtml(j,dir,htmlLayout('<div id="app"></div><script>document.getElementById("app").innerHTML="<h1>Generated</h1><p>Script-only content</p>";</script>')));
  testHtml('release-html-template-only-body', 'HTML_STATIC_CONTENT', (j,dir) => replaceHtml(j,dir,htmlLayout('<template><main><h1>Not rendered</h1><p>Template content</p></main></template><div id="app"></div>')));
  testHtml('release-html-flattened-image', 'HTML_STATIC_CONTENT', (j,dir) => replaceHtml(j,dir,htmlLayout('<main><img src="../application.png" alt="Flattened poster text"></main>')));
  testHtml('release-html-single-text-element', 'PASS', (j,dir) => replaceHtml(j,dir,htmlLayout('<p>Single text element</p>')));
  testHtml('release-html-as-vector', 'VECTOR_MASTER', j => { j.masters.find(master => master.kind === 'html').kind='vector'; });
  testHtml('release-html-as-raster', 'RASTER_MASTER', j => { j.masters.find(master => master.kind === 'html').kind='raster'; });
  testHtml('release-html-to-svg', 'HTML_DERIVATIVE_FORMAT', j => { j.files.find(record => record.path === 'logo.svg').source_master='source/layout.html'; });
  testHtml('release-html-to-nonimage', 'HTML_DERIVATIVE_FORMAT', j => { j.files.find(record => record.path === 'source/layout.css').source_master='source/layout.html'; });
  testHtml('release-html-geometry-group-forbidden', 'IMAGE_FIELDS_SCOPE', j => { j.files.find(record => record.path === 'source/layout.html').geometry_group='mark'; });
  testHtml('release-html-source-master-cycle', 'SOURCE_MASTER_CYCLE', j => {
    j.masters.push({path:'application.png',kind:'raster'});
    j.files.find(record => record.path === 'source/layout.html').source_master='application.png';
  });
  testHtml('release-html-not-run-is-not-ready', 'PASS', j => { j.checks.fixture={status:'not_run',reason:'Browser rendering has not been run for this mechanical fixture.'}; }, report => assert(report.ready_for_delivery === false,'READINESS','HTML not_run must not be ready'));
  testSkill('skill-schema-variants-and-catalog','PASS');
  testSkill('skill-bad-frontmatter','FRONTMATTER_FIELD', (_,dir) => write(dir,'SKILL.md','---\nname: visual-system\n---\n# Fixture\n'));
  testSkill('skill-empty-block-description','FRONTMATTER_FIELD', (_,dir) => write(dir,'SKILL.md','---\nname: visual-system\ndescription: |\n---\n# Fixture\n'));
  testSkill('skill-multiline-description','PASS', (_,dir) => write(dir,'SKILL.md','---\nname: visual-system\ndescription: >\n  Fixture description.\n  Second line.\n---\n# Fixture\n'));
  testSkill('skill-fenced-broken-link-is-ignored','PASS', (_,dir) => fs.appendFileSync(path.join(dir,'SKILL.md'),'\n```md\n[example](missing.md)\n```\n'));
  testSkill('skill-broken-link','FILE_MISSING', (_,dir) => fs.appendFileSync(path.join(dir,'SKILL.md'),'\n[missing](missing.md)\n'));
  testSkill('skill-duplicate-rule','CARD_DUPLICATE', (_,dir) => fs.appendFileSync(path.join(dir,'references/rules.md'),'\n## BD-TEST-001 · Duplicate\n'));
  testSkill('skill-card-missing-field','CARD_FIELD', (_,dir) => { const f=path.join(dir,'references/rules.md');fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace('- 验证：Fixture verification.','')); });
  testSkill('skill-card-empty-field','CARD_FIELD', (_,dir) => { const f=path.join(dir,'references/rules.md');fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace('- 规则：Fixture rule.','- 规则：')); });
  testSkill('skill-card-invalid-id','CARD_ID', (_,dir) => { for(const relative of ['references/rules.md','references/00-catalog.md']){const f=path.join(dir,relative);fs.writeFileSync(f,fs.readFileSync(f,'utf8').replaceAll('BD-TEST-001','BD-TEST-X1').replaceAll('bd-test-001','bd-test-x1'));} });
  testSkill('skill-catalog-wrong-anchor','LINK_ANCHOR', (_,dir) => write(dir,'references/00-catalog.md','# Catalog\n[BD-TEST-001](rules.md#missing)\n'));
  testSkill('skill-unknown-source','SOURCE_REFERENCE', data => { data.source.samples[0].asset_id='missing'; });
  testSkill('skill-duplicate-sample','ID_DUPLICATE', data => { data.source.samples.push(structuredClone(data.source.samples[0])); });
  const addEnhancement = data => {
    data.source.samples[0].display_file='enhanced.png';
    data.source.samples[0].enhancement={kind:'ai_clarity_enhancement',input_file:'preview.png',output_file:'enhanced.png',tool:'fixture',prompt_id:'sample-1',prompt_file:'PROMPT.json',width:32,height:32,sha256:data.hash,review:{status:'fixture'}};
    data.overview.members[0].file='fixture/enhanced.png';data.overview.members[0].ai_enhanced=true;
  };
  testSkill('skill-preview-enhancement-input','PASS', addEnhancement);
  testSkill('skill-cross-source-enhancement-input','ENHANCEMENT_PROVENANCE', data => {
    addEnhancement(data);fs.copyFileSync(path.join(data.pack,'preview.png'),path.join(data.pack,'other.png'));
    data.source.assets.push({...data.source.assets[0],id:'source-2',original_file:'other.png',preview_file:'other.png'});
    data.source.samples[0].enhancement.input_file='other.png';
  });
  testSkill('skill-group-membership','GROUP_MEMBERS', data => { data.source.reference_groups[0].sample_ids=['missing']; });
  testSkill('skill-source-format-mismatch','FORMAT_MISMATCH', data => { data.source.assets[0].original_content_type='image/jpeg'; });
  testSkill('skill-source-dimensions-missing','SOURCE_IMAGE_FIELDS', data => { delete data.source.assets[0].width;delete data.source.assets[0].height; });
  testSkill('skill-source-sha-mismatch','HASH_MISMATCH', data => { data.source.assets[0].original_sha256='0'.repeat(64); });

  const addReinterpretation = data => {
    // A copied white square exercises metadata only, never image-generation quality.
    fs.copyFileSync(path.join(data.pack,'original.png'),path.join(data.pack,'reinterpretation.png'));
    data.generated = {
      schema_version:1, style_id:'fixture', coverage:'all_source_samples',
      examples:[{id:'sample-1',kind:'ai_reinterpretation',source_sample_id:'sample-1',tool:'mechanical-fixture',prompt:'Synthetic fixture prompt; this file is not an actual generation.',input_files:['preview.png'],output_file:'reinterpretation.png',width:32,height:32,sha256:data.hash,review:{status:'pass',scope:'Mechanical fixture only.',notes:'No actual image generation or visual review is claimed.'}}]
    };
    data.overview.schema_version = 2;
    data.overview.members = [{style_id:'fixture',kind:'ai_reinterpretation',generated_file:'fixture/generated.json',example_id:'sample-1',file:'fixture/reinterpretation.png',sha256:data.hash}];
  };
  const testGenerated = (name, expected, mutate = () => {}) => testSkill(name, expected, (data,dir) => { addReinterpretation(data); mutate(data,dir); });
  testGenerated('skill-generated-one-to-one','PASS');
  const observedOnly = data => { Object.assign(data.generated.examples[0], {image_reference_mode:'observed_only',input_files:[],reference_files:['preview.png']}); };
  testGenerated('skill-generated-observed-only','PASS', observedOnly);
  testGenerated('skill-generated-unknown-input-mode','GENERATED_INPUT_MODE', data => { data.generated.examples[0].image_reference_mode='guessed'; });
  testGenerated('skill-generated-observed-only-missing-reference','GENERATED_INPUTS', data => { observedOnly(data);delete data.generated.examples[0].reference_files; });
  testGenerated('skill-generated-observed-only-with-supplied-input','GENERATED_INPUTS', data => { observedOnly(data);data.generated.examples[0].input_files=['preview.png']; });
  testGenerated('skill-generated-observed-only-empty-reference','GENERATED_INPUTS', data => { observedOnly(data);data.generated.examples[0].reference_files=[]; });
  testGenerated('skill-generated-observed-only-cross-sample','GENERATED_INPUT_PROVENANCE', data => { observedOnly(data);fs.copyFileSync(path.join(data.pack,'original.png'),path.join(data.pack,'other.png'));data.generated.examples[0].reference_files=['other.png']; });
  testGenerated('skill-generated-observed-only-duplicate','GENERATED_INPUT_PROVENANCE', data => { observedOnly(data);data.generated.examples[0].reference_files=['preview.png','./preview.png']; });
  testGenerated('skill-generated-supplied-with-viewed-references','GENERATED_INPUTS', data => { data.generated.examples[0].reference_files=['preview.png']; });
  testGenerated('skill-generated-supporting-source','PASS', data => {
    fs.copyFileSync(path.join(data.pack,'preview.png'),path.join(data.pack,'supporting.png'));
    data.source.assets.push({...data.source.assets[0],id:'source-2',original_file:'supporting.png',preview_file:'supporting.png'});
    data.source.samples[0].supporting_asset_ids = ['source-2'];
    data.generated.examples[0].input_files = ['supporting.png'];
  });
  testGenerated('skill-generated-source-enhancement-input','PASS', data => {
    const overview = structuredClone(data.overview);
    addEnhancement(data);
    data.overview = overview;
    data.generated.examples[0].input_files = ['enhanced.png'];
  });
  testGenerated('skill-generated-optional-prompt-file','PASS', data => { data.generated.examples[0].prompt_file='PROMPT.json'; });
  testGenerated('skill-generated-schema','GENERATED_SCHEMA', data => { data.generated.schema_version=2; });
  testGenerated('skill-generated-partial-coverage','GENERATED_SCHEMA', data => { data.generated.coverage='selected_samples'; });
  testGenerated('skill-generated-style-mismatch','GENERATED_STYLE', data => { data.generated.style_id='other'; });
  testGenerated('skill-generated-missing-example','GENERATED_COVERAGE', data => { data.generated.examples=[]; });
  testGenerated('skill-generated-extra-example','GENERATED_COVERAGE', data => { data.generated.examples.push({...data.generated.examples[0],id:'unknown'}); });
  testGenerated('skill-generated-duplicate-id','ID_DUPLICATE', data => { data.generated.examples.push(structuredClone(data.generated.examples[0])); });
  testGenerated('skill-generated-missing-mapping','GENERATED_MAPPING', data => { delete data.generated.examples[0].source_sample_id; });
  testGenerated('skill-generated-wrong-mapping','GENERATED_MAPPING', data => { data.generated.examples[0].source_sample_id='missing'; });
  testGenerated('skill-generated-clarity-is-not-reinterpretation','GENERATED_KIND', data => { data.generated.examples[0].kind='ai_clarity_enhancement'; });
  testGenerated('skill-generated-original-is-not-reinterpretation','GENERATED_KIND', data => { data.generated.examples[0].kind='original'; });
  testGenerated('skill-generated-missing-tool','GENERATED_FIELDS', data => { delete data.generated.examples[0].tool; });
  testGenerated('skill-generated-empty-prompt','GENERATED_FIELDS', data => { data.generated.examples[0].prompt=' '; });
  testGenerated('skill-generated-prompt-file-needs-full-prompt','GENERATED_FIELDS', data => { data.generated.examples[0].prompt_file='PROMPT.json';delete data.generated.examples[0].prompt; });
  testGenerated('skill-generated-missing-prompt-file','FILE_MISSING', data => { data.generated.examples[0].prompt_file='missing.json'; });
  testGenerated('skill-generated-missing-review','GENERATED_REVIEW', data => { delete data.generated.examples[0].review; });
  testGenerated('skill-generated-unreviewed','GENERATED_REVIEW', data => { data.generated.examples[0].review.status='not_run'; });
  testGenerated('skill-generated-empty-review-scope','GENERATED_REVIEW', data => { data.generated.examples[0].review.scope=''; });
  testGenerated('skill-generated-empty-review-notes','GENERATED_REVIEW', data => { data.generated.examples[0].review.notes=''; });
  testGenerated('skill-generated-missing-inputs','GENERATED_INPUTS', data => { delete data.generated.examples[0].input_files; });
  testGenerated('skill-generated-empty-inputs','GENERATED_INPUTS', data => { data.generated.examples[0].input_files=[]; });
  testGenerated('skill-generated-cross-sample-input','GENERATED_INPUT_PROVENANCE', data => {
    fs.copyFileSync(path.join(data.pack,'preview.png'),path.join(data.pack,'other.png'));
    data.source.assets.push({...data.source.assets[0],id:'source-2',original_file:'other.png',preview_file:'other.png'});
    data.generated.examples[0].input_files=['other.png'];
  });
  testGenerated('skill-generated-duplicate-input','GENERATED_INPUT_PROVENANCE', data => { data.generated.examples[0].input_files=['preview.png','./preview.png']; });
  testGenerated('skill-generated-unknown-supporting-asset','GENERATED_SOURCE', data => { data.source.samples[0].supporting_asset_ids=['missing']; });
  testGenerated('skill-generated-input-escapes-pack','PATH_ESCAPE', data => { data.generated.examples[0].input_files=['../OVERVIEW.png']; });
  testGenerated('skill-generated-source-file-as-output','GENERATED_OUTPUT_PROVENANCE', data => { data.generated.examples[0].output_file='original.png'; });
  testGenerated('skill-generated-source-symlink-as-output','GENERATED_OUTPUT_PROVENANCE', data => {
    fs.symlinkSync('original.png',path.join(data.pack,'source-alias.png'));
    data.generated.examples[0].output_file='source-alias.png';
  });
  testGenerated('skill-generated-output-reused','GENERATED_OUTPUT_PROVENANCE', data => {
    data.source.samples.push({...data.source.samples[0],id:'sample-2'});
    data.generated.examples.push({...data.generated.examples[0],id:'sample-2',source_sample_id:'sample-2'});
  });
  testGenerated('skill-generated-output-missing','FILE_MISSING', data => { data.generated.examples[0].output_file='missing.png'; });
  testGenerated('skill-generated-output-escapes-pack','PATH_ESCAPE', data => { data.generated.examples[0].output_file='../OVERVIEW.png'; });
  testGenerated('skill-generated-sha-mismatch','HASH_MISMATCH', data => { data.generated.examples[0].sha256='0'.repeat(64); });
  testGenerated('skill-generated-dimensions-mismatch','DIMENSION_MISMATCH', data => { data.generated.examples[0].width=33; });
  testGenerated('skill-generated-overview-wrong-example','OVERVIEW_EXAMPLE', data => { data.overview.members[0].example_id='missing'; });
  testGenerated('skill-generated-overview-wrong-manifest','OVERVIEW_GENERATED', data => { data.overview.members[0].generated_file='fixture/sources.json'; });
  testGenerated('skill-generated-overview-source-file','OVERVIEW_DISPLAY', data => { data.overview.members[0].file='fixture/preview.png'; });
  testGenerated('skill-generated-overview-wrong-hash','OVERVIEW_DISPLAY', data => { data.overview.members[0].sha256='0'.repeat(64); });
  testGenerated('skill-generated-overview-wrong-kind','OVERVIEW_KIND', data => { data.overview.members[0].kind='ai_clarity_enhancement'; });
  testGenerated('skill-generated-overview-clarity-label','OVERVIEW_KIND', data => { data.overview.members[0].ai_enhanced=false; });
  testGenerated('skill-generated-overview-legacy-fields','OVERVIEW_KIND', data => { data.overview.members[0].sources_file='fixture/sources.json'; });
  testGenerated('skill-generated-overview-in-v1','OVERVIEW_KIND', data => { data.overview.schema_version=1; });
  testGenerated('skill-generated-overview-unknown-schema','OVERVIEW_SCHEMA', data => { data.overview.schema_version=3; });
  const addBlocker = data => {
    data.source.samples.push({...data.source.samples[0],id:'sample-2'});
    data.generated.coverage='partial_with_blockers';
    data.generated.blocked=[{id:'sample-2',source_sample_id:'sample-2',status:'blocked',tool:'mechanical-fixture',reason:'Synthetic blocked attempt; no actual request was made.',attempts:[{prompt:'Fixture reinterpretation request.',input_files:['preview.png'],error:'Synthetic tool rejection.',request_id:'fixture-request-1'},{prompt:'Fixture text-only alternative.',input_files:[],error:'Synthetic tool rejection.',request_id:'fixture-request-2'}]}];
  };
  const testBlocked = (name, expected, mutate = () => {}, after) => testSkill(name, expected, (data,dir) => { addReinterpretation(data);addBlocker(data);mutate(data,dir); }, after);
  testBlocked('skill-generated-partial-with-blockers','PASS', undefined, report => report.counts.generated_examples===1 && report.counts.blocked_examples===1 && report.warnings.some(w=>w.includes('generation is complete')));
  testGenerated('skill-generated-complete-zero-blockers','PASS', data => { data.generated.blocked=[]; });
  testBlocked('skill-generated-blocker-supporting-input','PASS', data => {
    fs.copyFileSync(path.join(data.pack,'preview.png'),path.join(data.pack,'supporting.png'));
    data.source.assets.push({...data.source.assets[0],id:'source-2',original_file:'supporting.png',preview_file:'supporting.png'});
    data.source.samples[1].supporting_asset_ids=['source-2'];data.generated.blocked[0].attempts[0].input_files=['supporting.png'];
  });
  testBlocked('skill-generated-blocker-missing-array','GENERATED_BLOCKERS', data => { delete data.generated.blocked; });
  testBlocked('skill-generated-blocker-empty-array','GENERATED_BLOCKERS', data => { data.generated.blocked=[]; });
  testBlocked('skill-generated-blocker-in-complete-coverage','GENERATED_BLOCKERS', data => { data.generated.coverage='all_source_samples'; });
  testBlocked('skill-generated-blocker-missing-coverage','GENERATED_COVERAGE', data => { data.source.samples.push({...data.source.samples[0],id:'sample-3'}); });
  testBlocked('skill-generated-blocker-extra-id','GENERATED_COVERAGE', data => { data.generated.blocked.push({...data.generated.blocked[0],id:'unknown',source_sample_id:'unknown'}); });
  testBlocked('skill-generated-blocker-duplicate-id','ID_DUPLICATE', data => { data.generated.blocked.push(structuredClone(data.generated.blocked[0])); });
  testBlocked('skill-generated-blocker-duplicates-output-id','ID_DUPLICATE', data => { data.generated.blocked[0].id='sample-1';data.generated.blocked[0].source_sample_id='sample-1'; });
  testBlocked('skill-generated-blocker-wrong-source','GENERATED_MAPPING', data => { data.generated.blocked[0].source_sample_id='sample-1'; });
  testBlocked('skill-generated-blocker-wrong-status','GENERATED_BLOCKED_FIELDS', data => { data.generated.blocked[0].status='pass'; });
  testBlocked('skill-generated-blocker-empty-reason','GENERATED_BLOCKED_FIELDS', data => { data.generated.blocked[0].reason=' '; });
  testBlocked('skill-generated-blocker-missing-tool','GENERATED_BLOCKED_FIELDS', data => { delete data.generated.blocked[0].tool; });
  for (const [key,value] of [['output_file','reinterpretation.png'],['sha256','0'.repeat(64)],['review',{status:'pass'}]]) {
    testBlocked(`skill-generated-blocker-fake-${key}`,'GENERATED_BLOCKED_OUTPUT', data => { data.generated.blocked[0][key]=value; });
  }
  testBlocked('skill-generated-blocker-attempt-fake-output','GENERATED_BLOCKED_OUTPUT', data => { data.generated.blocked[0].attempts[0].output_file='reinterpretation.png'; });
  testBlocked('skill-generated-blocker-missing-attempts','GENERATED_BLOCKED_ATTEMPTS', data => { delete data.generated.blocked[0].attempts; });
  testBlocked('skill-generated-blocker-empty-attempts','GENERATED_BLOCKED_ATTEMPTS', data => { data.generated.blocked[0].attempts=[]; });
  for (const key of ['prompt','error','request_id']) testBlocked(`skill-generated-blocker-missing-${key}`,'GENERATED_BLOCKED_ATTEMPTS', data => { delete data.generated.blocked[0].attempts[0][key]; });
  testBlocked('skill-generated-blocker-missing-input-array','GENERATED_INPUTS', data => { delete data.generated.blocked[0].attempts[0].input_files; });
  testBlocked('skill-generated-blocker-duplicate-input','GENERATED_INPUT_PROVENANCE', data => { data.generated.blocked[0].attempts[0].input_files=['preview.png','./preview.png']; });
  testBlocked('skill-generated-blocker-cross-sample-input','GENERATED_INPUT_PROVENANCE', data => {
    fs.copyFileSync(path.join(data.pack,'preview.png'),path.join(data.pack,'other.png'));
    data.source.assets.push({...data.source.assets[0],id:'source-2',original_file:'other.png',preview_file:'other.png'});
    data.generated.blocked[0].attempts[0].input_files=['other.png'];
  });
  testBlocked('skill-generated-blocker-input-escape','PATH_ESCAPE', data => { data.generated.blocked[0].attempts[0].input_files=['../OVERVIEW.png']; });
  testBlocked('skill-generated-blocker-as-overview','OVERVIEW_EXAMPLE', data => { data.overview.members[0].example_id='sample-2'; });
  testSkill('skill-source-overview-explicit-v1','PASS', data => { data.overview.schema_version=1; });
  testSkill('skill-source-overview-clarity-label-mismatch','OVERVIEW_DISPLAY', data => { addEnhancement(data);data.overview.members[0].ai_enhanced=false; });
  testSkill('skill-source-enhancement-rejects-reinterpretation','ENHANCEMENT_SCHEMA', data => { addEnhancement(data);data.source.samples[0].enhancement.kind='ai_reinterpretation'; });

  const originalFile = (pack, file = 'original-study.png', color = '#a87742') => {
    // Distinct synthetic pixels exercise identity/hash separation, not design quality.
    run('magick', ['-size','32x32',`xc:${color}`,path.join(pack,file)]);
    return sha256(path.join(pack,file));
  };
  const addOriginal = data => {
    const hash = originalFile(data.pack);
    data.originals = {
      schema_version:1,style_id:'fixture',
      examples:[{id:'original-1',kind:'original_study',title:'Synthetic original fixture',brief:'Independent fictional product brief.',method:'Distinct synthetic pixels test the metadata contract.',tool:'mechanical-fixture',prompt:'Synthetic fixture prompt; no image generation is claimed.',input_files:[],output_file:'original-study.png',width:32,height:32,sha256:hash,review:{status:'pass',scope:'Mechanical fixture only.',notes:'No actual image generation or visual review is claimed.'}}]
    };
    data.overview.schema_version=2;
    data.overview.members=[{style_id:'fixture',kind:'original_study',originals_file:'fixture/originals.json',example_id:'original-1',file:'fixture/original-study.png',sha256:hash}];
  };
  const testOriginal = (name, expected, mutate = () => {}, after) => testSkill(name, expected, (data,dir) => { addOriginal(data);mutate(data,dir); }, after);
  testOriginal('skill-original-independent-of-source','PASS', undefined, report => report.counts.original_examples===1 && report.counts.display_examples===1);
  testSkill('skill-without-originals-keeps-legacy-contract','PASS', undefined, report => report.counts.original_examples===0 && report.counts.display_examples===0);
  testOriginal('skill-original-with-reinterpretation','PASS', data => {
    const overview=structuredClone(data.overview);addReinterpretation(data);data.overview=overview;
  }, report => report.counts.original_examples===1 && report.counts.generated_examples===1 && report.counts.display_examples===2);
  testOriginal('skill-original-with-blocker-keeps-counts-separate','PASS', data => {
    const overview=structuredClone(data.overview);addReinterpretation(data);addBlocker(data);data.overview=overview;
  }, report => report.counts.original_examples===1 && report.counts.generated_examples===1 && report.counts.blocked_examples===1 && report.counts.display_examples===2 && report.warnings.some(w=>w.includes('generation is complete')));
  testOriginal('skill-original-does-not-fill-missing-generated-coverage','GENERATED_COVERAGE', data => { addReinterpretation(data);data.source.samples.push({...data.source.samples[0],id:'sample-2'}); });
  testOriginal('skill-original-with-generated-overview','PASS', addReinterpretation);
  testSkill('skill-original-with-v1-source-overview','PASS', data => { const overview=structuredClone(data.overview);addOriginal(data);data.overview=overview; });
  testOriginal('skill-original-distinct-studies','PASS', data => {
    const hash=originalFile(data.pack,'second-study.png','#4269a8');
    data.originals.examples.push({...data.originals.examples[0],id:'original-2',output_file:'second-study.png',sha256:hash});
  }, report => report.counts.original_examples===2 && report.counts.display_examples===2);
  testOriginal('skill-original-schema','ORIGINAL_SCHEMA', data => { data.originals.schema_version=2; });
  testOriginal('skill-original-style-mismatch','ORIGINAL_STYLE', data => { data.originals.style_id='other'; });
  testOriginal('skill-original-empty','ORIGINAL_EMPTY', data => { data.originals.examples=[]; });
  testOriginal('skill-original-missing-examples','SCHEMA_ARRAY', data => { delete data.originals.examples; });
  testOriginal('skill-original-examples-not-array','SCHEMA_ARRAY', data => { data.originals.examples={}; });
  testOriginal('skill-original-null-entry','ORIGINAL_FIELDS', data => { data.originals.examples=[null]; });
  testOriginal('skill-original-missing-id','ID_MISSING', data => { delete data.originals.examples[0].id; });
  testOriginal('skill-original-duplicate-id','ID_DUPLICATE', data => { data.originals.examples.push(structuredClone(data.originals.examples[0])); });
  testOriginal('skill-original-source-id-collision','ORIGINAL_ID', data => { data.originals.examples[0].id='sample-1'; });
  testOriginal('skill-original-generated-id-collision','ORIGINAL_ID', data => { addReinterpretation(data);data.originals.examples[0].id='sample-1'; });
  testOriginal('skill-original-blocked-id-collision','ORIGINAL_ID', data => { addReinterpretation(data);addBlocker(data);data.originals.examples[0].id='sample-2'; });
  testOriginal('skill-original-wrong-kind','ORIGINAL_KIND', data => { data.originals.examples[0].kind='ai_reinterpretation'; });
  for(const key of ['title','brief','method','tool','prompt']) testOriginal(`skill-original-empty-${key}`,'ORIGINAL_FIELDS', data => { data.originals.examples[0][key]=' '; });
  testOriginal('skill-original-missing-dimensions','ORIGINAL_FIELDS', data => { delete data.originals.examples[0].width; });
  testOriginal('skill-original-invalid-dimensions','ORIGINAL_FIELDS', data => { data.originals.examples[0].height=0; });
  testOriginal('skill-original-missing-inputs','ORIGINAL_INPUTS', data => { delete data.originals.examples[0].input_files; });
  testOriginal('skill-original-nonarray-inputs','ORIGINAL_INPUTS', data => { data.originals.examples[0].input_files={}; });
  testOriginal('skill-original-reference-input-forbidden','ORIGINAL_INPUTS', data => { data.originals.examples[0].input_files=['preview.png']; });
  for(const key of ['source_sample_id','asset_id','supporting_asset_ids','designer','author','page_url','asset_url','product_page_url','sources_file','source','original_file','preview_file','enhancement','ai_enhanced','reference_files','image_reference_mode']) {
    testOriginal(`skill-original-forbidden-${key}`,'ORIGINAL_SOURCE_FIELDS', data => { data.originals.examples[0][key]='Synthetic source claim'; });
  }
  testOriginal('skill-original-manifest-source-claim','ORIGINAL_SOURCE_FIELDS', data => { data.originals.source_collection='Synthetic third-party attribution'; });
  testOriginal('skill-original-nested-source-claim','ORIGINAL_SOURCE_FIELDS', data => { data.originals.examples[0].provenance={page_url:'https://example.com/claimed-source'}; });
  testOriginal('skill-original-nested-array-source-claim','ORIGINAL_SOURCE_FIELDS', data => { data.originals.examples[0].provenance=[{credits:[{designer:'Claimed third-party designer'}]}]; });
  testOriginal('skill-original-source-terms-in-prose-allowed','PASS', data => { data.originals.examples[0].review.notes='This fixture has no page_url, designer or source_sample_id attribution.'; });
  testOriginal('skill-original-missing-review','ORIGINAL_REVIEW', data => { delete data.originals.examples[0].review; });
  testOriginal('skill-original-unreviewed','ORIGINAL_REVIEW', data => { data.originals.examples[0].review.status='not_run'; });
  for(const key of ['scope','notes']) testOriginal(`skill-original-empty-review-${key}`,'ORIGINAL_REVIEW', data => { data.originals.examples[0].review[key]=' '; });
  for(const file of ['original.png','preview.png']) testOriginal(`skill-original-reuses-${file}`,'ORIGINAL_OUTPUT_PROVENANCE', data => { data.originals.examples[0].output_file=file; });
  testOriginal('skill-original-reuses-enhancement','ORIGINAL_OUTPUT_PROVENANCE', data => { addEnhancement(data);data.originals.examples[0].output_file='enhanced.png'; });
  testOriginal('skill-original-reuses-detail','ORIGINAL_OUTPUT_PROVENANCE', data => {
    const hash=originalFile(data.pack,'detail.png','#888888');
    Object.assign(data.source.samples[0],{detail_file:'detail.png',detail_width:32,detail_height:32,detail_sha256:hash});
    data.originals.examples[0].output_file='detail.png';
  });
  testOriginal('skill-original-reuses-generated','ORIGINAL_OUTPUT_PROVENANCE', data => { addReinterpretation(data);data.originals.examples[0].output_file='reinterpretation.png'; });
  testOriginal('skill-original-symlink-to-source','ORIGINAL_OUTPUT_PROVENANCE', data => { fs.symlinkSync('preview.png',path.join(data.pack,'alias.png'));data.originals.examples[0].output_file='alias.png'; });
  testOriginal('skill-original-hardlink-to-source','ORIGINAL_OUTPUT_PROVENANCE', data => { fs.linkSync(path.join(data.pack,'preview.png'),path.join(data.pack,'alias.png'));data.originals.examples[0].output_file='alias.png'; });
  testOriginal('skill-original-copied-source-bytes','ORIGINAL_OUTPUT_PROVENANCE', data => { fs.copyFileSync(path.join(data.pack,'preview.png'),path.join(data.pack,'copied.png'));data.originals.examples[0].output_file='copied.png'; });
  testOriginal('skill-original-copied-generated-bytes','ORIGINAL_OUTPUT_PROVENANCE', data => {
    addReinterpretation(data);const hash=originalFile(data.pack,'reinterpretation.png','#445566');data.generated.examples[0].sha256=hash;data.overview.members[0].sha256=hash;
    fs.copyFileSync(path.join(data.pack,'reinterpretation.png'),path.join(data.pack,'copied.png'));data.originals.examples[0].output_file='copied.png';
  });
  testOriginal('skill-original-output-reused','ORIGINAL_OUTPUT_PROVENANCE', data => { data.originals.examples.push({...data.originals.examples[0],id:'original-2'}); });
  for(const mode of ['symlink','hardlink','copy']) testOriginal(`skill-original-${mode}-of-another-original`,'ORIGINAL_OUTPUT_PROVENANCE', data => {
    const source=path.join(data.pack,'original-study.png'),target=path.join(data.pack,'second-study.png');
    if(mode==='symlink')fs.symlinkSync('original-study.png',target);else if(mode==='hardlink')fs.linkSync(source,target);else fs.copyFileSync(source,target);
    data.originals.examples.push({...data.originals.examples[0],id:'original-2',output_file:'second-study.png'});
  });
  testOriginal('skill-original-output-missing','FILE_MISSING', data => { data.originals.examples[0].output_file='missing.png'; });
  testOriginal('skill-original-output-escape','PATH_ESCAPE', data => { data.originals.examples[0].output_file='../OVERVIEW.png'; });
  testOriginal('skill-original-output-symlink-escape','PATH_ESCAPE', data => { fs.symlinkSync('../OVERVIEW.png',path.join(data.pack,'escape.png'));data.originals.examples[0].output_file='escape.png'; });
  testOriginal('skill-original-output-invalid-sha','HASH_INVALID', data => { data.originals.examples[0].sha256=''; });
  testOriginal('skill-original-output-wrong-sha','HASH_MISMATCH', data => { data.originals.examples[0].sha256='0'.repeat(64); });
  testOriginal('skill-original-output-wrong-dimensions','DIMENSION_MISMATCH', data => { data.originals.examples[0].width=33; });
  testOriginal('skill-original-overview-wrong-manifest','OVERVIEW_ORIGINAL', data => { data.overview.members[0].originals_file='fixture/generated.json'; });
  testOriginal('skill-original-overview-missing-manifest','OVERVIEW_ORIGINAL', data => { delete data.overview.members[0].originals_file; });
  testOriginal('skill-original-overview-wrong-example','OVERVIEW_EXAMPLE', data => { data.overview.members[0].example_id='sample-1'; });
  testOriginal('skill-original-overview-wrong-file','OVERVIEW_DISPLAY', data => { data.overview.members[0].file='fixture/preview.png'; });
  testOriginal('skill-original-overview-wrong-hash','OVERVIEW_DISPLAY', data => { data.overview.members[0].sha256='0'.repeat(64); });
  for(const key of ['generated_file','sources_file','source_sample_id','sample_id','ai_enhanced']) testOriginal(`skill-original-overview-forbidden-${key}`,'OVERVIEW_KIND', data => { data.overview.members[0][key]='Mixed provenance'; });
  testOriginal('skill-original-overview-nested-source-claim','OVERVIEW_KIND', data => { data.overview.members[0].provenance={credits:[{designer:'Claimed third-party designer'}]}; });
  testGenerated('skill-generated-overview-forbids-original-manifest','OVERVIEW_KIND', data => { data.overview.members[0].originals_file='fixture/originals.json'; });
  for(const key of ['source_sample_id','asset_id','designer','page_url']) testGenerated(`skill-generated-overview-forbidden-${key}`,'OVERVIEW_KIND', data => { data.overview.members[0][key]='Mixed provenance'; });
  testGenerated('skill-generated-overview-nested-source-claim','OVERVIEW_KIND', data => { data.overview.members[0].provenance={page_url:'https://example.com/claimed-source'}; });
  testOriginal('skill-original-overview-in-v1','OVERVIEW_KIND', data => { data.overview.schema_version=1; });
  testSkill('skill-source-overview-forbids-original-manifest','OVERVIEW_KIND', data => { data.overview.members[0].originals_file='fixture/originals.json'; });
  const addSecondOriginalPack = (data, color = '#4269a8') => {
    const pack=path.join(data.styles,'other');fs.mkdirSync(pack);
    for(const file of ['original.png','preview.png','EXAMPLES.md','PROMPTS.md'])fs.copyFileSync(path.join(data.pack,file),path.join(pack,file));
    write(pack,'STYLE.md','---\nid: other\nname: Other Fixture\nversion: 1\nstatus: provisional\n---\n# Other fixture\n');
    fs.appendFileSync(path.join(data.styles,'INDEX.md'),'[Other style](other/STYLE.md) [Other examples](other/EXAMPLES.md)\n');
    write(pack,'sources.json',{...structuredClone(data.source),style_id:'other'});
    const hash=originalFile(pack,'original-study.png',color);
    const originals={...structuredClone(data.originals),style_id:'other'};originals.examples[0].sha256=hash;
    write(pack,'originals.json',originals);
    data.overview.members.push({style_id:'other',kind:'original_study',originals_file:'other/originals.json',example_id:originals.examples[0].id,file:'other/original-study.png',sha256:hash});
    return {pack,originals};
  };
  testOriginal('skill-original-id-namespaces-per-style','PASS', data => { addSecondOriginalPack(data); }, report => report.counts.original_examples===2 && report.counts.display_examples===2);
  testOriginal('skill-original-copy-across-styles','ORIGINAL_OUTPUT_PROVENANCE', data => { addSecondOriginalPack(data,'#a87742'); });
  testOriginal('skill-original-hardlink-across-styles','ORIGINAL_OUTPUT_PROVENANCE', data => {
    const {pack}=addSecondOriginalPack(data);fs.unlinkSync(path.join(pack,'original-study.png'));fs.linkSync(path.join(data.pack,'original-study.png'),path.join(pack,'original-study.png'));
  });
  testOriginal('skill-original-overview-cross-style-manifest','OVERVIEW_ORIGINAL', data => { addSecondOriginalPack(data);data.overview.members[1].originals_file='fixture/originals.json'; });

  function applicationFixture(_, dir) {
    const base = path.join(dir, 'libraries/applications');
    write(base, 'INDEX.md', '# Application fixture\n');
    write(base, 'contract.md', '# Fixture contract\n');
    write(base, 'render.mjs', '// Fixture: static checker does not run this file.\n');
    write(base, 'card.html', '<!doctype html><html lang="{{LANG}}"><head><title>{{BRAND_NAME}}</title><link rel="stylesheet" href="brand.css"></head><body class="{{THEME}}" data-width="{{WIDTH}}" data-height="{{HEIGHT}}" style="{{LAYOUT_STYLE}}"><img src="{{LOGO_SRC}}" alt="{{BRAND_NAME}}"><h1>{{TITLE}}</h1></body></html>');
    write(base, 'templates.json', {schema_version:1,templates:[{id:'card',width:1200,height:630,file:'card.html'}]});
    return base;
  }
  testSkill('application-index-valid','PASS', applicationFixture);
  testSkill('application-missing-template','FILE_MISSING', (data,dir) => { const base=applicationFixture(data,dir); fs.unlinkSync(path.join(base,'card.html')); });
  testSkill('application-unknown-slot','APPLICATION_MARKERS', (data,dir) => { const base=applicationFixture(data,dir); fs.appendFileSync(path.join(base,'card.html'),'{{UNKNOWN}}'); });
  testSkill('application-required-slot-missing','APPLICATION_MARKERS', (data,dir) => { const base=applicationFixture(data,dir), file=path.join(base,'card.html'); fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('{{TITLE}}','Fixed content')); });
  testSkill('application-missing-css','APPLICATION_CSS', (data,dir) => { const base=applicationFixture(data,dir), file=path.join(base,'card.html'); fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('href="brand.css"','href="unmapped.css"')); });
  testSkill('application-bad-dimensions','APPLICATION_DIMENSIONS', (data,dir) => { const base=applicationFixture(data,dir); write(base,'templates.json',{schema_version:1,templates:[{id:'card',width:0,height:630,file:'card.html'}]}); });
  testSkill('application-duplicate-id','ID_DUPLICATE', (data,dir) => { const base=applicationFixture(data,dir), t={id:'card',width:1200,height:630,file:'card.html'}; write(base,'templates.json',{schema_version:1,templates:[t,t]}); });
  testSkill('application-layout-slot-missing','APPLICATION_MARKERS', (data,dir) => { const base=applicationFixture(data,dir), file=path.join(base,'card.html'); fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('{{LAYOUT_STYLE}}','')); });
  testSkill('application-template-path-escape','PATH_ESCAPE', (data,dir) => { const base=applicationFixture(data,dir); write(dir,'outside.html',fs.readFileSync(path.join(base,'card.html'),'utf8')); write(base,'templates.json',{schema_version:1,templates:[{id:'card',width:1200,height:630,file:'../../outside.html'}]}); });
  function vendorFixture(_, dir) {
    const base = path.join(dir, 'vendor/upstream');
    write(base, 'scripts/tool.py', 'print("fixture")\n');
    write(base, 'SOURCE.json', { upstream: 'https://example.com/upstream', commit: 'a'.repeat(40), files: [{ path: 'scripts/tool.py', sha256: sha256(path.join(base, 'scripts/tool.py')) }] });
    return base;
  }
  testSkill('vendor-valid','PASS', vendorFixture);
  testSkill('vendor-edited-in-place','HASH_MISMATCH', (data,dir) => { const base=vendorFixture(data,dir); fs.appendFileSync(path.join(base,'scripts/tool.py'),'# local edit\n'); });
  testSkill('vendor-unlisted-file','VENDOR_UNLISTED', (data,dir) => { const base=vendorFixture(data,dir); write(base,'scripts/extra.py','print(1)\n'); });
  testSkill('vendor-missing-commit','VENDOR_SOURCE', (data,dir) => { const base=vendorFixture(data,dir), j=JSON.parse(fs.readFileSync(path.join(base,'SOURCE.json'),'utf8')); delete j.commit; write(base,'SOURCE.json',j); });
  const homePath = ['', 'Users', 'someone', 'skill', 'specimen.html'].join('/');
  testSkill('skill-local-file-url','LOCAL_PATH', (_,dir) => write(dir,'libraries/fonts/browser-verification.json',{ url:`file://${homePath}` }));
  testSkill('skill-local-bare-path','LOCAL_PATH', (_,dir) => write(dir,'references/notes.md',`# Notes\nOpen ${homePath} in Edge.\n`));
  testSkill('skill-local-path-in-binary-skipped','PASS', (_,dir) => write(dir,'libraries/styles/fixture/metadata.bin',Buffer.concat([Buffer.from([0,1,2]),Buffer.from(homePath)])));

  const example = path.join(here, '..', 'vendor', 'theme-extract', 'references', 'profile2-example');
  const generator = path.join(here, '..', 'vendor', 'theme-extract', 'scripts', 'build_tokens.py');
  const generate = dir => run('uv', ['run','--quiet','python',generator,dir,'--emit','all'], { timeout: 120000 });
  const editTokens = (dir, fn) => { const file=path.join(dir,'tokens.json'), j=JSON.parse(fs.readFileSync(file,'utf8')); fn(j); write(dir,'tokens.json',j); };
  // The example keeps the specimen spec's reference opacities (hover 0.08, pressed 0.10), which fail
  // STATE_DISTINCT; token fixtures start from a copy whose hover/pressed pass every gate in both modes.
  const seed = dir => { fs.cpSync(example, dir, { recursive: true }); editTokens(dir, j => { j.primitive.opacity.hover.$value = 0.04; j.primitive.opacity.pressed.$value = 0.11; }); };
  function testTokens(name, expected, mutate = () => {}, lint) {
    const dir = path.join(temp, name);
    seed(dir);
    generate(dir);
    const extra = mutate(dir) || [];
    const { exit_code, report } = invoke('check-tokens.mjs', [dir, ...(lint ? ['--lint', ...extra] : [])]);
    const codes = report.errors.map(error => error.code);
    results.push({ case:name, expected, actual:report.result, detected_codes:codes, pass: expected === 'PASS' ? exit_code === 0 && report.result === 'PASS' : exit_code === 1 && codes.includes(expected) });
  }
  testTokens('tokens-full-example','PASS');
  testTokens('tokens-hand-edited-css','GENERATED_STALE', dir => fs.appendFileSync(path.join(dir,'tokens.css'),'.x{color:red}\n'));
  testTokens('tokens-dark-snapshot-missing','GENERATED_MISSING', dir => fs.unlinkSync(path.join(dir,'tokens.resolved.dark.json')));
  testTokens('tokens-design-frontmatter-edited','GENERATED_STALE', dir => { const f=path.join(dir,'DESIGN.md'); fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/primary: "#[0-9A-F]+"/,'primary: "#000000"')); });
  testTokens('tokens-category-undeclared','GENERATOR_FAILED', dir => editTokens(dir, j => delete j.meta.categories.motion));
  testTokens('tokens-contrast-below-threshold','CONTRAST_FAIL', dir => { editTokens(dir, j => { j.semantic.color.text.tertiary.$value='{primitive.color.neutral.300}'; }); generate(dir); });
  testTokens('tokens-leftover-snapshot','GENERATED_UNEXPECTED', dir => fs.copyFileSync(path.join(dir,'tokens.resolved.dark.json'),path.join(dir,'tokens.resolved.sepia.json')));
  testTokens('tokens-contrast-rounding-band','CONTRAST_FAIL', dir => { editTokens(dir, j => { j.primitive.color.neutral['550']={$value:'#6C6D72'}; j.semantic.color.text.tertiary.$value='{primitive.color.neutral.550}'; }); generate(dir); });
  testTokens('tokens-roles-missing','ROLES_MISSING', dir => { editTokens(dir, j => { delete j.meta.roles; delete j.meta.categories; }); generate(dir); });
  testTokens('tokens-state-overlay-contrast','CONTRAST_FAIL', dir => { editTokens(dir, j => { j.primitive.opacity.pressed.$value = 0.3; }); generate(dir); });
  {
    const dir = path.join(temp, 'tokens-dataviz-series-both-modes');
    seed(dir);
    generate(dir);
    const { exit_code, report } = invoke('check-tokens.mjs', [dir]);
    const seriesPairs = Object.values(report.contrast?.modes || {}).map(m => m.pairs.filter(p => p.fg.startsWith('dataViz.series.')));
    const pass = exit_code === 0 && seriesPairs.length === 2 && seriesPairs.every(pairs => pairs.length === 24 && pairs.every(p => p.threshold === 3 && p.pass));
    results.push({ case:'tokens-dataviz-series-both-modes', expected:'PASS with 6 series x 4 surfaces at 3:1 in light and dark', actual:report.result, detected_codes:report.errors.map(error => error.code), pass });
  }
  testTokens('tokens-dataviz-light-low-contrast','DATAVIZ_CONTRAST', dir => { editTokens(dir, j => { j.primitive.color.dataViz.series['6'].$value = '#8FD3DC'; }); generate(dir); });
  {
    const dir = path.join(temp, 'tokens-dataviz-dark-low-contrast');
    seed(dir);
    editTokens(dir, j => { j.primitive.color.dataVizDark.series['2'].$value = '#5A3558'; });
    generate(dir);
    const { exit_code, report } = invoke('check-tokens.mjs', [dir]);
    const messages = report.errors.filter(error => error.code === 'DATAVIZ_CONTRAST').map(error => error.message);
    const pass = exit_code === 1 && messages.length > 0 && messages.every(m => m.startsWith('dark: dataViz.series.2 on '));
    results.push({ case:'tokens-dataviz-dark-low-contrast', expected:'DATAVIZ_CONTRAST only in dark mode', actual:report.result, detected_codes:report.errors.map(error => error.code), pass });
  }
  {
    const dir = path.join(temp, 'tokens-dataviz-distinct-both-modes');
    seed(dir);
    generate(dir);
    const { exit_code, report } = invoke('check-tokens.mjs', [dir]);
    const modes = report.dataviz_distinct || {};
    const pass = exit_code === 0 && modes.light?.band === 'light' && modes.dark?.band === 'dark'
      && ['light', 'dark'].every(m => modes[m].series === 6 && modes[m].worst_adjacent_cvd >= 8 && modes[m].worst_adjacent_normal >= 15 && modes[m].nearest_feedback >= 15)
      && !report.warnings.some(w => w.includes('dataViz'));
    results.push({ case:'tokens-dataviz-distinct-both-modes', expected:'PASS: series distinct in light and dark, no CVD warning', actual:report.result, detected_codes:report.errors.map(error => error.code), pass });
  }
  function testDistinct(name, mutate, check) {
    const dir = path.join(temp, name);
    seed(dir);
    mutate(dir);
    generate(dir);
    const { exit_code, report } = invoke('check-tokens.mjs', [dir]);
    const messages = report.errors.filter(error => error.code === 'DATAVIZ_DISTINCT').map(error => error.message);
    results.push({ case:name, expected:'DATAVIZ_DISTINCT', actual:report.result, detected_codes:report.errors.map(error => error.code), pass: exit_code === 1 && messages.length > 0 && check(messages) });
  }
  const lightSeries = values => dir => editTokens(dir, j => { for (const [key, hex] of Object.entries(values)) j.primitive.color.dataViz.series[key].$value = hex; });
  // Series from a fixed +60 deg hue rotation of the accent: series 3-5 land on the feedback hues.
  testDistinct('tokens-dataviz-hue-rotation-collides', lightSeries({ 2:'#9D4A9A', 3:'#BD4A3E', 4:'#967501', 5:'#2A9749', 6:'#0D95A6' }),
    m => m.every(x => x.startsWith('light: ')) && m.some(x => x.includes('series.3 / 4 CVD')) && m.some(x => x.includes('normal-vision')) && m.some(x => x.includes('series.3 is') && x.includes('feedback.error')));
  testDistinct('tokens-dataviz-dark-accent-off-band', dir => {
    const darkFile = path.join(dir,'modes','dark.json'), dark = JSON.parse(fs.readFileSync(darkFile,'utf8'));
    dark.semantic.color.dataViz.series['1'].$value = '{primitive.color.brand.accentDark}'; write(dir,'modes/dark.json',dark);
  }, m => m.length === 1 && m[0].startsWith('dark: dataViz.series.1 OKLCH L') && m[0].includes('dark band'));
  testDistinct('tokens-dataviz-near-feedback', lightSeries({ 4:'#B83A30' }), m => m.some(x => x.startsWith('light: dataViz.series.4 is') && x.includes('feedback.error')));
  testDistinct('tokens-dataviz-low-chroma', lightSeries({ 6:'#4F5B6E' }), m => m.some(x => x.startsWith('light: dataViz.series.6 OKLCH C')));
  {
    const dir = path.join(temp, 'tokens-dataviz-cvd-warning-band');
    seed(dir);
    lightSeries({ 6:'#027FBB' })(dir);
    generate(dir);
    const { exit_code, report } = invoke('check-tokens.mjs', [dir]);
    const pass = exit_code === 0 && report.warnings.some(w => w.startsWith('light: dataViz.series.5 / 6 CVD') && w.includes('6-8 band'));
    results.push({ case:'tokens-dataviz-cvd-warning-band', expected:'PASS with a 6-8 CVD warning (secondary encoding required)', actual:report.result, detected_codes:report.errors.map(error => error.code), pass });
  }
  testTokens('tokens-dataviz-marked-missing','DATAVIZ_REQUIRED', dir => { editTokens(dir, j => { j.meta.categories.dataViz = { status:'missing', reason:'not designed yet' }; }); generate(dir); });
  testTokens('tokens-dataviz-series-incomplete','DATAVIZ_REQUIRED', dir => {
    editTokens(dir, j => { delete j.semantic.color.dataViz.series['6']; });
    const darkFile = path.join(dir,'modes','dark.json'), dark = JSON.parse(fs.readFileSync(darkFile,'utf8'));
    delete dark.semantic.color.dataViz.series['6']; write(dir,'modes/dark.json',dark);
    generate(dir);
  });
  testTokens('tokens-dataviz-not-applicable','PASS', dir => {
    editTokens(dir, j => { j.meta.categories.dataViz = { status:'notApplicable', reason:'the user says the product has no charts' }; delete j.semantic.color.dataViz; });
    const darkFile = path.join(dir,'modes','dark.json'), dark = JSON.parse(fs.readFileSync(darkFile,'utf8'));
    delete dark.semantic.color.dataViz; write(dir,'modes/dark.json',dark);
    generate(dir);
  });
  {
    const dir = path.join(temp, 'tokens-minimal-overlay-advisory');
    seed(dir);
    editTokens(dir, j => { delete j.meta.categories; j.primitive.opacity.pressed.$value = 0.3; });
    generate(dir);
    const { exit_code, report } = invoke('check-tokens.mjs', [dir]);
    const messages = report.errors.map(error => error.message);
    const pass = exit_code === 1 && messages.length > 0 && messages.every(m => m.includes('onAccent on accent+pressed')) && report.warnings.some(w => w.includes('advisory') && w.includes('accent on surface.default+pressed'));
    results.push({ case:'tokens-minimal-overlay-advisory', expected:'CONTRAST_FAIL only for onAccent, others advisory', actual:report.result, detected_codes:report.errors.map(error => error.code), pass });
  }
  function testState(name, expected, prepare, check) {
    const dir = path.join(temp, name);
    prepare(dir);
    generate(dir);
    const { exit_code, report } = invoke('check-tokens.mjs', [dir]);
    const messages = report.errors.filter(error => error.code === 'STATE_DISTINCT').map(error => error.message);
    const outcome = expected === 'PASS' ? exit_code === 0 && report.result === 'PASS' : exit_code === 1 && messages.length > 0;
    results.push({ case:name, expected, actual:report.result, detected_codes:report.errors.map(error => error.code), pass: outcome && check(messages, report) });
  }
  // Dark points semantic.state.hover/pressed at its own primitives; light keeps the seeded 0.04 / 0.11.
  const darkState = (hover, pressed) => dir => {
    seed(dir);
    editTokens(dir, j => { j.primitive.opacity.hoverDark = { $value: hover }; j.primitive.opacity.pressedDark = { $value: pressed }; });
    const darkFile = path.join(dir,'modes','dark.json'), dark = JSON.parse(fs.readFileSync(darkFile,'utf8'));
    Object.assign(dark.semantic.state, { hover: { opacity: { $value: '{primitive.opacity.hoverDark}' } }, pressed: { opacity: { $value: '{primitive.opacity.pressedDark}' } } });
    write(dir,'modes/dark.json',dark);
  };
  const stateRows = (report, mode) => report.state_distinct?.[mode] || [];
  testState('tokens-state-per-mode-opacity', 'PASS', darkState(0.08, 0.16), (_, report) =>
    stateRows(report,'light').length === 5 && stateRows(report,'light').every(row => row.hover === 0.04 && row.pressed === 0.11 && row.deltaE00 >= 3)
    && stateRows(report,'dark').length === 5 && stateRows(report,'dark').every(row => row.hover === 0.08 && row.pressed === 0.16 && row.deltaE00 >= 3));
  // The specimen spec's reference opacities: all five state-layer surfaces fail in both modes.
  testState('tokens-state-reference-opacity', 'STATE_DISTINCT', dir => fs.cpSync(example, dir, { recursive: true }),
    messages => messages.length === 10 && ['light', 'dark'].every(mode => messages.some(m => m.startsWith(`${mode}: onAccent state layer on accent:`))));
  testState('tokens-state-dark-only-indistinct', 'STATE_DISTINCT', darkState(0.08, 0.09), messages => messages.every(m => m.startsWith('dark: ')));
  // Minimal depth enforces the primary button only; the other surfaces are advisory warnings.
  testState('tokens-state-minimal-advisory', 'STATE_DISTINCT', dir => { fs.cpSync(example, dir, { recursive: true }); editTokens(dir, j => { delete j.meta.categories; }); },
    (messages, report) => messages.length === 2 && messages.every(m => m.includes('onAccent state layer on accent:'))
      && report.warnings.some(w => w.startsWith('advisory (minimal depth): light: text.primary state layer on surface.default')));
  testTokens('tokens-lint-vendor-prefix','NOT_USED', dir => [write(dir,'prefixed.css','.glass{-webkit-backdrop-filter:blur(12px)}\n')], true);
  testTokens('tokens-lint-custom-property','NOT_USED', dir => [write(dir,'custom.css',':root{--hero-bg-2:linear-gradient(90deg,#fff,#000)}\n')], true);
  testTokens('tokens-lint-nested-rule','NOT_USED', dir => [write(dir,'nested.css','.card{background:RADIAL-GRADIENT(#fff,#000);&:hover{color:red}}\n')], true);
  testTokens('tokens-lint-single-quoted-style','NOT_USED', dir => [write(dir,'quoted.html',"<!doctype html><p style='text-shadow:0 0 2px red'>x</p>\n")], true);
  testTokens('tokens-lint-selector-not-declaration','PASS', dir => [write(dir,'selector.css','a:hover{color:var(--semantic-color-text-primary)}\n.text-shadow-free{color:red}\n')], true);
  testTokens('tokens-lint-clean','PASS', dir => [write(dir,'ok.css','.card{box-shadow:var(--semantic-elevation-raised);color:var(--semantic-color-text-primary)}\n')], true);
  testTokens('tokens-lint-not-used','NOT_USED', dir => [write(dir,'bad.html','<!doctype html><style>.hero{background:linear-gradient(90deg,#fff,#000)}</style><p style="text-shadow:0 0 4px red">x</p>\n')], true);
  function testBrandJson(name, expected, mutateMap = () => {}, after, mutateDir = () => {}) {
    const dir = path.join(temp, name);
    fs.cpSync(example, dir, { recursive: true });
    generate(dir);
    mutateDir(dir);
    const map = { id:'sample', name:'Sample', language:'en', type:{ heading:'semantic.typographyDisplay.headline', body:'semantic.typographyDisplay.subhead', label:'semantic.typographyDisplay.eyebrow', file:'fonts/brand.ttf', license:'fonts/OFL.txt', weight_min:300, weight_max:700, kerning:'normal', ligatures:'normal' }, assets:{ logo_on_paper:'logo.svg' } };
    mutateMap(map);
    const mapFile = write(dir, 'map.json', map);
    const { exit_code, report } = invoke('tokens-to-brand-json.mjs', [dir, mapFile]);
    const codes = report.errors.map(error => error.code);
    let pass = expected === 'PASS' ? exit_code === 0 && report.result === 'PASS' : exit_code === 1 && codes.includes(expected);
    if (pass && after) pass = after(JSON.parse(fs.readFileSync(path.join(dir,'brand.json'),'utf8')));
    results.push({ case:name, expected, actual:report.result, detected_codes:codes, pass });
  }
  testBrandJson('brand-json-from-tokens','PASS', undefined, b => b.colors.paper === '#F7F7F8' && b.colors.brand === '#3E5BD8' && b.type.family === 'Space Grotesk' && b.type.heading_weight === 600 && b.type.heading_tracking_em === -0.0125 && b.generated_from.colors.paper === 'semantic.color.surface.background');
  testBrandJson('brand-json-dark-mode','PASS', m => { m.mode = 'dark'; }, b => b.colors.paper === '#18181B' && b.generated_from.mode === 'dark');
  testBrandJson('brand-json-chinese-override','PASS', m => { m.language = 'zh-CN'; }, b => b.type.family === 'Noto Sans SC' && b.type.heading_tracking_em === 0 && b.generated_from.language_override === 'zh');
  testBrandJson('brand-json-ignores-stale-snapshot','PASS', undefined, b => b.colors.brand === '#123456', dir => { const f=path.join(dir,'tokens.json'), j=JSON.parse(fs.readFileSync(f,'utf8')); j.primitive.color.brand.accent.$value='#123456'; write(dir,'tokens.json',j); });
  testBrandJson('brand-json-unknown-mode','BRAND_JSON_MODE', m => { m.mode = 'sepia'; });
  testBrandJson('brand-json-mixed-family','BRAND_JSON_FAMILY', m => { m.type.label = 'semantic.typography.code'; });
  testBrandJson('brand-json-unmapped-role','BRAND_JSON_ROLE', m => { m.colors = { rule: 'elevation.sunken' }; });
  testBrandJson('brand-json-non-color-role','BRAND_JSON_COLOR', m => { m.colors = { rule: 'elevation.raised' }; });
  const badFont=write(temp,'bad.ttf','not a font');
  let fontCode; try {fontSignature(badFont,'ttf');}catch(error){fontCode=error.code;}
  results.push({case:'font-invalid-signature',expected:'FONT_SIGNATURE',actual:fontCode,pass:fontCode==='FONT_SIGNATURE'});
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
const report = { schema_version:1, generated_at:new Date().toISOString(), scope:'Mechanical validator self-tests; synthetic fixtures, not Agent behavior or visual design validation.', node_version:process.version, validator_sha256:Object.fromEntries(['check-skill.mjs','check-tokens.mjs','tokens-to-brand-json.mjs','validate-release.mjs','lib/validation.mjs','lib/tokens.mjs','self-test.mjs'].map(file=>[file,sha256(path.join(here,file))])), result:results.every(test=>test.pass)?'PASS':'FAIL', total:results.length, passed:results.filter(test=>test.pass).length, cases:results, fixture_cleanup:'complete' };
const output = JSON.stringify(report,null,2)+'\n';
if(args[0]==='--output') { const destination=path.resolve(args[1]);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,output); }
process.stdout.write(output);
process.exitCode=report.result==='PASS'?0:1;
