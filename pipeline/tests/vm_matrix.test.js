'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadPipeline } = require('./helpers/load');

const { Engine, Pipeline } = loadPipeline();
const vm = Pipeline.viewmodel;
const plain = (x) => JSON.parse(JSON.stringify(x));
const NAMES = Engine.getContract().fields.map((f) => f.name);
function insp(scenario, k, n) { return Engine.inspectBatch(scenario, Engine.AUTOPLAY[scenario].slice(0, k), n); }
function stateAt(scenario, k) { return Engine.getState(scenario, Engine.AUTOPLAY[scenario].slice(0, k)); }

const L = Engine.AUTOPLAY.incident.length;
const inc3 = insp('incident', 3, 3);
const st3 = stateAt('incident', 3);
const NOTE = 'Note: the five schema-drift rows fail not_null on nine contract columns each, because their columns arrived renamed (9 columns x 5 rows = 45 counts). Read them as five rows, not 45 failures.';

test('incident batch 3 matrix counts match the spec', () => {
  const M = plain(vm.testMatrix(inc3));
  assert.strictEqual(M.rows.length, inc3.results.length);
  const get = (t, c) => M.rows.find((r) => r.test === t && r.column === c);
  assert.strictEqual(get('not_null', 'patient_id').failing, 6);
  ['patient_name', 'patient_zip5', 'birth_date', 'encounter_epoch', 'vital_sequence', 'vital_code', 'vital_value', 'cipher_suite']
    .forEach((c) => assert.strictEqual(get('not_null', c).failing, 5, c));
  assert.strictEqual(get('not_null', 'unit').failing, 0);
  assert.strictEqual(get('no_unexpected_columns', '*').failing, 5);
  assert.strictEqual(get('range', 'vital_value').failing, 1);
  assert.strictEqual(get('matches_pattern', 'patient_id').failing, 1);
  assert.strictEqual(get('accepted_values', 'unit').failing, 1);
  assert.strictEqual(get('unit_matches_code', 'unit').failing, 1);
  const warn = M.rows.filter((r) => r.severity === 'warn');
  assert.deepStrictEqual(warn.map((r) => r.test), ['freshness', 'abnormal_vital_flag']);
  assert.strictEqual(get('abnormal_vital_flag', 'vital_value').failing, 2);
  const listed = new Set(['not_null:patient_id', 'not_null:patient_name', 'not_null:patient_zip5', 'not_null:birth_date', 'not_null:encounter_epoch',
    'not_null:vital_sequence', 'not_null:vital_code', 'not_null:vital_value', 'not_null:cipher_suite', 'no_unexpected_columns:*', 'range:vital_value',
    'matches_pattern:patient_id', 'accepted_values:unit', 'unit_matches_code:unit', 'abnormal_vital_flag:vital_value']);
  M.rows.filter((r) => !listed.has(r.test + ':' + r.column)).forEach((r) => assert.strictEqual(r.failing, 0, r.test + ' ' + r.column));
});
test('rows are in engine order with engine indexes and labels', () => {
  const M = plain(vm.testMatrix(inc3));
  assert.deepStrictEqual(M.rows.map((r) => [r.test, r.column]), inc3.results.map((r) => [r.test, r.column]));
  assert.deepStrictEqual(M.rows.map((r) => r.rowIndexes), inc3.results.map((r) => r.failingRows));
  assert.strictEqual(M.rows[0].labelText, 'not_null on patient_id');
  assert.ok(M.rows.some((r) => r.labelText === 'no_unexpected_columns on *'));
  assert.ok(M.rows.every((r) => r.labelText === r.test + ' on ' + r.column));
});
test('note equals the literal at incident batch 3, none elsewhere; counts unchanged by the note', () => {
  assert.deepStrictEqual(plain(vm.testMatrix(inc3).notes), [NOTE]);
  assert.deepStrictEqual(plain(vm.testMatrix(insp('incident', 1, 1)).notes), []);
  assert.deepStrictEqual(plain(vm.testMatrix(insp('incident', 2, 2)).notes), []);
  assert.deepStrictEqual(plain(vm.testMatrix(insp('incident', L, 4)).notes), []);
  assert.strictEqual(vm.testMatrix(inc3).rows.find((r) => r.test === 'not_null' && r.column === 'patient_id').failing, 6);
});
test('incident batches 1, 2, 4: no error-severity failures', () => {
  [[1, 1], [2, 2], [L, 4]].forEach(([k, n]) => {
    const M = vm.testMatrix(insp('incident', k, n));
    assert.ok(M.rows.filter((r) => r.severity === 'error').every((r) => r.failing === 0));
  });
});

