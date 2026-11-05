'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadBrain } = require('./helpers/load');

const L = loadBrain();
const G = L.Brain.graph;
const R = L.Brain.render;
const V = L.Brain.viewmodel;
const E = L.Engine;
const J = (x) => JSON.parse(JSON.stringify(x));
const nodes = J(L.Brain.lineage.nodes);
const count = (s, sub) => s.split(sub).length - 1;
function model(local) {
  return V.buildViewModel({ scenario: 'incident', actions: E.actionsForStep('incident', 3), step: 3, links: {}, local: local });
}
const page = (local) => R.lineage(model(local));

test('layout: a box for every node, finite numbers, five columns by layer, inside the viewBox', () => {
  const lay = G.layout(nodes);
  assert.ok(Number.isFinite(lay.width) && Number.isFinite(lay.height) && lay.width > 0 && lay.height > 0);
  nodes.forEach((n) => {
    const b = lay.boxes[n.id];
    assert.ok(b, n.id);
    [b.x, b.y, b.w, b.h].forEach((v) => assert.ok(Number.isFinite(v), n.id));
    assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= lay.width && b.y + b.h <= lay.height, n.id + ' inside');
  });
  const xs = [0, 1, 2, 3, 4].map((layer) => new Set(nodes.filter((n) => n.layer === layer).map((n) => lay.boxes[n.id].x)));
  xs.forEach((s) => assert.strictEqual(s.size, 1));
  const colX = xs.map((s) => [...s][0]);
  assert.deepStrictEqual(colX, colX.slice().sort((a, b) => a - b));
  assert.strictEqual(new Set(colX).size, 5);
});

test('layout: boxes in one column do not overlap; a column of fewer nodes is centred', () => {
  const lay = G.layout(nodes);
  for (let layer = 0; layer <= 4; layer++) {
    const col = nodes.filter((n) => n.layer === layer).map((n) => lay.boxes[n.id]).sort((a, b) => a.y - b.y);
    for (let i = 1; i < col.length; i++) assert.ok(col[i].y >= col[i - 1].y + col[i - 1].h, 'layer ' + layer);
    const top = col[0].y, bottom = lay.height - (col[col.length - 1].y + col[col.length - 1].h);
    assert.ok(Math.abs(top - bottom) < 1e-9, 'centred ' + layer);
  }
});

test('layout and edgePath survive junk without NaN', () => {
  [undefined, null, 7, 'x', {}, [], [null], [{ id: 'a' }], [{ id: 'a', layer: 'x' }], [{ id: 'a', layer: -3 }, { id: 'b', layer: 99 }]].forEach((bad) => {
    const lay = G.layout(bad);
    assert.ok(Number.isFinite(lay.width) && Number.isFinite(lay.height));
    Object.values(lay.boxes).forEach((b) => [b.x, b.y, b.w, b.h].forEach((v) => assert.ok(Number.isFinite(v))));
  });
  assert.strictEqual(G.edgePath(null, null), '');
  assert.strictEqual(G.edgePath({ x: 0, y: 0, w: 10, h: 10 }, undefined), '');
  assert.ok(!/NaN|undefined/.test(G.edgePath({ x: 0, y: 0, w: 10, h: 10 }, { x: 50, y: 40, w: 10, h: 10 })));
});

test('edgePath: a cubic from the right edge of the source to the left edge of the target', () => {
  const lay = G.layout(nodes);
  const a = lay.boxes.patient_id, b = lay.boxes.bronze_tamsworth_vitals;
  const d = G.edgePath(a, b);
  const m = /^M ([\d.]+),([\d.]+) C ([\d.]+),([\d.]+) ([\d.]+),([\d.]+) ([\d.]+),([\d.]+)$/.exec(d);
  assert.ok(m, d);
  assert.strictEqual(Number(m[1]), a.x + a.w);
  assert.strictEqual(Number(m[2]), a.y + a.h / 2);
  assert.strictEqual(Number(m[7]), b.x);
  assert.strictEqual(Number(m[8]), b.y + b.h / 2);
});

test('render: scaled svg with role, title, desc and a text summary; no fixed pixel width', () => {
  const h = page();
  assert.ok(h.indexOf('<span id="stage-lineage"></span>') === 0);
  assert.ok(h.indexOf('<h2>Lineage and impact</h2>') >= 0);
  const svg = /<svg\b[^>]*>/.exec(h)[0];
  assert.ok(/role="img"/.test(svg) && /viewBox="0 0 [\d.]+ [\d.]+"/.test(svg) && /aria-labelledby="graph-title graph-desc"/.test(svg));
  assert.ok(!/\bwidth=/.test(svg) && !/\bheight=/.test(svg));
  assert.ok(/<title id="graph-title">[^<]+<\/title>/.test(h) && /<desc id="graph-desc">[^<]+<\/desc>/.test(h));
  assert.ok(/<p class="caption graph-summary">Lineage graph: 20 nodes and 21 edges in five columns/.test(h));
  assert.ok(/style="aspect-ratio: [\d.]+ \/ [\d.]+"/.test(h));
  assert.ok(!/NaN|undefined|Infinity/.test(h));
});

