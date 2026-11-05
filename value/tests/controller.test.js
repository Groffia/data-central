'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadValue } = require('./helpers/load');

const { Engine, Value } = loadValue();
const J = (x) => JSON.parse(JSON.stringify(x));
const make = (s, h, o) => Value.controller.createController(Engine, s, h, o);
const enc = (a) => Engine.encodeActions(a);
const HQ = '../hq/';
const PL = '../pipeline/';
const AVR = 'Abnormal Vital Rate';
const FLOOR_I = Engine.PRELUDE.incident.length;

function diverged() {
  const a = Engine.actionsForStep('incident', 16).map((x) => ({ ...x }));
  a[3] = { type: 'discardRow', dlqId: 'dlq-3-2', reason: Engine.DISCARD_REASONS[0] };
  return a;
}
const steps = (c) => c.getModel().header.steps;
const tile = (c, id) => c.getModel().kpis.tiles.filter((t) => t.id === id)[0];
const metric = (c, name) => c.getModel().definitions.metrics.filter((x) => x.name === name)[0];
const counter = (c) => { const k = { n: 0 }; c.subscribe(() => { k.n++; }); return k; };

test('default opens healthy at the opening state, no focus, no notice', () => {
  const c = make('', '');
  const m = c.getModel();
  assert.equal(m.header.scenario, 'healthy');
  assert.equal(steps(c).n, 1);
  assert.equal(m.notice, null);
  assert.equal(c.focusTarget, '');
  assert.equal(m.definitions.governed, true);
});

test('URL oddities never throw and give the documented defaults', () => {
  const long = '?scenario=incident&a=' + 'r.'.repeat(1500) + 'r';
  const odd = ['?scenario=incident&step=abc', '?scenario=bogus', '?step=-4', '', undefined, null, '?%%%', 5, {},
    '?scenario=incident&step=99999', '?scenario=incident&step=', '?scenario=incident&a=garbage', '?scenario=incident&a=r.r.zz',
    '?scenario=incident&a=r.r.p:dlq-', '?scenario=incident&a=%E0%A4%A', '?scenario=incident&a=', long,
    '?scenario=incident&scenario=healthy&step=2&step=9', '?scenario=incident&step=3&step=4', '&&&', '?=&='];
  for (const s of odd) {
    for (const h of ['', '#unknown-id', '#', '#kpi-', undefined, null, '#%%', 7]) {
      const c = make(s, h);
      assert.equal(c.getModel().notice, null, String(s));
      assert.equal(c.focusTarget, '');
    }
  }
  assert.equal(steps(make('?scenario=incident&step=abc')).n, FLOOR_I);
  assert.equal(steps(make('?scenario=incident&step=')).n, FLOOR_I);
  assert.equal(make('?scenario=bogus').getModel().header.scenario, 'healthy');
  assert.equal(steps(make('?scenario=bogus')).n, 1);
  assert.equal(steps(make('?step=-4')).n, 1);
  assert.equal(steps(make('?scenario=healthy')).n, 1);
  assert.equal(steps(make('?scenario=healthy&step=3')).n, 3);
  assert.equal(steps(make('?scenario=incident&step=99999')).n, 16);
});

test('a= garbage, truncated, over 2000 characters or malformed is ignored', () => {
  for (const q of ['garbage', 'r.r.zz', 'r.p:dlq-3', '%E0%A4%A', '', 'r.'.repeat(1500) + 'r', 'R.R']) {
    assert.equal(steps(make('?scenario=incident&step=3&a=' + q)).n, 3, q);
  }
});

test('repeated parameters follow the engine parser', () => {
  const d = make('?scenario=incident&a=' + enc(Engine.actionsForStep('incident', 4)) + '&a=r.r');
  assert.equal(steps(d).n, 4);
});

test('a link built for one scenario never loads the other scenarios state', () => {
  const c = make('?scenario=healthy&step=2&a=' + enc(Engine.actionsForStep('incident', 3)));
  assert.equal(c.getModel().header.scenario, 'healthy');
  const d = make('?a=' + enc(diverged()));
  assert.equal(d.getModel().header.scenario, 'healthy');
  assert.equal(steps(d).n, 1);
});

test('focus target is the hash only when it is a known id, with or without #', () => {
  for (const id of ['kpi-bed-occupancy', 'kpi-abnormal-vital-rate', 'kpi-avg-length-of-stay', 'kpi-30-day-readmission-rate', 'stage-definitions', 'stage-check']) {
    assert.equal(make('', '#' + id).focusTarget, id);
    assert.equal(make('?scenario=incident&step=3', id).focusTarget, id);
  }
  for (const h of ['#kpi-unknown', '#unknown-id', '#', '', '#__proto__', '#toString', '#stage-storage', '#kpi-', undefined, null, 5]) {
    assert.equal(make('', h).focusTarget, '', String(h));
  }
});

