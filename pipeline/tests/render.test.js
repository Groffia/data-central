'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadPipeline } = require('./helpers/load');

const { Engine, Pipeline } = loadPipeline();
const vmod = Pipeline.viewmodel;
const KEYS = ['batches', 'dlq', 'footer', 'generation', 'header', 'landing', 'matrix', 'medallion', 'notice', 'rows', 'storage', 'vendor'];
const ESC_INJ = '&#39;; DROP TABLE silver_vital_observation;--';
const FOOTER = '<p>All data is synthetic and generated deterministically (seed 42). Company names are fictional.</p>';

function build(scenario, step, extra) {
  const actions = Engine.actionsForStep(scenario, step);
  const state = Engine.getState(scenario, actions);
  const n = state.batchesRun || null;
  return vmod.buildViewModel(Object.assign({
    scenario, step, actions, state, selectedBatch: n,
    inspect: n ? Engine.inspectBatch(scenario, actions, n) : null,
    tieringInputs: {}, tieringPrevious: null, hqLink: 'hq.html?scenario=' + scenario + '&step=' + step,
    focus: '', notice: '', error: ''
  }, extra || {}));
}
function regions(scenario, step, extra) { return Pipeline.render.renderRegions(build(scenario, step, extra)); }
function all(r) { return Object.keys(r).map((k) => r[k]).join('\n'); }
function count(s, sub) { return s.split(sub).length - 1; }

test('twelve keys, all strings, only notice may be empty', () => {
  const r = regions('incident', 3);
  assert.deepStrictEqual(Object.keys(r).sort(), KEYS);
  KEYS.forEach((k) => {
    assert.strictEqual(typeof r[k], 'string');
    if (k !== 'notice') assert.ok(r[k].length > 0, k);
  });
});

test('injection string only appears escaped, in landing, rows and dlq', () => {
  const r = regions('incident', 3);
  ['landing', 'rows', 'dlq'].forEach((k) => assert.ok(r[k].indexOf(ESC_INJ) >= 0, k));
  assert.strictEqual(all(r).indexOf("'; DROP TABLE"), -1);
});

test('hand-made inspect with markup and quotes renders escaped in landing', () => {
  const inspect = {
    n: 1, batchId: 'batch-1', runEpoch: 0, decision: 'HELD', dlqIds: [], results: [], rowFailures: [],
    rows: [{ patient_id: '<b>x</b>', 'we"ird': '"quoted"', '<i>col</i>': 'a&b' }]
  };
  const r = regions('incident', 3, { inspect });
  assert.ok(r.landing.indexOf('<b>x</b>') < 0 && r.landing.indexOf('&lt;b&gt;x&lt;/b&gt;') >= 0);
  assert.ok(r.landing.indexOf('&lt;i&gt;col&lt;/i&gt;') >= 0);
  assert.ok(r.landing.indexOf('we&quot;ird') >= 0);
  assert.ok(r.landing.indexOf('&quot;quoted&quot;') >= 0);
  assert.ok(r.landing.indexOf('a&amp;b') >= 0);
  assert.ok(r.landing.indexOf('<i>') < 0);
  assert.ok(r.rows.indexOf('<b>') < 0);
});

test('markup in dlq text and notice is escaped', () => {
  const vm = JSON.parse(JSON.stringify(build('incident', 3, { notice: '<b>n</b>', error: '"e"' })));
  vm.dlq[0].reason = '<img src=x onerror=alert(1)>';
  const r = Pipeline.render.renderRegions(vm);
  assert.ok(r.dlq.indexOf('<img') < 0 && r.dlq.indexOf('&lt;img') >= 0);
  assert.ok(r.notice.indexOf('<b>') < 0 && r.notice.indexOf('&lt;b&gt;n') >= 0);
  assert.ok(/role="alert"[^>]*>&quot;e&quot;/.test(r.notice));
});

test('five drift rows and drift note at incident batch 3', () => {
  const r = regions('incident', 3);
  assert.strictEqual(count(r.landing, '<tr data-drift="true"'), 5);
  assert.ok(r.landing.indexOf('Columns arrived as ') >= 0);
  assert.ok(r.landing.indexOf(Engine.getContract().names.bronze) >= 0);
  assert.ok(r.landing.indexOf('Raw data is kept exactly as received so it can always be replayed.') >= 0);
  assert.ok(r.landing.indexOf('<th scope="col">patientId</th>') >= 0);
  assert.ok(r.landing.indexOf('<th scope="col">patient_id</th>') >= 0);
});

