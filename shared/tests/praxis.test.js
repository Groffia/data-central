'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadShared } = require('./helpers/load');

const SHARED = path.join(__dirname, '..');
const REPO = path.join(SHARED, '..');
const css = fs.readFileSync(path.join(SHARED, 'praxis.css'), 'utf8');
const fonts = fs.readFileSync(path.join(SHARED, 'fonts.css'), 'utf8');
const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');

// Token values of one theme: the light block is the first :root, the dark block is the one inside the dark media query.
function tokens(block) {
  const out = {};
  block.replace(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\b/g, (m, n, v) => { out[n] = v; return m; });
  return out;
}
const lightBlock = /:root\s*\{([^}]*)\}/.exec(bare)[1];
// Dark comes twice: by the system setting (unless the viewer chose light) and by the viewer's choice (data-theme="dark").
const darkBlock = /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)\s*\{([^}]*)\}/.exec(bare)[1];
const darkChosen = /:root\[data-theme="dark"\]\s*\{([^}]*)\}/.exec(bare)[1];
const THEMES = { light: tokens(lightBlock), dark: Object.assign(tokens(lightBlock), tokens(darkBlock)) };

function lin(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function lum(hex) { const n = parseInt(hex.slice(1), 16); return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255); }
function ratio(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

// The same pairs the page theme tests use, plus the grey and the surfaces text sits on.
const PAIRS = [
  ['text', 'bg'], ['text', 'panel'], ['text', 'panel-2'], ['text-2', 'bg'], ['text-2', 'panel'], ['text-2', 'panel-2'],
  ['green', 'bg'], ['green', 'panel'], ['green', 'panel-2'], ['red', 'bg'], ['red', 'panel'], ['red', 'panel-2'],
  ['amber', 'bg'], ['amber', 'panel'], ['amber', 'panel-2'], ['indigo', 'bg'], ['indigo', 'panel'], ['indigo', 'panel-2'],
  ['grey', 'bg'], ['grey', 'panel'], ['grey', 'panel-2'],
  ['on-green', 'green'], ['on-amber', 'amber'], ['on-red', 'red'], ['on-indigo', 'indigo']
];
Object.keys(THEMES).forEach((theme) => {
  PAIRS.forEach((p) => {
    test(theme + ' theme: contrast --' + p[0] + ' on --' + p[1] + ' >= 4.5', () => {
      const t = THEMES[theme];
      assert.ok(t[p[0]] && t[p[1]], 'both tokens are 6-digit hex');
      assert.ok(ratio(t[p[0]], t[p[1]]) >= 4.5, ratio(t[p[0]], t[p[1]]).toFixed(2));
    });
  });
});

test('the two dark blocks hold the same tokens and values', () => {
  assert.deepEqual(tokens(darkChosen), tokens(darkBlock));
  assert.ok(/color-scheme:\s*dark/.test(darkBlock) && /color-scheme:\s*dark/.test(darkChosen));
  assert.ok(/:root\[data-theme="light"\]\s*\{[^}]*color-scheme:\s*light/.test(bare));
});

test('both themes define every colour token', () => {
  assert.deepEqual(Object.keys(THEMES.dark).sort(), Object.keys(THEMES.light).sort());
  ['bg', 'panel', 'panel-2', 'border', 'text', 'text-2', 'green', 'amber', 'red', 'indigo', 'grey', 'on-green', 'on-amber', 'on-red', 'on-indigo'].forEach((n) => assert.ok(THEMES.light[n], n));
});

test('every colour is a token: no hex or rgb() outside :root', () => {
  const outside = bare.replace(/:root[^{]*\{[^}]*\}/g, '');
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(outside), 'hex colour outside :root');
  assert.ok(!/\brgba?\(|\bhsla?\(/.test(outside), 'rgb/hsl colour outside :root');
});

test('the focus ring is 3 px, buttons have a pressed pair, motion can be reduced, nothing is styled by column position', () => {
  assert.ok(/:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--indigo\)/.test(bare));
  assert.ok(/button\[aria-pressed="true"\]\s*\{[^}]*background:\s*var\(--indigo\)[^}]*color:\s*var\(--on-indigo\)/.test(bare));
  assert.ok(/prefers-reduced-motion:\s*reduce\)\s*\{[^}]*transition:\s*none/.test(bare));
  assert.ok(!/nth-child|:first-child|:last-child/.test(bare));
});

