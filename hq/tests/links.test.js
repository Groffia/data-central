'use strict';
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const vm = require('node:vm');
const { loadHQ } = require('./helpers/load');

const ROOT = path.join(__dirname, '..');
const { Engine, HQ } = loadHQ();
const BASE = '../pipeline/';
const CTX = { exportRows: 20, tiering: Engine.TIERING_DEFAULTS };

const incidentFull = () => Engine.AUTOPLAY.incident.map(function (a) { return Object.assign({}, a); });

// Scripted incident with the first repairRow replaced by a discardRow of the same id and a reason that is not the suggested one.
function diverged() {
  const acts = incidentFull();
  const i = acts.findIndex(function (a) { return a.type === 'repairRow'; });
  assert.ok(i >= 0);
  acts[i] = { type: 'discardRow', dlqId: acts[i].dlqId, reason: 'Other, see note' };
  return acts;
}

test('pipelineUrl: exact URLs for a scripted step, the full script and a diverged state', () => {
  const U = HQ.links.pipelineUrl;
  assert.strictEqual(U(BASE, 'incident', Engine.AUTOPLAY.incident.slice(0, 3), 'dlq-3-4', Engine), '../pipeline/?scenario=incident&step=3#dlq-3-4');
  assert.strictEqual(U(BASE, 'incident', incidentFull(), 'stage-storage', Engine), '../pipeline/?scenario=incident&step=16#stage-storage');
  const d = diverged();
  assert.strictEqual(Engine.stepForActions('incident', d), null);
  assert.strictEqual(U(BASE, 'incident', d, 'stage-storage', Engine), '../pipeline/?scenario=incident&a=' + Engine.encodeActions(d) + '#stage-storage');
  assert.ok(U(BASE, 'incident', d, 'x', Engine).indexOf('step=') < 0);
});

test('pipelineUrl: healthy scenario, unencodable actions and no focus', () => {
  const U = HQ.links.pipelineUrl;
  assert.strictEqual(U(BASE, 'healthy', Engine.AUTOPLAY.healthy.slice(0, 2), '', Engine), '../pipeline/?scenario=healthy&step=2');
  assert.strictEqual(U(BASE, 'incident', [{ type: 'bogus' }], null, Engine), '../pipeline/?scenario=incident');
  assert.strictEqual(U(BASE, 'incident', 'nope', undefined, Engine), '../pipeline/?scenario=incident');
});

test('pipelineUrl: base that is not a non-empty string gives null', () => {
  [undefined, null, '', 0, 5, {}, [], true].forEach(function (b) {
    assert.strictEqual(HQ.links.pipelineUrl(b, 'incident', [], 'x', Engine), null, String(b));
  });
});

const HOSTILE = ['java\tscript:alert(1)', 'java\nscript:alert(1)', ' JaVaScRiPt:alert(1)', 'JaVaScRiPt:x', '//evil', '//evil.example/pipeline/',
  'https://evil.example/', 'http://evil.example/', 'data:text/html,x', 'file:///c:/x', 'a:b', '../pipe line/', '../pipeline/"onmouseover=x', '../pipeline/<x>',
  '../pipeline/\u0000', '../pipeline/\r\n', '\\\\evil', 'a'.repeat(2001), '../' + 'a'.repeat(2000)];

test('safeBase and pipelineUrl: hostile bases are rejected', () => {
  HOSTILE.forEach(function (b) {
    assert.strictEqual(HQ.links.safeBase(b), '', JSON.stringify(b).slice(0, 40));
    assert.strictEqual(HQ.links.pipelineUrl(b, 'incident', [], 'dlq-1-1', Engine), null, JSON.stringify(b).slice(0, 40));
  });
});

test('safeBase: the same allowlist as the Pipeline renderer accepts ordinary relative bases', () => {
  ['../pipeline/', 'pipeline/', '/data-central/pipeline/', './pipeline/', '../pipeline/?x=1&y=2', 'a'.repeat(2000)].forEach(function (b) {
    assert.strictEqual(HQ.links.safeBase(b), b);
  });
  // Rule-for-rule parity with the Pipeline renderer's copy.
  const src = fs.readFileSync(path.join(ROOT, '..', 'pipeline', 'src', 'render.js'), 'utf8');
  const m = /function safeHref\(href\) \{[\s\S]*?\n  \}\n/.exec(src);
  assert.ok(m, 'found safeHref in the Pipeline renderer');
  const theirs = vm.runInNewContext('(' + m[0].replace('function safeHref', 'function') + ')');
  HOSTILE.concat(['../pipeline/', 'x', '', 'a:b/c', 'a/b:c', '#a:b', '?a:b', ':', 'a'.repeat(2000), 'a'.repeat(2001), null, 5]).forEach(function (b) {
    assert.strictEqual(HQ.links.safeBase(b), theirs(b), JSON.stringify(b).slice(0, 40));
  });
});

