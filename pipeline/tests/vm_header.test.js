'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadPipeline } = require('./helpers/load');

const { Engine, Pipeline } = loadPipeline();
const vm = Pipeline.viewmodel;
const plain = (x) => JSON.parse(JSON.stringify(x));
function st(scenario, k) { return Engine.getState(scenario, Engine.AUTOPLAY[scenario].slice(0, k)); }

test('header healthy step 1', () => {
  const h = plain(vm.header(st('healthy', 1), 'healthy', 1, '../hq/?scenario=healthy&step=1'));
  assert.strictEqual(h.title, 'Pipeline: Under the Hood');
  assert.deepStrictEqual(h.steps, { n: 1, m: 4, text: 'batch-1 landed 20 rows in bronze' });
  assert.strictEqual(h.canBack, true);
  assert.strictEqual(h.canNext, true);
  assert.strictEqual(h.hqHref, '../hq/?scenario=healthy&step=1');
  assert.ok(h.subtitle.includes('Tamsworth Health'));
});
test('stepper text is Step N of M', () => {
  const h = vm.header(st('incident', 3), 'incident', 3, '');
  assert.strictEqual(vm.stepLabel(h.steps), 'Step 3 of 16');
  assert.strictEqual(vm.stepLabel({ n: 1, m: 4 }), 'Step 1 of 4');
});
test('header incident step 3: text is the batch-landed event the last action added', () => {
  // The last event after step 3 is ALERT_FIRED, so the text is the FIRST event the action added.
  const s = st('incident', 3);
  assert.strictEqual(s.events[s.events.length - 1].type, 'ALERT_FIRED');
  const h = vm.header(s, 'incident', 3, '');
  assert.strictEqual(h.steps.text, 'batch-3 landed 20 rows in bronze');
  assert.strictEqual(h.steps.m, 16);
});
test('header incident step 16 text', () => {
  const h = vm.header(st('incident', 16), 'incident', 16, '');
  assert.strictEqual(h.steps.text, 'dq-tamsworth-silver_vital_observation resolved');
  assert.strictEqual(h.canNext, false);
  assert.strictEqual(h.canBack, true);
});
test('canBack false at the floor, canNext false at the last', () => {
  assert.strictEqual(vm.header(st('incident', 2), 'incident', 2, '').canBack, false);
  assert.strictEqual(vm.header(st('healthy', 0), 'healthy', 0, '').canBack, false);
  assert.strictEqual(vm.header(st('healthy', 4), 'healthy', 4, '').canNext, false);
  assert.strictEqual(vm.header(st('incident', 15), 'incident', 15, '').canNext, true);
});
test('step text with no events', () => {
  assert.strictEqual(vm.header(st('healthy', 0), 'healthy', 0, '').steps.text, 'No batch has run yet');
});
test('header at the incident floor shows the last prelude event', () => {
  assert.strictEqual(vm.header(st('incident', 2), 'incident', 2, '').steps.text, 'batch-2 published 20 rows to production');
});
test('hqHref is returned verbatim, empty stays empty', () => {
  assert.strictEqual(vm.header(st('healthy', 1), 'healthy', 1, '').hqHref, '');
});
test('batchChips healthy step 1', () => {
  assert.deepStrictEqual(plain(vm.batchChips(st('healthy', 1), null)), [{ n: 1, label: 'Batch 1', held: false, selected: true }]);
});
test('batchChips incident step 3: batch 3 held and selected by default', () => {
  const c = plain(vm.batchChips(st('incident', 3), null));
  assert.deepStrictEqual(c.map((x) => x.label), ['Batch 1', 'Batch 2', 'Batch 3 (held)']);
  assert.deepStrictEqual(c.map((x) => x.selected), [false, false, true]);
  assert.deepStrictEqual(c.map((x) => x.held), [false, false, true]);
});
test('batchChips honours an explicit selection', () => {
  const c = vm.batchChips(st('incident', 3), 1);
  assert.deepStrictEqual([...c.map((x) => x.selected)], [true, false, false]);
});
test('batch 3 stays held while the gate is half open and rows are in staging', () => {
  const c = vm.batchChips(st('incident', 14), null);
  assert.strictEqual(c[2].label, 'Batch 3 (held)');
});
test('batchChips incident step 16: batch 3 no longer held, chips 1 to 4', () => {
  const c = plain(vm.batchChips(st('incident', 16), null));
  assert.deepStrictEqual(c.map((x) => x.label), ['Batch 1', 'Batch 2', 'Batch 3', 'Batch 4']);
  assert.strictEqual(c[3].selected, true);
});
test('no batch run gives no chips; inputs are not mutated', () => {
  assert.deepStrictEqual([...vm.batchChips(st('healthy', 0), null)], []);
  const s = st('incident', 3), before = JSON.stringify(s);
  vm.header(s, 'incident', 3, 'x'); vm.batchChips(s, 2);
  assert.strictEqual(JSON.stringify(s), before);
});
