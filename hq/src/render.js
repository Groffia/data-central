(function () {
  'use strict';
  const HQ = (globalThis.HQ = globalThis.HQ || {});
  const esc = function (v) { return HQ.escape.esc(v); };

  let forceDisabled = false;

  function attr(name, value) { return ' ' + name + '="' + esc(value) + '"'; }

  function button(label, cmd, opts) {
    const o = opts || {};
    return '<button type="button"' + attr('data-cmd', cmd) +
      (o.dlqId !== undefined ? attr('data-dlq-id', o.dlqId) : '') +
      (o.scenario !== undefined ? attr('data-scenario', o.scenario) : '') +
      (o.pressed !== undefined ? attr('aria-pressed', o.pressed ? 'true' : 'false') : '') +
      (o.disabled || forceDisabled ? ' disabled' : '') + '>' + esc(label) + '</button>';
  }

  function scenarioButton(label, name, current) {
    return button(label, 'scenario', { scenario: name, pressed: current === name });
  }

  function header(vm) {
    return '<h1>' + esc('HQ: Data Platform Control Room') + '</h1>' +
      '<p class="subtitle">' + esc('Stargate Healthcare, synthetic hospital data platform') + '</p>' +
      '<div class="header-controls">' +
      '<div class="scenario-switch" role="group" aria-label="Scenario">' +
      scenarioButton('Healthy', 'healthy', vm.scenario) + scenarioButton('Incident', 'incident', vm.scenario) +
      '</div>' +
      '<div class="watch-controls">' + button('Watch', 'watch') + button('Watch full version', 'watchFull') + '</div>' +
      '</div>';
  }

  function banner(vm) {
    const b = vm.banner;
    return b ? '<div class="banner"' + attr('data-level', b.level) + '>' + esc(b.text) + '</div>' : '';
  }

  function stages(vm) {
    return '<ol class="stage-strip">' + vm.chips.map(function (c) {
      return '<li class="chip"' + attr('data-health', c.health) + attr('data-stage', c.id) + '>' +
        '<span class="dot" aria-hidden="true"></span>' +
        '<span class="chip-name">' + esc(c.id + ' ' + c.name) + '</span>' +
        '<span class="chip-text">' + esc(c.text) + '</span></li>';
    }).join('') + '</ol>';
  }

  function stat(label, value) {
    return '<div class="stat"><dt>' + esc(label) + '</dt><dd>' + esc(value) + '</dd></div>';
  }

  function status(vm) {
    const s = vm.status;
    return '<dl class="status-row">' +
      '<div class="stat gate"' + attr('data-gate', s.gate) + '><dt>Gate</dt><dd><span class="gate-badge">' + esc(s.gate) + '</span></dd></div>' +
      stat('Rows in Bronze', s.bronzeRows) + stat('Rows held', s.heldRows) +
      stat('Rows in production', s.productionRows) +
      stat('Dead-letter rows', s.dlqOpen + ' open of ' + s.dlqTotal) +
      stat('Open alerts', s.openAlerts) + stat('Last good batch', s.lastGoodBatchText) +
      '</dl>';
  }

  function tiles(vm) {
    return '<div class="tiles">' + vm.tiles.map(function (t) {
      return '<article class="tile"' + attr('data-held', t.held ? 'true' : 'false') + '>' +
        '<h3>' + esc(t.name) + '</h3>' +
        '<p class="tile-value">' + esc(t.valueText) + '</p>' +
        '<p class="tile-delta"' + attr('data-direction', t.deltaDirection) + '>' + esc(t.deltaText) + ' vs prior 7 days</p>' +
        '<p class="tile-asof">' + esc(t.asOfText) + '</p>' +
        (t.held ? '<span class="badge badge-held">Held</span>' : '') +
        '</article>';
    }).join('') + '</div>';
  }

  function today(vm) {
    const t = vm.today;
    return '<h2>Today so far</h2>' +
      '<p class="caption">' + esc(t.label) + '</p>' +
      '<p class="note">' + esc(t.note) + '</p>' +
      '<dl class="today-stats">' +
      stat(HQ.format.plural(t.observations, 'Observation', 'Observations'), t.observations) + stat('Abnormal', t.abnormalCount) + stat('Abnormal rate', t.rateText) +
      (t.notEvaluableText ? stat('Not evaluable', t.notEvaluableText) : '') +
      '</dl>';
  }

  function controls(vm) {
    return '<div class="run-controls">' + button('Run next batch', 'run') + button('Reset', 'reset') + '</div>' +
      '<div class="playback-controls" role="group" aria-label="Auto-play">' + button('Pause', 'pause') +
      button('Resume', 'resume') + button('Skip scene', 'skip') + button('Stop', 'stop') + '</div>';
  }

  function alertCard(a) {
    if (!a) return '';
    return '<div class="alert-card"' + attr('data-severity', a.severity) + attr('data-status', a.status) + '>' +
      '<span class="badge badge-sev">' + esc(a.severity) + '</span> ' +
      '<strong>' + esc(a.title) + '</strong>' +
      '<span class="alert-meta"> Count ' + esc(a.count) + ', status ' + esc(a.status) + '</span>' +
      '<div class="alert-actions">' + button('Acknowledge', 'ack', { disabled: !a.canAck }) +
      button('Resolve', 'resolveAlert', { disabled: !a.canResolve }) + '</div></div>';
  }

  function reasonSelect(row, reasons) {
    return '<select data-role="discard-reason"' + attr('data-dlq-id', row.dlqId) + ' aria-label="Discard reason">' +
      reasons.map(function (r) {
        return '<option' + attr('value', r) + (r === row.suggestedReason ? ' selected' : '') + '>' + esc(r) + '</option>';
      }).join('') + '</select>';
  }

  function dlqRow(row, reasons) {
    const open = row.status === 'open';
    return '<tr' + attr('data-dlq-id', row.dlqId) + attr('data-status', row.status) + '>' +
      '<td>' + esc(row.dlqId) + '</td>' +
      '<td>' + esc(row.failedTests.join(', ')) + '</td>' +
      '<td>' + esc(row.column) + '</td>' +
      '<td><code>' + esc(row.observedValueText) + '</code></td>' +
      '<td>' + esc(row.reason) + '</td>' +
      '<td>' + (row.repairable ? 'Yes' : 'No') + '</td>' +
      '<td>' + esc(row.status) + '</td>' +
      '<td class="row-actions">' +
      button('Repair', 'repair', { dlqId: row.dlqId, disabled: !row.canRepair }) +
      (open ? reasonSelect(row, reasons) : '') +
      button('Discard', 'discard', { dlqId: row.dlqId, disabled: !row.canDiscard }) +
      '</td></tr>';
  }

  function incident(vm) {
    const p = vm.incident;
    if (!p.visible) return '';
    return '<h2>Incident</h2>' + alertCard(p.alert) +
      '<div class="table-wrap"><table class="dlq-table"><thead><tr>' +
      ['Id', 'Failed test', 'Column', 'Observed value', 'Reason', 'Repairable', 'Status', 'Actions'].map(function (h) {
        return '<th scope="col">' + esc(h) + '</th>';
      }).join('') + '</tr></thead><tbody>' +
      p.rows.map(function (r) { return dlqRow(r, p.discardReasons); }).join('') +
      '</tbody></table></div>' +
      '<div class="resolve-retry">' + button('Resolve and retry', 'resolveRetry', { disabled: !p.canResolveRetry }) +
      (p.resolveRetryBlockedReason ? '<p class="blocked-reason" role="status">' + esc(p.resolveRetryBlockedReason) + '</p>' : '') +
      '</div>';
  }

  function timeline(vm) {
    return '<h2>Event timeline</h2><ol class="timeline">' + vm.timeline.map(function (e) {
      return '<li><time' + attr('datetime', e.iso) + '>' + esc(e.timeText) + '</time> ' +
        '<span class="event-type">' + esc(e.type) + '</span> ' + esc(e.detail) + '</li>';
    }).join('') + '</ol>';
  }

  function bizCol(cls, col) {
    return '<section class="biz-col ' + cls + '"><h3>' + esc(col.title) + '</h3><ul>' +
      col.lines.map(function (l) {
        return (l.level === 'red' ? '<li class="biz-alert" data-level="red">' : '<li>') + esc(l.text) + '</li>';
      }).join('') + '</ul></section>';
  }

  function business(vm) {
    const b = vm.business;
    const head = '<h2>Business case</h2>';
    if (!b.hasIncident) return head + '<p class="placeholder">' + esc(b.placeholder) + '</p>';
    const dropped = b.droppedList.map(function (r) {
      return '<li>' + esc(r.dlqId) + ': ' + esc(r.reason) + '</li>';
    }).join('');
    const invalid = b.invalidList.map(function (r) {
      return '<li>' + esc(r.dlqId) + ': ' + esc(r.summary) + '</li>';
    }).join('');
    return head +
      '<p class="headline">' + esc(b.headline) + '</p>' +
      '<div class="biz-columns">' + bizCol('biz-without', b.columns.without) + bizCol('biz-with', b.columns.with) + '</div>' +
      '<details><summary>Rows that would vanish silently</summary><ul>' + dropped + '</ul></details>' +
      '<details><summary>Impossible readings that would reach the dashboard</summary><ul>' + invalid + '</ul></details>' +
      '<p>' + esc(b.phiText) + '</p>' +
      '<p class="storage-headline">' + esc(b.storage.headline) + '</p>' +
      '<p class="storage-secondary">' + esc(b.storage.secondary) + '</p>' +
      '<p class="storage-label">' + esc(b.storage.label) + '</p>' +
      '<details><summary>Secondary detail</summary><p>' + esc(b.secondary) + '</p></details>';
  }

  function vendor(vm) {
    const v = vm.vendor;
    return '<h2>In production this is…</h2><div class="table-wrap"><table class="vendor-table"><thead><tr>' +
      v.columns.map(function (c) { return '<th scope="col">' + esc(c) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + v.rows.map(function (r) {
        return '<tr>' + r.map(function (cell, i) {
          return i === 0 ? '<th scope="row">' + esc(cell) + '</th>' : '<td>' + esc(cell) + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>';
  }

  function notice(vm) {
    return (vm.notice ? '<p class="notice" role="status">' + esc(vm.notice) + '</p>' : '') +
      (vm.error ? '<p class="error" role="alert">' + esc(vm.error) + '</p>' : '');
  }

  function footer() {
    return '<p>' + esc('All data is synthetic and generated deterministically (seed 42). Company names are fictional.') + '</p>';
  }

  HQ.render = {
    renderRegions: function renderRegions(vm) {
      forceDisabled = !!vm.error;
      try { return {
        header: header(vm), banner: banner(vm), stages: stages(vm), status: status(vm), tiles: tiles(vm), today: today(vm),
        controls: controls(vm), incident: incident(vm), timeline: timeline(vm), business: business(vm),
        vendor: vendor(vm), notice: notice(vm), footer: footer()
      }; } finally { forceDisabled = false; }
    }
  };
})();
