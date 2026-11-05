'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPipeline } = require('./helpers/load');

const { Engine, Pipeline } = loadPipeline();
const J = (x) => JSON.parse(JSON.stringify(x));
const make = (s, h, o) => Pipeline.controller.createController(Engine, s, h, o);
const enc = (a) => Engine.encodeActions(a);
const HQ = '../hq/';

function diverged() {
  const a = Engine.actionsForStep('incident', 16).map((x) => ({ ...x }));
  a[3] = { type: 'discardRow', dlqId: 'dlq-3-2', reason: Engine.DISCARD_REASONS[0] };
  return a;
}

test('default opens healthy with one export, no focus, no error', () => {
  const c = make('', '');
  assert.equal(c.scenario(), 'healthy');
  assert.equal(c.actions().length, 1);
  const m = c.getModel();
  assert.equal(m.scenario, 'healthy');
  assert.equal(m.error, '');
  assert.equal(m.focus, '');
  assert.equal(m.header.steps.n, 1);
  assert.equal(m.selectedBatch, 1);
  assert.equal(m.header.hqHref, '');
});

test('URL oddities never throw and give documented defaults', () => {
  const long = '?scenario=incident&a=' + 'r.'.repeat(1500) + 'r';
  const odd = ['?scenario=incident&step=abc', '?scenario=bogus', '?step=-4', '', undefined, null, '?%%%', 5, {},
    '?scenario=incident&step=99999', '?scenario=incident&step=', '?scenario=incident&a=garbage', '?scenario=incident&a=r.r.zz',
    '?scenario=incident&a=r.r.p:dlq-', '?scenario=incident&a=%E0%A4%A', '?scenario=incident&a=', long,
    '?scenario=incident&step=3&batch=99', '?scenario=incident&step=3&batch=0', '?scenario=incident&step=3&batch=',
    '?scenario=incident&scenario=healthy&step=2&step=9', '?scenario=incident&step=3&step=4', '?batch=1&batch=2', '&&&', '?=&='];
  for (const s of odd) {
    for (const h of ['', '#unknown-id', '#', '#dlq-', undefined, null, '#%%', 7]) {
      const c = make(s, h);
      assert.ok(c.actions().length >= 0, String(s));
      c.getModel();
    }
  }
  assert.equal(make('?scenario=incident&step=abc').actions().length, 2);
  assert.equal(make('?scenario=incident&step=').actions().length, 2);
  assert.equal(make('?scenario=bogus').scenario(), 'healthy');
  assert.equal(make('?scenario=bogus').actions().length, 1);
  assert.equal(make('?step=-4').actions().length, 1);
  assert.equal(make('?scenario=healthy').actions().length, 1);
  assert.equal(make('?scenario=healthy&step=').actions().length, 1);
  assert.equal(make('?scenario=healthy&step=3').actions().length, 3);
  assert.equal(make('?scenario=incident&step=99999').actions().length, 16);
});

test('a= garbage, truncated, over 2000 characters or malformed is ignored', () => {
  for (const q of ['garbage', 'r.r.zz', 'r.p:dlq-3', '%E0%A4%A', '', 'r.'.repeat(1500) + 'r', 'R.R']) {
    const c = make('?scenario=incident&step=3&a=' + q);
    assert.equal(c.actions().length, 3, q);
    assert.equal(c.getModel().header.steps.n, 3);
  }
});

test('repeated parameters follow the engine parser: first a= and first batch= win', () => {
  const c = make('?scenario=incident&step=3&batch=2&batch=1');
  assert.equal(c.getModel().selectedBatch, 2);
  const d = make('?scenario=incident&a=' + enc(Engine.actionsForStep('incident', 4)) + '&a=r.r');
  assert.equal(d.actions().length, 4);
});

test('?scenario=incident&step=3#dlq-3-13 focuses that row; with or without #', () => {
  assert.equal(make('?scenario=incident&step=3', '#dlq-3-13').getModel().focus, 'dlq-3-13');
  assert.equal(make('?scenario=incident&step=3', 'dlq-3-13').getModel().focus, 'dlq-3-13');
  assert.equal(make('?scenario=incident&step=3', '#stage-storage').getModel().focus, 'stage-storage');
  assert.equal(make('', '#stage-storage').getModel().focus, 'stage-storage');
});

