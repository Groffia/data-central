'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadValue } = require('./helpers/load');

const { Engine, Value, context } = loadValue();
const R = Value.render;
const V = Value.viewmodel;
const D = Value.definitions;
const KEYS = ['header', 'kpis', 'trends', 'compare', 'definitions', 'check', 'vendor', 'notice', 'footer'];
const FOOTER = '<p>All data is synthetic and generated deterministically (seed 42). Company names are fictional.</p>';
const J = (x) => JSON.parse(JSON.stringify(x));
const LINKS = { hqBase: '../hq/', pipelineBase: '../pipeline/' };

function model(scenario, step, extra) {
  return V.buildViewModel(Object.assign({
    scenario, actions: Engine.actionsForStep(scenario, step), step, defState: D.initial(), links: LINKS, openTables: {}
  }, extra || {}));
}
function count(s, sub) { return s.split(sub).length - 1; }
function has(s, sub, msg) { assert.ok(s.indexOf(sub) >= 0, (msg || '') + ' missing: ' + sub); }

test('every key renders a string; all non-empty for a normal model, notice empty', () => {
  const m = model('incident', 3);
  KEYS.forEach((k) => {
    assert.strictEqual(typeof R[k](m), 'string', k);
    if (k !== 'notice') assert.ok(R[k](m).length > 0, k);
  });
  assert.strictEqual(R.notice(m), '');
  assert.strictEqual(R.footer(m), FOOTER);
  assert.strictEqual(typeof R.all(m), 'string');
});

test('header: title, scenario buttons, stepper, links with the exact texts', () => {
  const h = R.header(model('incident', 3));
  has(h, '<h1>Value: What the Business Sees</h1>');
  has(h, 'Tamsworth Health');
  has(h, 'data-cmd="scenario" data-value="healthy" aria-pressed="false">Healthy</button>');
  has(h, 'data-cmd="scenario" data-value="incident" aria-pressed="true">Incident</button>');
  has(h, 'data-cmd="back">Back</button>');
  has(h, 'data-cmd="next">Next</button>');
  has(h, 'Step 3 of ');
  has(h, '<p class="step-text">');
  assert.ok(h.indexOf('aria-live') < 0);
  has(h, '<a class="hq-link" href="../hq/?scenario=incident&amp;step=3">Open this state in HQ</a>');
  has(h, '<a class="pipeline-link" href="../pipeline/?scenario=incident&amp;step=3">Open this state in Pipeline</a>');
  assert.match(R.header(model('healthy', 1)), /data-cmd="scenario" data-value="healthy" aria-pressed="true"/);
});

test('header: Back disabled at the floor, Next disabled at the end, diverged label', () => {
  const first = R.header(model('healthy', Engine.PRELUDE.healthy.length));
  assert.match(first, /<button type="button" data-cmd="back" disabled>/);
  assert.doesNotMatch(first, /data-cmd="next" disabled/);
  const m = Engine.AUTOPLAY.healthy.length;
  const last = R.header(model('healthy', m));
  assert.match(last, /<button type="button" data-cmd="next" disabled>/);
  const div = V.buildViewModel({ scenario: 'incident', actions: Engine.actionsForStep('incident', 3).concat([{ type: 'runBatch' }]), step: null, defState: D.initial(), links: LINKS });
  has(R.header(div), 'Custom state from HQ (');
});

test('single-file form (no link bases) renders no links', () => {
  const m = model('incident', 3, { links: { hqBase: null, pipelineBase: null } });
  const h = R.header(m);
  assert.ok(h.indexOf('<a ') < 0);
  assert.ok(h.indexOf('Open this state') < 0);
});

