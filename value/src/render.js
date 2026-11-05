(function () {
  'use strict';
  const Value = (globalThis.Value = globalThis.Value || {});
  const esc = function (v) { return globalThis.Shared.escape.esc(v); };

  const ARROW = { up: '▲', down: '▼', flat: '▬' };

  function attr(name, value) { return ' ' + name + '="' + esc(value) + '"'; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function obj(v) { return v && typeof v === 'object' ? v : {}; }
  function kebab(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }

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
      '<p class="step-text" aria-live="polite">' + esc(s.text) + '</p>';
  }

  // ----- KPI tiles -----

  function sparkline(points, name) {
    const vals = arr(points).filter(function (v) { return typeof v === 'number' && isFinite(v); });
    const W = 100, H = 24, P = 2;
    const label = '30-day trend for ' + name;
    if (vals.length < 2) return '<svg class="sparkline" role="img"' + attr('aria-label', label + ': not enough data') + ' viewBox="0 0 ' + W + ' ' + H + '"></svg>';
    const sc = Value.chart.scale(vals, H - 2 * P);
    const pts = vals.map(function (v, i) {
      return (P + (i * (W - 2 * P)) / (vals.length - 1)).toFixed(1) + ',' + (P + sc.y(v)).toFixed(1);
    }).join(' ');
    return '<svg class="sparkline" role="img"' + attr('aria-label', label) + ' viewBox="0 0 ' + W + ' ' + H + '" width="100" height="24">' +
      '<polyline fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"' + attr('points', pts) + '/></svg>';
  }

  function tile(t) {
    const dir = t.deltaDirection === 'up' || t.deltaDirection === 'down' ? t.deltaDirection : 'flat';
    return '<article class="kpi-tile"' + attr('id', 'kpi-' + t.id) + attr('data-held', t.held ? 'true' : 'false') + '>' +
      '<h3>' + esc(t.name) + '</h3>' +
      (t.held ? '<p class="held"><span class="badge held-badge">Held</span> <span class="held-text">' + esc(t.heldText) + '</span></p>' : '') +
      '<p class="kpi-value">' + esc(t.valueText) + '</p>' +
      '<p class="kpi-delta"' + attr('data-direction', dir) + '><span aria-hidden="true">' + ARROW[dir] + '</span> <span class="dir">' + esc(dir) + '</span> ' + esc(t.deltaText) + '</p>' +
      sparkline(obj(t.sparkline).points, t.name) +
      '<p class="caption source">' + esc('source: ' + t.source) + '</p>' +
      '<p class="caption"><span class="badge def-badge">' + esc(t.definitionBadge) + '</span></p>' +
      '<p class="caption freshness">' + esc(t.freshness) + '</p>' +
      '</article>';
  }

  function kpis(vm) {
    const tiles = arr(obj(vm && vm.kpis).tiles);
    return heading('Stage 7: Visualization', 'KPI dashboard') +
      (tiles.length ? '<div class="kpi-grid">' + tiles.map(tile).join('') + '</div>' : empty('No KPIs to show'));
  }

  // ----- trends -----

  function trend(t) {
    const id = 'trend-' + t.id;
    const open = t.tableOpen === true;
    const spec = { id: id, title: t.title, unit: t.unit, dates: arr(t.dates), weekendIndexes: arr(t.weekendIndexes), series: arr(t.series) };
    const tableHtml = open
      ? wrap(Value.chart.table({ title: String(t.title) + ' (' + String(t.tableNote || '') + ')', unit: t.unit, dates: spec.dates, series: spec.series }))
      : '';
    return '<figure class="trend"' + attr('data-kpi', t.id) + '>' +
      '<figcaption>' + esc(t.title) + '</figcaption>' +
      Value.chart.lineChart(spec) +
      '<p class="trend-summary">' + esc(t.summary) + '</p>' +
      '<p class="trend-legend caption">Thin line: daily value. Thick line: 7-day trailing value. Shaded bands: weekends.</p>' +
      button('Show as table', 'table-toggle', { data: { kpi: t.id }, expanded: open, label: 'Show as table: ' + t.title }) +
      tableHtml +
      '</figure>';
  }

  function trends(vm) {
    const list = arr(vm && vm.trends);
    return heading('Stage 7: Visualization', 'Trends over 120 days') +
      (list.length ? list.map(trend).join('') : empty('No trends to show'));
  }

  // ----- compare -----

  function compare(vm) {
    const c = vm && vm.compare;
    const head = heading('Stage 7: Visualization', 'With the gate and without it');
    if (!c || typeof c !== 'object') return head + empty('No comparison to show');
    const w = obj(c.withGate), n = obj(c.withoutGate);
    return head +
      '<div class="compare-columns">' +
      '<div class="compare-col with-gate"><h3>' + esc(w.label) + '</h3>' +
      '<p class="caption">Today so far</p>' +
      '<p class="big">' + esc(w.readingsText) + '</p><p>' + esc(w.abnormalText) + '</p><p class="rate">' + esc(w.rateText) + '</p></div>' +
      '<div class="compare-col without-gate"><h3>' + esc(n.label) + '</h3>' +
      '<p class="caption">Today so far</p>' +
      '<p class="big">' + esc(n.countedText) + '</p><p>' + esc(n.droppedText) + '</p>' +
      (arr(n.droppedReasons).length
        ? '<ul class="dropped-reasons">' + arr(n.droppedReasons).map(function (r) {
          return '<li>' + esc(r.count) + ' × ' + esc(r.text) + '</li>';
        }).join('') + '</ul>' : '') +
      '<p>' + esc(n.invalidText) + '</p><p class="rate">' + esc(n.rateText) + '</p></div>' +
      '</div>' +
      '<p class="note">' + esc(c.note) + '</p>';
  }

  // ----- definitions -----

  function metricPanel(m) {
    const k = kebab(m.name);
    const sid = 'def-select-' + k;
    const opts = arr(m.options).map(function (o) {
      return '<option' + attr('value', o.id) + (o.id === m.selectedId ? ' selected' : '') + '>' + esc(o.label) + '</option>';
    }).join('');
    const rows = arr(m.consumers).map(function (r) {
      return '<tr><th scope="row">' + esc(r.consumer) + '</th><td>' + esc(r.definitionId) + '</td><td>' + esc(r.valueText) + '</td></tr>';
    });
    const conflict = m.conflict && typeof m.conflict === 'object'
      ? '<p class="conflict" role="alert">' + esc(m.conflict.text) + ' (values: ' + arr(m.conflict.values).map(esc).join(', ') + ')</p>' : '';
    return '<div class="metric-panel"' + attr('data-metric', m.name) + '>' +
      '<h3>' + esc(m.name) + ' <span class="badge version-badge">' + esc('v' + m.version) + '</span></h3>' +
      '<p class="caption">' + esc('Published: ' + m.publishedId) + '</p>' +
      '<div class="def-controls"><label' + attr('for', sid) + '>' + esc('Definition for ' + m.name) + '</label>' +
      '<select' + attr('id', sid) + attr('data-cmd', 'select') + attr('data-metric', m.name) + '>' + opts + '</select>' +
      button('Publish definition', 'publish', { data: { metric: m.name }, label: 'Publish definition for ' + m.name }) +
      button('Roll back', 'rollback', { data: { metric: m.name }, label: 'Roll back ' + m.name }) +
      '</div>' +
      '<pre class="yaml" tabindex="0"' + attr('aria-label', 'Illustrative definition preview for ' + m.name) + '><code>' + esc(m.yaml) + '</code></pre>' +
      conflict +
      table('consumers-table', ['Consumer', 'Definition', 'Value'], rows) +
      '</div>';
  }

  function definitions(vm) {
    const d = obj(vm && vm.definitions);
    const governed = d.governed !== false;
    const log = arr(d.changelog);
    return '<span id="stage-definitions"></span>' +
      heading('Stage 7: Visualization', 'Metric definitions: one governed place') +
      '<div class="def-global">' +
      '<div class="mode-switch" role="group" aria-label="Where the formula lives">' +
      button('One governed definition', 'mode', { data: { governed: 'true' }, pressed: governed }) +
      button('Hardcoded in the report', 'mode', { data: { governed: 'false' }, pressed: !governed }) +
      '</div>' +
      button('Reset definitions', 'reset') +
      '</div>' +
      '<p class="def-message" aria-live="polite">' + esc(d.message) + '</p>' +
      arr(d.metrics).map(metricPanel).join('') +
      '<h3>Changelog</h3>' +
      (log.length ? '<ul class="changelog">' + log.map(function (e) { return '<li>' + esc('v' + e.version + ': ' + e.text) + '</li>'; }).join('') + '</ul>' : empty('No definition changes yet'));
  }

  // ----- check -----

  function check(vm) {
    const c = obj(vm && vm.check);
    const level = c.level === 'ok' || c.level === 'warn' ? c.level : 'neutral';
    const cue = level === 'ok' ? '✓' : level === 'warn' ? '⚠' : '–';
    return '<span id="stage-check"></span>' +
      heading('Stage 6: Analysis/Modeling', 'Expected-range check') +
      '<p class="check-title">' + esc(c.title) + '</p>' +
      '<p class="check-with">' + esc(c.withHandPickedText) + '</p>' +
      '<p class="check-without">' + esc(c.withoutHandPickedText) + '</p>' +
      '<p class="check-range">' + esc(c.rangeText) + '</p>' +
      '<p class="verdict"' + attr('data-level', level) + '><span aria-hidden="true">' + cue + '</span> ' + esc(c.verdict) + '</p>' +
      '<details class="explain"><summary>How this check works</summary>' +
      arr(c.explain).map(function (t) { return '<p>' + esc(t) + '</p>'; }).join('') + '</details>';
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

  const render = { header: header, kpis: kpis, trends: trends, compare: compare, definitions: definitions, check: check, vendor: vendor, notice: notice, footer: footer, safeHref: safeHref };
  render.all = function all(vm) {
    return ['header', 'notice', 'kpis', 'trends', 'compare', 'definitions', 'check', 'vendor', 'footer'].map(function (k) { return render[k](vm); }).join('\n');
  };
  Value.render = render;
})();
