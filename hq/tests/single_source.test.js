'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const srcDir = path.join(__dirname, '..', 'src');
const files = fs.readdirSync(srcDir).filter(function (n) { return /\.js$/.test(n); });

// Definitions only, in the exact forms the shared files use. Comments are stripped first.
function stripComments(t) {
  return t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/.*$/gm, '');
}
const DEFS = [
  /function\s+esc\s*\(/, /function\s+plural\s*\(/, /function\s+pct1\s*\(/,
  /(?:const|let|var)\s+esc\s*=\s*function\s*\(\s*value\s*\)/,
  /Batch ingestion/, /Snowpipe \/ Fivetran/, /Unity Catalog metric views/, /Fabric Activator/
];

test('detector can fail: sample definitions are caught, comments are not', () => {
  assert.ok(DEFS[0].test('function esc(v) {}'));
  assert.ok(DEFS[1].test('function plural(n, a, b) {}'));
  assert.ok(DEFS[2].test('function pct1(n) {}'));
  assert.ok(DEFS[4].test("['Batch ingestion', 'x']"));
  assert.ok(!DEFS.some(function (re) { return re.test(stripComments('// function esc(v) {}\n/* function plural(n) */')); }));
});

test('no file under hq/src defines esc, plural, pct1 or the vendor rows', () => {
  assert.ok(files.length > 0);
  files.forEach(function (n) {
    const text = stripComments(fs.readFileSync(path.join(srcDir, n), 'utf8'));
    DEFS.forEach(function (re) { assert.ok(!re.test(text), n + ' matches ' + re); });
  });
  assert.ok(!fs.existsSync(path.join(srcDir, 'escape.js')));
  assert.ok(!fs.existsSync(path.join(srcDir, 'format.js')));
});
