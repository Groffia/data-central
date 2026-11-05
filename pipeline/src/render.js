(function () {
  'use strict';
  globalThis.Pipeline = globalThis.Pipeline || {};
  const esc = function (v) { return Shared.escape.esc(v); };
  const TIER_FIELDS = [
    ['hotToWarmDays', 'Hot to warm (days)'],
    ['warmToColdDays', 'Warm to cold (days)'],
    ['retentionDays', 'Retention (days)'],
    ['dailyGB', 'Daily volume (GB)']
  ];
  const NO_BATCH = 'No batch has run yet';

  function attr(name, value) { return ' ' + name + '="' + esc(value) + '"'; }

  function button(label, cmd, opts) {
    const o = opts || {};
    return '<button type="button"' + attr('data-cmd', cmd) +
      (o.n !== undefined ? attr('data-n', o.n) : '') +
      (o.scenario !== undefined ? attr('data-scenario', o.scenario) : '') +
      (o.pressed !== undefined ? attr('aria-pressed', o.pressed ? 'true' : 'false') : '') +
      (o.disabled ? ' disabled' : '') + '>' + esc(label) + '</button>';
  }

  // Allowlist: only a scheme-less relative URL of safe characters. Any ASCII control character or space
  // (browsers ignore tab, LF and CR inside a scheme) rejects the value; so do a scheme, "//", or over 2000 characters.
  function safeHref(href) {
    if (typeof href !== 'string' || href === '' || href.length > 2000) return '';
    if (href.replace(/[\u0000-\u0020\u007f]/g, '') !== href) return '';
    if (!/^[A-Za-z0-9_.\/?&=%#+~:-]*$/.test(href)) return '';
    if (href.indexOf('//') === 0) return '';
    const colon = href.indexOf(':');
    if (colon >= 0) {
      const stop = href.search(/[\/?#]/);
      if (stop < 0 || colon < stop) return '';
    }
    return href;
  }

  function th(text) { return '<th scope="col">' + esc(text) + '</th>'; }
  function wrap(html) { return '<div class="table-wrap">' + html + '</div>'; }
  function table(cls, headCells, bodyRows) {
    return wrap('<table class="' + cls + '"><thead><tr>' + headCells.join('') + '</tr></thead><tbody>' + bodyRows.join('') + '</tbody></table>');
  }
  function heading(stage, name) {
    return (stage ? '<p class="stage-label">' + esc(stage) + '</p>' : '') + '<h2>' + esc(name) + '</h2>';
  }
  function empty(text) { return '<p class="placeholder">' + esc(text) + '</p>'; }

  function header(vm) {
    const h = vm.header;
    const s = h.steps;
    const link = safeHref(h.hqHref);
    return '<h1>' + esc(h.title) + '</h1>' +
      '<p class="subtitle">' + esc(h.subtitle) + '</p>' +
      '<div class="header-controls">' +
      '<div class="scenario-switch" role="group" aria-label="Scenario">' +
      button('Healthy', 'scenario', { scenario: 'healthy', pressed: vm.scenario === 'healthy' }) +
      button('Incident', 'scenario', { scenario: 'incident', pressed: vm.scenario === 'incident' }) +
      '</div>' +
      '<div class="stepper" role="group" aria-label="Stepper">' +
      button('Back', 'back', { disabled: !h.canBack }) +
      '<span class="step-label">' + esc(typeof s.label === 'string' ? s.label : 'Step ' + s.n + ' of ' + s.m) + '</span>' +
      button('Next', 'next', { disabled: !h.canNext }) +
      '</div>' +
      (link ? '<a class="hq-link"' + attr('href', link) + '>Open this state in HQ</a>' : '') +
      '</div>' +
      '<p class="step-text" aria-live="polite">' + esc(s.text) + '</p>';
  }

  function batches(vm) {
    const b = vm.batches;
    if (!b.chips.length) return '<h2>Batches</h2>' + empty(NO_BATCH);
    return '<h2>Batches</h2><div class="batch-chips" role="group" aria-label="Batch picker">' +
      b.chips.map(function (c) {
        return button(c.label, 'batch', { n: c.n, pressed: c.selected });
      }).join('') + '</div>' +
      (b.decisionText ? '<p class="batch-decision">' + esc(b.decisionText) + '</p>' : '');
  }

  function dl(items) {
    return '<dl class="facts">' + items.map(function (i) {
      return '<div class="stat"><dt>' + esc(i[0]) + '</dt><dd>' + esc(i[1]) + '</dd></div>';
    }).join('') + '</dl>';
  }

  function generation(vm) {
    const g = vm.generation;
    const f = g.facility;
    const names = g.contractRows.map(function (r) { return r.name; });
    return heading('Stage 1', 'Generation') +
      '<p>' + esc(g.source) + '</p><p class="caption">' + esc(g.cadence) + '</p>' +
      '<h3>Contract</h3>' +
      table('contract-table', ['Name', 'Type', 'Rule', 'Sensitive'].map(th), g.contractRows.map(function (r) {
        return '<tr><td>' + esc(r.name) + '</td><td>' + esc(r.type) + '</td><td><code>' + esc(r.rule) + '</code></td><td>' +
          (r.sensitive ? 'Yes' : 'No') + '</td></tr>';
      })) +
      '<h3>Golden rows</h3>' +
      table('golden-table', names.map(th), g.goldenRows.map(function (row) {
        return '<tr>' + names.map(function (n) { return '<td>' + esc(row[n]) + '</td>'; }).join('') + '</tr>';
      })) +
      '<h3>Facility scale</h3>' +
      dl([['Beds', f.beds], ['Patients', f.patients], ['Per day', f.perDay], ['Per 15 minutes', f.per15],
        ['Per month', f.perMonth], ['Row size', f.bytesPerRow], ['Volume', f.bytesPerMonth]]) +
      '<p class="note-line">' + esc(f.note) + '</p>';
  }

  function landing(vm) {
    const l = vm.landing;
    if (!l) return heading('Stage 2', 'Collection/Ingestion') + empty(NO_BATCH);
    const fa = l.facts;
    return heading('Stage 2', 'Collection/Ingestion') +
      '<h3>Landing zone (Bronze)</h3>' +
      dl([['Batch', fa.batchId], ['Run time', fa.runTimeText], ['Rows', fa.rowCountText], ['Table', fa.table]]) +
      '<p class="caption">Raw data is kept exactly as received so it can always be replayed.</p>' +
      (l.driftNote ? '<p class="drift-note">' + esc(l.driftNote) + '</p>' : '') +
      table('landing-table', l.columns.map(th), l.rows.map(function (r) {
        return '<tr' + (r.drift ? ' data-drift="true"' : '') + '>' + r.cells.map(function (c) {
          return '<td' + (c.drift ? ' data-drift="true"' : '') + '>' + esc(c.text) + '</td>';
        }).join('') + '</tr>';
      }));
  }

  function matrix(vm) {
    const m = vm.matrix;
    const head = heading('Stage 3', 'Processing/Preparation') + '<h3>Quality-test matrix</h3>';
    if (!vm.landing && !m.rows.length) return head + empty(NO_BATCH);
    return head +
      '<p class="caption">Rows that fail an error test go to the <a href="#region-dlq">dead-letter queue</a> below. Warn tests are shown but never quarantine a row.</p>' +
      table('matrix-table', ['Test', 'Column', 'Severity', 'Failing rows', 'Which rows'].map(th), m.rows.map(function (r) {
        const which = r.failing === 0 ? '' : '<details><summary>Show rows</summary>' +
          esc(r.rowIndexes.map(function (i) { return 'Row ' + (i + 1); }).join(', ')) + '</details>';
        return '<tr' + attr('data-severity', r.severity) + (r.failing ? ' data-failing="true"' : '') + '><td>' + esc(r.test) + '</td><td>' +
          esc(r.column) + '</td><td>' + esc(r.severity) + '</td><td>' + esc(r.failing) + '</td><td>' + which + '</td></tr>';
      })) +
      m.notes.map(function (n) { return '<p class="note">' + esc(n) + '</p>'; }).join('') +
      (vm.gate ? '<p class="gate-decision"' + attr('data-level', vm.gate.level) + '>' + esc(vm.gate.text) + '</p>' : '');
  }

  function rows(vm) {
    const rv = vm.rowView;
    if (!rv) return '<h3>Row view</h3>' + empty(NO_BATCH);
    return '<h3>Row view</h3>' +
      table('row-table', ['Row', 'Patient', 'Result', 'Failed tests'].map(th), rv.map(function (r) {
        return '<tr' + attr('data-pass', r.pass ? 'true' : 'false') + '><td>' + esc(r.index + 1) + '</td><td>' + esc(r.identifier) +
          '</td><td>' + (r.pass ? 'Pass' : 'Fail') + '</td><td>' + esc(r.failedTests.join(', ')) +
          (r.warnTests && r.warnTests.length ? (r.failedTests.length ? ' ' : '') + '<span class="muted">warn: ' + esc(r.warnTests.join(', ')) + '</span>' : '') + '</td></tr>';
      }));
  }

  function dlq(vm) {
    const head = '<h3>Dead-letter queue</h3>';
    if (!vm.dlq.length) return head + empty('The dead-letter queue is empty.');
    return head + table('dlq-table', ['Id', 'Failed tests', 'Column', 'Observed value', 'Reason', 'Repairable', 'Status', 'Action'].map(th),
      vm.dlq.map(function (d) {
        const href = safeHref(d.hqHref);
        const link = href && d.status === 'open' ? '<a' + attr('href', href) + '>Handle in HQ</a>' : '';
        return '<tr' + attr('id', d.anchor) + (vm.focus && vm.focus === d.anchor ? ' data-focus="true"' : '') + attr('data-status', d.status) + '>' +
          '<td>' + esc(d.id) + '</td><td>' + esc(d.failedTests.join(', ')) + '</td><td>' + esc(d.column) + '</td>' +
          '<td><code>' + esc(d.observedValueText) + '</code></td><td>' + esc(d.reason) + '</td>' +
          '<td>' + (d.repairable ? 'Yes' : 'No') + '</td><td>' + esc(d.status) + '</td><td>' + link + '</td></tr>';
      }));
  }

  function medallion(vm) {
    const m = vm.medallion;
    return '<h3>Medallion flow</h3>' +
      dl([[m.labels.bronze, m.texts.bronze], [m.labels.staging, m.texts.staging], [m.labels.silver, m.texts.silver]]) +
      '<p>Bronze table <code>' + esc(m.bronzeTable) + '</code>, Silver table <code>' + esc(m.silverTable) + '</code></p>' +
      '<p>' + esc(m.gold.text) + '</p>' +
      '<p>Gold tables: ' + m.gold.tables.map(function (t) { return '<code>' + esc(t) + '</code>'; }).join(', ') + '</p>';
  }

  function tierBar(bar) {
    return '<div class="tier-bar" role="img"' + attr('aria-label', bar.map(function (s) { return s.tier + ' ' + s.days + ' days'; }).join(', ')) + '>' +
      bar.map(function (s) {
        return '<span class="tier tier-' + esc(s.tier) + '" style="width:' + esc(s.widthPct.toFixed(1)) + '%">' +
          esc(s.tier + ' ' + s.days + ' d') + '</span>';
      }).join('') + '</div>';
  }

  function storage(vm) {
    const s = vm.storage;
    const r = s.result;
    const fields = TIER_FIELDS.map(function (f) {
      const k = f[0];
      return '<div class="tier-field"><label' + attr('for', 'field-' + k) + '>' + esc(f[1]) + '</label>' +
        '<input type="text" inputmode="numeric"' + attr('id', 'field-' + k) + attr('data-field', k) + attr('value', s.fields[k]) +
        (s.valid ? '' : ' aria-describedby="tier-message"') + '>' +
        '<span class="default">' + esc('Policy default: ' + s.defaults[k]) + '</span></div>';
    }).join('');
    return '<div id="stage-storage"' + (vm.focus === 'stage-storage' ? ' data-focus="true"' : '') + '>' +
      heading('Stage 4', 'Storage') + '<h3>Tiering model (illustrative)</h3>' +
      '<div class="tier-inputs">' + fields + '</div>' +
      '<div class="tier-actions">' + button('Reset to policy defaults', 'resetTiering') + '</div>' +
      (s.valid ? '' : '<p id="tier-message" class="error" role="alert">' + esc(s.message) + '</p>') +
      tierBar(s.tierBar) +
      dl([['Monthly cost', r.monthlyCostText], ['All hot', r.allHotText], ['All warm', r.allWarmText]]) +
      '<p class="storage-headline">' + esc(r.headlineText) + '</p>' +
      '<p class="storage-secondary">' + esc(r.secondaryText) + '</p>' +
      '<p class="storage-label">' + esc(r.label) + '</p></div>';
  }

  function vendor(vm) {
    const v = vm.vendor;
    return '<h2>In production this is…</h2>' + table('vendor-table', v.columns.map(th), v.rows.map(function (row) {
      return '<tr>' + row.map(function (cell, i) {
        return i === 0 ? '<th scope="row">' + esc(cell) + '</th>' : '<td>' + esc(cell) + '</td>';
      }).join('') + '</tr>';
    }));
  }

  function notice(vm) {
    return (vm.notice ? '<p class="notice" role="status">' + esc(vm.notice) + '</p>' : '') +
      (vm.error ? '<p class="error" role="alert">' + esc(vm.error) + '</p>' : '');
  }

  function footer() {
    return '<p>' + esc('All data is synthetic and generated deterministically (seed 42). Company names are fictional.') + '</p>';
  }

  globalThis.Pipeline.render = {
    renderRegions: function renderRegions(vm) {
      return {
        header: header(vm), batches: batches(vm), generation: generation(vm), landing: landing(vm), matrix: matrix(vm),
        rows: rows(vm), dlq: dlq(vm), medallion: medallion(vm), storage: storage(vm), vendor: vendor(vm),
        notice: notice(vm), footer: footer()
      };
    }
  };
})();
