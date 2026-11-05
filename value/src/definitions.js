(function () {
  'use strict';
  const Value = (globalThis.Value = globalThis.Value || {});

  // Task 10: pure definition state machine. State is plain data and is never mutated.
  const CONSUMERS = ['Dashboard tile', 'Trend chart'];
  const NON_TILE = CONSUMERS.slice(1);
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const names = () => Object.keys(Engine.METRIC_DEFINITIONS);
  const known = (m) => typeof m === 'string' && has(Engine.METRIC_DEFINITIONS, m);
  const validId = (m, id) => known(m) && typeof id === 'string' && Engine.METRIC_DEFINITIONS[m].definitions.some((d) => d.id === id);
  const plural = (n) => n + ' ' + Shared.format.plural(n, 'consumer', 'consumers');

  function initial() {
    const metrics = {};
    names().forEach((n) => {
      const cur = Engine.METRIC_DEFINITIONS[n].current;
      metrics[n] = { selected: cur, published: cur, version: 1, history: [] };
    });
    return { governed: true, metrics: metrics, consumerCopies: null, log: [], message: '' };
  }

  function validState(s) {
    if (!s || typeof s !== 'object' || Array.isArray(s) || !s.metrics || typeof s.metrics !== 'object' || !Array.isArray(s.log)) return false;
    return names().every((n) => {
      const m = has(s.metrics, n) ? s.metrics[n] : null;
      return m && validId(n, m.selected) && validId(n, m.published) && Number.isInteger(m.version) && Array.isArray(m.history);
    });
  }
  const norm = (s) => (validState(s) ? s : initial());

  function clone(s) {
    const metrics = {};
    names().forEach((n) => {
      const m = s.metrics[n];
      metrics[n] = { selected: m.selected, published: m.published, version: m.version, history: m.history.map((h) => ({ definitionId: h.definitionId, version: h.version })) };
    });
    let copies = null;
    if (s.consumerCopies) {
      copies = {};
      Object.keys(s.consumerCopies).forEach((n) => { copies[n] = Object.assign({}, s.consumerCopies[n]); });
    }
    return { governed: s.governed !== false, metrics: metrics, consumerCopies: copies, log: s.log.map((e) => ({ version: e.version, text: e.text })), message: '' };
  }

  function reduce(state, action) {
    if (!action || typeof action !== 'object' || typeof action.type !== 'string') return norm(state);
    const s0 = norm(state);
    const type = action.type;
    if (type === 'reset') { const s = initial(); s.message = 'Definitions reset'; return s; }
    if (type === 'mode') {
      if (typeof action.governed !== 'boolean') return s0;
      const s = clone(s0);
      s.governed = action.governed;
      if (action.governed) {
        s.consumerCopies = null;
        s.message = 'One governed definition: all reports agree';
      } else {
        s.consumerCopies = {};
        names().forEach((n) => {
          s.consumerCopies[n] = {};
          NON_TILE.forEach((c) => { s.consumerCopies[n][c] = s.metrics[n].published; });
        });
        s.message = 'Hardcoded in the report: each report keeps its own copy';
      }
      return s;
    }
    if (type === 'select') {
      if (!validId(action.metric, action.definitionId)) return s0;
      const s = clone(s0);
      s.metrics[action.metric].selected = action.definitionId;
      return s;
    }
    if (type === 'publish' || type === 'rollback') {
      const s = clone(s0);
      if (!known(action.metric)) { s.message = type === 'publish' ? 'Nothing to publish' : 'Nothing to roll back'; return s; }
      const m = s.metrics[action.metric];
      const n = s.governed ? CONSUMERS.length : 1;
      if (type === 'publish') {
        if (m.selected === m.published) { s.message = 'Nothing to publish'; return s; }
        const old = m.published;
        m.history.push({ definitionId: old, version: m.version });
        m.published = m.selected;
        m.version += 1;
        s.log.push({ version: m.version, text: action.metric + ': ' + old + ' -> ' + m.published + ', ' + plural(n) + ' changed' });
        s.message = 'Published ' + action.metric + ' v' + m.version;
        return s;
      }
      if (!m.history.length) { s.message = 'Nothing to roll back'; return s; }
      const prev = m.history.pop();
      const from = m.published;
      m.published = prev.definitionId;
      m.version = prev.version;
      m.selected = m.published;
      s.log.push({ version: m.version, text: action.metric + ': rolled back ' + from + ' -> ' + m.published + ', ' + plural(n) + ' changed' });
      s.message = 'Rolled back ' + action.metric + ' to v' + m.version;
      return s;
    }
    return s0;
  }

  const fmt = (history, metric, id) => {
    const r = Engine.computeMetric(history, metric, id);
    return r ? (r.value * 100).toFixed(1) + '%' : '';
  };

  function consumers(state, history) {
    const s = norm(state);
    return names().map((metric) => {
      const pub = s.metrics[metric].published;
      const rows = CONSUMERS.map((consumer, i) => {
        let id = pub;
        if (!s.governed && s.consumerCopies && i > 0 && s.consumerCopies[metric] && validId(metric, s.consumerCopies[metric][consumer])) id = s.consumerCopies[metric][consumer];
        return { consumer: consumer, definitionId: id, valueText: fmt(history, metric, id) };
      });
      const differing = rows.filter((r) => r.valueText !== rows[0].valueText).length;
      let conflict = null;
      if (differing > 0) {
        const values = [];
        rows.forEach((r) => { if (values.indexOf(r.valueText) < 0) values.push(r.valueText); });
        conflict = { text: 'Definition conflict: ' + differing + ' ' + Shared.format.plural(differing, 'report disagrees', 'reports disagree'), values: values };
      }
      return { metric: metric, rows: rows, conflict: conflict };
    });
  }

  function published(state) {
    const s = norm(state);
    const out = {};
    names().forEach((n) => { out[n] = { definitionId: s.metrics[n].published, version: s.metrics[n].version }; });
    return out;
  }

  function yamlPreview(metric, definitionId) {
    if (!validId(metric, definitionId)) return '';
    const def = Engine.METRIC_DEFINITIONS[metric].definitions.find((d) => d.id === definitionId);
    const snake = metric.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return [
      '# illustrative, in the style of dbt MetricFlow, not a working config',
      'metric:',
      '  name: ' + snake,
      '  label: ' + metric,
      '  type: ratio',
      '  definition: ' + definitionId,
      '  type_params:',
      '    numerator: ' + def.numerator,
      '    denominator: ' + def.denominator,
      ''
    ].join('\n');
  }

  function changelog(state) {
    const s = norm(state);
    return s.log.map((e) => ({ version: e.version, text: e.text })).reverse();
  }

  Value.definitions = { initial: initial, reduce: reduce, consumers: consumers, published: published, yamlPreview: yamlPreview, changelog: changelog };
})();