test('focus allowlist: only [A-Za-z0-9_-] and non-empty gives a fragment', () => {
  const U = HQ.links.pipelineUrl;
  ['dlq-3-4', 'stage-storage', 'A_b-9'].forEach(function (f) {
    assert.ok(U(BASE, 'incident', [], f, Engine).endsWith('#' + f), f);
  });
  ['', 'a b', 'a"b', 'a<b>', 'a#b', 'a&b', '../x', 'é', 'a\n', 5, null, undefined, {}].forEach(function (f) {
    assert.ok(U(BASE, 'incident', [], f, Engine).indexOf('#') < 0, JSON.stringify(f));
  });
});

// ---- view model and render ----

function model(scenario, actions, base) {
  const state = Engine.getState(scenario, actions);
  const ctx = base === undefined ? CTX : Object.assign({}, CTX, { pipelineBase: base });
  return HQ.viewmodel.buildViewModel(state, { scenario: scenario, actions: actions }, ctx);
}

test('with a base: each dead-letter id and the Storage chip are links with exact attributes', () => {
  const acts = Engine.AUTOPLAY.incident.slice(0, 3);
  const regions = HQ.render.renderRegions(model('incident', acts, BASE));
  const rows = model('incident', acts, BASE).incident.rows;
  assert.ok(rows.length > 0);
  rows.forEach(function (r) {
    const url = '../pipeline/?scenario=incident&amp;step=3#' + r.dlqId;
    assert.ok(regions.incident.indexOf('<td><a href="' + url + '" aria-label="Open ' + r.dlqId + ' in Pipeline">' + r.dlqId + '</a></td>') >= 0, r.dlqId);
  });
  assert.ok(rows.some(function (r) { return r.dlqId === 'dlq-3-4'; }), 'incident k=3 has dlq-3-4');
  assert.ok(regions.incident.indexOf('<a href="../pipeline/?scenario=incident&amp;step=3#dlq-3-4" aria-label="Open dlq-3-4 in Pipeline">dlq-3-4</a>') >= 0);
  assert.ok(regions.stages.indexOf('<a href="../pipeline/?scenario=incident&amp;step=3#stage-storage" aria-label="Open Storage in Pipeline">') >= 0, regions.stages);
  assert.strictEqual((regions.stages.match(/<a /g) || []).length, 1);
});

test('hrefs are HTML-escaped (an ampersand in the base becomes &amp;)', () => {
  const acts = Engine.AUTOPLAY.incident.slice(0, 3);
  const regions = HQ.render.renderRegions(model('incident', acts, '../pipeline/?k=1&j=2'));
  assert.ok(regions.stages.indexOf('href="../pipeline/?k=1&amp;j=2?scenario=incident') >= 0, regions.stages);
  assert.ok(!/href="[^"]*&(?!amp;)/.test(regions.stages + regions.incident));
});

test('without a base: no links and plain ids; ctx without pipelineBase equals ctx with pipelineBase undefined or null', () => {
  const acts = Engine.AUTOPLAY.incident.slice(0, 3);
  const a = HQ.render.renderRegions(model('incident', acts));
  const b = HQ.render.renderRegions(model('incident', acts, undefined));
  const c = HQ.render.renderRegions(model('incident', acts, null));
  const d = HQ.render.renderRegions(model('incident', acts, ''));
  const e = HQ.render.renderRegions(model('incident', acts, '//evil'));
  assert.deepStrictEqual(b, a); assert.deepStrictEqual(c, a); assert.deepStrictEqual(d, a); assert.deepStrictEqual(e, a);
  assert.ok(a.incident.indexOf('<a ') < 0 && a.stages.indexOf('<a ') < 0);
  assert.ok(/<td>dlq-\d+-\d+<\/td>/.test(a.incident));
  const m = model('incident', acts);
  m.incident.rows.forEach(function (r) { assert.ok(!('href' in r)); });
  m.chips.forEach(function (ch) { assert.ok(!('href' in ch)); });
});

// Hashes of every region for ten scripted states, taken from the code as it was before links existed (test-first baseline).
const BASELINE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'pre-links-hashes.json'), 'utf8'));