test('unsafe hrefs are dropped, safe ones kept', () => {
  ['javascript:alert(1)', 'java\tscript:alert(1)', 'java\nscript:alert(1)', 'data:text/html,x', '//evil.example/x', 'https://evil.example', ' ../hq/', '../hq/"onmouseover="x', '', null, undefined, 5].forEach((bad) => {
    assert.strictEqual(R.safeHref(bad), '', String(bad));
    const m = J(model('incident', 3));
    m.header.hqHref = bad; m.header.pipelineHref = bad;
    assert.ok(R.header(m).indexOf('<a ') < 0, String(bad));
  });
  assert.strictEqual(R.safeHref('../hq/?scenario=incident&step=3'), '../hq/?scenario=incident&step=3');
  assert.strictEqual(R.safeHref('x'.repeat(2001)), '');
});

test('KPI tiles: ids, names, values, delta words and arrows, source, badge, freshness', () => {
  const k = R.kpis(model('incident', 3));
  ['bed-occupancy', 'abnormal-vital-rate', 'avg-length-of-stay', '30-day-readmission-rate'].forEach((id) => has(k, 'id="kpi-' + id + '"'));
  ['Bed Occupancy', 'Abnormal Vital Rate', 'Avg Length of Stay', '30-Day Readmission Rate'].forEach((n) => has(k, '<h3>' + n + '</h3>'));
  ['78.6%', '6.2%', '4.7 days', '13.4%'].forEach((v) => has(k, '<p class="kpi-value">' + v + '</p>'));
  has(k, '<span class="dir">up</span> +3.5% vs prior 7 days');
  has(k, '<span class="dir">down</span> -0.7% vs prior 7 days');
  has(k, '▲');
  has(k, '▼');
  has(k, 'source: fct_census_daily');
  has(k, 'source: fct_vital_observation');
  has(k, 'def v1');
  has(k, 'as of Batch 2, ');
  assert.strictEqual(count(k, '<polyline'), 4);
  assert.ok(!/NaN|Infinity|undefined/.test(k));
});

test('Held badge only on held tiles: incident step 3 has four, step 16 none', () => {
  const held = R.kpis(model('incident', 3));
  assert.strictEqual(count(held, '>Held</span>'), 4);
  has(held, 'KPIs held at Batch 2');
  const clear = R.kpis(model('incident', 16));
  assert.strictEqual(count(clear, '>Held</span>'), 0);
  assert.ok(clear.indexOf('KPIs held') < 0);
  has(clear, 'as of Batch 4, ');
  assert.strictEqual(count(R.kpis(model('healthy', 1)), '>Held</span>'), 0);
  // one held tile only
  const m = J(model('incident', 16));
  m.kpis.tiles[2].held = true; m.kpis.tiles[2].heldText = 'KPIs held at Batch 9';
  const one = R.kpis(m);
  assert.strictEqual(count(one, '>Held</span>'), 1);
  assert.ok(one.indexOf('Batch 9') > one.indexOf('id="kpi-avg-length-of-stay"'));
});

test('trends: four figures, chart svg, visible summary, Show as table with aria-expanded', () => {
  const t = R.trends(model('healthy', 1));
  assert.strictEqual(count(t, '<figure '), 4);
  assert.strictEqual(count(t, '<svg xmlns'), 4);
  assert.strictEqual(count(t, 'class="trend-summary"'), 4);
  assert.match(t, /<p class="trend-summary">Bed Occupancy: daily \d+\.\d% on 20\d\d-\d\d-\d\d \(7-day \d+\.\d%\), daily range /);
  assert.strictEqual(count(t, 'trailing window is shorter for the first six days'), 4);
  assert.match(t, /<p class="trend-legend caption">Thin line: daily value\. Thick line: 7-day trailing value \(trailing window is shorter for the first six days\)\. Shaded bands: weekends\.<\/p>/);
  assert.strictEqual(count(t, '>Show as table</button>'), 4);
  assert.strictEqual(count(t, 'aria-expanded="false"'), 4);
  assert.strictEqual(count(t, '<table'), 0);
  assert.strictEqual(count(t, 'class="weekend"'), 4 * model('healthy', 1).trends[0].weekendIndexes.length);
  has(t, 'data-cmd="table-toggle" data-kpi="bed-occupancy"');
  assert.ok(!/NaN/.test(t));
});