test('no dead CSS: every class in praxis.css is used by at least one page', () => {
  let hay = '';
  ['hq', 'pipeline', 'value', 'brain'].forEach((p) => {
    hay += fs.readFileSync(path.join(REPO, p, 'index.html'), 'utf8');
    fs.readdirSync(path.join(REPO, p, 'src')).filter((n) => /\.js$/.test(n)).forEach((n) => { hay += fs.readFileSync(path.join(REPO, p, 'src', n), 'utf8'); });
  });
  hay += fs.readFileSync(path.join(SHARED, 'brand.js'), 'utf8') + fs.readFileSync(path.join(SHARED, 'settings.js'), 'utf8');
  const used = new Set();
  hay.replace(/(['"])([\w -]+)\1/g, (m, q, t) => { t.split(/\s+/).forEach((x) => used.add(x)); return m; });
  const dead = [];
  bare.replace(/([^{}]+)\{/g, (m, sel) => {
    if (sel.trim().charAt(0) === '@') return m;
    (sel.match(/\.([A-Za-z_][\w-]*)/g) || []).forEach((c) => { if (!used.has(c.slice(1))) dead.push(c); });
    return m;
  });
  assert.deepEqual(dead, []);
});

test('fonts.css embeds every font as a data URI: no remote url, five faces, the four families', () => {
  assert.ok(!/url\(\s*['"]?(?!data:)/i.test(fonts), 'only data: urls');
  assert.ok(!/https?:\/\/(?!openfontlicense)/i.test(fonts.replace(/\/\*[\s\S]*?\*\//g, '')), 'no http(s) outside the licence comment');
  assert.equal((fonts.match(/@font-face/g) || []).length, 5);
  ['Bricolage Grotesque', 'IBM Plex Sans', 'IBM Plex Mono', 'Archivo'].forEach((f) => assert.ok(fonts.indexOf("font-family: '" + f + "'") >= 0, f));
  assert.ok(/SIL Open Font License/.test(fonts));
  // The families praxis.css asks for are the ones fonts.css provides.
  ['Bricolage Grotesque', 'IBM Plex Sans', 'IBM Plex Mono', 'Archivo'].forEach((f) => assert.ok(css.indexOf('"' + f + '"') >= 0, f + ' used in praxis.css'));
});

test('brand.html: a "Name: tagline" title becomes a mono name and a lighter tagline, the h1 keeps the full title', () => {
  const { Shared } = loadShared();
  const h = Shared.brand.html('HQ: Data Platform Control Room');
  assert.equal(h, '<div class="brand"><span class="mark" aria-hidden="true"></span><h1 aria-label="HQ: Data Platform Control Room"><span class="w1">HQ</span> <span class="w2">Data Platform Control Room</span></h1></div>');
});

test('brand.html: no tagline, markup in the title, and missing input are all safe', () => {
  const { Shared } = loadShared();
  assert.equal(Shared.brand.html('Solo'), '<div class="brand"><span class="mark" aria-hidden="true"></span><h1 aria-label="Solo"><span class="w1">Solo</span></h1></div>');
  const x = Shared.brand.html('<b>A</b>: "x" & y');
  assert.ok(x.indexOf('<b>') < 0 && x.indexOf('&lt;b&gt;A&lt;/b&gt;') > 0 && x.indexOf('&quot;x&quot; &amp; y') > 0);
  assert.ok(Shared.brand.html(undefined).indexOf('aria-label=""') > 0);
  assert.ok(Shared.brand.html(null).indexOf('undefined') < 0);
});

// ---- settings.js, with a small fake DOM ----

function fakeEl(tag) {
  const e = { tag, attrs: {}, children: [], listeners: {}, hidden: false, checked: false, focused: false, textContent: '' };
  e.setAttribute = (k, v) => { e.attrs[k] = String(v); };
  e.getAttribute = (k) => (k in e.attrs ? e.attrs[k] : null);
  e.appendChild = (c) => { e.children.push(c); return c; };
  e.addEventListener = (t, fn) => { (e.listeners[t] = e.listeners[t] || []).push(fn); };
  e.fire = (t, ev) => (e.listeners[t] || []).forEach((fn) => fn(ev || { target: e }));
  e.contains = (x) => { const walk = (n) => n === x || n.children.some(walk); return walk(e); };
  e.focus = () => { e.focused = true; };
  return e;
}
function fakeWindow(opts) {
  const doc = fakeEl('document');
  doc.documentElement = fakeEl('html');
  doc.body = fakeEl('body');
  doc.readyState = (opts && opts.readyState) || 'complete';
  doc.createElement = (t) => fakeEl(t);
  doc.createElementNS = (ns, t) => fakeEl(t);
  const store = {};
  const win = { document: doc };
  win.localStorage = opts && opts.noStorage ? { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } }
    : { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, _store: store };
  if (opts && opts.saved) store['data-central-theme'] = opts.saved;
  win.matchMedia = () => ({ matches: !!(opts && opts.systemDark) });
  return win;
}
const S = () => loadShared().Shared.settings;

test('effective: a saved choice wins, else the system setting; junk is ignored', () => {
  const s = S();
  assert.equal(s.effective('light', true), 'light');
  assert.equal(s.effective('dark', false), 'dark');
  assert.equal(s.effective(null, true), 'dark');
  assert.equal(s.effective(null, false), 'light');
  assert.equal(s.effective('purple', true), 'dark');
});

test('init: sets data-theme at once from the system setting, then the saved choice, and mounts the gear', () => {
  const s = S();
  const a = fakeWindow({ systemDark: true });
  s.init(a);
  assert.equal(a.document.documentElement.getAttribute('data-theme'), 'dark');
  const b = fakeWindow({ systemDark: true, saved: 'light' });
  s.init(b);
  assert.equal(b.document.documentElement.getAttribute('data-theme'), 'light');
  const wrap = a.document.body.children[0];
  assert.equal(wrap.attrs.class, 'settings');
  const [btn, panel] = wrap.children;
  assert.equal(btn.attrs['aria-label'], 'Settings');
  assert.equal(btn.attrs['aria-expanded'], 'false');
  assert.equal(panel.hidden, true);
  assert.equal(btn.children[0].tag, 'svg');
});

test('the gear opens and closes the panel; Escape closes it and returns focus; a click outside closes it', () => {
  const win = fakeWindow({});
  S().init(win);
  const [btn, panel] = win.document.body.children[0].children;
  btn.fire('click');
  assert.equal(panel.hidden, false);
  assert.equal(btn.attrs['aria-expanded'], 'true');
  win.document.fire('keydown', { key: 'Escape' });
  assert.equal(panel.hidden, true);
  assert.equal(btn.focused, true);
  btn.fire('click');
  win.document.fire('click', { target: fakeEl('p') });
  assert.equal(panel.hidden, true);
  btn.fire('click');
  win.document.fire('click', { target: panel });
  assert.equal(panel.hidden, false, 'a click inside the panel keeps it open');
});

test('the dark mode switch starts in step with the theme, and flipping it applies and saves the choice', () => {
  const win = fakeWindow({ systemDark: true });
  S().init(win);
  const panel = win.document.body.children[0].children[1];
  const input = panel.children[1].children[1];
  assert.equal(input.attrs.role, 'switch');
  assert.equal(input.checked, true);
  input.checked = false;
  input.fire('change');
  assert.equal(win.document.documentElement.getAttribute('data-theme'), 'light');
  assert.equal(win.localStorage._store['data-central-theme'], 'light');
  input.checked = true;
  input.fire('change');
  assert.equal(win.document.documentElement.getAttribute('data-theme'), 'dark');
  assert.equal(win.localStorage._store['data-central-theme'], 'dark');
});

test('blocked storage: the switch still works for this visit and nothing throws', () => {
  const win = fakeWindow({ noStorage: true });
  S().init(win);
  const sw = win.document.body.children[0].children[1].children[1].children[1];
  sw.checked = true;
  sw.fire('change');
  assert.equal(win.document.documentElement.getAttribute('data-theme'), 'dark');
});

test('while the page is still loading the gear waits for DOMContentLoaded, but the theme is set at once', () => {
  const win = fakeWindow({ readyState: 'loading', systemDark: true });
  S().init(win);
  assert.equal(win.document.documentElement.getAttribute('data-theme'), 'dark');
  assert.equal(win.document.body.children.length, 0);
  win.document.fire('DOMContentLoaded');
  assert.equal(win.document.body.children.length, 1);
});

test('run where a window exists but its document has no root element (the build checks), settings.js does nothing and does not throw', () => {
  const vm = require('node:vm');
  const ctx = vm.createContext({ window: {}, document: { getElementById() { return null; } }, console });
  assert.doesNotThrow(() => vm.runInContext(fs.readFileSync(path.join(SHARED, 'escape.js'), 'utf8') + fs.readFileSync(path.join(SHARED, 'settings.js'), 'utf8'), ctx));
  assert.equal(typeof ctx.Shared.settings.init, 'function');
});
