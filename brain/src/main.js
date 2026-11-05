(function () {
  'use strict';
  const Brain = globalThis.Brain;
  const Engine = globalThis.Engine;
  // Footer is static in index.html and never rendered here.
  const KEYS = ['header', 'notice', 'contract', 'phi', 'lineage', 'access', 'retention', 'erasure', 'vendor'];
  // When the focused control is gone or disabled, these commands (in order) are the nearest in its group.
  const GROUPS = { back: ['back', 'next'], next: ['next', 'back'] };
  // Identity attributes besides data-cmd: which control of its kind this is.
  const IDENT = ['data-id', 'data-value'];
  const NO_SCROLL = { preventScroll: true };

  function meta(name) {
    try {
      const m = document.querySelector('meta[name="' + name + '"]');
      const c = m && m.getAttribute('content');
      return typeof c === 'string' ? c : '';
    } catch (e) {
      return '';
    }
  }

  const controller = Brain.controller.createController(Engine, location.search, location.hash, {
    hqBase: meta('hq-base'), pipelineBase: meta('pipeline-base')
  });
  let scrolledToTarget = false;
  let lastStepText = null;
  let lastLive = '';
  let highlighted = '';
  const lastHtml = {}; // region key -> the string last written, so unchanged regions are left alone

  function ok(v) { return typeof v === 'string' && v.indexOf('"') < 0; }
  function enabled(e) { return !!e && !e.disabled; }

  function selectorOf(el, cmd) {
    const tag = typeof el.tagName === 'string' && el.tagName.toLowerCase() === 'select' ? 'select' : 'button';
    let sel = tag + '[data-cmd="' + cmd + '"]';
    IDENT.forEach(function (a) {
      const v = el.getAttribute(a);
      if (v !== null && ok(v)) sel += '[' + a + '="' + v + '"]';
    });
    return sel;
  }

  // What the focused element is, so the same control can be found after its region is replaced.
  function describe(el) {
    if (!el || typeof el.getAttribute !== 'function') return null;
    const cmd = el.getAttribute('data-cmd');
    if (!ok(cmd) || !cmd) return null;
    let region = null;
    KEYS.forEach(function (k) {
      const r = document.getElementById('region-' + k);
      if (r && typeof r.contains === 'function' && r.contains(el)) region = k;
    });
    return { sel: selectorOf(el, cmd), cmd: cmd, region: region };
  }

  function inRegion(list, key) {
    const r = key ? document.getElementById('region-' + key) : null;
    return Array.prototype.filter.call(list, function (e) { return !r || typeof r.contains !== 'function' || r.contains(e); });
  }

  function fallbackFocus(d) {
    let target = null;
    (GROUPS[d.cmd] || []).forEach(function (c) {
      if (target) return;
      target = Array.prototype.filter.call(document.querySelectorAll('button[data-cmd="' + c + '"]'), enabled)[0] || null;
    });
    if (!target) {
      const pool = Array.prototype.slice.call(document.querySelectorAll('button[data-cmd]'))
        .concat(Array.prototype.slice.call(document.querySelectorAll('select[data-cmd]')));
      target = inRegion(pool, d.region).filter(enabled)[0] || null;
    }
    if (target && typeof target.focus === 'function') target.focus(NO_SCROLL);
  }

  function restoreFocus(d, active) {
    if (!d) return;
    const again = document.querySelector(d.sel);
    if (!enabled(again)) { fallbackFocus(d); return; }
    if (again !== active && typeof again.focus === 'function') again.focus(NO_SCROLL);
  }

  // The deep-link target is highlighted on every render while the controller still reports it, and scrolled
  // into view once, after the first render. No other render scrolls.
  function applyFocusTarget() {
    const id = controller.focusTarget;
    if (highlighted && highlighted !== id) {
      const old = document.getElementById(highlighted);
      if (old && old.classList && typeof old.classList.remove === 'function') old.classList.remove('focus-target');
    }
    highlighted = id;
    if (!id) { scrolledToTarget = true; return; }
    const el = document.getElementById(id);
    if (!el) return;
    if (el.classList && typeof el.classList.add === 'function') el.classList.add('focus-target');
    if (!scrolledToTarget) {
      scrolledToTarget = true;
      if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'start' });
    }
  }

  // The one place the page assigns innerHTML.
  function setHTML(el, html) { el.innerHTML = html; }

  // The result of a local action (erase, reset, legal hold) is announced from one persistent live element outside the
  // regions, and only when its text changes. A render that carries no message leaves it alone.
  function announce(model) {
    const live = document.getElementById('brain-live');
    const text = model && typeof model.message === 'string' ? model.message : '';
    if (!live || !text) return;
    if (text !== lastLive) { live.textContent = text; lastLive = text; }
  }

  function render() {
    const active = document.activeElement;
    const d = describe(active);
    const model = controller.getModel();
    KEYS.forEach(function (k) {
      const el = document.getElementById('region-' + k);
      if (!el) return;
      const html = Brain.render[k](model);
      if (lastHtml[k] !== html) { setHTML(el, html); lastHtml[k] = html; }
    });
    const caption = document.getElementById('caption');
    const stepText = model.header && model.header.steps ? String(model.header.steps.text) : '';
    if (caption && stepText !== lastStepText) { caption.textContent = stepText; lastStepText = stepText; }
    announce(model);
    restoreFocus(d, active);
    applyFocusTarget();
  }

  function dispatch(cmd) {
    controller.dispatch(cmd);
    render();
  }

  function handle(btn) {
    const cmd = btn.getAttribute('data-cmd');
    if (cmd === 'back' || cmd === 'next' || cmd === 'hold' || cmd === 'erase') dispatch({ type: cmd });
    else if (cmd === 'scenario') dispatch({ type: 'scenario', value: btn.getAttribute('data-value') });
    else if (cmd === 'node') dispatch({ type: 'node', id: btn.getAttribute('data-id') });
    else if (cmd === 'reset-erasures') dispatch({ type: 'resetErasures' });
    else if (cmd === 'list-toggle') dispatch({ type: 'toggleList' });
  }

  document.addEventListener('click', function (ev) {
    const t = ev && ev.target;
    const btn = t && typeof t.closest === 'function' ? t.closest('button[data-cmd]') : null;
    if (!btn || btn.disabled) return;
    handle(btn);
  });

  // The subject select commits on change; nothing else listens for it.
  document.addEventListener('change', function (ev) {
    const t = ev && ev.target;
    if (!t || typeof t.getAttribute !== 'function' || t.getAttribute('data-cmd') !== 'select-subject') return;
    dispatch({ type: 'selectSubject', id: String(t.value) });
  });

  render();
})();
