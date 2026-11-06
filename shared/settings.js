(function () {
  'use strict';
  globalThis.Shared = globalThis.Shared || {};

  // Settings, the same on every page: a gear in the top right corner that opens a small panel with a dark mode switch.
  // The choice is kept in localStorage (when the browser allows it) and applied as data-theme on <html>; with no saved
  // choice the page follows the viewer's system setting. Nothing here touches the page's own regions.
  var KEY = 'data-central-theme';
  var SVG = 'http://www.w3.org/2000/svg';
  var GEAR = 'M9.84 4.92 L10.26 2.15 L13.74 2.15 L14.16 4.92 L15.47 5.47 L17.74 3.81 L20.19 6.26 L18.53 8.53 L19.08 9.84 L21.85 10.26 L21.85 13.74 L19.08 14.16 L18.53 15.47 L20.19 17.74 L17.74 20.19 L15.47 18.53 L14.16 19.08 L13.74 21.85 L10.26 21.85 L9.84 19.08 L8.53 18.53 L6.26 20.19 L3.81 17.74 L5.47 15.47 L4.92 14.16 L2.15 13.74 L2.15 10.26 L4.92 9.84 L5.47 8.53 L3.81 6.26 L6.26 3.81 L8.53 5.47 Z M12 8.6 a3.4 3.4 0 1 0 0.001 0 Z';

  function pick(v) { return v === 'dark' || v === 'light' ? v : null; }
  function read(storage) { try { return pick(storage.getItem(KEY)); } catch (e) { return null; } }
  function write(storage, v) { try { storage.setItem(KEY, v); } catch (e) { /* storage is blocked: the choice lasts until the page closes */ } }
  // The theme in force: the saved choice, else the system setting.
  function effective(stored, systemDark) { return pick(stored) || (systemDark ? 'dark' : 'light'); }
  function apply(doc, theme) { doc.documentElement.setAttribute('data-theme', theme); }

  function el(doc, tag, props) {
    var e = doc.createElement(tag);
    Object.keys(props || {}).forEach(function (k) { e.setAttribute(k, props[k]); });
    return e;
  }

  function icon(doc) {
    var svg = doc.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    var path = doc.createElementNS(SVG, 'path');
    path.setAttribute('d', GEAR);
    path.setAttribute('fill-rule', 'evenodd');
    svg.appendChild(path);
    return svg;
  }

  // Builds the gear and its panel and wires them. `state.theme` is the theme in force; `choose(theme)` saves and applies one.
  function mount(doc, state, choose) {
    var wrap = el(doc, 'div', { 'class': 'settings' });
    var btn = el(doc, 'button', { type: 'button', 'class': 'settings-btn', 'aria-label': 'Settings', 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-controls': 'settings-panel' });
    btn.appendChild(icon(doc));
    var panel = el(doc, 'div', { id: 'settings-panel', 'class': 'settings-panel', role: 'group', 'aria-label': 'Settings' });
    panel.hidden = true;
    var title = el(doc, 'p', { 'class': 'stage-label' });
    title.textContent = 'Settings';
    var row = el(doc, 'label', { 'class': 'switch-row' });
    var text = el(doc, 'span', {});
    text.textContent = 'Dark mode';
    var sw = el(doc, 'input', { type: 'checkbox', role: 'switch', 'class': 'switch', id: 'dark-mode' });
    sw.checked = state.theme === 'dark';
    row.appendChild(text);
    row.appendChild(sw);
    panel.appendChild(title);
    panel.appendChild(row);
    wrap.appendChild(btn);
    wrap.appendChild(panel);
    doc.body.appendChild(wrap);

    function setOpen(open, returnFocus) {
      panel.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (!open && returnFocus) btn.focus();
    }
    btn.addEventListener('click', function () { setOpen(panel.hidden); });
    sw.addEventListener('change', function () { choose(sw.checked ? 'dark' : 'light'); });
    doc.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) setOpen(false, true); });
    doc.addEventListener('click', function (e) { if (!panel.hidden && !wrap.contains(e.target)) setOpen(false, false); });
    return { wrap: wrap, button: btn, panel: panel, input: sw };
  }

  function init(win) {
    var doc = win.document;
    var storage = null;
    try { storage = win.localStorage; } catch (e) { storage = null; }
    var mq = typeof win.matchMedia === 'function' ? win.matchMedia('(prefers-color-scheme: dark)') : null;
    var state = { theme: effective(storage ? read(storage) : null, !!(mq && mq.matches)) };
    apply(doc, state.theme);
    function choose(theme) {
      state.theme = pick(theme) || state.theme;
      apply(doc, state.theme);
      if (storage) write(storage, state.theme);
    }
    function build() { mount(doc, state, choose); }
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', build);
    else build();
    return state;
  }

  globalThis.Shared.settings = { KEY: KEY, GEAR: GEAR, effective: effective, apply: apply, mount: mount, init: init };

  // In a browser it starts itself, as early as the head, so the theme is set before the page paints.
  if (typeof window !== 'undefined' && window.document && window.document.documentElement && typeof window.document.documentElement.setAttribute === 'function') {
    try { init(window); } catch (e) { /* settings are optional: the page works without them */ }
  }
})();
