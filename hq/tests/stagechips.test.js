'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadHQ } = require('./helpers/load');

const { Engine, HQ } = loadHQ();
const ARCH = 'Policy modeled, not live: hot to warm 30 d, warm to cold 180 d, retention 2555 d';
const NAMES = ['Generation', 'Collection/Ingestion', 'Processing/Preparation', 'Storage', 'Governance',
  'Analysis/Modeling', 'Visualization', 'Archiving/Retirement'];

function st(scenario, k) { return Engine.getState(scenario, Engine.AUTOPLAY[scenario].slice(0, k)); }
function chips(scenario, k) {
  return HQ.viewmodel.stageChips(st(scenario, k), { exportRows: 20, tiering: Engine.TIERING_DEFAULTS });
}
const G = 'green', A = 'amber', R = 'red', N = 'grey';

// [scenario, k, {chipId: [health, text]}]  (6 and 8 are checked for every state separately)
const TABLE = [
  ['healthy', 0, { 1: [G, 'Source ready'], 2: [N, 'No export yet'], 3: [N, 'Waiting for first export'],
    4: [N, 'Waiting for first export'], 5: [G, 'Gate closed'], 7: [N, 'Waiting for first export'] }],
  ['healthy', 1, { 1: [G, 'Source sent clean data'], 2: [G, 'Landed 20 rows unchanged'], 3: [G, 'All rows published'],
    4: [G, '20 rows in production'], 5: [G, 'Gate closed'], 7: [G, 'KPIs current as of Batch 1'] }],
  ['incident', 2, { 1: [G, 'Source sent clean data'], 2: [G, 'Landed 20 rows unchanged'], 3: [G, 'All rows published'],
    4: [G, '40 rows in production'], 5: [G, 'Gate closed'], 7: [G, 'KPIs current as of Batch 2'] }],
  ['incident', 3, { 1: [A, 'Source sent 9 malformed rows'], 2: [G, 'Landed 20 rows unchanged'], 3: [A, '11 rows held'],
    4: [G, '40 rows in production'], 5: [R, 'Gate open: 9 rows to resolve'], 7: [A, 'KPIs held at Batch 2'] }],
  ['incident', 8, { 1: [A, 'Source sent 4 malformed rows'], 3: [A, '16 rows held'], 5: [R, 'Gate open: 4 rows to resolve'] }],
  ['incident', 12, { 1: [G, 'Source sent clean data'], 3: [A, '16 rows held'], 5: [R, 'Gate open: ready to retry'],
    7: [A, 'KPIs held at Batch 2'] }],
  ['incident', 13, { 5: [R, 'Gate open: ready to retry'] }],
  ['incident', 14, { 3: [A, '16 rows held'], 5: [A, 'Trial batch pending'], 7: [A, 'KPIs at Batch 2, trial batch pending'] }],
  ['incident', 15, { 2: [G, 'Landed 20 rows unchanged'], 3: [G, 'All rows published'], 4: [G, '76 rows in production'],
    5: [A, 'Alert acknowledged'], 7: [G, 'KPIs current as of Batch 4'] }],
  ['incident', 16, { 5: [G, 'Gate closed'] }]
];

for (const [scenario, k, expect] of TABLE) {
  test(`stage chips: ${scenario} k=${k}`, () => {
    const cs = chips(scenario, k);
    assert.strictEqual(cs.length, 8);
    cs.forEach((c, i) => {
      assert.strictEqual(c.id, i + 1);
      assert.strictEqual(c.name, NAMES[i]);
    });
    for (const id of Object.keys(expect)) {
      assert.deepStrictEqual([cs[id - 1].health, cs[id - 1].text], expect[id], `chip ${id}`);
    }
    assert.deepStrictEqual([cs[5].health, cs[5].text], [N, 'Not in this slice']);
    assert.deepStrictEqual([cs[7].health, cs[7].text], [N, ARCH]);
  });
}

test('stage chips: healthy k=0 has six grey chips', () => {
  assert.strictEqual(chips('healthy', 0).filter(c => c.health === N).length, 6);
});

test('stage chips: no chip is green in every scripted state; 6 and 8 always grey', () => {
  const all = TABLE.map(([s, k]) => chips(s, k));
  for (let i = 0; i < 8; i++) {
    assert.ok(all.some(cs => cs[i].health !== G), `chip ${i + 1} is always green`);
  }
  for (const cs of all) { assert.strictEqual(cs[5].health, N); assert.strictEqual(cs[7].health, N); }
});

test('stage chips: counts come from state, not constants', () => {
  const s = st('incident', 3);
  s.dlq = s.dlq.slice(0, 2);
  const cs = HQ.viewmodel.stageChips(s, { exportRows: 7, tiering: Engine.TIERING_DEFAULTS });
  assert.strictEqual(cs[0].text, 'Source sent 2 malformed rows');
  assert.strictEqual(cs[1].text, 'Landed 7 rows unchanged');
  assert.strictEqual(cs[4].text, 'Gate open: 2 rows to resolve');
});
