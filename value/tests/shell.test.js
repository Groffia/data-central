'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const KEYS = ['header', 'kpis', 'trends', 'compare', 'definitions', 'check', 'vendor', 'notice', 'footer'];

function count(s, sub) { return s.split(sub).length - 1; }

test('title', () => {
  assert.ok(html.indexOf('<title>Value: What the Business Sees</title>') >= 0);
});

test('one section container per region key, exactly once, nothing extra', () => {
  KEYS.forEach(function (k) {
    assert.strictEqual(count(html, 'id="region-' + k + '"'), 1, k);
    assert.ok(new RegExp('<section\\b[^>]*id="region-' + k + '"').test(html), k + ' is a section');
  });
  assert.strictEqual((html.match(/id="region-/g) || []).length, KEYS.length);
});

test('deep-link stage anchors are emitted by the renderer, not the static page', () => {
  assert.strictEqual(count(html, 'id="stage-definitions"'), 0);
  assert.strictEqual(count(html, 'id="stage-check"'), 0);
});

test('caption is an aria-live polite element, once', () => {
  assert.strictEqual(count(html, 'id="caption"'), 1);
  const tag = /<[a-z]+[^>]*id="caption"[^>]*>/.exec(html)[0];
  assert.ok(/aria-live="polite"/.test(tag));
});

test('both hq-base and pipeline-base metas present once, in the head', () => {
  assert.strictEqual(count(html, 'name="hq-base"'), 1);
  assert.strictEqual(count(html, 'name="pipeline-base"'), 1);
  assert.ok(html.indexOf('<meta name="hq-base" content="../hq/">') >= 0);
  assert.ok(html.indexOf('<meta name="pipeline-base" content="../pipeline/">') >= 0);
  assert.ok(html.indexOf('name="pipeline-base"') < html.indexOf('</head>'));
});

test('footer has the synthetic-data sentence', () => {
  assert.ok(html.indexOf('All data is synthetic and generated deterministically (seed 42). Company names are fictional.') >= 0);
});

const scripts = [];
html.replace(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g, function (m, src) { scripts.push({ tag: m, src: src }); return m; });

test('scripts: all data-inline, exist on disk, in order', () => {
  scripts.forEach(function (s) {
    assert.ok(/\bdata-inline\b/.test(s.tag), s.src);
    if (s.src === 'engine.js') assert.ok(fs.existsSync(path.join(ROOT, '..', 'engine', 'engine.js')));
    else if (s.src.indexOf('shared/') === 0) assert.ok(fs.existsSync(path.join(ROOT, '..', s.src)), s.src);
    else assert.ok(fs.existsSync(path.join(ROOT, s.src)), s.src);
  });
  assert.deepStrictEqual(scripts.map(function (s) { return s.src; }), [
    'engine.js', 'shared/escape.js', 'shared/format.js', 'shared/vendor.js',
    'src/viewmodel.js', 'src/chart.js', 'src/definitions.js', 'src/render.js',
    'src/controller.js', 'src/main.js'
  ]);
});

test('stylesheet link is data-inline and exists', () => {
  const m = /<link\b[^>]*rel="stylesheet"[^>]*>/.exec(html);
  assert.ok(m && /href="src\/styles\.css"/.test(m[0]) && /\bdata-inline\b/.test(m[0]));
  assert.ok(fs.existsSync(path.join(ROOT, 'src', 'styles.css')));
});

test('no http(s) in any src or href', () => {
  const re = /\b(?:src|href)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(html))) assert.ok(!/https?:\/\//i.test(m[1]), m[1]);
});
