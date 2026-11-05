'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const J = (x) => JSON.parse(JSON.stringify(x));
const { loadHQ } = require('./helpers/load');

const { Engine, HQ } = loadHQ();
const make = (s) => HQ.controller.createController(Engine, s);

test('default search opens healthy with one action', () => {
  const c = make('');
  assert.equal(c.scenario(), 'healthy');
  assert.equal(c.actions().length, 1);
  const m = c.getModel();
  assert.equal(m.scenario, 'healthy');
  assert.equal(m.error, null);
  assert.equal(m.status.productionRows, 20);
});

test('?scenario=incident&step=3 gives gate OPEN and 3 actions', () => {
  const c = make('?scenario=incident&step=3');
  assert.equal(c.actions().length, 3);
  assert.equal(c.getModel().status.gate, 'OPEN');
});

test('URL oddities never throw and fall back to defaults', () => {
  for (const s of ['?scenario=incident&step=abc', '?scenario=bogus', '?step=-4', '', '?scenario=incident&step=1', undefined, null, '?%%%', '?scenario=incident&step=99999']) {
    const c = make(s);
    assert.ok(c.actions().length >= 1, String(s));
    c.getModel();
  }
  assert.equal(make('?scenario=incident&step=abc').actions().length, 2);
  assert.equal(make('?scenario=incident&step=1').actions().length, 2);
  assert.equal(make('?scenario=bogus').scenario(), 'healthy');
  assert.equal(make('?scenario=bogus').actions().length, 1);
  assert.equal(make('?step=-4').actions().length, 1);
  assert.equal(make('?scenario=healthy&step=0').actions().length, 0);
});

test('incident run opens the gate; second run is rejected and not kept', () => {
  const c = make('');
  assert.deepEqual(J(c.dispatch({ type: 'setScenario', scenario: 'incident' })), { ok: true, notice: null });
  assert.equal(c.actions().length, 2);
  assert.equal(c.dispatch({ type: 'run' }).ok, true);
  const m = c.getModel();
  assert.equal(m.status.gate, 'OPEN');
  assert.equal(m.status.dlqTotal, 9);
  const n = c.actions().length;
  const r = c.dispatch({ type: 'run' });
  assert.equal(r.ok, false);
  assert.match(r.notice, /gate/);
  assert.equal(c.actions().length, n);
  assert.equal(c.getModel().notice, r.notice);
});

test('rejected, no-op and unknown reason are not kept', () => {
  const c = make('?scenario=incident&step=3');
  const n = c.actions().length;
  assert.equal(c.dispatch({ type: 'repair', dlqId: 'dlq-3-4' }).ok, false);
  assert.equal(c.actions().length, n);
  assert.deepEqual(J(c.dispatch({ type: 'repair', dlqId: 'dlq-3-2' })), { ok: true, notice: null });
  const n2 = c.actions().length, clock = c.getModel().timeline.slice();
  assert.deepEqual(J(c.dispatch({ type: 'repair', dlqId: 'dlq-3-2' })), { ok: true, notice: 'No change: row already repaired' });
  assert.equal(c.actions().length, n2);
  assert.deepEqual(J(c.getModel().timeline), J(clock));
  assert.deepEqual(J(c.dispatch({ type: 'ack' })), { ok: true, notice: null });
  assert.deepEqual(J(c.dispatch({ type: 'ack' })), { ok: true, notice: 'No change' });
  for (const reason of ['whatever', 'Not a listed reason']) {
    const r = c.dispatch({ type: 'discard', dlqId: 'dlq-3-4', reason });
    assert.deepEqual(J(r), { ok: false, notice: 'Unknown discard reason' });
    assert.equal(c.actions().length, n2 + 1);
  }
});

test('resolveRetry with open rows is blocked with the engine reason', () => {
  const c = make('?scenario=incident&step=3');
  const n = c.actions().length;
  const r = c.dispatch({ type: 'resolveRetry' });
  assert.deepEqual(J(r), { ok: false, notice: '9 DLQ rows unresolved' });
  assert.equal(c.actions().length, n);
});

test('full scripted incident via dispatch ends CLOSED with 76 rows', () => {
  const c = make('');
  c.dispatch({ type: 'setScenario', scenario: 'incident' });
  const map = { runBatch: 'run', repairRow: 'repair', discardRow: 'discard', ackAlert: 'ack', resolveRetry: 'resolveRetry', resolveAlert: 'resolveAlert' };
  for (const a of Engine.AUTOPLAY.incident.slice(2)) {
    const cmd = { type: map[a.type] };
    if (a.dlqId) cmd.dlqId = a.dlqId;
    const r = c.dispatch(cmd);
    assert.equal(r.ok, true, a.type + ' ' + r.notice);
    assert.equal(r.notice, null);
  }
  const m = c.getModel();
  assert.equal(m.status.gate, 'CLOSED');
  assert.equal(m.status.productionRows, 76);
  const reasons = c.actions().filter((a) => a.type === 'discardRow').map((a) => a.reason);
  assert.deepEqual(J(reasons), ['Missing patient ID', 'Physiologically impossible value', 'Malformed or suspicious input', 'Wrong unit, source must resend']);
});

test('setActions and reset', () => {
  const c = make('?scenario=incident&step=3');
  assert.equal(c.dispatch({ type: 'setActions', actions: [{ type: 'runBatch' }] }).ok, true);
  assert.equal(c.actions().length, 1);
  c.dispatch({ type: 'reset' });
  assert.equal(c.scenario(), 'incident');
  assert.equal(c.actions().length, 2);
  c.dispatch({ type: 'setScenario', scenario: 'healthy' });
  assert.equal(c.actions().length, 1);
  assert.equal(c.dispatch({ type: 'setScenario', scenario: 'bogus' }).ok, false);
  assert.equal(c.dispatch({ type: 'nonsense' }).ok, false);
  const a = c.actions(); a.push({ type: 'x' });
  assert.equal(c.actions().length, 1);
});

test('failed self-test shows error and disables every command', () => {
  const stub = Object.create(Engine);
  stub.selfTest = () => ({ passed: false, checks: [{ name: 'determinism_hash', ok: false }, { name: 'x', ok: true }] });
  const c = HQ.controller.createController(stub, '');
  assert.equal(c.getModel().error, 'Engine self-test failed: determinism_hash');
  const n = c.actions().length;
  for (const cmd of [{ type: 'run' }, { type: 'setScenario', scenario: 'incident' }, { type: 'reset' }]) {
    assert.deepEqual(J(c.dispatch(cmd)), { ok: false, notice: 'Controls are disabled.' });
  }
  assert.equal(c.actions().length, n);
  assert.equal(c.scenario(), 'healthy');
});

test('getModel does not mutate earlier models', () => {
  const c = make('?scenario=incident&step=3');
  const m1 = c.getModel();
  const snap = JSON.parse(JSON.stringify(m1));
  c.dispatch({ type: 'repair', dlqId: 'dlq-3-2' });
  c.dispatch({ type: 'run' });
  c.getModel();
  assert.deepEqual(JSON.parse(JSON.stringify(m1)), snap);
});

test('?scenario=healthy without a step opens the normal opening state; explicit step=0 is empty', () => {
  assert.equal(make('?scenario=healthy').actions().length, 1);
  assert.equal(make('?scenario=healthy&step=').actions().length, 1);
  assert.equal(make('?step=&scenario=healthy').actions().length, 1);
  assert.equal(make('?scenario=healthy&step=0').actions().length, 0);
  assert.equal(make('?scenario=incident').actions().length, 2);
});
