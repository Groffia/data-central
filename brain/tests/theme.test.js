'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
// The look is shared (shared/praxis.css holds the tokens); the page adds its own rules.
const css = fs.readFileSync(path.join(__dirname, '..', '..', 'shared', 'praxis.css'), 'utf8') + '\n' + fs.readFileSync(path.join(ROOT, 'src', 'styles.css'), 'utf8');
const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
// The page's own rules, for the tests that check this page's markup uses them.
const pageBare = fs.readFileSync(path.join(ROOT, 'src', 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function token(name) {
  const m = new RegExp('--' + name + '\\s*:\\s*(#[0-9a-fA-F]{6})\\b').exec(css);
  assert.ok(m, 'token --' + name + ' must be a 6-digit hex in styles.css');
  return m[1];
}
function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function lin(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function lum(hex) { const a = rgb(hex); return 0.2126 * lin(a[0]) + 0.7152 * lin(a[1]) + 0.0722 * lin(a[2]); }
function ratio(a, b) {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
// Declarations of the rule whose selector list contains `sel` exactly.
function rule(sel) {
  const re = new RegExp('(?:^|[}\\s,])' + esc(sel) + '\\s*(?:,[^{]*)?\\{([^}]*)\\}', 'm');
  const m = re.exec(bare);
  assert.ok(m, 'rule for ' + sel);
  return m[1];
}
function decl(body, prop) {
  const m = new RegExp('(?:^|[;\\s])' + prop + '\\s*:\\s*var\\(--([a-z0-9-]+)\\)').exec(body);
  return m ? m[1] : null;
}

// Same table and threshold as the HQ, Pipeline and Value theme tests.
const PAIRS = [
  ['text', 'bg'], ['text', 'panel'], ['text-2', 'panel'],
  ['green', 'panel'], ['red', 'panel-2'], ['amber', 'panel'], ['red', 'panel'], ['indigo', 'panel'],
  ['on-green', 'green'], ['on-amber', 'amber'], ['on-red', 'red'], ['on-indigo', 'indigo'],
  ['text-2', 'bg'], ['text-2', 'panel-2'], ['text', 'panel-2'], ['indigo', 'bg'], ['indigo', 'panel-2'],
  ['amber', 'panel-2'], ['green', 'panel-2']
];
PAIRS.forEach(function (p) {
  test('contrast --' + p[0] + ' on --' + p[1] + ' >= 4.5', () => {
    const r = ratio(token(p[0]), token(p[1]));
    assert.ok(r >= 4.5, p[0] + ' on ' + p[1] + ' = ' + r.toFixed(2));
  });
});

test('styles define reduced-motion and focus-visible rules', () => {
  assert.ok(css.indexOf('prefers-reduced-motion') >= 0);
  assert.ok(css.indexOf(':focus-visible') >= 0);
  assert.ok(/prefers-reduced-motion:\s*reduce\)\s*\{[^}]*transition:\s*none/.test(bare));
});

test('every colour is a token: no hex or rgb() outside :root', () => {
  const outside = bare.replace(/:root[^{]*\{[^}]*\}/g, '');
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(outside), 'hex colour outside :root');
  assert.ok(!/\brgba?\(|\bhsla?\(/.test(outside), 'rgb/hsl colour outside :root');
});

test('filled classes use a background token with its --on-* text token', () => {
  ['.hold-badge'].forEach(function (sel) {
    const body = rule(sel);
    const bg = decl(body, 'background');
    const fg = decl(body, 'color');
    assert.ok(bg && fg, sel + ' needs background and color tokens');
    assert.equal(fg, 'on-' + bg, sel);
    assert.ok(ratio(token(fg), token(bg)) >= 4.5, sel);
  });
});

test('pressed buttons and the skip link use the indigo pair', () => {
  [rule('button[aria-pressed="true"]'), rule('.skip-link')].forEach(function (body) {
    assert.equal(decl(body, 'background'), 'indigo');
    assert.equal(decl(body, 'color'), 'on-indigo');
  });
});

test('text tokens used on the sensitive badge, erase reason, dimmed nodes and notes pass on their backgrounds', () => {
  [['.sensitive-badge', 'color', ['panel', 'panel-2']], ['.erase-reason', 'color', ['panel']], ['.node-dimmed', 'color', ['panel']],
    ['.caption, .note, .placeholder', 'color', ['panel', 'panel-2']], ['.stage-label', 'color', ['panel']]].forEach(function (c) {
    const t = decl(rule(c[0].split(',')[0].trim()), c[1]);
    assert.ok(t, c[0] + ' uses a colour token');
    c[2].forEach(function (bg) { assert.ok(ratio(token(t), token(bg)) >= 4.5, c[0] + ' (' + t + ') on ' + bg); });
  });
});

test('the dimmed node keeps its own panel background, so its text contrast is the token pair', () => {
  assert.equal(decl(rule('.node-dimmed'), 'background'), 'panel');
  assert.ok(!/opacity/.test(rule('.node-dimmed')), 'dimming is not done with opacity');
});

test('graph edges are visible against the panel (3:1 for graphics) and differ in more than colour', () => {
  ['.edge-plain', '.edge-hot', '.edge-dim'].forEach(function (sel) {
    const t = decl(rule(sel), 'stroke');
    assert.ok(t, sel + ' uses a stroke token');
    assert.ok(ratio(token(t), token('panel')) >= 3, sel + ' on panel');
  });
  assert.ok(/stroke-width:\s*3/.test(rule('.edge-hot')), 'hot edges are thicker');
  assert.ok(/stroke-dasharray/.test(rule('.edge-dim')), 'dimmed edges are dashed');
  assert.ok(/dashed/.test(rule('.node-dimmed')) && /2px solid/.test(rule('.node-downstream')), 'node states differ by border style, not colour alone');
});

test('the deep-link highlight and a paused delete step are marked by border, not by colour alone', () => {
  assert.ok(/border-top:\s*3px solid/.test(rule('.focus-target')));
  assert.ok(/dashed/.test(rule('.tier-paused')));
});

test('no dead CSS: every class and id selector in the stylesheet appears in the markup or the render code', () => {
  let hay = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  fs.readdirSync(path.join(ROOT, 'src')).filter((n) => /\.js$/.test(n)).forEach((n) => { hay += fs.readFileSync(path.join(ROOT, 'src', n), 'utf8'); });
  const used = new Set();
  hay.replace(/class=\\?"([^"\\]*)/g, (m, c) => { c.split(/\s+/).forEach((x) => used.add(x)); return m; });
  hay.replace(/(['"])([\w -]+)\1/g, (m, q, t) => { t.split(/\s+/).forEach((x) => used.add(x)); return m; });
  hay.replace(/class="node node-'/g, (m) => { ['plain', 'selected', 'downstream', 'dimmed'].forEach((s) => used.add('node-' + s)); return m; });
  hay.replace(/class="edge edge-'/g, (m) => { ['plain', 'hot', 'dim'].forEach((s) => used.add('edge-' + s)); return m; });
  hay.replace(/'tier tier-paused'|"tier tier-paused"/g, (m) => { used.add('tier-paused'); return m; });
  const dead = [];
  pageBare.replace(/([^{}]+)\{/g, (m, sel) => {
    if (sel.trim().charAt(0) === '@') return m;
    (sel.match(/\.([A-Za-z_][\w-]*)/g) || []).forEach((c) => { if (!used.has(c.slice(1))) dead.push(c); });
    (sel.match(/#([A-Za-z_][\w-]*)/g) || []).forEach((c) => { if (hay.indexOf(c.slice(1)) < 0) dead.push(c); });
    return m;
  });
  assert.deepEqual(dead, []);
});


test('no element selector in the stylesheet matches nothing in the page (header and footer elements do not exist)', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  ['header', 'footer', 'main', 'section', 'details', 'summary', 'code', 'pre'].forEach((tag) => {
    const inCss = new RegExp('(^|[\s,}])' + tag + '\s*[,{:]', 'm').test(pageBare);
    if (inCss) assert.ok(new RegExp('<' + tag + '\b').test(html), tag + ' is styled but not in index.html');
  });
});

test('the six stage anchors and the deep-link rules agree with the controller ids', () => {
  ['stage-contract', 'stage-phi', 'stage-lineage', 'stage-access', 'stage-retention', 'stage-erasure'].forEach((id) => {
    assert.ok(bare.indexOf('#' + id) >= 0, id);
  });
});