// Hand-made inspect: the first `driftRows` of five rows are drift rows.
function hand(driftRows) {
  const good = {}; NAMES.forEach((n) => { good[n] = 'x'; });
  const drift = {}; NAMES.forEach((n) => { drift[n + 'X'] = 'x'; });
  const rows = [];
  for (let i = 0; i < 5; i++) rows.push(i < driftRows ? drift : good);
  const idx = []; for (let i = 0; i < driftRows; i++) idx.push(i);
  const results = [
    { test: 'not_null', severity: 'error', column: 'patient_id', failingRows: idx.slice() },
    { test: 'not_null', severity: 'error', column: 'unit', failingRows: idx.slice() },
    { test: 'not_null', severity: 'error', column: 'vital_code', failingRows: [] },
    { test: 'range', severity: 'error', column: 'vital_value', failingRows: [4] },
    { test: 'freshness', severity: 'warn', column: 'encounter_epoch', failingRows: [3] }
  ];
  return { n: 1, batchId: 'batch-1', runEpoch: 0, rows, results, rowFailures: [], decision: 'HELD', dlqIds: [] };
}
test('singular note for one drift row reads grammatically', () => {
  assert.deepStrictEqual(plain(vm.testMatrix(hand(1)).notes), ['Note: the 1 schema-drift row fails not_null on two contract columns, because its columns arrived renamed (2 columns x 1 row = 2 counts). Read it as one row, not 2 failures.']);
});
test('three drift rows use plural words', () => {
  assert.deepStrictEqual(plain(vm.testMatrix(hand(3)).notes), ['Note: the three schema-drift rows fail not_null on two contract columns each, because their columns arrived renamed (2 columns x 3 rows = 6 counts). Read them as three rows, not 6 failures.']);
});
test('no drift rows: no note', () => {
  assert.deepStrictEqual(plain(vm.testMatrix(hand(0)).notes), []);
});

test('gate decision: Held at batch 3 uses that batch for the staged count', () => {
  assert.deepStrictEqual(plain(vm.gateDecision(inc3, st3)), { text: 'Gate decision: Held (9 rows quarantined, 11 rows held in staging)', level: 'red' });
  assert.strictEqual(vm.gateDecision(inc3, stateAt('incident', L)).text, 'Gate decision: Held (9 rows quarantined, 11 rows held in staging)');
});
test('gate decision: Published at batch 4', () => {
  assert.deepStrictEqual(plain(vm.gateDecision(insp('incident', L, 4), stateAt('incident', L))), { text: 'Gate decision: Published (0 error-severity failures)', level: 'green' });
  assert.strictEqual(vm.gateDecision(insp('healthy', 1, 1), stateAt('healthy', 1)).level, 'green');
});
test('warn rows never count in the decision; one failing row reads singular', () => {
  assert.strictEqual(vm.gateDecision(hand(0), null).text, 'Gate decision: Held (1 row quarantined, 4 rows held in staging)');
  const warnOnly = hand(0);
  warnOnly.results = warnOnly.results.filter((r) => r.severity === 'warn');
  warnOnly.decision = 'PUBLISHED';
  assert.strictEqual(vm.gateDecision(warnOnly, null).text, 'Gate decision: Published (0 error-severity failures)');
});

test('row view at incident batch 3: 20 entries, nine failing', () => {
  const R = plain(vm.rowView(inc3));
  assert.strictEqual(R.length, 20);
  assert.strictEqual(R.filter((r) => !r.pass).length, 9);
  assert.deepStrictEqual(R.map((r) => r.index), inc3.rows.map((_, i) => i));
  assert.deepStrictEqual(R[1], { index: 1, pass: false, failedTests: ['not_null', 'no_unexpected_columns'], warnTests: [] });
  assert.deepStrictEqual(R[0], { index: 0, pass: true, failedTests: [], warnTests: ['abnormal_vital_flag'] });
});
test('row view: batch 4 all pass; null inspect empty; input not mutated', () => {
  assert.ok(vm.rowView(insp('incident', L, 4)).every((r) => r.pass));
  assert.deepStrictEqual(plain(vm.rowView(null)), []);
  assert.deepStrictEqual(plain(vm.testMatrix(null)), { rows: [], notes: [] });
  const before = JSON.stringify(inc3);
  vm.testMatrix(inc3); vm.gateDecision(inc3, st3); vm.rowView(inc3);
  assert.strictEqual(JSON.stringify(inc3), before);
});

test('row view lists warn tests separately; failedTests and pass unchanged', () => {
  const R = plain(vm.rowView(inc3));
  assert.deepStrictEqual(R[0], { index: 0, pass: true, failedTests: [], warnTests: ['abnormal_vital_flag'] });
  assert.deepStrictEqual(R[15], { index: 15, pass: true, failedTests: [], warnTests: ['abnormal_vital_flag'] });
  assert.deepStrictEqual(R[1], { index: 1, pass: false, failedTests: ['not_null', 'no_unexpected_columns'], warnTests: [] });
  assert.strictEqual(R.filter((r) => r.warnTests.length).length, 2);
  assert.strictEqual(R.filter((r) => !r.pass).length, 9);
  const h = plain(vm.rowView(hand(0)));
  assert.deepStrictEqual(h[3], { index: 3, pass: true, failedTests: [], warnTests: ['freshness'] });
  assert.deepStrictEqual(h[4], { index: 4, pass: false, failedTests: ['range'], warnTests: [] });
});
