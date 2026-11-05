'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadHQ } = require('./helpers/load');

const { HQ } = loadHQ();

test('esc escapes markup', () => {
  assert.strictEqual(HQ.escape.esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
});
test('esc escapes single quote', () => {
  assert.strictEqual(HQ.escape.esc("'; DROP TABLE silver_vital_observation;--"), '&#39;; DROP TABLE silver_vital_observation;--');
});
test('esc escapes double quote and ampersand', () => {
  assert.strictEqual(HQ.escape.esc('a"b&c'), 'a&quot;b&amp;c');
});
test('esc null/undefined/0', () => {
  assert.strictEqual(HQ.escape.esc(null), '');
  assert.strictEqual(HQ.escape.esc(undefined), '');
  assert.strictEqual(HQ.escape.esc(0), '0');
});
test('escape.js source has no forbidden APIs', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'escape.js'), 'utf8');
  for (const bad of ['toLocale', 'Intl', 'fetch(']) assert.ok(!src.includes(bad), bad);
});