test('a= equal to a scripted prefix opens that step; a diverged a= opens as Pipeline does', () => {
  assert.equal(steps(make('?scenario=incident&a=' + enc(Engine.actionsForStep('incident', 7)))).n, 7);
  for (const q of [enc(diverged()), 'r.r.r.p:dlq-3-2.d:dlq-3-4:1']) {
    const c = make('?scenario=incident&a=' + q, '', { hqBase: HQ });
    const m = c.getModel();
    assert.equal(m.header.steps.n, null);
    assert.match(m.header.steps.label, /^Custom state from HQ \(\d+ actions\)$/);
    assert.equal(m.notice, null);
  }
  const c = make('?scenario=incident&a=' + enc(diverged()), '', { hqBase: HQ });
  assert.equal(c.getModel().header.hqHref, HQ + '?scenario=incident&a=' + enc(diverged()));
});

test('links come from opts and reflect the state', () => {
  const c = make('?scenario=incident&step=3', '', { hqBase: HQ, pipelineBase: PL });
  assert.equal(c.getModel().header.hqHref, HQ + '?scenario=incident&step=3');
  assert.equal(c.getModel().header.pipelineHref, PL + '?scenario=incident&step=3');
  c.dispatch({ type: 'next' });
  assert.equal(c.getModel().header.hqHref, HQ + '?scenario=incident&step=4');
  assert.equal(make('', '').getModel().header.hqHref, null);
});

test('stepping respects both bounds and rapid next stays within them', () => {
  const c = make('?scenario=incident&step=2');
  const n = counter(c);
  c.dispatch({ type: 'back' });
  assert.equal(steps(c).n, 2);
  assert.equal(n.n, 0);
  const h = make('?scenario=healthy&step=0');
  h.dispatch({ type: 'back' });
  assert.equal(steps(h).n, 0);
  const l = make('?scenario=incident&step=3');
  for (let i = 0; i < 40; i++) l.dispatch({ type: 'next' });
  assert.equal(steps(l).n, 16);
  assert.equal(l.getModel().header.canNext, false);
  for (let i = 0; i < 40; i++) l.dispatch({ type: 'back' });
  assert.equal(steps(l).n, 2);
  const g = make('');
  for (let i = 0; i < 20; i++) g.dispatch({ type: 'next' });
  assert.equal(steps(g).n, 4);
});

test('stepping from a diverged state snaps to the scripted run', () => {
  for (const t of ['back', 'next']) {
    const c = make('?scenario=incident&a=' + enc(diverged()));
    const k = counter(c);
    c.dispatch({ type: t });
    assert.equal(steps(c).n, 3);
    assert.equal(k.n, 1);
    c.dispatch({ type: 'next' });
    assert.equal(steps(c).n, 4);
  }
  const f = make('?scenario=incident&a=' + enc([{ type: 'ackAlert' }]));
  f.dispatch({ type: 'next' });
  assert.equal(steps(f).n, 2);
});

test('scenario switch resets actions, definitions, open tables and focus', () => {
  const c = make('?scenario=incident&step=3', 'kpi-bed-occupancy');
  assert.equal(c.focusTarget, 'kpi-bed-occupancy');
  c.dispatch({ type: 'mode', governed: false });
  c.dispatch({ type: 'select', metric: AVR, definitionId: 'strict_thresholds' });
  c.dispatch({ type: 'publish', metric: AVR });
  c.dispatch({ type: 'tableToggle', kpi: 'bed-occupancy' });
  assert.equal(c.getModel().trends[0].tableOpen, true);
  const k = counter(c);
  c.dispatch({ type: 'scenario', value: 'healthy' });
  assert.equal(k.n, 1);
  const m = c.getModel();
  assert.equal(m.header.scenario, 'healthy');
  assert.equal(m.header.steps.n, 1);
  assert.equal(m.definitions.governed, true);
  assert.equal(m.definitions.changelog.length, 0);
  assert.ok(m.trends.every((t) => t.tableOpen === false));
  assert.equal(c.focusTarget, '');
  c.dispatch({ type: 'scenario', value: 'incident' });
  assert.equal(steps(c).n, FLOOR_I);
  const same = make('?scenario=incident&step=9');
  same.dispatch({ type: 'scenario', value: 'incident' });
  assert.equal(steps(same).n, FLOOR_I);
});

