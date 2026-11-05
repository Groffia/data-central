'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadHQ } = require('./helpers/load');

const { Engine, HQ } = loadHQ();
const CTX = { exportRows: 20, tiering: Engine.TIERING_DEFAULTS };
function st(scenario, k) { return Engine.getState(scenario, Engine.AUTOPLAY[scenario].slice(0, k)); }
function regions(scenario, k, ui) {
  return HQ.render.renderRegions(HQ.viewmodel.buildViewModel(st(scenario, k), Object.assign({ scenario: scenario }, ui || {}), CTX));
}
function count(s, sub) { return s.split(sub).length - 1; }
function all(r) { return Object.keys(r).map(function (k) { return r[k]; }).join('\n'); }
const KEYS = ['banner', 'business', 'controls', 'footer', 'header', 'incident', 'notice', 'stages', 'status', 'tiles', 'timeline', 'today', 'vendor'];
const ESC_INJ = '&#39;; DROP TABLE silver_vital_observation;--';

test('renderRegions returns the thirteen region keys, all strings', () => {
  const r = regions('incident', 3);
  assert.deepStrictEqual(Object.keys(r).sort(), KEYS);
  KEYS.forEach(function (k) { assert.strictEqual(typeof r[k], 'string'); });
});

test('injection string only appears escaped', () => {
  const r = regions('incident', 3);
  assert.ok(r.incident.indexOf(ESC_INJ) >= 0);
  assert.strictEqual(all(r).indexOf("'; DROP TABLE"), -1);
});

test('markup in DLQ reason and alert title is escaped', () => {
  const state = JSON.parse(JSON.stringify(st('incident', 3)));
  const bad = '<script>alert(1)</script>';
  state.dlq[0].reason = bad;
  state.alerts[state.alerts.length - 1].title = bad;
  const out = all(HQ.render.renderRegions(HQ.viewmodel.buildViewModel(state, {}, CTX)));
  assert.ok(out.indexOf('&lt;script&gt;') >= 0);
  assert.strictEqual(out.indexOf('<script'), -1);
});

test('no <script or javascript: across ten scripted states', () => {
  [['healthy', 0], ['healthy', 1], ['healthy', 2], ['healthy', 3], ['incident', 2], ['incident', 3],
    ['incident', 8], ['incident', 12], ['incident', 14], ['incident', 16]].forEach(function (p) {
    const out = all(regions(p[0], p[1], { notice: '<b>n</b>', error: '<i>e</i>' })).toLowerCase();
    assert.strictEqual(out.indexOf('<script'), -1);
    assert.strictEqual(out.indexOf('javascript:'), -1);
  });
});

test('discard-reason selects: nine at k=3, none at k=16', () => {
  assert.strictEqual(count(regions('incident', 3).incident, 'data-role="discard-reason"'), 9);
  assert.strictEqual(count(regions('incident', 16).incident, 'data-role="discard-reason"'), 0);
});

function selectFor(html, id) {
  const re = new RegExp('<select data-role="discard-reason" data-dlq-id="' + id + '"[^>]*>([\\s\\S]*?)</select>');
  const m = re.exec(html);
  assert.ok(m, 'select for ' + id);
  return m[1];
}

test('selected option equals suggestedReason; five options in order', () => {
  const html = regions('incident', 3).incident;
  const R = Engine.DISCARD_REASONS;
  const want = { 'dlq-3-4': R[0], 'dlq-3-9': R[1], 'dlq-3-13': R[2], 'dlq-3-17': R[3] };
  Object.keys(want).forEach(function (id) {
    const inner = selectFor(html, id);
    assert.strictEqual(count(inner, '<option'), 5);
    assert.strictEqual(count(inner, ' selected'), 1);
    assert.ok(inner.indexOf('<option value="' + want[id] + '" selected>') >= 0, id);
    const order = [...inner.matchAll(/<option value="([^"]*)"/g)].map(function (m) { return m[1]; });
    assert.deepStrictEqual(order, [...R]);
  });
});

test('reason list containing markup renders escaped', () => {
  const m = HQ.viewmodel.buildViewModel(st('incident', 3), {}, CTX);
  m.incident.discardReasons = ['<b>x</b>', 'a"b', 'c', 'd', 'e'];
  const out = HQ.render.renderRegions(m).incident;
  assert.ok(out.indexOf('&lt;b&gt;x&lt;/b&gt;') >= 0);
  assert.strictEqual(out.indexOf('<b>x'), -1);
  assert.ok(out.indexOf('a&quot;b') >= 0);
});

function btn(html, cmd, id) {
  const re = new RegExp('<button[^>]*data-cmd="' + cmd + '"' + (id ? '[^>]*data-dlq-id="' + id + '"' : '') + '[^>]*>');
  const m = re.exec(html);
  assert.ok(m, 'button ' + cmd + ' ' + (id || ''));
  return m[0];
}

test('Resolve and retry disabled at k=3 and k=14, enabled at k=12', () => {
  assert.ok(/ disabled/.test(btn(regions('incident', 3).incident, 'resolveRetry')));
  assert.ok(/ disabled/.test(btn(regions('incident', 14).incident, 'resolveRetry')));
  assert.ok(!/ disabled/.test(btn(regions('incident', 12).incident, 'resolveRetry')));
});

test('blocked reason is shown at k=3', () => {
  assert.ok(regions('incident', 3).incident.indexOf('9 DLQ rows unresolved') >= 0);
});

