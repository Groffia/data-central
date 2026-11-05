'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadPipeline } = require('./helpers/load');

const { Engine, Pipeline } = loadPipeline();
const vm = Pipeline.viewmodel;
const plain = (x) => JSON.parse(JSON.stringify(x));
const state = Engine.getState('healthy', Engine.AUTOPLAY.healthy.slice(0, 1));
const g = plain(vm.generationPanel(state));
const contract = Engine.getContract();

test('source and cadence lines', () => {
  assert.strictEqual(g.source, 'EHR vitals table, exported as a FHIR-style bulk file');
  assert.strictEqual(g.cadence, 'Exported every 15 simulated minutes (batch, cursor encounter_epoch)');
});
test('ten contract rows in contract order, patient_id sensitive', () => {
  assert.strictEqual(g.contractRows.length, 10);
  assert.deepStrictEqual(g.contractRows.map((r) => r.name), contract.fields.map((f) => f.name));
  assert.deepStrictEqual(g.contractRows[0], { name: 'patient_id', type: 'string', rule: '^TMH-P-\\d{6}$', sensitive: true });
  assert.strictEqual(g.contractRows[5].sensitive, false);
  assert.strictEqual(g.contractRows.filter((r) => r.sensitive).length, 5);
});
test('five golden rows, patient_name values from the contract', () => {
  assert.strictEqual(g.goldenRows.length, 5);
  assert.deepStrictEqual(g.goldenRows.map((r) => r.patient_name),
    ['Avery Lindqvist', 'Marcus Oyelaran', 'Eleanor Brandvold', 'Diego Ramirez-Holt', 'Priya Natarajan']);
  assert.deepStrictEqual(g.goldenRows, plain(contract.goldenRows));
});
test('facility lines equal the literals', () => {
  assert.deepStrictEqual(g.facility, {
    beds: '400 beds staffed',
    patients: '314 patients in house',
    perDay: '7,536 observations per day',
    per15: '78.5 observations per 15 minutes',
    perMonth: '226,080 observations per month',
    bytesPerRow: '253.75 bytes per row',
    bytesPerMonth: '57,367,800 bytes per month',
    note: 'The feed is a labelled sample of a 400-bed facility'
  });
});
test('same panel in every state, input not mutated, result detached from the contract', () => {
  const s = Engine.getState('incident', Engine.AUTOPLAY.incident.slice(0, 3)), before = JSON.stringify(s);
  assert.deepStrictEqual(plain(vm.generationPanel(s)), g);
  assert.strictEqual(JSON.stringify(s), before);
  vm.generationPanel(s).contractRows[0].name = 'x';
  assert.strictEqual(vm.generationPanel(s).contractRows[0].name, 'patient_id');
});