test('no base: output is byte-identical to the pre-links baseline for ten scripted states', () => {
  const keys = Object.keys(BASELINE);
  assert.strictEqual(keys.length, 10);
  keys.forEach(function (key) {
    const sc = key.split(':')[0], k = Number(key.split(':')[1]);
    const acts = Engine.AUTOPLAY[sc].slice(0, k);
    const r = HQ.render.renderRegions(model(sc, acts));
    assert.deepStrictEqual(Object.keys(r).sort(), Object.keys(BASELINE[key]));
    Object.keys(r).forEach(function (region) {
      assert.strictEqual(crypto.createHash('sha256').update(r[region]).digest('hex'), BASELINE[key][region], key + ' ' + region);
    });
  });
});

test('with a base: stripping the added anchors gives exactly the no-base output, for ten states', () => {
  const strip = function (html) { return html.replace(/<a href="[^"]*" aria-label="Open [^"]*in Pipeline">/g, '').replace(/<\/a>/g, ''); };
  Object.keys(BASELINE).forEach(function (key) {
    const sc = key.split(':')[0], k = Number(key.split(':')[1]);
    const acts = Engine.AUTOPLAY[sc].slice(0, k);
    const withBase = HQ.render.renderRegions(model(sc, acts, BASE));
    const without = HQ.render.renderRegions(model(sc, acts));
    Object.keys(without).forEach(function (region) { assert.strictEqual(strip(withBase[region]), without[region], key + ' ' + region); });
  });
});

test('a diverged state links through a= (and never step=) in the rendered hrefs', () => {
  const d = diverged();
  const regions = HQ.render.renderRegions(model('incident', d, BASE));
  const a = Engine.encodeActions(d);
  assert.ok(regions.stages.indexOf('a=' + a + '#stage-storage') >= 0);
  assert.ok(regions.stages.indexOf('step=') < 0 && regions.incident.indexOf('step=') < 0);
  assert.ok(regions.incident.indexOf('a=' + a + '#dlq-') >= 0);
});

test('a dlq id outside the focus allowlist renders as escaped plain text, not a link', () => {
  const acts = Engine.AUTOPLAY.incident.slice(0, 3);
  const state = JSON.parse(JSON.stringify(Engine.getState('incident', acts)));
  state.dlq[0].dlqId = '"><img src=x onerror=alert(1)>';
  state.dlq[1].dlqId = 'dlq-ok_1';
  const m = HQ.viewmodel.buildViewModel(state, { scenario: 'incident', actions: acts }, Object.assign({}, CTX, { pipelineBase: BASE }));
  const html = HQ.render.renderRegions(m).incident;
  assert.ok(html.indexOf('<img') < 0);
  assert.ok(html.indexOf('<td>&quot;&gt;&lt;img src=x onerror=alert(1)&gt;</td>') >= 0, html.slice(0, 600));
  assert.ok(html.indexOf('aria-label="Open dlq-ok_1 in Pipeline"') >= 0);
  assert.ok(html.indexOf('href="../pipeline/?scenario=incident&amp;step=3#dlq-ok_1"') >= 0);
  assert.ok(html.indexOf('Open "') < 0 && html.indexOf('Open &quot;') < 0);
});

// ---- controller ----

test('controller: pipelineBase from options reaches the model; diverging after a discard switches to a=', () => {
  const c = HQ.controller.createController(Engine, '?scenario=incident&step=3', { pipelineBase: BASE });
  const m0 = c.getModel();
  assert.ok(m0.incident.rows.length > 0);
  assert.strictEqual(m0.incident.rows[0].href, '../pipeline/?scenario=incident&step=3#' + m0.incident.rows[0].dlqId);
  assert.strictEqual(m0.chips[3].href, '../pipeline/?scenario=incident&step=3#stage-storage');
  const first = m0.incident.rows.filter(function (r) { return r.repairable; })[0];
  assert.ok(first);
  const r = c.dispatch({ type: 'discard', dlqId: first.dlqId, reason: 'Other, see note' });
  assert.ok(r.ok, JSON.stringify(r));
  const m1 = c.getModel();
  assert.ok(m1.chips[3].href.indexOf('&a=' + Engine.encodeActions(c.actions()) + '#stage-storage') >= 0);
  assert.ok(m1.chips[3].href.indexOf('step=') < 0);
  const plain = HQ.controller.createController(Engine, '?scenario=incident&step=3').getModel();
  plain.incident.rows.forEach(function (row) { assert.ok(!('href' in row)); });
  const hostile = HQ.controller.createController(Engine, '?scenario=incident&step=3', { pipelineBase: 'https://evil.example/' }).getModel();
  hostile.chips.forEach(function (ch) { assert.ok(!('href' in ch)); });
});

