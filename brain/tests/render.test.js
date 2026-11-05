'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadBrain } = require('./helpers/load');

const L = loadBrain();
const V = L.Brain.viewmodel;
const R = L.Brain.render;
const E = L.Engine;
const LINKS = { hqBase: '../hq/', pipelineBase: '../pipeline/' };
const KEYS = ['header', 'notice', 'contract', 'phi', 'access', 'retention', 'erasure', 'vendor', 'footer'];
const STATEMENT = "This shows how a deletion is carried out across every layer. Whether a request must be granted, and which records must be kept, depends on the law and the organization's policy. This demo does not decide that.";
const RAW_LINE = "Raw files in Bronze are immutable. Erasure destroys the subject's data key, so their rows there can no longer be read (simulated: no real keys or encryption are used).";
const EFFECTS_SENTENCE = 'The seven-day KPI tiles do not move: the KPI history is aggregate-only and holds no patient rows.';
const RETENTION_LABEL = 'Retention periods here are example policy settings for the demo, not legal advice.';
const IDS = E.buildPatientPool().map((p) => p.patient_id);

function model(sc, step, local) {
  return V.buildViewModel({ scenario: sc, actions: E.actionsForStep(sc, step), step: step, links: LINKS, local: local });
}
const html = (m) => KEYS.map((k) => R[k](m)).join('\n');
const count = (s, sub) => s.split(sub).length - 1;

test('every region renders a string for a real model and for an empty one', () => {
  KEYS.forEach((k) => {
    assert.strictEqual(typeof R[k](model('incident', 3)), 'string', k);
    assert.strictEqual(typeof R[k]({}), 'string', k + ' on {}');
    assert.strictEqual(typeof R[k](null), 'string', k + ' on null');
    assert.strictEqual(typeof R[k](undefined), 'string', k + ' on undefined');
  });
});

test('header: title, scenario switch with aria-pressed, stepper, both links, step text', () => {
  const h = R.header(model('incident', 3));
  assert.ok(h.indexOf('<h1>Brain: Control and Accountability</h1>') === 0);
  assert.ok(/data-cmd="scenario" data-value="incident" aria-pressed="true"/.test(h));
  assert.ok(/data-cmd="scenario" data-value="healthy" aria-pressed="false"/.test(h));
  assert.ok(/data-cmd="back"/.test(h) && /data-cmd="next"/.test(h));
  assert.ok(h.indexOf('Step 3 of ' + E.AUTOPLAY.incident.length) >= 0);
  assert.ok(h.indexOf('<a class="hq-link" href="../hq/?scenario=incident&amp;step=3">Open this state in HQ</a>') >= 0);
  assert.ok(h.indexOf('<a class="pipeline-link" href="../pipeline/?scenario=incident&amp;step=3">Open this state in Pipeline</a>') >= 0);
});

test('header: no links without bases, an unsafe href is dropped, Back is disabled at the floor', () => {
  const none = R.header(V.buildViewModel({ scenario: 'healthy', actions: [], step: 0, links: {} }));
  assert.ok(none.indexOf('hq-link') < 0 && none.indexOf('pipeline-link') < 0);
  const m = JSON.parse(JSON.stringify(model('healthy', 4)));
  m.header.hqHref = 'javascript:alert(1)';
  m.header.pipelineHref = '//evil.example/';
  const h = R.header(m);
  assert.ok(h.indexOf('hq-link') < 0 && h.indexOf('pipeline-link') < 0);
  assert.ok(/<button[^>]*data-cmd="back"[^>]* disabled>/.test(R.header(model('healthy', 0))));
});

test('contract: ten field rows, five marked sensitive, the key line, and three owner rows', () => {
  const c = R.contract(model('healthy', 4));
  assert.ok(c.indexOf('<span id="stage-contract"></span>') === 0);
  assert.ok(c.indexOf('<h2>Data contract and ownership</h2>') >= 0);
  assert.strictEqual(count(c, 'Yes (PHI)'), 5);
  assert.ok(c.indexOf('Primary key: patient_id, vital_sequence. Entity field: patient_id.') >= 0);
  ['Clinical Informatics', 'Data Engineering', 'Analytics'].forEach((o) => assert.ok(c.indexOf('<td>' + o + '</td>') >= 0, o));
  assert.strictEqual(count(c, '<tr>'), 1 + 10 + 1 + 3);
});

