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
    activeElement: null,
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
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

// ---- fix round: watch guard, focus restore, select preservation ----
function bootEx(search, EngineOverride) {
  const Engine = EngineOverride || require(path.join(ROOT, '..', 'engine', 'engine.js'));
  const regionHtml = {};
  const store = {};
  const timers = [];
  const log = { focused: [] };
  let clickHandler = null;
  const els = {};
  function tagsFor(sel) {
    const attrs = [];
    sel.replace(/\[([\w-]+)="([^"]*)"\]/g, function (m, k, v) { attrs.push(k + '="' + v + '"'); return m; });
    const idm = /^#(.+)$/.exec(sel);
    if (idm) attrs.push('id="' + idm[1] + '"');
    const tag = /^([a-z]+)/.exec(sel);
    const out = [];
    Object.keys(regionHtml).forEach(function (k) {
      (regionHtml[k].match(/<(button|select)\b[^>]*>/g) || []).forEach(function (t) {
        if (tag && t.indexOf('<' + tag[1]) !== 0) return;
        if (attrs.every(function (a) { return t.indexOf(a) >= 0; })) out.push({ tag: t, region: regionHtml[k] });
      });
    });
    return out;
  }
  function stub(m) {
    const t = m.tag;
    const attr = function (k) { const r = new RegExp(' ' + k + '="([^"]*)"').exec(t); return r ? r[1] : null; };
    const o = {
      getAttribute: attr, disabled: / disabled/.test(t),
      focus: function () { log.focused.push(t); document.activeElement = o; },
      closest: function (s) { return s.indexOf('button') === 0 ? o : null; }
    };
    if (/^<select/.test(t)) {
      const id = attr('data-dlq-id');
      const seg = m.region.slice(m.region.indexOf(t));
      const block = seg.slice(0, seg.indexOf('</select>'));
      const opts = (block.match(/<option[^>]*value="([^"]*)"/g) || []).map(function (s) { return /value="([^"]*)"/.exec(s)[1]; });
      const sel = /<option[^>]*value="([^"]*)"[^>]*selected/.exec(block);
      o.options = opts.map(function (v) { return { value: v }; });
      Object.defineProperty(o, 'value', {
        get: function () { return id in store ? store[id] : (sel ? sel[1] : opts[0]); },
        set: function (v) { store[id] = v; }
      });
    }
    return o;
  }
  const document = {
    activeElement: null,
    getElementById: function (id) {
      if (!els[id]) {
        els[id] = { id: id, textContent: '' };
        Object.defineProperty(els[id], 'innerHTML', {
          get: function () { return regionHtml[id] || ''; },
          set: function (v) { regionHtml[id] = v; Object.keys(store).forEach(function (k) { delete store[k]; }); }
        });
      }
      return els[id];
    },
    querySelector: function (s) { const r = tagsFor(s)[0]; return r ? stub(r) : null; },
    querySelectorAll: function (s) { return tagsFor(s).map(stub); },
    addEventListener: function (type, fn) { if (type === 'click') clickHandler = fn; }
  };
  const window = { setTimeout: function (fn, ms) { timers.push({ fn: fn, ms: ms }); return timers.length; }, clearTimeout: function () {} };
  const ctx = vm.createContext({ Engine, document, window, location: { search: search || '' }, performance: { now: function () { return 0; } }, console });
  FILES.forEach(function (n) {
    const f = path.join(ROOT, 'src', n + '.js');
    vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
  });
  function click(attrs) {
    const b = { disabled: false, getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null; }, closest: function (s) { return s.indexOf('button') === 0 ? b : null; } };
    clickHandler({ target: b });
  }
  return { els: els, click: click, timers: timers, log: log, document: document, store: store, html: function (k) { return regionHtml['region-' + k]; } };
}

test('Watch and playback controls are no-ops when the engine self-test failed', () => {
  const real = require(path.join(ROOT, '..', 'engine', 'engine.js'));
  const broken = Object.assign({}, real, { selfTest: function () { return { passed: false, checks: [{ name: 'x', ok: false }] }; } });
  const p = bootEx('', broken);
  assert.ok(p.html('notice').indexOf('self-test failed') >= 0);
  ['watch', 'watchFull', 'pause', 'resume', 'skip'].forEach(function (c) { p.click({ 'data-cmd': c }); });
  assert.strictEqual(p.timers.length, 0);
  assert.strictEqual(p.els.caption ? p.els.caption.textContent : '', '');
});

test('focus returns to the same control after a re-render', () => {
  const p = bootEx('');
  const run = p.document.querySelector('button[data-cmd="run"]');
  run.focus();
  p.log.focused.length = 0;
  p.click({ 'data-cmd': 'run' });
  assert.strictEqual(p.log.focused.length, 1);
  assert.ok(p.log.focused[0].indexOf('data-cmd="run"') >= 0);
});

test('focus is left alone when the element no longer exists', () => {
  const p = bootEx('');
  p.document.activeElement = { getAttribute: function (k) { return k === 'data-cmd' ? 'nonexistent' : null; } };
  p.log.focused.length = 0;
  p.click({ 'data-cmd': 'run' });
  assert.strictEqual(p.log.focused.length, 0);
});

test('a chosen discard reason survives a re-render', () => {
  const p = bootEx('?scenario=incident&step=3');
  const sels = p.document.querySelectorAll('select[data-role="discard-reason"]');
  assert.ok(sels.length > 0);
  const s = sels[0];
  const id = s.getAttribute('data-dlq-id');
  const other = s.options.map(function (o) { return o.value; }).filter(function (v) { return v !== s.value; })[0];
  assert.ok(other);
  s.value = other;
  p.click({ 'data-cmd': 'run' }); // rejected while gate open, but re-renders
  const after = p.document.querySelectorAll('select[data-role="discard-reason"]')
    .filter(function (x) { return x.getAttribute('data-dlq-id') === id; })[0];
  assert.strictEqual(after.value, other);
});
