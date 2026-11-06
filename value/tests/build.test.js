'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const ENGINE = path.join(ROOT, '..', 'engine', 'engine.js');
const SCRIPT = path.join(ROOT, '..', 'scripts', 'inline.js'); // the shared inliner at the repo root
const SHARED = path.join(ROOT, '..', 'shared');
const engineText = fs.readFileSync(ENGINE, 'utf8');
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'valbuild-'));
const r = cp.spawnSync(process.execPath, [SCRIPT, ROOT, '--out', OUT], { cwd: ROOT, encoding: 'utf8' });

test('build succeeds', () => {
  assert.strictEqual(r.status, 0, (r.stdout || '') + (r.stderr || ''));
});

test('value-single.html has engine and shared files once, no external refs', () => {
  const html = fs.readFileSync(path.join(OUT, 'value-single.html'), 'utf8');
  assert.strictEqual(html.split(engineText).length - 1, 1);
  ['escape.js', 'format.js', 'vendor.js', 'brand.js', 'settings.js'].forEach(function (n) {
    const t = fs.readFileSync(path.join(SHARED, n), 'utf8');
    assert.strictEqual(html.split(t).length - 1, 1, n);
  });
  assert.ok(!/<script\s+src/i.test(html));
  assert.ok(!/<link/i.test(html.replace('<link rel="icon" href="data:,">', '')), 'only the empty icon link is allowed');
  assert.ok(!/data-inline/.test(html));
  assert.ok(!/(?:src|href)\s*=\s*"https?:/i.test(html));
  assert.ok(/<style>[\s\S]*<\/style>/.test(html));
});

test('single file drops both hq-base and pipeline-base metas; pages form keeps them', () => {
  const single = fs.readFileSync(path.join(OUT, 'value-single.html'), 'utf8');
  const pages = fs.readFileSync(path.join(OUT, 'pages', 'index.html'), 'utf8');
  assert.ok(!/<meta[^>]*hq-base/i.test(single));
  assert.ok(!/<meta[^>]*pipeline-base/i.test(single));
  assert.ok(/<meta name="hq-base" content="\.\.\/hq\/">/.test(pages));
  assert.ok(/<meta name="pipeline-base" content="\.\.\/pipeline\/">/.test(pages));
  assert.ok(single.indexOf('<meta charset="utf-8">') >= 0 && single.indexOf('name="viewport"') >= 0);
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

test('value-single.html has the empty icon link, so the browser makes no /favicon.ico request', () => {
  const html = fs.readFileSync(path.join(OUT, 'value-single.html'), 'utf8');
  assert.strictEqual(html.split('<link rel="icon" href="data:,">').length - 1, 1);
  assert.ok(html.indexOf('<link rel="icon" href="data:,">') < html.indexOf('</head>'));
});
