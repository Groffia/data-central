'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { loadBrain } = require('./helpers/load');

test('Brain namespace and Shared are present after loading', () => {
  const L = loadBrain();
  assert.ok(L.Engine && typeof L.Engine === 'object');
  assert.ok(L.Brain && typeof L.Brain === 'object');
  assert.ok(L.Shared && L.Shared.vendor && typeof L.Shared.vendor === 'object');
});

test('modules that exist are attached; main is never loaded', () => {
  const L = loadBrain();
  ['lineage', 'viewmodel', 'graph', 'localstate', 'render', 'controller'].forEach(function (m) {
    assert.ok(L.Brain[m] && typeof L.Brain[m] === 'object', m);
  });
  assert.strictEqual(L.Brain.main, undefined);
});

test('missing src files are skipped without error', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'brainload-'));
  fs.writeFileSync(path.join(d, 'viewmodel.js'),
    '(function () { globalThis.Brain = globalThis.Brain || {}; globalThis.Brain.viewmodel = { only: true }; })();');
  const L = loadBrain({ srcDir: d });
  assert.strictEqual(L.Brain.viewmodel.only, true);
  assert.strictEqual(L.Brain.render, undefined);
  const empty = loadBrain({ srcDir: fs.mkdtempSync(path.join(os.tmpdir(), 'brainload-')) });
  assert.strictEqual(empty.Brain, undefined);
  assert.ok(empty.Shared);
});

test('no document, window or location in the vm context', () => {
  const L = loadBrain();
  ['document', 'window', 'location', 'setTimeout', 'localStorage'].forEach(function (n) {
    assert.strictEqual(vm.runInContext('typeof ' + n, L.context), 'undefined', n);
  });
});

test('every src file is a classic script: no import/require, starts with an IIFE', () => {
  const dir = path.join(__dirname, '..', 'src');
  fs.readdirSync(dir).filter(function (n) { return /\.js$/.test(n); }).forEach(function (n) {
    const t = fs.readFileSync(path.join(dir, n), 'utf8');
    assert.ok(!/\bimport\s|\brequire\s*\(/.test(t), n);
    assert.ok(/^\s*(?:\/\/[^\n]*\n\s*)*\(function \(\) \{/.test(t), n);
  });
});
