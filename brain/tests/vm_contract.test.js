'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadBrain } = require('./helpers/load');

const L = loadBrain();
const V = L.Brain.viewmodel;
const E = L.Engine;
const J = (x) => JSON.parse(JSON.stringify(x));
const LINKS = { hqBase: '../hq/', pipelineBase: '../pipeline/' };
function build(scenario, step, extra) {
  return J(V.buildViewModel(Object.assign({ scenario: scenario, actions: E.actionsForStep(scenario, step), step: step, links: LINKS, local: undefined }, extra || {})));
}

test('the model has every region key', () => {
  const m = build('healthy', 4);
  ['header', 'contract', 'phi', 'lineage', 'access', 'retention', 'erasure', 'vendor', 'notice', 'footer'].forEach((k) => assert.ok(k in m, k));
  assert.strictEqual(m.footer, 'All data is synthetic and generated deterministically (seed 42). Company names are fictional.');
  assert.strictEqual(m.notice, null);
});

test('header: title, subtitle, stepper, links for a scripted state', () => {
  const m = build('incident', 3);
  assert.strictEqual(m.header.title, 'Brain: Control and Accountability');
  assert.ok(/Tamsworth Health/.test(m.header.subtitle) && /stages 5 and 8/.test(m.header.subtitle));
  assert.strictEqual(m.header.scenario, 'incident');
  assert.deepStrictEqual([m.header.steps.n, m.header.steps.m], [3, E.AUTOPLAY.incident.length]);
  assert.strictEqual(typeof m.header.steps.text, 'string');
  assert.strictEqual(m.header.hqHref, '../hq/?scenario=incident&step=3');
  assert.strictEqual(m.header.pipelineHref, '../pipeline/?scenario=incident&step=3');
  assert.strictEqual(m.header.canBack, true);
  assert.strictEqual(m.header.canNext, true);
});

test('header: Back is off at the floor, Next is off at the end', () => {
  const floor = E.PRELUDE.incident.length;
  assert.strictEqual(build('incident', floor).header.canBack, false);
  const end = E.AUTOPLAY.incident.length;
  assert.strictEqual(build('incident', end).header.canNext, false);
});

test('header: links are null without a base, and an unsafe base is rejected', () => {
  const none = J(V.buildViewModel({ scenario: 'healthy', actions: [], step: 0, links: {} }));
  assert.strictEqual(none.header.hqHref, null);
  assert.strictEqual(none.header.pipelineHref, null);
  ['http://evil.example/', '//evil.example/', 'javascript:alert(1)', '../hq/ x', ''].forEach((b) => {
    const m = J(V.buildViewModel({ scenario: 'healthy', actions: [], step: 0, links: { hqBase: b, pipelineBase: b } }));
    assert.strictEqual(m.header.hqHref, null, b);
  });
});

test('header: a diverged state is labelled and linked with a=', () => {
  const actions = E.decodeActions('r.r.p:dlq-3-2.r');
  const m = J(V.buildViewModel({ scenario: 'incident', actions: actions, step: null, links: LINKS }));
  assert.strictEqual(m.header.steps.label, 'Custom state from HQ (4 actions)');
  assert.strictEqual(m.header.hqHref, '../hq/?scenario=incident&a=r.r.p:dlq-3-2.r');
  assert.strictEqual(m.header.pipelineHref, '../pipeline/?scenario=incident&a=r.r.p:dlq-3-2.r');
  assert.strictEqual(m.header.canBack, true);
  assert.strictEqual(m.header.canNext, true);
});

test('contract: the ten engine fields with type, rule and the sensitive flag; five are sensitive', () => {
  const m = build('healthy', 4);
  const fields = E.getContract().fields;
  assert.strictEqual(m.contract.fields.length, 10);
  m.contract.fields.forEach((f, i) => {
    assert.deepStrictEqual([f.name, f.type, f.rule, f.sensitive], [fields[i].name, fields[i].type, fields[i].rule, fields[i].sensitive]);
    assert.strictEqual(f.sensitiveText, fields[i].sensitive ? 'Yes (PHI)' : 'No');
  });
  assert.strictEqual(m.contract.fields.filter((f) => f.sensitive).length, 5);
  assert.deepStrictEqual(m.contract.primaryKey, E.getContract().primaryKey);
  assert.strictEqual(m.contract.entityField, E.getContract().entityField);
});

test('contract: stage and title strings, and the owner table (three fictional teams, objects from the engine)', () => {
  const m = build('healthy', 4);
  assert.strictEqual(m.contract.stage, 'Stage 5: Management/Governance');
  assert.strictEqual(m.contract.title, 'Data contract and ownership');
  const n = E.getContract().names;
  assert.deepStrictEqual(m.contract.owners, [
    { layer: 'Bronze', objects: n.bronze, owner: 'Clinical Informatics' },
    { layer: 'Silver', objects: n.silver, owner: 'Data Engineering' },
    { layer: 'Gold', objects: n.gold.join(', ') + ', and the KPI tiles', owner: 'Analytics' }
  ]);
});

test('a bad context gives the safe default model and never throws', () => {
  [undefined, null, 7, 'x', [], {}, { scenario: 'nope' }, { scenario: 'incident', actions: 'x' }].forEach((ctx) => {
    let m;
    assert.doesNotThrow(() => { m = J(V.buildViewModel(ctx)); });
    assert.strictEqual(m.header.title, 'Brain: Control and Accountability');
    assert.ok(m.contract && m.phi);
  });
  assert.strictEqual(J(V.buildViewModel({ scenario: 'nope' })).header.scenario, 'healthy');
});

test('the model is deterministic and does not mutate the actions', () => {
  const actions = E.actionsForStep('incident', 16);
  const copy = J(actions);
  const a = J(V.buildViewModel({ scenario: 'incident', actions: actions, step: 16, links: LINKS }));
  const b = J(V.buildViewModel({ scenario: 'incident', actions: actions, step: 16, links: LINKS }));
  assert.deepStrictEqual(a, b);
  assert.deepStrictEqual(J(actions), copy);
});

test('vendor: the lineage-and-catalog row and the access-and-audit-log row, from the shared table', () => {
  const v = build('healthy', 4).vendor;
  assert.deepStrictEqual(v.columns, ['Component', 'Databricks', 'Snowflake', 'Fabric']);
  assert.deepStrictEqual(v.rows, [
    ['Lineage and catalog', 'Unity Catalog', 'Snowflake Horizon Catalog / Atlan', 'Microsoft Purview'],
    ['Access and audit log', 'Audit log system table', 'ACCESS_HISTORY view', 'Microsoft Purview audit log']
  ]);
});
