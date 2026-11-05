'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadValue } = require('./helpers/load');

const { Engine, Value } = loadValue();
const C = Value.chart;
const hist = Engine.getHistory();
const dates = hist.map((r) => r.date);
const occ = hist.map((r) => r.beds_occupied / r.beds_staffed);
const sma = occ.map((_, i) => { const w = occ.slice(Math.max(0, i - 6), i + 1); return w.reduce((a, b) => a + b, 0) / w.length; });
const weekends = dates.map((d, i) => ([0, 6].includes(new Date(d + 'T00:00:00Z').getUTCDay()) ? i : -1)).filter((i) => i >= 0);
const two = {
  id: 'c1', title: 'Bed Occupancy', unit: 'pct', dates, weekendIndexes: weekends,
  series: [{ name: 'Daily', values: occ, className: 'daily' }, { name: '7-day', values: sma, className: 'trail' }],
};

function nums(s) { return (s.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?|NaN|Infinity/gi) || []).map(Number); }
function attrs(svg, name) { return [...svg.matchAll(new RegExp('\\s' + name + '="([^"]*)"', 'g'))].map((m) => m[1]); }
function checkGeometry(svg) {
  assert.ok(!/NaN|Infinity|undefined|null/.test(svg), 'no NaN in output');
  const vb = attrs(svg, 'viewBox')[0].split(' ').map(Number);
  const inX = (x) => Number.isFinite(x) && x >= 0 && x <= vb[2];
  const inY = (y) => Number.isFinite(y) && y >= 0 && y <= vb[3];
  for (const d of attrs(svg, 'd')) {
    const n = nums(d.replace(/[ML]/g, ' '));
    assert.ok(n.length % 2 === 0);
    n.forEach((v, i) => assert.ok(i % 2 ? inY(v) : inX(v), d));
  }
  for (const tag of ['rect', 'circle', 'text']) {
    for (const m of svg.matchAll(new RegExp('<' + tag + '\\b[^>]*>', 'g'))) {
      const el = m[0];
      for (const a of ['x', 'cx']) { const v = attrs(el, a)[0]; if (v !== undefined) assert.ok(inX(Number(v)), el); }
      for (const a of ['y', 'cy']) { const v = attrs(el, a)[0]; if (v !== undefined) assert.ok(inY(Number(v)), el); }
      for (const a of ['width', 'height']) { const v = attrs(el, a)[0]; if (v !== undefined) assert.ok(Number.isFinite(Number(v)) && Number(v) >= 0, el); }
    }
  }
}
const pathPoints = (svg) => attrs(svg, 'd').map((d) => (d.match(/[ML]/g) || []).length);

test('scale: min, max and y inverted within plot height', () => {
  const s = C.scale([1, 2, 3], 100);
  assert.strictEqual(s.min, 1);
  assert.strictEqual(s.max, 3);
  assert.strictEqual(s.y(1), 100);
  assert.strictEqual(s.y(3), 0);
  assert.strictEqual(s.y(2), 50);
});
test('scale: flat, single, empty and non-finite input give non-zero range and finite y', () => {
  for (const vals of [[5, 5, 5], [7], [], [NaN, null, undefined, 'x'], [0, 0]]) {
    const s = C.scale(vals, 100);
    assert.ok(s.max > s.min, JSON.stringify(vals));
    assert.ok(Number.isFinite(s.y(vals[0])) && Number.isFinite(s.y(3)));
  }
});
test('scale: ignores non-finite values and clamps out-of-range', () => {
  const s = C.scale([1, NaN, 3, Infinity, null], 100);
  assert.strictEqual(s.min, 1);
  assert.strictEqual(s.max, 3);
  assert.strictEqual(s.y(1e308), 0);
  assert.strictEqual(s.y(-1e308), 100);
  assert.ok(Number.isFinite(C.scale([-1e308, 1e308], 100).y(0)));
});

