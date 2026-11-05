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

  // ----- C: lineage and impact -----

  const LAYER_NAMES = ['source field', 'Bronze table', 'Silver table', 'Gold model', 'KPI tile'];
  const LINEAGE_PROMPT = 'Select a node to see what it feeds and what feeds it.';

  function listText(label, ids) {
    return label + ' (' + ids.length + '): ' + (ids.length ? ids.join(', ') : 'nothing');
  }

  // The graph model: every node and edge with a status for the selected node (selected, downstream, dimmed, or plain when
  // nothing is selected), and the text panel for it. Reachability comes from Brain.lineage; nothing is computed here.
  function lineagePanel(local) {
    const lin = Brain.lineage;
    const known = lin.nodes.some(function (n) { return n.id === local.selectedNode; });
    const selected = known ? local.selectedNode : '';
    const down = selected ? lin.downstream(selected) : [];
    const lit = {};
    down.forEach(function (id) { lit[id] = true; });
    if (selected) lit[selected] = true;
    const p = Shared.format.plural;
    let panel = null;
    if (selected) {
      const node = lin.nodes.filter(function (n) { return n.id === selected; })[0];
      const up = lin.upstream(selected);
      const kpis = lin.kpisFor(selected);
      let kpisText = 'No KPI tile depends on it.';
      if (node.layer === 4) kpisText = 'This is a KPI tile.';
      else if (kpis.length) kpisText = 'KPI tiles affected (' + kpis.length + '): ' + kpis.join(', ');
      panel = {
        id: selected,
        sensitive: node.sensitive === true,
        feeds: down,
        fedBy: up,
        feedsText: listText('Feeds', down),
        fedByText: listText('Fed by', up),
        kpisText: kpisText,
        impactText: down.length
          ? 'Dropping or retyping ' + selected + ' would break ' + down.length + ' downstream ' + p(down.length, 'object', 'objects') + (kpis.length ? ' including ' + kpis.join(', ') : '') + '.'
          : ''
      };
    }
    const status = function (id) { return !selected ? 'plain' : id === selected ? 'selected' : lit[id] ? 'downstream' : 'dimmed'; };
    return {
      stage: STAGE_GOVERNANCE,
      title: 'Lineage and impact',
      summary: 'Lineage graph: ' + lin.nodes.length + ' ' + p(lin.nodes.length, 'node', 'nodes') + ' and ' + lin.edges.length + ' ' + p(lin.edges.length, 'edge', 'edges') +
        ' in five columns: source fields, Bronze, Silver, Gold models, KPI tiles. Select a node to highlight everything below it.',
      prompt: LINEAGE_PROMPT,
      selected: selected,
      nodes: lin.nodes.map(function (n) {
        return { id: n.id, label: n.label, layer: n.layer, layerName: LAYER_NAMES[n.layer], sensitive: n.sensitive === true, status: status(n.id), pressed: n.id === selected };
      }),
      edges: lin.edges.map(function (e) {
        return { from: e[0], to: e[1], status: !selected ? 'plain' : (lit[e[0]] && down.indexOf(e[1]) >= 0 ? 'hot' : 'dim') };
      }),
      panel: panel,
      showList: local.showList === true,
      listToggleText: 'Show as list'
    };
  }

  // ----- D: access log -----

  const ACCESS_LABEL = 'A simulated access log: it records what the pipeline and the operator did in this run.';
  const ACCESS_EMPTY = 'No data has moved yet.';

  // Newest first. Erased subjects (local state) go to the engine as a plain list; their ERASE entries come last in the log,
  // so they lead here.
  function accessPanel(scenario, actions, local) {
    const f = Shared.format;
    const log = Engine.accessLog(scenario, actions, local.erased) || [];
    return {
      stage: STAGE_GOVERNANCE,
      title: 'Access log',
      label: ACCESS_LABEL,
      emptyText: ACCESS_EMPTY,
      rows: log.slice().reverse().map(function (e) {
        return {
          seq: e.seq,
          time: f.clockLabel(e.iso),
          actor: e.actor,
          action: e.action,
          object: e.object,
          rows: e.rows,
          rowsText: e.rows + ' ' + f.plural(e.rows, 'row', 'rows'),
          fieldsText: e.phiFields.length ? e.phiFields.join(', ') : 'none',
          purpose: e.purpose
        };
      })
    };
  }

  // ----- E: retention and retirement -----

  const RETENTION_LABEL = 'Retention periods here are example policy settings for the demo, not legal advice.';
  const HOLD_PAUSED = 'Deletion paused: legal hold is on.';

  function retentionPanel(local, storageHref) {
    const t = Engine.TIERING_DEFAULTS;
    const f = Shared.format;
    const hold = local.legalHold === true;
    const days = function (n) { return 'After ' + f.thousands(n) + ' days'; };
    return {
      stage: 'Stage 8: Archiving/Retirement',
      title: 'Retention and retirement',
      label: RETENTION_LABEL,
      timeline: [
        { tier: 'Hot', days: 0, text: 'Day 0', paused: false, pausedText: '' },
        { tier: 'Warm', days: t.hotToWarmDays, text: days(t.hotToWarmDays), paused: false, pausedText: '' },
        { tier: 'Cold', days: t.warmToColdDays, text: days(t.warmToColdDays), paused: false, pausedText: '' },
        { tier: 'Delete', days: t.retentionDays, text: days(t.retentionDays), paused: hold, pausedText: hold ? HOLD_PAUSED : '' }
      ],
      legalHold: { on: hold, label: 'Legal hold', badgeText: hold ? 'Locked' : '' },
      storageHref: storageHref
    };
  }

  // ----- F: erasure -----

  const ERASURE_STATEMENT = "This shows how a deletion is carried out across every layer. Whether a request must be granted, and which records must be kept, depends on the law and the organization's policy. This demo does not decide that.";
  const RAW_LINE = "Raw files in Bronze are immutable. Erasure destroys the subject's data key, so their rows there can no longer be read (simulated: no real keys or encryption are used).";
  const EFFECTS_SENTENCE = 'The seven-day KPI tiles do not move: the KPI history is aggregate-only and holds no patient rows.';

  // The footprint table, effects and checks for the erasure list in the local state. `result` is Engine.eraseSubjects for that
  // list (null when nothing is erased); the numbers all come from the engine.
  function erasurePanel(scenario, actions, base, local, result) {
    const ids = Engine.buildPatientPool().map(function (p) { return p.patient_id; });
    const erased = result ? result.erased : [];
    const selected = ids.indexOf(local.selectedSubject) >= 0 ? local.selectedSubject : '';
    let footprint = null;
    if (selected !== '') {
      const f = Engine.subjectFootprint(scenario, actions, selected);
      footprint = {
        subject: selected,
        layers: [
          { layer: 'Bronze (raw files)', before: f.bronze, after: f.bronze, afterText: f.bronze + ' (unreadable)' },
          { layer: 'Staging', before: f.staging, after: 0, afterText: '0' },
          { layer: 'Silver (production)', before: f.silver, after: 0, afterText: '0' },
          { layer: 'Dead-letter queue', before: f.deadLetter, after: 0, afterText: '0' },
          { layer: 'dim_patient', before: f.dimPatient, after: 0, afterText: '0' }
        ]
      };
    }
    let effects = null;
    if (erased.length) {
      const b = Engine.liveSampleCheck(base), a = Engine.liveSampleCheck(result.state);
      effects = {
        before: { published: b.published, abnormal: b.abnormal },
        after: { published: a.published, abnormal: a.abnormal },
        text: 'Published readings: ' + b.published + ' before, ' + a.published + ' after. Abnormal readings: ' + b.abnormal + ' before, ' + a.abnormal + ' after.'
      };
    }
    let eraseReason = '';
    if (local.legalHold) eraseReason = Engine.eraseSubjects(scenario, [], [], { legalHold: true }).reason;
    else if (selected === '') eraseReason = 'Choose a subject first';
    else if (erased.indexOf(selected) >= 0) eraseReason = 'Already erased';
    return {
      stage: 'Stage 8: Archiving/Retirement',
      title: 'Erasure',
      options: ids.map(function (id) { return { id: id }; }),
      selected: selected,
      footprint: footprint,
      statement: ERASURE_STATEMENT,
      rawLine: RAW_LINE,
      effects: effects,
      effectsEmptyText: 'No subject has been erased yet.',
      effectsSentence: EFFECTS_SENTENCE,
      checks: result ? result.checks.map(function (c) {
        return { id: c.id, label: c.label, pass: c.pass, passText: c.pass ? 'Pass' : 'Fail', mark: c.pass ? '✓' : '✗' };
      }) : [],
      checksEmptyText: 'Checks appear after an erasure.',
      erased: erased.slice(),
      canErase: eraseReason === '',
      eraseReason: eraseReason,
      canReset: erased.length > 0
    };
  }

  // ----- vendor table -----

  // The rows of the shared vendor table for stages 5 and 8 (Lineage and catalog already existed; the audit-log row was added for this page).
  const VENDOR_ROWS = ['Lineage and catalog', 'Access and audit log'];

  function vendorSubset() {
    return {
      columns: ['Component', 'Databricks', 'Snowflake', 'Fabric'],
      rows: VENDOR_ROWS.map(function (name) {
        const row = Shared.vendor.rows.filter(function (r) { return r[0] === name; })[0];
        return row ? row.slice() : [name, '', '', ''];
      })
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

  // Never throws. ctx = { scenario, actions, step, local, links: { hqBase, pipelineBase } }. `message` is the result of the last
  // local action, for the live element.
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
      const local = Brain.localstate.normalize(c.local);
      const pipelineHref = link(links.pipelineBase, scenario, actions);
      // The erasure list applies to whatever step is shown; panel B and the effects follow it.
      const result = local.erased.length ? Engine.eraseSubjects(scenario, actions, local.erased) : null;
      const applied = result && result.erased.length ? result : null;
      const shown = applied ? applied.state : state;
      return {
        header: Object.assign({}, header(state, scenario, step, links, actions), { scenario: scenario }),
        contract: contractPanel(),
        phi: phiPanel(shown),
        lineage: lineagePanel(local),
        access: accessPanel(scenario, actions, local),
        retention: retentionPanel(local, pipelineHref === null ? null : pipelineHref + '#stage-storage'),
        erasure: erasurePanel(scenario, actions, state, local, applied),
        vendor: vendorSubset(),
        notice: notice,
        message: local.message,
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
        message: '',
        footer: FOOTER_TEXT
      };
    }
  }

  vm.stepLabel = stepLabel;
  vm.buildViewModel = buildViewModel;
})();
