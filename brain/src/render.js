(function () {
  'use strict';
  const Brain = (globalThis.Brain = globalThis.Brain || {});
  const esc = function (v) { return globalThis.Shared.escape.esc(v); };

  function attr(name, value) { return ' ' + name + '="' + esc(value) + '"'; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function obj(v) { return v && typeof v === 'object' ? v : {}; }

  // opts: data (map of data-* name -> value), pressed, disabled, label (aria-label), expanded
  function button(text, cmd, opts) {
    const o = opts || {};
    let h = '<button type="button"' + attr('data-cmd', cmd);
    Object.keys(o.data || {}).forEach(function (k) { h += attr('data-' + k, o.data[k]); });
    if (o.label !== undefined) h += attr('aria-label', o.label);
    if (o.pressed !== undefined) h += attr('aria-pressed', o.pressed ? 'true' : 'false');
    if (o.expanded !== undefined) h += attr('aria-expanded', o.expanded ? 'true' : 'false');
    if (o.disabled) h += ' disabled';
    return h + '>' + esc(text) + '</button>';
  }

  // Allowlist: only a scheme-less relative URL of safe characters. Any ASCII control character or space
  // (browsers ignore tab, LF and CR inside a scheme) rejects the value; so do a scheme, "//", or over 2000 characters.
  function safeHref(href) {
    if (typeof href !== 'string' || href === '' || href.length > 2000) return '';
    if (href.replace(/[\u0000- \u007f]/g, '') !== href) return '';
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
  function table(cls, heads, rows) {
    return wrap('<table class="' + esc(cls) + '"><thead><tr>' + heads.map(th).join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table>');
  }
  function heading(stage, name) {
    return (stage ? '<p class="stage-label">' + esc(stage) + '</p>' : '') + '<h2>' + esc(name) + '</h2>';
  }
  function empty(text) { return '<p class="placeholder">' + esc(text) + '</p>'; }
  function plural(n, one, many) { return globalThis.Shared.format.plural(n, one, many); }

  // ----- header -----

  function header(vm) {
    const h = obj(vm && vm.header);
    const s = obj(h.steps);
    const sc = h.scenario === 'incident' ? 'incident' : 'healthy';
    const label = typeof s.label === 'string' ? s.label : 'Step ' + s.n + ' of ' + s.m;
    const hq = safeHref(h.hqHref);
    const pl = safeHref(h.pipelineHref);
    return '<h1>' + esc(h.title) + '</h1>' +
      '<p class="subtitle">' + esc(h.subtitle) + '</p>' +
      '<div class="header-controls">' +
      '<div class="scenario-switch" role="group" aria-label="Scenario">' +
      button('Healthy', 'scenario', { data: { value: 'healthy' }, pressed: sc === 'healthy' }) +
      button('Incident', 'scenario', { data: { value: 'incident' }, pressed: sc === 'incident' }) +
      '</div>' +
      '<div class="stepper" role="group" aria-label="Stepper">' +
      button('Back', 'back', { disabled: !h.canBack }) +
      '<span class="step-label">' + esc(label) + '</span>' +
      button('Next', 'next', { disabled: !h.canNext }) +
      '</div>' +
      (hq ? '<a class="hq-link"' + attr('href', hq) + '>Open this state in HQ</a>' : '') +
      (pl ? '<a class="pipeline-link"' + attr('href', pl) + '>Open this state in Pipeline</a>' : '') +
      '</div>' +
      '<p class="step-text">' + esc(s.text) + '</p>';
  }

  // ----- A: data contract and ownership -----

  function contract(vm) {
    const c = obj(vm && vm.contract);
    const fields = arr(c.fields).map(function (f) {
      return '<tr><th scope="row">' + esc(f.name) + '</th><td>' + esc(f.type) + '</td><td>' + esc(f.rule) + '</td><td>' + esc(f.sensitiveText) + '</td></tr>';
    });
    const owners = arr(c.owners).map(function (o) {
      return '<tr><th scope="row">' + esc(o.layer) + '</th><td>' + esc(o.objects) + '</td><td>' + esc(o.owner) + '</td></tr>';
    });
    return '<span id="stage-contract"></span>' +
      heading(c.stage, c.title || 'Data contract and ownership') +
      table('contract-table', ['Field', 'Type', 'Rule', 'Sensitive (PHI)'], fields) +
      '<p class="caption">' + esc('Primary key: ' + arr(c.primaryKey).join(', ') + '. Entity field: ' + (c.entityField || '') + '.') + '</p>' +
      '<h3>Owners</h3>' +
      table('owners-table', ['Layer', 'Objects', 'Owner'], owners);
  }

  // ----- B: sensitive fields and quarantine -----

  function phi(vm) {
    const p = obj(vm && vm.phi);
    const rows = arr(p.rows).map(function (r) {
      return '<tr><th scope="row">' + esc(r.id) + '</th><td>' + esc(r.batch) + '</td><td>' + esc(r.status) + '</td><td>' + esc(r.fieldsText) + '</td></tr>';
    });
    const n = typeof p.holdingCount === 'number' ? p.holdingCount : 0;
    return '<span id="stage-phi"></span>' +
      heading(p.stage, p.title || 'Sensitive fields and quarantine') +
      '<p class="phi-summary">' + esc(p.summaryText) + '</p>' +
      '<p class="caption">' + esc('Sensitive fields: ' + arr(p.sensitiveFields).join(', ')) + '</p>' +
      (rows.length
        ? '<p>' + esc(n + ' quarantined ' + plural(n, 'row holds', 'rows hold') + ' sensitive fields (names only, never values)') + '</p>' +
          table('quarantine-table', ['Row', 'Batch', 'Status', 'Sensitive fields held'], rows)
        : empty(p.emptyText)) +
      '<p class="note">' + esc(p.note) + '</p>';
  }

  // ----- D: access log -----

  function access(vm) {
    const a = obj(vm && vm.access);
    const rows = arr(a.rows).map(function (r) {
      return '<tr><td>' + esc(r.time) + '</td><td>' + esc(r.actor) + '</td><td>' + esc(r.action) + '</td><td>' + esc(r.object) + '</td><td>' + esc(r.rowsText) +
        '</td><td>' + esc(r.fieldsText) + '</td><td>' + esc(r.purpose) + '</td></tr>';
    });
    return '<span id="stage-access"></span>' +
      heading(a.stage, a.title || 'Access log') +
      '<p class="caption">' + esc(a.label) + '</p>' +
      (rows.length ? table('access-table', ['Time', 'Actor', 'Action', 'Object', 'Rows', 'Sensitive fields', 'Purpose'], rows) : empty(a.emptyText));
  }

  // ----- E: retention and retirement -----

  function retention(vm) {
    const r = obj(vm && vm.retention);
    const hold = obj(r.legalHold);
    const href = safeHref(r.storageHref);
    const steps = arr(r.timeline).map(function (s) {
      return '<li' + attr('class', s.paused ? 'tier tier-paused' : 'tier') + '><strong>' + esc(s.tier) + '</strong> ' + esc(s.text) +
        (s.paused ? ' <span class="badge hold-badge">' + esc(hold.badgeText) + '</span> ' + esc(s.pausedText) : '') + '</li>';
    });
    return '<span id="stage-retention"></span>' +
      heading(r.stage, r.title || 'Retention and retirement') +
      '<p class="caption">' + esc(r.label) + '</p>' +
      '<ol class="timeline">' + steps.join('') + '</ol>' +
      '<div class="hold-controls">' + button(hold.label || 'Legal hold', 'hold', { pressed: hold.on === true }) +
      (hold.on === true ? ' <span class="badge hold-badge">' + esc(hold.badgeText) + '</span>' : '') + '</div>' +
      (href ? '<p><a class="storage-link"' + attr('href', href) + '>Day thresholds and the cost model: the storage panel in Pipeline</a></p>' : '');
  }

  // ----- F: erasure -----

  function erasure(vm) {
    const e = obj(vm && vm.erasure);
    const fp = e.footprint && typeof e.footprint === 'object' ? e.footprint : null;
    const opts = '<option value="">Choose a subject</option>' + arr(e.options).map(function (o) {
      return '<option' + attr('value', o.id) + (o.id === e.selected ? ' selected' : '') + '>' + esc(o.id) + '</option>';
    }).join('');
    const layers = fp ? arr(fp.layers).map(function (l) {
      return '<tr><th scope="row">' + esc(l.layer) + '</th><td>' + esc(l.before) + '</td><td>' + esc(l.afterText) + '</td></tr>';
    }) : [];
    const checks = arr(e.checks).map(function (c) {
      return '<li><span aria-hidden="true">' + esc(c.mark) + '</span> ' + esc(c.label) + ': ' + esc(c.passText) + '</li>';
    });
    return '<span id="stage-erasure"></span>' +
      heading(e.stage, e.title || 'Erasure') +
      '<div class="erase-controls"><label for="subject-select">Subject</label>' +
      '<select id="subject-select"' + attr('data-cmd', 'select-subject') + '>' + opts + '</select>' +
      button('Erase subject', 'erase', { disabled: e.canErase !== true }) +
      button('Reset erasures', 'reset-erasures', { disabled: e.canReset !== true }) + '</div>' +
      (e.eraseReason ? '<p class="erase-reason">' + esc(e.eraseReason) + '</p>' : '') +
      '<p class="statement">' + esc(e.statement) + '</p>' +
      (fp
        ? '<h3>' + esc('Where ' + fp.subject + ' has rows') + '</h3>' +
          table('footprint-table', ['Layer', 'Rows before erasure', 'Rows after erasure'], layers) +
          '<p class="caption">' + esc(e.rawLine) + '</p>'
        : empty('Choose a subject to see where their rows are.')) +
      '<h3>Effects</h3>' +
      '<p>' + esc(e.effects ? e.effects.text : e.effectsEmptyText) + '</p>' +
      '<p class="caption">' + esc(e.effectsSentence) + '</p>' +
      '<h3>Checks</h3>' +
      (checks.length ? '<ul class="checks">' + checks.join('') + '</ul>' : empty(e.checksEmptyText));
  }

  // ----- vendor, notice, footer -----

  function vendor(vm) {
    const v = obj(vm && vm.vendor);
    return '<h2>In production this is…</h2>' +
      table('vendor-table', arr(v.columns), arr(v.rows).map(function (row) {
        return '<tr>' + arr(row).map(function (cell, i) {
          return i === 0 ? '<th scope="row">' + esc(cell) + '</th>' : '<td>' + esc(cell) + '</td>';
        }).join('') + '</tr>';
      }));
  }

  function notice(vm) {
    return vm && vm.notice ? '<p class="notice" role="alert">' + esc(vm.notice) + '</p>' : '';
  }

  function footer(vm) {
    return '<p>' + esc(vm && vm.footer ? vm.footer : 'All data is synthetic and generated deterministically (seed 42). Company names are fictional.') + '</p>';
  }

  Brain.render = { header: header, contract: contract, phi: phi, access: access, retention: retention, erasure: erasure, vendor: vendor, notice: notice, footer: footer, safeHref: safeHref };
})();
