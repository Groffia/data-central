(function () {
  'use strict';
  const Brain = (globalThis.Brain = globalThis.Brain || {});
  const ctl = (Brain.controller = Brain.controller || {});

  const SCENARIOS = ['healthy', 'incident'];
  const STAGE_IDS = ['stage-contract', 'stage-phi', 'stage-lineage', 'stage-access', 'stage-retention', 'stage-erasure'];
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

  // Same URL rules as the Pipeline and Value controllers (no batch parameter on this page).
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

  // '' when the self-test passes.
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
    let local = Brain.localstate.initial();

    // Throws if the engine does; dispatch treats that as a broken engine.
    function stepNow() {
      const n = Engine.stepForActions(scenario, actions);
      return typeof n === 'number' ? n : null;
    }

    function buildModel() {
      return Brain.viewmodel.buildViewModel({
        scenario: scenario, actions: actions.slice(), step: stepNow(), local: local,
        links: { hqBase: links.hqBase, pipelineBase: links.pipelineBase }
      });
    }

    function getModel() {
      let m = null;
      try { m = buildModel(); } catch (e) { failure = failure || 'Engine error: ' + String(e && e.message); }
      if (!m) m = Brain.viewmodel.buildViewModel({ scenario: 'healthy', actions: null, step: null, local: local, links: links });
      if (failure) m.notice = failure;
      return m;
    }

    let focusTarget = '';
    if (!failure && typeof hash === 'string') {
      const id = hash.charAt(0) === '#' ? hash.slice(1) : hash;
      if (STAGE_IDS.indexOf(id) >= 0) focusTarget = id;
    }

    function snapStep() {
      const script = Engine.AUTOPLAY[scenario];
      const top = Math.min(actions.length, script.length);
      let k = 0;
      while (k < top && sameAction(actions[k], script[k])) k++;
      return Math.max(k, Engine.PRELUDE[scenario].length);
    }

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

    // A local-state command (returns true when the state, message included, is different afterwards).
    function localAction(action) {
      const next = Brain.localstate.reduce(local, action);
      const changed = JSON.stringify(next) !== JSON.stringify(local);
      local = next;
      return changed;
    }

    function apply(cmd) {
      const t = cmd.type;
      if (t === 'back') return step(-1);
      if (t === 'next') return step(1);
      if (t === 'scenario') {
        if (typeof cmd.value !== 'string' || SCENARIOS.indexOf(cmd.value) < 0) return false;
        if (cmd.value === scenario) return false; // choosing the active scenario keeps the steps and the local state
        scenario = cmd.value;
        actions = openingActions(Engine, scenario);
        local = Brain.localstate.initial();
        focusTarget = '';
        return true;
      }
      if (t === 'node') return localAction({ type: 'selectNode', id: cmd.id });
      if (t === 'selectSubject') return localAction({ type: 'selectSubject', id: cmd.id });
      if (t === 'erase') return localAction({ type: 'eraseSubject' });
      if (t === 'resetErasures') return localAction({ type: 'resetErasures' });
      if (t === 'hold') return localAction({ type: local.legalHold ? 'holdOff' : 'holdOn' });
      if (t === 'toggleList') return localAction({ type: 'toggleList' });
      return false;
    }

    function dispatch(cmd) {
      if (failure) return;
      if (!cmd || typeof cmd !== 'object' || Array.isArray(cmd)) return;
      try {
        apply(cmd);
      } catch (e) {
        failure = 'Engine error: ' + String(e && e.message);
        return;
      }
    }

    const api = { getModel: getModel, dispatch: dispatch };
    Object.defineProperty(api, 'focusTarget', { enumerable: true, get: function () { return focusTarget; } });
    return api;
  };
})();
