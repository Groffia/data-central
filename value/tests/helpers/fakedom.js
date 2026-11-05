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
  path.join(ROOT, 'src', 'viewmodel.js'), path.join(ROOT, 'src', 'chart.js'), path.join(ROOT, 'src', 'definitions.js'),
  path.join(ROOT, 'src', 'render.js'), path.join(ROOT, 'src', 'controller.js'), path.join(ROOT, 'src', 'main.js')
];
const REGION_KEYS = ['header', 'notice', 'kpis', 'trends', 'compare', 'definitions', 'check', 'vendor'];

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
  const log = { focused: [], focusOpts: [], scrolled: [], innerHTMLWrites: 0, classAdded: [], classRemoved: [] };
  const els = {};
  const document = { activeElement: null };
  // Elements are "detached" once the container they were found in is rewritten: the region, or a child container (CHILD_IDS).
  const CHILD_IDS = [];
  const epoch = {};
  const ep = function (k) { return epoch[k] || 0; };

  // [start, end) of the inner content of the div with this id inside the region, found by balanced <div> counting.
  function childSpan(html, id) {
    const open = new RegExp('<div\\b[^>]*\\sid="' + id + '"[^>]*>').exec(html);
    if (!open) return null;
    const start = open.index + open[0].length;
    const re = /<(\/?)div\b[^>]*>/g;
    re.lastIndex = start;
    let depth = 1, m;
    while ((m = re.exec(html))) {
      depth += m[1] ? -1 : 1;
      if (depth === 0) return [start, m.index];
    }
    return null;
  }

  function attrOf(tagText, k) {
    const r = new RegExp('\\s' + k + '="([^"]*)"').exec(tagText);
    return r ? decode(r[1]) : null;
  }
  function hasAttr(tagText, k) { return new RegExp('\\s' + k + '(?=[\\s>=/])').test(tagText); }

  function stub(tagText, regionId, childId, selInit) {
    const tag = /^<([a-z0-9]+)/.exec(tagText)[1];
    const id = attrOf(tagText, 'id');
    const key = regionId + '|' + (id || attrOf(tagText, 'data-field') || '');
    const born = { r: ep(regionId), c: childId ? ep(childId) : 0 };
    const e = {
      get detached() { return ep(regionId) !== born.r || (!!childId && ep(childId) !== born.c); },
      tagName: tag.toUpperCase(), region: regionId, id: id, rawTag: tagText,
      getAttribute: function (k) { return attrOf(tagText, k); },
      hasAttribute: function (k) { return hasAttr(tagText, k); },
      disabled: hasAttr(tagText, 'disabled'),
      focus: function (opts) { log.focused.push(tagText); log.focusOpts.push(opts); document.activeElement = e; },
      closest: function (s) { return matches(tagText, parseSelector(s)) ? e : null; },
      scrollIntoView: function (opts) { log.scrolled.push({ id: id, opts: opts }); }
    };
    e.classList = {
      add: function (c) { log.classAdded.push({ id: id, cls: c }); },
      remove: function (c) { log.classRemoved.push({ id: id, cls: c }); }
    };
    if (tag === 'select') {
      Object.defineProperty(e, 'value', {
        get: function () { return store[key] && store[key].value !== undefined ? store[key].value : (selInit || ''); },
        set: function (v) { store[key] = Object.assign(store[key] || {}, { value: String(v) }); }
      });
    }
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
      const html = regionHtml[rid];
      const spans = CHILD_IDS.map(function (c) { return [c, childSpan(html, c)]; }).filter(function (x) { return x[1]; });
      const re = /<[a-z0-9]+\b[^>]*>/g;
      let m;
      while ((m = re.exec(html))) {
        if (!matches(m[0], sel)) continue;
        const inside = spans.filter(function (x) { return m.index >= x[1][0] && m.index < x[1][1]; })[0];
        let selInit = null;
        if (/^<select/.test(m[0])) {
          const body = html.slice(m.index, html.indexOf('</select>', m.index));
          const so = /<option([^>]*)>/g;
          let om;
          while ((om = so.exec(body))) {
            if (hasAttr(om[0], 'selected')) { selInit = attrOf(om[0], 'value'); break; }
          }
        }
        out.push(stub(m[0], rid, inside ? inside[0] : null, selInit));
      }
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
          epoch[id] = ep(id) + 1;
          CHILD_IDS.forEach(function (c) { if (childSpan(regionHtml[id] || '', c)) epoch[c] = ep(c) + 1; });
          regionHtml[id] = o.transform ? String(o.transform(id, String(v))) : String(v);
          Object.keys(store).forEach(function (k) { if (k.indexOf(id + '|') === 0) delete store[k]; });
        }
      });
    }
    return els[id];
  }

  // A child container whose innerHTML can be rewritten on its own (only that part of the region is replaced).
  function child(id) {
    const rid = Object.keys(regionHtml).filter(function (r) { return childSpan(regionHtml[r], id); })[0];
    if (!rid) return null;
    return {
      id: id,
      get innerHTML() { const s = childSpan(regionHtml[rid], id); return regionHtml[rid].slice(s[0], s[1]); },
      set innerHTML(v) {
        const html = regionHtml[rid];
        const s = childSpan(html, id);
        log.innerHTMLWrites++;
        const old = html.slice(s[0], s[1]);
        old.replace(/\sid="([^"]+)"/g, function (m, i) { delete store[rid + '|' + i]; return m; });
        epoch[id] = ep(id) + 1;
        const next = html.slice(0, s[0]) + String(v) + html.slice(s[1]);
        regionHtml[rid] = o.transform ? String(o.transform(rid, next)) : next;
      }
    };
  }

  document.getElementById = function (id) {
    if (id.indexOf('region-') === 0 || id === 'caption' || id === 'def-live') return region(id);
    if (CHILD_IDS.indexOf(id) >= 0) return child(id);
    const hit = all('#' + id)[0];
    return hit || null;
  };
  document.querySelector = function (s) {
    if (/^meta\b/.test(s)) {
      const nm = /name="([^"]+)"/.exec(s);
      const v = nm && o.meta ? o.meta[nm[1]] : undefined;
      if (v === undefined) return null;
      return { getAttribute: function (k) { return k === 'content' ? v : null; } };
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
  REGION_KEYS.forEach(function (k) { region('region-' + k); });
  region('caption');
  region('def-live');
  let lastController = null;
  FILES.forEach(function (f) {
    if (/main\.js$/.test(f)) {
      // Capture the controller main.js creates so tests can compare the DOM with a fresh render of its model.
      const make = ctx.Value.controller.createController;
      ctx.Value.controller.createController = function () { lastController = make.apply(this, arguments); return lastController; };
    }
    vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
  });

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
    Engine: Engine, document: document, controller: function () { return lastController; }, Value: function () { return ctx.Value; }, log: log, timers: timers, handlers: handlers, regionKeys: REGION_KEYS,
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
    change: function (el) { fire('change', el); }
  };
}

module.exports = { boot, REGION_KEYS, FILES };