test('phi: summary, fixed note, empty state; nine rows with field names at incident step 3', () => {
  const none = R.phi(model('healthy', 4));
  assert.ok(none.indexOf('<span id="stage-phi"></span>') === 0);
  assert.ok(none.indexOf('5 of 10 contract fields are marked sensitive') >= 0);
  assert.ok(none.indexOf('No rows are quarantined in this run.') >= 0);
  assert.ok(none.indexOf('quarantine-table') < 0);
  const p = R.phi(model('incident', 3));
  assert.ok(p.indexOf('9 quarantined rows hold sensitive fields (names only, never values)') >= 0);
  assert.strictEqual(count(p, 'dlq-3-'), 9);
  assert.ok(p.indexOf('Holding bad rows out of production is not privacy protection: the Silver layer keeps these fields by design.') >= 0);
});

test('access: label, newest first, ERASE entries lead after an erasure, empty state', () => {
  assert.ok(R.access(model('healthy', 0)).indexOf('No data has moved yet.') >= 0);
  const a = R.access(model('incident', 3, { erased: [IDS[0]] }));
  assert.ok(a.indexOf('A simulated access log: it records what the pipeline and the operator did in this run.') >= 0);
  assert.ok(a.indexOf('privacy-office') < a.indexOf('svc-ingest'));
  assert.strictEqual(count(a, '<tr>'), 1 + 11);
});

test('retention: verbatim label, four steps, hold button with aria-pressed, no lock until on', () => {
  const off = R.retention(model('incident', 3));
  assert.ok(off.indexOf(RETENTION_LABEL) >= 0);
  assert.strictEqual(count(off, 'class="tier'), 4);
  assert.ok(/data-cmd="hold" aria-pressed="false">Legal hold<\/button>/.test(off));
  assert.ok(off.indexOf('Locked') < 0 && off.indexOf('Deletion paused') < 0);
  assert.ok(off.indexOf('href="../pipeline/?scenario=incident&amp;step=3#stage-storage"') >= 0);
  const on = R.retention(model('incident', 3, { legalHold: true }));
  assert.ok(/data-cmd="hold" aria-pressed="true">Legal hold<\/button>/.test(on));
  assert.ok(on.indexOf('Deletion paused: legal hold is on.') >= 0 && on.indexOf('Locked') >= 0);
  assert.ok(on.indexOf('tier-paused') >= 0);
});

test('erasure: labelled select, buttons with names and disabled states, the verbatim statement', () => {
  const e = R.erasure(model('incident', 3));
  assert.ok(e.indexOf('<span id="stage-erasure"></span>') === 0);
  assert.ok(/<label for="subject-select">Subject<\/label><select id="subject-select" data-cmd="select-subject">/.test(e));
  assert.strictEqual(count(e, '<option'), 41);
  assert.ok(/<button[^>]*data-cmd="erase"[^>]* disabled>Erase subject<\/button>/.test(e));
  assert.ok(/<button[^>]*data-cmd="reset-erasures"[^>]* disabled>Reset erasures<\/button>/.test(e));
  assert.ok(e.indexOf('<p class="erase-reason">Choose a subject first</p>') >= 0);
  assert.ok(e.indexOf(STATEMENT.replace("'", '&#39;')) >= 0);
  assert.ok(e.indexOf(EFFECTS_SENTENCE) >= 0);
  assert.ok(e.indexOf('No subject has been erased yet.') >= 0);
  assert.ok(e.indexOf('Checks appear after an erasure.') >= 0);
});

test('erasure: a selected, then an erased subject shows the footprint, raw-layer line, effects and five passing checks', () => {
  const id = IDS.find((x) => { const f = E.subjectFootprint('incident', E.actionsForStep('incident', 3), x); return f.silver > 0 && f.bronze > 0; });
  const sel = R.erasure(model('incident', 3, { selectedSubject: id }));
  assert.ok(/<option value="[^"]+" selected>/.test(sel));
  assert.ok(/<button type="button" data-cmd="erase">Erase subject<\/button>/.test(sel));
  assert.ok(sel.indexOf(RAW_LINE.replace("'", '&#39;')) >= 0);
  assert.ok(sel.indexOf('(unreadable)') >= 0);
  assert.strictEqual(count(sel, 'class="footprint-table"'), 1);
  const done = R.erasure(model('incident', 3, { selectedSubject: id, erased: [id] }));
  assert.ok(done.indexOf('Published readings:') >= 0);
  assert.strictEqual(count(done, ': Pass</li>'), 5);
  assert.strictEqual(count(done, ': Fail</li>'), 0);
  assert.ok(/<button[^>]*data-cmd="erase"[^>]* disabled>/.test(done));
  assert.ok(done.indexOf('<p class="erase-reason">Already erased</p>') >= 0);
  assert.ok(/<button type="button" data-cmd="reset-erasures">Reset erasures<\/button>/.test(done));
});

