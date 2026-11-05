'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const ROOT = path.join(__dirname, '..');

const CALLS = ['fetch(', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'sendBeacon'];
const REMOTE_ATTR = /\b(?:src|href)\s*=\s*["']?\s*https?:\/\//i;
const NONDET = ['Math.random', 'Date.now', 'new Date('];

function scanNetwork(text) {
  const hits = [];
  CALLS.forEach(function (c) { if (text.indexOf(c) >= 0) hits.push(c); });
  if (REMOTE_ATTR.test(text)) hits.push('remote src/href');
  return hits;
}
function scanNondet(text) { return NONDET.filter(function (c) { return text.indexOf(c) >= 0; }); }

test('each scan pattern can fail on a sample', () => {
  CALLS.forEach(function (c) { assert.deepStrictEqual(scanNetwork('x ' + c + ' y'), [c]); });
  assert.deepStrictEqual(scanNetwork('<script src="http://a.b/x.js">'), ['remote src/href']);
  assert.deepStrictEqual(scanNetwork('<link href=\'https://a.b/x.css\'>'), ['remote src/href']);
  assert.deepStrictEqual(scanNetwork('<a href = "HTTPS://a.b/">'), ['remote src/href']);
  NONDET.forEach(function (c) { assert.deepStrictEqual(scanNondet('x ' + c + ' y'), [c]); });
  assert.deepStrictEqual(scanNetwork('<a href="../hq/?scenario=healthy&step=1">src/main.js</a>'), []);
  assert.deepStrictEqual(scanNondet('Date.parse(x)'), []);
});

const srcDir = path.join(ROOT, 'src');
const srcFiles = fs.readdirSync(srcDir).map(function (n) { return path.join(srcDir, n); });
const sharedDir = path.join(ROOT, '..', 'shared');
const sharedFiles = fs.readdirSync(sharedDir).filter(function (n) { return /\.js$/.test(n); }).map(function (n) { return path.join(sharedDir, n); });

test('there are sources and shared scripts to scan', () => {
  assert.ok(srcFiles.length >= 5);
  assert.ok(sharedFiles.length >= 3);
});

test('index.html, src (js and css) and shared files have no network use', () => {
  [path.join(ROOT, 'index.html')].concat(srcFiles, sharedFiles).forEach(function (f) {
    assert.deepStrictEqual(scanNetwork(fs.readFileSync(f, 'utf8')), [], f);
  });
});

test('src and shared js files have no Math.random, Date.now, new Date(', () => {
  srcFiles.concat(sharedFiles).filter(function (f) { return /\.js$/.test(f); }).forEach(function (f) {
    assert.deepStrictEqual(scanNondet(fs.readFileSync(f, 'utf8')), [], f);
  });
});

test('both build outputs (single file and pages form) have no network use', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'pipenonet-'));
  const r = cp.spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'inline.js'), '--out', out], { cwd: ROOT, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  const pages = path.join(out, 'pages');
  const files = [path.join(out, 'pipeline-single.html'), path.join(pages, 'index.html'), path.join(pages, 'engine.js')]
    .concat(fs.readdirSync(path.join(pages, 'src')).map(function (n) { return path.join(pages, 'src', n); }),
      fs.readdirSync(path.join(pages, 'shared')).map(function (n) { return path.join(pages, 'shared', n); }));
  assert.ok(files.length >= 11);
  files.forEach(function (f) {
    assert.deepStrictEqual(scanNetwork(fs.readFileSync(f, 'utf8')), [], f);
  });
  files.filter(function (f) { return /pages[\\/](src|shared)[\\/].*\.js$/.test(f); }).forEach(function (f) {
    assert.deepStrictEqual(scanNondet(fs.readFileSync(f, 'utf8')), [], f);
  });
});
