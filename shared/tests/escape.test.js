'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadShared } = require('./helpers/load');

const { Shared } = loadShared();

test('esc escapes markup', () => {
  assert.strictEqual(Shared.escape.esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
});
test('esc escapes single quote', () => {
  assert.strictEqual(Shared.escape.esc("'; DROP TABLE silver_vital_observation;--"), '&#39;; DROP TABLE silver_vital_observation;--');
});
test('esc escapes double quote and ampersand', () => {
  assert.strictEqual(Shared.escape.esc('a"b&c'), 'a&quot;b&amp;c');
});
test('esc null/undefined/0', () => {
  assert.strictEqual(Shared.escape.esc(null), '');
  assert.strictEqual(Shared.escape.esc(undefined), '');
  assert.strictEqual(Shared.escape.esc(0), '0');
});
test('escape.js source has no forbidden APIs', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'escape.js'), 'utf8');
  for (const bad of ['toLocale', 'Intl', 'fetch(']) assert.ok(!src.includes(bad), bad);
});
