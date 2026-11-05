(function () {
  'use strict';
  const HQ = globalThis.HQ;
  const Engine = globalThis.Engine;
  const KEYS = ['header', 'stages', 'status', 'tiles', 'today', 'controls', 'incident', 'timeline', 'business', 'vendor', 'notice', 'footer'];

  const controller = HQ.controller.createController(Engine, location.search);
  let player = null;

  function focusSelector(el) {
    if (!el || typeof el.getAttribute !== 'function') return null;
    const cmd = el.getAttribute('data-cmd');
    const dlq = el.getAttribute('data-dlq-id');
    const role = el.getAttribute('data-role');
    const id = el.getAttribute('id');
    const ok = function (v) { return typeof v === 'string' && v.indexOf('"') < 0; };
    if (ok(cmd)) {
      const sc = el.getAttribute('data-scenario');
      return '[data-cmd="' + cmd + '"]' + (ok(dlq) ? '[data-dlq-id="' + dlq + '"]' : '') + (ok(sc) ? '[data-scenario="' + sc + '"]' : '');
    }
    if (ok(role) && role) return '[data-role="' + role + '"]' + (ok(dlq) ? '[data-dlq-id="' + dlq + '"]' : '');
    if (ok(id) && id && /^[A-Za-z][A-Za-z0-9_-]*$/.test(id)) return '#' + id;
    return null;
  }

  function render() {
    const active = document.activeElement;
    const sel = focusSelector(active);
    const chosen = {};
    document.querySelectorAll('select[data-role="discard-reason"]').forEach(function (s) {
      chosen[s.getAttribute('data-dlq-id')] = s.value;
    });
    const regions = HQ.render.renderRegions(controller.getModel());
    KEYS.forEach(function (k) {
      const el = document.getElementById('region-' + k);
      if (el) el.innerHTML = regions[k];
    });
    document.querySelectorAll('select[data-role="discard-reason"]').forEach(function (s) {
      const id = s.getAttribute('data-dlq-id');
      if (!Object.prototype.hasOwnProperty.call(chosen, id)) return;
      const has = Array.prototype.some.call(s.options, function (o) { return o.value === chosen[id]; });
      if (has) s.value = chosen[id];
    });
    if (sel) {
      const again = document.querySelector(sel);
      if (again && again !== active) again.focus();
    }
  }

  function setCaption(text) {
    const el = document.getElementById('caption');
    if (el) el.textContent = text || '';
  }

  function stopPlayer() {
    if (player) { player.stop(); player = null; }
  }

  function dispatch(cmd) {
    const result = controller.dispatch(cmd);
    render();
    return result;
  }

  // Thin wrapper handed to the player: dispatch then re-render.
  const playerController = { dispatch: dispatch, getModel: controller.getModel };

  function watch(mode) {
    if (controller.getModel().error) return;
    stopPlayer();
    const mine = HQ.autoplay.createPlayer({
      controller: playerController,
      plan: HQ.autoplay.scenePlan(Engine, mode),
      setTimer: function (fn, ms) { return window.setTimeout(fn, ms); },
      clearTimer: function (h) { window.clearTimeout(h); },
      now: function () { return performance.now(); },
      onCaption: setCaption,
      onEnd: function () {
        setCaption('Demo finished. You now have control: press Run next batch, or switch scenario.');
        if (player === mine) player = null;
      }
    });
    player = mine;
    mine.start();
  }

  function handle(btn) {
    const cmd = btn.getAttribute('data-cmd');
    const broken = !!controller.getModel().error;
    switch (cmd) {
      case 'watch': watch('short'); return;
      case 'watchFull': watch('full'); return;
      case 'pause': if (player && !broken) player.pause(); return;
      case 'resume': if (player && !broken) player.resume(); return;
      case 'skip': if (player && !broken) player.skipScene(); return;
      case 'stop': stopPlayer(); setCaption(''); return;
    }
    // Every other command is a manual action: stop auto-play first.
    stopPlayer();
    setCaption('');
    const id = btn.getAttribute('data-dlq-id');
    if (cmd === 'scenario') {
      dispatch({ type: 'setScenario', scenario: btn.getAttribute('data-scenario') });
    } else if (cmd === 'discard') {
      const row = btn.closest('tr');
      const sel = row && row.querySelector('select[data-role="discard-reason"]');
      const cmdObj = { type: 'discard', dlqId: id };
      if (sel && sel.getAttribute('data-dlq-id') === id) cmdObj.reason = sel.value;
      dispatch(cmdObj);
    } else if (cmd === 'repair') {
      dispatch({ type: 'repair', dlqId: id });
    } else if (cmd === 'run' || cmd === 'reset' || cmd === 'resolveRetry' || cmd === 'ack' || cmd === 'resolveAlert') {
      dispatch({ type: cmd });
    }
  }

  document.addEventListener('click', function (ev) {
    const t = ev.target;
    const btn = t && t.closest ? t.closest('button[data-cmd]') : null;
    if (!btn || btn.disabled) return;
    handle(btn);
  });

  render();
})();
