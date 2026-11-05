'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadHQ } = require('./helpers/load');

const { Engine, HQ } = loadHQ();
const vm = HQ.viewmodel;
const J = (o) => JSON.parse(JSON.stringify(o));
const CTX = { exportRows: 1, tiering: Engine.TIERING_DEFAULTS };

function incidentState() { return J(Engine.getState('incident', Engine.AUTOPLAY.incident.slice(0, 3))); }

test('single source of discard reasons is the engine', () => {
  assert.strictEqual(vm.DISCARD_REASONS, undefined);
  assert.strictEqual(HQ.controller.DISCARD_REASONS, undefined);
  assert.strictEqual(Object.isFrozen(Engine.DISCARD_REASONS), true);
  const s = incidentState();
  assert.deepStrictEqual(vm.incidentPanel(s).discardReasons, [...Engine.DISCARD_REASONS]);
  vm.incidentPanel(s).rows.forEach(function (r, i) {
    assert.strictEqual(r.suggestedReason, Engine.suggestedReason(s.dlq[i]));
  });
});

test('controller validates discard reasons against the engine list', () => {
  const c = HQ.controller.createController(Engine, '?scenario=incident&step=3');
  const n = c.actions().length;
  assert.strictEqual(c.dispatch({ type: 'discard', dlqId: 'dlq-3-4', reason: 'unrepairable' }).ok, false);
  assert.strictEqual(c.dispatch({ type: 'discard', dlqId: 'dlq-3-4', reason: Engine.DISCARD_REASONS[0] }).ok, true);
  assert.strictEqual(c.actions().length, n + 1);
});

test('stage chips at a count of 1 agree', () => {
  const s = incidentState();
  s.dlq = s.dlq.filter(function (d) { return d.status === 'open'; }).slice(0, 1);
  s.dlq[0].batchId = 'batch-' + s.batchesRun;
  s.staging = s.staging.slice(0, 1);
  s.productionRows = 1;
  const t = {};
  vm.stageChips(s, CTX).forEach(function (c) { t[c.id] = c.text; });
  assert.strictEqual(t[1], 'Source sent 1 malformed row');
  assert.strictEqual(t[2], 'Landed 1 row unchanged');
  assert.strictEqual(t[3], '1 row held');
  assert.strictEqual(t[4], '1 row in production');
  assert.strictEqual(t[5], 'Gate open: 1 row to resolve');
});

test('stage chips at counts above 1 keep the plural', () => {
  const s = incidentState();
  const t = {};
  vm.stageChips(s, { exportRows: 20, tiering: Engine.TIERING_DEFAULTS }).forEach(function (c) { t[c.id] = c.text; });
  assert.ok(/^Source sent \d+ malformed rows$/.test(t[1]), t[1]);
  assert.strictEqual(t[2], 'Landed 20 rows unchanged');
  assert.ok(/^\d+ rows held$/.test(t[3]), t[3]);
  assert.ok(/^\d+ rows in production$/.test(t[4]), t[4]);
  assert.ok(/^Gate open: \d+ rows to resolve$/.test(t[5]), t[5]);
});

test('resolveRetryBlockedReason at 1 and 2', () => {
  const s = incidentState();
  s.dlq.forEach(function (d) { d.status = 'resolved'; });
  s.dlq[0].status = 'open';
  assert.strictEqual(vm.incidentPanel(s).resolveRetryBlockedReason, '1 DLQ row unresolved');
  s.dlq[1].status = 'open';
  assert.strictEqual(vm.incidentPanel(s).resolveRetryBlockedReason, '2 DLQ rows unresolved');
});

test('business headline at counts of 1 and 2', () => {
  const s = incidentState();
  s.businessCase.rowsSilentlyDropped = 1;
  s.businessCase.invalidRowsReachingDashboard = 1;
  assert.strictEqual(vm.businessCase(s).headline,
    'Without the gate: 1 row vanishes silently and 1 impossible reading reaches the dashboard.');
  s.businessCase.rowsSilentlyDropped = 2;
  s.businessCase.invalidRowsReachingDashboard = 3;
  assert.strictEqual(vm.businessCase(s).headline,
    'Without the gate: 2 rows vanish silently and 3 impossible readings reach the dashboard.');
  s.businessCase.rowsSilentlyDropped = 1;
  s.businessCase.invalidRowsReachingDashboard = 3;
  assert.strictEqual(vm.businessCase(s).headline,
    'Without the gate: 1 row vanishes silently and 3 impossible readings reach the dashboard.');
});

test('status row labels at a count of 1', () => {
  const s = incidentState();
  s.dlq = s.dlq.slice(0, 1); s.dlq[0].status = 'open';
  const m = vm.buildViewModel(s, {}, CTX);
  assert.strictEqual(m.status.dlqOpen, 1);
  const r = HQ.render.renderRegions(m);
  assert.ok(r.status.indexOf('1 open of 1') >= 0, r.status);
  assert.ok(/Dead-letter rows?/.test(r.status));
});

test('observations label at 1', () => {
  const s = incidentState();
  s.todaySoFar.observations = 1;
  const html = HQ.render.renderRegions(vm.buildViewModel(s, {}, CTX)).today;
  assert.ok(html.indexOf('<dt>Observation</dt>') >= 0, html);
  s.todaySoFar.observations = 5;
  assert.ok(HQ.render.renderRegions(vm.buildViewModel(s, {}, CTX)).today.indexOf('<dt>Observations</dt>') >= 0);
});
