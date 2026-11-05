'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadBrain } = require('./helpers/load');

const L = loadBrain();
const LS = L.Brain.localstate;
const J = (x) => JSON.parse(JSON.stringify(x));

test('initial: nothing selected, nothing erased, no hold, no message', () => {
  assert.deepStrictEqual(J(LS.initial()), { selectedNode: '', selectedSubject: '', erased: [], legalHold: false, showList: false, message: '' });
});

test('normalize keeps a valid state and repairs anything else to the initial state, never throwing', () => {
  const good = { selectedNode: 'patient_id', selectedSubject: 'TMH-P-004821', erased: ['TMH-P-004821'], legalHold: true, showList: true, message: 'm' };
  assert.deepStrictEqual(J(LS.normalize(good)), good);
  [undefined, null, 7, 'x', [], true].forEach((bad) => assert.deepStrictEqual(J(LS.normalize(bad)), J(LS.initial())));
  assert.deepStrictEqual(J(LS.normalize({ erased: [1, 'a', 'a', null, 'b'], legalHold: 'yes', showList: 1, selectedNode: 5, message: {} })),
    { selectedNode: '', selectedSubject: '', erased: ['a', 'b'], legalHold: false, showList: false, message: '' });
});

test('normalize returns fresh objects and does not mutate its input', () => {
  const s = Object.freeze({ selectedNode: '', selectedSubject: '', erased: Object.freeze(['a']), legalHold: false, showList: false, message: '' });
  const n = LS.normalize(s);
  assert.notStrictEqual(n, s);
  assert.notStrictEqual(n.erased, s.erased);
  n.erased.push('z');
  assert.deepStrictEqual(J(s.erased), ['a']);
});

// ----- reduce -----
const E = L.Engine;
const BLOCK = 'Erasure blocked: legal hold is on.';
const IDS = E.buildPatientPool().map((p) => p.patient_id);
const run = (s, ...actions) => actions.reduce((st, a) => LS.reduce(st, a), s);
const deepFreeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };

test('selectNode: a known lineage node or empty to clear; anything else changes nothing', () => {
  let s = run(LS.initial(), { type: 'selectNode', id: 'patient_id' });
  assert.strictEqual(s.selectedNode, 'patient_id');
  assert.strictEqual(run(s, { type: 'selectNode', id: '' }).selectedNode, '');
  [{ id: 'nope' }, { id: 5 }, {}, { id: null }].forEach((a) => assert.deepStrictEqual(J(run(s, Object.assign({ type: 'selectNode' }, a))), J(s)));
});

test('selectSubject: a cohort id or empty to clear; anything else changes nothing', () => {
  const s = run(LS.initial(), { type: 'selectSubject', id: IDS[3] });
  assert.strictEqual(s.selectedSubject, IDS[3]);
  assert.strictEqual(run(s, { type: 'selectSubject', id: '' }).selectedSubject, '');
  ['TMH-P-999999', 7, null, undefined, {}].forEach((id) => assert.deepStrictEqual(J(run(s, { type: 'selectSubject', id: id })), J(s)));
});

test('eraseSubject: erases the selected subject once, in order; a message each time', () => {
  let s = run(LS.initial(), { type: 'selectSubject', id: IDS[0] }, { type: 'eraseSubject' });
  assert.deepStrictEqual(J(s.erased), [IDS[0]]);
  assert.strictEqual(s.message, 'Erased ' + IDS[0]);
  s = run(s, { type: 'selectSubject', id: IDS[2] }, { type: 'eraseSubject' });
  assert.deepStrictEqual(J(s.erased), [IDS[0], IDS[2]]);
  const again = run(s, { type: 'eraseSubject' });
  assert.deepStrictEqual(J(again.erased), [IDS[0], IDS[2]]);
  assert.strictEqual(again.message, IDS[2] + ' is already erased');
});

test('eraseSubject with nothing selected changes nothing and says so', () => {
  const s = run(LS.initial(), { type: 'eraseSubject' });
  assert.deepStrictEqual(J(s.erased), []);
  assert.strictEqual(s.message, 'Choose a subject first');
});

test('legal hold on blocks erasure with the engine reason; off allows it again', () => {
  let s = run(LS.initial(), { type: 'holdOn' }, { type: 'selectSubject', id: IDS[0] }, { type: 'eraseSubject' });
  assert.strictEqual(s.legalHold, true);
  assert.deepStrictEqual(J(s.erased), []);
  assert.strictEqual(s.message, BLOCK);
  s = run(s, { type: 'holdOff' });
  assert.strictEqual(s.legalHold, false);
  assert.strictEqual(s.message, 'Legal hold off');
  s = run(s, { type: 'eraseSubject' });
  assert.deepStrictEqual(J(s.erased), [IDS[0]]);
  assert.strictEqual(run(LS.initial(), { type: 'holdOn' }).message, 'Legal hold on');
});

test('an erasure made before the hold stays when the hold comes on', () => {
  const s = run(LS.initial(), { type: 'selectSubject', id: IDS[0] }, { type: 'eraseSubject' }, { type: 'holdOn' });
  assert.deepStrictEqual(J(s.erased), [IDS[0]]);
  assert.strictEqual(s.legalHold, true);
});

test('resetErasures clears the erased list only; reset returns the initial state', () => {
  let s = run(LS.initial(), { type: 'selectSubject', id: IDS[0] }, { type: 'eraseSubject' }, { type: 'holdOn' });
  const r = run(s, { type: 'resetErasures' });
  assert.deepStrictEqual(J(r.erased), []);
  assert.strictEqual(r.message, 'Erasures reset');
  assert.strictEqual(r.legalHold, true);
  assert.strictEqual(r.selectedSubject, IDS[0]);
  assert.deepStrictEqual(J(run(s, { type: 'reset' })), J(LS.initial()));
});

test('reduce never mutates or throws: frozen input, bad state, bad action', () => {
  const frozen = deepFreeze(LS.initial());
  assert.doesNotThrow(() => LS.reduce(frozen, { type: 'holdOn' }));
  [undefined, null, 5, 'x', {}, { type: 5 }, { type: 'nope' }, []].forEach((a) => {
    assert.doesNotThrow(() => LS.reduce(frozen, a));
    assert.deepStrictEqual(J(LS.reduce(frozen, a)), J(frozen));
  });
  [undefined, null, 5, 'x', [], { erased: 'x' }].forEach((bad) => {
    assert.doesNotThrow(() => LS.reduce(bad, { type: 'holdOn' }));
    assert.strictEqual(LS.reduce(bad, { type: 'holdOn' }).legalHold, true);
  });
});

test('toggleList flips the edge-list toggle and clears the message; reset and scenario change close it', () => {
  let s = run(LS.initial(), { type: 'holdOn' }, { type: 'toggleList' });
  assert.strictEqual(s.showList, true);
  assert.strictEqual(s.message, '');
  assert.strictEqual(run(s, { type: 'toggleList' }).showList, false);
  assert.strictEqual(run(s, { type: 'reset' }).showList, false);
  assert.strictEqual(run(s, { type: 'resetErasures' }).showList, true);
});
