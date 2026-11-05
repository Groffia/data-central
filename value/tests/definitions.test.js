'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadValue } = require('./helpers/load');

const { Engine, Value } = loadValue();
const D = Value.definitions;
const plain = (o) => JSON.parse(JSON.stringify(o));
const AVR = 'Abnormal Vital Rate';
const RDM = '30-Day Readmission Rate';
const CONSUMERS = ['Dashboard tile', 'Trend chart'];
const history = Engine.getHistory();
const txt = (metric, id) => (Engine.computeMetric(history, metric, id).value * 100).toFixed(1) + '%';
const STD = txt(AVR, 'standard_thresholds');
const STRICT = txt(AVR, 'strict_thresholds');
const run = (s, ...actions) => actions.reduce((st, a) => D.reduce(st, a), s);
const avr = (s) => plain(D.consumers(s, history)).find((c) => c.metric === AVR);
const deepFreeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };

test('initial values', () => {
  const s = D.initial();
  assert.strictEqual(s.governed, true);
  assert.strictEqual(s.consumerCopies, null);
  assert.deepStrictEqual(plain(s.log), []);
  assert.strictEqual(s.message, '');
  assert.deepStrictEqual(plain(s.metrics[AVR]), { selected: 'standard_thresholds', published: 'standard_thresholds', version: 1, history: [] });
  assert.deepStrictEqual(plain(s.metrics[RDM]), { selected: 'all_cause', published: 'all_cause', version: 1, history: [] });
  assert.notStrictEqual(STD, STRICT);
});

test('initial consumers', () => {
  const c = avr(D.initial());
  assert.deepStrictEqual(c.rows.map((r) => r.consumer), CONSUMERS);
  assert.ok(c.rows.every((r) => r.valueText === STD && r.definitionId === 'standard_thresholds'));
  assert.strictEqual(c.conflict, null);
  assert.deepStrictEqual(plain(D.consumers(D.initial(), history)).map((c) => c.metric), [AVR, RDM]);
});

test('governed publish', () => {
  let s = run(D.initial(), { type: 'select', metric: AVR, definitionId: 'strict_thresholds' });
  assert.strictEqual(s.metrics[AVR].published, 'standard_thresholds');
  s = run(s, { type: 'publish', metric: AVR });
  const c = avr(s);
  assert.ok(c.rows.every((r) => r.valueText === STRICT && r.definitionId === 'strict_thresholds'));
  assert.strictEqual(c.conflict, null);
  assert.strictEqual(s.metrics[AVR].version, 2);
  assert.deepStrictEqual(plain(D.changelog(s)), [{ version: 2, text: 'Abnormal Vital Rate: standard_thresholds -> strict_thresholds, 2 consumers changed' }]);
  assert.strictEqual(s.message, 'Published Abnormal Vital Rate v2');
});

test('rollback restores exactly', () => {
  const init = D.initial();
  const s = run(init, { type: 'select', metric: AVR, definitionId: 'strict_thresholds' }, { type: 'publish', metric: AVR }, { type: 'rollback', metric: AVR });
  assert.strictEqual(s.metrics[AVR].version, 1);
  assert.strictEqual(s.metrics[AVR].published, 'standard_thresholds');
  assert.strictEqual(s.metrics[AVR].selected, 'standard_thresholds');
  assert.deepStrictEqual(plain(D.consumers(s, history)), plain(D.consumers(init, history)));
  assert.strictEqual(s.message, 'Rolled back Abnormal Vital Rate to v1');
  assert.deepStrictEqual(plain(D.changelog(s)).map((e) => e.text), [
    'Abnormal Vital Rate: rolled back strict_thresholds -> standard_thresholds, 2 consumers changed',
    'Abnormal Vital Rate: standard_thresholds -> strict_thresholds, 2 consumers changed']);
});

