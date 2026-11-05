'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadPipeline } = require('./helpers/load');

const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles.css'), 'utf8');
const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');

function token(name) {
  const m = new RegExp('--' + name + '\\s*:\\s*(#[0-9a-fA-F]{6})\\b').exec(css);
  assert.ok(m, 'token --' + name + ' must be a 6-digit hex in styles.css');
  return m[1];
}
function lin(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function lum(hex) {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}
function ratio(a, b) {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
// Declarations of the rule whose selector list contains `sel` exactly (outside media queries or inside, first hit).
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

// Same table as the HQ theme test.
const PAIRS = [
  ['text', 'bg'], ['text', 'panel'], ['text-2', 'panel'],
  ['green', 'panel'], ['red', 'panel-2'], ['amber', 'panel'], ['red', 'panel'], ['indigo', 'panel'],
  ['on-green', 'green'], ['on-amber', 'amber'], ['on-red', 'red'], ['on-indigo', 'indigo'],
  // pairs the pipeline classes add
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
  const outside = bare.replace(/:root\s*\{[^}]*\}/, '');
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(outside), 'hex colour outside :root');
  assert.ok(!/\brgba?\(|\bhsla?\(/.test(outside), 'rgb/hsl colour outside :root');
});

test('filled classes use a background token with its --on-* text token (all tested pairs)', () => {
  ['.gate-decision[data-level="green"]', '.gate-decision[data-level="red"]', '.gate-decision[data-level="amber"]',
    '.tier-hot', '.tier-warm', '.tier-cold', '.error'].forEach(function (sel) {
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

test('severity chips, pass/fail marks and statuses use text tokens that pass on their background', () => {
  const checks = [
    ['tr[data-severity="error"] td.sev', 'red', ['panel']],
    ['tr[data-severity="warn"] td.sev', 'amber', ['panel']],
    ['tr[data-pass="true"] td.mark', 'green', ['panel']],
    ['tr[data-pass="false"] td.mark', 'red', ['panel']],
    ['tr[data-status="repaired"] td.status', 'green', ['panel', 'panel-2']],
    ['tr[data-status="discarded"] td.status', 'text-2', ['panel', 'panel-2']],
    ['td[data-drift="true"]', 'amber', ['panel-2']],
    ['.drift-note', 'amber', ['panel']],
    ['.note', 'text-2', ['panel']],
    ['.muted', 'text-2', ['panel']],
    ['.hq-link', 'indigo', ['bg', 'panel']],
    ['.stage-label', 'indigo', ['panel', 'bg']]
  ];
  checks.forEach(function (c) {
    const fg = decl(rule(c[0]), 'color');
    assert.equal(fg, c[1], c[0]);
    c[2].forEach(function (bgName) {
      assert.ok(ratio(token(fg), token(bgName)) >= 4.5, c[0] + ' on ' + bgName);
    });
  });
});

test('drift row highlight uses a token background and the amber text sits on it', () => {
  assert.equal(decl(rule('tr[data-drift="true"] td'), 'background'), 'panel-2');
  assert.ok(ratio(token('amber'), token('panel-2')) >= 4.5);
  assert.ok(ratio(token('text'), token('panel-2')) >= 4.5, 'default cell text on the drift row');
});

test('DLQ focus highlight is an outline that does not rely on colour alone and has a token background', () => {
  const body = rule('tr[data-focus="true"], #stage-storage[data-focus="true"]');
  assert.ok(/outline:\s*3px solid var\(--indigo\)/.test(body));
  assert.equal(decl(rule('tr[data-focus="true"] td'), 'background'), 'panel-2');
});

test('alert text (.error) and input text pass', () => {
  assert.ok(ratio(token('on-red'), token('red')) >= 4.5);
  assert.equal(decl(rule('.tier-field input'), 'color'), 'text');
  assert.equal(decl(rule('.tier-field input'), 'background'), 'panel-2');
  assert.equal(decl(rule('.tier-field .default'), 'color'), 'text-2');
  assert.ok(ratio(token('text-2'), token('panel')) >= 4.5);
});

test('no external url() or @import', () => {
  assert.ok(!/@import/i.test(bare));
  assert.ok(!/url\s*\(/i.test(bare), 'no url() at all');
  assert.ok(!/https?:\/\//i.test(bare));
});

test('no fixed width above 1000 px outside media queries', () => {
  const outside = bare.replace(/@media[^{]*\{(?:[^{}]*\{[^}]*\})*[^}]*\}/g, '');
  const re = /(?<![-\w])(?:min-)?width\s*:\s*(\d+(?:\.\d+)?)px/g;
  let m;
  while ((m = re.exec(outside))) assert.ok(Number(m[1]) <= 1000, m[0]);
  // max-width caps are fine but must not exceed the 1200 px content column.
  const mx = /max-width\s*:\s*(\d+)px/g;
  while ((m = mx.exec(outside))) assert.ok(Number(m[1]) <= 1200, m[0]);
});

test('wide tables scroll inside .table-wrap, and the renderer wraps every table', () => {
  const body = rule('.table-wrap');
  assert.ok(/overflow-x:\s*auto/.test(body));
  assert.ok(/max-width:\s*100%/.test(body));
  const { Engine, Pipeline } = loadPipeline();
  const c = Pipeline.controller.createController(Engine, '?scenario=incident&step=16', '', { hqBase: '../hq/' });
  const html = Object.values(Pipeline.render.renderRegions(c.getModel())).join('');
  const tables = html.match(/<table\b/g) || [];
  const wrapped = html.match(/<div class="table-wrap"><table\b/g) || [];
  assert.ok(tables.length >= 6);
  assert.equal(wrapped.length, tables.length);
});

test('no horizontal scroll by construction: border-box, capped content column, scroll contained', () => {
  assert.ok(/\*\s*\{\s*box-sizing:\s*border-box/.test(bare));
  assert.ok(/header,\s*main,\s*footer\s*\{[^}]*max-width:\s*1200px/.test(bare));
  assert.ok(/body\s*\{[^}]*overflow-x:\s*hidden/.test(bare));
  assert.ok(/\.region\s*\{[^}]*min-width:\s*0/.test(bare));
});

test('no styling by column position', () => {
  assert.ok(!/nth-child|:first-child|:last-child/.test(bare));
});

test('visually-hidden clips instead of display:none', () => {
  const body = rule('.visually-hidden');
  assert.ok(/clip/.test(body) && /position:\s*absolute/.test(body));
  assert.ok(!/display:\s*none|visibility:\s*hidden/.test(body));
});
