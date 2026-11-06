'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadHQ } = require('./helpers/load');

const { Engine, HQ } = loadHQ();
const vm = HQ.viewmodel;
function st(scenario, k) { return Engine.getState(scenario, Engine.AUTOPLAY[scenario].slice(0, k)); }
const CTX = { exportRows: 20, tiering: Engine.TIERING_DEFAULTS };

const SPEC_ROWS = [
  ['Batch ingestion', 'Auto Loader / Lakeflow Connect', 'Snowpipe / Fivetran', 'Data Factory pipelines'],
  ['Landing (Bronze)', 'Delta table', 'Snowflake or Iceberg table', 'OneLake lakehouse'],
  ['Cleaning (Silver, Gold)', 'Lakeflow Pipelines (formerly Delta Live Tables) or dbt', 'dbt or Dynamic Tables', 'Dataflows or dbt'],
  ['Quality gate', 'Pipeline expectations / dbt tests', 'Data metric functions / dbt tests', 'dbt tests'],
  ['Alerting', 'Databricks SQL alerts', 'Snowflake alerts', 'Fabric Activator'],
  ['Lineage and catalog', 'Unity Catalog', 'Snowflake Horizon Catalog', 'Microsoft Purview'],
  ['Metrics layer', 'Unity Catalog metric views', 'dbt Semantic Layer', 'Power BI semantic model'],
  ['Orchestration', 'Lakeflow Jobs / Airflow', 'Tasks / Airflow', 'Pipelines / Airflow']
];

test('healthy k=1 business case is a placeholder', () => {
  const b = vm.businessCase(st('healthy', 1));
  assert.strictEqual(b.hasIncident, false);
  assert.strictEqual(b.placeholder, 'No incident yet. Switch to Incident to see what the gate prevents.');
  assert.strictEqual(b.headline, null);
  assert.strictEqual(b.timeToDetect, null);
  assert.deepStrictEqual([...b.droppedList], []);
  assert.deepStrictEqual([...b.invalidList], []);
});

test('incident k=3 exact strings', () => {
  const s = st('incident', 3), bc = s.businessCase;
  const b = vm.businessCase(s);
  assert.strictEqual(b.hasIncident, true);
  assert.strictEqual(b.placeholder, null);
  const h = 'Without the gate: ' + bc.rowsSilentlyDropped + ' rows vanish silently and ' +
    bc.invalidRowsReachingDashboard + ' impossible readings reach the dashboard.';
  assert.strictEqual(b.headline, h);
  assert.strictEqual(b.headline, 'Without the gate: 7 rows vanish silently and 2 impossible readings reach the dashboard.');
  assert.strictEqual(b.rowsStopped, 9);
  assert.strictEqual(b.timeToDetect.withGate, 'With the gate: caught at the batch (at most 15 simulated minutes).');
  assert.strictEqual(b.timeToDetect.withoutGate, 'Without it: next scheduled review, assumed 24 hours (an assumption).');
  assert.strictEqual(b.phiText, 'Rows containing PHI quarantined for review: 9');
  assert.strictEqual(b.storage.headline, '78.4% saved versus keeping everything in warm storage');
  assert.strictEqual(b.storage.secondary, '93.8% saved versus keeping everything in hot storage');
  assert.strictEqual(b.storage.label, 'Illustrative figures for comparison, not vendor quotes');
  assert.strictEqual(b.secondary,
    'Abnormal Vital Rate change measured on Batch 3 under naive rules (rows without a usable patient ID dropped at the join): -2.8 pts (secondary)');
});

test('incident k=3 lists', () => {
  const s = st('incident', 3);
  const b = vm.businessCase(s);
  assert.strictEqual(b.droppedList.length, 7);
  assert.deepStrictEqual({ ...b.droppedList[1] },
    { dlqId: 'dlq-3-4', reason: 'null patient_id: dropped by join to dim_patient' });
  assert.strictEqual(b.invalidList.length, 2);
  assert.deepStrictEqual({ ...b.invalidList[0] },
    { dlqId: 'dlq-3-9', summary: 'patient TMH-P-957039, code 59408-5, value 130 %' });
  assert.strictEqual(b.invalidList[1].summary, 'patient TMH-P-664228, code 8867-4, value 78 mmHg');
});

test('hasIncident stays true after recovery (k=16)', () => {
  const s = st('incident', 16);
  assert.ok(s.dlq.length > 0);
  assert.strictEqual(vm.businessCase(s).hasIncident, true);
});

test('vendor table matches spec 3b', () => {
  const t = vm.vendorTable();
  assert.deepStrictEqual([...t.columns], ['Component', 'Databricks', 'Snowflake', 'Fabric']);
  assert.deepStrictEqual([...t.rows].map(function (r) { return [...r]; }), SPEC_ROWS);
  const flat = t.rows.map(function (r) { return r.join(' | '); });
  ['Lakeflow Pipelines (formerly Delta Live Tables) or dbt', 'Lakeflow Jobs / Airflow',
    'Auto Loader / Lakeflow Connect', 'Unity Catalog metric views',
    'Data metric functions / dbt tests'].forEach(function (x) {
    assert.ok(flat.join('\n').indexOf(x) >= 0, x);
  });
  const withAct = flat.filter(function (r) { return r.indexOf('Activator') >= 0; });
  assert.strictEqual(withAct.length, 1);
  assert.ok(withAct[0].indexOf('Alerting') === 0);
});

test('rows added to the shared vendor constant for other pages are left out of HQ', () => {
  const names = vm.vendorTable().rows.map(function (r) { return r[0]; });
  ['Dashboards', 'Access and audit log'].forEach(function (n) { assert.ok(names.indexOf(n) < 0, n); });
});

test('buildViewModel combines everything', () => {
  const s = st('incident', 3);
  const m = vm.buildViewModel(s, { notice: 'n', error: 'e' }, CTX);
  assert.deepStrictEqual(Object.keys(m).sort(),
    ['banner', 'business', 'chips', 'error', 'incident', 'linkNote', 'notice', 'scenario', 'status', 'tiles', 'timeline', 'today', 'vendor']);
  assert.strictEqual(m.notice, 'n');
  assert.strictEqual(m.error, 'e');
  assert.strictEqual(m.chips.length, 8);
  assert.strictEqual(m.business.hasIncident, true);
  assert.strictEqual(m.vendor.rows.length, 8);
  assert.strictEqual(m.incident.rows.length, 9);
  const d = vm.buildViewModel(st('healthy', 1), {}, CTX);
  assert.strictEqual(d.notice, null);
  assert.strictEqual(d.error, null);
  assert.strictEqual(vm.buildViewModel(st('healthy', 1), null, CTX).notice, null);
  assert.strictEqual(d.scenario, null);
  assert.strictEqual(vm.buildViewModel(st('incident', 3), { scenario: 'incident' }, CTX).scenario, 'incident');
});