test('erasure under legal hold: disabled with the engine reason', () => {
  const e = R.erasure(model('incident', 3, { selectedSubject: IDS[0], legalHold: true }));
  assert.ok(e.indexOf('<p class="erase-reason">Erasure blocked: legal hold is on.</p>') >= 0);
  assert.ok(/<button[^>]*data-cmd="erase"[^>]* disabled>/.test(e));
});

test('vendor, notice and footer', () => {
  const v = R.vendor({ vendor: { columns: ['Component', 'A'], rows: [['Row <b>', 'x & y']] } });
  assert.ok(v.indexOf('<h2>In production this is…</h2>') === 0);
  assert.ok(v.indexOf('<th scope="row">Row &lt;b&gt;</th><td>x &amp; y</td>') >= 0);
  assert.strictEqual(R.notice({ notice: null }), '');
  assert.strictEqual(R.notice({ notice: 'bad' }), '<p class="notice" role="alert">bad</p>');
  assert.ok(R.footer(model('healthy', 4)).indexOf('All data is synthetic and generated deterministically (seed 42). Company names are fictional.') >= 0);
  assert.ok(R.footer({}).indexOf('seed 42') >= 0);
});

test('every engine string is escaped: injection text in every field never becomes markup', () => {
  const INJ = '<script>alert(1)</script><img src=x onerror=1>"\'&';
  const m = JSON.parse(JSON.stringify(model('incident', 3, { selectedSubject: IDS[0], erased: [IDS[0]] })));
  const poison = (o) => {
    if (Array.isArray(o)) o.forEach((x, i) => { if (typeof x === 'string') o[i] = INJ; else poison(x); });
    else if (o && typeof o === 'object') Object.keys(o).forEach((k) => {
      if (/Href$/.test(k) || k === 'storageHref') return;
      if (typeof o[k] === 'string') o[k] = INJ; else poison(o[k]);
    });
  };
  poison(m);
  m.header.scenario = 'incident';
  const out = html(m);
  assert.ok(out.indexOf('<script>') < 0 && out.indexOf('<img') < 0);
  assert.ok(out.indexOf('&lt;script&gt;') >= 0);
  assert.ok(!/ onerror=/.test(out.replace(/&lt;img[^&]*/g, '')));
});

test('the disabled and pressed attributes follow the model, not the markup', () => {
  const m = JSON.parse(JSON.stringify(model('incident', 3)));
  m.erasure.canErase = true;
  m.erasure.canReset = true;
  const e = R.erasure(m);
  assert.ok(!/data-cmd="erase"[^>]* disabled/.test(e));
  assert.ok(!/data-cmd="reset-erasures"[^>]* disabled/.test(e));
});

test('compliance wording: only the verbatim strings make legal statements, in every state', () => {
  const FORBIDDEN = /compliant|compliance|required by|hipaa|gdpr|legally|legal advice|illegal/i;
  const allowed = [STATEMENT.replace("'", '&#39;'), RETENTION_LABEL];
  const states = [['healthy', 4, undefined], ['incident', 3, undefined], ['incident', 16, undefined], ['incident', 3, { legalHold: true, selectedSubject: IDS[1] }], ['incident', 3, { selectedSubject: IDS[0], erased: [IDS[0], IDS[2]] }]];
  states.forEach(([sc, step, local]) => {
    let out = html(model(sc, step, local));
    allowed.forEach((a) => { out = out.split(a).join(''); });
    assert.deepStrictEqual(out.match(FORBIDDEN), null, sc + step);
    assert.ok(out.indexOf('Gold layer holds no patient rows') < 0);
    assert.ok(!/organisation/i.test(out));
  });
});

test('no sensitive value on the page: names, zips, birth dates, the injection string; ids only in the erasure picker and table', () => {
  const id = IDS.find((x) => { const f = E.subjectFootprint('incident', E.actionsForStep('incident', 3), x); return f.silver > 0 && f.deadLetter > 0; });
  const m = model('incident', 3, { selectedSubject: id, erased: [id] });
  const page = html(m);
  const pool = E.buildPatientPool();
  pool.forEach((p) => {
    assert.ok(page.indexOf(p.patient_name) < 0, p.patient_name);
    assert.ok(page.indexOf(p.birth_date) < 0, p.birth_date);
    assert.ok(page.indexOf('>' + p.patient_zip5 + '<') < 0);
  });
  assert.ok(page.indexOf('DROP TABLE') < 0);
  const withoutErasure = [R.header(m), R.contract(m), R.phi(m), R.retention(m)].join('');
  IDS.forEach((x) => assert.ok(withoutErasure.indexOf(x) < 0, 'id outside the erasure and access panels: ' + x));
});