test('120-point two-series chart: one path each with 120 points, all finite and inside', () => {
  const svg = C.lineChart(two);
  assert.deepStrictEqual(pathPoints(svg), [120, 120]);
  checkGeometry(svg);
  assert.match(svg, /viewBox="0 0 640 220"/);
  assert.match(svg, /width="100%"/);
  assert.ok(!/width="\d+px"/.test(svg));
  const w = [...svg.matchAll(/<path[^>]*stroke-width="([^"]+)"/g)].map((m) => Number(m[1]));
  assert.ok(w[1] > w[0]);
  assert.match(svg, /class="daily"/);
  assert.match(svg, /class="trail"/);
});
test('weekend shading rects present and decorative', () => {
  const svg = C.lineChart(two);
  const rects = svg.match(/<rect class="weekend"[^>]*>/g);
  assert.strictEqual(rects.length, weekends.length);
  assert.ok(rects.every((r) => /aria-hidden="true"/.test(r)));
});
test('axis labels include min, max, first and last date; no last-good marker', () => {
  const svg = C.lineChart(two);
  assert.ok(svg.includes('>' + dates[0] + '<') && svg.includes('>' + dates[119] + '<'));
  assert.ok(svg.includes('>' + C.format(Math.max(...occ, ...sma), 'pct') + '<'));
  assert.ok(!/last[- _]?good|marker|<line|<polygon|<use/i.test(svg));
});
test('role, title, desc present; ids unique per chart id', () => {
  const a = C.lineChart(two);
  const b = C.lineChart(Object.assign({}, two, { id: 'c2' }));
  for (const s of [a, b]) {
    assert.match(s, /role="img"/);
    assert.match(s, /<title id="[^"]+">/);
    assert.match(s, /<desc id="[^"]+">/);
  }
  const ids = [...(a + b).matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.strictEqual(new Set(ids).size, ids.length);
  assert.match(a, /aria-labelledby="c1-title c1-desc"/);
});
test('flat series renders finite', () => {
  const svg = C.lineChart({ id: 'f', title: 'Flat', unit: '', dates: ['a', 'b', 'c'], series: [{ name: 's', values: [3, 3, 3] }] });
  checkGeometry(svg);
  assert.deepStrictEqual(pathPoints(svg), [3]);
});
test('one point: single circle, no path', () => {
  const svg = C.lineChart({ id: 'o', title: 'One', unit: 'days', dates: ['2026-01-01'], series: [{ name: 's', values: [4.2] }] });
  assert.strictEqual((svg.match(/<circle/g) || []).length, 1);
  assert.ok(!/<path/.test(svg));
  checkGeometry(svg);
});
test('empty and all non-finite: empty-state text, no path', () => {
  for (const vals of [[], [NaN, null, undefined]]) {
    const svg = C.lineChart({ id: 'e', title: 'Empty', unit: 'pct', dates: [], series: [{ name: 's', values: vals }] });
    assert.match(svg, /<text[^>]*>No data to chart<\/text>/);
    assert.ok(!/<path|<circle/.test(svg));
    checkGeometry(svg);
  }
  assert.match(C.lineChart({ id: 'n', title: 'None', dates: [], series: [] }), /No data to chart/);
});
test('NaN, negative and spike inputs: dropped or clamped, summary says so', () => {
  const o = {
    id: 's', title: 'Odd', unit: '', dates: ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'],
    series: [{ name: 's', values: [1, NaN, -5, 1e308, null, 2] }],
  };
  const svg = C.lineChart(o);
  checkGeometry(svg);
  assert.deepStrictEqual(pathPoints(svg), [4]);
  assert.match(C.summary(o), /, 2 points could not be drawn$/);
  assert.match(svg, /2 points could not be drawn/);
});
test('summary for Bed Occupancy matches the fixed format', () => {
  const p = (v) => (v * 100).toFixed(1) + '%';
  const exp = 'Bed Occupancy: ' + p(occ[119]) + ' on ' + dates[119] + ', range ' + p(Math.min(...occ)) + ' to ' + p(Math.max(...occ)) + ' over 120 days';
  assert.strictEqual(C.summary(two), exp + ', weekends shaded');
  assert.strictEqual(C.summary(Object.assign({}, two, { weekendIndexes: [] })), exp);
  assert.match(exp, /^Bed Occupancy: \d+\.\d% on 2026-11-03, range \d+\.\d% to \d+\.\d% over 120 days$/);
});
test('number formats: pct, days, plain', () => {
  assert.strictEqual(C.format(0.786, 'pct'), '78.6%');
  assert.strictEqual(C.format(4.66, 'days'), '4.7 days');
  assert.strictEqual(C.format(3, ''), '3.00');
});
test('table: one body row per date, caption equals title, header names series', () => {
  const t = C.table(two);
  assert.strictEqual((t.match(/<tbody>[\s\S]*<\/tbody>/)[0].match(/<tr>/g) || []).length, 120);
  assert.match(t, /<caption>Bed Occupancy<\/caption>/);
  assert.match(t, /<th scope="col">Daily<\/th><th scope="col">7-day<\/th>/);
  assert.ok(t.includes(dates[119]) && t.includes(C.format(occ[119], 'pct')));
});
test('injection title is escaped in svg, summary and table', () => {
  const o = {
    id: '"><x', title: '<img onerror=1>', unit: 'pct', dates: dates.slice(0, 3), weekendIndexes: [],
    series: [{ name: '<b>', values: occ.slice(0, 3), className: '"x' }],
  };
  const svg = C.lineChart(o);
  for (const s of [svg, C.summary(o), C.table(o)]) {
    assert.ok(!s.includes('<img'));
    assert.ok(s.includes('&lt;img onerror=1&gt;'));
  }
  assert.ok(!svg.includes('"><x'));
  assert.ok(!C.table(o).includes('<b>'));
});
test('chart.js is pure: no DOM, random or clock', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'chart.js'), 'utf8');
  assert.ok(!/document|window|Math\.random|Date\.now|new Date\(|toLocale|innerHTML/.test(src));
});
