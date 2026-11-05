'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadBrain } = require('./helpers/load');

const L = loadBrain();
const V = L.Brain.viewmodel;
const E = L.Engine;
const J = (x) => JSON.parse(JSON.stringify(x));
const SENSITIVE = E.getContract().fields.filter((f) => f.sensitive).map((f) => f.name);
const build = (sc, step) => J(V.buildViewModel({ scenario: sc, actions: E.actionsForStep(sc, step), step: step, links: {} }));

test('opening state: nothing is quarantined, with the empty-state string', () => {
  const m = build('healthy', 4);
  assert.deepStrictEqual(m.phi.rows, []);
  assert.strictEqual(m.phi.holdingCount, 0);
  assert.strictEqual(m.phi.emptyText, 'No rows are quarantined in this run.');
});

test('summary line, stage and title, and the fixed engine-spec line', () => {
  const m = build('healthy', 4);
  assert.strictEqual(m.phi.stage, 'Stage 5: Management/Governance');
  assert.strictEqual(m.phi.title, 'Sensitive fields and quarantine');
  assert.strictEqual(m.phi.summaryText, '5 of 10 contract fields are marked sensitive');
  assert.deepStrictEqual(m.phi.sensitiveFields, SENSITIVE);
  assert.strictEqual(m.phi.note, 'Holding bad rows out of production is not privacy protection: the Silver layer keeps these fields by design.');
});

test('incident step 3: nine rows, each with at least one sensitive field name, count equal to the engine figure', () => {
  const m = build('incident', 3);
  const st = E.getState('incident', E.actionsForStep('incident', 3));
  assert.strictEqual(m.phi.rows.length, 9);
  assert.strictEqual(m.phi.holdingCount, st.businessCase.phiRowsQuarantined);
  assert.strictEqual(m.phi.holdingCount, 9);
  m.phi.rows.forEach((r, i) => {
    assert.strictEqual(r.id, st.dlq[i].dlqId);
    assert.strictEqual(r.batch, 'Batch 3');
    assert.strictEqual(r.status, 'open');
    assert.ok(r.fields.length >= 1 && r.fields.every((f) => SENSITIVE.includes(f)));
    assert.strictEqual(r.fieldsText, r.fields.join(', '));
  });
});

test('renamed-column rows report contract names, not camelCase keys', () => {
  const m = build('incident', 3);
  const st = E.getState('incident', E.actionsForStep('incident', 3));
  const renamed = st.dlq.map((d, i) => [d, i]).filter(([d]) => 'patientId' in d.payload);
  assert.strictEqual(renamed.length, 5);
  renamed.forEach(([, i]) => assert.deepStrictEqual(m.phi.rows[i].fields, SENSITIVE));
  assert.ok(!JSON.stringify(m.phi).includes('patientId'));
});

test('a row with a null patient id lists the fields it still holds', () => {
  const m = build('incident', 3);
  const st = E.getState('incident', E.actionsForStep('incident', 3));
  const i = st.dlq.findIndex((d) => d.payload.patient_id === null);
  assert.ok(i >= 0);
  assert.deepStrictEqual(m.phi.rows[i].fields, SENSITIVE.filter((f) => f !== 'patient_id'));
});

test('incident step 16: repaired and discarded statuses, same count', () => {
  const m = build('incident', 16);
  assert.strictEqual(m.phi.rows.length, 9);
  assert.strictEqual(m.phi.rows.filter((r) => r.status === 'repaired').length, 5);
  assert.strictEqual(m.phi.rows.filter((r) => r.status === 'discarded').length, 4);
  assert.strictEqual(m.phi.holdingCount, 9);
});

test('no sensitive value reaches the model: injected names, zips, birth dates, ids and the injection string', () => {
  const st = E.getState('incident', E.actionsForStep('incident', 3));
  const text = JSON.stringify(build('incident', 3).phi);
  st.dlq.forEach((d) => {
    const p = d.payload;
    ['patient_name', 'patientName', 'patient_zip5', 'patientZip5', 'birth_date', 'birthDate', 'patient_id', 'patientId'].forEach((k) => {
      if (typeof p[k] === 'string' && p[k].length > 2) assert.ok(!text.includes(p[k]), k + ' ' + p[k]);
    });
  });
  assert.ok(!text.includes('DROP TABLE'));
  E.getContract().goldenRows.forEach((g) => { assert.ok(!text.includes(g.patient_name)); assert.ok(!text.includes(g.birth_date)); });
});
