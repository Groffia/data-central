'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadHQ } = require('./helpers/load');

const { Engine, HQ } = loadHQ();
const vm = HQ.viewmodel;
function st(scenario, k) { return Engine.getState(scenario, Engine.AUTOPLAY[scenario].slice(0, k)); }
function row(p, id) { return p.rows.filter(function (r) { return r.dlqId === id; })[0]; }
const INJ = "'; DROP TABLE silver_vital_observation;--";
const REASONS = ['Missing patient ID', 'Physiologically impossible value', 'Malformed or suspicious input',
  'Wrong unit, source must resend', 'Other, see note'];

test('engine DISCARD_REASONS is exact and frozen; the page keeps no copy', () => {
  assert.deepStrictEqual([...Engine.DISCARD_REASONS], REASONS);
  assert.ok(Object.isFrozen(Engine.DISCARD_REASONS));
  assert.strictEqual(vm.DISCARD_REASONS, undefined);
});
test('healthy k=1 panel is hidden and empty', () => {
  const p = vm.incidentPanel(st('healthy', 1));
  assert.strictEqual(p.visible, false);
  assert.strictEqual(p.alert, null);
  assert.deepStrictEqual([...p.rows], []);
});
test('incident k=3 alert and gate', () => {
  const p = vm.incidentPanel(st('incident', 3));
  assert.strictEqual(p.visible, true);
  assert.strictEqual(p.rows.length, 9);
  assert.deepStrictEqual({ ...p.alert }, {
    severity: 'SEV-2', title: 'DQ gate opened: 9 error-severity failures in batch batch-3',
    count: 1, status: 'open', canAck: true, canResolve: true
  });
  assert.strictEqual(p.canResolveRetry, false);
  assert.strictEqual(p.resolveRetryBlockedReason, '9 DLQ rows unresolved');
  assert.deepStrictEqual([...p.discardReasons], REASONS);
  assert.notStrictEqual(p.discardReasons, Engine.DISCARD_REASONS);
});
test('incident k=3 rows', () => {
  const p = vm.incidentPanel(st('incident', 3));
  const r4 = row(p, 'dlq-3-4');
  assert.strictEqual(r4.column, 'patient_id');
  assert.strictEqual(r4.canRepair, false);
  assert.strictEqual(r4.canDiscard, true);
  const r2 = row(p, 'dlq-3-2');
  assert.strictEqual(r2.column, '*');
  assert.strictEqual(r2.reason, 'Unexpected columns (schema drift)');
  assert.strictEqual(r2.canRepair, true);
  assert.strictEqual(row(p, 'dlq-3-13').observedValueText, JSON.stringify(INJ));
  assert.ok(row(p, 'dlq-3-13').observedValueText.indexOf(INJ) >= 0);
  assert.strictEqual(row(p, 'dlq-3-4').observedValueText, 'null');
  const raw = st('incident', 3).dlq.filter(function (d) { return d.dlqId === 'dlq-3-9'; })[0].observedValue;
  assert.strictEqual(row(p, 'dlq-3-9').observedValueText, JSON.stringify(raw));
});
test('suggestedReason rules', () => {
  const p = vm.incidentPanel(st('incident', 3));
  assert.strictEqual(row(p, 'dlq-3-4').suggestedReason, 'Missing patient ID');
  assert.strictEqual(row(p, 'dlq-3-9').suggestedReason, 'Physiologically impossible value');
  assert.strictEqual(row(p, 'dlq-3-13').suggestedReason, 'Malformed or suspicious input');
  assert.strictEqual(row(p, 'dlq-3-17').suggestedReason, 'Wrong unit, source must resend');
  ['dlq-3-2', 'dlq-3-6', 'dlq-3-10', 'dlq-3-15', 'dlq-3-19'].forEach(function (id) {
    assert.strictEqual(row(p, id).suggestedReason, 'Other, see note');
  });
  p.rows.forEach(function (r) { assert.ok(REASONS.indexOf(r.suggestedReason) >= 0); });
});
test('incident k=8 repaired drift rows', () => {
  const p = vm.incidentPanel(st('incident', 8));
  ['dlq-3-2', 'dlq-3-6', 'dlq-3-10', 'dlq-3-15', 'dlq-3-19'].forEach(function (id) {
    assert.strictEqual(row(p, id).status, 'repaired');
    assert.strictEqual(row(p, id).canRepair, false);
  });
  assert.strictEqual(p.resolveRetryBlockedReason, '4 DLQ rows unresolved');
});
test('singular reason wording', () => {
  const s = st('incident', 11);
  const open = s.dlq.filter(function (d) { return d.status === 'open'; }).length;
  assert.strictEqual(vm.incidentPanel(s).resolveRetryBlockedReason,
    open === 1 ? '1 DLQ row unresolved' : open + ' DLQ rows unresolved');
});
test('incident k=12 can resolve and retry', () => {
  const p = vm.incidentPanel(st('incident', 12));
  assert.strictEqual(p.canResolveRetry, true);
  assert.strictEqual(p.resolveRetryBlockedReason, null);
});
test('incident k=13 alert acknowledged', () => {
  const a = vm.incidentPanel(st('incident', 13)).alert;
  assert.strictEqual(a.canAck, false);
  assert.strictEqual(a.canResolve, true);
});
test('incident k=14 half-open', () => {
  const p = vm.incidentPanel(st('incident', 14));
  assert.strictEqual(p.canResolveRetry, false);
  assert.strictEqual(p.resolveRetryBlockedReason, null);
});
test('incident k=16 alert resolved', () => {
  const a = vm.incidentPanel(st('incident', 16)).alert;
  assert.strictEqual(a.status, 'resolved');
  assert.strictEqual(a.canAck, false);
  assert.strictEqual(a.canResolve, false);
});
test('panel does not mutate state', () => {
  const s = st('incident', 3), before = JSON.stringify(s);
  vm.incidentPanel(s); vm.timeline(s);
  assert.strictEqual(JSON.stringify(s), before);
});
test('timeline k=16', () => {
  const s = st('incident', 16);
  const t = vm.timeline(s);
  assert.strictEqual(t.length, s.events.length);
  const by = function (type) { return t.filter(function (r) { return r.type === type; }); };
  assert.strictEqual(by('ROW_REPAIRED')[0].timeText, '15:01:00 UTC');
  assert.strictEqual(by('GATE_HALF_OPEN')[0].timeText, '15:11:00 UTC');
  assert.strictEqual(by('ALERT_RESOLVED')[0].timeText, '15:16:00 UTC');
  assert.strictEqual(t[0].iso, s.events[0].iso);
  const ops = t.filter(function (r) { return /^(ROW_|ALERT_ACK|GATE_HALF)/.test(r.type); });
  for (let i = 1; i < ops.length; i++) assert.ok(ops[i].iso > ops[i - 1].iso);
  t.forEach(function (r, i) { assert.strictEqual(r.detail, s.events[i].detail); });
});
