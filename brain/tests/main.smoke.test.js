'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { boot, REGION_KEYS } = require('./helpers/fakedom');

const SRC = path.join(__dirname, '..', 'src');
const MAIN = fs.readFileSync(path.join(SRC, 'main.js'), 'utf8');
const META = { 'hq-base': '../hq/', 'pipeline-base': '../pipeline/' };
const J = (x) => JSON.parse(JSON.stringify(x));
const SUBJECT = 'select[data-cmd="select-subject"]';
const ERASE = 'button[data-cmd="erase"]';
const HOLD = 'button[data-cmd="hold"]';
const LIST = 'button[data-cmd="list-toggle"]';
const NODE = (id) => 'button[data-cmd="node"][data-id="' + id + '"]';

function all(p) { return REGION_KEYS.map((k) => p.html(k)).join('\n'); }

// The model the page was built from, rendered fresh and compared region by region.
function assertInSync(p, label) {
  const model = p.controller().getModel();
  REGION_KEYS.forEach((k) => assert.equal(p.html(k), p.Brain().render[k](model), label + ': region ' + k));
}
function quiet(fn) {
  const errs = [];
  const real = console.error;
  console.error = function () { errs.push(Array.prototype.slice.call(arguments)); };
  try { fn(); } finally { console.error = real; }
  assert.deepEqual(errs, []);
}
function pick(p, id) {
  const s = p.q(SUBJECT);
  s.value = id;
  p.change(s);
}
function watchLive(p) {
  const live = p.document.getElementById('brain-live');
  let v = live.textContent;
  const w = { writes: 0, get text() { return v; } };
  Object.defineProperty(live, 'textContent', { get: () => v, set: (x) => { w.writes++; v = x; } });
  return w;
}
const IDS = require('../../engine/engine.js').buildPatientPool().map((x) => x.patient_id);

test('renders every region on load and leaves the static footer to index.html', () => {
  const p = boot({ meta: META });
  REGION_KEYS.forEach((k) => assert.equal(typeof p.html(k), 'string', k));
  assert.ok(p.html('contract').indexOf('contract-table') >= 0);
  assert.ok(p.html('lineage').indexOf('class="graph"') >= 0);
  assert.equal(p.html('footer'), undefined);
  assertInSync(p, 'load');
});

test('scripted session: DOM equals a fresh render after every command, no errors', () => {
  quiet(() => {
    const p = boot({ search: '?scenario=incident&step=3', meta: META });
    assertInSync(p, 'load');
    const steps = [
      ['next', () => p.clickRendered('button[data-cmd="next"]')],
      ['back', () => p.clickRendered('button[data-cmd="back"]')],
      ['node', () => p.clickRendered(NODE('vital_value'))],
      ['list on', () => p.clickRendered(LIST)],
      ['list off', () => p.clickRendered(LIST)],
      ['subject', () => pick(p, IDS[1])],
      ['erase', () => p.clickRendered(ERASE)],
      ['next after erase', () => p.clickRendered('button[data-cmd="next"]')],
      ['hold on', () => p.clickRendered(HOLD)],
      ['hold off', () => p.clickRendered(HOLD)],
      ['reset erasures', () => p.clickRendered('button[data-cmd="reset-erasures"]')],
      ['scenario healthy', () => p.clickRendered('button[data-cmd="scenario"][data-value="healthy"]')],
      ['scenario incident', () => p.clickRendered('button[data-cmd="scenario"][data-value="incident"]')]
    ];
    steps.forEach((s) => { s[1](); assertInSync(p, s[0]); });
  });
});

test('the erase flow: pick, erase, effects and checks appear, the access log leads with the erasure', () => {
  const p = boot({ search: '?scenario=incident&step=3', meta: META });
  pick(p, IDS[1]);
  assert.ok(p.html('erasure').indexOf('footprint-table') >= 0);
  p.clickRendered(ERASE);
  assert.ok(p.html('erasure').indexOf('Published readings:') >= 0);
  assert.equal((p.html('erasure').match(/: Pass<\/li>/g) || []).length, 5);
  const log = p.html('access');
  assert.ok(log.indexOf('privacy-office') >= 0 && log.indexOf('privacy-office') < log.indexOf('svc-ingest'));
  p.clickRendered('button[data-cmd="reset-erasures"]');
  assert.ok(p.html('access').indexOf('privacy-office') < 0);
});

test('legal hold: the erase button is disabled, a click on it does nothing, turning the hold off re-enables it', () => {
  const p = boot({ search: '?scenario=incident&step=3', meta: META });
  pick(p, IDS[1]);
  p.clickRendered(HOLD);
  assert.ok(/<button[^>]*data-cmd="erase"[^>]* disabled>/.test(p.html('erasure')));
  assert.ok(p.html('erasure').indexOf('Erasure blocked: legal hold is on.') >= 0);
  assert.ok(p.html('retention').indexOf('Deletion paused: legal hold is on.') >= 0);
  const before = all(p);
  p.click({ 'data-cmd': 'erase' }, true);
  assert.equal(all(p), before);
  p.clickRendered(HOLD);
  assert.ok(!/<button[^>]*data-cmd="erase"[^>]* disabled>/.test(p.html('erasure')));
});

