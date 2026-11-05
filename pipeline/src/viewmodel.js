(function () {
  'use strict';
  const Pipeline = (globalThis.Pipeline = globalThis.Pipeline || {});
  const vm = (Pipeline.viewmodel = Pipeline.viewmodel || {});

  // ----- Task 5: header, stepper, batch chips -----

  const NO_BATCH_TEXT = 'No batch has run yet';

  // The detail of the first engine event the last applied action added. The prior state is the same scripted
  // prefix one action shorter; at or below the scenario floor (nothing was added) it is the last event.
  function stepText(state, scenario, step) {
    const events = state.events || [];
    if (!events.length) return NO_BATCH_TEXT;
    const prev = Engine.getState(scenario, Engine.actionsForStep(scenario, step - 1));
    const added = events[(prev.events || []).length];
    return (added || events[events.length - 1]).detail;
  }

  function header(state, scenario, step, hqLink) {
    const m = Engine.AUTOPLAY[scenario].length;
    const floor = Engine.PRELUDE[scenario].length;
    return {
      title: 'Pipeline: Under the Hood',
      subtitle: 'Tamsworth Health: how a vitals export becomes trusted data, stages 1 to 4',
      steps: { n: step, m: m, text: stepText(state, scenario, step) },
      canBack: step > floor,
      canNext: step < m,
      hqHref: hqLink
    };
  }

  function stepLabel(steps) { return 'Step ' + steps.n + ' of ' + steps.m; }

  // The batch whose rows are held back: the batch of the dead-letter entries, only while the gate is not closed.
  function isHeld(state, n) {
    if (state.gate !== 'OPEN' && state.gate !== 'HALF_OPEN') return false;
    const id = 'batch-' + n;
    const dlq = state.dlq || [];
    if (dlq.some(function (d) { return d.batchId === id && d.status === 'open'; })) return true;
    return (state.staging || []).length > 0 && dlq.length > 0 && dlq[0].batchId === id;
  }

  function batchChips(state, selected) {
    const total = state.batchesRun || 0;
    const sel = selected === null || selected === undefined ? total : selected;
    const chips = [];
    for (let n = 1; n <= total; n++) {
      const held = isHeld(state, n);
      chips.push({ n: n, label: 'Batch ' + n + (held ? ' (held)' : ''), held: held, selected: n === sel });
    }
    return chips;
  }

  vm.header = header;
  vm.stepLabel = stepLabel;
  vm.batchChips = batchChips;
})();
