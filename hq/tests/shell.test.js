'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadHQ } = require('./helpers/load');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const { Engine, HQ } = loadHQ();
const vm0 = HQ.viewmodel.buildViewModel(Engine.getState('healthy', Engine.actionsForStep('healthy', 1)),
  { scenario: 'healthy' }, { exportRows: 20, tiering: Engine.TIERING_DEFAULTS });
const KEYS = Object.keys(HQ.render.renderRegions(vm0));

function count(s, sub) { return s.split(sub).length - 1; }

test('one container per region key', () => {
  KEYS.forEach(function (k) {
    assert.strictEqual(count(html, 'id="region-' + k + '"'), 1, k);
  });
  assert.strictEqual((html.match(/id="region-/g) || []).length, KEYS.length);
});

test('caption is an aria-live polite element', () => {
  assert.ok(/<[a-z]+[^>]*id="caption"[^>]*>/.test(html));
  const tag = /<[a-z]+[^>]*id="caption"[^>]*>/.exec(html)[0];
  assert.ok(/aria-live="polite"/.test(tag));
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
    'engine.js', 'shared/escape.js', 'shared/format.js', 'shared/vendor.js', 'src/viewmodel.js', 'src/render.js',
    'src/controller.js', 'src/autoplay.js', 'src/main.js'
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

test('persistent notice-live container sits after controls, before incident, aria-live polite', () => {
  const tag = /<[a-z]+[^>]*id="notice-live"[^>]*>/.exec(html);
  assert.ok(tag && /aria-live="polite"/.test(tag[0]));
  assert.strictEqual(count(html, 'id="notice-live"'), 1);
  assert.ok(html.indexOf('id="region-controls"') < html.indexOf('id="notice-live"'));
  assert.ok(html.indexOf('id="notice-live"') < html.indexOf('id="region-incident"'));
});

test('banner region is a persistent aria-live polite container', () => {
  const tag = /<[a-z]+[^>]*id="region-banner"[^>]*>/.exec(html);
  assert.ok(tag && /aria-live="polite"/.test(tag[0]));
});