test('publish then back keeps definitions but changes freshness and held', () => {
  const c = make('?scenario=incident&step=3');
  assert.equal(tile(c, 'abnormal-vital-rate').held, true);
  c.dispatch({ type: 'select', metric: AVR, definitionId: 'strict_thresholds' });
  c.dispatch({ type: 'publish', metric: AVR });
  assert.equal(metric(c, AVR).publishedId, 'strict_thresholds');
  const fresh3 = tile(c, 'abnormal-vital-rate').freshness;
  assert.notEqual(tile(c, 'abnormal-vital-rate').heldText, '');
  c.dispatch({ type: 'back' });
  assert.equal(steps(c).n, 2);
  assert.equal(tile(c, 'abnormal-vital-rate').held, false);
  assert.equal(tile(c, 'abnormal-vital-rate').heldText, '');
  assert.equal(tile(c, 'abnormal-vital-rate').freshness, fresh3);
  assert.equal(metric(c, AVR).publishedId, 'strict_thresholds');
  assert.equal(metric(c, AVR).version, 2);
  c.dispatch({ type: 'next' });
  assert.equal(tile(c, 'abnormal-vital-rate').held, true);
  assert.equal(metric(c, AVR).publishedId, 'strict_thresholds');
});

test('definition commands never change the step or the engine actions', () => {
  const c = make('?scenario=incident&a=' + enc(diverged()));
  const link = c.getModel().header.hqHref;
  for (const cmd of [{ type: 'mode', governed: false }, { type: 'select', metric: AVR, definitionId: 'strict_thresholds' },
    { type: 'publish', metric: AVR }, { type: 'rollback', metric: AVR }, { type: 'reset' }]) c.dispatch(cmd);
  assert.equal(c.getModel().header.steps.n, null);
  assert.equal(steps(c).label, 'Custom state from HQ (16 actions)');
  assert.equal(c.getModel().header.hqHref, link);
});

test('publish, rollback, select, reset, mode, tableToggle, stepping each notify once', () => {
  const c = make('?scenario=incident&step=3');
  const k = counter(c);
  const run = (cmd) => { const b = k.n; c.dispatch(cmd); assert.equal(k.n - b, 1, JSON.stringify(cmd)); };
  run({ type: 'select', metric: AVR, definitionId: 'strict_thresholds' });
  run({ type: 'publish', metric: AVR });
  run({ type: 'rollback', metric: AVR });
  run({ type: 'rollback', metric: AVR });
  run({ type: 'mode', governed: false });
  run({ type: 'tableToggle', kpi: 'bed-occupancy' });
  run({ type: 'reset' });
  run({ type: 'next' });
  run({ type: 'back' });
  run({ type: 'scenario', value: 'healthy' });
});

test('definition lifecycle never throws: publish twice, rollback past the start, mode between publishes', () => {
  const c = make('?scenario=incident&step=3');
  const cmds = [{ type: 'publish', metric: AVR }, { type: 'select', metric: AVR, definitionId: 'strict_thresholds' },
    { type: 'publish', metric: AVR }, { type: 'mode', governed: false }, { type: 'publish', metric: AVR },
    { type: 'rollback', metric: AVR }, { type: 'rollback', metric: AVR }, { type: 'rollback', metric: AVR },
    { type: 'mode', governed: true }, { type: 'reset' }];
  for (const x of cmds) { c.dispatch(x); assert.doesNotThrow(() => c.getModel()); }
  assert.equal(metric(c, AVR).version, 1);
});

test('tableToggle toggles one table open and closed', () => {
  const c = make('');
  c.dispatch({ type: 'tableToggle', kpi: 'avg-length-of-stay' });
  assert.deepEqual(c.getModel().trends.map((t) => t.tableOpen), [false, false, true, false]);
  c.dispatch({ type: 'tableToggle', kpi: 'avg-length-of-stay' });
  assert.ok(c.getModel().trends.every((t) => !t.tableOpen));
});

