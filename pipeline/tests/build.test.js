'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const ENGINE = path.join(ROOT, '..', 'engine', 'engine.js');
const SCRIPT = path.join(ROOT, '..', 'scripts', 'inline.js'); // the shared inliner at the repo root
const SHARED = path.join(ROOT, '..', 'shared');
const engineText = fs.readFileSync(ENGINE, 'utf8');
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'pipebuild-'));
const r = cp.spawnSync(process.execPath, [SCRIPT, ROOT, '--out', OUT], { cwd: ROOT, encoding: 'utf8' });

test('build succeeds', () => {
  assert.strictEqual(r.status, 0, (r.stdout || '') + (r.stderr || ''));
});

test('pipeline-single.html has the engine and shared files exactly once, no external refs', () => {
  const html = fs.readFileSync(path.join(OUT, 'pipeline-single.html'), 'utf8');
  assert.strictEqual(html.split(engineText).length - 1, 1);
  ['escape.js', 'format.js', 'vendor.js'].forEach(function (n) {
    const t = fs.readFileSync(path.join(SHARED, n), 'utf8');
    assert.strictEqual(html.split(t).length - 1, 1, n);
  });
  assert.ok(!/<script\s+src/i.test(html));
  assert.ok(!/<link/i.test(html));
  assert.ok(!/data-inline/.test(html));
  assert.ok(/<style>[\s\S]*<\/style>/.test(html));
});

test('pages form has engine and shared files byte-for-byte and relative refs', () => {
  const pages = path.join(OUT, 'pages');
  assert.ok(fs.readFileSync(path.join(pages, 'engine.js')).equals(fs.readFileSync(ENGINE)));
  fs.readdirSync(SHARED).filter(function (n) { return /\.js$/.test(n); }).forEach(function (n) {
    assert.ok(fs.readFileSync(path.join(pages, 'shared', n)).equals(fs.readFileSync(path.join(SHARED, n))), n);
  });
  const idx = fs.readFileSync(path.join(pages, 'index.html'), 'utf8');
  assert.ok(idx.indexOf('src="src/main.js"') >= 0);
  assert.ok(!/data-inline/.test(idx));
});

// Runs every inline <script> of a built page in a vm with a tiny DOM; returns the rendered header region.
function runPage(htmlText) {
  const regions = {};
  const metaRe = /<meta[^>]*name="hq-base"[^>]*content="([^"]*)"[^>]*>/i;
  const document = {
    activeElement: null,
    getElementById: function (id) { return regions[id] || (regions[id] = { id: id, innerHTML: '', textContent: '' }); },
    querySelector: function (s) {
      if (s.indexOf('meta') !== 0) return null;
      const m = metaRe.exec(htmlText);
      return m ? { getAttribute: function (k) { return k === 'content' ? m[1] : null; } } : null;
    },
    querySelectorAll: function () { return []; },
    addEventListener: function () {}
  };
  const ctx = vm.createContext({ document, location: { search: '', hash: '' }, window: {}, console });
  htmlText.replace(/<script>([\s\S]*?)<\/script>/g, function (m, code) { vm.runInContext(code, ctx); return m; });
  const out = {};
  Object.keys(regions).forEach(function (k) { out[k] = regions[k].innerHTML; });
  return out;
}
const headerOf = function (htmlText) { return runPage(htmlText)['region-header']; };
function inlinePages(dir) {
  const idx = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  return idx.replace(/<script\s+src="([^"]+)"><\/script>/g, function (m, src) {
    return '<script>' + fs.readFileSync(path.join(dir, src), 'utf8') + '</script>';
  });
}

test('single file has no hq-base meta; pages index.html has it', () => {
  const single = fs.readFileSync(path.join(OUT, 'pipeline-single.html'), 'utf8');
  const pages = fs.readFileSync(path.join(OUT, 'pages', 'index.html'), 'utf8');
  assert.ok(!/<meta[^>]*hq-base/i.test(single), 'no hq-base meta tag (main.js still names it in its lookup)');
  assert.ok(/<meta name="hq-base" content="\.\.\/hq\/">/.test(pages));
  assert.ok(single.indexOf('<meta charset="utf-8">') >= 0 && single.indexOf('name="viewport"') >= 0, 'other metas kept');
});

test('running the single file gives no HQ link; the pages form gives the relative link', () => {
  const single = fs.readFileSync(path.join(OUT, 'pipeline-single.html'), 'utf8');
  const header = headerOf(single);
  assert.ok(header.indexOf('Pipeline: Under the Hood') >= 0);
  assert.ok(header.indexOf('Open this state in HQ') < 0);
  assert.ok(!/class="hq-link"/.test(header));
  // The pages form loads scripts by src; inline them here in index.html order to run it.
  const pages = path.join(OUT, 'pages');
  let idx = fs.readFileSync(path.join(pages, 'index.html'), 'utf8');
  idx = idx.replace(/<script\s+src="([^"]+)"><\/script>/g, function (m, src) {
    return '<script>' + fs.readFileSync(path.join(pages, src), 'utf8') + '</script>';
  });
  const pagesHeader = headerOf(idx);
  assert.ok(/<a class="hq-link" href="\.\.\/hq\/\?scenario=healthy&amp;step=1">Open this state in HQ<\/a>/.test(pagesHeader), pagesHeader);
});

