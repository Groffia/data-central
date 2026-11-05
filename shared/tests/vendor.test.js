'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadShared } = require('./helpers/load');

const { Shared } = loadShared();

test('vendor rows: 8 rows of 4 strings, first column is the component', () => {
  const rows = Shared.vendor.rows;
  assert.strictEqual(rows.length, 8);
  rows.forEach(function (r) {
    assert.strictEqual(r.length, 4);
    r.forEach(function (c) { assert.strictEqual(typeof c, 'string'); });
  });
  assert.strictEqual(rows[0][0], 'Batch ingestion');
  assert.strictEqual(rows[7][0], 'Orchestration');
});

test('vendor.js source has no forbidden APIs', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'vendor.js'), 'utf8');
  for (const bad of ['toLocale', 'Intl', 'fetch(']) assert.ok(!src.includes(bad), bad);
});
