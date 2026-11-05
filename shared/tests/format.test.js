'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadShared } = require('./helpers/load');

const { Shared } = loadShared();
const F = Shared.format;

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
test('thousands', () => {
  assert.strictEqual(F.thousands(0), '0');
  assert.strictEqual(F.thousands(999), '999');
  assert.strictEqual(F.thousands(1000), '1,000');
  assert.strictEqual(F.thousands(7536), '7,536');
  assert.strictEqual(F.thousands(57367800), '57,367,800');
  assert.strictEqual(F.thousands(1234567), '1,234,567');
  assert.strictEqual(F.thousands(-1234), '-1,234');
  assert.strictEqual(F.thousands(1234.6), '1,235');
  assert.strictEqual(F.thousands(-0.2), '0');
});
test('format.js source has no forbidden APIs', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'format.js'), 'utf8');
  for (const bad of ['toLocale', 'Intl', 'fetch(']) assert.ok(!src.includes(bad), bad);
});