test('single file and pages form render identical regions (stages, landing, matrix and the rest)', () => {
  const a = runPage(fs.readFileSync(path.join(OUT, 'pipeline-single.html'), 'utf8'));
  const b = runPage(inlinePages(path.join(OUT, 'pages')));
  ['region-batches', 'region-generation', 'region-landing', 'region-matrix', 'region-footer'].forEach(function (k) {
    assert.ok(typeof a[k] === 'string' && a[k].length > 0, k + ' rendered');
    assert.strictEqual(b[k], a[k], k);
  });
  assert.deepStrictEqual(Object.keys(b).sort(), Object.keys(a).sort());
  // The only allowed difference is the HQ link, which the single file does not have.
  const strip = function (h) { return h.replace(/<a class="hq-link"[^>]*>[^<]*<\/a>/, ''); };
  assert.strictEqual(strip(b['region-header']), a['region-header']);
  Object.keys(a).filter(function (k) { return k !== 'region-header'; }).forEach(function (k) { assert.strictEqual(b[k], a[k], k); });
});

test('real pipeline sources, shared files and engine contain no </script or </style in any case', () => {
  const files = [ENGINE]
    .concat(fs.readdirSync(SHARED).filter(function (n) { return /\.js$/.test(n); }).map(function (n) { return path.join(SHARED, n); }))
    .concat(fs.readdirSync(path.join(ROOT, 'src')).map(function (n) { return path.join(ROOT, 'src', n); }));
  files.forEach(function (f) {
    const t = fs.readFileSync(f, 'utf8');
    assert.ok(!/<\/script/i.test(t), f);
    assert.ok(!/<\/style/i.test(t), f);
  });
});

// Fixture: <d>/pipeline/{index.html,src/*}, <d>/shared/* and a copy of the shared script at <d>/scripts/inline.js (so its repo root is <d>), so the real script runs against hostile sources.
function fixture(parts) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pipefix-'));
  const pdir = path.join(d, 'pipeline');
  fs.mkdirSync(path.join(d, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(pdir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(d, 'shared'), { recursive: true });
  fs.copyFileSync(SCRIPT, path.join(d, 'scripts', 'inline.js'));
  fs.writeFileSync(path.join(d, 'engine.js'), parts.engine || 'var e = 1;\n');
  fs.writeFileSync(path.join(d, 'shared', 'escape.js'), parts.shared || 'var s = 1;\n');
  fs.writeFileSync(path.join(pdir, 'src', 'main.js'), parts.main || 'var m = 1;\n');
  fs.writeFileSync(path.join(pdir, 'src', 'styles.css'), parts.css || 'body { color: red; }\n');
  fs.writeFileSync(path.join(pdir, 'index.html'), '<!doctype html><html><head><link rel="stylesheet" href="src/styles.css" data-inline></head><body>' +
    '<script src="engine.js" data-inline></script><script src="shared/escape.js" data-inline></script><script src="src/main.js" data-inline></script></body></html>');
  const res = cp.spawnSync(process.execPath, [path.join(d, 'scripts', 'inline.js'), pdir, '--out', path.join(d, 'out')], {
    cwd: pdir, encoding: 'utf8', env: Object.assign({}, process.env, { ENGINE_PATH: path.join(d, 'engine.js') })
  });
  return { code: res.status, out: (res.stdout || '') + (res.stderr || '') };
}

test('fixture without hostile text builds (control)', () => {
  const f = fixture({});
  assert.strictEqual(f.code, 0, f.out);
});

test('</script in a shared file, a page source or the engine fails the build, naming the file', () => {
  [['shared', 'escape.js'], ['main', 'main.js'], ['engine', 'engine.js']].forEach(function (c) {
    const parts = {};
    parts[c[0]] = 'var a = 1; // </SCRIPT>\n';
    const f = fixture(parts);
    assert.strictEqual(f.code, 1, c[1] + ' ' + f.out);
    assert.ok(f.out.indexOf(c[1]) >= 0 && f.out.indexOf('</script') >= 0, f.out);
  });
});

test('</style in the stylesheet fails the build; so does it in a shared file', () => {
  const f = fixture({ css: 'a {} /* </STYLE> */\n' });
  assert.strictEqual(f.code, 1, f.out);
  assert.ok(f.out.indexOf('styles.css') >= 0 && f.out.indexOf('</style') >= 0, f.out);
  const g = fixture({ shared: 'var a = "</Style>";\n' });
  assert.strictEqual(g.code, 1, g.out);
  assert.ok(g.out.indexOf('escape.js') >= 0 && g.out.indexOf('</style') >= 0, g.out);
});
