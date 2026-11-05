'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadPipeline } = require('./helpers/load');

const { Engine, Pipeline } = loadPipeline();
const vm = Pipeline.viewmodel;
const plain = (x) => JSON.parse(JSON.stringify(x));

function input(scenario, step, batch, extra) {
  const actions = Engine.actionsForStep(scenario, step);
  const state = Engine.getState(scenario, actions);
  const n = batch === undefined ? state.batchesRun : batch;
  return Object.assign({
    scenario, step, actions, state, selectedBatch: n === 0 ? null : n,
    inspect: n ? Engine.inspectBatch(scenario, actions, n) : null,
    tieringInputs: {}, tieringPrevious: null, hqLink: 'hq.html?scenario=' + scenario + '&step=' + step,
    focus: '', notice: '', error: ''
  }, extra || {});
}

test('incident step 3 batch 3 carries every piece', () => {
  const v = plain(vm.buildViewModel(input('incident', 3, 3)));
  assert.strictEqual(v.header.title, 'Pipeline: Under the Hood');
  assert.strictEqual(v.header.steps.n, 3);
  assert.strictEqual(v.header.hqHref, 'hq.html?scenario=incident&step=3');
  assert.strictEqual(v.batches.chips.length, 3);
  assert.strictEqual(v.batches.chips[2].label, 'Batch 3 (held)');
  assert.strictEqual(v.batches.decisionText, 'Held at the gate');
  assert.strictEqual(v.generation.goldenRows.length, 5);
  assert.strictEqual(v.landing.rows.filter((r) => r.drift).length, 5);
  assert.strictEqual(v.matrix.notes.length, 1);
  assert.ok(v.gate.text.indexOf('Gate decision: Held') === 0);
  assert.strictEqual(v.rowView.length, 20);
  assert.strictEqual(v.dlq.length, 9);
  assert.strictEqual(v.medallion.labels.silver, 'Silver rows in production');
  assert.strictEqual(v.storage.valid, true);
  assert.strictEqual(v.storage.fields.hotToWarmDays, '30');
  assert.strictEqual(v.storage.tierBar.length, 3);
  assert.strictEqual(v.vendor.rows.length, 4);
  assert.strictEqual(v.selectedBatch, 3);
  assert.strictEqual(v.focus, '');
});

test('healthy step 1 batch 1 is published with no dlq', () => {
  const v = plain(vm.buildViewModel(input('healthy', 1, 1)));
  assert.strictEqual(v.batches.decisionText, 'Published');
  assert.ok(v.gate.text.indexOf('Gate decision: Published') === 0);
  assert.strictEqual(v.dlq.length, 0);
  assert.strictEqual(v.landing.rows.filter((r) => r.drift).length, 0);
  assert.deepStrictEqual(v.matrix.notes, []);
  assert.strictEqual(v.header.canBack, true);
  assert.strictEqual(v.header.canNext, true);
});

test('null inspect: landing, matrix content, gate and rowView are empty', () => {
  const v = plain(vm.buildViewModel(input('healthy', 0, 0)));
  assert.strictEqual(v.landing, null);
  assert.strictEqual(v.gate, null);
  assert.strictEqual(v.rowView, null);
  assert.deepStrictEqual(v.matrix, { rows: [], notes: [] });
  assert.strictEqual(v.batches.chips.length, 0);
});

test('invalid tiering input keeps raw strings and the previous result', () => {
  const prev = vm.tiering({}, null);
  const v = plain(vm.buildViewModel(input('healthy', 1, 1, { tieringInputs: { hotToWarmDays: 'abc' }, tieringPrevious: prev })));
  assert.strictEqual(v.storage.valid, false);
  assert.strictEqual(v.storage.fields.hotToWarmDays, 'abc');
  assert.strictEqual(v.storage.fields.dailyGB, '18');
  assert.deepStrictEqual(v.storage.result, plain(prev.result));
});

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    Object.keys(o).forEach((k) => deepFreeze(o[k]));
  }
  return o;
}

test('building does not mutate its input (deep-frozen, strict mode throws on write)', () => {
  const i = deepFreeze(input('incident', 3, 3, { tieringInputs: { hotToWarmDays: '9' }, focus: 'dlq-3-4', tieringPrevious: vm.tiering({}, null) }));
  const v = vm.buildViewModel(i);
  assert.strictEqual(v.dlq.length, 9);
});

test('missing or unknown input falls back to healthy at its opening actions', () => {
  [undefined, {}, { scenario: 'nope' }].forEach((inp) => {
    const v = vm.buildViewModel(inp);
    assert.strictEqual(v.scenario, 'healthy');
    assert.strictEqual(v.landing, null);
    assert.strictEqual(v.dlq.length, 0);
    assert.strictEqual(v.header.steps.n, Engine.PRELUDE.healthy.length);
  });
  const w = vm.buildViewModel({ scenario: 'incident' });
  assert.strictEqual(w.scenario, 'incident');
  assert.strictEqual(w.header.steps.n, Engine.PRELUDE.incident.length);
});
