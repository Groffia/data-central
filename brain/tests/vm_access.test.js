'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadBrain } = require('./helpers/load');

const L = loadBrain();
const V = L.Brain.viewmodel;
const E = L.Engine;
const J = (x) => JSON.parse(JSON.stringify(x));
const GOLDEN = E.getContract().goldenRows.map((g) => g.patient_id);
function build(sc, step, local) {
  return J(V.buildViewModel({ scenario: sc, actions: E.actionsForStep(sc, step), step: step, links: {}, local: local }));
}

test('stage, title and the verbatim label', () => {
  const a = build('healthy', 4).access;
  assert.strictEqual(a.stage, 'Stage 5: Management/Governance');
  assert.strictEqual(a.title, 'Access log');
  assert.strictEqual(a.label, 'A simulated access log: it records what the pipeline and the operator did in this run.');
  assert.strictEqual(a.emptyText, 'No data has moved yet.');
});

test('rows are the engine access log, newest first, with formatted fields', () => {
  const acts = E.actionsForStep('incident', 3);
  const log = J(E.accessLog('incident', acts));
  const a = build('incident', 3).access;
  assert.strictEqual(a.rows.length, 10);
  assert.deepStrictEqual(a.rows.map((r) => r.seq), log.map((e) => e.seq).reverse());
  a.rows.forEach((r) => {
    const e = log[r.seq - 1];
    assert.strictEqual(r.time, e.iso.slice(11, 19) + ' UTC');
    assert.deepStrictEqual([r.actor, r.action, r.object, r.purpose], [e.actor, e.action, e.object, e.purpose]);
    assert.strictEqual(r.rows, e.rows);
    assert.strictEqual(r.rowsText, e.rows + ' ' + (e.rows === 1 ? 'row' : 'rows'));
    assert.strictEqual(r.fieldsText, e.phiFields.length ? e.phiFields.join(', ') : 'none');
  });
});

test('entry counts: 12 at healthy step 4, 10 at incident step 3, none at the floor of healthy', () => {
  assert.strictEqual(build('healthy', 4).access.rows.length, 12);
  assert.strictEqual(build('incident', 3).access.rows.length, 10);
  const floor = E.PRELUDE.healthy.length;
  assert.strictEqual(build('healthy', floor).access.rows.length, 0);
});

test('operator entries appear at step 16', () => {
  const a = build('incident', 16).access;
  assert.strictEqual(a.rows.filter((r) => r.actor === 'operator').length, 9);
});

test('erased subjects appear first, one entry each, in the order erased', () => {
  const local = { erased: [GOLDEN[0], GOLDEN[2]] };
  const a = build('incident', 3, local).access;
  assert.strictEqual(a.rows.length, 12);
  assert.deepStrictEqual(a.rows.slice(0, 2).map((r) => [r.actor, r.action, r.object]), [
    ['privacy-office', 'ERASE', 'subject ' + GOLDEN[2]],
    ['privacy-office', 'ERASE', 'subject ' + GOLDEN[0]],
  ]);
  const later = build('incident', 8, local).access;
  assert.strictEqual(later.rows[0].action, 'ERASE');
  assert.strictEqual(later.rows[1].action, 'ERASE');
});

test('ids that are not strings or are repeated are ignored; a bad local state gives the plain log', () => {
  const plain = build('incident', 3).access.rows.length;
  assert.strictEqual(build('incident', 3, { erased: [1, null, {}, GOLDEN[0], GOLDEN[0], 'TMH-P-999999'] }).access.rows.length, plain + 1);
  [null, 7, 'x', [], { erased: 'x' }, { erased: null }].forEach((bad) => assert.strictEqual(build('incident', 3, bad).access.rows.length, plain));
});

test('the access view never carries sensitive values: only object names and the subject id of an erasure', () => {
  const text = JSON.stringify(build('incident', 3, { erased: [GOLDEN[0]] }).access);
  E.getContract().goldenRows.forEach((g) => { assert.ok(!text.includes(g.patient_name)); assert.ok(!text.includes(g.birth_date)); assert.ok(!text.includes(g.patient_zip5)); });
  assert.ok(!text.includes('DROP TABLE'));
});