test('selecting a node highlights its downstream in the lineage region only', () => {
  const p = boot({ search: '?scenario=incident&step=3', meta: META });
  const other = ['header', 'contract', 'phi', 'access', 'retention', 'erasure'].map((k) => p.html(k));
  p.clickRendered(NODE('vital_value'));
  assert.ok(p.html('lineage').indexOf('class="node node-selected"') >= 0);
  assert.deepEqual(['header', 'contract', 'phi', 'access', 'retention', 'erasure'].map((k) => p.html(k)), other);
});

test('one persistent live element announces the result of a local action, once, and only when its text changes', () => {
  const p = boot({ search: '?scenario=incident&step=3', meta: META });
  const w = watchLive(p);
  pick(p, IDS[0]);
  assert.equal(w.writes, 0, 'selecting announces nothing');
  p.clickRendered(ERASE);
  assert.equal(w.writes, 1);
  assert.equal(w.text, 'Erased ' + IDS[0]);
  p.clickRendered('button[data-cmd="next"]');
  p.clickRendered('button[data-cmd="back"]');
  p.clickRendered(NODE('patient_id'));
  assert.equal(w.writes, 1, 'stepping and selecting do not rewrite it');
  p.clickRendered(HOLD);
  assert.equal(w.writes, 2);
  assert.equal(w.text, 'Legal hold on');
  ['header', 'contract', 'phi', 'lineage', 'access', 'retention', 'erasure'].forEach((k) => assert.ok(p.html(k).indexOf('aria-live') < 0, k));
});

test('a control holding focus is not replaced when its region re-renders with unchanged markup', () => {
  const p = boot({ search: '?scenario=incident&step=3', meta: META });
  p.clickRendered(NODE('patient_id'));
  const node = p.q(NODE('patient_id'));
  node.focus();
  const w = p.log.innerHTMLWrites;
  p.clickRendered(ERASE); // disabled: ignored, so nothing re-renders
  assert.equal(p.log.innerHTMLWrites, w);
  assert.equal(node.detached, false);
});

test('focus returns to the same control after its region re-renders, with preventScroll, and no scroll', () => {
  const p = boot({ search: '?scenario=incident&step=3', meta: META });
  const checks = [
    ['button[data-cmd="next"]', 'data-cmd="next"'],
    ['button[data-cmd="scenario"][data-value="healthy"]', 'data-value="healthy"'],
    ['button[data-cmd="scenario"][data-value="incident"]', 'data-value="incident"'],
    [NODE('vital_value'), 'data-id="vital_value"'],
    [LIST, 'data-cmd="list-toggle"'],
    [HOLD, 'data-cmd="hold"']
  ];
  checks.forEach((c) => {
    p.q(c[0]).focus();
    p.log.focused.length = 0;
    p.log.focusOpts.length = 0;
    p.clickRendered(c[0]);
    assert.ok(p.log.focused.length >= 1, c[0] + ' refocused');
    assert.ok(p.log.focused[p.log.focused.length - 1].indexOf(c[1]) >= 0, c[0]);
    p.log.focusOpts.forEach((o) => assert.deepEqual(J(o), { preventScroll: true }));
  });
  assert.equal(p.log.scrolled.length, 0);
});

test('the subject select keeps focus and its choice after a change', () => {
  const p = boot({ search: '?scenario=incident&step=3', meta: META });
  const s = p.q(SUBJECT);
  s.focus();
  p.log.focused.length = 0;
  pick(p, IDS[3]);
  assert.ok(p.log.focused.length >= 1);
  assert.ok(/data-cmd="select-subject"/.test(p.log.focused[p.log.focused.length - 1]));
  assert.ok(new RegExp('<option value="' + IDS[3] + '" selected>').test(p.html('erasure')));
});

test('when Erase disables itself, focus moves to the subject select, never to Reset erasures', () => {
  const p = boot({ search: '?scenario=incident&step=3', meta: META });
  pick(p, IDS[1]);
  p.q(ERASE).focus();
  p.log.focused.length = 0;
  p.clickRendered(ERASE);
  assert.ok(p.log.focused.length >= 1, 'something took focus');
  assert.ok(/data-cmd="select-subject"/.test(p.log.focused[p.log.focused.length - 1]));
  p.q('button[data-cmd="reset-erasures"]').focus();
  p.log.focused.length = 0;
  p.clickRendered('button[data-cmd="reset-erasures"]');
  assert.ok(/data-cmd="select-subject"/.test(p.log.focused[p.log.focused.length - 1]));
});

test('the same message is announced again after a scenario switch cleared it', () => {
  const p = boot({ search: '?scenario=incident&step=3', meta: META });
  const w = watchLive(p);
  p.clickRendered(HOLD);
  assert.equal(w.writes, 1);
  p.clickRendered('button[data-cmd="scenario"][data-value="healthy"]');
  p.clickRendered(HOLD);
  assert.equal(w.writes, 2);
  assert.equal(w.text, 'Legal hold on');
});

