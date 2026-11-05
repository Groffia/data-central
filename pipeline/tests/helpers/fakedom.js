'use strict';
// A tiny fake DOM for main.js: regions hold an innerHTML string; elements are parsed on demand from those
// strings (button, input, a, tr, section/header ids). Supports the simple selectors main.js uses:
// tag, #id, [attr], [attr="value"] in any combination (no commas, no combinators).
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const SHARED = path.join(ROOT, '..', 'shared');
const FILES = [
  path.join(SHARED, 'escape.js'), path.join(SHARED, 'format.js'), path.join(SHARED, 'vendor.js'),
  path.join(ROOT, 'src', 'viewmodel.js'), path.join(ROOT, 'src', 'render.js'),
  path.join(ROOT, 'src', 'controller.js'), path.join(ROOT, 'src', 'main.js')
];
const REGION_KEYS = ['header', 'batches', 'generation', 'landing', 'matrix', 'rows', 'dlq', 'medallion', 'storage', 'vendor', 'notice', 'footer'];

function decode(s) {
  return s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function parseSelector(sel) {
  const tag = /^([a-z][a-z0-9]*)/.exec(sel);
  const id = /#([A-Za-z][\w-]*)/.exec(sel);
  const attrs = [];
  sel.replace(/\[([\w-]+)(?:="([^"]*)")?\]/g, function (m, k, v) { attrs.push([k, v]); return m; });
  return { tag: tag ? tag[1] : null, id: id ? id[1] : null, attrs: attrs };
}

function boot(options) {
  const o = options || {};
  const Engine = o.Engine || require(path.join(ROOT, '..', 'engine', 'engine.js'));
  const regionHtml = {};
  const store = {}; // 'region|id' -> {value, start, end}
  const handlers = {};
  const log = { focused: [], scrolled: [], innerHTMLWrites: 0 };
  const els = {};
  const document = { activeElement: null };

  function attrOf(tagText, k) {
    const r = new RegExp('\\s' + k + '="([^"]*)"').exec(tagText);
    return r ? decode(r[1]) : null;
  }
  function hasAttr(tagText, k) { return new RegExp('\\s' + k + '(?=[\\s>=/])').test(tagText); }

  function stub(tagText, regionId) {
    const tag = /^<([a-z0-9]+)/.exec(tagText)[1];
    const id = attrOf(tagText, 'id');
    const key = regionId + '|' + (id || attrOf(tagText, 'data-field') || '');
    const e = {
      tagName: tag.toUpperCase(), region: regionId, id: id, rawTag: tagText,
      getAttribute: function (k) { return attrOf(tagText, k); },
      hasAttribute: function (k) { return hasAttr(tagText, k); },
      disabled: hasAttr(tagText, 'disabled'),
      focus: function () { log.focused.push(tagText); document.activeElement = e; },
      closest: function (s) { return matches(tagText, parseSelector(s)) ? e : null; },
      scrollIntoView: function (opts) { log.scrolled.push({ id: id, opts: opts }); }
    };
    if (tag === 'input') {
      const init = attrOf(tagText, 'value') || '';
      Object.defineProperty(e, 'value', {
        get: function () { return store[key] && store[key].value !== undefined ? store[key].value : init; },
        set: function (v) { store[key] = Object.assign(store[key] || {}, { value: String(v) }); }
      });
      Object.defineProperty(e, 'selectionStart', { get: function () { const s = store[key]; return s && s.start !== undefined ? s.start : e.value.length; } });
      Object.defineProperty(e, 'selectionEnd', { get: function () { const s = store[key]; return s && s.end !== undefined ? s.end : e.value.length; } });
      e.setSelectionRange = function (a, b) { store[key] = Object.assign(store[key] || {}, { start: a, end: b }); };
    }
    return e;
  }

  function matches(tagText, sel) {
    const tag = /^<([a-z0-9]+)/.exec(tagText)[1];
    if (sel.tag && sel.tag !== tag) return false;
    if (sel.id && attrOf(tagText, 'id') !== sel.id) return false;
    return sel.attrs.every(function (a) {
      const v = attrOf(tagText, a[0]);
      return a[1] === undefined ? v !== null || hasAttr(tagText, a[0]) : v === a[1];
    });
  }

  function all(selText) {
    const sel = parseSelector(selText);
    const out = [];
    Object.keys(regionHtml).forEach(function (rid) {
      (regionHtml[rid].match(/<[a-z0-9]+\b[^>]*>/g) || []).forEach(function (t) {
        if (matches(t, sel)) out.push(stub(t, rid));
      });
    });
    return out;
  }

  function region(id) {
    if (!els[id]) {
      els[id] = {
        id: id, textContent: '',
        scrollIntoView: function (opts) { log.scrolled.push({ id: id, opts: opts }); },
        contains: function (e) { return !!e && e.region === id; }
      };
      Object.defineProperty(els[id], 'innerHTML', {
        get: function () { return regionHtml[id] || ''; },
        set: function (v) {
          log.innerHTMLWrites++;
          regionHtml[id] = String(v);
          Object.keys(store).forEach(function (k) { if (k.indexOf(id + '|') === 0) delete store[k]; });
        }
      });
    }
    return els[id];
  }

  document.getElementById = function (id) {
    if (id.indexOf('region-') === 0 || id === 'caption') return region(id);
    const hit = all('#' + id)[0];
    return hit || null;
  };
  document.querySelector = function (s) {
    if (/^meta\b/.test(s)) {
      if (o.hqBase === undefined) return null;
      return { getAttribute: function (k) { return k === 'content' ? o.hqBase : null; } };
    }
    return all(s)[0] || null;
  };
  document.querySelectorAll = function (s) { return all(s); };
  document.addEventListener = function (type, fn) { (handlers[type] = handlers[type] || []).push(fn); };

  const timers = [];
  const window = {
    setTimeout: function (fn, ms) { timers.push({ fn: fn, ms: ms }); return timers.length; },
    clearTimeout: function () {}
  };
  const ctx = vm.createContext({ Engine, document, window, location: { search: o.search || '', hash: o.hash || '' }, console });
  REGION_KEYS.concat(['caption']).forEach(function (k) { region(k === 'caption' ? k : 'region-' + k); });
  FILES.forEach(function (f) { vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f }); });

  function fire(type, target) {
    (handlers[type] || []).forEach(function (fn) { fn({ type: type, target: target, preventDefault: function () {} }); });
  }
  // A synthetic button (as the browser would hand to the click handler), not tied to the rendered HTML.
  function fakeButton(attrs, disabled) {
    const b = {
      disabled: !!disabled,
      getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null; },
      closest: function (s) { return /^button/.test(s) && attrs['data-cmd'] !== undefined ? b : null; }
    };
    return b;
  }

  return {
    Engine: Engine, document: document, log: log, timers: timers, handlers: handlers, regionKeys: REGION_KEYS,
    html: function (k) { return regionHtml['region-' + k]; },
    caption: function () { return els.caption.textContent; },
    q: function (s) { return all(s)[0] || null; },
    qa: all,
    // Click the rendered control matching the selector (like a user would); returns the element.
    clickRendered: function (s) {
      const e = all(s)[0];
      if (!e) throw new Error('no element for ' + s);
      fire('click', e);
      return e;
    },
    click: function (attrs, disabled) { fire('click', fakeButton(attrs, disabled)); },
    change: function (el) { fire('change', el); },
    input: function (el) { fire('input', el); },
    // Simulate typing without any event: sets value and caret.
    typeInto: function (el, text, start, end) {
      el.focus();
      el.value = text;
      el.setSelectionRange(start === undefined ? text.length : start, end === undefined ? (start === undefined ? text.length : start) : end);
    }
  };
}

module.exports = { boot, REGION_KEYS, FILES };
