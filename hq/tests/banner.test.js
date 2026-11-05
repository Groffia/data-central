'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadHQ } = require('./helpers/load');

const { Engine, HQ } = loadHQ();
function st(scenario, k) { return Engine.getState(scenario, Engine.AUTOPLAY[scenario].slice(0, k)); }
const OPEN = 'Incident in progress: gate open at Batch 3, production held at Batch 2.';
const HALF = 'Incident in progress: gate half-open at Batch 3, trial batch pending, production held at Batch 2.';
const DONE = 'Last incident: caught at the gate on Batch 3. No bad rows reached production.';

const TABLE = [
  ['healthy', 0, null], ['healthy', 1, null], ['incident', 2, null],
  ['incident', 3, { level: 'amber', text: OPEN }],
  ['incident', 8, { level: 'amber', text: OPEN }],
  ['incident', 12, { level: 'amber', text: OPEN }],
  ['incident', 13, { level: 'amber', text: OPEN }],
  ['incident', 14, { level: 'amber', text: HALF }],
  ['incident', 15, { level: 'green', text: DONE }],
  ['incident', 16, { level: 'green', text: DONE }]
];
for (const [s, k, want] of TABLE) {
  test(`glanceBanner ${s} k=${k}`, () => {
    const b = HQ.viewmodel.glanceBanner(st(s, k));
    if (want === null) assert.strictEqual(b, null);
    else assert.deepStrictEqual({ ...b }, want);
  });
}

test('buildViewModel returns banner', () => {
  const vm = HQ.viewmodel.buildViewModel(st('incident', 3), { scenario: 'incident' },
    { exportRows: 20, tiering: Engine.TIERING_DEFAULTS });
  assert.strictEqual(vm.banner.text, OPEN);
});

test('banner region: empty string when null, data-level div otherwise', () => {
  const ctx = { exportRows: 20, tiering: Engine.TIERING_DEFAULTS };
  const none = HQ.render.renderRegions(HQ.viewmodel.buildViewModel(st('healthy', 1), {}, ctx));
  assert.strictEqual(none.banner, '');
  const r = HQ.render.renderRegions(HQ.viewmodel.buildViewModel(st('incident', 3), {}, ctx));
  assert.ok(r.banner.indexOf('<div class="banner" data-level="amber">') === 0);
  assert.ok(r.banner.indexOf(OPEN) >= 0);
});

test('banner text and level are escaped', () => {
  const ctx = { exportRows: 20, tiering: Engine.TIERING_DEFAULTS };
  const vm = HQ.viewmodel.buildViewModel(st('incident', 3), {}, ctx);
  vm.banner = { level: 'amber"><script>', text: '<img src=x onerror=1> & "q"' };
  const html = HQ.render.renderRegions(vm).banner;
  assert.ok(html.indexOf('<img') < 0 && html.indexOf('<script') < 0);
  assert.ok(html.indexOf('&lt;img') >= 0);
});
