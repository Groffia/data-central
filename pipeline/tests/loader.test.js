'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { loadPipeline } = require('./helpers/load');

test('Pipeline namespace and Shared are present after loading', () => {
  const L = loadPipeline();
  assert.ok(L.Engine && typeof L.Engine === 'object');
  assert.ok(L.Pipeline && typeof L.Pipeline === 'object');
  assert.ok(L.Shared && L.Shared.vendor && typeof L.Shared.vendor === 'object');
});

test('modules that exist are attached; main is never loaded', () => {
  const L = loadPipeline();
  ['viewmodel', 'render', 'controller'].forEach(function (m) {
    assert.ok(L.Pipeline[m] && typeof L.Pipeline[m] === 'object', m);
  });
  assert.strictEqual(L.Pipeline.main, undefined);
});

test('missing src files are skipped without error', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeload-'));
  fs.writeFileSync(path.join(d, 'viewmodel.js'),
    '(function () { globalThis.Pipeline = globalThis.Pipeline || {}; globalThis.Pipeline.viewmodel = { only: true }; })();');
  const L = loadPipeline({ srcDir: d });
  assert.strictEqual(L.Pipeline.viewmodel.only, true);
  assert.strictEqual(L.Pipeline.render, undefined);
  const empty = loadPipeline({ srcDir: fs.mkdtempSync(path.join(os.tmpdir(), 'pipeload-')) });
  assert.strictEqual(empty.Pipeline, undefined);
  assert.ok(empty.Shared);
});

test('no document, window or location in the vm context', () => {
  const L = loadPipeline();
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
