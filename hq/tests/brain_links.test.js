'use strict';
// HQ v1.3: chips 5 and 8 link into the Brain page; chip texts are unchanged.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const { loadHQ } = require('./helpers/load');

const ROOT = path.join(__dirname, '..');
const { Engine, HQ } = loadHQ();
const BB = '../brain/';
const CTX = { exportRows: 20, tiering: Engine.TIERING_DEFAULTS };
const J = (x) => JSON.parse(JSON.stringify(x));

function model(scenario, actions, ctxExtra) {
  const state = Engine.getState(scenario, actions);
  return HQ.viewmodel.buildViewModel(state, { scenario: scenario, actions: actions }, Object.assign({}, CTX, ctxExtra));
}
const chips = (m) => J(m.chips);

test('brainUrl: scripted step, a= for a diverged state, focus, null for a missing or unsafe base', () => {
  const U = HQ.links.brainUrl;
  assert.equal(U(BB, 'incident', Engine.AUTOPLAY.incident.slice(0, 3), 'stage-phi', Engine), '../brain/?scenario=incident&step=3#stage-phi');
  const d = Engine.actionsForStep('incident', 3).concat([{ type: 'discardRow', dlqId: 'dlq-3-2', reason: 'Other, see note' }]);
  assert.equal(U(BB, 'incident', d, 'stage-retention', Engine), '../brain/?scenario=incident&a=' + Engine.encodeActions(d) + '#stage-retention');
  [undefined, null, '', 0, {}, '//evil', 'https://evil.example/', 'javascript:alert(1)', '../b rain/'].forEach((b) => assert.equal(U(b, 'incident', [], 'x', Engine), null));
  ['a b', 'a"b', null, undefined, 5].forEach((f) => assert.ok(U(BB, 'incident', [], f, Engine).indexOf('#') < 0));
});

test('chips 5 and 8 link to the Brain panels with the state; the other chips are unchanged', () => {
  const a = Engine.actionsForStep('incident', 3);
  const withBase = chips(model('incident', a, { brainBase: BB, pipelineBase: '../pipeline/', valueBase: '../value/' }));
  assert.equal(withBase[4].href, '../brain/?scenario=incident&step=3#stage-phi');
  assert.equal(withBase[7].href, '../brain/?scenario=incident&step=3#stage-retention');
  assert.equal(withBase[3].href, '../pipeline/?scenario=incident&step=3#stage-storage');
  assert.equal(withBase[5].href, '../value/?scenario=incident&step=3#stage-check');
  [0, 1, 2].forEach((i) => assert.ok(!('href' in withBase[i])));
  const without = chips(model('incident', a, {}));
  assert.ok(!('href' in without[4]) && !('href' in without[7]));
});

test('chip texts, health and ids are unchanged by the links, in every scripted state', () => {
  for (const sc of ['healthy', 'incident']) {
    for (let step = Engine.PRELUDE[sc].length; step <= Engine.AUTOPLAY[sc].length; step++) {
      const a = Engine.actionsForStep(sc, step);
      const plain = chips(model(sc, a, {}));
      const linked = chips(model(sc, a, { brainBase: BB }));
      linked.forEach((c, i) => {
        const copy = Object.assign({}, c);
        delete copy.href;
        assert.deepEqual(copy, plain[i], sc + step + ' chip ' + (i + 1));
      });
    }
  }
});

test('a diverged state carries a= on both Brain links', () => {
  const d = Engine.decodeActions('r.r.p:dlq-3-2.r');
  const c = chips(model('incident', d, { brainBase: BB }));
  assert.equal(c[4].href, '../brain/?scenario=incident&a=r.r.p:dlq-3-2.r#stage-phi');
  assert.equal(c[7].href, '../brain/?scenario=incident&a=r.r.p:dlq-3-2.r#stage-retention');
});

test('the too-long-state notice also applies when only the Brain base is present', () => {
  const long = Engine.AUTOPLAY.incident.slice(0, 3).map((x) => Object.assign({}, x));
  for (let i = 0; i < 1100; i++) long.push(i % 2 ? { type: 'repairRow', dlqId: 'dlq-3-' + (i % 9) } : { type: 'discardRow', dlqId: 'dlq-3-' + (i % 9), reason: 'Other, see note' });
  assert.equal(Engine.encodeActions(long), null);
  const m = model('incident', long, { brainBase: BB });
  assert.equal(m.linkNote, 'State too long to link; opens at the nearest step.');
  assert.equal(chips(m)[4].href, '../brain/?scenario=incident&step=3#stage-phi');
  assert.equal(model('incident', Engine.actionsForStep('incident', 3), { brainBase: BB }).linkNote, null);
  assert.equal(model('incident', long, {}).linkNote, null);
});

test('the controller passes brainBase through to the chips', () => {
  const c = HQ.controller.createController(Engine, '?scenario=incident&step=3', { brainBase: BB });
  const m = J(c.getModel());
  assert.equal(m.chips[4].href, '../brain/?scenario=incident&step=3#stage-phi');
});

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
test('index.html carries the brain-base meta once, in the head', () => {
  assert.equal((html.match(/<meta name="brain-base" content="\.\.\/brain\/">/g) || []).length, 1);
  assert.ok(html.indexOf('name="brain-base"') < html.indexOf('</head>'));
});

test('rendered chip links say "opens in Brain" for chips 5 and 8, Pipeline for 4, Value for 6 and 7', () => {
  const m = J(model('incident', Engine.actionsForStep('incident', 3), { brainBase: BB, pipelineBase: '../pipeline/', valueBase: '../value/' }));
  const out = HQ.render.renderRegions(m).stages;
  const label = (n) => new RegExp('aria-label="[^"]*\\(opens in ([A-Za-z]+)\\)"').exec(out.split('<li')[n]);
  assert.equal(label(4)[1], 'Pipeline');
  assert.equal(label(5)[1], 'Brain');
  assert.equal(label(6)[1], 'Value');
  assert.equal(label(7)[1], 'Value');
  assert.equal(label(8)[1], 'Brain');
});

test('single-file build: no brain-base meta and no ../brain/ string anywhere; Pages form keeps the meta', () => {
  const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'hqbrain-'));
  const built = cp.spawnSync(process.execPath, [path.join(ROOT, '..', 'scripts', 'inline.js'), ROOT, '--out', OUT], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(built.status, 0, built.stderr);
  const single = fs.readFileSync(path.join(OUT, 'hq-single.html'), 'utf8');
  const pages = fs.readFileSync(path.join(OUT, 'pages', 'index.html'), 'utf8');
  assert.ok(!/<meta[^>]*brain-base/.test(single) && single.indexOf("../brain/") < 0);
  assert.ok(/<meta name="brain-base" content="\.\.\/brain\/">/.test(pages));
});