test('render: 20 node buttons with names and aria-pressed, 21 edge paths, five sensitive badges as text', () => {
  const h = page();
  assert.strictEqual(count(h, 'data-cmd="node"'), 20);
  assert.strictEqual(count(h, '<path '), 21);
  assert.strictEqual(count(h, 'aria-pressed="false"'), 20);
  assert.strictEqual(count(h, '>sensitive</span>'), 5);
  nodes.forEach((n) => assert.ok(h.indexOf('data-id="' + n.id + '"') >= 0, n.id));
  assert.ok(/<button type="button" class="node node-plain" data-cmd="node" data-id="patient_id" aria-pressed="false" aria-label="patient_id, source field, sensitive"/.test(h));
});

test('render: selecting a node marks it pressed, highlights its downstream and dims the rest, with a class and not colour alone', () => {
  const h = page({ selectedNode: 'vital_value' });
  assert.strictEqual(count(h, 'aria-pressed="true"'), 1);
  assert.strictEqual(count(h, 'class="node node-selected"'), 1);
  assert.strictEqual(count(h, 'class="node node-downstream"'), 4);
  assert.strictEqual(count(h, 'class="node node-dimmed"'), 15);
  assert.strictEqual(count(h, 'class="edge edge-hot"'), 4);
  assert.strictEqual(count(h, 'class="edge edge-dim"'), 17);
  assert.ok(h.indexOf('Feeds (4): ') >= 0 && h.indexOf('Fed by (0): nothing') >= 0);
  assert.ok(h.indexOf('KPI tiles affected (1): Abnormal Vital Rate') >= 0);
  assert.ok(h.indexOf('Dropping or retyping vital_value would break 4 downstream objects including Abnormal Vital Rate.') >= 0);
});

test('render: selecting a KPI lists what feeds it', () => {
  const h = page({ selectedNode: 'Bed Occupancy' });
  assert.ok(/Fed by \(\d+\): /.test(h) && h.indexOf('Feeds (0): nothing') >= 0);
  assert.ok(h.indexOf('patient_id') >= 0);
  assert.ok(h.indexOf('This is a KPI tile.') >= 0);
});

test('render: no selection, or an unknown one, gives the plain graph and the prompt', () => {
  [undefined, { selectedNode: '' }, { selectedNode: 'nope' }].forEach((local) => {
    const h = page(local);
    assert.strictEqual(count(h, 'class="node node-plain"'), 20);
    assert.strictEqual(count(h, 'class="edge edge-plain"'), 21);
    assert.ok(h.indexOf('Select a node to see what it feeds and what feeds it.') >= 0);
  });
});

test('render: the list alternative is closed by default and shows the same edges when open', () => {
  const closed = page();
  assert.ok(/<button type="button" data-cmd="list-toggle" aria-expanded="false">Show as list<\/button>/.test(closed));
  assert.strictEqual(count(closed, 'edges-table'), 0);
  const open = page({ showList: true });
  assert.ok(/data-cmd="list-toggle" aria-expanded="true">Show as list/.test(open));
  assert.strictEqual(count(open, 'class="edges-table"'), 1);
  assert.strictEqual(count(open, '<tr>'), 1 + 21);
  L.Brain.lineage.edges.forEach((e) => assert.ok(open.indexOf('<td>' + e[0] + '</td><td>' + e[1] + '</td>') >= 0 || open.indexOf('<th scope="row">' + e[0] + '</th><td>' + e[1] + '</td>') >= 0, e.join('>')));
});

test('render: every id and label is escaped', () => {
  const m = J(model({ selectedNode: 'patient_id' }));
  const INJ = '<script>alert(1)</script>"\'&';
  m.lineage.nodes.forEach((n) => { n.label = INJ; n.id = INJ + n.id; });
  m.lineage.panel.feedsText = INJ;
  m.lineage.edges.forEach((e) => { e.from = INJ; e.to = INJ; });
  m.lineage.summary = INJ;
  const h = R.lineage(m);
  assert.ok(h.indexOf('<script>') < 0);
  assert.ok(h.indexOf('&lt;script&gt;') >= 0);
});

test('render: an empty model renders without throwing', () => {
  [undefined, null, {}, { lineage: null }, { lineage: { nodes: 'x', edges: 5 } }].forEach((m) => {
    assert.doesNotThrow(() => R.lineage(m));
    assert.ok(!/NaN|undefined/.test(R.lineage(m)));
  });
});