test('matrix: note paragraph, gate level, counts', () => {
  const r = regions('incident', 3);
  assert.strictEqual(count(r.matrix, '<p class="note">'), 1);
  assert.ok(r.matrix.indexOf('Read them as five rows, not 45 failures.') >= 0);
  assert.ok(r.matrix.indexOf('data-level="red"') >= 0);
  assert.ok(r.matrix.indexOf('Gate decision: Held (') >= 0);
  const h = regions('healthy', 1);
  assert.strictEqual(count(h.matrix, '<p class="note">'), 0);
  assert.ok(h.matrix.indexOf('data-level="green"') >= 0);
});

test('nine dlq rows, each with an id', () => {
  const r = regions('incident', 3);
  const ids = Engine.getState('incident', Engine.actionsForStep('incident', 3)).dlq.map((d) => d.dlqId);
  assert.strictEqual(ids.length, 9);
  ids.forEach((id) => assert.strictEqual(count(r.dlq, '<tr id="' + id + '"'), 1, id));
  assert.strictEqual(count(r.dlq, '<tr id='), 9);
});

test('Handle in HQ links only with hqHref', () => {
  const on = regions('incident', 3);
  assert.strictEqual(count(on.dlq, '>Handle in HQ</a>'), 9);
  assert.ok(on.dlq.indexOf('href="hq.html?scenario=incident&amp;step=3"') >= 0);
  const off = regions('incident', 3, { hqLink: '' });
  assert.strictEqual(count(off.dlq, 'Handle in HQ'), 0);
  assert.strictEqual(count(off.header, 'Open this state in HQ'), 0);
  assert.strictEqual(count(on.header, 'Open this state in HQ'), 1);
});

test('javascript: hrefs are never rendered', () => {
  const r = regions('incident', 3, { hqLink: 'javascript:alert(1)' });
  assert.strictEqual(all(r).toLowerCase().indexOf('javascript:'), -1);
});

test('focus attributes', () => {
  const r = regions('incident', 3, { focus: 'dlq-3-4' });
  assert.strictEqual(count(r.dlq, 'data-focus="true"'), 1);
  assert.ok(/<tr id="dlq-3-4"[^>]* data-focus="true"/.test(r.dlq));
  assert.strictEqual(count(r.storage, 'data-focus'), 0);
  assert.ok(r.storage.indexOf('id="stage-storage"') >= 0);
  const s = regions('incident', 3, { focus: 'stage-storage' });
  assert.ok(/id="stage-storage"[^>]* data-focus="true"/.test(s.storage));
  assert.strictEqual(count(s.dlq, 'data-focus'), 0);
});

test('stepper bounds: Back disabled at the floor, Next at the last step', () => {
  const floor = Engine.PRELUDE.incident.length;
  const last = Engine.AUTOPLAY.incident.length;
  const a = regions('incident', floor).header;
  assert.ok(/<button[^>]*data-cmd="back"[^>]* disabled/.test(a));
  assert.ok(!/<button[^>]*data-cmd="next"[^>]* disabled/.test(a));
  const b = regions('incident', last).header;
  assert.ok(/<button[^>]*data-cmd="next"[^>]* disabled/.test(b));
  assert.ok(!/<button[^>]*data-cmd="back"[^>]* disabled/.test(b));
  assert.ok(a.indexOf('Step ' + floor + ' of ' + last) >= 0);
});

test('scenario buttons carry aria-pressed for the current one', () => {
  const h = regions('incident', 3).header;
  assert.ok(/data-cmd="scenario" data-scenario="incident" aria-pressed="true"/.test(h));
  assert.ok(/data-cmd="scenario" data-scenario="healthy" aria-pressed="false"/.test(h));
});

test('batch chips are buttons with data-n and pressed state', () => {
  const b = regions('incident', 3).batches;
  assert.strictEqual(count(b, 'data-cmd="batch"'), 3);
  assert.ok(/data-cmd="batch" data-n="3" aria-pressed="true">Batch 3 \(held\)</.test(b));
  assert.ok(/data-n="1" aria-pressed="false">Batch 1</.test(b));
  assert.ok(b.indexOf('Held at the gate') >= 0);
});

test('no batch run yet shows the empty text', () => {
  const r = regions('healthy', 0);
  assert.ok(r.landing.indexOf('No batch has run yet') >= 0);
  assert.ok(r.matrix.indexOf('No batch has run yet') >= 0);
  assert.ok(r.rows.indexOf('No batch has run yet') >= 0);
});

