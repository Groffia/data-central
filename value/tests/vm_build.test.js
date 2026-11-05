'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadValue } = require('./helpers/load');

const { Engine, Value, Shared, context } = loadValue();
const V = Value.viewmodel;
const D = Value.definitions;
const J = (x) => JSON.parse(JSON.stringify(x));
const KEYS = ['header', 'kpis', 'trends', 'compare', 'definitions', 'check', 'vendor', 'notice', 'footer'];
const FOOTER = 'All data is synthetic and generated deterministically (seed 42). Company names are fictional.';
const LINKS = { hqBase: '../hq/', pipelineBase: '../pipeline/' };

function build(scenario, step, extra) {
  const actions = Engine.actionsForStep(scenario, step);
  return V.buildViewModel(Object.assign({ scenario, actions, step, defState: D.initial(), links: LINKS, openTables: {} }, extra || {}));
}

test('exactly the nine keys, footer sentence, notice null when the engine is fine', () => {
  const m = build('incident', 3);
  assert.deepStrictEqual(J(Object.keys(m)), KEYS);
  assert.strictEqual(m.footer, FOOTER);
  assert.strictEqual(m.notice, null);
});

test('incident step 3: four held tiles with engine values, header carries scenario', () => {
  const m = build('incident', 3);
  assert.deepStrictEqual(J(m.kpis.tiles.map((t) => t.valueText)), ['78.6%', '6.2%', '4.7 days', '13.4%']);
  assert.ok(m.kpis.tiles.every((t) => t.held === true && t.definitionBadge === 'def v1'));
  assert.strictEqual(m.header.scenario, 'incident');
  assert.strictEqual(m.header.steps.n, 3);
  assert.strictEqual(m.header.hqHref, '../hq/?scenario=incident&step=3');
  assert.strictEqual(m.header.pipelineHref, '../pipeline/?scenario=incident&step=3');
});

test('compare numbers come from the engine', () => {
  const actions = Engine.actionsForStep('incident', 3);
  const st = Engine.getState('incident', actions);
  const naive = Engine.naiveSample('incident', actions);
  const m = build('incident', 3);
  assert.deepStrictEqual(J(m.compare), J(V.compare(st, naive)));
  assert.strictEqual(m.compare.withoutGate.countedText, naive.counted + ' readings counted');
});

test('check verdict is whatever liveSampleCheck returns', () => {
  const actions = Engine.actionsForStep('incident', 3);
  const st = Engine.getState('incident', actions);
  const c = Engine.liveSampleCheck(st);
  const m = build('incident', 3);
  assert.deepStrictEqual(J(m.check), J(V.checkPanel(st)));
  assert.strictEqual(m.check.verdict, c.verdict);
  const h = build('healthy', 4);
  assert.strictEqual(h.check.verdict, Engine.liveSampleCheck(Engine.getState('healthy', Engine.actionsForStep('healthy', 4))).verdict);
});

test('four trends: 120 days, two series, weekend indexes from the dates', () => {
  const m = build('healthy', 1);
  assert.deepStrictEqual(J(m.trends.map((t) => t.id)), J(m.kpis.tiles.map((t) => t.id)));
  assert.deepStrictEqual(J(m.trends.map((t) => t.unit)), ['pct', 'pct', 'days', 'pct']);
  m.trends.forEach((t) => {
    assert.strictEqual(t.dates.length, 120);
    assert.deepStrictEqual(J(t.series.map((s) => s.name)), ['Daily', '7-day trailing']);
    assert.deepStrictEqual(J(t.series.map((s) => s.className)), ['daily', 'trailing']);
    t.series.forEach((s) => { assert.strictEqual(s.values.length, 120); assert.ok(s.values.every(Number.isFinite)); });
    assert.strictEqual(t.tableOpen, false);
    assert.ok(t.weekendIndexes.every((i) => [0, 6].includes(V.dayOfWeek(t.dates[i]))));
    assert.strictEqual(t.weekendIndexes.length, t.dates.filter((d) => [0, 6].includes(V.dayOfWeek(d))).length);
    assert.ok(t.weekendIndexes.length > 20);
    assert.ok(/ on 20\d\d-\d\d-\d\d, range /.test(t.summary));
    assert.ok(t.summary.indexOf('<') < 0);
  });
});

