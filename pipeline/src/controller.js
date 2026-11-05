(function () {
  'use strict';
  const Pipeline = (globalThis.Pipeline = globalThis.Pipeline || {});
  const ctl = (Pipeline.controller = Pipeline.controller || {});

  const SCENARIOS = ['healthy', 'incident'];
  const TIER_FIELDS = ['hotToWarmDays', 'warmToColdDays', 'retentionDays', 'dailyGB'];

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

  function openingState(Engine, search) {
    const s = typeof search === 'string' ? search : '';
    const fallback = { scenario: 'healthy', actions: openingActions(Engine, 'healthy'), batch: null };
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
      return { scenario: scenario, actions: actions, batch: p.batch };
    } catch (e) {
      return fallback;
    }
  }

  // Tolerates {passed, checks:[{name, ok}]} and variants ({ok}, {pass}, check.passed).
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
      return Object.prototype.hasOwnProperty.call(x, k) && x[k] === y[k];
    });
  }

  function defaultInputs(Engine) {
    const out = {};
    TIER_FIELDS.forEach(function (k) { out[k] = String(Engine.TIERING_DEFAULTS[k]); });
    return out;
  }

  ctl.createController = function createController(Engine, search, hash, opts) {
    const hqBase = opts && typeof opts.hqBase === 'string' ? opts.hqBase : '';
    const error = selfTestError(Engine);
    const open = openingState(Engine, search);
    let scenario = open.scenario;
    let actions = open.actions;
    let selected = null; // null follows the latest batch
    let focus = null;
    let notice = '';
    let tierInputs = defaultInputs(Engine);
    let tierPrev = Pipeline.viewmodel.tiering(tierInputs, null);

    function state() { return Engine.getState(scenario, actions); }
    function stepNow() {
      const n = Engine.stepForActions(scenario, actions);
      return typeof n === 'number' ? n : null;
    }
    function batchesRun() { return state().batchesRun || 0; }

    if (open.batch !== null) {
      try { if (Engine.inspectBatch(scenario, actions, open.batch)) selected = open.batch; } catch (e) { selected = null; }
    }

    function focusValid(id) {
      if (typeof id !== 'string' || id === '') return false;
      if (id === 'stage-storage') return true;
      return state().dlq.some(function (d) { return d.dlqId === id; });
    }
    if (typeof hash === 'string') {
      const id = hash.charAt(0) === '#' ? hash.slice(1) : hash;
      if (focusValid(id)) focus = id;
    }

    function hqLink() {
      if (!hqBase) return '';
      const step = Engine.stepForActions(scenario, actions);
      if (typeof step === 'number') return hqBase + '?scenario=' + scenario + '&step=' + step;
      const text = Engine.encodeActions(actions);
      return hqBase + '?scenario=' + scenario + (text === null ? '' : '&a=' + text);
    }

    function getModel() {
      const st = state();
      const total = st.batchesRun || 0;
      const sel = selected !== null && selected <= total ? selected : null;
      const n = sel !== null ? sel : total;
      const inspect = n ? Engine.inspectBatch(scenario, actions, n) : null;
      return Pipeline.viewmodel.buildViewModel({
        state: st, scenario: scenario, actions: actions.slice(), step: stepNow(),
        inspect: inspect, selectedBatch: sel,
        tieringInputs: Object.assign({}, tierInputs),
        tieringPrevious: tierPrev ? JSON.parse(JSON.stringify(tierPrev)) : null,
        hqLink: hqLink(), focus: focus === null ? '' : focus,
        notice: notice, error: error
      });
    }

    function finish(ok, n) { notice = n === null ? '' : n; return { ok: ok, notice: n }; }

    // After the actions change: keep the batch if it still exists (else follow the latest) and the focus if it still exists.
    function afterMove() {
      if (selected !== null && selected > batchesRun()) selected = null;
      if (focus !== null && !focusValid(focus)) focus = null;
    }

    // The number of leading actions equal to the scripted run (same keys and values), at least the scenario floor.
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
        const k = snapStep();
        actions = Engine.actionsForStep(scenario, k);
        afterMove();
        return finish(true, 'Showing the scripted run at step ' + k);
      }
      const want = cur + delta;
      if (want < Engine.PRELUDE[scenario].length) return finish(true, 'Already at the first step');
      if (want > Engine.AUTOPLAY[scenario].length) return finish(true, 'Already at the last step');
      actions = Engine.actionsForStep(scenario, want);
      afterMove();
      return finish(true, null);
    }

    function dispatch(cmd) {
      if (error) return { ok: false, notice: 'Controls are disabled.' };
      cmd = cmd && typeof cmd === 'object' ? cmd : {};
      const t = cmd.type;
      if (t === 'back') return step(-1);
      if (t === 'next') return step(1);
      if (t === 'scenario') {
        if (SCENARIOS.indexOf(cmd.scenario) < 0) return finish(false, 'Unknown scenario');
        scenario = cmd.scenario;
        actions = openingActions(Engine, scenario);
        selected = null;
        focus = null;
        return finish(true, null);
      }
      if (t === 'batch') {
        const raw = cmd.n;
        const n = typeof raw === 'number' ? raw : typeof raw === 'string' && /^[0-9]+$/.test(raw) ? Number(raw) : NaN;
        if (!Number.isSafeInteger(n) || n < 1 || n > batchesRun()) {
          return finish(false, 'Batch ' + String(raw).slice(0, 20) + ' has not run');
        }
        selected = n;
        focus = null;
        return finish(true, null);
      }
      if (t === 'setTiering') {
        if (TIER_FIELDS.indexOf(cmd.field) < 0) return finish(false, 'Unknown field');
        const next = Object.assign({}, tierInputs);
        next[cmd.field] = typeof cmd.value === 'string' ? cmd.value : String(cmd.value);
        tierInputs = next;
        const r = Pipeline.viewmodel.tiering(tierInputs, tierPrev);
        if (r.valid) tierPrev = r;
        return finish(true, null);
      }
      if (t === 'resetTiering') {
        tierInputs = defaultInputs(Engine);
        tierPrev = Pipeline.viewmodel.tiering(tierInputs, null);
        return finish(true, null);
      }
      return finish(false, 'Unknown command');
    }

    return {
      getModel: getModel,
      dispatch: dispatch,
      scenario: function () { return scenario; },
      actions: function () { return actions.map(function (a) { return Object.assign({}, a); }); }
    };
  };
})();
