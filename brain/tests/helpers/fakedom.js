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
  path.join(SHARED, 'escape.js'), path.join(SHARED, 'format.js'), path.join(SHARED, 'vendor.js'), path.join(SHARED, 'brand.js'),
  path.join(ROOT, 'src', 'lineage.js'), path.join(ROOT, 'src', 'viewmodel.js'), path.join(ROOT, 'src', 'graph.js'), path.join(ROOT, 'src', 'localstate.js'),
  path.join(ROOT, 'src', 'render.js'), path.join(ROOT, 'src', 'controller.js'), path.join(ROOT, 'src', 'main.js')
];
const REGION_KEYS = ['header', 'notice', 'contract', 'phi', 'lineage', 'access', 'retention', 'erasure', 'vendor'];

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
  // Elements are "detached" once the region they were found in is rewritten.
  const epoch = {};
  const ep = function (k) { return epoch[k] || 0; };

  function attrOf(tagText, k) {
    const r = new RegExp('\\s' + k + '="([^"]*)"').exec(tagText);
    return r ? decode(r[1]) : null;
  }
  function hasAttr(tagText, k) { return new RegExp('\\s' + k + '(?=[\\s>=/])').test(tagText); }

  function stub(tagText, regionId, selInit) {
    const tag = /^<([a-z0-9]+)/.exec(tagText)[1];
    const id = attrOf(tagText, 'id');
    const key = regionId + '|' + (id || '');
    const born = ep(regionId);
    const e = {
      get detached() { return ep(regionId) !== born; },
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
      const re = /<[a-z0-9]+\b[^>]*>/g;
      let m;
      while ((m = re.exec(html))) {
        if (!matches(m[0], sel)) continue;
        let selInit = null;
        if (/^<select/.test(m[0])) {
          const body = html.slice(m.index, html.indexOf('</select>', m.index));
          const so = /<option([^>]*)>/g;
          let om;
          while ((om = so.exec(body))) {
            if (hasAttr(om[0], 'selected')) { selInit = attrOf(om[0], 'value'); break; }
          }
        }
        out.push(stub(m[0], rid, selInit));
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
          regionHtml[id] = String(v);
          Object.keys(store).forEach(function (k) { if (k.indexOf(id + '|') === 0) delete store[k]; });
        }
      });
    }
    return els[id];
  }

  document.getElementById = function (id) {
    if (id.indexOf('region-') === 0 || id === 'caption' || id === 'brain-live') return region(id);
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
  region('brain-live');
  let lastController = null;
  FILES.forEach(function (f) {
    if (/main\.js$/.test(f)) {
      // Capture the controller main.js creates so tests can compare the DOM with a fresh render of its model.
      const make = ctx.Brain.controller.createController;
      ctx.Brain.controller.createController = function () { lastController = make.apply(this, arguments); return lastController; };
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
    Engine: Engine, document: document, controller: function () { return lastController; }, Brain: function () { return ctx.Brain; }, log: log, timers: timers, handlers: handlers, regionKeys: REGION_KEYS,
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
