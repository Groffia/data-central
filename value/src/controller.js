(function () {
  'use strict';
  const Value = (globalThis.Value = globalThis.Value || {});
  const ctl = (Value.controller = Value.controller || {});

  const SCENARIOS = ['healthy', 'incident'];
  const STAGE_IDS = ['stage-definitions', 'stage-check'];
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  function openingActions(Engine, scenario) {
    return scenario === 'healthy' ? Engine.actionsForStep('healthy', 1).slice() : Engine.actionsForStep(scenario, 0).slice();
  }

  // The decoded `a=` actions if they replay without throwing, else null.
  function usableActions(Engine, scenario, p) {
    if (!Array.isArray(p.actions)) return null;
    try {
      Engine.getState(scenario, p.actions);
      return p.actions.slice();
    } catch (e) {
      return null;
    }
  }

  // Same URL rules as Pipeline's controller (no batch parameter on this page).
  function openingState(Engine, search) {
    const s = typeof search === 'string' ? search : '';
    const fallback = { scenario: 'healthy', actions: openingActions(Engine, 'healthy') };
    if (!/[?&]scenario=(healthy|incident)(&|$)/.test(s)) return fallback;
    try {
      const p = Engine.parseLinkParams(s);
      const scenario = SCENARIOS.indexOf(p.scenario) >= 0 ? p.scenario : 'healthy';
      let actions = usableActions(Engine, scenario, p);
      if (!actions) {
        const sm = /[?&]step=([^&]*)/.exec(s);
        if (scenario === 'healthy' && !(sm && sm[1] !== '')) actions = openingActions(Engine, 'healthy');
        else actions = Engine.actionsForStep(scenario, p.step).slice();
      }
      return { scenario: scenario, actions: actions };
    } catch (e) {
      return fallback;
    }
  }

  // Same wording as Pipeline's controller. '' when the self-test passes.
  function selfTestError(Engine) {
    let r;
    try { r = Engine.selfTest(); } catch (e) { return 'Engine self-test failed: ' + String(e && e.message); }
    const checks = (r && r.checks) || [];
    const good = r && (r.passed !== undefined ? r.passed : r.ok !== undefined ? r.ok : r.pass);
    if (good) return '';
    const failing = checks.filter(function (c) { return !(c.ok !== undefined ? c.ok : c.passed); })
      .map(function (c) { return c.name; });
    return 'Engine self-test failed: ' + (failing.length ? failing.join(', ') : 'unknown check');
  }

  function sameAction(x, y) {
    if (x === null || typeof x !== 'object') return false;
    const ks = Object.keys(y);
    return Object.keys(x).length === ks.length && ks.every(function (k) {
      return has(x, k) && x[k] === y[k];
    });
  }

  ctl.createController = function createController(Engine, search, hash, opts) {
    const links = {
      hqBase: opts && typeof opts.hqBase === 'string' ? opts.hqBase : '',
      pipelineBase: opts && typeof opts.pipelineBase === 'string' ? opts.pipelineBase : ''
    };
    let failure = selfTestError(Engine); // set when the engine fails its self-test or throws: controls go inert
    let scenario = 'healthy';
    let actions = [];
    try {
      const open = openingState(Engine, search);
      scenario = open.scenario;
      actions = open.actions;
    } catch (e) {
      failure = failure || 'Engine error: ' + String(e && e.message);
    }
    let defState = Value.definitions.initial();
    let openTables = {};
    let explainOpen = false;
    const listeners = [];

    // Throws if the engine does; dispatch treats that as a broken engine.
    function stepNow() {
      const n = Engine.stepForActions(scenario, actions);
      return typeof n === 'number' ? n : null;
    }

    function buildModel() {
      return Value.viewmodel.buildViewModel({
        scenario: scenario, actions: actions.slice(), step: stepNow(), defState: defState,
        links: { hqBase: links.hqBase, pipelineBase: links.pipelineBase },
        openTables: Object.assign({}, openTables), explainOpen: explainOpen
      });
    }

    function getModel() {
      let m = null;
      try { m = buildModel(); } catch (e) { failure = failure || 'Engine error: ' + String(e && e.message); }
      if (!m) m = Value.viewmodel.buildViewModel({ scenario: 'healthy', actions: null, step: null, defState: defState, links: links, openTables: {} });
      if (failure) m.notice = failure;
      return m;
    }

    // The four tile ids come from the model, never typed in here.
    function kpiIds() {
      try { return buildModel().kpis.tiles.map(function (t) { return t.id; }); } catch (e) { return []; }
    }

    let focusTarget = '';
    if (!failure && typeof hash === 'string') {
      const id = hash.charAt(0) === '#' ? hash.slice(1) : hash;
      if (STAGE_IDS.indexOf(id) >= 0 || (id.indexOf('kpi-') === 0 && kpiIds().map(function (k) { return 'kpi-' + k; }).indexOf(id) >= 0)) focusTarget = id;
    }

    function notify() {
      listeners.slice().forEach(function (fn) { try { fn(); } catch (e) { /* a bad listener never breaks the controller */ } });
    }

    function snapStep() {
      const script = Engine.AUTOPLAY[scenario];
      const top = Math.min(actions.length, script.length);
      let k = 0;
      while (k < top && sameAction(actions[k], script[k])) k++;
      return Math.max(k, Engine.PRELUDE[scenario].length);
    }

    // Returns true when something changed.
    function step(delta) {
      const cur = stepNow();
      if (cur === null) {
        actions = Engine.actionsForStep(scenario, snapStep());
        return true;
      }
      const want = cur + delta;
      if (want < Engine.PRELUDE[scenario].length || want > Engine.AUTOPLAY[scenario].length) return false;
      actions = Engine.actionsForStep(scenario, want);
      return true;
    }

    const isMetric = function (m) { return typeof m === 'string' && has(Engine.METRIC_DEFINITIONS, m); };

    function apply(cmd) {
      const t = cmd.type;
      if (t === 'back') return step(-1);
      if (t === 'next') return step(1);
      if (t === 'scenario') {
        if (typeof cmd.value !== 'string' || SCENARIOS.indexOf(cmd.value) < 0) return false;
        if (cmd.value === scenario) return false; // choosing the active scenario keeps the steps and definitions
        scenario = cmd.value;
        actions = openingActions(Engine, scenario);
        defState = Value.definitions.initial();
        openTables = {};
        explainOpen = false;
        focusTarget = '';
        return true;
      }
      if (t === 'select') {
        if (!isMetric(cmd.metric) || typeof cmd.definitionId !== 'string') return false;
        if (!Engine.METRIC_DEFINITIONS[cmd.metric].definitions.some(function (d) { return d.id === cmd.definitionId; })) return false;
        defState = Value.definitions.reduce(defState, { type: 'select', metric: cmd.metric, definitionId: cmd.definitionId });
        return true;
      }
      if (t === 'publish' || t === 'rollback') {
        if (!isMetric(cmd.metric)) return false;
        defState = Value.definitions.reduce(defState, { type: t, metric: cmd.metric });
        return true;
      }
      if (t === 'reset') {
        defState = Value.definitions.reduce(defState, { type: 'reset' });
        return true;
      }
      if (t === 'mode') {
        if (typeof cmd.governed !== 'boolean') return false;
        defState = Value.definitions.reduce(defState, { type: 'mode', governed: cmd.governed });
        return true;
      }
      if (t === 'explainToggle') {
        // The browser has already opened or closed the disclosure; remember it so later renders keep it. No re-render.
        if (typeof cmd.open === 'boolean') explainOpen = cmd.open;
        return false;
      }
      if (t === 'tableToggle') {
        if (typeof cmd.kpi !== 'string' || kpiIds().indexOf(cmd.kpi) < 0) return false;
        const next = Object.assign({}, openTables);
        next[cmd.kpi] = next[cmd.kpi] !== true;
        openTables = next;
        return true;
      }
      return false;
    }

    function dispatch(cmd) {
      if (failure) return;
      if (!cmd || typeof cmd !== 'object' || Array.isArray(cmd)) return;
      let changed = false;
      try {
        changed = apply(cmd);
      } catch (e) {
        failure = 'Engine error: ' + String(e && e.message);
        return;
      }
      if (changed) notify();
    }

    function subscribe(fn) {
      if (typeof fn !== 'function') return function () {};
      listeners.push(fn);
      return function () {
        const i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    }

    const api = { getModel: getModel, dispatch: dispatch, subscribe: subscribe };
    Object.defineProperty(api, 'focusTarget', { enumerable: true, get: function () { return focusTarget; } });
    return api;
  };
})();
