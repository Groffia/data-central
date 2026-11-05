'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadShared } = require('./helpers/load');

const { Shared } = loadShared();

test('plural: only 1 is singular', () => {
  const p = Shared.format.plural;
  assert.strictEqual(p(1, 'row', 'rows'), 'row');
  assert.strictEqual(p(0, 'row', 'rows'), 'rows');
  assert.strictEqual(p(2, 'row', 'rows'), 'rows');
  assert.strictEqual(p(20, 'row', 'rows'), 'rows');
});
