(function () {
  'use strict';
  const Pipeline = globalThis.Pipeline;
  const Engine = globalThis.Engine;
  const KEYS = ['header', 'batches', 'generation', 'landing', 'matrix', 'rows', 'dlq', 'medallion', 'storage', 'vendor', 'notice', 'footer'];
  // When the focused control is gone or disabled, these commands (in order) are the nearest in its group.
  const GROUPS = { back: ['back', 'next'], next: ['next', 'back'], scenario: ['scenario'], batch: ['batch'], resetTiering: ['resetTiering'] };

  function hqBase() {
    try {
      const m = document.querySelector('meta[name="hq-base"]');
      const c = m && m.getAttribute('content');
      return typeof c === 'string' ? c : '';
    } catch (e) {
      return '';
    }
  }

  const controller = Pipeline.controller.createController(Engine, location.search, location.hash, { hqBase: hqBase() });
  let scrolledToTarget = false;
  let lastStepText = null;
  const NO_SCROLL = { preventScroll: true };

  function ok(v) { return typeof v === 'string' && v.indexOf('"') < 0; }
  function enabled(e) { return !!e && !e.disabled; }

  // What the focused element is, so the same control can be found after the regions are replaced.
  function describe(el) {
    if (!el || typeof el.getAttribute !== 'function') return null;
    const field = el.getAttribute('data-field');
    const cmd = el.getAttribute('data-cmd');
    let region = null;
    KEYS.forEach(function (k) {
      const r = document.getElementById('region-' + k);
      if (r && typeof r.contains === 'function' && r.contains(el)) region = k;
    });
    if (ok(field) && field) {
      const d = { sel: 'input[data-field="' + field + '"]', field: field, region: region };
      if (typeof el.value === 'string') {
        d.value = el.value;
        d.dirty = el.value !== el.getAttribute('value');
        d.start = el.selectionStart;
        d.end = el.selectionEnd;
      }
      return d;
    }
    if (ok(cmd) && cmd) {
      const n = el.getAttribute('data-n');
      const sc = el.getAttribute('data-scenario');
      return {
        sel: 'button[data-cmd="' + cmd + '"]' + (ok(n) && n !== null ? '[data-n="' + n + '"]' : '') + (ok(sc) && sc !== null ? '[data-scenario="' + sc + '"]' : ''),
        cmd: cmd, n: n, region: region
      };
    }
    return null;
  }

  function inRegion(list, key) {
    const r = key ? document.getElementById('region-' + key) : null;
    return Array.prototype.filter.call(list, function (e) { return !r || typeof r.contains !== 'function' || r.contains(e); });
  }

  function fallbackFocus(d) {
    let target = null;
    (GROUPS[d.cmd] || [d.cmd]).forEach(function (c) {
      if (target || !ok(c)) return;
      const list = Array.prototype.filter.call(document.querySelectorAll('button[data-cmd="' + c + '"]'), enabled);
      if (c === 'batch' && d.n !== null) {
        const want = Number(d.n);
        list.sort(function (a, b) { return Math.abs(Number(a.getAttribute('data-n')) - want) - Math.abs(Number(b.getAttribute('data-n')) - want); });
      }
      target = list[0] || null;
    });
    if (!target) {
      const pool = Array.prototype.slice.call(document.querySelectorAll('button[data-cmd]'))
        .concat(Array.prototype.slice.call(document.querySelectorAll('input[data-field]')));
      target = inRegion(pool, d.region).filter(enabled)[0] || null;
    }
    if (target && typeof target.focus === 'function') target.focus(NO_SCROLL);
  }

  // committed: the render follows a committed change, so the renderer's value for that input wins.
  function restoreFocus(d, active, committed) {
    if (!d) return;
    const again = document.querySelector(d.sel);
    if (!enabled(again)) { if (d.cmd) fallbackFocus(d); return; }
    const keep = !!d.field && !committed && d.dirty === true && typeof d.value === 'string';
    if (keep && again.value !== d.value) again.value = d.value;
    if (again !== active && typeof again.focus === 'function') again.focus(NO_SCROLL);
    if (keep && typeof d.start === 'number' && typeof again.setSelectionRange === 'function') {
      try { again.setSelectionRange(d.start, d.end); } catch (e) { /* not a text input: nothing to restore */ }
    }
  }

  // A deep-link target is scrolled into view once, after the first render. Later renders never scroll.
  function scrollToTarget(model) {
    if (scrolledToTarget) return;
    scrolledToTarget = true;
    if (!model.focus) return;
    const el = document.getElementById(model.focus);
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'start' });
  }

  function render(committed) {
    const active = document.activeElement;
    const d = describe(active);
    const model = controller.getModel();
    const regions = Pipeline.render.renderRegions(model);
    KEYS.forEach(function (k) {
      const el = document.getElementById('region-' + k);
      if (el) el.innerHTML = regions[k];
    });
    const caption = document.getElementById('caption');
    if (caption) caption.textContent = model.notice || '';
    const live = document.getElementById('step-live');
    const stepText = model.header && model.header.steps ? String(model.header.steps.text) : '';
    if (live && stepText !== lastStepText) { live.textContent = stepText; lastStepText = stepText; }
    restoreFocus(d, active, committed === true);
    scrollToTarget(model);
  }

  function dispatch(cmd, committed) {
    const result = controller.dispatch(cmd);
    render(committed);
    return result;
  }

  // A positive integer string becomes a number; anything else goes to the controller raw, which refuses it.
  function positive(raw) { return typeof raw === 'string' && /^[1-9][0-9]{0,8}$/.test(raw) ? Number(raw) : raw; }

  function handle(btn) {
    const cmd = btn.getAttribute('data-cmd');
    if (cmd === 'back' || cmd === 'next' || cmd === 'resetTiering') dispatch({ type: cmd });
    else if (cmd === 'scenario') dispatch({ type: 'scenario', scenario: btn.getAttribute('data-scenario') });
    else if (cmd === 'batch') dispatch({ type: 'batch', n: positive(btn.getAttribute('data-n')) });
  }

  document.addEventListener('click', function (ev) {
    const t = ev && ev.target;
    const btn = t && typeof t.closest === 'function' ? t.closest('button[data-cmd]') : null;
    if (!btn || btn.disabled) return;
    handle(btn);
  });

  // Only a committed value (change: blur or Enter) is applied; typing alone never re-renders.
  document.addEventListener('change', function (ev) {
    const t = ev && ev.target;
    const field = t && typeof t.getAttribute === 'function' ? t.getAttribute('data-field') : null;
    if (!field) return;
    dispatch({ type: 'setTiering', field: field, value: String(t.value) }, true);
  });

  render();
})();