// ---- main.js reads the meta tag ----

function bootMain(metaContent) {
  const els = {};
  const document = {
    getElementById: function (id) { return els[id] || (els[id] = { id: id, innerHTML: '', textContent: '' }); },
    activeElement: null,
    querySelector: function (s) {
      if (s === 'meta[name="pipeline-base"]' && metaContent !== null) return { getAttribute: function (k) { return k === 'content' ? metaContent : null; } };
      return null;
    },
    querySelectorAll: function () { return []; },
    addEventListener: function () {}
  };
  const ctx = vm.createContext({ Engine, document, window: { setTimeout: function () { return 1; }, clearTimeout: function () {} },
    location: { search: '?scenario=incident&step=3' }, performance: { now: function () { return 0; } }, console });
  ['../../shared/escape', '../../shared/format', '../../shared/vendor', 'links', 'viewmodel', 'render', 'controller', 'autoplay', 'main'].forEach(function (n) {
    const f = path.join(ROOT, 'src', n + '.js');
    vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
  });
  return els;
}

test('main.js: meta tag present gives links; absent, hostile or empty gives none', () => {
  const on = bootMain('../pipeline/');
  assert.ok(on['region-incident'].innerHTML.indexOf('in Pipeline') >= 0);
  assert.ok(on['region-stages'].innerHTML.indexOf('Open Storage in Pipeline') >= 0);
  [null, '', 'https://evil.example/', 'javascript:alert(1)'].forEach(function (c) {
    const off = bootMain(c);
    assert.ok(off['region-incident'].innerHTML.indexOf('in Pipeline') < 0, String(c));
    assert.ok(off['region-stages'].innerHTML.indexOf('<a ') < 0, String(c));
  });
});

// ---- build output ----

const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'hqlinks-'));
const built = cp.spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'inline.js'), '--out', OUT], { cwd: ROOT, encoding: 'utf8' });

test('single-file build: no pipeline-base meta and no ../pipeline/ string anywhere; Pages form keeps the meta', () => {
  assert.strictEqual(built.status, 0, built.stderr);
  const single = fs.readFileSync(path.join(OUT, 'hq-single.html'), 'utf8');
  const pages = fs.readFileSync(path.join(OUT, 'pages', 'index.html'), 'utf8');
  assert.ok(!/<meta[^>]*pipeline-base/i.test(single));
  assert.ok(single.indexOf('../pipeline/') < 0);
  assert.ok(single.indexOf('<meta charset="utf-8">') >= 0 && single.indexOf('name="viewport"') >= 0, 'other metas kept');
  assert.ok(/<meta name="pipeline-base" content="\.\.\/pipeline\/">/.test(pages));
});

test('index.html declares the meta tag', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.strictEqual((html.match(/<meta name="pipeline-base" content="\.\.\/pipeline\/">/g) || []).length, 1);
});

test('running the single file shows no Pipeline link', () => {
  const single = fs.readFileSync(path.join(OUT, 'hq-single.html'), 'utf8');
  const els = {};
  const metaRe = /<meta[^>]*name="pipeline-base"[^>]*content="([^"]*)"[^>]*>/i;
  const document = {
    getElementById: function (id) { return els[id] || (els[id] = { id: id, innerHTML: '', textContent: '' }); },
    activeElement: null,
    querySelector: function (s) {
      if (s.indexOf('meta') !== 0) return null;
      const m = metaRe.exec(single);
      return m ? { getAttribute: function () { return m[1]; } } : null;
    },
    querySelectorAll: function () { return []; },
    addEventListener: function () {}
  };
  const ctx = vm.createContext({ document, window: { setTimeout: function () { return 1; }, clearTimeout: function () {} },
    location: { search: '?scenario=incident&step=3' }, performance: { now: function () { return 0; } }, console });
  single.replace(/<script>([\s\S]*?)<\/script>/g, function (m, code) { vm.runInContext(code, ctx); return m; });
  assert.ok(els['region-incident'].innerHTML.length > 0);
  assert.ok(els['region-incident'].innerHTML.indexOf('in Pipeline') < 0);
  assert.ok(els['region-stages'].innerHTML.indexOf('<a ') < 0);
});
