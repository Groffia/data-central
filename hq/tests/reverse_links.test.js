'use strict';
// Pipeline -> HQ links: HQ must open exactly the state the Pipeline page was showing, including diverged states carried in a=.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadHQ } = require('./helpers/load');
const { loadPipeline } = require('../../pipeline/tests/helpers/load');

const { Engine, HQ } = loadHQ();
const P = loadPipeline();
const J = (x) => JSON.parse(JSON.stringify(x));
const OTHER = 'Other, see note';

function hqQuery(scenario, actions) {
  const c = P.Pipeline.controller.createController(P.Engine, '?scenario=' + scenario + '&a=' + P.Engine.encodeActions(actions), '', { hqBase: '../hq/' });
  const link = c.getModel().header.hqHref;
  assert.ok(link.indexOf('../hq/?') === 0, link);
  return { query: link.slice('../hq/'.length), ctl: c };
}
function openHQ(query) { return HQ.controller.createController(Engine, query, {}); }

function same(scenario, actions) {
  const q = hqQuery(scenario, actions);
  const hq = openHQ(q.query);
  assert.deepEqual(J(Engine.getState(scenario, hq.actions())), J(Engine.getState(scenario, q.ctl.actions())), q.query);
  assert.deepEqual(J(hq.actions()), J(q.ctl.actions()), q.query);
}

test('every scripted prefix round-trips Pipeline -> HQ', () => {
  for (let n = 0; n <= 4; n++) same('healthy', Engine.actionsForStep('healthy', n));
  for (let n = 2; n <= 16; n++) same('incident', Engine.actionsForStep('incident', n));
});

function incidentFull() { return Engine.AUTOPLAY.incident.map((a) => Object.assign({}, a)); }
function firstIndex(a, type, from) { return a.findIndex((x, i) => i >= (from || 0) && x.type === type); }

test('a drift row discarded with "Other, see note" instead of repaired', () => {
  const a = incidentFull();
  const i = firstIndex(a, 'repairRow');
  a[i] = { type: 'discardRow', dlqId: a[i].dlqId, reason: OTHER };
  assert.notEqual(Engine.encodeActions(a), null);
  same('incident', a);
});

test('the alert acknowledged before the first repair', () => {
  const full = incidentFull().filter((x) => x.type !== 'ackAlert');
  const i = firstIndex(full, 'repairRow');
  full.splice(i, 0, { type: 'ackAlert' });
  assert.notEqual(Engine.encodeActions(full), null);
  same('incident', full);
});

test('one repair then a discard of another drift row', () => {
  const a = incidentFull();
  const i = firstIndex(a, 'repairRow');
  const j = firstIndex(a, 'repairRow', i + 1);
  assert.ok(j > i);
  a[j] = { type: 'discardRow', dlqId: a[j].dlqId, reason: OTHER };
  same('incident', a);
});

test('the user-visible scenario: incident step 3, dlq-3-2 discarded', () => {
  const a = Engine.actionsForStep('incident', 3).concat([{ type: 'discardRow', dlqId: 'dlq-3-2', reason: OTHER }]);
  const q = '?scenario=incident&a=' + Engine.encodeActions(a);
  assert.deepEqual(J(openHQ(q).actions()), J(a));
});

test('links without a= behave as before', () => {
  assert.equal(openHQ('?scenario=incident&step=3').actions().length, 3);
  assert.equal(openHQ('?scenario=incident').actions().length, Engine.PRELUDE.incident.length);
  assert.equal(openHQ('?scenario=healthy').actions().length, 1);
  assert.equal(openHQ('').actions().length, 1);
});

test('invalid or hostile a= falls back to the step logic without throwing', () => {
  const long = '?scenario=incident&step=3&a=' + 'r.'.repeat(1500) + 'r';
  // An action list that decodes but whose replay throws (a repair of an id that does not exist).
  const bad = Engine.encodeActions([{ type: 'runBatch' }, { type: 'repairRow', dlqId: 'dlq-9-9' }]);
  const queries = ['?scenario=incident&step=3&a=garbage', '?scenario=incident&step=3&a=r.r.zz', '?scenario=incident&step=3&a=',
    '?scenario=incident&step=3&a=%E0%A4%A', long, '?scenario=incident&step=3&a=' + bad, '?scenario=incident&a=p:dlq-1-1',
    '?scenario=incident&step=3&a=r&a=r.r', '?scenario=bogus&a=r', '?a=r.r'];
  queries.forEach((q) => {
    let c;
    assert.doesNotThrow(() => { c = openHQ(q); c.getModel(); }, q);
  });
  assert.equal(openHQ('?scenario=incident&step=3&a=garbage').actions().length, 3);
  assert.equal(openHQ(long).actions().length, 3);
  // The engine tolerates unknown ids, so stub a replay that throws: the step logic must win.
  const throwing = Object.assign({}, Engine, { getState: function (s, a) { if (a.some(function (x) { return x.dlqId === 'dlq-9-9'; })) throw new Error('replay'); return Engine.getState(s, a); } });
  assert.equal(HQ.controller.createController(throwing, '?scenario=incident&step=3&a=' + bad, {}).actions().length, 3);
  assert.equal(openHQ('?scenario=incident&a=garbage').actions().length, Engine.PRELUDE.incident.length);
});
