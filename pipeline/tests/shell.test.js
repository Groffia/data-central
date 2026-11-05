'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const KEYS = ['header', 'batches', 'generation', 'landing', 'matrix', 'rows', 'dlq', 'medallion', 'storage', 'vendor', 'notice', 'footer'];

function count(s, sub) { return s.split(sub).length - 1; }

test('title', () => {
  assert.ok(html.indexOf('<title>Pipeline: Under the Hood</title>') >= 0);
});

test('one container per region key, exactly once, nothing extra', () => {
  KEYS.forEach(function (k) {
    assert.strictEqual(count(html, 'id="region-' + k + '"'), 1, k);
  });
  assert.strictEqual((html.match(/id="region-/g) || []).length, KEYS.length);
});

test('caption is an aria-live polite element, once', () => {
  assert.strictEqual(count(html, 'id="caption"'), 1);
  const tag = /<[a-z]+[^>]*id="caption"[^>]*>/.exec(html)[0];
  assert.ok(/aria-live="polite"/.test(tag));
});

test('skip link exists and targets an existing id', () => {
  const m = /<a\b[^>]*class="skip-link"[^>]*href="#([^"]+)"/.exec(html);
  assert.ok(m);
  assert.strictEqual(count(html, 'id="' + m[1] + '"'), 1);
});

test('no pipeline-base meta tag; hq-base meta present once with exactly ../hq/', () => {
  assert.ok(!/pipeline-base/.test(html));
  assert.strictEqual(count(html, 'name="hq-base"'), 1);
  assert.ok(html.indexOf('<meta name="hq-base" content="../hq/">') >= 0);
  assert.ok(html.indexOf('<meta name="hq-base"') < html.indexOf('</head>'), 'in the head');
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
    'src/viewmodel.js', 'src/render.js', 'src/controller.js', 'src/main.js'
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
