'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { boot, REGION_KEYS } = require('./helpers/fakedom');

const SRC = path.join(__dirname, '..', 'src');
const MAIN = fs.readFileSync(path.join(SRC, 'main.js'), 'utf8');
const AVR = 'Abnormal Vital Rate';
const META = { 'hq-base': '../hq/', 'pipeline-base': '../pipeline/' };
const SEL = 'select[data-cmd="select"][data-metric="' + AVR + '"]';
const TOGGLE = 'button[data-cmd="table-toggle"][data-kpi="abnormal-vital-rate"]';
const J = (x) => JSON.parse(JSON.stringify(x));

function all(p) { return REGION_KEYS.map((k) => p.html(k)).join('\n'); }

// The model the page was built from, rendered fresh and compared region by region.
function assertInSync(p, label) {
  const model = p.controller().getModel();
  REGION_KEYS.forEach((k) => assert.equal(p.html(k), p.Value().render[k](model), label + ': region ' + k));
}
function quiet(fn) {
  const errs = [];
  const real = console.error;
  console.error = function () { errs.push(Array.prototype.slice.call(arguments)); };
  try { fn(); } finally { console.error = real; }
  assert.deepEqual(errs, []);
}

test('renders every region on load and leaves the static footer to index.html', () => {
  const p = boot({ meta: META });
  REGION_KEYS.forEach((k) => assert.equal(typeof p.html(k), 'string', k));
  assert.ok(p.html('kpis').indexOf('kpi-grid') >= 0);
  assert.equal(p.html('footer'), undefined);
  assertInSync(p, 'load');
});

test('scripted session: DOM equals a fresh render after every step, no errors', () => {
  quiet(() => {
    const p = boot({ search: '?scenario=incident&step=3', meta: META });
    assertInSync(p, 'load');
    const steps = [
      ['next', () => p.clickRendered('button[data-cmd="next"]')],
      ['back', () => p.clickRendered('button[data-cmd="back"]')],
      ['scenario healthy', () => p.clickRendered('button[data-cmd="scenario"][data-value="healthy"]')],
      ['scenario incident', () => p.clickRendered('button[data-cmd="scenario"][data-value="incident"]')],
      ['select strict', () => { const s = p.q(SEL); s.value = 'strict_thresholds'; p.change(s); }],
      ['publish', () => p.clickRendered('button[data-cmd="publish"][data-metric="' + AVR + '"]')],
      ['hardcoded', () => p.clickRendered('button[data-cmd="mode"][data-governed="false"]')],
      ['rollback', () => p.clickRendered('button[data-cmd="rollback"][data-metric="' + AVR + '"]')],
      ['governed', () => p.clickRendered('button[data-cmd="mode"][data-governed="true"]')],
      ['table open', () => p.clickRendered(TOGGLE)],
      ['table close', () => p.clickRendered(TOGGLE)],
      ['reset', () => p.clickRendered('button[data-cmd="reset"]')]
    ];
    steps.forEach((s) => { s[1](); assertInSync(p, s[0]); });
  });
});

test('hardcoded mode after a publish shows the conflict banner (visible, no role alert)', () => {
  const p = boot({ search: '?scenario=incident&step=3', meta: META });
  assert.ok(!/class="conflict"/.test(p.html('definitions')));
  p.clickRendered('button[data-cmd="mode"][data-governed="false"]');
  const s = p.q(SEL);
  s.value = 'strict_thresholds';
  p.change(s);
  p.clickRendered('button[data-cmd="publish"][data-metric="' + AVR + '"]');
  assert.ok(/<p class="conflict">Definition conflict: 3 reports disagree/.test(p.html('definitions')));
  assert.ok(p.html('definitions').indexOf('role="alert"') < 0);
  p.clickRendered('button[data-cmd="rollback"][data-metric="' + AVR + '"]');
  p.clickRendered('button[data-cmd="reset"]');
  assert.ok(!/class="conflict"/.test(p.html('definitions')));
});

test('table-toggle opens and closes the table and keeps aria-expanded in step', () => {
  const p = boot({ meta: META });
  assert.ok(/aria-expanded="false"/.test(p.q(TOGGLE).rawTag));
  p.clickRendered(TOGGLE);
  assert.ok(/aria-expanded="true"/.test(p.q(TOGGLE).rawTag));
  assert.ok(p.html('trends').indexOf('<caption>') >= 0);
  p.clickRendered(TOGGLE);
  assert.ok(p.html('trends').indexOf('<caption>') < 0);
});

