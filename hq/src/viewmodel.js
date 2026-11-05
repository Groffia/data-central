(function () {
  'use strict';
  const HQ = (globalThis.HQ = globalThis.HQ || {});
  const vm = (HQ.viewmodel = HQ.viewmodel || {});

  const GREEN = 'green', AMBER = 'amber', RED = 'red', GREY = 'grey';
  const WAIT = 'Waiting for first export';

  function pl(n, one, many) { return Shared.format.plural(n, one, many); }

  function chip(id, name, health, text) { return { id: id, name: name, health: health, text: text }; }

  function openEntries(state) {
    return (state.dlq || []).filter(function (d) { return d.status === 'open'; });
  }

  function generationChip(state) {
    if (!state.batchesRun) return chip(1, 'Generation', GREEN, 'Source ready');
    const latest = 'batch-' + state.batchesRun;
    const n = openEntries(state).filter(function (d) { return d.batchId === latest; }).length;
    return n > 0
      ? chip(1, 'Generation', AMBER, 'Source sent ' + n + ' malformed ' + pl(n, 'row', 'rows'))
      : chip(1, 'Generation', GREEN, 'Source sent clean data');
  }

  function ingestionChip(state, ctx) {
    return state.batchesRun
      ? chip(2, 'Collection/Ingestion', GREEN, 'Landed ' + ctx.exportRows + ' ' + pl(ctx.exportRows, 'row', 'rows') + ' unchanged')
      : chip(2, 'Collection/Ingestion', GREY, 'No export yet');
  }

  function processingChip(state) {
    if (!state.batchesRun) return chip(3, 'Processing/Preparation', GREY, WAIT);
    const n = (state.staging || []).length;
    return n > 0
      ? chip(3, 'Processing/Preparation', AMBER, n + ' ' + pl(n, 'row', 'rows') + ' held')
      : chip(3, 'Processing/Preparation', GREEN, 'All rows published');
  }

  function storageChip(state) {
    return state.batchesRun
      ? chip(4, 'Storage', GREEN, state.productionRows + ' ' + pl(state.productionRows, 'row', 'rows') + ' in production')
      : chip(4, 'Storage', GREY, WAIT);
  }

  function governanceChip(state) {
    const name = 'Governance';
    if (state.gate === 'OPEN') {
      const n = openEntries(state).length;
      return chip(5, name, RED, n > 0 ? 'Gate open: ' + n + ' ' + pl(n, 'row', 'rows') + ' to resolve' : 'Gate open: ready to retry');
    }
    if (state.gate === 'HALF_OPEN') return chip(5, name, AMBER, 'Trial batch pending');
    const acked = (state.alerts || []).some(function (a) { return a.status === 'acknowledged'; });
    return acked ? chip(5, name, AMBER, 'Alert acknowledged') : chip(5, name, GREEN, 'Gate closed');
  }

  // Chip 6 shows the engine's expected-range verdict for the live sample (no logic here; the verdict text is the cue).
  const NO_DATA = 'Not enough data yet (fewer than 30 readings)';
  function analysisChip(state) {
    const check = Engine.liveSampleCheck(state);
    const verdict = check && typeof check.verdict === 'string' ? check.verdict : NO_DATA;
    const health = verdict === 'Within the expected range' ? GREEN : verdict === 'Above the expected range' ? AMBER : GREY;
    return chip(6, 'Analysis/Modeling', health, 'Expected-range check: ' + verdict);
  }

  function visualizationChip(state) {
    const name = 'Visualization';
    if (!state.batchesRun) return chip(7, name, GREY, WAIT);
    const kpis = state.kpis || [];
    const withBatch = kpis.filter(function (k) { return k.asOfBatchId; })[0];
    const label = Shared.format.batchLabel(withBatch ? withBatch.asOfBatchId : 'batch-' + state.batchesRun);
    if (state.gate === 'HALF_OPEN') return chip(7, name, AMBER, 'KPIs at ' + label + ', trial batch pending');
    if (kpis.some(function (k) { return k.held; })) return chip(7, name, AMBER, 'KPIs held at ' + label);
    return chip(7, name, GREEN, 'KPIs current as of ' + label);
  }

  function archivingChip(ctx) {
    const t = ctx.tiering;
    return chip(8, 'Archiving/Retirement', GREY, 'Policy modeled, not live: hot to warm ' + t.hotToWarmDays +
      ' d, warm to cold ' + t.warmToColdDays + ' d, retention ' + t.retentionDays + ' d');
  }

  // Deep link into the Pipeline page, or null when the page has no (usable) Pipeline base. `ui` carries scenario and actions.
  function pipelineLink(ui, ctx, focus) {
    const base = ctx && ctx.pipelineBase;
    if (!base || !ui || !HQ.links) return null;
    if (!HQ.links.focusOk(focus)) return null;
    return HQ.links.pipelineUrl(base, ui.scenario, ui.actions, focus, Engine);
  }

  // Deep link into the Value page, or null when the page has no (usable) Value base.
  function valueLink(ui, ctx, focus) {
    const base = ctx && ctx.valueBase;
    if (!base || !ui || !HQ.links) return null;
    if (!HQ.links.focusOk(focus)) return null;
    return HQ.links.valueUrl(base, ui.scenario, null, ui.actions, focus, Engine);
  }

  // Deep link into the Brain page, or null when the page has no (usable) Brain base.
  function brainLink(ui, ctx, focus) {
    const base = ctx && ctx.brainBase;
    if (!base || !ui || !HQ.links) return null;
    if (!HQ.links.focusOk(focus)) return null;
    return HQ.links.brainUrl(base, ui.scenario, ui.actions, focus, Engine);
  }

  vm.stageChips = function stageChips(state, ctx, ui) {
    const chips = [
      generationChip(state), ingestionChip(state, ctx), processingChip(state), storageChip(state),
      governanceChip(state), analysisChip(state), visualizationChip(state), archivingChip(ctx)
    ];
    const href = pipelineLink(ui, ctx, 'stage-storage');
    if (href) chips[3].href = href;
    const phi = brainLink(ui, ctx, 'stage-phi');
    if (phi) chips[4].href = phi;
    const check = valueLink(ui, ctx, 'stage-check');
    if (check) chips[5].href = check;
    const kpi = valueLink(ui, ctx, 'kpi-abnormal-vital-rate');
    if (kpi) chips[6].href = kpi;
    const retention = brainLink(ui, ctx, 'stage-retention');
    if (retention) chips[7].href = retention;
    return chips;
  };

  const TOO_LONG = 'State too long to link; opens at the nearest step.';
  // The one visible note while a link had to fall back to the nearest scripted step; null otherwise (no base, no links, no note).
  function linkNote(ui, ctx) {
    if (!ui || !ctx || !HQ.links) return null;
    const usable = HQ.links.safeBase(ctx.pipelineBase) || HQ.links.safeBase(ctx.valueBase) || HQ.links.safeBase(ctx.brainBase);
    return usable && HQ.links.tooLong(ui.scenario, ui.actions, Engine) ? TOO_LONG : null;
  }

  vm.statusRow = function statusRow(state) {
    const alerts = state.alerts || [];
    return {
      gate: state.gate === 'HALF_OPEN' ? 'HALF-OPEN' : state.gate,
      bronzeRows: state.bronzeRows,
      heldRows: (state.staging || []).length,
      productionRows: state.productionRows,
      dlqOpen: openEntries(state).length,
      dlqTotal: (state.dlq || []).length,
      openAlerts: alerts.filter(function (a) { return a.status !== 'resolved'; }).length,
      lastGoodBatchText: Shared.format.batchLabel(state.lastGoodBatchId)
    };
  };

  vm.glanceBanner = function glanceBanner(state) {
    const dlq = state.dlq || [];
    if (!dlq.length) return null;
    const n = Shared.format.batchLabel('batch-' + state.batchesRun);
    const m = Shared.format.batchLabel(state.lastGoodBatchId);
    if (state.gate === 'OPEN') {
      return { level: 'amber', text: 'Incident in progress: gate open at ' + n + ', production held at ' + m + '.' };
    }
    if (state.gate === 'HALF_OPEN') {
      return { level: 'amber', text: 'Incident in progress: gate half-open at ' + n + ', trial batch pending, production held at ' + m + '.' };
    }
    const b = Shared.format.batchLabel(dlq[dlq.length - 1].batchId);
    return { level: 'green', text: 'Last incident: caught at the gate on ' + b + '. No bad rows reached production.' };
  };

  function kpiId(name) { return 'kpi-' + String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }

  vm.kpiTiles = function kpiTiles(state, ctx, ui) {
    const f = Shared.format;
    return (state.kpis || []).map(function (k) {
      const days = k.name === 'Avg Length of Stay';
      const tile = {
        name: k.name,
        valueText: days ? f.days1(k.value) : f.fracPct1(k.value),
        deltaText: f.signedPct1(k.deltaPct),
        deltaDirection: k.deltaPct > 0 ? 'up' : k.deltaPct < 0 ? 'down' : 'flat',
        asOfText: 'as of ' + f.batchLabel(k.asOfBatchId) + ', ' + f.clockLabel(k.asOfIso),
        held: !!k.held
      };
      const href = valueLink(ui, ctx, kpiId(k.name));
      if (href) tile.href = href;
      return tile;
    });
  };

  vm.todaySoFar = function todaySoFar(state) {
    const t = state.todaySoFar;
    return {
      label: t.label,
      note: t.note,
      observations: t.observations,
      abnormalCount: t.abnormalCount,
      rateText: Shared.format.pct1(t.abnormalVitalRate),
      notEvaluableText: t.notEvaluable > 0 ? t.notEvaluable + ' not evaluable' : null
    };
  };

  function observedText(v) { return v === null || v === undefined ? 'null' : JSON.stringify(v); }

  vm.incidentPanel = function incidentPanel(state, ui, ctx) {
    const dlq = state.dlq || [], alerts = state.alerts || [];
    const a = alerts.length ? alerts[alerts.length - 1] : null;
    const open = openEntries(state).length;
    const gateOpen = state.gate === 'OPEN';
    return {
      visible: dlq.length > 0 || alerts.length > 0,
      alert: a ? {
        severity: a.severity, title: a.title, count: a.count, status: a.status,
        canAck: a.status === 'open',
        canResolve: a.status === 'open' || a.status === 'acknowledged'
      } : null,
      rows: dlq.map(function (d) {
        const row = {
          dlqId: d.dlqId, failedTests: (d.failedTests || []).slice(), column: d.column,
          observedValueText: observedText(d.observedValue), reason: d.reason,
          suggestedReason: Engine.suggestedReason(d), repairable: !!d.repairable, status: d.status,
          canRepair: !!d.repairable && d.status === 'open', canDiscard: d.status === 'open'
        };
        const href = pipelineLink(ui, ctx, d.dlqId);
        if (href) row.href = href;
        return row;
      }),
      discardReasons: Engine.DISCARD_REASONS.slice(),
      canResolveRetry: gateOpen && open === 0,
      resolveRetryBlockedReason: gateOpen && open > 0
        ? open + ' DLQ ' + pl(open, 'row', 'rows') + ' unresolved' : null
    };
  };

  vm.timeline = function timeline(state) {
    return (state.events || []).map(function (e) {
      return { iso: e.iso, timeText: Shared.format.clockLabel(e.iso), type: e.type, detail: e.detail };
    });
  };

  vm.businessCase = function businessCase(state) {
    const f = Shared.format;
    if (!(state.dlq || []).length) {
      return {
        hasIncident: false,
        placeholder: 'No incident yet. Switch to Incident to see what the gate prevents.',
        headline: null, columns: null, rowsStopped: null, droppedList: [], invalidList: [],
        timeToDetect: null, phiText: null, storage: null, secondary: null
      };
    }
    const b = state.businessCase;
    const dlq = state.dlq;
    const repaired = dlq.filter(function (d) { return d.status === 'repaired'; }).length;
    const discarded = dlq.filter(function (d) { return d.status === 'discarded'; }).length;
    // Engine v1.5 computes this (0 while the gate holds failing rows); older state shapes lack it, so fall back to 0.
    const invalidInProduction = typeof b.invalidRowsInProduction === 'number' ? b.invalidRowsInProduction : 0;
    const T = function (text) { return { text: text }; };
    const invalidLine = T(invalidInProduction + ' invalid ' + pl(invalidInProduction, 'reading', 'readings') + ' in production');
    if (invalidInProduction > 0) invalidLine.level = 'red';
    return {
      hasIncident: true,
      placeholder: null,
      headline: 'Without the gate: ' + b.rowsSilentlyDropped + ' ' + pl(b.rowsSilentlyDropped, 'row vanishes', 'rows vanish') +
        ' silently and ' + b.invalidRowsReachingDashboard + ' impossible ' +
        pl(b.invalidRowsReachingDashboard, 'reading reaches', 'readings reach') + ' the dashboard.',
      columns: {
        without: {
          title: 'Without this system',
          lines: [
            T(b.rowsSilentlyDropped + ' ' + pl(b.rowsSilentlyDropped, 'row vanishes', 'rows vanish') + ' silently'),
            T(b.invalidRowsReachingDashboard + ' impossible ' +
              pl(b.invalidRowsReachingDashboard, 'reading reaches', 'readings reach') + ' the dashboard'),
            T('Detected at the next scheduled review (assumed ' + b.hoursToDetectWithoutGate + ' hours, an assumption).')
          ]
        },
        with: {
          title: 'With this system',
          lines: [
            T(b.rowsStopped + ' ' + pl(b.rowsStopped, 'row', 'rows') + ' stopped at the batch'),
            invalidLine,
            T('Caught at the batch (at most ' + b.minutesToDetectWithGate + ' simulated minutes).'),
            T(repaired + ' repaired, ' + discarded + ' discarded with logged reasons')
          ]
        }
      },
      rowsStopped: b.rowsStopped,
      droppedList: (b.silentlyDroppedRows || []).map(function (r) { return { dlqId: r.dlqId, reason: r.reason }; }),
      invalidList: (b.invalidRowsListing || []).map(function (r) {
        return { dlqId: r.dlqId, summary: 'patient ' + r.patient_id + ', code ' + r.vital_code +
          ', value ' + r.vital_value + ' ' + r.unit };
      }),
      timeToDetect: {
        withGate: 'With the gate: caught at the batch (at most ' + b.minutesToDetectWithGate + ' simulated minutes).',
        withoutGate: 'Without it: next scheduled review, assumed ' + b.hoursToDetectWithoutGate + ' hours (an assumption).'
      },
      phiText: 'Rows containing PHI quarantined for review: ' + b.phiRowsQuarantined,
      storage: {
        headline: f.pct1(b.storageSavedVsWarmPct) + ' saved versus keeping everything in warm storage',
        secondary: f.pct1(b.storageSavedVsHotPct) + ' saved versus keeping everything in hot storage',
        label: 'Illustrative figures for comparison, not vendor quotes'
      },
      secondary: 'Abnormal Vital Rate change measured on ' + f.batchLabel(b.distortionBatchId) +
        ' under naive rules (rows without a usable patient ID dropped at the join): ' +
        f.signedPts1(b.distortionAvoidedPts) + ' (secondary)'
    };
  };

  // Rows added to the shared constant for other pages (Dashboards, stage 7 on the Value page; Access and audit log, stage 5 on the Brain page) are left out of HQ.
  const VENDOR_EXCLUDED = ['Dashboards', 'Access and audit log'];

  vm.vendorTable = function vendorTable() {
    return {
      columns: ['Component', 'Databricks', 'Snowflake', 'Fabric'],
      rows: Shared.vendor.rows.filter(function (r) { return VENDOR_EXCLUDED.indexOf(r[0]) < 0; }).map(function (r) { return r.slice(); })
    };
  };

  vm.buildViewModel = function buildViewModel(state, ui, ctx) {
    const u = ui || {};
    return {
      banner: vm.glanceBanner(state),
      chips: vm.stageChips(state, ctx, u),
      status: vm.statusRow(state),
      tiles: vm.kpiTiles(state, ctx, u),
      today: vm.todaySoFar(state),
      incident: vm.incidentPanel(state, u, ctx),
      timeline: vm.timeline(state),
      business: vm.businessCase(state),
      vendor: vm.vendorTable(),
      scenario: u.scenario === undefined ? null : u.scenario,
      notice: u.notice === undefined ? null : u.notice,
      linkNote: linkNote(u, ctx),
      error: u.error === undefined ? null : u.error
    };
  };
})();