test('unknown focus targets give no focus', () => {
  for (const h of ['#dlq-9-9', '#unknown-id', '#', '', '#dlq-3-13', '#stage-bronze', '#__proto__', '#toString']) {
    // dlq-3-13 does not exist in healthy.
    assert.equal(make('?scenario=healthy&step=2', h).getModel().focus, '', h);
  }
  assert.equal(make('?scenario=incident&step=3', '#dlq-9-9').getModel().focus, '');
  assert.equal(make('?scenario=incident&step=2', '#dlq-3-13').getModel().focus, '');
});

test('a= equal to a scripted prefix opens that step', () => {
  const a = Engine.actionsForStep('incident', 7);
  const c = make('?scenario=incident&a=' + enc(a));
  assert.deepEqual(J(c.actions()), a);
  assert.equal(c.getModel().header.steps.n, 7);
  assert.deepEqual(J(Engine.getState('incident', c.actions())), J(Engine.getState('incident', a)));
});

test('a diverged a= reproduces the exact HQ state', () => {
  const a = diverged();
  assert.equal(Engine.stepForActions('incident', a), null);
  const c = make('?scenario=incident&a=' + enc(a));
  assert.deepEqual(J(c.actions()), a);
  assert.deepEqual(J(Engine.getState('incident', c.actions())), J(Engine.getState('incident', a)));
  const m = c.getModel();
  const want = Engine.getState('incident', a);
  assert.equal(m.header.steps.n, null);
  assert.equal(m.header.steps.label, 'Custom state from HQ (16 actions)');
  assert.equal(m.dlq.length, want.dlq.length);
  assert.equal(m.medallion.silver, want.productionRows);
});

test('a= without a valid scenario is ignored', () => {
  const c = make('?a=' + enc(diverged()));
  assert.equal(c.scenario(), 'healthy');
  assert.equal(c.actions().length, 1);
});

test('batch param selects an existing batch, else the latest', () => {
  assert.equal(make('?scenario=incident&step=3&batch=1').getModel().selectedBatch, 1);
  assert.equal(make('?scenario=incident&step=3&batch=99').getModel().selectedBatch, 3);
  assert.equal(make('?scenario=incident&step=3&batch=0').getModel().selectedBatch, 3);
  assert.equal(make('?scenario=incident&step=3&batch=-1').getModel().selectedBatch, 3);
  assert.equal(make('?scenario=healthy&step=0&batch=1').getModel().selectedBatch, null);
});

test('hqLink: empty without hqBase, step form when scripted, a= form when diverged', () => {
  assert.equal(make('?scenario=incident&step=3').getModel().header.hqHref, '');
  const s = make('?scenario=incident&step=3', '', { hqBase: HQ });
  assert.equal(s.getModel().header.hqHref, HQ + '?scenario=incident&step=3');
  assert.equal(s.getModel().dlq[0].hqHref, HQ + '?scenario=incident&step=3');
  const a = diverged();
  const d = make('?scenario=incident&a=' + enc(a), '', { hqBase: HQ });
  assert.equal(d.getModel().header.hqHref, HQ + '?scenario=incident&a=' + enc(a));
  assert.equal(make('', '', { hqBase: HQ }).getModel().header.hqHref, HQ + '?scenario=healthy&step=1');
  assert.equal(make('', '', { hqBase: 5 }).getModel().header.hqHref, '');
});

test('hqLink falls back to the scenario only when the actions cannot be encoded', () => {
  const stub = Object.assign({}, Engine, { encodeActions: () => null });
  const c = Pipeline.controller.createController(stub, '?scenario=incident&a=' + enc(diverged()), '', { hqBase: HQ });
  assert.equal(c.getModel().header.hqHref, HQ + '?scenario=incident');
});