test('hardcoded publish, then back to governed', () => {
  let s = run(D.initial(), { type: 'mode', governed: false });
  assert.strictEqual(s.message, 'Hardcoded in the report: each report keeps its own copy');
  assert.strictEqual(s.governed, false);
  assert.strictEqual(avr(s).conflict, null);
  s = run(s, { type: 'select', metric: AVR, definitionId: 'strict_thresholds' }, { type: 'publish', metric: AVR });
  const c = avr(s);
  assert.deepStrictEqual(c.rows.map((r) => r.valueText), [STRICT, STD]);
  assert.deepStrictEqual(c.conflict, { text: 'Definition conflict: 1 report disagrees', values: [STRICT, STD] });
  assert.strictEqual(D.changelog(s)[0].text, 'Abnormal Vital Rate: standard_thresholds -> strict_thresholds, 1 consumer changed');
  s = run(s, { type: 'mode', governed: true });
  assert.strictEqual(s.message, 'One governed definition: all reports agree');
  assert.strictEqual(s.consumerCopies, null);
  const g = avr(s);
  assert.strictEqual(g.conflict, null);
  assert.ok(g.rows.every((r) => r.valueText === STRICT));
});

test('hardcoded conflict on the other metric; no conflict at start', () => {
  let s = run(D.initial(), { type: 'mode', governed: false });
  s = run(s, { type: 'select', metric: RDM, definitionId: 'unplanned_only' }, { type: 'publish', metric: RDM });
  const c = plain(D.consumers(s, history)).find((x) => x.metric === RDM);
  assert.strictEqual(c.conflict.text, 'Definition conflict: 1 report disagrees');
  assert.ok(D.consumers(D.initial(), history).every((x) => x.conflict === null));
});

test('publish with nothing selected changes nothing', () => {
  const s0 = D.initial();
  const s = run(s0, { type: 'publish', metric: AVR });
  assert.deepStrictEqual(plain({ ...s, message: '' }), plain(s0));
  assert.strictEqual(s.message, 'Nothing to publish');
  assert.strictEqual(run(s0, { type: 'publish', metric: 'Nope' }).message, 'Nothing to publish');
});

test('rollback with empty history', () => {
  const s = run(D.initial(), { type: 'rollback', metric: AVR });
  assert.strictEqual(s.message, 'Nothing to roll back');
  assert.strictEqual(s.metrics[AVR].version, 1);
  assert.deepStrictEqual(plain(s.log), []);
});

test('rollback twice, publish after rollback, past the start', () => {
  const sel = (id) => ({ type: 'select', metric: AVR, definitionId: id });
  const pub = { type: 'publish', metric: AVR };
  const rb = { type: 'rollback', metric: AVR };
  let s = run(D.initial(), sel('strict_thresholds'), pub, sel('standard_thresholds'), pub);
  assert.strictEqual(s.metrics[AVR].version, 3);
  s = run(s, rb, rb);
  assert.strictEqual(s.metrics[AVR].version, 1);
  assert.strictEqual(s.metrics[AVR].published, 'standard_thresholds');
  s = run(s, rb);
  assert.strictEqual(s.message, 'Nothing to roll back');
  s = run(s, sel('strict_thresholds'), pub);
  assert.strictEqual(s.metrics[AVR].version, 2);
  assert.strictEqual(s.metrics[AVR].published, 'strict_thresholds');
  assert.strictEqual(s.metrics[AVR].history.length, 1);
});

test('reset', () => {
  const s = run(D.initial(), { type: 'mode', governed: false }, { type: 'select', metric: AVR, definitionId: 'strict_thresholds' }, { type: 'publish', metric: AVR }, { type: 'reset' });
  assert.strictEqual(s.message, 'Definitions reset');
  assert.deepStrictEqual(plain({ ...s, message: '' }), plain(D.initial()));
});

