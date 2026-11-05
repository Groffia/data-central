'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadHQ } = require('./helpers/load');

const { Engine, HQ, Shared } = loadHQ();
const vm = HQ.viewmodel, F = Shared.format;
function st(scenario, k) { return Engine.getState(scenario, Engine.AUTOPLAY[scenario].slice(0, k)); }

test('statusRow incident k=3', () => {
  assert.deepStrictEqual({ ...vm.statusRow(st("incident", 3)) }, {
    gate: 'OPEN', bronzeRows: 60, heldRows: 11, productionRows: 40, dlqOpen: 9, dlqTotal: 9,
    openAlerts: 1, lastGoodBatchText: 'Batch 2'
  });
});
test('statusRow incident k=14 is HALF-OPEN', () => {
  assert.strictEqual(vm.statusRow(st('incident', 14)).gate, 'HALF-OPEN');
});
test('statusRow incident k=16', () => {
  const r = vm.statusRow(st('incident', 16));
  assert.strictEqual(r.openAlerts, 0);
  assert.strictEqual(r.lastGoodBatchText, 'Batch 4');
  assert.strictEqual(r.productionRows, 76);
  assert.strictEqual(r.gate, 'CLOSED');
});
test('statusRow healthy k=0 has no batch yet', () => {
  assert.strictEqual(vm.statusRow(st('healthy', 0)).lastGoodBatchText, 'no batch yet');
});
test('statusRow does not mutate state', () => {
  const s = st('incident', 3), before = JSON.stringify(s);
  vm.statusRow(s); vm.kpiTiles(s); vm.todaySoFar(s);
  assert.strictEqual(JSON.stringify(s), before);
});

const NAMES = ['Bed Occupancy', 'Abnormal Vital Rate', 'Avg Length of Stay', '30-Day Readmission Rate'];
test('kpiTiles names, order, value text', () => {
  for (const [sc, k] of [['healthy', 0], ['healthy', 1], ['incident', 3], ['incident', 16]]) {
    const s = st(sc, k), tiles = vm.kpiTiles(s);
    assert.strictEqual(tiles.length, 4);
    assert.deepStrictEqual([...tiles.map(t => t.name)], NAMES);
    tiles.forEach((t, i) => {
      const kp = s.kpis[i];
      const expect = t.name === 'Avg Length of Stay' ? F.days1(kp.value) : F.fracPct1(kp.value);
      assert.strictEqual(t.valueText, expect);
      assert.strictEqual(t.deltaText, F.signedPct1(kp.deltaPct));
      assert.strictEqual(t.held, kp.held);
      assert.strictEqual(t.asOfText, 'as of ' + F.batchLabel(kp.asOfBatchId) + ', ' + F.clockLabel(kp.asOfIso));
    });
  }
});
test('kpiTiles held and asOf text', () => {
  const a = vm.kpiTiles(st('incident', 3));
  assert.ok(a.every(t => t.held === true && t.asOfText === 'as of Batch 2, 14:45:00 UTC'));
  const b = vm.kpiTiles(st('incident', 16));
  assert.ok(b.every(t => t.held === false && t.asOfText === 'as of Batch 4, 15:15:00 UTC'));
  assert.ok(vm.kpiTiles(st('healthy', 0)).every(t => t.asOfText === 'as of no batch yet, 14:00:00 UTC'));
});
test('kpiTiles deltaDirection', () => {
  const s = st('healthy', 1);
  s.kpis = s.kpis.map((k, i) => Object.assign({}, k, { deltaPct: [2.5, -1.2, 0, 0.04][i] }));
  assert.deepStrictEqual([...vm.kpiTiles(s).map(t => t.deltaDirection)], ['up', 'down', 'flat', 'up']);
});

test('todaySoFar observations', () => {
  assert.strictEqual(vm.todaySoFar(st('healthy', 1)).observations, 20);
  assert.strictEqual(vm.todaySoFar(st('incident', 3)).observations, 40);
  assert.strictEqual(vm.todaySoFar(st('incident', 3)).observations, vm.todaySoFar(st('incident', 2)).observations);
  assert.strictEqual(vm.todaySoFar(st('incident', 16)).observations, 76);
});
test('todaySoFar text fields', () => {
  const s = st('incident', 16), t = vm.todaySoFar(s);
  assert.strictEqual(t.label, 'Live sample: published exports today.');
  assert.strictEqual(t.note, s.todaySoFar.note);
  assert.strictEqual(t.abnormalCount, s.todaySoFar.abnormalCount);
  assert.strictEqual(t.rateText, F.pct1(s.todaySoFar.abnormalVitalRate));
  for (const [sc, k] of [['healthy', 0], ['healthy', 1], ['incident', 3], ['incident', 16]]) {
    assert.strictEqual(vm.todaySoFar(st(sc, k)).notEvaluableText, null);
  }
  const h = st('healthy', 1); h.todaySoFar = Object.assign({}, h.todaySoFar, { notEvaluable: 2 });
  assert.strictEqual(vm.todaySoFar(h).notEvaluableText, '2 not evaluable');
});
