'use strict';
// HQ v1.2: links into the Value page, chip 6 and 7 and KPI tile links, the too-long-state notice, the value-base meta.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const vm = require('node:vm');
const { loadHQ } = require('./helpers/load');

const ROOT = path.join(__dirname, '..');
const { Engine, HQ } = loadHQ();
const VB = '../value/';
const PB = '../pipeline/';
const CTX = { exportRows: 20, tiering: Engine.TIERING_DEFAULTS };
const NOTE = 'State too long to link; opens at the nearest step.';
const J = (x) => JSON.parse(JSON.stringify(x));

function model(scenario, actions, ctxExtra) {
  const state = Engine.getState(scenario, actions);
  return HQ.viewmodel.buildViewModel(state, { scenario: scenario, actions: actions }, Object.assign({}, CTX, ctxExtra));
}
// Incident step 3 followed by 1,100 alternating repair/discard actions: encodeActions returns null (over 2,000 characters).
function longActions() {
  const a = Engine.AUTOPLAY.incident.slice(0, 3).map((x) => Object.assign({}, x));
  for (let i = 0; i < 1100; i++) {
    const id = 'dlq-3-' + (i % 9);
    a.push(i % 2 ? { type: 'repairRow', dlqId: id } : { type: 'discardRow', dlqId: id, reason: 'Other, see note' });
  }
  return a;
}
const DIVERGED = () => Engine.actionsForStep('incident', 3).concat([{ type: 'discardRow', dlqId: 'dlq-3-2', reason: 'Other, see note' }]);

test('valueUrl: scripted step, a= for a diverged state, focus, null base', () => {
  const U = HQ.links.valueUrl;
  assert.equal(U(VB, 'incident', 3, Engine.AUTOPLAY.incident.slice(0, 3), 'kpi-bed-occupancy'), '../value/?scenario=incident&step=3#kpi-bed-occupancy');
  assert.equal(U(VB, 'healthy', null, Engine.AUTOPLAY.healthy.slice(0, 4), 'stage-check'), '../value/?scenario=healthy&step=4#stage-check');
  const d = DIVERGED();
  const u = U(VB, 'incident', null, d, 'stage-check');
  assert.equal(u, '../value/?scenario=incident&a=' + Engine.encodeActions(d) + '#stage-check');
  assert.ok(u.indexOf('step=') < 0);
  assert.equal(U(VB, 'incident', 3, [], ''), '../value/?scenario=incident&step=3');
  ['a b', 'a"b', 'a#b', null, undefined, 5].forEach((f) => assert.ok(U(VB, 'incident', 3, [], f).indexOf('#') < 0));
  [undefined, null, '', 0, {}, [], true].forEach((b) => assert.equal(U(b, 'incident', 3, [], 'x'), null));
  ['//evil', 'https://evil.example/', 'javascript:alert(1)', ' JaVaScRiPt:x', '../v alue/', '../value/"x', 'a'.repeat(2001)].forEach((b) => {
    assert.equal(U(b, 'incident', 3, [], 'x'), null, b.slice(0, 30));
  });
});

test('valueUrl and pipelineUrl: over the 2,000 cap the link opens at the nearest scripted step, never below the floor', () => {
  const long = longActions();
  assert.equal(Engine.encodeActions(long), null);
  assert.equal(HQ.links.valueUrl(VB, 'incident', null, long, 'stage-check'), '../value/?scenario=incident&step=3#stage-check');
  assert.equal(HQ.links.pipelineUrl(PB, 'incident', long, 'stage-storage', Engine), '../pipeline/?scenario=incident&step=3#stage-storage');
  const wild = [];
  for (let i = 0; i < 1100; i++) wild.push({ type: 'repairRow', dlqId: 'dlq-9-' + i });
  assert.equal(HQ.links.valueUrl(VB, 'incident', null, wild, ''), '../value/?scenario=incident&step=2');
  assert.equal(HQ.links.valueUrl(VB, 'healthy', null, wild, ''), '../value/?scenario=healthy&step=0');
});

