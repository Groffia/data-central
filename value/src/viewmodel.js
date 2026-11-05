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

  vm.header = header;
  vm.stepLabel = stepLabel;
})();