test('stepping respects both bounds and says so', () => {
  const c = make('?scenario=incident&step=2');
  const r = c.dispatch({ type: 'back' });
  assert.deepEqual(J(r), { ok: true, notice: 'Already at the first step' });
  assert.equal(c.actions().length, 2);
  assert.equal(c.getModel().notice, 'Already at the first step');
  const h = make('?scenario=healthy&step=0');
  assert.equal(h.dispatch({ type: 'back' }).notice, 'Already at the first step');
  assert.equal(h.actions().length, 0);
  const l = make('?scenario=incident&step=16');
  assert.deepEqual(J(l.dispatch({ type: 'next' })), { ok: true, notice: 'Already at the last step' });
  assert.equal(l.actions().length, 16);
  const n = make('?scenario=incident&step=3');
  assert.deepEqual(J(n.dispatch({ type: 'next' })), { ok: true, notice: null });
  assert.equal(n.actions().length, 4);
  assert.equal(n.getModel().notice, '');
  assert.equal(n.dispatch({ type: 'back' }).ok, true);
  assert.equal(n.actions().length, 3);
});

test('twenty rapid next commands stop at the last step', () => {
  const c = make('?scenario=incident&step=3');
  for (let i = 0; i < 20; i++) assert.equal(c.dispatch({ type: 'next' }).ok, true);
  assert.equal(c.actions().length, 16);
  assert.equal(c.getModel().header.canNext, false);
  const h = make('');
  for (let i = 0; i < 20; i++) h.dispatch({ type: 'next' });
  assert.equal(h.actions().length, 4);
  for (let i = 0; i < 20; i++) h.dispatch({ type: 'back' });
  assert.equal(h.actions().length, 0);
});

test('stepping keeps the selected batch if it exists, else the latest', () => {
  const c = make('?scenario=incident&step=3&batch=1');
  c.dispatch({ type: 'next' });
  assert.equal(c.getModel().selectedBatch, 1);
  const d = make('?scenario=incident&step=3&batch=3');
  d.dispatch({ type: 'back' });
  assert.equal(d.getModel().selectedBatch, 2);
  d.dispatch({ type: 'next' });
  assert.equal(d.getModel().selectedBatch, 3);
});

test('stepping from a diverged state snaps to the scripted prefix without moving', () => {
  const a = diverged();
  for (const t of ['back', 'next']) {
    const c = make('?scenario=incident&a=' + enc(a));
    const r = c.dispatch({ type: t });
    assert.deepEqual(J(r), { ok: true, notice: 'Showing the scripted run at step 3' });
    assert.equal(c.actions().length, 3);
    assert.equal(c.getModel().header.steps.n, 3);
    assert.equal(c.getModel().notice, 'Showing the scripted run at step 3');
    assert.equal(c.dispatch({ type: 'next' }).notice, null);
    assert.equal(c.actions().length, 4);
  }
});

test('snap never goes below the floor', () => {
  const c = make('?scenario=incident&a=' + enc([{ type: 'ackAlert' }]));
  assert.equal(c.getModel().header.steps.n, null);
  assert.equal(c.dispatch({ type: 'next' }).notice, 'Showing the scripted run at step 2');
  assert.equal(c.actions().length, 2);
});

test('snap from the full script plus a stray action', () => {
  const a = Engine.actionsForStep('incident', 16).concat([{ type: 'ackAlert' }]);
  const c = make('?scenario=incident&a=' + enc(a));
  assert.equal(c.getModel().header.steps.n, null);
  assert.equal(c.dispatch({ type: 'back' }).notice, 'Showing the scripted run at step 16');
  assert.equal(c.actions().length, 16);
});

