'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadBrain } = require('./helpers/load');

const L = loadBrain();
const V = L.Brain.viewmodel;
const E = L.Engine;
const J = (x) => JSON.parse(JSON.stringify(x));
const IDS = E.buildPatientPool().map((p) => p.patient_id);
const STATEMENT = "This shows how a deletion is carried out across every layer. Whether a request must be granted, and which records must be kept, depends on the law and the organization's policy. This demo does not decide that.";
const RAW_LINE = "Raw files in Bronze are immutable. Erasure destroys the subject's data key, so their rows there can no longer be read (simulated: no real keys or encryption are used).";
const EFFECTS_SENTENCE = 'The seven-day KPI tiles do not move: the KPI history is aggregate-only and holds no patient rows.';
const BLOCK = 'Erasure blocked: legal hold is on.';
function build(sc, step, local) {
  return J(V.buildViewModel({ scenario: sc, actions: E.actionsForStep(sc, step), step: step, links: {}, local: local }));
}
const busy = () => {
  const a = E.actionsForStep('incident', 3);
  return IDS.find((id) => { const f = E.subjectFootprint('incident', a, id); return f.silver > 0 && f.deadLetter > 0 && f.bronze > 0; });
};

test('stage, title and the verbatim strings', () => {
  const e = build('incident', 3).erasure;
  assert.strictEqual(e.stage, 'Stage 8: Archiving/Retirement');
  assert.strictEqual(e.title, 'Erasure');
  assert.strictEqual(e.statement, STATEMENT);
  assert.strictEqual(e.rawLine, RAW_LINE);
  assert.strictEqual(e.effectsSentence, EFFECTS_SENTENCE);
});

test('the picker lists the 40 cohort ids, the golden five first; nothing is selected at the start', () => {
  const e = build('incident', 3).erasure;
  assert.deepStrictEqual(e.options.map((o) => o.id), IDS);
  assert.strictEqual(e.options.length, 40);
  assert.deepStrictEqual(e.options.slice(0, 5).map((o) => o.id), E.getContract().goldenRows.map((g) => g.patient_id));
  assert.strictEqual(e.selected, '');
  assert.strictEqual(e.footprint, null);
  assert.strictEqual(e.canErase, false);
  assert.strictEqual(e.eraseReason, 'Choose a subject first');
  assert.strictEqual(e.canReset, false);
});

test('a selected subject: the footprint is the engine footprint before erasure, with zeros and the unreadable Bronze note after', () => {
  const id = busy();
  const e = build('incident', 3, { selectedSubject: id }).erasure;
  const f = J(E.subjectFootprint('incident', E.actionsForStep('incident', 3), id));
  assert.strictEqual(e.footprint.subject, id);
  assert.deepStrictEqual(e.footprint.layers.map((l) => l.layer), ['Bronze (raw files)', 'Staging', 'Silver (production)', 'Dead-letter queue', 'Dead-letter queue, matched by name, ZIP and birth date', 'dim_patient']);
  assert.deepStrictEqual(e.footprint.layers.map((l) => l.before), [f.bronze, f.staging, f.silver, f.deadLetter, f.deadLetterByFields, f.dimPatient]);
  assert.deepStrictEqual(e.footprint.layers.map((l) => l.after), [f.bronze, 0, 0, 0, 0, 0]);
  assert.strictEqual(e.footprint.layers[0].afterText, f.bronze + ' (unreadable)');
  e.footprint.layers.slice(1).forEach((l) => assert.strictEqual(l.afterText, '0'));
  assert.ok(f.bronze > 0 && f.silver > 0);
  assert.strictEqual(e.canErase, true);
  assert.strictEqual(e.eraseReason, '');
});

test('after an erasure: effects equal the engine live sample before and after; checks pass with the engine labels', () => {
  const id = busy();
  const acts = E.actionsForStep('incident', 3);
  const e = build('incident', 3, { selectedSubject: id, erased: [id] }).erasure;
  const before = E.liveSampleCheck(E.getState('incident', acts));
  const after = E.liveSampleCheck(E.eraseSubjects('incident', acts, [id]).state);
  assert.deepStrictEqual(J(e.effects), {
    before: { published: before.published, abnormal: before.abnormal },
    after: { published: after.published, abnormal: after.abnormal },
    text: 'Published readings: ' + before.published + ' before, ' + after.published + ' after. Abnormal readings: ' + before.abnormal + ' before, ' + after.abnormal + ' after.'
  });
  const f = E.subjectFootprint('incident', acts, id);
  assert.strictEqual(before.published - after.published, f.silver);
  const engineChecks = J(E.eraseSubjects('incident', acts, [id]).checks);
  assert.deepStrictEqual(e.checks.map((c) => [c.id, c.label, c.pass]), engineChecks.map((c) => [c.id, c.label, c.pass]));
  e.checks.forEach((c) => { assert.strictEqual(c.pass, true); assert.strictEqual(c.passText, 'Pass'); assert.strictEqual(c.mark, '✓'); });
  assert.deepStrictEqual(e.erased, [id]);
  assert.strictEqual(e.canErase, false);
  assert.strictEqual(e.eraseReason, 'Erased ' + id, 'after a successful Erase the status matches the live line');
  assert.strictEqual(e.canReset, true);
  const again = build('incident', 3, { selectedSubject: id, erased: [id], message: id + ' is already erased' }).erasure;
  assert.strictEqual(again.eraseReason, 'Already erased', 'only a repeat attempt says Already erased');
  assert.strictEqual(again.canErase, false);
});

