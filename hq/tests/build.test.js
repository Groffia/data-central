'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const cp = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const ENGINE = path.join(ROOT, '..', 'engine', 'engine.js');
const SCRIPT = path.join(ROOT, 'scripts', 'inline.js');
const engineText = fs.readFileSync(ENGINE, 'utf8');
const FOOTER = 'All data is synthetic and generated deterministically (seed 42). Company names are fictional.';

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'hqbuild-')); }
function build(out, env) {
  const r = cp.spawnSync(process.execPath, [SCRIPT, '--out', out], {
    cwd: ROOT, encoding: 'utf8', env: Object.assign({}, process.env, env || {})
  });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
function fixtureEngine(text) {
  const d = tmp();
  const f = path.join(d, 'engine.js');
  fs.writeFileSync(f, text);
  return f;
}

const srcDir = path.join(ROOT, 'src');
const srcFiles = fs.readdirSync(srcDir).map(function (n) { return path.join(srcDir, n); });
const sharedDir = path.join(ROOT, '..', 'shared');
const sharedFiles = ['escape.js', 'format.js', 'vendor.js'].map(function (n) { return path.join(sharedDir, n); });

test('real engine and every src file contain no </script in any case', () => {
  [ENGINE].concat(srcFiles, sharedFiles).forEach(function (f) {
    assert.ok(!/<\/script/i.test(fs.readFileSync(f, 'utf8')), f);
  });
});

const OUT = tmp();
const first = build(OUT);

test('build succeeds with the real engine', () => {
  assert.strictEqual(first.code, 0, first.out);
});

test('hq-single.html contains the engine text, footer, and no external refs', () => {
  const html = fs.readFileSync(path.join(OUT, 'hq-single.html'), 'utf8');
  assert.ok(html.indexOf(engineText) >= 0);
  assert.ok(html.indexOf('globalThis.Engine = Engine') >= 0);
  assert.ok(!/<script\s+src/i.test(html));
  assert.ok(!/<link/i.test(html));
  assert.ok(!/\ssrc=/i.test(html));
  assert.ok(!/\shref=(?!"#)/i.test(html));
  assert.ok(!/data-inline/.test(html));
  sharedFiles.forEach(function (f) {
    const t = fs.readFileSync(f, 'utf8');
    assert.strictEqual(html.split(t).length - 1, 1, f + ' appears exactly once');
  });
  assert.ok(/<style>[\s\S]*<\/style>/.test(html));
});

test('pages folder has engine byte-for-byte, src files, relative refs, no data-inline', () => {
  const pages = path.join(OUT, 'pages');
  assert.ok(fs.readFileSync(path.join(pages, 'engine.js')).equals(fs.readFileSync(ENGINE)));
  srcFiles.forEach(function (f) {
    assert.ok(fs.readFileSync(path.join(pages, 'src', path.basename(f))).equals(fs.readFileSync(f)));
  });
  sharedFiles.forEach(function (f) {
    assert.ok(fs.readFileSync(path.join(pages, 'shared', path.basename(f))).equals(fs.readFileSync(f)), f);
  });
  const idx = fs.readFileSync(path.join(pages, 'index.html'), 'utf8');
  assert.ok(idx.indexOf('src="engine.js"') >= 0);
  assert.ok(idx.indexOf('src="shared/escape.js"') >= 0);
  assert.ok(idx.indexOf('src="src/main.js"') >= 0);
  assert.ok(idx.indexOf('href="src/styles.css"') >= 0);
  assert.ok(!/data-inline/.test(idx));
});

function fakeDocRun(scriptTexts) {
  const els = {};
  const document = {
    getElementById: function (id) { return els[id] || (els[id] = { id: id, innerHTML: '', textContent: '' }); },
    activeElement: null,
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    addEventListener: function () {}
  };
  const window = { setTimeout: function () { return 1; }, clearTimeout: function () {} };
  const ctx = vm.createContext({ document, window, location: { search: '' }, performance: { now: function () { return 0; } }, console });
  scriptTexts.forEach(function (t, i) { vm.runInContext(t, ctx, { filename: 'script' + i }); });
  const regions = {};
  Object.keys(els).forEach(function (k) { if (k.indexOf('region-') === 0) regions[k] = els[k].innerHTML; });
  return regions;
}

test('inlined single-file scripts render stages (8 health attrs) and footer; pages form is identical', () => {
  const html = fs.readFileSync(path.join(OUT, 'hq-single.html'), 'utf8');
  const inline = [];
  html.replace(/<script>([\s\S]*?)<\/script>/g, function (m, body) { inline.push(body); return m; });
  assert.strictEqual(inline.length, 9);
  const a = fakeDocRun(inline);
  assert.strictEqual((a['region-stages'].match(/data-health="/g) || []).length, 8);
  assert.ok(a['region-footer'].indexOf(FOOTER) >= 0);

  const pagesDir = path.join(OUT, 'pages');
  const idx = fs.readFileSync(path.join(pagesDir, 'index.html'), 'utf8');
  const srcs = [];
  idx.replace(/<script\s+src="([^"]+)"/g, function (m, s) { srcs.push(s); return m; });
  assert.strictEqual(srcs.length, 9);
  const b = fakeDocRun(srcs.map(function (s) { return fs.readFileSync(path.join(pagesDir, s), 'utf8'); }));
  assert.deepStrictEqual(b, a);
});

test('missing engine: exit 1 with a clear message', () => {
  const r = build(tmp(), { ENGINE_PATH: path.join(tmp(), 'nope.js') });
  assert.strictEqual(r.code, 1);
  assert.ok(/engine/i.test(r.out) && /nope\.js/.test(r.out) && /missing|not found/i.test(r.out), r.out);
});

test('engine containing </SCRIPT> fails naming the file and </script', () => {
  const f = fixtureEngine('var a = 1; // </SCRIPT>\n');
  const r = build(tmp(), { ENGINE_PATH: f });
  assert.strictEqual(r.code, 1);
  assert.ok(r.out.indexOf('engine.js') >= 0 && r.out.indexOf('</script') >= 0, r.out);
});

test('engine with dollar-quote, dollar-amp, double dollar is inlined byte-identically', () => {
  const text = 'var s = "$' + "'" + '" + "$&" + "$$" + "$1" + "$`";\n';
  const f = fixtureEngine(text);
  const out = tmp();
  const r = build(out, { ENGINE_PATH: f });
  assert.strictEqual(r.code, 0, r.out);
  assert.ok(fs.readFileSync(path.join(out, 'hq-single.html'), 'utf8').indexOf(text) >= 0);
  assert.ok(fs.readFileSync(path.join(out, 'pages', 'engine.js'), 'utf8') === text);
});

test('real sources contain no </style in any case', () => {
  const css = fs.readFileSync(path.join(ROOT, 'src', 'styles.css'), 'utf8');
  assert.ok(!/<\/style/i.test(css));
});

test('CSS containing </STYLE> fails the build naming the file and </style', () => {
  const d = tmp();
  fs.mkdirSync(path.join(d, 'src'), { recursive: true });
  fs.writeFileSync(path.join(d, 'src', 'styles.css'), 'body { color: red; } /* </STYLE> */\n');
  fs.writeFileSync(path.join(d, 'index.html'),
    '<!doctype html><html><head><link rel="stylesheet" href="src/styles.css" data-inline></head><body></body></html>');
  // Run a copy of the script rooted in the fixture so the real index.html is untouched.
  fs.mkdirSync(path.join(d, 'scripts'), { recursive: true });
  fs.copyFileSync(SCRIPT, path.join(d, 'scripts', 'inline.js'));
  const r = cp.spawnSync(process.execPath, [path.join(d, 'scripts', 'inline.js'), '--out', path.join(d, 'out')], {
    cwd: d, encoding: 'utf8', env: Object.assign({}, process.env, { ENGINE_PATH: ENGINE })
  });
  const out = (r.stdout || '') + (r.stderr || '');
  assert.strictEqual(r.status, 1, out);
  assert.ok(out.indexOf('styles.css') >= 0 && out.indexOf('</style') >= 0, out);
});
