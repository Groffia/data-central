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
  NONDET.forEach(function (c) { assert.deepStrictEqual(scanNondet('x ' + c + ' y'), [c]); });
  assert.deepStrictEqual(scanNetwork('<a href="#x">src/main.js</a>'), []);
  assert.deepStrictEqual(scanNetwork('<a href="../pipeline/?scenario=incident&step=3#dlq-3-4">x</a><meta name="pipeline-base" content="../pipeline/">'), []);
});

const srcDir = path.join(ROOT, 'src');
const srcFiles = fs.readdirSync(srcDir).map(function (n) { return path.join(srcDir, n); });

const sharedDir = path.join(ROOT, '..', 'shared');
const sharedFiles = fs.readdirSync(sharedDir).filter(function (n) { return /\.js$/.test(n); }).map(function (n) { return path.join(sharedDir, n); });

test('shared folder has scripts to scan', () => {
  assert.ok(sharedFiles.length >= 3);
});

test('index.html, src and shared files have no network use', () => {
  [path.join(ROOT, 'index.html')].concat(srcFiles, sharedFiles).forEach(function (f) {
    assert.deepStrictEqual(scanNetwork(fs.readFileSync(f, 'utf8')), [], f);
  });
});

test('src and shared js files have no Math.random, Date.now, new Date(', () => {
  srcFiles.concat(sharedFiles).filter(function (f) { return /\.js$/.test(f); }).forEach(function (f) {
    assert.deepStrictEqual(scanNondet(fs.readFileSync(f, 'utf8')), [], f);
  });
});

test('build outputs have no network use', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'hqnonet-'));
  const r = cp.spawnSync(process.execPath, [path.join(ROOT, '..', 'scripts', 'inline.js'), ROOT, '--out', out], { cwd: ROOT, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  const files = [path.join(out, 'hq-single.html'), path.join(out, 'pages', 'index.html')];
  files.forEach(function (f) {
    assert.deepStrictEqual(scanNetwork(fs.readFileSync(f, 'utf8')), [], f);
  });
});
