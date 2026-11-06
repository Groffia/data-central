'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadValue } = require('./helpers/load');

// The look is shared (shared/praxis.css holds the tokens); the page adds its own rules.
const css = fs.readFileSync(path.join(__dirname, '..', '..', 'shared', 'praxis.css'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, '..', 'src', 'styles.css'), 'utf8');
const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');

function token(name) {
  const m = new RegExp('--' + name + '\\s*:\\s*(#[0-9a-fA-F]{6})\\b').exec(css);
  assert.ok(m, 'token --' + name + ' must be a 6-digit hex in styles.css');
  return m[1];
}
function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function lin(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function lumRgb(a) { return 0.2126 * lin(a[0]) + 0.7152 * lin(a[1]) + 0.0722 * lin(a[2]); }
function lum(hex) { return lumRgb(rgb(hex)); }
function ratio(a, b) {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
// A colour at the given opacity over a backdrop, as an [r,g,b] triple.
function over(fg, bg, alpha) {
  const f = rgb(fg), b = rgb(bg);
  return f.map(function (c, i) { return c * alpha + b[i] * (1 - alpha); });
}
function ratioRgb(a, b) {
  const x = lumRgb(a), y = lumRgb(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
// Declarations of the rule whose selector list contains `sel` exactly.
function rule(sel) {
  const re = new RegExp('(?:^|[}\\s,])' + esc(sel) + '\\s*(?:,[^{]*)?\\{([^}]*)\\}', 'm');
  const m = re.exec(bare);
  assert.ok(m, 'rule for ' + sel);
  return m[1];
}
function decl(body, prop) {
  const m = new RegExp('(?:^|[;\\s])' + prop + '\\s*:\\s*var\\(--([a-z0-9-]+)\\)').exec(body);
  return m ? m[1] : null;
}

// Same table and threshold as the Pipeline and HQ theme tests.
const PAIRS = [
  ['text', 'bg'], ['text', 'panel'], ['text-2', 'panel'],
  ['green', 'panel'], ['red', 'panel-2'], ['amber', 'panel'], ['red', 'panel'], ['indigo', 'panel'],
  ['on-green', 'green'], ['on-amber', 'amber'], ['on-red', 'red'], ['on-indigo', 'indigo'],
  ['text-2', 'bg'], ['text-2', 'panel-2'], ['text', 'panel-2'], ['indigo', 'bg'], ['indigo', 'panel-2'],
  ['amber', 'panel-2'], ['green', 'panel-2']
];
PAIRS.forEach(function (p) {
  test('contrast --' + p[0] + ' on --' + p[1] + ' >= 4.5', () => {
    const r = ratio(token(p[0]), token(p[1]));
    assert.ok(r >= 4.5, p[0] + ' on ' + p[1] + ' = ' + r.toFixed(2));
  });
});

test('styles define reduced-motion and focus-visible rules', () => {
  assert.ok(css.indexOf('prefers-reduced-motion') >= 0);
  assert.ok(css.indexOf(':focus-visible') >= 0);
  assert.ok(/prefers-reduced-motion:\s*reduce\)\s*\{[^}]*transition:\s*none/.test(bare));
});

test('every colour is a token: no hex or rgb() outside :root', () => {
  const outside = bare.replace(/:root\s*\{[^}]*\}/g, '');
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(outside), 'hex colour outside :root');
  assert.ok(!/\brgba?\(|\bhsla?\(/.test(outside), 'rgb/hsl colour outside :root');
});

test('chart lines, sparkline and axis text pass 4.5 on the panel backgrounds', () => {
  const marks = [
    ['.trend .daily', 'color'], ['.trend .trailing', 'color'], ['.trend svg', 'color'],
    ['.trend .axis-label', 'fill'], ['.sparkline', 'color']
  ];
  marks.forEach(function (m) {
    const t = decl(rule(m[0]), m[1]);
    assert.ok(t, m[0] + ' uses a colour token');
    ['panel', 'panel-2', 'bg'].forEach(function (bg) {
      assert.ok(ratio(token(t), token(bg)) >= 4.5, m[0] + ' (' + t + ') on ' + bg);
    });
  });
});

test('chart lines and axis text keep 4.5 on the weekend shading, over both panel backgrounds', () => {
  // The chart sits on --panel-2 (.trend) and draws the weekend rect at fill-opacity .08 in the .weekend colour.
  const shade = decl(rule('.trend .weekend'), 'color');
  assert.ok(shade, 'weekend colour token');
  const alpha = /fill-opacity="([0-9.]+)"/.exec(loadValue().Value.chart.lineChart({
    id: 'x', title: 't', unit: 'pct', dates: ['a', 'b', 'c'], weekendIndexes: [1], series: [{ name: 's', values: [1, 2, 3] }]
  }));
  assert.ok(alpha, 'weekend rect has a fill-opacity');
  const a = Number(alpha[1]);
  ['panel', 'panel-2'].forEach(function (bg) {
    const shaded = over(token(shade), token(bg), a);
    [['.trend .daily', 'color'], ['.trend .trailing', 'color'], ['.trend .axis-label', 'fill']].forEach(function (m) {
      const fg = rgb(token(decl(rule(m[0]), m[1])));
      assert.ok(ratioRgb(fg, shaded) >= 4.5, m[0] + ' on weekend shading over ' + bg + ' = ' + ratioRgb(fg, shaded).toFixed(2));
    });
    assert.ok(ratioRgb(rgb(token('text')), shaded) >= 4.5, 'text on shading over ' + bg);
  });
  // Shading is a low-opacity tint, never a solid fill.
  assert.ok(a > 0 && a <= 0.2, 'weekend opacity ' + a);
});

test('the daily and trailing lines differ in colour and in width, so colour is not the only cue', () => {
  assert.notEqual(decl(rule('.trend .daily'), 'color'), decl(rule('.trend .trailing'), 'color'));
  const { Value } = loadValue();
  const svg = Value.chart.lineChart({ id: 'x', title: 't', unit: 'pct', dates: ['a', 'b'], weekendIndexes: [], series: [
    { name: 'Daily', values: [1, 2], className: 'daily' }, { name: 'Trailing', values: [1, 2], className: 'trailing' }] });
  const widths = (svg.match(/stroke-width="([0-9.]+)"/g) || []);
  assert.equal(new Set(widths).size, 2);
});

test('filled classes use a background token with its --on-* text token', () => {
  ['.held-badge', '.conflict', '.verdict[data-level="ok"]', '.verdict[data-level="warn"]'].forEach(function (sel) {
    const body = rule(sel);
    const bg = decl(body, 'background');
    const fg = decl(body, 'color');
    assert.ok(bg && fg, sel + ' needs background and color tokens');
    assert.equal(fg, 'on-' + bg, sel);
    assert.ok(ratio(token(fg), token(bg)) >= 4.5, sel);
  });
});

test('pressed buttons and the skip link use the indigo pair', () => {
  [rule('button[aria-pressed="true"]'), rule('.skip-link')].forEach(function (body) {
    assert.equal(decl(body, 'background'), 'indigo');
    assert.equal(decl(body, 'color'), 'on-indigo');
  });
});

test('delta directions, held text, check verdicts and panels use text tokens that pass on their background', () => {
  const checks = [
    ['.kpi-delta[data-direction="up"]', 'color', 'amber', ['panel-2', 'panel']],
    ['.kpi-delta[data-direction="down"]', 'color', 'indigo', ['panel-2', 'panel']],
    ['.kpi-delta[data-direction="flat"]', 'color', 'text-2', ['panel-2', 'panel']],
    ['.held-text', 'color', 'amber', ['panel-2', 'panel']],
    ['.verdict[data-level="neutral"]', 'color', 'text', ['panel-2']],
    ['.def-message', 'color', 'text', ['panel']],
    ['.kpi-tile h3', 'color', 'text-2', ['panel-2']],
    ['pre.yaml', 'color', 'text', ['panel']],
    ['.stage-label', 'color', 'text-2', ['panel', 'bg']],
    ['.caption', 'color', 'text-2', ['panel', 'panel-2']]
  ];
  checks.forEach(function (c) {
    const fg = decl(rule(c[0]), c[1]);
    assert.equal(fg, c[2], c[0]);
    c[3].forEach(function (bgName) {
      assert.ok(ratio(token(fg), token(bgName)) >= 4.5, c[0] + ' on ' + bgName);
    });
  });
  // Text on the tile, compare column, metric panel and trend figure (all --panel-2) is --text.
  assert.ok(ratio(token('text'), token('panel-2')) >= 4.5);
});

test('focus highlight is an outline (not colour alone) and the focus ring is visible', () => {
  assert.ok(/outline:\s*3px solid var\(--indigo\)/.test(rule('.focus-target')));
  assert.ok(/:focus-visible\s*\{[^}]*outline:\s*3px solid/.test(bare));
  assert.ok(ratio(token('indigo'), token('panel')) >= 4.5);
});

test('no external url() or @import', () => {
  assert.ok(!/@import/i.test(bare));
  assert.ok(!/url\s*\(/i.test(bare), 'no url() at all');
  assert.ok(!/https?:\/\//i.test(bare));
  assert.ok(!/@font-face/i.test(bare));
});

test('no fixed width above 1000 px outside media queries', () => {
  const outside = bare.replace(/@media[^{]*\{(?:[^{}]*\{[^}]*\})*[^}]*\}/g, '');
  const re = /(?<![-\w])(?:min-)?width\s*:\s*(\d+(?:\.\d+)?)px/g;
  let m;
  while ((m = re.exec(outside))) assert.ok(Number(m[1]) <= 1000, m[0]);
  const mx = /max-width\s*:\s*(\d+)px/g;
  while ((m = mx.exec(outside))) assert.ok(Number(m[1]) <= 1200, m[0]);
});

test('wide tables and charts scroll inside their container, and the renderer wraps every table', () => {
  const body = rule('.table-wrap');
  assert.ok(/overflow-x:\s*auto/.test(body));
  assert.ok(/max-width:\s*100%/.test(body));
  assert.ok(/overflow-x:\s*auto/.test(rule('.trend')));
  assert.ok(/overflow-x:\s*auto/.test(rule('pre.yaml')));
  assert.ok(/width:\s*100%/.test(rule('.trend svg')));
  const { Engine, Value } = loadValue();
  const c = Value.controller.createController(Engine, '?scenario=incident&step=3', '', { hqBase: '../hq/' });
  c.dispatch({ type: 'tableToggle', kpi: 'abnormal-vital-rate' });
  const html = Value.render.all(c.getModel());
  const tables = html.match(/<table\b/g) || [];
  const wrapped = html.match(/<div class="table-wrap"><table\b/g) || [];
  assert.ok(tables.length >= 3);
  assert.equal(wrapped.length, tables.length);
});

test('no horizontal scroll by construction: border-box, capped content column, scroll contained', () => {
  assert.ok(/\*\s*\{\s*box-sizing:\s*border-box/.test(bare));
  assert.ok(/header,\s*main,\s*footer\s*\{[^}]*max-width:\s*1200px/.test(bare));
  assert.ok(/#region-footer\s*\{[^}]*max-width:\s*1168px/.test(bare));
  assert.ok(/body\s*\{[^}]*overflow-x:\s*hidden/.test(bare));
  assert.ok(/\.region\s*\{[^}]*min-width:\s*0/.test(bare));
  assert.ok(/\.kpi-grid\s*\{[^}]*minmax\(200px, 1fr\)/.test(bare));
});

test('no styling by column position', () => {
  assert.ok(!/nth-child|:first-child|:last-child/.test(bare));
});

test('visually-hidden clips instead of display:none', () => {
  const body = rule('.visually-hidden');
  assert.ok(/clip/.test(body) && /position:\s*absolute/.test(body));
  assert.ok(!/display:\s*none|visibility:\s*hidden/.test(body));
});

// ---- no colour alone: every status class the renderer uses has a text cue in its output ----
function tile(over) {
  return Object.assign({
    id: 'x', name: 'Metric X', held: false, heldText: 'as of Batch 2', valueText: '1.0%', deltaDirection: 'flat', deltaText: '+0.0% vs prior 7 days',
    sparkline: { points: [1, 2, 3] }, source: 'gold', definitionBadge: 'v1', freshness: 'fresh'
  }, over);
}

test('held, up, down and flat each carry a text cue in the tile', () => {
  const { Value } = loadValue();
  const held = Value.render.kpis({ kpis: { tiles: [tile({ held: true })] } });
  assert.ok(/class="badge held-badge">Held</.test(held));
  assert.ok(held.indexOf('as of Batch 2') >= 0);
  assert.ok(!/held-badge/.test(Value.render.kpis({ kpis: { tiles: [tile({ held: false })] } })));
  ['up', 'down', 'flat'].forEach(function (d) {
    const h = Value.render.kpis({ kpis: { tiles: [tile({ deltaDirection: d })] } });
    assert.ok(new RegExp('data-direction="' + d + '"><span aria-hidden="true">[^<]+</span> <span class="dir">' + d + '</span>').test(h), d);
  });
});

test('ok, warn and neutral check levels carry a symbol and the verdict text', () => {
  const { Value } = loadValue();
  const cue = { ok: '✓', warn: '⚠', neutral: '–' };
  Object.keys(cue).forEach(function (level) {
    const h = Value.render.check({ check: { level: level, verdict: 'Verdict for ' + level, explain: [] } });
    assert.ok(h.indexOf('data-level="' + level + '"><span aria-hidden="true">' + cue[level] + '</span> Verdict for ' + level) >= 0, level);
  });
  assert.equal(new Set(Object.values(cue)).size, 3);
});

test('a conflict is a visible paragraph (no role=alert) that states the conflict and both values in words', () => {
  const { Value } = loadValue();
  const panel = { name: 'Abnormal Vital Rate', version: 2, publishedId: 'strict_thresholds', options: [], selectedId: '', consumers: [], yaml: '',
    conflict: { text: 'Definition conflict: 1 report disagrees', values: ['9.0%', '6.2%'] } };
  const h = Value.render.definitions({ definitions: { governed: false, message: 'm', metrics: [panel], changelog: [] } });
  assert.ok(/<p class="conflict">Definition conflict: 1 report disagrees \(values: 9\.0%, 6\.2%\)<\/p>/.test(h));
  assert.ok(h.indexOf('role="alert"') < 0);
  const none = Value.render.definitions({ definitions: { governed: true, message: 'm', metrics: [Object.assign({}, panel, { conflict: null })], changelog: [] } });
  assert.ok(none.indexOf('class="conflict"') < 0);
});

test('every data-* status the stylesheet colours exists in the renderer, with a cue', () => {
  const { Value } = loadValue();
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'render.js'), 'utf8');
  ['data-direction', 'data-level', 'data-held'].forEach(function (a) {
    assert.ok(src.indexOf("attr('" + a + "'") >= 0, a);
  });
  assert.ok(Value.render.kpis);
});
