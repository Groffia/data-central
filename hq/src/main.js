(function () {
  'use strict';
  const HQ = globalThis.HQ;
  const Engine = globalThis.Engine;
  const KEYS = ['header', 'banner', 'stages', 'status', 'tiles', 'today', 'controls', 'incident', 'timeline', 'business', 'vendor', 'notice', 'footer'];

  // Optional deep links into the Pipeline page: only when the page carries <meta name="pipeline-base" content="...">.
  function pipelineBase() {
    try {
      const m = document.querySelector('meta[name="pipeline-base"]');
      const v = m && m.getAttribute('content');
      return typeof v === 'string' && v !== '' ? v : undefined;
    } catch (e) { return undefined; }
  }

  // Same for the Value page: <meta name="value-base" content="...">.
  function valueBase() {
    try {
      const m = document.querySelector('meta[name="value-base"]');
      const v = m && m.getAttribute('content');
      return typeof v === 'string' && v !== '' ? v : undefined;
    } catch (e) { return undefined; }
  }

  // Same for the Brain page: <meta name="brain-base" content="...">.
  function brainBase() {
    try {
      const m = document.querySelector('meta[name="brain-base"]');
      const v = m && m.getAttribute('content');
      return typeof v === 'string' && v !== '' ? v : undefined;
    } catch (e) { return undefined; }
  }

  const controller = HQ.controller.createController(Engine, location.search, { pipelineBase: pipelineBase(), valueBase: valueBase(), brainBase: brainBase() });
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

  function rowControls(rowId) {
    return Array.prototype.filter.call(document.querySelectorAll('[data-dlq-id="' + rowId + '"]'), function (e) {
      return e.getAttribute('data-cmd') || e.getAttribute('data-role');
    });
  }

  function enabled(e) { return e && !e.disabled; }

  // Previous control is gone or disabled: next enabled control in its row, else in a later open row,
  // else Resolve and retry, else Run.
  function fallbackFocus(rowId, prevIdx) {
    let target = null;
    if (rowId && ok(rowId)) {
      const own = rowControls(rowId);
      target = own.filter(function (e, i) { return i >= prevIdx && enabled(e); })[0] || null;
      if (!target) {
        const all = Array.prototype.filter.call(document.querySelectorAll('[data-dlq-id]'), function (e) {
          return (e.getAttribute('data-cmd') || e.getAttribute('data-role')) && enabled(e);
        });
        const order = [];
        document.querySelectorAll('[data-dlq-id]').forEach(function (e) {
          const d = e.getAttribute('data-dlq-id');
          if (order.indexOf(d) < 0) order.push(d);
        });
        const at = order.indexOf(rowId);
        const others = all.filter(function (e) { return e.getAttribute('data-dlq-id') !== rowId; });
        target = others.filter(function (e) { return order.indexOf(e.getAttribute('data-dlq-id')) > at; })[0] || others[0] || null;
      }
    }
    if (!target) {
      const rr = document.querySelector('button[data-cmd="resolveRetry"]');
      target = enabled(rr) ? rr : document.querySelector('button[data-cmd="run"]');
    }
    if (enabled(target) && typeof target.focus === 'function') target.focus();
  }

  function ok(v) { return typeof v === 'string' && v.indexOf('"') < 0; }

  const SCENE_REGION = { act1: 'region-stages', act2: 'region-status', act3: 'region-incident', recovery: 'region-incident', act4: 'region-incident', act5: 'region-business' };
  let sceneId = null;

  let lastScrolledId = null;

  // The region the current scene wants on screen (null when no scene is active).
  function targetId() {
    if (!sceneId) return null;
    let id = SCENE_REGION[sceneId];
    if (!id) return null;
    if (id === 'region-incident') {
      const inc = document.getElementById('region-incident');
      if (!inc || !inc.innerHTML) id = 'region-status';
    }
    return id;
  }

  function scrollTo(id) {
    lastScrolledId = id;
    const el = document.getElementById(id);
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'start' });
  }

  // Scene start: always scroll once.
  function scrollAtSceneStart() {
    lastScrolledId = null;
    const id = targetId();
    if (id) scrollTo(id);
  }

  // After a render: scroll only if the scene's target region has changed since the last scroll.
  function scrollIfTargetChanged() {
    const id = targetId();
    if (id && id !== lastScrolledId) scrollTo(id);
  }

  function render() {
    const active = document.activeElement;
    const sel = focusSelector(active);
    let rowId = null, prevIdx = 0;
    if (sel && active && typeof active.getAttribute === 'function') {
      rowId = active.getAttribute('data-dlq-id');
      if (rowId && ok(rowId)) prevIdx = Math.max(0, rowControls(rowId).indexOf(active));
    }
    const chosen = {};
    document.querySelectorAll('select[data-role="discard-reason"]').forEach(function (s) {
      chosen[s.getAttribute('data-dlq-id')] = s.value;
    });
    const regions = HQ.render.renderRegions(controller.getModel());
    KEYS.forEach(function (k) {
      const el = document.getElementById('region-' + k);
      if (el) el.innerHTML = regions[k];
    });
    const live = document.getElementById('notice-live');
    if (live) live.innerHTML = regions.notice;
    document.querySelectorAll('select[data-role="discard-reason"]').forEach(function (s) {
      const id = s.getAttribute('data-dlq-id');
      if (!Object.prototype.hasOwnProperty.call(chosen, id)) return;
      const has = Array.prototype.some.call(s.options, function (o) { return o.value === chosen[id]; });
      if (has) s.value = chosen[id];
    });
    if (sel) {
      const again = document.querySelector(sel);
      if (enabled(again)) { if (again !== active) again.focus(); }
      else fallbackFocus(rowId, prevIdx);
    }
    if (player) scrollIfTargetChanged();
  }

  function setCaption(text) {
    const el = document.getElementById('caption');
    if (el) el.textContent = text || '';
  }

  function stopPlayer() {
    if (player) { player.stop(); player = null; }
    sceneId = null;
    lastScrolledId = null;
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
      onScene: function (scene) { sceneId = scene && scene.id; scrollAtSceneStart(); },
      onEnd: function () {
        setCaption('Demo finished. You now have control: press Run next batch, or switch scenario.');
        if (player === mine) { player = null; sceneId = null; lastScrolledId = null; }
      }
    });
    player = mine;
    sceneId = null;
    lastScrolledId = null;
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