test('trends: open table shows only that KPI, with the shorter-window caption', () => {
  const t = R.trends(model('healthy', 1, { openTables: { 'abnormal-vital-rate': true } }));
  assert.strictEqual(count(t, '<table'), 1);
  assert.strictEqual(count(t, 'aria-expanded="true"'), 1);
  has(t, '<caption>Abnormal Vital Rate (trailing window is shorter for the first six days)</caption>');
  assert.strictEqual(count(t, '<tr>'), 121);
});

test('compare: labels, numbers from the engine, grouped reasons, the note always', () => {
  const c = R.compare(model('incident', 3));
  has(c, 'With the gate (what this dashboard shows)');
  has(c, 'Without a gate (a model of a naive pipeline)');
  has(c, '40 readings');
  has(c, '5 abnormal');
  has(c, '12.5%');
  has(c, '53 readings counted');
  has(c, '7 rows silently dropped');
  has(c, '5 × renamed columns: patient_id key missing, dropped by join to dim_patient');
  has(c, '1 × null patient_id: dropped by join to dim_patient');
  has(c, '2 invalid readings counted');
  has(c, '13.2%');
  has(c, 'The seven-day tiles come from the 120-day Gold history, so a single bad batch does not move them.');
  const h = R.compare(model('healthy', 1));
  has(h, 'The seven-day tiles come from the 120-day Gold history');
  assert.ok(!/NaN|undefined/.test(h));
});

test('definitions: labelled selects, buttons with names, version badge, yaml, consumers, changelog, message', () => {
  const d = R.definitions(model('healthy', 1));
  assert.ok(d.indexOf('<span id="stage-definitions"></span>') === 0);
  has(d, '<label for="def-select-abnormal-vital-rate">Definition for Abnormal Vital Rate</label>');
  has(d, '<select id="def-select-abnormal-vital-rate" data-cmd="select" data-metric="Abnormal Vital Rate">');
  has(d, '<option value="strict_thresholds">Strict thresholds</option>');
  has(d, '<option value="standard_thresholds" selected>Standard thresholds</option>');
  assert.strictEqual(count(d, '>Publish definition</button>'), 2);
  assert.strictEqual(count(d, '>Roll back</button>'), 2);
  has(d, 'data-cmd="publish" data-metric="30-Day Readmission Rate" aria-label="Publish definition for 30-Day Readmission Rate"');
  has(d, 'data-cmd="rollback" data-metric="Abnormal Vital Rate" aria-label="Roll back Abnormal Vital Rate"');
  has(d, '>v1</span>');
  has(d, '<pre class="yaml"');
  has(d, '# illustrative, in the style of dbt MetricFlow, not a working config');
  has(d, '    numerator: abnormal_obs_standard');
  ['Dashboard tile', 'Trend chart'].forEach((c) => has(d, '<th scope="row">' + c + '</th>'));
  has(d, '>Reset definitions</button>');
  has(d, 'data-cmd="mode" data-governed="true" aria-pressed="true">One governed definition</button>');
  has(d, 'data-cmd="mode" data-governed="false" aria-pressed="false">Hardcoded in the report</button>');
  has(d, '<p class="def-message">');
  assert.strictEqual(count(d, 'aria-live'), 0, 'the live element is def-live in index.html, not in the region');
  has(d, 'No definition changes yet');
});