test('a deep-link hash scrolls its target once and highlights it; later commands never scroll', () => {
  const p = boot({ search: '?scenario=incident&step=3', hash: '#stage-erasure', meta: META });
  assert.equal(p.log.scrolled.length, 1);
  assert.equal(p.log.scrolled[0].id, 'stage-erasure');
  assert.deepEqual(J(p.log.scrolled[0].opts), { block: 'start' });
  assert.ok(p.log.classAdded.some((c) => c.id === 'stage-erasure' && c.cls === 'focus-target'));
  p.clickRendered('button[data-cmd="next"]');
  p.clickRendered(NODE('patient_id'));
  assert.equal(p.log.scrolled.length, 1);
  p.clickRendered('button[data-cmd="scenario"][data-value="healthy"]');
  assert.equal(p.log.scrolled.length, 1);
  assert.ok(p.log.classRemoved.some((c) => c.id === 'stage-erasure'));
});

test('no hash or an unknown hash does not scroll', () => {
  assert.equal(boot({ meta: META }).log.scrolled.length, 0);
  assert.equal(boot({ hash: '#unknown-id', meta: META }).log.scrolled.length, 0);
});

test('the caption follows the step text, and a diverged state is shown as a custom state', () => {
  const p = boot({ search: '?scenario=incident&a=r.r.p:dlq-3-2.r', meta: META });
  assert.ok(p.html('header').indexOf('Custom state from HQ (4 actions)') >= 0);
  assert.ok(p.html('header').indexOf('?scenario=incident&amp;a=r.r.p:dlq-3-2.r') >= 0);
  const q = boot({ search: '?scenario=incident&step=3', meta: META });
  const before = q.caption();
  q.clickRendered('button[data-cmd="next"]');
  assert.notEqual(q.caption(), before);
  assert.ok(q.caption().length > 0);
});

test('the meta tags feed the HQ and Pipeline links; absent means no links', () => {
  const none = boot();
  assert.ok(none.html('header').indexOf('Open this state in HQ') < 0);
  assert.ok(none.html('header').indexOf('Open this state in Pipeline') < 0);
  const withBase = boot({ meta: META });
  assert.ok(withBase.html('header').indexOf('Open this state in HQ') >= 0);
  assert.ok(withBase.html('header').indexOf('Open this state in Pipeline') >= 0);
});

test('disabled buttons, unknown commands and empty targets are ignored', () => {
  const p = boot({ meta: META });
  const before = all(p);
  p.click({ 'data-cmd': 'back' }, true);
  p.click({ 'data-cmd': 'bogus' });
  p.click({ 'data-cmd': 'node', 'data-id': 'No Such Node' });
  p.handlers.click[0]({ target: null });
  p.handlers.click[0]({ target: { closest: function () { return null; } } });
  p.handlers.change[0]({ target: null });
  p.handlers.change[0]({ target: { getAttribute: function () { return null; } } });
  assert.equal(all(p), before);
});

test('a broken engine shows the notice and every command does nothing', () => {
  const real = require('../../engine/engine.js');
  const broken = Object.assign({}, real, { selfTest: function () { return { passed: false, checks: [{ name: 'x', ok: false }] }; } });
  const p = boot({ Engine: broken, meta: META });
  assert.ok(p.html('notice').indexOf('self-test failed') >= 0);
  assert.ok(/role="alert"/.test(p.html('notice')));
  const before = all(p);
  const attrs = ['data-cmd', 'data-value', 'data-id'];
  p.qa('button[data-cmd]').forEach((b) => {
    if (b.disabled) return;
    const a = {};
    attrs.forEach((k) => { const v = b.getAttribute(k); if (v !== null) a[k] = v; });
    p.click(a);
  });
  const s = p.q(SUBJECT);
  if (s) { s.value = IDS[0]; p.change(s); }
  assert.equal(all(p), before);
});

// ---- source scans ----
test('main.js has no network calls, no remote urls, never assigns location or touches history', () => {
  ['fetch(', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'sendBeacon'].forEach((c) => assert.ok(MAIN.indexOf(c) < 0, c));
  assert.ok(!/https?:\/\//i.test(MAIN));
  assert.ok(!/\blocation\s*(?:\.\s*(?:href|hash|search|pathname))?\s*=(?!=)/.test(MAIN), 'assigns location');
  assert.ok(!/location\.(?:assign|replace|reload)\s*\(/.test(MAIN));
  assert.ok(!/history\.(?:pushState|replaceState)|\bhistory\b/.test(MAIN));
  assert.ok(!/\beval\s*\(/.test(MAIN) && !/\bFunction\s*\(/.test(MAIN) && !/document\.write/.test(MAIN));
});

test('innerHTML is assigned only in main.js among brain src files, and only once there', () => {
  fs.readdirSync(SRC).filter((n) => /\.js$/.test(n) && n !== 'main.js').forEach((n) => {
    assert.ok(!/innerHTML/.test(fs.readFileSync(path.join(SRC, n), 'utf8')), n);
  });
  assert.equal((MAIN.match(/\.innerHTML\s*=/g) || []).length, 1);
});
