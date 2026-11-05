'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const SCRIPT = path.join(__dirname, 'inline.js');

// Fixture repo: <d>/scripts/inline.js (a copy, so its repo root is <d>), <d>/engine/engine.js, <d>/shared/escape.js,
// and the page folders given in `pages`: { name: { index, files: { 'src/main.js': text } } }.
function repo(pages) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'inlinefix-'));
  fs.mkdirSync(path.join(d, 'scripts'));
  fs.copyFileSync(SCRIPT, path.join(d, 'scripts', 'inline.js'));
  fs.mkdirSync(path.join(d, 'engine'));
  fs.writeFileSync(path.join(d, 'engine', 'engine.js'), 'var engine = 1;\n');
  fs.mkdirSync(path.join(d, 'shared'));
  fs.writeFileSync(path.join(d, 'shared', 'escape.js'), 'var shared = 1;\n');
  Object.keys(pages).forEach(function (name) {
    const p = pages[name];
    fs.mkdirSync(path.join(d, name, 'src'), { recursive: true });
    if (p.index !== null) fs.writeFileSync(path.join(d, name, 'index.html'), p.index);
    Object.keys(p.files || {}).forEach(function (f) { fs.writeFileSync(path.join(d, name, f), p.files[f]); });
  });
  return d;
}
function run(d, args, env) {
  const r = cp.spawnSync(process.execPath, [path.join(d, 'scripts', 'inline.js')].concat(args), {
    cwd: d, encoding: 'utf8', env: Object.assign({}, process.env, env || {})
  });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

const INDEX = '<!doctype html>\n<html><head>\n<meta charset="utf-8">\n' +
  '<meta name="hq-base" content="../hq/">\n<meta name="Pipeline-Base" content="../pipeline/">\n<meta name="brain-base" content="../brain/">\n' +
  '<meta name="viewport" content="width=device-width">\n<meta name="base-url" content="keep">\n' +
  '<link rel="stylesheet" href="src/styles.css" data-inline>\n</head><body>\n' +
  '<script src="engine.js" data-inline></script><script src="shared/escape.js" data-inline></script>' +
  '<script src="src/main.js" data-inline></script>\n</body></html>\n';
const FILES = { 'src/main.js': 'var page = 1;\n', 'src/styles.css': 'body { color: red; }\n' };

test('writes <folder>-single.html and pages/ into <folder>/dist by default', () => {
  const d = repo({ mypage: { index: INDEX, files: FILES } });
  const r = run(d, ['mypage']);
  assert.strictEqual(r.code, 0, r.out);
  assert.ok(fs.existsSync(path.join(d, 'mypage', 'dist', 'mypage-single.html')));
  ['index.html', 'engine.js', 'shared/escape.js', 'src/main.js', 'src/styles.css'].forEach(function (f) {
    assert.ok(fs.existsSync(path.join(d, 'mypage', 'dist', 'pages', f)), f);
  });
});

test('--out is honoured and may come before or after the page folder', () => {
  const d = repo({ mypage: { index: INDEX, files: FILES } });
  assert.strictEqual(run(d, ['mypage', '--out', 'o1']).code, 0);
  assert.strictEqual(run(d, ['--out', 'o2', 'mypage']).code, 0);
  assert.ok(fs.existsSync(path.join(d, 'o1', 'mypage-single.html')));
  assert.ok(fs.existsSync(path.join(d, 'o2', 'mypage-single.html')));
});

test('single file inlines engine, shared and page sources once, with no external refs or data-inline', () => {
  const d = repo({ mypage: { index: INDEX, files: FILES } });
  assert.strictEqual(run(d, ['mypage']).code, 0);
  const html = fs.readFileSync(path.join(d, 'mypage', 'dist', 'mypage-single.html'), 'utf8');
  ['var engine = 1;', 'var shared = 1;', 'var page = 1;', 'body { color: red; }'].forEach(function (t) {
    assert.strictEqual(html.split(t).length - 1, 1, t);
  });
  assert.ok(!/<script\s+src/i.test(html) && !/<link/i.test(html) && !/data-inline/.test(html));
});

test('single file drops every *-base meta (any page name, any case) and keeps the others; pages form keeps all', () => {
  const d = repo({ mypage: { index: INDEX, files: FILES } });
  assert.strictEqual(run(d, ['mypage']).code, 0);
  const single = fs.readFileSync(path.join(d, 'mypage', 'dist', 'mypage-single.html'), 'utf8');
  const pages = fs.readFileSync(path.join(d, 'mypage', 'dist', 'pages', 'index.html'), 'utf8');
  assert.ok(!/-base"/i.test(single.replace('name="base-url"', '')));
  assert.ok(single.indexOf('<meta charset="utf-8">') >= 0 && single.indexOf('name="viewport"') >= 0 && single.indexOf('name="base-url"') >= 0);
  assert.ok(single.indexOf('<meta name="viewport"') > single.indexOf('<meta charset'));
  ['hq-base', 'Pipeline-Base', 'brain-base'].forEach(function (n) { assert.ok(pages.indexOf('name="' + n + '"') >= 0, n); });
});

test('pages form copies engine, shared and sources byte for byte', () => {
  const d = repo({ mypage: { index: INDEX, files: FILES } });
  assert.strictEqual(run(d, ['mypage']).code, 0);
  const pg = path.join(d, 'mypage', 'dist', 'pages');
  assert.ok(fs.readFileSync(path.join(pg, 'engine.js')).equals(fs.readFileSync(path.join(d, 'engine', 'engine.js'))));
  assert.ok(fs.readFileSync(path.join(pg, 'shared', 'escape.js')).equals(fs.readFileSync(path.join(d, 'shared', 'escape.js'))));
  assert.ok(!/data-inline/.test(fs.readFileSync(path.join(pg, 'index.html'), 'utf8')));
});

test('dollar sequences in a source are inlined unchanged', () => {
  const text = 'var s = "$' + "'" + '" + "$&" + "$$" + "$1" + "$`";\n';
  const d = repo({ mypage: { index: INDEX, files: Object.assign({}, FILES, { 'src/main.js': text }) } });
  assert.strictEqual(run(d, ['mypage']).code, 0);
  assert.ok(fs.readFileSync(path.join(d, 'mypage', 'dist', 'mypage-single.html'), 'utf8').indexOf(text) >= 0);
});

test('usage errors: no page, two pages, --out without a value', () => {
  const d = repo({ mypage: { index: INDEX, files: FILES } });
  [[], ['a', 'b'], ['mypage', '--out']].forEach(function (a) {
    const r = run(d, a);
    assert.strictEqual(r.code, 1, a.join(' '));
    assert.ok(/usage|--out/i.test(r.out), r.out);
  });
});

test('a folder without index.html, or that does not exist, fails clearly', () => {
  const d = repo({ empty: { index: null } });
  const a = run(d, ['empty']);
  assert.strictEqual(a.code, 1);
  assert.ok(/index\.html/.test(a.out), a.out);
  const b = run(d, ['nowhere']);
  assert.strictEqual(b.code, 1);
  assert.ok(/index\.html/.test(b.out), b.out);
});

test('a missing source or engine fails naming it; ENGINE_PATH overrides the engine', () => {
  const d = repo({ mypage: { index: INDEX, files: { 'src/styles.css': FILES['src/styles.css'] } } });
  const a = run(d, ['mypage']);
  assert.strictEqual(a.code, 1);
  assert.ok(a.out.indexOf('main.js') >= 0 && /missing/i.test(a.out), a.out);
  const e = repo({ mypage: { index: INDEX, files: FILES } });
  fs.rmSync(path.join(e, 'engine', 'engine.js'));
  const b = run(e, ['mypage']);
  assert.strictEqual(b.code, 1);
  assert.ok(/engine/i.test(b.out) && /missing/i.test(b.out), b.out);
  const alt = path.join(e, 'alt.js');
  fs.writeFileSync(alt, 'var alt = 1;\n');
  assert.strictEqual(run(e, ['mypage'], { ENGINE_PATH: alt }).code, 0);
  assert.ok(fs.readFileSync(path.join(e, 'mypage', 'dist', 'mypage-single.html'), 'utf8').indexOf('var alt = 1;') >= 0);
});

test('</script in a script or </style in a stylesheet fails the build naming the file', () => {
  const s = repo({ mypage: { index: INDEX, files: Object.assign({}, FILES, { 'src/main.js': 'var a; // </SCRIPT>\n' }) } });
  const a = run(s, ['mypage']);
  assert.strictEqual(a.code, 1);
  assert.ok(a.out.indexOf('main.js') >= 0 && a.out.indexOf('</script') >= 0, a.out);
  const c = repo({ mypage: { index: INDEX, files: Object.assign({}, FILES, { 'src/styles.css': 'a {} /* </STYLE> */\n' }) } });
  const b = run(c, ['mypage']);
  assert.strictEqual(b.code, 1);
  assert.ok(b.out.indexOf('styles.css') >= 0 && b.out.indexOf('</style') >= 0, b.out);
});