test('trend values: last daily and trailing agree with the engine tile formula', () => {
  const m = build('healthy', 1);
  const hist = Engine.getHistory();
  const bed = m.trends[0];
  const last = hist[119];
  assert.strictEqual(bed.series[0].values[119], last.beds_occupied / last.beds_staffed);
  const w = hist.slice(-7);
  const sum = (f) => w.reduce((s, r) => s + r[f], 0);
  assert.strictEqual(bed.series[1].values[119], sum('beds_occupied') / sum('beds_staffed'));
  // the first six days use a shorter window
  assert.strictEqual(bed.series[1].values[0], bed.series[0].values[0]);
  const two = (hist[0].beds_occupied + hist[1].beds_occupied) / (hist[0].beds_staffed + hist[1].beds_staffed);
  assert.strictEqual(bed.series[1].values[1], two);
  assert.strictEqual(bed.tableNote, 'trailing window is shorter for the first six days');
});

test('openTables opens only the named KPI table', () => {
  const m = build('healthy', 1, { openTables: { 'bed-occupancy': true, 'avg-length-of-stay': false } });
  assert.deepStrictEqual(J(m.trends.map((t) => t.tableOpen)), [true, false, false, false]);
});

test('published strict definition changes the tile, the trend and the consumers together', () => {
  let ds = D.reduce(D.initial(), { type: 'select', metric: 'Abnormal Vital Rate', definitionId: 'strict_thresholds' });
  ds = D.reduce(ds, { type: 'publish', metric: 'Abnormal Vital Rate' });
  const base = build('healthy', 1);
  const m = build('healthy', 1, { defState: ds });
  const t = m.kpis.tiles[1];
  assert.notStrictEqual(t.valueText, base.kpis.tiles[1].valueText);
  assert.strictEqual(t.definitionBadge, 'def v2');
  const hist = Engine.getHistory();
  const last = hist[119];
  assert.strictEqual(m.trends[1].series[0].values[119], last.abnormal_obs_strict / last.observations);
  const abn = m.definitions.metrics.find((x) => x.name === 'Abnormal Vital Rate');
  assert.ok(abn.consumers.every((r) => r.valueText === abn.consumers[0].valueText));
  assert.strictEqual(abn.conflict, null);
  assert.strictEqual(abn.publishedId, 'strict_thresholds');
  assert.strictEqual(abn.version, 2);
  assert.strictEqual(m.definitions.changelog.length, 1);
  assert.strictEqual(m.definitions.message, 'Published Abnormal Vital Rate v2');
});

test('hardcoded mode gives a conflict on the published metric only', () => {
  let ds = D.reduce(D.initial(), { type: 'mode', governed: false });
  ds = D.reduce(ds, { type: 'select', metric: 'Abnormal Vital Rate', definitionId: 'strict_thresholds' });
  ds = D.reduce(ds, { type: 'publish', metric: 'Abnormal Vital Rate' });
  const m = build('healthy', 1, { defState: ds });
  assert.strictEqual(m.definitions.governed, false);
  const abn = m.definitions.metrics.find((x) => x.name === 'Abnormal Vital Rate');
  const re = m.definitions.metrics.find((x) => x.name === '30-Day Readmission Rate');
  assert.strictEqual(abn.conflict.text, 'Definition conflict: 3 reports disagree');
  assert.strictEqual(abn.conflict.values.length, 2);
  assert.strictEqual(re.conflict, null);
});

test('definitions metrics: options, yaml, selected id', () => {
  const m = build('healthy', 1);
  assert.deepStrictEqual(J(m.definitions.metrics.map((x) => x.name)), ['Abnormal Vital Rate', '30-Day Readmission Rate']);
  const re = m.definitions.metrics[1];
  assert.deepStrictEqual(J(re.options), [{ id: 'all_cause', label: 'All-cause readmissions' }, { id: 'unplanned_only', label: 'Unplanned readmissions only' }]);
  assert.strictEqual(re.yaml, D.yamlPreview('30-Day Readmission Rate', 'all_cause'));
  assert.strictEqual(re.selectedId, 'all_cause');
  assert.strictEqual(re.consumers.length, 4);
});

test('vendor: the Metrics layer and Dashboards rows with the column heads', () => {
  const m = build('healthy', 1);
  assert.deepStrictEqual(J(m.vendor.columns), ['Component', 'Databricks', 'Snowflake', 'Fabric']);
  assert.deepStrictEqual(J(m.vendor.rows.map((r) => r[0])), ['Metrics layer', 'Dashboards']);
  assert.deepStrictEqual(J(m.vendor.rows[0]), J(Shared.vendor.rows.find((r) => r[0] === "Metrics layer")));
});