test('junk: valid state, no exception', () => {
  const s0 = D.initial();
  const same = (a) => assert.deepStrictEqual(plain({ ...D.reduce(s0, a), message: '' }), plain(s0));
  [undefined, null, 5, 'x', [], {}, { type: 'nope' }, { type: 'select' }, { type: 'select', metric: AVR }, { type: 'select', metric: AVR, definitionId: 'bogus' },
    { type: 'select', metric: 'Nope', definitionId: 'strict_thresholds' }, { type: 'select', metric: AVR, definitionId: 'all_cause' },
    { type: 'mode' }, { type: 'mode', governed: 'no' }, { type: 'mode', governed: 1 }, { type: 'publish' }, { type: 'rollback', metric: 7 },
    { type: 'select', metric: '__proto__', definitionId: 'x' }, { type: 'publish', metric: 'constructor' }].forEach(same);
  for (const junk of [undefined, null, 7, 'x', [], {}, { metrics: 3 }]) {
    const s = D.reduce(junk, { type: 'select', metric: AVR, definitionId: 'strict_thresholds' });
    assert.strictEqual(s.metrics[AVR].selected, 'strict_thresholds');
    assert.doesNotThrow(() => D.consumers(junk, history));
    assert.doesNotThrow(() => D.published(junk));
    assert.doesNotThrow(() => D.changelog(junk));
  }
});

test('reducer never mutates its input', () => {
  let s = D.initial();
  const actions = [{ type: 'mode', governed: false }, { type: 'select', metric: AVR, definitionId: 'strict_thresholds' }, { type: 'publish', metric: AVR },
    { type: 'rollback', metric: AVR }, { type: 'publish', metric: AVR }, { type: 'mode', governed: true }, { type: 'select', metric: RDM, definitionId: 'unplanned_only' },
    { type: 'publish', metric: RDM }, { type: 'bogus' }, { type: 'reset' }];
  for (const a of actions) { deepFreeze(s); deepFreeze(a); s = D.reduce(s, a); }
  deepFreeze(s);
  assert.doesNotThrow(() => { D.consumers(s, history); D.published(s); D.changelog(s); });
});

test('metrics are independent', () => {
  const s = run(D.initial(), { type: 'select', metric: AVR, definitionId: 'strict_thresholds' }, { type: 'publish', metric: AVR });
  assert.strictEqual(s.metrics[AVR].version, 2);
  assert.strictEqual(s.metrics[RDM].version, 1);
  assert.strictEqual(s.metrics[RDM].published, 'all_cause');
  const r = run(s, { type: 'rollback', metric: RDM });
  assert.strictEqual(r.message, 'Nothing to roll back');
  assert.strictEqual(r.metrics[AVR].version, 2);
});

test('published shape', () => {
  const s = run(D.initial(), { type: 'select', metric: AVR, definitionId: 'strict_thresholds' }, { type: 'publish', metric: AVR });
  assert.deepStrictEqual(plain(D.published(s)), {
    [AVR]: { definitionId: 'strict_thresholds', version: 2 },
    [RDM]: { definitionId: 'all_cause', version: 1 } });
});

test('yamlPreview', () => {
  const y = D.yamlPreview(AVR, 'strict_thresholds');
  assert.ok(y.startsWith('# illustrative, in the style of dbt MetricFlow, not a working config'));
  for (const w of ['abnormal_vital_rate', 'strict_thresholds', 'abnormal_obs_strict', 'observations']) assert.ok(y.includes(w), w);
  assert.ok(D.yamlPreview(RDM, 'all_cause').includes('30_day_readmission_rate'));
  assert.strictEqual(D.yamlPreview('Nope', 'x'), '');
  assert.strictEqual(D.yamlPreview(AVR, 'bogus'), '');
  assert.strictEqual(D.yamlPreview(), '');
});

test('changelog newest first and a copy', () => {
  const s = run(D.initial(), { type: 'select', metric: AVR, definitionId: 'strict_thresholds' }, { type: 'publish', metric: AVR },
    { type: 'select', metric: RDM, definitionId: 'unplanned_only' }, { type: 'publish', metric: RDM });
  const log = D.changelog(s);
  assert.deepStrictEqual(plain(log).map((e) => e.version), [2, 2]);
  assert.ok(log[0].text.startsWith('30-Day Readmission Rate:'));
  log.push({});
  assert.strictEqual(s.log.length, 2);
});
