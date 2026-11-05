(function () {
  'use strict';
  const HQ = (globalThis.HQ = globalThis.HQ || {});
  const vm = (HQ.viewmodel = HQ.viewmodel || {});

  const GREEN = 'green', AMBER = 'amber', RED = 'red', GREY = 'grey';
  const WAIT = 'Waiting for first export';

  function chip(id, name, health, text) { return { id: id, name: name, health: health, text: text }; }

  function openEntries(state) {
    return (state.dlq || []).filter(function (d) { return d.status === 'open'; });
  }

  function generationChip(state) {
    if (!state.batchesRun) return chip(1, 'Generation', GREEN, 'Source ready');
    const latest = 'batch-' + state.batchesRun;
    const n = openEntries(state).filter(function (d) { return d.batchId === latest; }).length;
    return n > 0
      ? chip(1, 'Generation', AMBER, 'Source sent ' + n + ' malformed rows')
      : chip(1, 'Generation', GREEN, 'Source sent clean data');
  }

  function ingestionChip(state, ctx) {
    return state.batchesRun
      ? chip(2, 'Ingestion', GREEN, 'Landed ' + ctx.exportRows + ' rows unchanged')
      : chip(2, 'Ingestion', GREY, 'No export yet');
  }

  function processingChip(state) {
    if (!state.batchesRun) return chip(3, 'Processing', GREY, WAIT);
    const n = (state.staging || []).length;
    return n > 0
      ? chip(3, 'Processing', AMBER, n + ' rows held')
      : chip(3, 'Processing', GREEN, 'All rows published');
  }

  function storageChip(state) {
    return state.batchesRun
      ? chip(4, 'Storage', GREEN, state.productionRows + ' rows in production')
      : chip(4, 'Storage', GREY, WAIT);
  }

  function governanceChip(state) {
    const name = 'Governance';
    if (state.gate === 'OPEN') {
      const n = openEntries(state).length;
      return chip(5, name, RED, n > 0 ? 'Gate open: ' + n + ' rows to resolve' : 'Gate open: ready to retry');
    }
    if (state.gate === 'HALF_OPEN') return chip(5, name, AMBER, 'Trial batch pending');
    const acked = (state.alerts || []).some(function (a) { return a.status === 'acknowledged'; });
    return acked ? chip(5, name, AMBER, 'Alert acknowledged') : chip(5, name, GREEN, 'Gate closed');
  }

  function analysisChip() { return chip(6, 'Analysis/Modeling', GREY, 'Not in this slice'); }

  function visualizationChip(state) {
    const name = 'Visualization';
    if (!state.batchesRun) return chip(7, name, GREY, WAIT);
    const kpis = state.kpis || [];
    const withBatch = kpis.filter(function (k) { return k.asOfBatchId; })[0];
    const label = HQ.format.batchLabel(withBatch ? withBatch.asOfBatchId : 'batch-' + state.batchesRun);
    if (state.gate === 'HALF_OPEN') return chip(7, name, AMBER, 'KPIs at ' + label + ', trial batch pending');
    if (kpis.some(function (k) { return k.held; })) return chip(7, name, AMBER, 'KPIs held at ' + label);
    return chip(7, name, GREEN, 'KPIs current as of ' + label);
  }

  function archivingChip(ctx) {
    const t = ctx.tiering;
    return chip(8, 'Archiving/Retirement', GREY, 'Policy modeled, not live: hot to warm ' + t.hotToWarmDays +
      ' d, warm to cold ' + t.warmToColdDays + ' d, retention ' + t.retentionDays + ' d');
  }

  vm.stageChips = function stageChips(state, ctx) {
    return [
      generationChip(state), ingestionChip(state, ctx), processingChip(state), storageChip(state),
      governanceChip(state), analysisChip(), visualizationChip(state), archivingChip(ctx)
    ];
  };

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
      lastGoodBatchText: HQ.format.batchLabel(state.lastGoodBatchId)
    };
  };

  vm.kpiTiles = function kpiTiles(state) {
    const f = HQ.format;
    return (state.kpis || []).map(function (k) {
      const days = k.name === 'Avg Length of Stay';
      return {
        name: k.name,
        valueText: days ? f.days1(k.value) : f.fracPct1(k.value),
        deltaText: f.signedPct1(k.deltaPct),
        deltaDirection: k.deltaPct > 0 ? 'up' : k.deltaPct < 0 ? 'down' : 'flat',
        asOfText: 'as of ' + f.batchLabel(k.asOfBatchId) + ', ' + f.clockLabel(k.asOfIso),
        held: !!k.held
      };
    });
  };

  vm.todaySoFar = function todaySoFar(state) {
    const t = state.todaySoFar;
    return {
      label: t.label,
      note: t.note,
      observations: t.observations,
      abnormalCount: t.abnormalCount,
      rateText: HQ.format.pct1(t.abnormalVitalRate),
      notEvaluableText: t.notEvaluable > 0 ? t.notEvaluable + ' not evaluable' : null
    };
  };

  vm.DISCARD_REASONS = Object.freeze(['Missing patient ID', 'Physiologically impossible value',
    'Malformed or suspicious input', 'Wrong unit, source must resend', 'Other, see note']);

  function suggestedReason(d) {
    const tests = d.failedTests || [];
    const has = function (n) { return tests.indexOf(n) >= 0; };
    if (d.column === 'patient_id' && has('not_null')) return vm.DISCARD_REASONS[0];
    if (d.column === 'vital_value' && has('range')) return vm.DISCARD_REASONS[1];
    if (has('matches_pattern')) return vm.DISCARD_REASONS[2];
    if (d.column === 'unit' && (has('unit_matches_code') || has('accepted_values'))) return vm.DISCARD_REASONS[3];
    return vm.DISCARD_REASONS[4];
  }

  function observedText(v) { return v === null || v === undefined ? 'null' : JSON.stringify(v); }

  vm.incidentPanel = function incidentPanel(state) {
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
        return {
          dlqId: d.dlqId, failedTests: (d.failedTests || []).slice(), column: d.column,
          observedValueText: observedText(d.observedValue), reason: d.reason,
          suggestedReason: suggestedReason(d), repairable: !!d.repairable, status: d.status,
          canRepair: !!d.repairable && d.status === 'open', canDiscard: d.status === 'open'
        };
      }),
      discardReasons: vm.DISCARD_REASONS.slice(),
      canResolveRetry: gateOpen && open === 0,
      resolveRetryBlockedReason: gateOpen && open > 0
        ? open + (open === 1 ? ' DLQ row unresolved' : ' DLQ rows unresolved') : null
    };
  };

  vm.timeline = function timeline(state) {
    return (state.events || []).map(function (e) {
      return { iso: e.iso, timeText: HQ.format.clockLabel(e.iso), type: e.type, detail: e.detail };
    });
  };
})();