test('diverged state (step null) and single-file form (no link bases)', () => {
  const actions = Engine.actionsForStep('incident', 3).concat([{ type: 'runBatch' }]);
  const m = V.buildViewModel({ scenario: 'incident', actions, step: null, defState: D.initial(), links: { hqBase: null, pipelineBase: null }, openTables: {} });
  assert.strictEqual(m.header.steps.n, null);
  assert.match(m.header.steps.label, /^Custom state from HQ/);
  assert.strictEqual(m.header.hqHref, null);
  assert.strictEqual(m.header.pipelineHref, null);
});

test('does not mutate the context and is repeatable', () => {
  const ctx = { scenario: 'incident', actions: Engine.actionsForStep('incident', 3), step: 3, defState: D.initial(), links: LINKS, openTables: { 'bed-occupancy': true } };
  const snap = JSON.stringify(ctx);
  const a = JSON.stringify(V.buildViewModel(ctx));
  assert.strictEqual(JSON.stringify(ctx), snap);
  assert.strictEqual(JSON.stringify(V.buildViewModel(ctx)), a);
});

test('junk input never throws', () => {
  [undefined, null, 5, 'x', {}, { scenario: 'nope' }, { actions: 'x', defState: 'junk' }, { scenario: 'incident', step: 'abc', actions: [{}] }].forEach((c) => {
    const m = V.buildViewModel(c);
    assert.deepStrictEqual(J(Object.keys(m)), KEYS);
  });
});

test('broken engine: a notice and empty-safe regions, never a throw', () => {
  const real = context.Engine;
  context.Engine = Object.assign({}, real, { getState() { throw new Error('boom'); } });
  try {
    const m = V.buildViewModel({ scenario: 'incident', actions: [], step: 3, defState: D.initial(), links: LINKS });
    assert.deepStrictEqual(J(Object.keys(m)), KEYS);
    assert.match(m.notice, /boom|Engine self-test failed/);
    assert.ok(typeof m.notice === 'string' && m.notice.length > 0);
    assert.deepStrictEqual(J(m.kpis.tiles), []);
    assert.deepStrictEqual(J(m.trends), []);
    assert.strictEqual(m.compare, null);
    assert.strictEqual(m.footer, FOOTER);
    assert.strictEqual(m.header.scenario, 'incident');
    assert.strictEqual(typeof Value.render.all(m), 'string');
  } finally { context.Engine = real; }
});

test('failing self-test: the banner text matches Pipeline wording', () => {
  const real = context.Engine;
  context.Engine = Object.assign({}, real, { selfTest: () => ({ passed: false, checks: [{ name: 'alpha', ok: true }, { name: 'beta', ok: false }] }) });
  try {
    assert.strictEqual(build('healthy', 1).notice, 'Engine self-test failed: beta');
    context.Engine = Object.assign({}, real, { selfTest: () => { throw new Error('boom'); } });
    assert.strictEqual(build('healthy', 1).notice, 'Engine self-test failed: boom');
  } finally { context.Engine = real; }
});

test('dayOfWeek: known dates, invalid text, and consecutive history dates', () => {
  assert.strictEqual(V.dayOfWeek('1970-01-01'), 4);
  assert.strictEqual(V.dayOfWeek('2000-01-01'), 6);
  assert.strictEqual(V.dayOfWeek('2024-02-29'), 4);
  assert.strictEqual(V.dayOfWeek('2026-11-01'), 0);
  assert.strictEqual(V.dayOfWeek('1900-03-01'), 4);
  ['', 'x', '2026-13-01', '2026-02-30', '2025-02-29', '2026-00-10', null, undefined, 5].forEach((v) => assert.strictEqual(V.dayOfWeek(v), -1, String(v)));
  const dates = Engine.getHistory().map((r) => r.date);
  for (let i = 1; i < dates.length; i++) assert.strictEqual(V.dayOfWeek(dates[i]), (V.dayOfWeek(dates[i - 1]) + 1) % 7, dates[i]);
});

test('src uses no Date constructor, Math.random or Date.now', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  ['viewmodel.js', 'render.js'].forEach((f) => {
    const s = fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
    assert.ok(!/new Date\(|Date\.now|Math\.random|innerHTML|document\./.test(s), f);
  });
});
