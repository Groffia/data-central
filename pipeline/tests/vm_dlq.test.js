'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadPipeline } = require('./helpers/load');

const { Engine, Pipeline } = loadPipeline();
const vm = Pipeline.viewmodel;
const plain = (x) => JSON.parse(JSON.stringify(x));
function stateAt(scenario, k) { return Engine.getState(scenario, Engine.AUTOPLAY[scenario].slice(0, k)); }

const HQ = 'hq.html?scenario=incident&step=3';
const s3 = stateAt('incident', 3);
const s16 = stateAt('incident', Engine.AUTOPLAY.incident.length);
const INJ = "\"'; DROP TABLE silver_vital_observation;--\"";

test('incident step 3: nine entries in dlq order, anchor equals id', () => {
  const V = plain(vm.dlqView(s3, HQ));
  assert.strictEqual(V.length, 9);
  assert.deepStrictEqual(V.map((e) => e.id), s3.dlq.map((d) => d.dlqId));
  assert.ok(V.every((e) => e.anchor === e.id));
  assert.ok(V.every((e) => e.status === 'open'));
});
test('dlq-3-13: observed text is the quoted injection string, raw', () => {
  const e = plain(vm.dlqView(s3, HQ)).find((x) => x.id === 'dlq-3-13');
  assert.strictEqual(e.observedValueText, INJ);
  assert.deepStrictEqual(e.failedTests, ['matches_pattern']);
  assert.strictEqual(e.column, 'patient_id');
  assert.strictEqual(e.reason, 'Failed matches_pattern on patient_id');
  assert.strictEqual(e.repairable, false);
});
test('drift entry matches the HQ row mapping (observed 9, repairable)', () => {
  const e = plain(vm.dlqView(s3, HQ)).find((x) => x.id === 'dlq-3-2');
  assert.deepStrictEqual(e, {
    id: 'dlq-3-2', anchor: 'dlq-3-2', failedTests: ['not_null', 'no_unexpected_columns'], column: '*',
    observedValueText: '9', reason: 'Unexpected columns (schema drift)', repairable: true, status: 'open', hqHref: HQ
  });
});
test('null observed value reads null', () => {
  const e = plain(vm.dlqView(s3, '')).find((x) => x.observedValueText === 'null');
  assert.ok(e);
});
test('hqHref is hqLink verbatim, or empty', () => {
  assert.ok(vm.dlqView(s3, HQ).every((e) => e.hqHref === HQ));
  assert.ok(vm.dlqView(s3, '').every((e) => e.hqHref === ''));
  assert.ok(vm.dlqView(s3).every((e) => e.hqHref === ''));
});
test('incident step 16: every entry repaired or discarded', () => {
  const V = vm.dlqView(s16, HQ);
  assert.strictEqual(V.length, 9);
  assert.ok(V.every((e) => e.status === 'repaired' || e.status === 'discarded'));
});
test('healthy step 1: empty view; input not mutated', () => {
  assert.deepStrictEqual(plain(vm.dlqView(stateAt('healthy', 1), HQ)), []);
  const before = JSON.stringify(s3);
  vm.dlqView(s3, HQ); vm.medallion(s3);
  assert.strictEqual(JSON.stringify(s3), before);
});

const GOLD = "Gold KPI inputs are the 120-day pre-aggregated daily history plus today's published exports";
test('medallion at incident step 3: bronze 60, staging 11, silver 40', () => {
  const M = plain(vm.medallion(s3));
  assert.strictEqual(M.bronze, 60);
  assert.strictEqual(M.staging, 11);
  assert.strictEqual(M.silver, 40);
  assert.strictEqual(M.gold.text, GOLD);
  assert.deepStrictEqual(M.gold.tables, ['fct_vital_observation', 'dim_patient', 'dim_vital_code', 'fct_census_daily']);
  assert.strictEqual(M.labels.bronze, 'Bronze rows landed');
  assert.strictEqual(M.labels.staging, 'Held in staging');
  assert.strictEqual(M.labels.silver, 'Silver rows in production');
  assert.strictEqual(M.silverTable, 'silver_vital_observation');
});
test('medallion at incident step 16: silver 76, staging 0', () => {
  const M = vm.medallion(s16);
  assert.strictEqual(M.silver, 76);
  assert.strictEqual(M.staging, 0);
  assert.strictEqual(M.bronze, 80);
});
test('medallion at healthy step 1: bronze 20, silver 20', () => {
  const M = vm.medallion(stateAt('healthy', 1));
  assert.strictEqual(M.bronze, 20);
  assert.strictEqual(M.silver, 20);
  assert.strictEqual(M.staging, 0);
});
test('unit texts use the plural helper', () => {
  const one = { bronzeRows: 1, productionRows: 1, staging: [{}], dlq: [] };
  const M = plain(vm.medallion(one));
  assert.deepStrictEqual([M.texts.bronze, M.texts.staging, M.texts.silver], ['1 row', '1 row', '1 row']);
  const T = plain(vm.medallion(s3));
  assert.deepStrictEqual([T.texts.bronze, T.texts.staging, T.texts.silver], ['60 rows', '11 rows', '40 rows']);
});
