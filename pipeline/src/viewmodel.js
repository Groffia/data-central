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
})();