test('unknown commands and bad fields are ignored without notifying or throwing', () => {
  const c = make('?scenario=incident&step=3');
  const k = counter(c);
  const before = JSON.stringify(c.getModel());
  const hostile = { toString() { throw new Error('no'); } };
  const bad = [null, undefined, 5, 'next', [], {}, { type: 'nope' }, { type: 5 }, { type: 'scenario' }, { type: 'scenario', value: 'bogus' },
    { type: 'scenario', value: hostile }, { type: 'select', metric: 'x', definitionId: 'y' }, { type: 'select', metric: AVR, definitionId: 'nope' },
    { type: 'select', metric: '__proto__', definitionId: 'a' }, { type: 'publish' }, { type: 'publish', metric: 'x' }, { type: 'publish', metric: hostile },
    { type: 'rollback', metric: 'toString' }, { type: 'mode' }, { type: 'mode', governed: 'false' }, { type: 'tableToggle' },
    { type: 'tableToggle', kpi: 'nope' }, { type: 'tableToggle', kpi: '__proto__' }, { type: 'toString' }];
  for (const x of bad) assert.doesNotThrow(() => c.dispatch(x));
  assert.equal(k.n, 0);
  assert.equal(JSON.stringify(c.getModel()), before);
});

test('subscribe and unsubscribe', () => {
  const c = make('');
  let a = 0, b = 0;
  const ua = c.subscribe(() => { a++; });
  c.subscribe(() => { b++; });
  assert.doesNotThrow(() => c.subscribe('not a function')());
  c.dispatch({ type: 'next' });
  assert.deepEqual([a, b], [1, 1]);
  ua();
  ua();
  c.dispatch({ type: 'next' });
  assert.deepEqual([a, b], [1, 2]);
  c.subscribe(() => { throw new Error('listener'); });
  assert.doesNotThrow(() => c.dispatch({ type: 'back' }));
});

test('getModel does not expose controller state to mutation', () => {
  const c = make('?scenario=incident&step=3');
  const m = c.getModel();
  m.definitions.metrics[0].selectedId = 'tampered';
  m.header.steps.n = 99;
  assert.equal(steps(c).n, 3);
  assert.notEqual(c.getModel().definitions.metrics[0].selectedId, 'tampered');
});

test('broken engine: notice shown, every command inert, never throws', () => {
  const bad = Object.assign({}, Engine, { selfTest: () => ({ passed: false, checks: [{ name: 'alpha', ok: true }, { name: 'beta', ok: false }] }) });
  const c = Value.controller.createController(bad, '?scenario=incident&step=3', '');
  const k = counter(c);
  const m = c.getModel();
  assert.equal(m.notice, 'Engine self-test failed: beta');
  const before = JSON.stringify(m);
  for (const x of [{ type: 'next' }, { type: 'back' }, { type: 'scenario', value: 'healthy' }, { type: 'mode', governed: false },
    { type: 'publish', metric: AVR }, { type: 'reset' }, { type: 'tableToggle', kpi: 'bed-occupancy' }, null]) c.dispatch(x);
  assert.equal(JSON.stringify(c.getModel()), before);
  assert.equal(k.n, 0);
  const thrower = Object.assign({}, Engine, { selfTest: () => { throw new Error('boom'); } });
  assert.match(Value.controller.createController(thrower, '').getModel().notice, /^Engine self-test failed: boom/);
  const allThrow = Object.assign({}, Engine, { actionsForStep: () => { throw new Error('x'); }, getState: () => { throw new Error('x'); } });
  let cc;
  assert.doesNotThrow(() => { cc = Value.controller.createController(allThrow, '?scenario=incident&step=3', ''); cc.getModel(); cc.dispatch({ type: 'next' }); });
  assert.ok(cc.getModel().notice);
});

test('engine throwing mid-run makes controls inert', () => {
  let live = true;
  const flaky = Object.assign({}, Engine, { stepForActions: (...a) => { if (!live) throw new Error('x'); return Engine.stepForActions(...a); } });
  const c = Value.controller.createController(flaky, '?scenario=incident&step=3', '');
  const k = counter(c);
  live = false;
  assert.doesNotThrow(() => { c.dispatch({ type: 'next' }); c.getModel(); });
  assert.equal(k.n, 0);
});

test('the controller never touches location or history', () => {
  const c = make('?scenario=incident&step=3', '#stage-check');
  c.dispatch({ type: 'next' });
  c.dispatch({ type: 'scenario', value: 'healthy' });
  c.getModel();
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'src', 'controller.js'), 'utf8');
  assert.ok(!/location|history\.|document|window|Math\.random|Date\.now|new Date/.test(src));
});

test('model renders through the render module', () => {
  for (const s of ['', '?scenario=incident&step=16', '?scenario=incident&a=' + enc(diverged())]) {
    const html = Value.render.header(make(s, '', { hqBase: HQ }).getModel());
    assert.ok(typeof html === 'string' && html.length > 0);
  }
});
