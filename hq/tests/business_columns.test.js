'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadHQ } = require('./helpers/load');

const { Engine, HQ } = loadHQ();
const vm = HQ.viewmodel;
const CTX = { exportRows: 20, tiering: Engine.TIERING_DEFAULTS };
function st(scenario, k) { return Engine.getState(scenario, Engine.AUTOPLAY[scenario].slice(0, k)); }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function render(state) {
  return HQ.render.renderRegions(vm.buildViewModel(state, { scenario: 'incident' }, CTX)).business;
}
function lines(c) { return [...c.lines]; }

const WITHOUT_TITLE = 'Without this system';
const WITH_TITLE = 'With this system';

function expectCols(k, x, y, z, r, d) {
  const c = vm.businessCase(st('incident', k)).columns;
  assert.strictEqual(c.without.title, WITHOUT_TITLE);
  assert.strictEqual(c.with.title, WITH_TITLE);
  assert.deepStrictEqual(lines(c.without), [
    x + ' rows vanish silently',
    y + ' impossible readings reach the dashboard',
    'Detected at the next scheduled review (assumed 24 hours, an assumption).'
  ]);
  assert.deepStrictEqual(lines(c.with), [
    z + ' rows stopped at the batch',
    '0 invalid readings in production',
    'Caught at the batch (at most 15 simulated minutes).',
    r + ' repaired, ' + d + ' discarded with logged reasons'
  ]);
}

test('columns at incident k=3 (R 0, D 0)', () => { expectCols(3, 7, 2, 9, 0, 0); });
test('columns at incident k=8 (R 5, D 0)', () => { expectCols(8, 7, 2, 9, 5, 0); });
test('columns at incident k=16 (R 5, D 4)', () => { expectCols(16, 7, 2, 9, 5, 4); });

test('columns are null before an incident; placeholder unchanged', () => {
  const b = vm.businessCase(st('healthy', 1));
  assert.strictEqual(b.columns, null);
  assert.strictEqual(b.placeholder, 'No incident yet. Switch to Incident to see what the gate prevents.');
  const html = HQ.render.renderRegions(vm.buildViewModel(st('healthy', 1), { scenario: 'healthy' }, CTX)).business;
  assert.ok(html.indexOf('No incident yet. Switch to Incident to see what the gate prevents.') >= 0);
  assert.strictEqual(html.indexOf('biz-col'), -1);
});

test('singular forms at count 1', () => {
  const s = clone(st('incident', 3));
  s.businessCase.rowsSilentlyDropped = 1;
  s.businessCase.invalidRowsReachingDashboard = 1;
  s.businessCase.rowsStopped = 1;
  const c = vm.businessCase(s).columns;
  assert.strictEqual(c.without.lines[0], '1 row vanishes silently');
  assert.strictEqual(c.without.lines[1], '1 impossible reading reaches the dashboard');
  assert.strictEqual(c.with.lines[0], '1 row stopped at the batch');
  assert.strictEqual(c.with.lines[1], '0 invalid readings in production');
});

test('zero counts use plural nouns', () => {
  const s = clone(st('incident', 3));
  s.businessCase.rowsSilentlyDropped = 0;
  s.businessCase.invalidRowsReachingDashboard = 0;
  s.businessCase.rowsStopped = 0;
  const c = vm.businessCase(s).columns;
  assert.strictEqual(c.without.lines[0], '0 rows vanish silently');
  assert.strictEqual(c.without.lines[1], '0 impossible readings reach the dashboard');
  assert.strictEqual(c.with.lines[0], '0 rows stopped at the batch');
});

test('R and D count dead-letter statuses on a hand-made state', () => {
  const s = clone(st('incident', 3));
  s.dlq.forEach(function (d, i) { d.status = i === 0 ? 'repaired' : i === 1 ? 'discarded' : 'open'; });
  const c = vm.businessCase(s).columns;
  assert.strictEqual(c.with.lines[3], '1 repaired, 1 discarded with logged reasons');
});

test('render: two columns with classes, titles and lines, escaped', () => {
  const s = clone(st('incident', 3));
  s.businessCase.minutesToDetectWithGate = '<b>15</b>';
  s.businessCase.hoursToDetectWithoutGate = '"24"&';
  const html = render(s);
  assert.ok(html.indexOf('biz-col biz-without') >= 0);
  assert.ok(html.indexOf('biz-col biz-with') >= 0);
  assert.ok(html.indexOf(WITHOUT_TITLE) >= 0 && html.indexOf(WITH_TITLE) >= 0);
  assert.strictEqual(html.indexOf('<b>15</b>'), -1);
  assert.ok(html.indexOf('&lt;b&gt;15&lt;/b&gt;') >= 0);
  assert.ok(html.indexOf('&quot;24&quot;&amp;') >= 0);
});

test('render: exact sentences present; time-to-detect not duplicated; order', () => {
  const html = render(st('incident', 16));
  ['7 rows vanish silently', '2 impossible readings reach the dashboard', '9 rows stopped at the batch',
    '0 invalid readings in production', '5 repaired, 4 discarded with logged reasons',
    'Detected at the next scheduled review (assumed 24 hours, an assumption).',
    'Caught at the batch (at most 15 simulated minutes).'].forEach(function (t) {
    assert.strictEqual(html.split('<li>' + t + '</li>').length - 1, 1, t);
  });
  assert.strictEqual(html.indexOf('Without it: next scheduled review'), -1);
  assert.strictEqual(html.indexOf('With the gate: caught at the batch'), -1);
  const iHead = html.indexOf('class="headline"');
  const iCols = html.indexOf('biz-col biz-without');
  const iPhi = html.indexOf('Rows containing PHI');
  const iStore = html.indexOf('storage-headline');
  assert.ok(iHead >= 0 && iHead < iCols && iCols < iPhi && iPhi < iStore);
  assert.ok(html.indexOf('Rows that would vanish silently') > iCols);
  assert.ok(html.indexOf('Secondary detail') > iStore);
});

test('css: two columns at 1024px and wider, stacked below via media query', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles.css'), 'utf8');
  assert.ok(css.indexOf('@media (max-width: 1023px)') >= 0);
  assert.ok(/\.biz-columns[^{]*\{[^}]*grid-template-columns:\s*1fr 1fr/.test(css));
  assert.ok(/@media \(max-width: 1023px\)\s*\{\s*\.biz-columns\s*\{[^}]*grid-template-columns:\s*1fr\s*;/.test(css));
});
