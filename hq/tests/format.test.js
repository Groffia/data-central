'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadHQ } = require('./helpers/load');

const { HQ } = loadHQ();
const F = HQ.format;

test('number formats', () => {
  assert.strictEqual(F.fracPct1(0.7857), '78.6%');
  assert.strictEqual(F.pct1(6.2216), '6.2%');
  assert.strictEqual(F.signedPct1(1.234), '+1.2%');
  assert.strictEqual(F.signedPct1(-0.44), '-0.4%');
  assert.strictEqual(F.signedPct1(0), '0.0%');
  assert.strictEqual(F.signedPts1(-2.7972), '-2.8 pts');
  assert.strictEqual(F.days1(3.456), '3.5 days');
});
test('labels', () => {
  assert.strictEqual(F.batchLabel('batch-12'), 'Batch 12');
  assert.strictEqual(F.batchLabel(null), 'no batch yet');
  assert.strictEqual(F.clockLabel('2026-11-03T14:45:00Z'), '14:45:00 UTC');
});
test('format.js source has no forbidden APIs', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'format.js'), 'utf8');
  for (const bad of ['toLocale', 'Intl', 'fetch(']) assert.ok(!src.includes(bad), bad);
});
