'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadBrain } = require('./helpers/load');

const L = loadBrain();
const V = L.Brain.viewmodel;
const E = L.Engine;
const J = (x) => JSON.parse(JSON.stringify(x));
const lin = (local) => J(V.buildViewModel({ scenario: 'incident', actions: E.actionsForStep('incident', 3), step: 3, links: {}, local: local })).lineage;
const count = (arr, key, val) => arr.filter((x) => x[key] === val).length;

test('no selection: every node and edge is plain, no panel, the prompt and the closed list', () => {
  const l = lin();
  assert.strictEqual(l.stage, 'Stage 5: Management/Governance');
  assert.strictEqual(l.title, 'Lineage and impact');
  assert.strictEqual(l.nodes.length, 20);
  assert.strictEqual(l.edges.length, 21);
  assert.strictEqual(count(l.nodes, 'status', 'plain'), 20);
  assert.strictEqual(count(l.edges, 'status', 'plain'), 21);
  assert.strictEqual(l.panel, null);
  assert.strictEqual(l.selected, '');
  assert.strictEqual(l.showList, false);
  assert.strictEqual(l.prompt, 'Select a node to see what it feeds and what feeds it.');
  assert.strictEqual(l.listToggleText, 'Show as list');
  assert.strictEqual(l.summary.indexOf('Lineage graph: 20 nodes and 21 edges in five columns'), 0);
});

test('node entries carry the engine contract flags and layer names', () => {
  const l = lin();
  const sens = E.getContract().fields.filter((f) => f.sensitive).map((f) => f.name);
  assert.deepStrictEqual(l.nodes.filter((n) => n.sensitive).map((n) => n.id), sens);
  assert.deepStrictEqual(l.nodes.find((n) => n.id === 'patient_id').layerName, 'source field');
  assert.strictEqual(l.nodes.find((n) => n.id === 'fct_census_daily').layerName, 'Gold model');
  assert.strictEqual(l.nodes.find((n) => n.id === 'Bed Occupancy').layerName, 'KPI tile');
});

test('selecting vital_value: itself selected, four downstream, the rest dimmed, four hot edges, the impact text', () => {
  const l = lin({ selectedNode: 'vital_value' });
  assert.strictEqual(l.selected, 'vital_value');
  assert.strictEqual(count(l.nodes, 'status', 'selected'), 1);
  assert.deepStrictEqual(l.nodes.filter((n) => n.status === 'downstream').map((n) => n.id).sort(), ['Abnormal Vital Rate', 'bronze_tamsworth_vitals', 'fct_vital_observation', 'silver_vital_observation']);
  assert.strictEqual(count(l.nodes, 'status', 'dimmed'), 15);
  assert.strictEqual(count(l.edges, 'status', 'hot'), 4);
  assert.strictEqual(count(l.edges, 'status', 'dim'), 17);
  assert.strictEqual(l.nodes.filter((n) => n.pressed).length, 1);
  assert.strictEqual(l.panel.feedsText.indexOf('Feeds (4): '), 0);
  assert.strictEqual(l.panel.fedByText, 'Fed by (0): nothing');
  assert.strictEqual(l.panel.kpisText, 'KPI tiles affected (1): Abnormal Vital Rate');
  assert.strictEqual(l.panel.impactText, 'Dropping or retyping vital_value would break 4 downstream objects including Abnormal Vital Rate.');
});

test('selecting a field with no KPI effect, and a KPI', () => {
  const c = lin({ selectedNode: 'cipher_suite' }).panel;
  assert.strictEqual(c.kpisText, 'No KPI tile depends on it.');
  assert.strictEqual(c.impactText, 'Dropping or retyping cipher_suite would break 2 downstream objects.');
  const k = lin({ selectedNode: 'Bed Occupancy' }).panel;
  assert.strictEqual(k.kpisText, 'This is a KPI tile.');
  assert.strictEqual(k.feedsText, 'Feeds (0): nothing');
  assert.strictEqual(k.impactText, '');
  assert.ok(k.fedBy.includes('patient_id') && !k.fedBy.includes('vital_value'));
});

test('an unknown selection is treated as none; the list toggle follows the local state', () => {
  assert.strictEqual(lin({ selectedNode: 'nope' }).selected, '');
  assert.strictEqual(lin({ selectedNode: 'nope' }).panel, null);
  assert.strictEqual(lin({ showList: true }).showList, true);
  assert.strictEqual(lin({ showList: 'yes' }).showList, false);
});

test('the model agrees with the lineage module: hot edges are exactly the edges inside the highlighted set', () => {
  const sel = 'patient_id';
  const l = lin({ selectedNode: sel });
  const lit = new Set([sel, ...J(L.Brain.lineage.downstream(sel))]);
  l.edges.forEach((e) => {
    const down = new Set(J(L.Brain.lineage.downstream(sel)));
    assert.strictEqual(e.status === 'hot', lit.has(e.from) && down.has(e.to), e.from + '>' + e.to);
  });
});