test('Repair disabled on non-repairable row, enabled on repairable', () => {
  const html = regions('incident', 3).incident;
  assert.ok(/ disabled/.test(btn(html, 'repair', 'dlq-3-4')));
  assert.ok(!/ disabled/.test(btn(html, 'repair', 'dlq-3-2')));
  assert.ok(!/ disabled/.test(btn(html, 'discard', 'dlq-3-4')));
});

test('Held badge: four at k=3, zero at k=16', () => {
  assert.strictEqual(count(regions('incident', 3).tiles, '>Held<'), 4);
  assert.strictEqual(count(regions('incident', 16).tiles, '>Held<'), 0);
});

test('footer is exact', () => {
  assert.strictEqual(regions('healthy', 1).footer,
    '<p>All data is synthetic and generated deterministically (seed 42). Company names are fictional.</p>');
});

test('stages: eight chips with data-health matching', () => {
  const vm = HQ.viewmodel.buildViewModel(st('incident', 3), {}, CTX);
  const html = HQ.render.renderRegions(vm).stages;
  const found = [...html.matchAll(/data-health="([^"]*)"/g)].map(function (m) { return m[1]; });
  assert.strictEqual(found.length, 8);
  assert.deepStrictEqual(found, [...vm.chips.map(function (c) { return c.health; })]);
});

test('business: placeholder at healthy k=1, headline at incident k=3', () => {
  assert.ok(regions('healthy', 1).business.indexOf('No incident yet. Switch to Incident to see what the gate prevents.') >= 0);
  const b = regions('incident', 3).business;
  assert.ok(b.indexOf('Without the gate: ') >= 0);
  assert.ok(b.indexOf('Illustrative figures for comparison, not vendor quotes') >= 0);
  assert.ok(b.indexOf('Rows containing PHI quarantined for review: ') >= 0);
  assert.ok(b.indexOf('an assumption).') >= 0);
  assert.ok(b.indexOf('(secondary)') >= 0);
});

test('incident region is empty string when not visible', () => {
  assert.strictEqual(regions('healthy', 1).incident, '');
});

test('header: title, subtitle, scenario switch with aria-pressed, watch buttons', () => {
  const h = regions('incident', 3).header;
  assert.ok(h.indexOf('HQ: Data Platform Control Room') >= 0);
  assert.ok(h.indexOf('Tamsworth Health') >= 0);
  assert.ok(/data-cmd="scenario" data-scenario="incident" aria-pressed="true"/.test(h));
  assert.ok(/data-cmd="scenario" data-scenario="healthy" aria-pressed="false"/.test(h));
  assert.ok(h.indexOf('data-cmd="watch"') >= 0 && h.indexOf('data-cmd="watchFull"') >= 0);
  assert.ok(/data-scenario="healthy" aria-pressed="true"/.test(regions('healthy', 1).header));
});

test('controls: run and reset present; vendor table wrapped', () => {
  const c = regions('healthy', 1).controls;
  assert.ok(c.indexOf('data-cmd="run"') >= 0 && c.indexOf('data-cmd="reset"') >= 0);
  const v = regions('healthy', 1).vendor;
  assert.ok(v.indexOf('<table') >= 0 && v.indexOf('class="table-wrap"') >= 0);
  assert.ok(v.indexOf('Auto Loader / Lakeflow Connect') >= 0);
});

test('alert buttons carry commands and are disabled when unavailable', () => {
  const k3 = regions('incident', 3).incident;
  assert.ok(!/ disabled/.test(btn(k3, 'ack')));
  assert.ok(!/ disabled/.test(btn(k3, 'resolveAlert')));
  const k16 = regions('incident', 16).incident;
  assert.ok(/ disabled/.test(btn(k16, 'ack')));
  assert.ok(/ disabled/.test(btn(k16, 'resolveAlert')));
});

test('notice and error render escaped', () => {
  const r = regions('healthy', 1, { notice: 'No change: row already repaired', error: '<i>e</i>' });
  assert.ok(r.notice.indexOf('No change: row already repaired') >= 0);
  assert.ok(r.notice.indexOf('&lt;i&gt;e&lt;/i&gt;') >= 0);
  assert.strictEqual(regions('healthy', 1).notice, '');
});

test('controls: playback buttons pause, resume, skip, stop are present', () => {
  const c = regions('healthy', 1).controls;
  ['pause', 'resume', 'skip', 'stop'].forEach(function (cmd) {
    assert.ok(c.indexOf('data-cmd="' + cmd + '"') >= 0, cmd);
  });
  assert.ok(c.indexOf('class="playback-controls"') >= 0);
});

test('every data-cmd button is disabled when vm.error is set', () => {
  const r = regions('incident', 3, { error: 'Engine self-test failed: x' });
  const btns = all(r).match(/<button\b[^>]*data-cmd="[^"]*"[^>]*>/g) || [];
  assert.ok(btns.length >= 10);
  btns.forEach(function (b) { assert.ok(/ disabled/.test(b), b); });
  const ok = all(regions('healthy', 1)).match(/<button\b[^>]*data-cmd="run"[^>]*>/)[0];
  assert.ok(!/ disabled/.test(ok));
});

test('vendor heading reads exactly "In production this is\u2026"', () => {
  assert.ok(regions('healthy', 1).vendor.indexOf('<h2>In production this is\u2026</h2>') === 0);
});