test('batch selection rules', () => {
  const c = make('?scenario=incident&step=3', '#dlq-3-13');
  const before = c.actions();
  assert.deepEqual(J(c.dispatch({ type: 'batch', n: 99 })), { ok: false, notice: 'Batch 99 has not run' });
  assert.equal(c.getModel().selectedBatch, 3);
  assert.equal(c.getModel().focus, 'dlq-3-13');
  assert.equal(c.getModel().notice, 'Batch 99 has not run');
  for (const n of [0, -1, 1.5, 'x', null, undefined, NaN]) assert.equal(c.dispatch({ type: 'batch', n }).ok, false);
  assert.deepEqual(J(c.actions()), J(before));
  assert.deepEqual(J(c.dispatch({ type: 'batch', n: 1 })), { ok: true, notice: null });
  assert.equal(c.getModel().selectedBatch, 1);
  assert.equal(c.getModel().focus, '');
  assert.equal(c.dispatch({ type: 'batch', n: '2' }).ok, true);
  assert.equal(c.getModel().selectedBatch, 2);
  assert.equal(c.getModel().batches.chips.filter((x) => x.selected)[0].n, 2);
});

test('scenario switch resets to the opening state, clears focus and the diverged state', () => {
  const c = make('?scenario=incident&a=' + enc(diverged()), '#dlq-3-13', { hqBase: HQ });
  assert.equal(c.getModel().focus, 'dlq-3-13');
  assert.deepEqual(J(c.dispatch({ type: 'scenario', scenario: 'incident' })), { ok: true, notice: null });
  assert.equal(c.actions().length, 2);
  assert.equal(c.getModel().focus, '');
  assert.equal(c.getModel().header.steps.n, 2);
  c.dispatch({ type: 'scenario', scenario: 'healthy' });
  assert.equal(c.scenario(), 'healthy');
  assert.equal(c.actions().length, 1);
  assert.equal(c.getModel().selectedBatch, 1);
  assert.equal(c.dispatch({ type: 'scenario', scenario: 'bogus' }).ok, false);
  assert.equal(c.scenario(), 'healthy');
  assert.equal(c.dispatch({ type: 'nope' }).ok, false);
  assert.equal(c.dispatch(null).ok, false);
  assert.equal(c.dispatch(undefined).ok, false);
});

test('a link for one scenario never loads the other scenarios state', () => {
  const c = make('?scenario=healthy&step=2&a=' + enc(Engine.actionsForStep('incident', 3)));
  assert.equal(c.scenario(), 'healthy');
  assert.equal(c.getModel().scenario, 'healthy');
});

test('focus survives stepping only while it still exists', () => {
  const c = make('?scenario=incident&step=3', '#dlq-3-13');
  c.dispatch({ type: 'next' });
  assert.equal(c.getModel().focus, 'dlq-3-13');
  c.dispatch({ type: 'back' });
  c.dispatch({ type: 'back' });
  assert.equal(c.getModel().focus, '');
});

test('tiering commands go through Pipeline.viewmodel.tiering and keep the last valid result', () => {
  const c = make('');
  const d = c.getModel().storage;
  assert.equal(d.valid, true);
  assert.deepEqual(J(d.fields), { hotToWarmDays: '30', warmToColdDays: '180', retentionDays: '2555', dailyGB: '18' });
  assert.equal(c.dispatch({ type: 'setTiering', field: 'hotToWarmDays', value: '45' }).ok, true);
  const good = c.getModel().storage;
  assert.equal(good.valid, true);
  assert.equal(good.fields.hotToWarmDays, '45');
  assert.notDeepEqual(good.result, d.result);
  for (const v of ['', '-3', 'abc', '99999999999', '500', '1e3', 'NaN', '  ']) {
    c.dispatch({ type: 'setTiering', field: 'hotToWarmDays', value: v });
    const m = c.getModel().storage;
    assert.equal(m.valid, false, v);
    assert.ok(m.message.length > 0);
    assert.deepEqual(m.result, good.result);
    assert.equal(m.fields.hotToWarmDays, v);
  }
  c.dispatch({ type: 'setTiering', field: 'hotToWarmDays', value: '60' });
  assert.equal(c.getModel().storage.valid, true);
  assert.equal(c.dispatch({ type: 'setTiering', field: 'bogus', value: '1' }).ok, false);
  assert.equal(c.dispatch({ type: 'setTiering', field: '__proto__', value: '1' }).ok, false);
  assert.equal(c.dispatch({ type: 'setTiering', field: 'dailyGB', value: 40 }).ok, true);
  assert.equal(c.getModel().storage.fields.dailyGB, '40');
  c.dispatch({ type: 'setTiering', field: 'warmToColdDays', value: '10' });
  assert.equal(c.getModel().storage.valid, false);
  assert.equal(c.dispatch({ type: 'resetTiering' }).ok, true);
  const m = c.getModel().storage;
  assert.equal(m.valid, true);
  assert.deepEqual(J(m.fields), { hotToWarmDays: '30', warmToColdDays: '180', retentionDays: '2555', dailyGB: '18' });
  assert.deepEqual(m.result, d.result);
});

