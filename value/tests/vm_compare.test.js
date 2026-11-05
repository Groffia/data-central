'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadValue } = require('./helpers/load');

const { Engine, Value } = loadValue();
const vm = Value.viewmodel;
const plain = (o) => JSON.parse(JSON.stringify(o));
const cmp = (scenario, k) => {
  const a = Engine.actionsForStep(scenario, k);
  return vm.compare(Engine.getState(scenario, a), Engine.naiveSample(scenario, a));
};
const NOTE = 'The seven-day tiles come from the 120-day Gold history, so a single bad batch does not move them. The damage a bad batch does is to the live sample and to trust: rows that vanish or invalid readings that are counted.';

test('labels', () => {
  const c = cmp('incident', 3);
  assert.strictEqual(c.withGate.label, 'With the gate (what this dashboard shows)');
  assert.strictEqual(c.withoutGate.label, 'Without a gate (a model of a naive pipeline)');
});

test('incident step 3 texts', () => {
  const c = cmp('incident', 3);
  assert.deepStrictEqual(plain(c.withGate), { readingsText: '40 readings', abnormalText: '5 abnormal', rateText: '12.5%', label: c.withGate.label });
  const w = c.withoutGate;
  assert.strictEqual(w.countedText, '53 readings counted');
  assert.strictEqual(w.droppedText, '7 rows silently dropped');
  assert.strictEqual(w.invalidText, '2 invalid readings counted');
  assert.strictEqual(w.rateText, '13.2%');
  assert.deepStrictEqual(plain(w.droppedReasons), [
    { text: 'renamed columns: patient_id key missing, dropped by join to dim_patient', count: 5 },
    { text: 'null patient_id: dropped by join to dim_patient', count: 1 },
    { text: 'patient_id matches no dim_patient row', count: 1 }
  ]);
});

test('healthy steps: nothing dropped, rates equal', () => {
  for (const k of [1, 4]) {
    const c = cmp('healthy', k);
    assert.strictEqual(c.withoutGate.droppedText, '0 rows silently dropped');
    assert.strictEqual(c.withoutGate.invalidText, '0 invalid readings counted');
    assert.deepStrictEqual(plain(c.withoutGate.droppedReasons), []);
    assert.strictEqual(c.withoutGate.rateText, c.withGate.rateText);
  }
});

test('incident steps 2 and 16 are well formed', () => {
  for (const k of [2, 16]) {
    const c = cmp('incident', k);
    assert.match(c.withGate.rateText, /^\d+\.\d%$/);
    assert.match(c.withoutGate.rateText, /^\d+\.\d%$/);
    assert.match(c.withoutGate.droppedText, /^\d+ rows? silently dropped$/);
    const total = c.withoutGate.droppedReasons.reduce((s, r) => s + r.count, 0);
    assert.strictEqual(String(total), c.withoutGate.droppedText.split(' ')[0]);
  }
});

test('singulars', () => {
  const state = { todaySoFar: { observations: 1, abnormalCount: 1, abnormalVitalRate: 100 } };
  const naive = { counted: 1, dropped: 1, droppedReasons: [{ dlqId: 'x', reason: 'r' }], invalidReadings: 1, abnormal: 1, ratePct: 100, published: 1 };
  const c = vm.compare(state, naive);
  assert.strictEqual(c.withGate.readingsText, '1 reading');
  assert.strictEqual(c.withoutGate.countedText, '1 reading counted');
  assert.strictEqual(c.withoutGate.droppedText, '1 row silently dropped');
  assert.strictEqual(c.withoutGate.invalidText, '1 invalid reading counted');
  assert.strictEqual(c.withGate.rateText, '100.0%');
  assert.deepStrictEqual(plain(c.withoutGate.droppedReasons), [{ text: 'r', count: 1 }]);
});

test('ties keep first-seen order, most frequent first', () => {
  const state = { todaySoFar: { observations: 1, abnormalCount: 0, abnormalVitalRate: 0 } };
  const rs = ['a', 'b', 'b', 'c', 'a', 'd'].map((reason, i) => ({ dlqId: 'd' + i, reason }));
  const c = vm.compare(state, { counted: 1, dropped: 6, droppedReasons: rs, invalidReadings: 0, abnormal: 0, ratePct: 0, published: 1 });
  assert.deepStrictEqual(plain(c.withoutGate.droppedReasons).map((r) => r.text + r.count), ['a2', 'b2', 'c1', 'd1']);
});

test('no signed-improvement property anywhere', () => {
  const walk = (o) => {
    if (o && typeof o === 'object') for (const k of Object.keys(o)) { assert.doesNotMatch(k, /points?saved|distortion|saved/i); walk(o[k]); }
  };
  for (const [s, k] of [['incident', 2], ['incident', 3], ['incident', 16], ['healthy', 1], ['healthy', 4]]) walk(cmp(s, k));
});

test('note present at every step', () => {
  for (const s of ['healthy', 'incident']) {
    const m = Engine.AUTOPLAY[s].length;
    for (let k = Engine.PRELUDE[s].length; k <= m; k++) assert.strictEqual(cmp(s, k).note, NOTE);
  }
});
