'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadBrain } = require('./helpers/load');

const L = loadBrain();
const E = L.Engine;
const J = (x) => JSON.parse(JSON.stringify(x));
const META = { hqBase: '../hq/', pipelineBase: '../pipeline/' };
const IDS = E.buildPatientPool().map((p) => p.patient_id);
const make = (search, hash, engine) => L.Brain.controller.createController(engine || E, search, hash, META);
const model = (c) => J(c.getModel());
const steps = (c) => model(c).header.steps;

test('opening states: no parameters is healthy step 1; incident step 3; garbage falls back', () => {
  assert.deepStrictEqual([steps(make('')).n, model(make('')).header.scenario], [1, 'healthy']);
  const inc = make('?scenario=incident&step=3');
  assert.deepStrictEqual([model(inc).header.scenario, steps(inc).n], ['incident', 3]);
  assert.strictEqual(steps(make('?scenario=incident&step=abc')).n, E.PRELUDE.incident.length);
  assert.strictEqual(steps(make('?scenario=nope&step=9')).n, 1);
  assert.strictEqual(model(make('?scenario=nope')).header.scenario, 'healthy');
  [undefined, null, 5, {}, '?', '?a=%%%', '?scenario=incident&a=zzz'].forEach((s) => {
    assert.doesNotThrow(() => make(s).getModel());
    assert.ok(model(make(s)).header.title);
  });
});

test('a diverged a= state is reproduced and labelled; a bad a= falls back to the step', () => {
  const c = make('?scenario=incident&a=r.r.p:dlq-3-2.r');
  assert.strictEqual(steps(c).n, null);
  assert.strictEqual(steps(c).label, 'Custom state from HQ (4 actions)');
  assert.strictEqual(model(c).header.hqHref, '../hq/?scenario=incident&a=r.r.p:dlq-3-2.r');
  const bad = make('?scenario=incident&a=r.r.x&step=3');
  assert.strictEqual(steps(bad).n, 3);
});

test('repeated parameters follow the engine link parser (a= repeats: the first wins)', () => {
  const q = '?scenario=incident&step=3&scenario=healthy&step=1';
  const p = E.parseLinkParams(q);
  const c = make(q);
  assert.strictEqual(model(c).header.scenario, p.scenario);
  const a2 = make('?scenario=incident&a=r.r.p:dlq-3-2.r&a=r.r');
  assert.strictEqual(model(a2).header.steps.label, 'Custom state from HQ (4 actions)');
});

test('hash targets: the six stage ids only', () => {
  ['stage-contract', 'stage-phi', 'stage-lineage', 'stage-access', 'stage-retention', 'stage-erasure'].forEach((id) => {
    assert.strictEqual(make('', '#' + id).focusTarget, id);
    assert.strictEqual(make('', id).focusTarget, id);
  });
  ['#kpi-bed-occupancy', '#stage-check', '#nope', '', '#', undefined, 5].forEach((h) => assert.strictEqual(make('', h).focusTarget, '', String(h)));
});

test('Back and Next step through the script and stop at the ends', () => {
  const c = make('?scenario=incident&step=3');
  c.dispatch({ type: 'next' });
  assert.strictEqual(steps(c).n, 4);
  c.dispatch({ type: 'back' });
  c.dispatch({ type: 'back' });
  assert.strictEqual(steps(c).n, 2);
  c.dispatch({ type: 'back' });
  assert.strictEqual(steps(c).n, 2);
  for (let i = 0; i < 40; i++) c.dispatch({ type: 'next' });
  assert.strictEqual(steps(c).n, E.AUTOPLAY.incident.length);
});

test('from a diverged state, Back snaps to the nearest scripted step', () => {
  const c = make('?scenario=incident&a=r.r.p:dlq-3-2.r');
  c.dispatch({ type: 'back' });
  assert.strictEqual(typeof steps(c).n, 'number');
});

test('the scenario command switches scenario and resets the local state and the focus target; the same scenario keeps both', () => {
  const c = make('?scenario=incident&step=3', '#stage-phi');
  c.dispatch({ type: 'hold' });
  c.dispatch({ type: 'node', id: 'patient_id' });
  c.dispatch({ type: 'scenario', value: 'incident' });
  assert.strictEqual(model(c).retention.legalHold.on, true);
  assert.strictEqual(c.focusTarget, 'stage-phi');
  c.dispatch({ type: 'scenario', value: 'healthy' });
  const m = model(c);
  assert.strictEqual(m.header.scenario, 'healthy');
  assert.strictEqual(m.retention.legalHold.on, false);
  assert.strictEqual(m.lineage.selected, '');
  assert.strictEqual(c.focusTarget, '');
  ['nope', 5, null, undefined].forEach((v) => { c.dispatch({ type: 'scenario', value: v }); assert.strictEqual(model(c).header.scenario, 'healthy'); });
});

