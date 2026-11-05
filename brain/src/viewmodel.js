(function () {
  'use strict';
  const Brain = (globalThis.Brain = globalThis.Brain || {});
  const vm = (Brain.viewmodel = Brain.viewmodel || {});

  const TITLE = 'Brain: Control and Accountability';
  const SUBTITLE = 'Tamsworth Health: who is accountable for the data and what happens when it must be controlled, kept or deleted, stages 5 and 8';
  const STAGE_GOVERNANCE = 'Stage 5: Management/Governance';
  const FOOTER_TEXT = 'All data is synthetic and generated deterministically (seed 42). Company names are fictional.';

  // ----- header, stepper, links (same rules as the Value page) -----

  const NO_BATCH_TEXT = 'No batch has run yet';

  // The detail of the first engine event the last action added.
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

  // Only a scheme-less relative URL of safe characters, up to 2000 characters. '' when rejected.
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
    const url = b + '?scenario=' + scenario;
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
      title: TITLE,
      subtitle: SUBTITLE,
      steps: steps,
      canBack: step === null ? true : step > floor,
      canNext: step === null ? true : step < m,
      hqHref: link(L.hqBase, scenario, list),
      pipelineHref: link(L.pipelineBase, scenario, list)
    };
  }

  function stepLabel(steps) { return typeof steps.label === 'string' ? steps.label : 'Step ' + steps.n + ' of ' + steps.m; }

  // ----- A: data contract and ownership -----

  // The only invented content on the page: one fictional owning team per layer.
  const OWNERS = [
    { layer: 'Bronze', owner: 'Clinical Informatics' },
    { layer: 'Silver', owner: 'Data Engineering' },
    { layer: 'Gold', owner: 'Analytics' }
  ];

  function contractPanel() {
    const c = Engine.getContract();
    const n = c.names;
    const objects = [n.bronze, n.silver, n.gold.join(', ') + ', and the KPI tiles'];
    return {
      stage: STAGE_GOVERNANCE,
      title: 'Data contract and ownership',
      fields: c.fields.map(function (f) {
        return { name: f.name, type: f.type, rule: f.rule, sensitive: f.sensitive === true, sensitiveText: f.sensitive === true ? 'Yes (PHI)' : 'No' };
      }),
      primaryKey: c.primaryKey.slice(),
      entityField: c.entityField,
      owners: OWNERS.map(function (o, i) { return { layer: o.layer, objects: objects[i], owner: o.owner }; })
    };
  }

  // ----- B: sensitive fields and quarantine -----

  const PHI_NOTE = 'Holding bad rows out of production is not privacy protection: the Silver layer keeps these fields by design.';
  const PHI_EMPTY = 'No rows are quarantined in this run.';

  function phiPanel(state) {
    const c = Engine.getContract();
    const sensitive = c.fields.filter(function (f) { return f.sensitive === true; }).map(function (f) { return f.name; });
    const rows = (state.dlq || []).map(function (d) {
      const fields = Engine.phiFields(d.payload);
      return {
        id: d.dlqId,
        batch: Shared.format.batchLabel(d.batchId),
        status: d.status,
        fields: fields,
        fieldsText: fields.join(', ')
      };
    });
    return {
      stage: STAGE_GOVERNANCE,
      title: 'Sensitive fields and quarantine',
      summaryText: sensitive.length + ' of ' + c.fields.length + ' contract ' + Shared.format.plural(c.fields.length, 'field', 'fields') + ' are marked sensitive',
      sensitiveFields: sensitive,
      holdingCount: state.businessCase.phiRowsQuarantined,
      rows: rows,
      emptyText: PHI_EMPTY,
      note: PHI_NOTE
    };
  }

  // ----- model assembly -----

  function selfTestBanner() {
    let r;
    try { r = Engine.selfTest(); } catch (e) { return 'Engine self-test failed: ' + String(e && e.message); }
    const checks = (r && r.checks) || [];
    const good = r && (r.passed !== undefined ? r.passed : r.ok !== undefined ? r.ok : r.pass);
    if (good) return null;
    const failing = checks.filter(function (c) { return !(c.ok !== undefined ? c.ok : c.passed); }).map(function (c) { return c.name; });
    return 'Engine self-test failed: ' + (failing.length ? failing.join(', ') : 'unknown check');
  }

  function safeContract() {
    try { return contractPanel(); } catch (e) {
      return { stage: STAGE_GOVERNANCE, title: 'Data contract and ownership', fields: [], primaryKey: [], entityField: '', owners: [] };
    }
  }

  // Never throws. ctx = { scenario, actions, step, local, links: { hqBase, pipelineBase } }.
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
      return {
        header: Object.assign({}, header(state, scenario, step, links, actions), { scenario: scenario }),
        contract: contractPanel(),
        phi: phiPanel(state),
        lineage: null,
        access: null,
        retention: null,
        erasure: null,
        vendor: null,
        notice: notice,
        footer: FOOTER_TEXT
      };
    } catch (e) {
      return {
        header: {
          title: TITLE, subtitle: SUBTITLE,
          steps: { n: null, m: 0, text: '', label: 'Step unavailable' },
          canBack: false, canNext: false, hqHref: null, pipelineHref: null, scenario: scenario
        },
        contract: safeContract(),
        phi: { stage: STAGE_GOVERNANCE, title: 'Sensitive fields and quarantine', summaryText: '', sensitiveFields: [], holdingCount: 0, rows: [], emptyText: PHI_EMPTY, note: PHI_NOTE },
        lineage: null,
        access: null,
        retention: null,
        erasure: null,
        vendor: null,
        notice: notice || 'Engine self-test failed: ' + String(e && e.message),
        footer: FOOTER_TEXT
      };
    }
  }

  vm.stepLabel = stepLabel;
  vm.buildViewModel = buildViewModel;
})();
