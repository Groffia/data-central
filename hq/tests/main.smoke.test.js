'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const FILES = ['format', 'escape', 'viewmodel', 'render', 'controller', 'autoplay', 'main'];

function boot(search) {
  const Engine = require(path.join(ROOT, '..', 'engine', 'engine.js'));
  const els = {};
  const timers = [];
  let clickHandler = null;
  const document = {
    getElementById: function (id) { return els[id] || (els[id] = { id: id, innerHTML: '', textContent: '' }); },
    addEventListener: function (type, fn) { if (type === 'click') clickHandler = fn; }
  };
  const window = {
    setTimeout: function (fn, ms) { timers.push({ fn: fn, ms: ms }); return timers.length; },
    clearTimeout: function () {}
  };
  const ctx = vm.createContext({
    Engine, document, window, location: { search: search || '' },
    performance: { now: function () { return 0; } }, console
  });
  FILES.forEach(function (n) {
    const f = path.join(ROOT, 'src', n + '.js');
    vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
  });
  function button(attrs) {
    return {
      disabled: false,
      getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null; },
      closest: function (sel) { return sel.indexOf('button') === 0 ? this : null; }
    };
  }
  function click(attrs) { clickHandler({ target: button(attrs) }); }
  return { els: els, click: click, timers: timers };
}

function status(els) { return els['region-status'].innerHTML; }

test('main.js renders eight health chips on load', () => {
  const p = boot('');
  const chips = p.els['region-stages'].innerHTML.match(/data-health="/g) || [];
  assert.strictEqual(chips.length, 8);
  assert.ok(p.els['region-footer'].innerHTML.indexOf('seed 42') >= 0);
});

test('clicking Run changes the status region', () => {
  const p = boot('');
  const before = status(p.els);
  p.click({ 'data-cmd': 'run' });
  assert.notStrictEqual(status(p.els), before);
});

test('scenario switch to incident re-renders; Watch sets caption and a timer', () => {
  const p = boot('');
  p.click({ 'data-cmd': 'scenario', 'data-scenario': 'incident' });
  assert.ok(p.els['region-header'].innerHTML.indexOf('data-scenario="incident" aria-pressed="true"') >= 0);
  p.click({ 'data-cmd': 'watch' });
  assert.ok(p.els.caption.textContent.length > 0);
  assert.ok(p.timers.length > 0);
  p.click({ 'data-cmd': 'stop' });
  assert.strictEqual(p.els.caption.textContent, '');
});