test('the caption carries the step text on step changes and nothing else', () => {
  const p = boot({ search: '?scenario=incident&step=3', meta: META });
  const text = (h) => /class="step-text">([^<]*)/.exec(h)[1].replace(/&amp;/g, '&');
  assert.equal(p.caption(), text(p.html('header')));
  p.clickRendered('button[data-cmd="next"]');
  assert.equal(p.caption(), text(p.html('header')));
  let writes = 0;
  let v = p.caption();
  const cap = p.document.getElementById('caption');
  Object.defineProperty(cap, 'textContent', { get: () => v, set: (x) => { writes++; v = x; } });
  const s = p.q(SEL);
  s.value = 'strict_thresholds';
  p.change(s);
  p.clickRendered('button[data-cmd="publish"][data-metric="' + AVR + '"]');
  p.clickRendered(TOGGLE);
  assert.equal(writes, 0, 'caption is not rewritten by definition or table commands');
});

test('regions whose markup did not change are not rewritten', () => {
  const p = boot({ meta: META });
  const w = p.log.innerHTMLWrites;
  p.click({ 'data-cmd': 'bogus' });
  p.click({ 'data-cmd': 'next' }, true);
  assert.equal(p.log.innerHTMLWrites, w);
  p.clickRendered(TOGGLE);
  assert.equal(p.log.innerHTMLWrites - w, 1, 'only the trends region is written');
});

test('a control holding focus is not replaced when its region re-renders with unchanged markup', () => {
  const p = boot({ meta: META });
  const MODE = 'button[data-cmd="mode"][data-governed="true"]';
  p.clickRendered(MODE); // the first click may set the message; the second changes nothing
  const mode = p.q(MODE);
  mode.focus();
  p.log.focused.length = 0;
  const w = p.log.innerHTMLWrites;
  p.clickRendered(MODE);
  assert.equal(p.log.innerHTMLWrites, w);
  assert.equal(mode.detached, false);
  assert.equal(p.document.activeElement.rawTag, mode.rawTag);
});