test('stepping does not touch tiering inputs', () => {
  const c = make('');
  c.dispatch({ type: 'setTiering', field: 'dailyGB', value: '77' });
  c.dispatch({ type: 'next' });
  assert.equal(c.getModel().storage.fields.dailyGB, '77');
});

test('self-test failure disables every command and shows the error', () => {
  const stub = Object.assign({}, Engine, { selfTest: () => ({ passed: false, checks: [{ name: 'alpha', ok: true }, { name: 'beta', ok: false }, { name: 'gamma', ok: false }] }) });
  const c = Pipeline.controller.createController(stub, '?scenario=incident&step=3', '');
  assert.equal(c.getModel().error, 'Engine self-test failed: beta, gamma');
  const before = c.actions();
  for (const cmd of [{ type: 'next' }, { type: 'back' }, { type: 'scenario', scenario: 'healthy' }, { type: 'batch', n: 1 },
    { type: 'setTiering', field: 'dailyGB', value: '5' }, { type: 'resetTiering' }, null]) {
    assert.deepEqual(J(c.dispatch(cmd)), { ok: false, notice: 'Controls are disabled.' });
  }
  assert.deepEqual(J(c.actions()), J(before));
  assert.equal(c.scenario(), 'incident');
  assert.equal(c.getModel().storage.fields.dailyGB, '18');
  const thrower = Object.assign({}, Engine, { selfTest: () => { throw new Error('boom'); } });
  assert.match(Pipeline.controller.createController(thrower, '').getModel().error, /^Engine self-test failed: boom/);
  assert.equal(Pipeline.controller.createController(Engine, '').getModel().error, '');
});

test('getModel does not mutate earlier models', () => {
  const c = make('?scenario=incident&step=3', '', { hqBase: HQ });
  const m1 = c.getModel();
  const snap1 = JSON.stringify(m1);
  c.dispatch({ type: 'next' });
  c.dispatch({ type: 'setTiering', field: 'hotToWarmDays', value: 'zzz' });
  c.dispatch({ type: 'batch', n: 1 });
  const m2 = c.getModel();
  assert.equal(JSON.stringify(m1), snap1);
  assert.notEqual(JSON.stringify(m2), snap1);
  m2.storage.fields.dailyGB = 'tampered';
  m2.storage.result.monthlyCostText = 'tampered';
  m2.header.steps.n = 99;
  assert.equal(c.getModel().storage.fields.dailyGB, '18');
  assert.notEqual(c.getModel().storage.result.monthlyCostText, 'tampered');
  assert.equal(c.getModel().header.steps.n, 4);
});

test('actions() returns a copy', () => {
  const c = make('?scenario=incident&step=3');
  const a = c.actions();
  a.push({ type: 'ackAlert' });
  a[0].type = 'x';
  assert.equal(c.actions().length, 3);
  assert.equal(c.actions()[0].type, 'runBatch');
});

test('model renders through the render module for scripted and diverged states', () => {
  for (const s of ['', '?scenario=incident&step=16', '?scenario=incident&a=' + enc(diverged())]) {
    const r = Pipeline.render.renderRegions(make(s, '', { hqBase: HQ }).getModel());
    assert.ok(typeof r.header === 'string' && r.header.length > 0);
  }
  const r = Pipeline.render.renderRegions(make('?scenario=incident&a=' + enc(diverged())).getModel());
  assert.ok(r.header.includes('Custom state from HQ (16 actions)'));
});
