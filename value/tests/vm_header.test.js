'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadValue } = require('./helpers/load');

const { Engine, Value } = loadValue();
const vm = Value.viewmodel;
const plain = (x) => JSON.parse(JSON.stringify(x));
function st(scenario, k) { return Engine.getState(scenario, Engine.AUTOPLAY[scenario].slice(0, k)); }
const LINKS = { hqBase: '../hq/', pipelineBase: '../pipeline/' };
const NONE = { hqBase: null, pipelineBase: null };

function diverged() {
  const a = Engine.actionsForStep('incident', 16).map((x) => ({ ...x }));
  a[3] = { type: 'discardRow', dlqId: 'dlq-3-2', reason: Engine.DISCARD_REASONS[0] };
  return a;
}

test('title and subtitle are exact', () => {
  const h = vm.header(st('healthy', 1), 'healthy', 1, LINKS);
  assert.strictEqual(h.title, 'Value: What the Business Sees');
  assert.strictEqual(h.subtitle, 'Tamsworth Health: what the business sees and why it can be trusted, stages 6 and 7');
});

test('healthy step 1: Step 1 of 4 with the event text', () => {
  const h = plain(vm.header(st('healthy', 1), 'healthy', 1, LINKS));
  assert.deepStrictEqual(h.steps, { n: 1, m: 4, text: 'batch-1 landed 20 rows in bronze' });
  assert.strictEqual(vm.stepLabel(h.steps), 'Step 1 of 4');
});

test('incident step 3: text is the engine event detail the last action added', () => {
  const h = vm.header(st('incident', 3), 'incident', 3, LINKS);
  assert.strictEqual(h.steps.text, 'batch-3 landed 20 rows in bronze');
  assert.strictEqual(h.steps.m, 16);
  assert.strictEqual(vm.stepLabel(h.steps), 'Step 3 of 16');
});

test('canBack and canNext bounds', () => {
  assert.strictEqual(vm.header(st('incident', 2), 'incident', 2, LINKS).canBack, false);
  assert.strictEqual(vm.header(st('healthy', 0), 'healthy', 0, LINKS).canBack, false);
  assert.strictEqual(vm.header(st('healthy', 0), 'healthy', 0, LINKS).steps.text, 'No batch has run yet');
  assert.strictEqual(vm.header(st('incident', 3), 'incident', 3, LINKS).canBack, true);
  assert.strictEqual(vm.header(st('healthy', 4), 'healthy', 4, LINKS).canNext, false);
  assert.strictEqual(vm.header(st('incident', 16), 'incident', 16, LINKS).canNext, false);
  assert.strictEqual(vm.header(st('incident', 15), 'incident', 15, LINKS).canNext, true);
});

test('both hrefs carry the same scenario and step', () => {
  const h = vm.header(st('incident', 3), 'incident', 3, LINKS);
  assert.strictEqual(h.hqHref, '../hq/?scenario=incident&step=3');
  assert.strictEqual(h.pipelineHref, '../pipeline/?scenario=incident&step=3');
  const z = vm.header(st('healthy', 0), 'healthy', 0, LINKS);
  assert.strictEqual(z.hqHref, '../hq/?scenario=healthy&step=0');
  assert.strictEqual(z.pipelineHref, '../pipeline/?scenario=healthy&step=0');
});

test('diverged state: a= and no step, custom label, both buttons enabled', () => {
  const acts = diverged();
  const h = plain(vm.header(Engine.getState('incident', acts), 'incident', null, LINKS, acts));
  const enc = Engine.encodeActions(acts);
  assert.strictEqual(h.hqHref, '../hq/?scenario=incident&a=' + enc);
  assert.strictEqual(h.pipelineHref, '../pipeline/?scenario=incident&a=' + enc);
  assert.ok(h.hqHref.indexOf('step=') < 0 && h.pipelineHref.indexOf('step=') < 0);
  assert.strictEqual(h.steps.n, null);
  assert.strictEqual(h.steps.label, 'Custom state from HQ (16 actions)');
  assert.strictEqual(vm.stepLabel(h.steps), 'Custom state from HQ (16 actions)');
  assert.strictEqual(h.canBack, true);
  assert.strictEqual(h.canNext, true);
});

test('diverged label pluralises', () => {
  const one = [{ type: 'ackAlert' }];
  assert.strictEqual(vm.header(Engine.getState('healthy', one), 'healthy', null, LINKS, one).steps.label, 'Custom state from HQ (1 action)');
});

test('encoded state over 2,000 characters: hrefs open at the nearest scripted step', () => {
  const base = Engine.actionsForStep('incident', 5);
  const acts = base.slice();
  while (Engine.encodeActions(acts) !== null) acts.push({ type: 'ackAlert' });
  assert.strictEqual(Engine.encodeActions(acts), null);
  assert.strictEqual(Engine.stepForActions('incident', acts), null);
  const h = vm.header(Engine.getState('incident', acts.slice(0, 5)), 'incident', null, LINKS, acts);
  assert.strictEqual(h.hqHref, '../hq/?scenario=incident&step=5');
  assert.strictEqual(h.pipelineHref, '../pipeline/?scenario=incident&step=5');
});

test('no base gives null hrefs; an unsafe base gives null', () => {
  const h = vm.header(st('healthy', 1), 'healthy', 1, NONE);
  assert.strictEqual(h.hqHref, null);
  assert.strictEqual(h.pipelineHref, null);
  const one = vm.header(st('healthy', 1), 'healthy', 1, { hqBase: '../hq/', pipelineBase: null });
  assert.strictEqual(one.hqHref, '../hq/?scenario=healthy&step=1');
  assert.strictEqual(one.pipelineHref, null);
  const bad = vm.header(st('healthy', 1), 'healthy', 1, { hqBase: 'javascript:alert(1)', pipelineBase: 'https://evil.example/' });
  assert.strictEqual(bad.hqHref, null);
  assert.strictEqual(bad.pipelineHref, null);
  assert.strictEqual(vm.header(st('healthy', 1), 'healthy', 1).hqHref, null);
});

test('inputs are not mutated', () => {
  const s = st('incident', 3), before = JSON.stringify(s);
  vm.header(s, 'incident', 3, LINKS);
  assert.strictEqual(JSON.stringify(s), before);
});
