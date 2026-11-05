(function () {
  'use strict';
  const Pipeline = (globalThis.Pipeline = globalThis.Pipeline || {});
  const vm = (Pipeline.viewmodel = Pipeline.viewmodel || {});

  // ----- Task 5: header, stepper, batch chips -----

  const NO_BATCH_TEXT = 'No batch has run yet';

  // The detail of the first engine event the last applied action added. The prior state is the same scripted
  // prefix one action shorter; at or below the scenario floor (nothing was added) it is the last event.
  function stepText(state, scenario, step) {
    const events = state.events || [];
    if (!events.length) return NO_BATCH_TEXT;
    const prev = Engine.getState(scenario, Engine.actionsForStep(scenario, step - 1));
    const added = events[(prev.events || []).length];
    return (added || events[events.length - 1]).detail;
  }

  function header(state, scenario, step, hqLink) {
    const m = Engine.AUTOPLAY[scenario].length;
    const floor = Engine.PRELUDE[scenario].length;
    return {
      title: 'Pipeline: Under the Hood',
      subtitle: 'Tamsworth Health: how a vitals export becomes trusted data, stages 1 to 4',
      steps: { n: step, m: m, text: stepText(state, scenario, step) },
      canBack: step > floor,
      canNext: step < m,
      hqHref: hqLink
    };
  }

  function stepLabel(steps) { return 'Step ' + steps.n + ' of ' + steps.m; }

  // The batch whose rows are held back: the batch of the dead-letter entries, only while the gate is not closed.
  function isHeld(state, n) {
    if (state.gate !== 'OPEN' && state.gate !== 'HALF_OPEN') return false;
    const id = 'batch-' + n;
    const dlq = state.dlq || [];
    if (dlq.some(function (d) { return d.batchId === id && d.status === 'open'; })) return true;
    return (state.staging || []).length > 0 && dlq.length > 0 && dlq[0].batchId === id;
  }

  function batchChips(state, selected) {
    const total = state.batchesRun || 0;
    const sel = selected === null || selected === undefined ? total : selected;
    const chips = [];
    for (let n = 1; n <= total; n++) {
      const held = isHeld(state, n);
      chips.push({ n: n, label: 'Batch ' + n + (held ? ' (held)' : ''), held: held, selected: n === sel });
    }
    return chips;
  }

  vm.header = header;
  vm.stepLabel = stepLabel;
  vm.batchChips = batchChips;

  // ----- Task 6: generation panel -----

  function generationPanel(state) {
    const c = Engine.getContract();
    const f = state.facility;
    const F = Shared.format;
    return {
      source: 'EHR vitals table, exported as a FHIR-style bulk file',
      cadence: 'Exported every 15 simulated minutes (batch, cursor ' + c.epochField + ')',
      contractRows: c.fields.map(function (x) {
        return { name: x.name, type: x.type, rule: x.rule, sensitive: x.sensitive };
      }),
      goldenRows: c.goldenRows,
      facility: {
        beds: c.facility.beds_staffed + ' ' + F.plural(c.facility.beds_staffed, 'bed', 'beds') + ' staffed',
        patients: F.thousands(f.patientsInHouse) + ' ' + F.plural(f.patientsInHouse, 'patient', 'patients') + ' in house',
        perDay: F.thousands(f.obsPerDay) + ' ' + F.plural(f.obsPerDay, 'observation', 'observations') + ' per day',
        per15: f.obsPer15Min.toFixed(1) + ' observations per 15 minutes',
        perMonth: F.thousands(f.obsPerMonth) + ' ' + F.plural(f.obsPerMonth, 'observation', 'observations') + ' per month',
        bytesPerRow: f.bytesPerRow.toFixed(2) + ' bytes per row',
        bytesPerMonth: F.thousands(f.bytesPerMonth) + ' bytes per month',
        note: 'The feed is a labelled sample of a ' + c.facility.beds_staffed + '-bed facility'
      }
    };
  }

  vm.generationPanel = generationPanel;

  // ----- Task 7: landing zone -----

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  // Seconds since the epoch to "HH:MM:SS UTC" with integer arithmetic only.
  function clockFromEpoch(sec) {
    const d = ((sec % 86400) + 86400) % 86400;
    return pad2(Math.floor(d / 3600)) + ':' + pad2(Math.floor((d % 3600) / 60)) + ':' + pad2(d % 60) + ' UTC';
  }

  function cellText(v) {
    if (v === null || v === undefined) return 'null';
    return typeof v === 'string' ? v : String(v);
  }

  function hasContractKeys(row, names) {
    const keys = Object.keys(row);
    return keys.length === names.length && names.every(function (n, i) { return keys[i] === n; });
  }

  function landingZone(inspect) {
    const names = Engine.getContract().fields.map(function (f) { return f.name; });
    const table = Engine.getContract().names.bronze;
    if (!inspect) {
      return { facts: { batchId: Shared.format.batchLabel(null), runTimeText: '', rowCountText: '0 rows', table: table }, columns: [], rows: [], driftNote: null };
    }
    const src = inspect.rows || [];
    const columns = [];
    src.forEach(function (r) {
      Object.keys(r).forEach(function (k) { if (columns.indexOf(k) < 0) columns.push(k); });
    });
    let firstDrift = null;
    const rows = src.map(function (r) {
      const drift = !hasContractKeys(r, names);
      if (drift && firstDrift === null) firstDrift = Object.keys(r);
      return {
        cells: columns.map(function (c) {
          const has = Object.prototype.hasOwnProperty.call(r, c);
          return { text: has ? cellText(r[c]) : '', drift: has && names.indexOf(c) < 0 };
        }),
        drift: drift
      };
    });
    return {
      facts: {
        batchId: Shared.format.batchLabel(inspect.batchId),
        runTimeText: clockFromEpoch(inspect.runEpoch),
        rowCountText: src.length + ' ' + Shared.format.plural(src.length, 'row', 'rows'),
        table: table
      },
      columns: columns,
      rows: rows,
      driftNote: firstDrift === null ? null : 'Columns arrived as ' + firstDrift.join(', ') + ' instead of ' + names.join(', ')
    };
  }

  vm.landingZone = landingZone;

  // ----- Task 8: test matrix, gate decision, row view -----

  const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
    'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
  function numberWord(n) { return n >= 1 && n <= 20 && Math.floor(n) === n ? WORDS[n] : String(n); }

  function testMatrix(inspect) {
    if (!inspect) return { rows: [], notes: [] };
    const F = Shared.format;
    const results = inspect.results || [];
    const rows = results.map(function (r) {
      const idx = (r.failingRows || []).slice();
      return {
        test: r.test, column: r.column, severity: r.severity,
        failing: idx.length, rowIndexes: idx,
        labelText: r.test + ' on ' + r.column
      };
    });
    const names = Engine.getContract().fields.map(function (f) { return f.name; });
    const driftIdx = [];
    (inspect.rows || []).forEach(function (r, i) { if (!hasContractKeys(r, names)) driftIdx.push(i); });
    const notes = [];
    if (driftIdx.length) {
      const cols = results.filter(function (r) {
        return r.test === 'not_null' && driftIdx.every(function (i) { return r.failingRows.indexOf(i) >= 0; });
      }).length;
      const d = driftIdx.length;
      const counts = cols * d;
      const sum = '(' + cols + ' ' + F.plural(cols, 'column', 'columns') + ' x ' + d + ' ' +
        F.plural(d, 'row', 'rows') + ' = ' + counts + ' ' + F.plural(counts, 'count', 'counts') + ')';
      const colText = numberWord(cols) + ' contract ' + F.plural(cols, 'column', 'columns');
      const failures = counts + ' ' + F.plural(counts, 'failure', 'failures');
      if (d === 1) {
        notes.push('Note: the 1 schema-drift row fails not_null on ' + colText + ', because its columns arrived renamed ' + sum +
          '. Read it as one row, not ' + failures + '.');
      } else {
        notes.push('Note: the ' + numberWord(d) + ' schema-drift rows fail not_null on ' + colText + ' each, because their columns arrived renamed ' + sum +
          '. Read them as ' + numberWord(d) + ' rows, not ' + failures + '.');
      }
    }
    return { rows: rows, notes: notes };
  }

  // Row indexes failing at least one error-severity test.
  function quarantinedIndexes(inspect) {
    const seen = {};
    (inspect.results || []).forEach(function (r) {
      if (r.severity === 'error') (r.failingRows || []).forEach(function (i) { seen[i] = true; });
    });
    return Object.keys(seen);
  }

  // The staged count comes from this batch (rows that passed), never from the live state, which a later batch may have changed.
  function gateDecision(inspect, state) {
    const q = quarantinedIndexes(inspect).length;
    const F = Shared.format;
    if (q === 0) return { text: 'Gate decision: Published (0 error-severity failures)', level: 'green' };
    const held = (inspect.rows || []).length - q;
    return {
      text: 'Gate decision: Held (' + q + ' ' + F.plural(q, 'row', 'rows') + ' quarantined, ' +
        held + ' ' + F.plural(held, 'row', 'rows') + ' held in staging)',
      level: 'red'
    };
  }

  function rowView(inspect) {
    if (!inspect) return [];
    const results = inspect.results || [];
    return (inspect.rows || []).map(function (_, i) {
      const failed = [];
      results.forEach(function (r) {
        if (r.severity === 'error' && (r.failingRows || []).indexOf(i) >= 0 && failed.indexOf(r.test) < 0) failed.push(r.test);
      });
      return { index: i, pass: failed.length === 0, failedTests: failed };
    });
  }

  vm.testMatrix = testMatrix;
  vm.gateDecision = gateDecision;
  vm.rowView = rowView;

  // ----- Task 9: dead-letter view, medallion flow -----

  // Same rule as HQ: null/undefined read "null", everything else is its JSON text (strings keep their quotes).
  function observedText(v) { return v === null || v === undefined ? 'null' : JSON.stringify(v); }

  function dlqView(state, hqLink) {
    const href = typeof hqLink === 'string' ? hqLink : '';
    return (state.dlq || []).map(function (d) {
      return {
        id: d.dlqId, anchor: d.dlqId, failedTests: (d.failedTests || []).slice(), column: d.column,
        observedValueText: observedText(d.observedValue), reason: d.reason,
        repairable: !!d.repairable, status: d.status, hqHref: href
      };
    });
  }

  function medallion(state) {
    const F = Shared.format;
    const c = Engine.getContract();
    const bronze = state.bronzeRows || 0;
    const staging = (state.staging || []).length;
    const silver = state.productionRows || 0;
    function unit(n) { return n + ' ' + F.plural(n, 'row', 'rows'); }
    return {
      bronze: bronze, staging: staging, silver: silver,
      labels: { bronze: 'Bronze rows landed', staging: 'Held in staging', silver: 'Silver rows in production' },
      texts: { bronze: unit(bronze), staging: unit(staging), silver: unit(silver) },
      bronzeTable: c.names.bronze,
      silverTable: c.names.silver,
      gold: {
        text: "Gold KPI inputs are the 120-day pre-aggregated daily history plus today's published exports",
        tables: c.names.gold.slice()
      }
    };
  }

  vm.dlqView = dlqView;
  vm.medallion = medallion;

  // ----- Task 10: storage tiering and vendor subset -----

  const TIER_KEYS = ['hotToWarmDays', 'warmToColdDays', 'retentionDays', 'dailyGB'];
  const MSG_HOT = 'Hot to warm must be a whole number from 1 to 90 days.';
  const MSG_WARM = 'Warm to cold must be a whole number of days, longer than hot to warm, up to 720.';
  const MSG_WARM_ORDER = 'Warm to cold must be longer than hot to warm.';
  const MSG_RETENTION = 'Retention must be a whole number of days, at least warm to cold, up to 3650.';
  const MSG_DAILY = 'Daily volume must be a whole number from 1 to 500 GB.';

  function tierDefaults() {
    const d = Engine.TIERING_DEFAULTS;
    return { hotToWarmDays: d.hotToWarmDays, warmToColdDays: d.warmToColdDays, retentionDays: d.retentionDays, dailyGB: d.dailyGB };
  }

  // A whole number from a number or a form string; null for anything else (empty, text, NaN, Infinity, decimals).
  function wholeNumber(v) {
    let n;
    if (typeof v === 'number') n = v;
    else if (typeof v === 'string') {
      const t = v.trim();
      if (t === '') return null;
      n = Number(t);
    } else return null;
    return Number.isFinite(n) && Math.floor(n) === n ? n : null;
  }

  // The first violated rule's message, or ''. `n` holds parsed numbers or null.
  function tierMessage(n) {
    if (n.hot === null || n.hot < 1 || n.hot > 90) return MSG_HOT;
    if (n.warm === null || n.warm < 1 || n.warm > 720) return MSG_WARM;
    if (n.warm <= n.hot) return MSG_WARM_ORDER;
    if (n.ret === null || n.ret < n.warm || n.ret > 3650) return MSG_RETENTION;
    if (n.gb === null || n.gb < 1 || n.gb > 500) return MSG_DAILY;
    return '';
  }

  function parseTier(inputs) {
    const d = tierDefaults();
    const src = inputs && typeof inputs === 'object' ? inputs : {};
    function pick(k) { return Object.prototype.hasOwnProperty.call(src, k) ? src[k] : d[k]; }
    return { hot: wholeNumber(pick('hotToWarmDays')), warm: wholeNumber(pick('warmToColdDays')), ret: wholeNumber(pick('retentionDays')), gb: wholeNumber(pick('dailyGB')) };
  }

  function money(n) {
    const parts = n.toFixed(2).split('.');
    return '$' + Shared.format.thousands(parts[0]) + '.' + parts[1];
  }

  function tierResult(inp) {
    const e = Engine.tieringCost({ hotToWarmDays: inp.hotToWarmDays, warmToColdDays: inp.warmToColdDays, retentionDays: inp.retentionDays, dailyGB: inp.dailyGB });
    return {
      monthlyCostText: money(e.monthlyCost),
      allHotText: money(e.allHotCost),
      allWarmText: money(e.allWarmCost),
      headlineText: e.savedVsWarmPct.toFixed(1) + '% saved versus keeping everything in warm storage',
      secondaryText: e.savedVsHotPct.toFixed(1) + '% saved versus keeping everything in hot storage',
      label: 'Illustrative figures for comparison, not vendor quotes'
    };
  }

  function tiering(inputs, previous) {
    const n = parseTier(inputs);
    const message = tierMessage(n);
    if (message === '') {
      const inp = { hotToWarmDays: n.hot, warmToColdDays: n.warm, retentionDays: n.ret, dailyGB: n.gb };
      return { inputs: inp, valid: true, message: '', result: tierResult(inp) };
    }
    const src = inputs && typeof inputs === 'object' ? inputs : {};
    const shown = tierDefaults();
    TIER_KEYS.forEach(function (k) { if (Object.prototype.hasOwnProperty.call(src, k)) shown[k] = src[k]; });
    return {
      inputs: shown, valid: false, message: message,
      result: previous && previous.result ? previous.result : tierResult(tierDefaults())
    };
  }

  function round1(x) { return Number(x.toFixed(1)); }

  // Hot, warm and cold spans in days; invalid inputs draw the policy defaults. Widths sum to 100 (cold takes the remainder).
  function tierBar(inputs) {
    const n = parseTier(inputs);
    const d = tierDefaults();
    const ok = tierMessage(n) === '';
    const hot = ok ? n.hot : d.hotToWarmDays;
    const warm = ok ? n.warm : d.warmToColdDays;
    const ret = ok ? n.ret : d.retentionDays;
    const days = [hot, warm - hot, ret - warm];
    const total = ret;
    const wHot = round1(days[0] / total * 100);
    const wWarm = round1(days[1] / total * 100);
    const widths = [wHot, wWarm, round1(100 - wHot - wWarm)];
    return ['hot', 'warm', 'cold'].map(function (t, i) { return { tier: t, days: days[i], widthPct: widths[i] }; });
  }

  const VENDOR_ROWS = ['Batch ingestion', 'Landing (Bronze)', 'Cleaning (Silver, Gold)', 'Quality gate'];

  function vendorSubset() {
    return {
      columns: ['Component', 'Databricks', 'Snowflake', 'Fabric'],
      rows: VENDOR_ROWS.map(function (name) {
        const row = Shared.vendor.rows.filter(function (r) { return r[0] === name; })[0];
        return row ? row.slice() : [name, '', '', ''];
      })
    };
  }

  vm.tiering = tiering;
  vm.tierBar = tierBar;
  vm.vendorSubset = vendorSubset;

  // ----- Task 11: combined view model -----

  function identifierText(row) {
    if (!row) return '';
    if (Object.prototype.hasOwnProperty.call(row, 'patient_id')) return cellText(row.patient_id);
    if (Object.prototype.hasOwnProperty.call(row, 'patientId')) return cellText(row.patientId);
    const k = Object.keys(row)[0];
    return k === undefined ? '' : cellText(row[k]);
  }

  // Pure: reads its input, builds new objects, never writes to them.
  function buildViewModel(input) {
    const inp = input || {};
    const scenario = inp.scenario;
    const step = inp.step;
    const actions = inp.actions || [];
    const state = inp.state || Engine.getState(scenario, actions);
    const inspect = inp.inspect || null;
    const hqLink = typeof inp.hqLink === 'string' ? inp.hqLink : '';
    const total = state.batchesRun || 0;
    const selected = inp.selectedBatch === null || inp.selectedBatch === undefined ? (total || null) : inp.selectedBatch;
    const raw = inp.tieringInputs && typeof inp.tieringInputs === 'object' ? inp.tieringInputs : {};
    const tier = tiering(raw, inp.tieringPrevious);
    const defaults = tierDefaults();
    const fields = {};
    TIER_KEYS.forEach(function (k) {
      fields[k] = Object.prototype.hasOwnProperty.call(raw, k) ? String(raw[k]) : String(defaults[k]);
    });
    const rv = inspect ? rowView(inspect).map(function (r) {
      return { index: r.index, pass: r.pass, failedTests: r.failedTests, identifier: identifierText((inspect.rows || [])[r.index]) };
    }) : null;
    return {
      scenario: scenario,
      header: header(state, scenario, step, hqLink),
      batches: {
        chips: batchChips(state, inp.selectedBatch === undefined ? null : inp.selectedBatch),
        decisionText: inspect ? (inspect.decision === 'PUBLISHED' ? 'Published' : 'Held at the gate') : ''
      },
      generation: generationPanel(state),
      landing: inspect ? landingZone(inspect) : null,
      matrix: testMatrix(inspect),
      gate: inspect ? gateDecision(inspect, state) : null,
      rowView: rv,
      dlq: dlqView(state, hqLink),
      medallion: medallion(state),
      storage: {
        inputs: tier.inputs, valid: tier.valid, message: tier.message, result: tier.result,
        tierBar: tierBar(raw), fields: fields, defaults: defaults
      },
      vendor: vendorSubset(),
      focus: inp.focus === undefined || inp.focus === null ? '' : String(inp.focus),
      notice: inp.notice || '',
      error: inp.error || '',
      selectedBatch: selected
    };
  }

  vm.buildViewModel = buildViewModel;
})();