test('conflict banner: present only in conflict, no role alert, listing both values', () => {
  const clean = R.definitions(model('healthy', 1));
  assert.strictEqual(count(clean, 'role="alert"'), 0);
  let ds = D.reduce(D.initial(), { type: 'mode', governed: false });
  assert.strictEqual(count(R.definitions(model('healthy', 1, { defState: ds })), 'role="alert"'), 0);
  ds = D.reduce(ds, { type: 'select', metric: 'Abnormal Vital Rate', definitionId: 'strict_thresholds' });
  ds = D.reduce(ds, { type: 'publish', metric: 'Abnormal Vital Rate' });
  const m = model('healthy', 1, { defState: ds });
  const d = R.definitions(m);
  assert.strictEqual(count(d, 'role="alert"'), 0);
  assert.strictEqual(count(d, 'class="conflict"'), 1);
  assert.match(d, /<p class="conflict">Definition conflict: 1 report disagrees \(values: \d+\.\d%, \d+\.\d%\)<\/p>/);
  has(d, 'aria-pressed="true">Hardcoded in the report</button>');
  has(d, 'v2: Abnormal Vital Rate: standard_thresholds -&gt; strict_thresholds, 1 consumer changed');
  // governed publish: no banner
  let g = D.reduce(D.initial(), { type: 'select', metric: 'Abnormal Vital Rate', definitionId: 'strict_thresholds' });
  g = D.reduce(g, { type: 'publish', metric: 'Abnormal Vital Rate' });
  assert.strictEqual(count(R.definitions(model('healthy', 1, { defState: g })), 'role="alert"'), 0);
});

test('check: title, number lines, verdict with level and a text cue, explain disclosure', () => {
  const m = model('healthy', 4);
  const c = R.check(m);
  assert.ok(c.indexOf('<span id="stage-check"></span>') === 0);
  has(c, '<h2>Expected-range check</h2>');
  has(c, '<p class="check-lead">A demonstration of the pattern, not a clinical model.</p>');
  has(c, '<p class="check-question">Is today&#39;s abnormal-vital rate unusual for a sample this size?</p>');
  assert.ok(c.indexOf('check-lead') < c.indexOf('check-with') && c.indexOf('check-question') < c.indexOf('check-with'));
  has(c, '10 of 80 = 12.5% (counting the five hand-picked rows)');
  has(c, '7 of 75 = 9.3% (without them; this is the number the verdict uses)');
  has(c, '<p class="verdict" data-level="ok"><span aria-hidden="true">✓</span> Within the expected range</p>');
  has(c, '<details class="explain"><summary>How this check works</summary>');
  const opened = J(m); opened.check.explainOpen = true;
  has(R.check(opened), '<details class="explain" open><summary>How this check works</summary>');
  has(c, 'The five hand-picked edge-case rows are left out');
  has(R.check(model('healthy', 1)), 'data-level="neutral"');
  has(R.check(model('healthy', 1)), 'Not enough data yet (fewer than 30 readings)');
  const warn = J(m); warn.check.level = 'warn'; warn.check.verdict = 'Above the expected range';
  has(R.check(warn), 'data-level="warn"><span aria-hidden="true">⚠</span> Above the expected range');
});

test('vendor and notice', () => {
  const v = R.vendor(model('healthy', 1));
  has(v, 'In production this is…');
  has(v, '<th scope="row">Metrics layer</th>');
  has(v, '<th scope="row">Dashboards</th>');
  has(v, 'Unity Catalog metric views');
  assert.strictEqual(count(v, '<th scope="col">'), 4);
  const m = J(model('healthy', 1)); m.notice = 'Engine self-test failed: beta';
  assert.strictEqual(R.notice(m), '<p class="notice" role="alert">Engine self-test failed: beta</p>');
});

