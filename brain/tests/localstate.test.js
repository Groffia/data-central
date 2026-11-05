'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadBrain } = require('./helpers/load');

const L = loadBrain();
const LS = L.Brain.localstate;
const J = (x) => JSON.parse(JSON.stringify(x));

test('initial: nothing selected, nothing erased, no hold, no message', () => {
  assert.deepStrictEqual(J(LS.initial()), { selectedNode: '', selectedSubject: '', erased: [], legalHold: false, message: '' });
});

test('normalize keeps a valid state and repairs anything else to the initial state, never throwing', () => {
  const good = { selectedNode: 'patient_id', selectedSubject: 'TMH-P-004821', erased: ['TMH-P-004821'], legalHold: true, message: 'm' };
  assert.deepStrictEqual(J(LS.normalize(good)), good);
  [undefined, null, 7, 'x', [], true].forEach((bad) => assert.deepStrictEqual(J(LS.normalize(bad)), J(LS.initial())));
  assert.deepStrictEqual(J(LS.normalize({ erased: [1, 'a', 'a', null, 'b'], legalHold: 'yes', selectedNode: 5, message: {} })),
    { selectedNode: '', selectedSubject: '', erased: ['a', 'b'], legalHold: false, message: '' });
});

test('normalize returns fresh objects and does not mutate its input', () => {
  const s = Object.freeze({ selectedNode: '', selectedSubject: '', erased: Object.freeze(['a']), legalHold: false, message: '' });
  const n = LS.normalize(s);
  assert.notStrictEqual(n, s);
  assert.notStrictEqual(n.erased, s.erased);
  n.erased.push('z');
  assert.deepStrictEqual(J(s.erased), ['a']);
});
