'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadShared } = require('./helpers/load');

const { Shared } = loadShared();

test('vendor rows: 9 rows of 4 strings, first column is the component', () => {
  const rows = Shared.vendor.rows;
  assert.strictEqual(rows.length, 9);
  rows.forEach(function (r) {
    assert.strictEqual(r.length, 4);
    r.forEach(function (c) { assert.strictEqual(typeof c, 'string'); });
  });
  assert.strictEqual(rows[0][0], 'Batch ingestion');
  assert.strictEqual(rows[7][0], 'Orchestration');
});

test('Dashboards row: three non-empty vendor names, no URL, Metrics layer unchanged', () => {
  const rows = Shared.vendor.rows;
  const d = rows.filter(function (r) { return r[0] === 'Dashboards'; });
  assert.strictEqual(d.length, 1);
  assert.deepStrictEqual([...d[0]], ['Dashboards', 'AI/BI dashboards', 'Snowsight dashboards', 'Power BI reports and dashboards']);
  d[0].forEach(function (c) { assert.ok(c.trim().length > 0); assert.ok(!/https?:|www./i.test(c)); });
  const m = rows.filter(function (r) { return r[0] === 'Metrics layer'; });
  assert.strictEqual(m.length, 1);
  assert.deepStrictEqual([...m[0]], ['Metrics layer', 'Unity Catalog metric views', 'dbt Semantic Layer', 'Power BI semantic model']);
});

test('vendor.js source has no forbidden APIs', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'vendor.js'), 'utf8');
  for (const bad of ['toLocale', 'Intl', 'fetch(']) assert.ok(!src.includes(bad), bad);
});
