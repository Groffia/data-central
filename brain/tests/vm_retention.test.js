'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadBrain } = require('./helpers/load');

const L = loadBrain();
const V = L.Brain.viewmodel;
const E = L.Engine;
const J = (x) => JSON.parse(JSON.stringify(x));
const LABEL = 'Retention periods here are example policy settings for the demo, not legal advice.';
function build(sc, step, local, links) {
  return J(V.buildViewModel({ scenario: sc, actions: E.actionsForStep(sc, step), step: step, links: links || {}, local: local }));
}

test('stage, title and the verbatim label', () => {
  const r = build('healthy', 4).retention;
  assert.strictEqual(r.stage, 'Stage 8: Archiving/Retirement');
  assert.strictEqual(r.title, 'Retention and retirement');
  assert.strictEqual(r.label, LABEL);
});

test('the timeline numbers are the engine defaults, exactly', () => {
  const t = E.TIERING_DEFAULTS;
  const r = build('healthy', 4).retention;
  assert.deepStrictEqual(r.timeline.map((s) => s.tier), ['Hot', 'Warm', 'Cold', 'Delete']);
  assert.deepStrictEqual(r.timeline.map((s) => s.days), [0, t.hotToWarmDays, t.warmToColdDays, t.retentionDays]);
  assert.deepStrictEqual(r.timeline.map((s) => s.text), ['Day 0', 'After ' + t.hotToWarmDays + ' days', 'After ' + t.warmToColdDays + ' days', 'After 2,555 days']);
});

test('legal hold off: no lock, the delete step is a normal step, no hold text anywhere', () => {
  const r = build('healthy', 4).retention;
  assert.strictEqual(r.legalHold.on, false);
  assert.strictEqual(r.legalHold.badgeText, '');
  assert.strictEqual(r.timeline[3].paused, false);
  assert.ok(!JSON.stringify(r).includes('Deletion paused'));
});

test('legal hold on: the lock badge and the verbatim paused text on the delete step', () => {
  const r = build('healthy', 4, { legalHold: true }).retention;
  assert.strictEqual(r.legalHold.on, true);
  assert.strictEqual(r.legalHold.badgeText, 'Locked');
  assert.strictEqual(r.timeline[3].paused, true);
  assert.strictEqual(r.timeline[3].text, 'After 2,555 days');
  assert.strictEqual(r.timeline[3].pausedText, 'Deletion paused: legal hold is on.');
  assert.deepStrictEqual(r.timeline.slice(0, 3).map((s) => s.paused), [false, false, false]);
});

test('no volume, cost or due-for-deletion figure on the panel', () => {
  const text = JSON.stringify(build('incident', 3, { legalHold: true }).retention);
  ['due for deletion', 'per month', '$', 'GB', 'observations'].forEach((w) => assert.ok(!text.toLowerCase().includes(w.toLowerCase()), w));
  assert.ok(!Object.keys(build('healthy', 4).retention).some((k) => /volume|cost|due/i.test(k)));
});

test('the Pipeline storage link carries the state and the storage anchor; none without a base', () => {
  const links = { hqBase: '../hq/', pipelineBase: '../pipeline/' };
  assert.strictEqual(build('incident', 3, undefined, links).retention.storageHref, '../pipeline/?scenario=incident&step=3#stage-storage');
  assert.strictEqual(build('incident', 3).retention.storageHref, null);
  assert.strictEqual(build('incident', 3, undefined, { pipelineBase: 'http://evil/' }).retention.storageHref, null);
});

test('a bad local state means no hold', () => {
  [null, 7, 'x', {}, { legalHold: 'yes' }, { legalHold: 1 }, { legalHold: null }].forEach((bad) => assert.strictEqual(build('healthy', 4, bad).retention.legalHold.on, false));
});
