'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadPipeline } = require('./helpers/load');

const { Engine, Pipeline } = loadPipeline();
const vm = Pipeline.viewmodel;
const plain = (x) => JSON.parse(JSON.stringify(x));
const contract = Engine.getContract();
const NAMES = contract.fields.map((f) => f.name);
const DRIFT_NAMES = ['patientId', 'patientName', 'patientZip5', 'birthDate', 'encounterEpoch', 'vitalSequence', 'vitalCode', 'vitalValue', 'unit', 'cipherSuite'];
function insp(scenario, k, n) { return Engine.inspectBatch(scenario, Engine.AUTOPLAY[scenario].slice(0, k), n); }

const inc = insp('incident', 3, 3);
const L = plain(vm.landingZone(inc));

test('incident batch 3 facts', () => {
  assert.deepStrictEqual(L.facts, { batchId: 'Batch 3', runTimeText: '15:00:00 UTC', rowCountText: '20 rows', table: 'bronze_tamsworth_vitals' });
});
test('incident batch 3: 20 rows, five drift rows at their engine indexes', () => {
  assert.strictEqual(L.rows.length, 20);
  const idx = L.rows.map((r, i) => (r.drift ? i : -1)).filter((i) => i >= 0);
  assert.deepStrictEqual(idx, [1, 5, 9, 14, 18]);
  const engineIdx = inc.rows.map((r, i) => (Object.keys(r).join() === NAMES.join() ? -1 : i)).filter((i) => i >= 0);
  assert.deepStrictEqual(idx, engineIdx);
});
test('columns are the union as received, first-seen order, both spellings present', () => {
  assert.deepStrictEqual(L.columns, [...NAMES, ...DRIFT_NAMES.filter((n) => !NAMES.includes(n))]);
  assert.ok(L.columns.includes('patient_id') && L.columns.includes('patientId'));
  assert.strictEqual(new Set(L.columns).size, L.columns.length);
});
test('cells line up with columns; drift cells flagged on renamed columns only', () => {
  const r = L.rows[1];
  assert.strictEqual(r.cells.length, L.columns.length);
  const byCol = (row, c) => row.cells[L.columns.indexOf(c)];
  assert.deepStrictEqual(byCol(r, 'patientId'), { text: 'TMH-P-009317', drift: true });
  assert.deepStrictEqual(byCol(r, 'vitalValue'), { text: '99', drift: true });
  assert.deepStrictEqual(byCol(r, 'patient_id'), { text: '', drift: false });
  assert.deepStrictEqual(byCol(L.rows[0], 'patient_id'), { text: 'TMH-P-004821', drift: false });
  assert.deepStrictEqual(byCol(L.rows[0], 'vital_value'), { text: '159', drift: false });
  assert.deepStrictEqual(byCol(L.rows[3], 'patient_id'), { text: 'null', drift: false });
  assert.strictEqual(L.rows[3].drift, false);
});
test('unit and cipherSuite are shared names so they are not drift cells', () => {
  assert.strictEqual(L.rows[1].cells[L.columns.indexOf('unit')].drift, false);
});
test('driftNote lists the renamed names and the contract names', () => {
  assert.strictEqual(L.driftNote,
    'Columns arrived as ' + DRIFT_NAMES.join(', ') + ' instead of ' + NAMES.join(', '));
});
test('the injection string appears raw in its patient_id cell', () => {
  const c = L.rows[12].cells[L.columns.indexOf('patient_id')];
  assert.strictEqual(c.text, "'; DROP TABLE silver_vital_observation;--");
  assert.strictEqual(L.rows[12].drift, false);
});
test('healthy batch 1: no drift, golden rows first', () => {
  const H = plain(vm.landingZone(insp('healthy', 1, 1)));
  assert.deepStrictEqual(H.facts, { batchId: 'Batch 1', runTimeText: '14:30:00 UTC', rowCountText: '20 rows', table: 'bronze_tamsworth_vitals' });
  assert.strictEqual(H.driftNote, null);
  assert.deepStrictEqual(H.columns, NAMES);
  assert.ok(H.rows.every((r) => !r.drift && r.cells.every((c) => !c.drift)));
  const nameCol = H.columns.indexOf('patient_name');
  assert.deepStrictEqual(H.rows.slice(0, 5).map((r) => r.cells[nameCol].text), contract.goldenRows.map((g) => g.patient_name));
});
test('null inspect gives an empty landing zone; input not mutated', () => {
  const e = plain(vm.landingZone(null));
  assert.deepStrictEqual(e, { facts: { batchId: 'no batch yet', runTimeText: '', rowCountText: '0 rows', table: 'bronze_tamsworth_vitals' }, columns: [], rows: [], driftNote: null });
  const before = JSON.stringify(inc);
  vm.landingZone(inc);
  assert.strictEqual(JSON.stringify(inc), before);
});
