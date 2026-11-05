(function () {
  'use strict';
  const Value = (globalThis.Value = globalThis.Value || {});
  const vm = (Value.viewmodel = Value.viewmodel || {});

  // ----- Task 6: header, stepper, links -----

  const NO_BATCH_TEXT = 'No batch has run yet';

  // The detail of the first engine event the last action added (same rule as Pipeline's stepText).
  function stepText(state, scenario, actions) {
    const events = state.events || [];
    if (!events.length) return NO_BATCH_TEXT;
    const list = Array.isArray(actions) ? actions : [];
    if (list.length <= Engine.PRELUDE[scenario].length) return events[events.length - 1].detail;
    let before;
    try { before = (Engine.getState(scenario, list.slice(0, -1)).events || []).length; } catch (e) { before = events.length - 1; }
    const added = events[before];
    return (added || events[events.length - 1]).detail;
  }

  // Same rules as HQ's safeBase: only a scheme-less relative URL of safe characters, up to 2000 characters. '' when rejected.
  function safeBase(href) {
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

  // The longest scripted prefix of the actions (never below the scenario floor): where a link opens when the state
  // cannot be encoded within the cap.
  function nearestStep(scenario, actions) {
    const floor = Engine.PRELUDE[scenario].length;
    for (let k = Math.min(actions.length, Engine.AUTOPLAY[scenario].length); k >= floor; k--) {
      if (Engine.stepForActions(scenario, actions.slice(0, k)) === k) return k;
    }
    return floor;
  }

  // base + ?scenario=S + (&step=N for a scripted state, else &a=<encoded>; over the cap, &step=<nearest scripted step>).
  // null when the base is absent or not allowed.
  function link(base, scenario, actions) {
    const b = safeBase(base);
    if (!b) return null;
    let url = b + '?scenario=' + scenario;
    const step = Engine.stepForActions(scenario, actions);
    if (typeof step === 'number') return url + '&step=' + step;
    const enc = Engine.encodeActions(actions);
    return url + (typeof enc === 'string' ? '&a=' + enc : '&step=' + nearestStep(scenario, actions));
  }

  // `step` is the scripted step number, or null for a diverged state (actions that are not a scripted prefix).
  function header(state, scenario, step, links, actions) {
    const m = Engine.AUTOPLAY[scenario].length;
    const floor = Engine.PRELUDE[scenario].length;
    const list = Array.isArray(actions) ? actions : Engine.actionsForStep(scenario, step === null ? floor : step);
    const L = links && typeof links === 'object' ? links : {};
    const steps = { n: step, m: m, text: stepText(state, scenario, list) };
    if (step === null) steps.label = 'Custom state from HQ (' + list.length + ' ' + Shared.format.plural(list.length, 'action', 'actions') + ')';
    return {
      title: 'Value: What the Business Sees',
      subtitle: 'Tamsworth Health: what the business sees and why it can be trusted, stages 6 and 7',
      steps: steps,
      canBack: step === null ? true : step > floor,
      canNext: step === null ? true : step < m,
      hqHref: link(L.hqBase, scenario, list),
      pipelineHref: link(L.pipelineBase, scenario, list)
    };
  }

  function stepLabel(steps) { return typeof steps.label === 'string' ? steps.label : 'Step ' + steps.n + ' of ' + steps.m; }

  // ----- Task 7: KPI tiles -----

  // Display facts only (source table, unit); every number comes from the engine.
  const DISPLAY = {
    'Bed Occupancy': { source: 'fct_census_daily', kind: 'pct' },
    'Abnormal Vital Rate': { source: 'fct_vital_observation', kind: 'pct' },
    'Avg Length of Stay': { source: 'fct_census_daily', kind: 'days' },
    '30-Day Readmission Rate': { source: 'fct_census_daily', kind: 'pct' }
  };
  const NO_PUBLISH_TEXT = 'No batch published yet';

  function kebab(name) { return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }

  // { def, version }: def is the non-current engine definition selected, else null (current, missing or unknown).
  function selection(name, metricState) {
    const meta = Engine.METRIC_DEFINITIONS[name];
    if (!meta) return { def: null, version: 1 };
    const pick = metricState && typeof metricState === 'object' ? metricState[name] : null;
    const id = pick && typeof pick.definitionId === 'string' ? pick.definitionId : meta.current;
    const def = meta.definitions.filter(function (d) { return d.id === id; })[0] || null;
    if (!def) return { def: null, version: 1 };
    const v = pick && Number.isInteger(pick.version) && pick.version > 0 ? pick.version : 1;
    return { def: def.id === meta.current ? null : def, version: v };
  }

  function deltaOf(pct) {
    const s = Math.abs(pct).toFixed(1);
    const zero = Number(s) === 0;
    return { text: (pct < 0 && !zero ? '-' : '+') + s + '% vs prior 7 days', dir: zero ? 'flat' : (pct < 0 ? 'down' : 'up') };
  }

  function kpiTiles(state, history, metricState) {
    const kpis = (state && state.kpis) || [];
    const rows = Array.isArray(history) ? history : [];
    const f = Shared.format;
    return kpis.map(function (k) {
      const fx = DISPLAY[k.name];
      const sel = selection(k.name, metricState);
      let value = k.value, deltaPct = k.deltaPct, defId;
      if (sel.def) {
        const m = Engine.computeMetric(rows, k.name, sel.def.id);
        if (m) { value = m.value; deltaPct = m.deltaPct; defId = sel.def.id; }
      }
      const series = Engine.metricSeries(rows, k.name, defId, 7);
      const d = deltaOf(deltaPct);
      return {
        id: kebab(k.name),
        name: k.name,
        valueText: fx.kind === 'days' ? value.toFixed(1) + ' days' : (value * 100).toFixed(1) + '%',
        deltaText: d.text,
        deltaDirection: d.dir,
        sparkline: { points: series ? series.daily.slice(-30) : [] },
        source: fx.source,
        definitionBadge: 'def v' + sel.version,
        freshness: k.asOfBatchId ? 'as of ' + f.batchLabel(k.asOfBatchId) + ', ' + f.clockLabel(k.asOfIso) : NO_PUBLISH_TEXT,
        held: !!k.held,
        heldText: k.held ? 'KPIs held at ' + f.batchLabel(k.asOfBatchId) : ''
      };
    });
  }

  // ----- Task 9: with the gate and without it -----

  const GATE_LABEL = 'With the gate (what this dashboard shows)';
  const NO_GATE_LABEL = 'Without a gate (a model of a naive pipeline)';
  const COMPARE_NOTE = 'The seven-day tiles come from the 120-day Gold history, so a single bad batch does not move them. The damage a bad batch does is to the live sample and to trust: rows that vanish or invalid readings that are counted.';

  // Reasons grouped by text, most frequent first, ties in first-seen order.
  function groupReasons(list) {
    const groups = [];
    (Array.isArray(list) ? list : []).forEach(function (r) {
      const text = String(r && r.reason);
      const g = groups.filter(function (x) { return x.text === text; })[0];
      if (g) g.count++; else groups.push({ text: text, count: 1 });
    });
    return groups
      .map(function (g, i) { return { g: g, i: i }; })
      .sort(function (a, b) { return b.g.count - a.g.count || a.i - b.i; })
      .map(function (x) { return x.g; });
  }

  function compare(state, naive) {
    const p = Shared.format.plural;
    const t = (state && state.todaySoFar) || {};
    const n = naive || {};
    return {
      withGate: {
        readingsText: t.observations + ' ' + p(t.observations, 'reading', 'readings'),
        abnormalText: t.abnormalCount + ' abnormal',
        rateText: t.abnormalVitalRate.toFixed(1) + '%',
        label: GATE_LABEL
      },
      withoutGate: {
        countedText: n.counted + ' ' + p(n.counted, 'reading', 'readings') + ' counted',
        droppedText: n.dropped + ' ' + p(n.dropped, 'row', 'rows') + ' silently dropped',
        droppedReasons: groupReasons(n.droppedReasons),
        invalidText: n.invalidReadings + ' invalid ' + p(n.invalidReadings, 'reading', 'readings') + ' counted',
        rateText: n.ratePct.toFixed(1) + '%',
        label: NO_GATE_LABEL
      },
      note: COMPARE_NOTE
    };
  }

  vm.compare = compare;

  vm.kpiTiles = kpiTiles;
  vm.header = header;
  vm.stepLabel = stepLabel;

  // ----- Task 11: expected-range check panel -----

  const CHECK_TITLE = 'Expected-range check';
  const CHECK_LEAD = 'A demonstration of the pattern, not a clinical model.';
  const CHECK_QUESTION = "Is today's abnormal-vital rate unusual for a sample this size?";
  const CHECK_NEUTRAL = 'Not enough data yet (fewer than 30 readings)';
  const CHECK_EXPLAIN = [
    'Baseline: the 120-day Abnormal Vital Rate, using the standard definition.',
    'Range rule: the 95% range of a binomial for a sample this size, because a small sample is far noisier than a whole day.',
    'Why the sample is small: the demo publishes only a few batches of 20 readings each. In the guided runs, today holds 20 to 80 readings.',
    'The five hand-picked edge-case rows are left out: three of the five are abnormal, and they would make every healthy batch look unusual.',
    'It does not predict anything, it is not for clinical use, and it is not a diagnosis.'
  ];

  function checkRate(abnormal, total) {
    if (!total) return abnormal + ' of ' + total;
    return abnormal + ' of ' + total + ' = ' + ((abnormal / total) * 100).toFixed(1) + '%';
  }

  function checkPanel(state) {
    let c = null;
    try { c = Engine.liveSampleCheck(state); } catch (e) { c = null; }
    if (!c) {
      return {
        title: CHECK_TITLE, lead: CHECK_LEAD, question: CHECK_QUESTION, withHandPickedText: '', withoutHandPickedText: '', rangeText: '',
        verdict: CHECK_NEUTRAL, level: 'neutral', explain: CHECK_EXPLAIN.slice()
      };
    }
    const all = checkRate(c.abnormal, c.published);
    const level = c.verdict === 'Within the expected range' ? 'ok' : c.verdict === 'Above the expected range' ? 'warn' : 'neutral';
    return {
      title: CHECK_TITLE, lead: CHECK_LEAD, question: CHECK_QUESTION,
      withHandPickedText: c.handPicked > 0 ? all + ' (counting the five hand-picked rows)' : all,
      withoutHandPickedText: checkRate(c.abnormalReadings, c.readings) + ' (without them; this is the number the verdict uses)',
      rangeText: c.readings > 0 && c.upperLimitPct !== null
        ? 'Expected range for ' + c.readings + ' readings at the 120-day rate of ' + (c.baselineRate * 100).toFixed(1) + '%: up to ' + c.upperLimitPct.toFixed(1) + '%'
        : 'No readings yet',
      verdict: c.verdict,
      level: level,
      explain: CHECK_EXPLAIN.slice()
    };
  }

  vm.checkPanel = checkPanel;

  // ----- Task 12: model assembly -----

  const FOOTER_TEXT = 'All data is synthetic and generated deterministically (seed 42). Company names are fictional.';
  const TRAILING_NOTE = 'trailing window is shorter for the first six days';
  const VENDOR_ROWS = ['Metrics layer', 'Dashboards'];

  // Days since 1970-01-01 for a proleptic Gregorian date (no Date constructor).
  function daysFromCivil(y, m, d) {
    const yy = m <= 2 ? y - 1 : y;
    const era = Math.floor(yy / 400);
    const yoe = yy - era * 400;
    const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
    const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
    return era * 146097 + doe - 719468;
  }

  // 0 = Sunday ... 6 = Saturday for 'YYYY-MM-DD'; -1 when the text is not a real calendar date.
  function dayOfWeek(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
    if (!m) return -1;
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1) return -1;
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
    if (d > dim) return -1;
    return (((daysFromCivil(y, mo, d) + 4) % 7) + 7) % 7;
  }

  // The inverse of Shared.escape.esc, so a summary built with escaped parts is stored as plain text.
  function unesc(t) {
    return String(t).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  }

  // Same wording as Pipeline's controller. null when the self-test passes.
  function selfTestBanner() {
    let r;
    try { r = Engine.selfTest(); } catch (e) { return 'Engine self-test failed: ' + String(e && e.message); }
    const checks = (r && r.checks) || [];
    const good = r && (r.passed !== undefined ? r.passed : r.ok !== undefined ? r.ok : r.pass);
    if (good) return null;
    const failing = checks.filter(function (c) { return !(c.ok !== undefined ? c.ok : c.passed); }).map(function (c) { return c.name; });
    return 'Engine self-test failed: ' + (failing.length ? failing.join(', ') : 'unknown check');
  }

  function vendorSubset() {
    return {
      columns: ['Component', 'Databricks', 'Snowflake', 'Fabric'],
      rows: VENDOR_ROWS.map(function (name) {
        const row = Shared.vendor.rows.filter(function (r) { return r[0] === name; })[0];
        return row ? row.slice() : [name, '', '', ''];
      })
    };
  }

  // Daily and 7-day trailing series for one tile, from the engine, for the definition id given (undefined: the current one).
  // The window is shorter for the first six days.
  function trendOf(tile, history, defId, openTables) {
    const fx = DISPLAY[tile.name];
    const ms = Engine.metricSeries(history, tile.name, defId, 7) || { dates: [], daily: [], trailing: [] };
    const daily = ms.daily, trailing = ms.trailing;
    const dates = ms.dates;
    const weekendIndexes = [];
    dates.forEach(function (dt, i) { const w = dayOfWeek(dt); if (w === 0 || w === 6) weekendIndexes.push(i); });
    const unit = fx.kind === 'days' ? 'days' : 'pct';
    const series = [{ name: 'Daily', values: daily, className: 'daily' }, { name: '7-day trailing', values: trailing, className: 'trailing' }];
    return {
      id: tile.id, title: tile.name, unit: unit, dates: dates, weekendIndexes: weekendIndexes, series: series,
      summary: unesc(Value.chart.summary({ title: tile.name, series: series, dates: dates, unit: unit, weekendIndexes: weekendIndexes })),
      tableNote: TRAILING_NOTE,
      tableOpen: !!(openTables && typeof openTables === 'object' && openTables[tile.id] === true)
    };
  }

  function definitionsModel(ds, history) {
    const cons = Value.definitions.consumers(ds, history);
    return {
      governed: ds.governed !== false,
      message: ds.message || '',
      changelog: Value.definitions.changelog(ds),
      metrics: cons.map(function (c) {
        const m = ds.metrics[c.metric];
        const meta = Engine.METRIC_DEFINITIONS[c.metric];
        return {
          name: c.metric, selectedId: m.selected, publishedId: m.published, version: m.version,
          options: meta.definitions.map(function (d) { return { id: d.id, label: d.label }; }),
          yaml: Value.definitions.yamlPreview(c.metric, m.selected),
          consumers: c.rows, conflict: c.conflict
        };
      })
    };
  }

  function emptyCheck() {
    try { return checkPanel(null); } catch (e) {
      return { title: CHECK_TITLE, lead: CHECK_LEAD, question: CHECK_QUESTION, withHandPickedText: '', withoutHandPickedText: '', rangeText: '', verdict: CHECK_NEUTRAL, level: 'neutral', explain: CHECK_EXPLAIN.slice() };
    }
  }

  function safeVendor() {
    try { return vendorSubset(); } catch (e) { return { columns: ['Component', 'Databricks', 'Snowflake', 'Fabric'], rows: [] }; }
  }

  // Never throws. ctx = { scenario, actions, step, defState, links: { hqBase, pipelineBase }, openTables, explainOpen }.
  function buildViewModel(ctx) {
    const c = ctx && typeof ctx === 'object' ? ctx : {};
    let scenario = 'healthy';
    try { if (typeof c.scenario === 'string' && Engine.AUTOPLAY[c.scenario]) scenario = c.scenario; } catch (e) { scenario = 'healthy'; }
    const links = c.links && typeof c.links === 'object' ? c.links : {};
    let notice = null;
    try {
      notice = selfTestBanner();
      const floor = Engine.PRELUDE[scenario].length;
      const actions = Array.isArray(c.actions) ? c.actions : Engine.actionsForStep(scenario, floor);
      let step = Number.isInteger(c.step) ? c.step : null;
      if (c.step === undefined) { const n = Engine.stepForActions(scenario, actions); step = typeof n === 'number' ? n : null; }
      const state = Engine.getState(scenario, actions);
      const history = Engine.getHistory();
      const naive = Engine.naiveSample(scenario, actions);
      const ds = Value.definitions.reduce(c.defState, { type: 'none' });
      const pub = Value.definitions.published(ds);
      const tiles = kpiTiles(state, history, pub);
      // Panel B follows the Trend chart consumer: the published definition when governed, its own copy when hardcoded.
      const trendDef = {};
      Value.definitions.consumers(ds, history).forEach(function (m) {
        const row = m.rows.filter(function (r) { return r.consumer === 'Trend chart'; })[0];
        if (row) trendDef[m.metric] = row.definitionId;
      });
      return {
        header: Object.assign({}, header(state, scenario, step, links, actions), { scenario: scenario }),
        kpis: { tiles: tiles },
        trends: tiles.map(function (t) { return trendOf(t, history, trendDef[t.name], c.openTables); }),
        compare: compare(state, naive),
        definitions: definitionsModel(ds, history),
        check: Object.assign(checkPanel(state), { explainOpen: c.explainOpen === true }),
        vendor: vendorSubset(),
        notice: notice,
        footer: FOOTER_TEXT
      };
    } catch (e) {
      return {
        header: {
          title: 'Value: What the Business Sees',
          subtitle: 'Tamsworth Health: what the business sees and why it can be trusted, stages 6 and 7',
          steps: { n: null, m: 0, text: '', label: 'Step unavailable' },
          canBack: false, canNext: false, hqHref: null, pipelineHref: null, scenario: scenario
        },
        kpis: { tiles: [] },
        trends: [],
        compare: null,
        definitions: { governed: true, message: '', changelog: [], metrics: [] },
        check: emptyCheck(),
        vendor: safeVendor(),
        notice: notice || 'Engine self-test failed: ' + String(e && e.message),
        footer: FOOTER_TEXT
      };
    }
  }

  vm.dayOfWeek = dayOfWeek;
  vm.buildViewModel = buildViewModel;
})();