test('chips 6 and 7 and the four KPI tiles link to Value with the real anchors', () => {
  const acts = Engine.AUTOPLAY.incident.slice(0, 3);
  const m = model('incident', acts, { valueBase: VB });
  assert.equal(m.chips[5].href, '../value/?scenario=incident&step=3#stage-check');
  assert.equal(m.chips[6].href, '../value/?scenario=incident&step=3#kpi-abnormal-vital-rate');
  [0, 1, 2, 3, 4, 7].forEach((i) => assert.ok(!('href' in m.chips[i]), 'chip ' + (i + 1)));
  const ids = ['bed-occupancy', 'abnormal-vital-rate', 'avg-length-of-stay', '30-day-readmission-rate'];
  assert.equal(m.tiles.length, 4);
  m.tiles.forEach((t, i) => assert.equal(t.href, '../value/?scenario=incident&step=3#kpi-' + ids[i]));
  const r = HQ.render.renderRegions(m);
  assert.ok(r.stages.indexOf('<a href="../value/?scenario=incident&amp;step=3#stage-check" aria-label="Open Analysis/Modeling in Value">Expected-range check: ') >= 0, r.stages);
  assert.ok(r.stages.indexOf('aria-label="Open Visualization in Value"') >= 0);
  assert.equal((r.stages.match(/<a /g) || []).length, 2);
  assert.equal((r.tiles.match(/<a /g) || []).length, 4);
  assert.ok(r.tiles.indexOf('<a href="../value/?scenario=incident&amp;step=3#kpi-30-day-readmission-rate" aria-label="Open 30-Day Readmission Rate in Value">30-Day Readmission Rate</a>') >= 0, r.tiles);
});

test('Pipeline and Value links coexist; no usable Value base means no Value links', () => {
  const acts = Engine.AUTOPLAY.incident.slice(0, 3);
  const both = model('incident', acts, { valueBase: VB, pipelineBase: PB });
  assert.ok(both.chips[3].href.indexOf('../pipeline/') === 0);
  assert.ok(both.chips[5].href.indexOf('../value/') === 0);
  const p = model('incident', acts, { pipelineBase: PB });
  assert.ok(!('href' in p.chips[5]) && !('href' in p.chips[6]));
  p.tiles.forEach((t) => assert.ok(!('href' in t)));
  ['//evil', 'https://evil.example/', '', null].forEach((b) => {
    const m = model('incident', acts, { valueBase: b });
    m.chips.forEach((c) => assert.ok(!('href' in c)));
    m.tiles.forEach((t) => assert.ok(!('href' in t)));
    assert.equal(m.linkNote, null);
  });
});

test('a diverged state links Value through a=', () => {
  const d = DIVERGED();
  const m = model('incident', d, { valueBase: VB });
  assert.equal(m.chips[5].href, '../value/?scenario=incident&a=' + Engine.encodeActions(d) + '#stage-check');
  assert.equal(m.linkNote, null);
});

test('too-long state: nearest-step links plus one visible note, only while the condition holds', () => {
  const long = longActions();
  const m = model('incident', long, { valueBase: VB, pipelineBase: PB });
  assert.equal(m.linkNote, NOTE);
  assert.equal(m.chips[5].href, '../value/?scenario=incident&step=3#stage-check');
  assert.equal(m.chips[3].href, '../pipeline/?scenario=incident&step=3#stage-storage');
  const html = HQ.render.renderRegions(m).notice;
  assert.equal(html.split(NOTE).length - 1, 1);
  assert.ok(html.indexOf('role="status"') >= 0);
  assert.equal(model('incident', Engine.AUTOPLAY.incident.slice(0, 3), { valueBase: VB }).linkNote, null);
  assert.equal(model('incident', long, {}).linkNote, null);
  assert.equal(HQ.render.renderRegions(model('incident', Engine.AUTOPLAY.incident.slice(0, 3), { valueBase: VB })).notice, '');
  const both = HQ.viewmodel.buildViewModel(Engine.getState('incident', long), { scenario: 'incident', actions: long, notice: 'No change' }, Object.assign({}, CTX, { valueBase: VB }));
  const h2 = HQ.render.renderRegions(both).notice;
  assert.ok(h2.indexOf('No change') >= 0 && h2.indexOf(NOTE) >= 0);
});

test('controller passes valueBase through; the note goes away after a reset', () => {
  const c = HQ.controller.createController(Engine, '?scenario=incident&step=3', { valueBase: VB });
  assert.equal(c.getModel().chips[5].href, '../value/?scenario=incident&step=3#stage-check');
  c.dispatch({ type: 'setActions', actions: longActions() });
  assert.equal(c.getModel().linkNote, NOTE);
  c.dispatch({ type: 'reset' });
  assert.equal(c.getModel().linkNote, null);
});