test('every button has visible text or aria-label; every select has a label; no duplicate ids', () => {
  let ds = D.reduce(D.initial(), { type: 'mode', governed: false });
  ds = D.reduce(ds, { type: 'select', metric: 'Abnormal Vital Rate', definitionId: 'strict_thresholds' });
  ds = D.reduce(ds, { type: 'publish', metric: 'Abnormal Vital Rate' });
  const all = R.all(model('incident', 3, { defState: ds, openTables: { 'bed-occupancy': true } }));
  const buttons = all.match(/<button\b[^>]*>[\s\S]*?<\/button>/g);
  assert.ok(buttons.length >= 15);
  buttons.forEach((b) => {
    const text = b.replace(/<[^>]+>/g, '').trim();
    assert.ok(text.length > 0 || /aria-label="[^"]+"/.test(b), b);
    const label = /aria-label="([^"]+)"/.exec(b);
    if (label) assert.ok(label[1].indexOf(text) >= 0, 'label contains visible text: ' + b);
    assert.ok(/data-cmd="(back|next|scenario|publish|rollback|reset|mode|table-toggle)"/.test(b), b);
  });
  const selects = all.match(/<select\b[^>]*>/g);
  assert.strictEqual(selects.length, 2);
  selects.forEach((s) => {
    const id = /id="([^"]+)"/.exec(s)[1];
    assert.ok(all.indexOf('<label for="' + id + '">') >= 0, id);
    assert.ok(/data-cmd="select"/.test(s) && /data-metric="/.test(s));
  });
  const ids = (all.match(/\sid="[^"]*"/g) || []);
  assert.strictEqual(new Set(ids).size, ids.length, 'unique ids');
  ids.forEach((i) => assert.ok(!/NaN|undefined/.test(i)));
});

test('injected strings in every field of a hand-built model come out escaped in every region', () => {
  const INJ = '<script>alert(1)</script><img onerror=1>"\'&';
  function taint(v) {
    if (typeof v === 'string') return v + INJ;
    if (Array.isArray(v)) return v.map(taint);
    if (v && typeof v === 'object') { const o = {}; Object.keys(v).forEach((k) => { o[k] = taint(v[k]); }); return o; }
    return v;
  }
  let ds = D.reduce(D.initial(), { type: 'mode', governed: false });
  ds = D.reduce(ds, { type: 'select', metric: 'Abnormal Vital Rate', definitionId: 'strict_thresholds' });
  ds = D.reduce(ds, { type: 'publish', metric: 'Abnormal Vital Rate' });
  const m = taint(J(model('incident', 3, { defState: ds, openTables: { 'bed-occupancy': true } })));
  m.trends[0].tableOpen = true;
  m.notice = 'n' + INJ;
  KEYS.forEach((k) => {
    const out = R[k](m);
    assert.ok(!/<script/i.test(out) && !/<img/i.test(out), k + ' raw markup');
  });
  const out = R.all(m);
  assert.ok(!/<script/i.test(out) && !/<img/i.test(out));
  assert.ok(out.indexOf('&lt;script&gt;alert(1)&lt;/script&gt;&lt;img onerror=1&gt;') >= 0);
  assert.ok(!/href="[^"]*(script|img)/.test(out));
});

test('markup in numbers-as-strings fields and an unusual model never throws', () => {
  [undefined, null, {}, { header: null, kpis: null, trends: 5, compare: 'x', definitions: [], check: null, vendor: null }].forEach((m) => {
    KEYS.forEach((k) => assert.strictEqual(typeof R[k](m), 'string', k));
    assert.strictEqual(typeof R.all(m), 'string');
  });
});

test('broken-engine model renders: notice shown, controls present, no tiles, footer', () => {
  const real = context.Engine;
  context.Engine = Object.assign({}, real, { getState() { throw new Error('boom'); } });
  let m;
  try { m = V.buildViewModel({ scenario: 'healthy', actions: [], step: 1, defState: D.initial(), links: LINKS }); } finally { context.Engine = real; }
  const out = R.all(m);
  has(out, 'role="alert"');
  has(out, 'Engine self-test failed: boom');
  has(out, 'No KPIs to show');
  has(out, 'Not enough data yet');
  has(out, FOOTER);
  assert.ok(!/NaN|undefined/.test(out));
});

test('render.all: stable region order and no raw "undefined" for a real model', () => {
  const out = R.all(model('incident', 3));
  const order = ['<h1>', 'KPI dashboard', 'Trends over 120 days', 'With the gate and without it', 'stage-definitions', 'stage-check', 'In production this is', 'All data is synthetic'];
  let at = -1;
  order.forEach((s) => { const i = out.indexOf(s); assert.ok(i > at, s); at = i; });
  assert.ok(!/undefined|NaN/.test(out));
});