test('a subject whose dead-letter row has a null or injected id shows that row in the matched-by-fields line, and it goes after erasure', () => {
  const acts = E.actionsForStep('incident', 3);
  const e = build('incident', 3, { selectedSubject: 'TMH-P-012004' }).erasure;
  const row = e.footprint.layers.find((l) => /matched by name, ZIP and birth date/.test(l.layer));
  assert.deepStrictEqual([row.before, row.after, row.afterText], [1, 0, '0']);
  assert.strictEqual(J(E.subjectFootprint('incident', acts, 'TMH-P-012004')).deadLetterByFields, 1);
  const done = build('incident', 3, { selectedSubject: 'TMH-P-012004', erased: ['TMH-P-012004'] });
  assert.ok(!done.phi.rows.some((r) => r.id === 'dlq-3-4'), 'dlq-3-4 leaves the quarantine panel');
  assert.ok(!JSON.stringify(done).includes('Already erased'));
});

test('before any erasure there are no effects numbers and no checks, with empty-state strings', () => {
  const e = build('incident', 3, { selectedSubject: busy() }).erasure;
  assert.strictEqual(e.effects, null);
  assert.strictEqual(e.effectsEmptyText, 'No subject has been erased yet.');
  assert.deepStrictEqual(e.checks, []);
  assert.strictEqual(e.checksEmptyText, 'Checks appear after an erasure.');
  assert.deepStrictEqual(e.erased, []);
});

test('the quarantine panel follows the erasure: the subject\'s dead-letter rows leave it, the others stay', () => {
  const id = busy();
  const acts = E.actionsForStep('incident', 3);
  const f = E.subjectFootprint('incident', acts, id);
  const plain = build('incident', 3).phi;
  const erased = build('incident', 3, { erased: [id] }).phi;
  assert.strictEqual(plain.rows.length, 9);
  assert.strictEqual(erased.rows.length, 9 - f.deadLetter);
  assert.strictEqual(erased.holdingCount, erased.rows.length);
});

test('stepping keeps the subject erased and the checks passing, at every step of both scenarios', () => {
  const id = IDS[1];
  for (const sc of ['healthy', 'incident']) {
    for (let step = E.PRELUDE[sc].length; step <= E.AUTOPLAY[sc].length; step++) {
      const e = build(sc, step, { selectedSubject: id, erased: [id] }).erasure;
      assert.deepStrictEqual(e.erased, [id], sc + step);
      e.checks.forEach((c) => assert.strictEqual(c.pass, true, sc + step + c.id));
      assert.strictEqual(e.checks.length, 6);
    }
  }
});

test('legal hold: the button is disabled with the verbatim reason, and existing erasures stay applied', () => {
  const id = busy();
  const e = build('incident', 3, { selectedSubject: id, legalHold: true }).erasure;
  assert.strictEqual(e.canErase, false);
  assert.strictEqual(e.eraseReason, BLOCK);
  const kept = build('incident', 3, { selectedSubject: id, erased: [id], legalHold: true }).erasure;
  assert.strictEqual(kept.checks.length, 6);
  assert.strictEqual(kept.canReset, true);
});

test('no sensitive value on the erasure panel: only patient ids, counts and the fixed strings', () => {
  const id = busy();
  const text = JSON.stringify(build('incident', 3, { selectedSubject: id, erased: [id] }).erasure);
  E.getContract().goldenRows.forEach((g) => { assert.ok(!text.includes(g.patient_name)); assert.ok(!text.includes(g.birth_date)); assert.ok(!text.includes(g.patient_zip5)); });
  E.buildPatientPool().forEach((p) => { assert.ok(!text.includes(p.patient_name)); assert.ok(!text.includes(p.birth_date)); });
  assert.ok(!text.includes('DROP TABLE'));
});

test('bad local state: the panel still builds with nothing selected', () => {
  [null, 7, 'x', { selectedSubject: 'TMH-P-999999', erased: ['nope'] }].forEach((bad) => {
    const e = build('healthy', 4, bad).erasure;
    assert.ok(Array.isArray(e.options));
    assert.strictEqual(e.checks.length, 0);
  });
});

test('a subject whose raw row sits behind a dead-letter row shows Bronze 2 and 2 (unreadable), for both field-matched patients', () => {
  ['TMH-P-012004', 'TMH-P-536398'].forEach((id) => {
    const e = build('incident', 3, { selectedSubject: id, erased: [id] }).erasure;
    const b = e.footprint.layers[0];
    assert.deepStrictEqual([b.before, b.after, b.afterText], [2, 2, '2 (unreadable)'], id);
    const c = e.checks.find((x) => x.id === 'bronze-unreadable');
    assert.strictEqual(c.pass, true, id);
    assert.strictEqual(e.checks.length, 6);
  });
});
