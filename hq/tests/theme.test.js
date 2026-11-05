'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles.css'), 'utf8');

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

const PAIRS = [
  ['text', 'bg'], ['text', 'panel'], ['text-2', 'panel'],
  ['green', 'panel'], ['amber', 'panel'], ['red', 'panel'], ['indigo', 'panel'],
  ['on-green', 'green'], ['on-amber', 'amber'], ['on-red', 'red'], ['on-indigo', 'indigo']
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
});

test('banner levels use the tested contrast pairs', () => {
  ['amber', 'green'].forEach(function (lv) {
    const m = new RegExp('\\.banner\\[data-level="' + lv + '"\\]\\s*\\{([^}]*)\\}').exec(css);
    assert.ok(m, 'rule for ' + lv);
    assert.ok(m[1].indexOf('background: var(--' + lv + ')') >= 0, lv + ' background');
    assert.ok(m[1].indexOf('color: var(--on-' + lv + ')') >= 0, lv + ' text');
    assert.ok(ratio(token('on-' + lv), token(lv)) >= 4.5);
  });
});
