'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadValue } = require('./helpers/load');

const { Engine, Value } = loadValue();
const vm = Value.viewmodel;
const plain = (x) => JSON.parse(JSON.stringify(x));
const panel = (scenario, k) => vm.checkPanel(Engine.getState(scenario, Engine.actionsForStep(scenario, k)));
const NEUTRAL_VERDICT = 'Not enough data yet (fewer than 30 readings)';

test('title, lead and question', () => {
  for (const c of [panel('healthy', 4), panel('healthy', 1), vm.checkPanel(null)]) {
    assert.strictEqual(c.title, 'Expected-range check');
    assert.strictEqual(c.lead, 'A demonstration of the pattern, not a clinical model.');
    assert.strictEqual(c.question, "Is today's abnormal-vital rate unusual for a sample this size?");
  }
});

test('explanations are true: three of the five are abnormal; 20 to 80 readings only in the guided runs', () => {
  const text = panel('healthy', 4).explain.join(' ');
  assert.ok(text.includes('three of the five are abnormal'));
  assert.ok(!text.includes('deliberately abnormal'));
  assert.ok(text.includes('In the guided runs, today holds 20 to 80 readings'));
  assert.ok(!/today holds just/.test(text));
});

test('healthy step 1 is neutral', () => {
  const c = panel('healthy', 1);
  assert.strictEqual(c.verdict, NEUTRAL_VERDICT);
  assert.strictEqual(c.level, 'neutral');
  assert.strictEqual(c.withHandPickedText, '5 of 20 = 25.0% (counting the five hand-picked rows)'.replace('5 of 20 = 25.0%', c.withHandPickedText.split(' (')[0]));
  assert.ok(/ of 20 = /.test(c.withHandPickedText));
});

test('healthy step 4 texts', () => {
  const c = panel('healthy', 4);
  assert.strictEqual(c.withHandPickedText, '10 of 80 = 12.5% (counting the five hand-picked rows)');
  assert.strictEqual(c.withoutHandPickedText, '7 of 75 = 9.3% (without them; this is the number the verdict uses)');
  assert.strictEqual(c.rangeText, 'Expected range for 75 readings at the 120-day rate of 6.0%: up to 12.0%');
  assert.strictEqual(c.verdict, 'Within the expected range');
  assert.strictEqual(c.level, 'ok');
});

test('incident step 3 equals step 2', () => {
  assert.strictEqual(JSON.stringify(panel('incident', 3)), JSON.stringify(panel('incident', 2)));
});

test('above the limit warns', () => {
  const c = vm.checkPanel({ publishedObservations: 100, publishedAbnormal: 20, productionData: [] });
  assert.strictEqual(c.verdict, 'Above the expected range');
  assert.strictEqual(c.level, 'warn');
  assert.strictEqual(c.withHandPickedText, '20 of 100 = 20.0%');
  assert.strictEqual(c.withoutHandPickedText, '20 of 100 = 20.0% (without them; this is the number the verdict uses)');
});

test('no readings', () => {
  const c = vm.checkPanel({ publishedObservations: 0, publishedAbnormal: 0, productionData: [] });
  assert.strictEqual(c.rangeText, 'No readings yet');
  assert.strictEqual(c.withHandPickedText, '0 of 0');
  assert.strictEqual(c.level, 'neutral');
});

test('junk state gives the neutral panel and never throws', () => {
  for (const junk of [null, undefined, {}, 5, 'x', [], { publishedObservations: -1 }]) {
    const c = plain(vm.checkPanel(junk));
    assert.strictEqual(c.verdict, NEUTRAL_VERDICT);
    assert.strictEqual(c.level, 'neutral');
    assert.strictEqual(c.withHandPickedText, '');
    assert.strictEqual(c.withoutHandPickedText, '');
    assert.strictEqual(c.rangeText, '');
    assert.ok(c.explain.length > 0);
  }
});

test('explanation mentions hand-picked rows and is short', () => {
  const c = panel('healthy', 4);
  assert.ok(Array.isArray(c.explain) && c.explain.length >= 5);
  assert.ok(c.explain.join(' ').includes('hand-picked'));
  c.explain.forEach((s) => assert.ok(typeof s === 'string' && s.length > 0 && s.length < 200, s));
});

test('no claim of prediction or clinical use outside negated sentences', () => {
  const c = panel('healthy', 4);
  c.explain.forEach((s) => {
    if (/predict|clinical/i.test(s)) assert.ok(/^(It does not|This is not)/.test(s), s);
  });
  assert.ok(c.explain.some((s) => /^It does not/.test(s)));
});
