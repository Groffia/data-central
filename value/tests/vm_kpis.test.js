'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadValue } = require('./helpers/load');

const { Engine, Value } = loadValue();
const vm = Value.viewmodel;
const hist = Engine.getHistory();
const stateAt = (scenario, k) => Engine.getState(scenario, Engine.actionsForStep(scenario, k));
const tiles = (scenario, k, ms) => vm.kpiTiles(stateAt(scenario, k), hist, ms);

test('four tiles in engine order with kebab ids', () => {
  const t = tiles('incident', 3);
  assert.deepStrictEqual(t.map((x) => x.name), ['Bed Occupancy', 'Abnormal Vital Rate', 'Avg Length of Stay', '30-Day Readmission Rate']);
  assert.deepStrictEqual(t.map((x) => x.id), ['bed-occupancy', 'abnormal-vital-rate', 'avg-length-of-stay', '30-day-readmission-rate']);
});

test('incident step 3 values, deltas, held, freshness', () => {
  const t = tiles('incident', 3);
  assert.deepStrictEqual(t.map((x) => x.valueText), ['78.6%', '6.2%', '4.7 days', '13.4%']);
  assert.deepStrictEqual(t.map((x) => x.deltaText), ['-0.7% vs prior 7 days', '+3.5% vs prior 7 days', '+3.1% vs prior 7 days', '+0.6% vs prior 7 days']);
  assert.deepStrictEqual(t.map((x) => x.deltaDirection), ['down', 'up', 'up', 'up']);
  for (const x of t) {
    assert.strictEqual(x.held, true);
    assert.strictEqual(x.heldText, 'KPIs held at Batch 2');
    assert.match(x.freshness, /^as of Batch 2, \d\d:\d\d:\d\d UTC$/);
  }
});

test('incident step 16 not held, Batch 4', () => {
  for (const x of tiles('incident', 16)) {
    assert.strictEqual(x.held, false);
    assert.match(x.freshness, /^as of Batch 4, /);
  }
});

test('healthy step 1 Batch 1 not held', () => {
  for (const x of tiles('healthy', 1)) {
    assert.strictEqual(x.held, false);
    assert.match(x.freshness, /^as of Batch 1, /);
  }
});

test('sparkline has 30 finite points', () => {
  for (const x of tiles('incident', 3)) {
    assert.strictEqual(x.sparkline.points.length, 30);
    assert.ok(x.sparkline.points.every(Number.isFinite));
  }
  const bed = tiles('incident', 3)[0].sparkline.points;
  const last = hist[hist.length - 1];
  assert.strictEqual(bed[29], last.beds_occupied / last.beds_staffed);
});

test('source captions', () => {
  assert.deepStrictEqual(tiles('incident', 3).map((x) => x.source), ['fct_census_daily', 'fct_vital_observation', 'fct_census_daily', 'fct_census_daily']);
});

test('default badges are def v1', () => {
  assert.deepStrictEqual(tiles('incident', 3).map((x) => x.definitionBadge), ['def v1', 'def v1', 'def v1', 'def v1']);
  assert.deepStrictEqual(tiles('incident', 3, null).map((x) => x.definitionBadge), ['def v1', 'def v1', 'def v1', 'def v1']);
});

test('strict_thresholds v2 changes Abnormal Vital Rate only', () => {
  const t = tiles('incident', 3, { 'Abnormal Vital Rate': { definitionId: 'strict_thresholds', version: 2 } });
  const m = Engine.computeMetric(hist, 'Abnormal Vital Rate', 'strict_thresholds');
  assert.strictEqual(t[1].valueText, (m.value * 100).toFixed(1) + '%');
  assert.notStrictEqual(t[1].valueText, '6.2%');
  assert.deepStrictEqual(t.map((x) => x.definitionBadge), ['def v1', 'def v2', 'def v1', 'def v1']);
  assert.strictEqual(t[0].valueText, '78.6%');
  const last = hist[hist.length - 1];
  assert.strictEqual(t[1].sparkline.points[29], last.abnormal_obs_strict / last.observations);
});

test('unplanned_only v2 changes 30-Day Readmission Rate only', () => {
  const t = tiles('incident', 3, { '30-Day Readmission Rate': { definitionId: 'unplanned_only', version: 2 } });
  const m = Engine.computeMetric(hist, '30-Day Readmission Rate', 'unplanned_only');
  assert.strictEqual(t[3].valueText, (m.value * 100).toFixed(1) + '%');
  assert.deepStrictEqual(t.map((x) => x.definitionBadge), ['def v1', 'def v1', 'def v1', 'def v2']);
  assert.match(t[3].deltaText, /^[+-]\d+\.\d% vs prior 7 days$/);
});