test('stage headings, vendor heading, footer', () => {
  const r = regions('incident', 3);
  assert.ok(r.generation.indexOf('<h2>Generation</h2>') >= 0);
  assert.ok(r.landing.indexOf('<h2>Collection/Ingestion</h2>') >= 0);
  assert.ok(r.matrix.indexOf('<h2>Processing/Preparation</h2>') >= 0);
  assert.ok(r.storage.indexOf('<h2>Storage</h2>') >= 0);
  assert.ok(r.vendor.indexOf('<h2>In production this is…</h2>') >= 0);
  assert.ok(r.vendor.indexOf('Auto Loader / Lakeflow Connect') >= 0);
  assert.strictEqual(r.footer, FOOTER);
  assert.ok(r.generation.indexOf('The feed is a labelled sample of a 400-bed facility') >= 0);
});

test('storage: inputs show raw values, labels, defaults, reset, tier bar widths', () => {
  const r = regions('incident', 3);
  ['hotToWarmDays', 'warmToColdDays', 'retentionDays', 'dailyGB'].forEach((f) => {
    assert.ok(new RegExp('<input[^>]*type="text"[^>]*inputmode="numeric"[^>]*data-field="' + f + '"').test(r.storage), f);
    assert.ok(r.storage.indexOf('<label for="field-' + f + '">') >= 0, f);
  });
  assert.ok(r.storage.indexOf('value="30"') >= 0);
  assert.ok(/data-cmd="resetTiering"/.test(r.storage));
  assert.strictEqual(count(r.storage, 'role="alert"'), 0);
  build('incident', 3).storage.tierBar.forEach((seg) => {
    assert.ok(r.storage.indexOf('width:' + seg.widthPct.toFixed(1) + '%') >= 0);
  });
  assert.ok(r.storage.indexOf('Illustrative figures for comparison, not vendor quotes') >= 0);
});

test('invalid slider: raw value escaped, role=alert message', () => {
  const r = regions('incident', 3, { tieringInputs: { hotToWarmDays: '"><b>x' } });
  assert.ok(r.storage.indexOf('value="&quot;&gt;&lt;b&gt;x"') >= 0);
  assert.ok(r.storage.indexOf('<b>x') < 0);
  assert.ok(/<p[^>]*role="alert"[^>]*>Hot to warm must be a whole number from 1 to 90 days\.<\/p>/.test(r.storage));
  assert.strictEqual(count(r.storage, 'role="alert"'), 1);
});

test('medallion shows counts and table names', () => {
  const m = regions('incident', 3).medallion;
  assert.ok(m.indexOf('Bronze rows landed') >= 0 && m.indexOf('silver_vital_observation') >= 0);
  assert.ok(m.indexOf('fct_vital_observation') >= 0);
  assert.ok(m.indexOf('Gold KPI inputs are the 120-day pre-aggregated daily history plus today&#39;s published exports') >= 0);
});

test('tables are wrapped in table-wrap', () => {
  const r = regions('incident', 3);
  ['generation', 'landing', 'matrix', 'rows', 'dlq', 'vendor'].forEach((k) => {
    assert.ok(count(r[k], '<table') >= 1, k);
    assert.strictEqual(count(r[k], '<table'), count(r[k], '<div class="table-wrap"><table'), k);
  });
});

test('ten scripted states: no script, javascript:, or inline handlers', () => {
  const states = [['healthy', 0], ['healthy', 1], ['healthy', 3], ['healthy', 4], ['incident', 2], ['incident', 3], ['incident', 5], ['incident', 9], ['incident', 12], ['incident', 16]];
  states.forEach(([s, k]) => {
    const t = all(regions(s, k, { focus: 'dlq-3-4', notice: 'n' })).toLowerCase();
    assert.strictEqual(t.indexOf('<script'), -1, s + k);
    assert.strictEqual(t.indexOf('javascript:'), -1, s + k);
    assert.ok(!/\son[a-z]+\s*=/.test(t.replace(/data-[a-z-]+="[^"]*"/g, '')), s + k);
  });
});

test('row view shows warn tests as muted text on passing rows, escaped', () => {
  const r = regions('incident', 3);
  assert.strictEqual(count(r.rows, 'warn: abnormal_vital_flag'), 2);
  assert.ok(r.rows.indexOf('<span class="muted">warn: abnormal_vital_flag</span>') >= 0);
  const vm = JSON.parse(JSON.stringify(build('incident', 3)));
  vm.rowView[2].warnTests = ['<b>x</b>'];
  const h = Pipeline.render.renderRegions(vm).rows;
  assert.ok(h.indexOf('<b>x</b>') < 0 && h.indexOf('warn: &lt;b&gt;x&lt;/b&gt;') >= 0);
});