test('node, subject, erase, reset, hold and list commands update the model', () => {
  const c = make('?scenario=incident&step=3');
  c.dispatch({ type: 'node', id: 'vital_value' });
  assert.strictEqual(model(c).lineage.selected, 'vital_value');
  c.dispatch({ type: 'node', id: 'nope' });
  assert.strictEqual(model(c).lineage.selected, 'vital_value');
  c.dispatch({ type: 'toggleList' });
  assert.strictEqual(model(c).lineage.showList, true);
  c.dispatch({ type: 'selectSubject', id: IDS[0] });
  assert.strictEqual(model(c).erasure.selected, IDS[0]);
  c.dispatch({ type: 'erase' });
  assert.deepStrictEqual(model(c).erasure.erased, [IDS[0]]);
  assert.strictEqual(model(c).message, 'Erased ' + IDS[0]);
  assert.strictEqual(model(c).access.rows[0].action, 'ERASE');
  c.dispatch({ type: 'resetErasures' });
  assert.deepStrictEqual(model(c).erasure.erased, []);
  c.dispatch({ type: 'hold' });
  assert.strictEqual(model(c).retention.legalHold.on, true);
  c.dispatch({ type: 'erase' });
  assert.strictEqual(model(c).message, 'Erasure blocked: legal hold is on.');
  c.dispatch({ type: 'hold' });
  assert.strictEqual(model(c).retention.legalHold.on, false);
});

test('stepping keeps the erasures, the selected node and the hold', () => {
  const c = make('?scenario=incident&step=3');
  c.dispatch({ type: 'selectSubject', id: IDS[1] });
  c.dispatch({ type: 'erase' });
  c.dispatch({ type: 'node', id: 'patient_id' });
  c.dispatch({ type: 'hold' });
  for (let i = 0; i < 3; i++) c.dispatch({ type: 'next' });
  c.dispatch({ type: 'back' });
  const m = model(c);
  assert.deepStrictEqual(m.erasure.erased, [IDS[1]]);
  assert.strictEqual(m.lineage.selected, 'patient_id');
  assert.strictEqual(m.retention.legalHold.on, true);
  m.erasure.checks.forEach((x) => assert.strictEqual(x.pass, true));
});

test('junk commands never throw and change nothing', () => {
  const c = make('?scenario=incident&step=3');
  const before = JSON.stringify(c.getModel());
  [undefined, null, 5, 'x', [], {}, { type: 5 }, { type: 'bogus' }, { type: '__proto__' }, { type: 'scenario' }].forEach((cmd) => {
    assert.doesNotThrow(() => c.dispatch(cmd));
  });
  assert.strictEqual(JSON.stringify(c.getModel()), before);
});

test('a broken engine shows the notice and every command does nothing', () => {
  const broken = Object.assign({}, E, { selfTest: () => ({ passed: false, checks: [{ name: 'x', ok: false }] }) });
  const c = make('?scenario=incident&step=3', '#stage-phi', broken);
  const before = JSON.stringify(c.getModel());
  assert.ok(/self-test failed/.test(c.getModel().notice));
  assert.strictEqual(c.focusTarget, '');
  [{ type: 'next' }, { type: 'hold' }, { type: 'node', id: 'patient_id' }, { type: 'scenario', value: 'healthy' }].forEach((cmd) => c.dispatch(cmd));
  assert.strictEqual(JSON.stringify(c.getModel()), before);
});

test('an engine that throws during a command becomes an engine error notice and inert controls', () => {
  let boom = false;
  const flaky = Object.assign({}, E, { stepForActions: (...a) => { if (boom) throw new Error('boom'); return E.stepForActions(...a); } });
  const c = make('?scenario=incident&step=3', '', flaky);
  boom = true;
  c.dispatch({ type: 'next' });
  assert.ok(/Engine error: boom/.test(c.getModel().notice));
  boom = false;
  c.dispatch({ type: 'hold' });
  assert.strictEqual(c.getModel().retention.legalHold.on, false);
});
