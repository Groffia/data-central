'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadBrain } = require('./helpers/load');

const L = loadBrain();
const raw = L.Brain.lineage;
// Arrays made inside the vm context are another realm's: copy them so deepStrictEqual compares plain values.
const lin = {
  nodes: Array.from(raw.nodes), edges: Array.from(raw.edges).map((e) => Array.from(e)),
  downstream: (x) => Array.from(raw.downstream(x)), upstream: (x) => Array.from(raw.upstream(x)), kpisFor: (x) => Array.from(raw.kpisFor(x)),
};
const contract = L.Engine.getContract();
const FIELDS = contract.fields.map((f) => f.name);
const SENSITIVE = contract.fields.filter((f) => f.sensitive).map((f) => f.name);
const NAMES = contract.names;
const byId = new Map(lin.nodes.map((n) => [n.id, n]));
const ids = lin.nodes.map((n) => n.id);
const kpiIds = NAMES.kpis;
const sorted = (a) => a.slice().sort();

test('nodes: unique ids, layers 0 to 4, and the layer of every node matches its kind', () => {
  assert.strictEqual(new Set(ids).size, ids.length);
  lin.nodes.forEach((n) => assert.ok(Number.isInteger(n.layer) && n.layer >= 0 && n.layer <= 4, n.id));
  lin.nodes.forEach((n) => assert.strictEqual(typeof n.label, 'string'));
  FIELDS.forEach((f) => assert.strictEqual(byId.get(f).layer, 0, f));
  assert.strictEqual(byId.get(NAMES.bronze).layer, 1);
  assert.strictEqual(byId.get(NAMES.silver).layer, 2);
  NAMES.gold.forEach((g) => assert.strictEqual(byId.get(g).layer, 3, g));
  kpiIds.forEach((k) => assert.strictEqual(byId.get(k).layer, 4, k));
  assert.strictEqual(lin.nodes.length, FIELDS.length + 2 + NAMES.gold.length + kpiIds.length);
});

test('every table, model and KPI label exists in the engine contract names; every contract field is a source node', () => {
  const expected = [NAMES.bronze, NAMES.silver, ...NAMES.gold, ...kpiIds, ...FIELDS];
  assert.deepStrictEqual(sorted(lin.nodes.map((n) => n.label)), sorted(expected));
  assert.deepStrictEqual(sorted(ids), sorted(expected), 'id equals label');
});

test('sensitive flags equal the contract flags exactly', () => {
  assert.deepStrictEqual(sorted(lin.nodes.filter((n) => n.sensitive === true).map((n) => n.id)), sorted(SENSITIVE));
  lin.nodes.filter((n) => n.layer > 0).forEach((n) => assert.ok(!n.sensitive, n.id));
});

test('edges: no duplicates, known endpoints, strictly forward in layers, none leaves a KPI, no orphan node', () => {
  const keys = lin.edges.map((e) => e.join('>'));
  assert.strictEqual(new Set(keys).size, keys.length);
  lin.edges.forEach(([a, b]) => {
    assert.ok(byId.has(a) && byId.has(b), a + '>' + b);
    assert.ok(byId.get(b).layer > byId.get(a).layer, a + '>' + b);
    assert.ok(byId.get(a).layer < 4, 'no edge leaves a KPI: ' + a);
  });
  ids.forEach((id) => assert.ok(lin.edges.some(([a, b]) => a === id || b === id), 'orphan ' + id));
  assert.ok(lin.edges.length >= 16 && lin.edges.length <= 30);
});

test('every KPI is reachable from a source field; every sensitive source reaches dim_patient', () => {
  kpiIds.forEach((k) => assert.ok(FIELDS.some((f) => lin.downstream(f).includes(k)), k));
  SENSITIVE.forEach((f) => assert.ok(lin.downstream(f).includes('dim_patient'), f));
});

test('downstream is field-aware: a field reaches only the models and KPIs that use it', () => {
  assert.deepStrictEqual(sorted(lin.downstream('cipher_suite')), sorted([NAMES.bronze, NAMES.silver]));
  assert.deepStrictEqual(sorted(lin.downstream('vital_value')), sorted([NAMES.bronze, NAMES.silver, 'fct_vital_observation', 'Abnormal Vital Rate']));
  const pid = lin.downstream('patient_id');
  kpiIds.forEach((k) => assert.ok(pid.includes(k), 'patient_id reaches ' + k));
  assert.ok(!lin.downstream('patient_name').includes('Bed Occupancy'));
  assert.ok(lin.downstream('patient_name').includes('30-Day Readmission Rate'));
  assert.ok(lin.downstream('patient_name').includes('dim_patient'));
});

test('downstream of a table is everything below it; of a KPI is empty', () => {
  assert.deepStrictEqual(sorted(lin.downstream(NAMES.silver)), sorted([...NAMES.gold, ...kpiIds]));
  assert.deepStrictEqual(sorted(lin.downstream(NAMES.bronze)), sorted([NAMES.silver, ...NAMES.gold, ...kpiIds]));
  kpiIds.forEach((k) => assert.deepStrictEqual(lin.downstream(k), []));
});

test('upstream is field-aware: a KPI is fed only by the fields that reach it', () => {
  const avr = lin.upstream('Abnormal Vital Rate');
  assert.ok(avr.includes('vital_value') && avr.includes('vital_code') && avr.includes(NAMES.silver) && avr.includes(NAMES.bronze));
  assert.ok(!avr.includes('cipher_suite') && !avr.includes('patient_name'));
  const bed = lin.upstream('Bed Occupancy');
  assert.ok(bed.includes('patient_id') && !bed.includes('vital_value'));
  assert.deepStrictEqual(lin.upstream('patient_id'), []);
  assert.deepStrictEqual(sorted(lin.upstream(NAMES.silver)), sorted([NAMES.bronze, ...FIELDS]));
});

test('upstream and downstream agree: a is upstream of b exactly when b is downstream of a', () => {
  ids.forEach((a) => ids.forEach((b) => {
    if (a === b) return;
    assert.strictEqual(lin.upstream(b).includes(a), lin.downstream(a).includes(b), a + ' ' + b);
  }));
});

test('kpisFor lists the affected KPIs', () => {
  assert.deepStrictEqual(lin.kpisFor('vital_value'), ['Abnormal Vital Rate']);
  assert.deepStrictEqual(lin.kpisFor('cipher_suite'), []);
  assert.deepStrictEqual(sorted(lin.kpisFor(NAMES.silver)), sorted(kpiIds));
  assert.deepStrictEqual(lin.kpisFor('Bed Occupancy'), []);
});

test('results are fresh sorted arrays; an unknown id gives empty lists', () => {
  const a = lin.downstream('patient_id');
  a.push('x');
  assert.ok(!lin.downstream('patient_id').includes('x'));
  [lin.downstream, lin.upstream, lin.kpisFor].forEach((fn) => {
    assert.deepStrictEqual(fn('nope'), []);
    assert.deepStrictEqual(fn(undefined), []);
    assert.deepStrictEqual(fn(null), []);
    assert.deepStrictEqual(fn({}), []);
  });
  [lin.downstream('patient_id'), lin.upstream('Abnormal Vital Rate')].forEach((arr) => assert.deepStrictEqual(arr, arr.slice().sort()));
});

test('the exposed nodes and edges cannot be edited from outside', () => {
  assert.ok(Object.isFrozen(raw.nodes) && Object.isFrozen(raw.edges));
  assert.ok(Array.from(raw.nodes).every((n) => Object.isFrozen(n)) && Array.from(raw.edges).every((e) => Object.isFrozen(e)));
});
