(function () {
  'use strict';
  const HQ = (globalThis.HQ = globalThis.HQ || {});
  const ctl = (HQ.controller = HQ.controller || {});
  ctl.DISCARD_REASONS = HQ.viewmodel.DISCARD_REASONS;

  const ENGINE_TYPE = {
    run: 'runBatch', repair: 'repairRow', discard: 'discardRow',
    resolveRetry: 'resolveRetry', ack: 'ackAlert', resolveAlert: 'resolveAlert'
  };
  const SCENARIOS = ['healthy', 'incident'];

  function startFor(Engine, scenario) {
    return scenario === 'incident' ? Engine.PRELUDE.incident.slice() : Engine.actionsForStep('healthy', 1).slice();
  }

  function openingState(Engine, search) {
    const s = typeof search === 'string' ? search : '';
    if (!/[?&]scenario=(healthy|incident)(&|$)/.test(s)) return { scenario: 'healthy', actions: startFor(Engine, 'healthy') };
    try {
      const p = Engine.parseLinkParams(s);
      const sm = /[?&]step=([^&]*)/.exec(s);
      if (p.scenario === 'healthy' && !(sm && sm[1] !== '')) return { scenario: 'healthy', actions: startFor(Engine, 'healthy') };
      const scenario = SCENARIOS.indexOf(p.scenario) >= 0 ? p.scenario : 'healthy';
      return { scenario: scenario, actions: Engine.actionsForStep(scenario, p.step).slice() };
    } catch (e) {
      return { scenario: 'healthy', actions: startFor(Engine, 'healthy') };
    }
  }

  // Tolerates {passed, checks:[{name, ok}]} and variants ({ok}, {pass}, check.passed).
  function selfTestError(Engine) {
    let r;
    try { r = Engine.selfTest(); } catch (e) { return 'Engine self-test failed: ' + String(e && e.message); }
    const checks = (r && r.checks) || [];
    const good = r && (r.passed !== undefined ? r.passed : r.ok !== undefined ? r.ok : r.pass);
    if (good) return null;
    const failing = checks.filter(function (c) { return !(c.ok !== undefined ? c.ok : c.passed); })
      .map(function (c) { return c.name; });
    return 'Engine self-test failed: ' + (failing.length ? failing.join(', ') : 'unknown check');
  }

  ctl.createController = function createController(Engine, search) {
    const error = selfTestError(Engine);
    const open = openingState(Engine, search);
    let scenario = open.scenario;
    let actions = open.actions;
    let notice = null;
    const ctx = { exportRows: Engine.generateExport(1, 'healthy').rows.length, tiering: Engine.TIERING_DEFAULTS };

    function state() { return Engine.getState(scenario, actions); }
    function getModel() {
      return HQ.viewmodel.buildViewModel(state(), { notice: notice, error: error, scenario: scenario }, ctx);
    }
    function finish(ok, n) { notice = n; return { ok: ok, notice: n }; }

    function dispatch(cmd) {
      if (error) return { ok: false, notice: 'Controls are disabled.' };
      cmd = cmd || {};
      const t = cmd.type;
      if (t === 'setScenario' || t === 'reset') {
        const target = t === 'reset' ? scenario : cmd.scenario;
        if (SCENARIOS.indexOf(target) < 0) return finish(false, 'Unknown scenario');
        scenario = target;
        actions = startFor(Engine, scenario);
        return finish(true, null);
      }
      if (t === 'setActions') {
        if (!Array.isArray(cmd.actions)) return finish(false, 'Invalid actions');
        actions = cmd.actions.slice();
        return finish(true, null);
      }
      if (!Object.prototype.hasOwnProperty.call(ENGINE_TYPE, t)) return finish(false, 'Unknown command');

      const action = { type: ENGINE_TYPE[t] };
      if (t === 'repair' || t === 'discard') action.dlqId = cmd.dlqId;
      if (t === 'discard') {
        let reason = cmd.reason;
        if (reason === undefined) {
          const row = getModel().incident.rows.filter(function (r) { return r.dlqId === cmd.dlqId; })[0];
          reason = row ? row.suggestedReason : undefined;
        }
        if (ctl.DISCARD_REASONS.indexOf(reason) < 0) return finish(false, 'Unknown discard reason');
        action.reason = reason;
      }

      const cur = state();
      const next = Engine.getState(scenario, actions.concat([action]));
      const ce = cur.events, ne = next.events;
      const last = ne[ne.length - 1];
      if (ne.length > ce.length && last && last.type === 'ACTION_REJECTED') {
        return finish(false, last.detail);
      }
      if (ne.length === ce.length && next.clock.epoch === cur.clock.epoch) {
        return finish(true, t === 'repair' ? 'No change: row already repaired' : 'No change');
      }
      actions = actions.concat([action]);
      return finish(true, null);
    }

    return {
      getModel: getModel,
      dispatch: dispatch,
      scenario: function () { return scenario; },
      actions: function () { return actions.slice(); }
    };
  };
})();