test('focus returns to the same control after its region re-renders, with preventScroll, and no scroll', () => {
  const p = boot({ search: '?scenario=incident&step=3', meta: META });
  const checks = [
    ['button[data-cmd="next"]', 'data-cmd="next"'],
    ['button[data-cmd="scenario"][data-value="healthy"]', 'data-value="healthy"'],
    ['button[data-cmd="scenario"][data-value="incident"]', 'data-value="incident"'],
    ['button[data-cmd="mode"][data-governed="false"]', 'data-governed="false"'],
    [TOGGLE, 'data-kpi="abnormal-vital-rate"'],
    ['button[data-cmd="publish"][data-metric="' + AVR + '"]', 'data-cmd="publish"']
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

test('the select keeps focus and its choice after a change', () => {
  const p = boot({ search: '?scenario=incident&step=3', meta: META });
  const s = p.q(SEL);
  s.focus();
  s.value = 'strict_thresholds';
  p.log.focused.length = 0;
  p.log.focusOpts.length = 0;
  p.change(s);
  assert.ok(/selected/.test(/<option value="strict_thresholds"[^>]*>/.exec(p.html('definitions'))[0]));
  assert.ok(p.log.focused.length >= 1);
  assert.ok(/data-metric="Abnormal Vital Rate"/.test(p.log.focused[p.log.focused.length - 1]));
  assert.ok(p.log.focusOpts.length >= 1);
  p.log.focusOpts.forEach((o) => assert.deepEqual(J(o), { preventScroll: true }));
});

test('when Next becomes disabled at the last step, focus moves to Back', () => {
  const p = boot({ meta: META });
  for (let i = 0; i < 30 && !p.q('button[data-cmd="next"]').disabled; i++) p.clickRendered('button[data-cmd="next"]');
  p.clickRendered('button[data-cmd="back"]');
  p.q('button[data-cmd="next"]').focus();
  p.log.focused.length = 0;
  p.clickRendered('button[data-cmd="next"]');
  assert.ok(p.q('button[data-cmd="next"]').disabled);
  assert.ok(/data-cmd="back"/.test(p.log.focused[p.log.focused.length - 1]));
});

test('focus is left alone when nothing was focused', () => {
  const p = boot({ meta: META });
  p.log.focused.length = 0;
  p.clickRendered('button[data-cmd="next"]');
  assert.equal(p.log.focused.length, 0);
});

test('a deep-link hash scrolls its target once and highlights it; later commands never scroll', () => {
  const p = boot({ search: '?scenario=incident&step=3', hash: '#kpi-abnormal-vital-rate', meta: META });
  assert.equal(p.log.scrolled.length, 1);
  assert.equal(p.log.scrolled[0].id, 'kpi-abnormal-vital-rate');
  assert.deepEqual(J(p.log.scrolled[0].opts), { block: 'start' });
  assert.ok(p.log.classAdded.some((c) => c.id === 'kpi-abnormal-vital-rate' && c.cls === 'focus-target'));
  p.clickRendered('button[data-cmd="next"]');
  p.clickRendered('button[data-cmd="back"]');
  p.clickRendered(TOGGLE);
  assert.equal(p.log.scrolled.length, 1);
});

test('the stage hashes scroll once; no hash or an unknown hash does not scroll', () => {
  const p = boot({ hash: '#stage-check', meta: META });
  assert.equal(p.log.scrolled.length, 1);
  assert.equal(p.log.scrolled[0].id, 'stage-check');
  assert.equal(boot({ meta: META }).log.scrolled.length, 0);
  assert.equal(boot({ hash: '#unknown-id', meta: META }).log.scrolled.length, 0);
});

test('a scenario switch drops the highlight and does not scroll', () => {
  const p = boot({ search: '?scenario=incident&step=3', hash: '#stage-definitions', meta: META });
  assert.equal(p.log.scrolled.length, 1);
  p.clickRendered('button[data-cmd="scenario"][data-value="healthy"]');
  assert.equal(p.log.scrolled.length, 1);
  assert.ok(p.log.classRemoved.some((c) => c.id === 'stage-definitions'));
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
  p.click({ 'data-cmd': 'publish', 'data-metric': 'No Such Metric' });
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
  const attrs = ['data-cmd', 'data-value', 'data-metric', 'data-governed', 'data-kpi'];
  p.qa('button[data-cmd]').forEach((b) => {
    if (b.disabled) return;
    const a = {};
    attrs.forEach((k) => { const v = b.getAttribute(k); if (v !== null) a[k] = v; });
    p.click(a);
  });
  const s = p.q(SEL);
  if (s) { s.value = 'strict_thresholds'; p.change(s); }
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

test('innerHTML is assigned only in main.js among value src files, and only once there', () => {
  fs.readdirSync(SRC).filter((n) => /\.js$/.test(n)).forEach((n) => {
    const t = fs.readFileSync(path.join(SRC, n), 'utf8');
    const hits = t.match(/\.(?:innerHTML|outerHTML)\s*(?:=|\+=)(?!=)|insertAdjacentHTML/g) || [];
    assert.equal(hits.length, n === 'main.js' ? 1 : 0, n);
  });
});

test('only main.js touches document, window, location, timers', () => {
  fs.readdirSync(SRC).filter((n) => /\.js$/.test(n) && n !== 'main.js').forEach((n) => {
    const t = fs.readFileSync(path.join(SRC, n), 'utf8');
    const code = t.replace(/\/\/.*$/gm, '').replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
    assert.ok(!/\b(?:document|window|location|setTimeout|setInterval|localStorage)\b/.test(code), n);
  });
});

// ----- fix B: one persistent live element announces the definitions result -----

function watchLive(p) {
  const live = p.document.getElementById('def-live');
  let v = live.textContent;
  const w = { writes: 0, get text() { return v; } };
  Object.defineProperty(live, 'textContent', { get: () => v, set: (x) => { w.writes++; v = x; } });
  return w;
}
function toConflict(p) {
  p.clickRendered('button[data-cmd="mode"][data-governed="false"]');
  const s = p.q(SEL);
  s.value = 'strict_thresholds';
  p.change(s);
}

test('a publish changes #def-live text once, with the message', () => {
  const p = boot({ search: '?scenario=incident&step=3', meta: META });
  const w = watchLive(p);
  const s = p.q(SEL);
  s.value = 'strict_thresholds';
  p.change(s);
  assert.equal(w.writes, 0, 'selecting announces nothing');
  p.clickRendered('button[data-cmd="publish"][data-metric="' + AVR + '"]');
  assert.equal(w.writes, 1);
  assert.equal(w.text, 'Published Abnormal Vital Rate v2');
  assert.ok(p.html('definitions').indexOf('aria-live') < 0);
});

test('re-rendering with an unchanged message does not rewrite #def-live', () => {
  const p = boot({ search: '?scenario=incident&step=3', meta: META });
  const s = p.q(SEL);
  s.value = 'strict_thresholds';
  p.change(s);
  p.clickRendered('button[data-cmd="publish"][data-metric="' + AVR + '"]');
  const w = watchLive(p);
  p.clickRendered(TOGGLE);
  p.clickRendered(TOGGLE);
  p.clickRendered('button[data-cmd="next"]');
  p.clickRendered('button[data-cmd="back"]');
  assert.equal(w.writes, 0);
});

test('a conflict is announced once with the publish; choosing another definition while in conflict does not re-announce it', () => {
  const p = boot({ search: '?scenario=incident&step=3', meta: META });
  toConflict(p);
  const w = watchLive(p);
  p.clickRendered('button[data-cmd="publish"][data-metric="' + AVR + '"]');
  assert.equal(w.writes, 1);
  assert.match(w.text, /^Published Abnormal Vital Rate v2\. Definition conflict: 3 reports disagree$/);
  assert.ok(/class="conflict"/.test(p.html('definitions')));
  const before = w.text;
  const s = p.q(SEL);
  s.value = 'standard_thresholds';
  p.change(s);
  const re = p.q('select[data-cmd="select"][data-metric="30-Day Readmission Rate"]');
  re.value = 'unplanned_only';
  p.change(re);
  assert.equal(w.writes, 1);
  assert.equal(w.text, before);
  assert.ok(/class="conflict"/.test(p.html('definitions')));
});