test('reverse link: HQ -> valueUrl -> Engine.parseLinkParams gives the same state', () => {
  const states = [
    ['healthy', Engine.AUTOPLAY.healthy.slice(0, 3)],
    ['incident', Engine.AUTOPLAY.incident.slice(0, 5)],
    ['incident', DIVERGED()]
  ];
  states.forEach(([sc, acts]) => {
    const href = model(sc, acts, { valueBase: VB }).chips[5].href;
    const q = href.slice(VB.length, href.indexOf('#'));
    const p = Engine.parseLinkParams(q);
    assert.equal(p.scenario, sc);
    const back = Array.isArray(p.actions) ? p.actions : Engine.actionsForStep(sc, p.step);
    assert.deepEqual(J(Engine.getState(sc, back)), J(Engine.getState(sc, acts)));
    const hq = HQ.controller.createController(Engine, q, {});
    assert.deepEqual(J(Engine.getState(sc, hq.actions())), J(Engine.getState(sc, acts)));
  });
});

function boot(html, valueMeta, pipelineMeta) {
  const els = {};
  const document = {
    getElementById: (id) => els[id] || (els[id] = { id, innerHTML: '', textContent: '' }),
    activeElement: null,
    querySelector: (s) => {
      const m = /^meta\[name="([a-z-]+)"\]$/.exec(s);
      if (!m) return null;
      const v = m[1] === 'value-base' ? valueMeta : m[1] === 'pipeline-base' ? pipelineMeta : null;
      return v === null || v === undefined ? null : { getAttribute: (k) => (k === 'content' ? v : null) };
    },
    querySelectorAll: () => [],
    addEventListener: () => {}
  };
  const ctx = vm.createContext({ Engine, document, window: { setTimeout: () => 1, clearTimeout: () => {} }, location: { search: '?scenario=incident&step=3' }, performance: { now: () => 0 }, console });
  if (html) {
    html.replace(/<script>([\s\S]*?)<\/script>/g, (m, code) => { vm.runInContext(code, ctx); return m; });
  } else {
    ['../../shared/escape', '../../shared/format', '../../shared/vendor', 'links', 'viewmodel', 'render', 'controller', 'autoplay', 'main'].forEach((n) => {
      const f = path.join(ROOT, 'src', n + '.js');
      vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
    });
  }
  return els;
}

test('main.js reads the value-base meta; absent, hostile or empty gives no Value link', () => {
  const on = boot(null, '../value/', null);
  assert.ok(on['region-stages'].innerHTML.indexOf('in Value') >= 0);
  assert.ok(on['region-tiles'].innerHTML.indexOf('in Value') >= 0);
  [null, '', 'https://evil.example/', 'javascript:alert(1)'].forEach((c) => {
    const off = boot(null, c, null);
    assert.ok(off['region-stages'].innerHTML.indexOf('<a ') < 0, String(c));
    assert.ok(off['region-tiles'].innerHTML.indexOf('<a ') < 0, String(c));
  });
});

test('index.html declares value-base once; the single file drops it and shows no Value link or external href', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.equal((html.match(/<meta name="value-base" content="\.\.\/value\/">/g) || []).length, 1);
  const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'hqvalue-'));
  const built = cp.spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'inline.js'), '--out', OUT], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(built.status, 0, built.stderr);
  const single = fs.readFileSync(path.join(OUT, 'hq-single.html'), 'utf8');
  const pages = fs.readFileSync(path.join(OUT, 'pages', 'index.html'), 'utf8');
  assert.ok(!/<meta[^>]*value-base/i.test(single));
  assert.ok(!/<meta[^>]*pipeline-base/i.test(single));
  assert.ok(single.indexOf('../value/') < 0);
  assert.ok(single.indexOf('<meta charset="utf-8">') >= 0 && single.indexOf('name="viewport"') >= 0);
  assert.ok(/<meta name="value-base" content="\.\.\/value\/">/.test(pages));
  assert.ok(/<meta name="pipeline-base" content="\.\.\/pipeline\/">/.test(pages));
  assert.ok(!/href\s*=\s*["']?(https?:|\/\/)/i.test(single));
  const metaOf = (name) => { const r = new RegExp('<meta[^>]*name="' + name + '"[^>]*content="([^"]*)"', 'i').exec(single); return r ? r[1] : null; };
  const els = boot(single, metaOf('value-base'), metaOf('pipeline-base'));
  assert.ok(els['region-stages'].innerHTML.length > 0);
  assert.ok(els['region-stages'].innerHTML.indexOf('<a ') < 0 && els['region-tiles'].innerHTML.indexOf('<a ') < 0);
});
