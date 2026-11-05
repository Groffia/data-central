(function () {
  'use strict';
  const Brain = (globalThis.Brain = globalThis.Brain || {});

  // Geometry of the lineage graph, in viewBox units: five fixed columns (source fields, Bronze, Silver, Gold, KPI tiles),
  // each column centred vertically, laid out by this code (no graph library).
  const NODE_W = 172, NODE_H = 28, ROW = 34, PAD = 8, COL_STEP = 200, LEFT = 4, LAYERS = 5;

  const round1 = function (v) { return Number(v.toFixed(1)); };
  const validLayer = function (l) { return Number.isInteger(l) && l >= 0 && l < LAYERS; };

  // nodes: [{ id, layer }]. Returns { width, height, boxes: { id: { x, y, w, h } } }. Entries without a string id and a
  // layer from 0 to 4 are skipped, so junk input never produces NaN.
  function layout(nodes) {
    const list = (Array.isArray(nodes) ? nodes : []).filter(function (n) { return n && typeof n === 'object' && typeof n.id === 'string' && validLayer(n.layer); });
    const cols = [];
    for (let i = 0; i < LAYERS; i++) cols.push([]);
    list.forEach(function (n) { cols[n.layer].push(n); });
    const most = Math.max(1, Math.max.apply(null, cols.map(function (c) { return c.length; })));
    const boxes = {};
    cols.forEach(function (col, layer) {
      const lift = ((most - col.length) * ROW) / 2;
      col.forEach(function (n, i) {
        boxes[n.id] = { x: LEFT + layer * COL_STEP, y: round1(PAD + lift + i * ROW + (ROW - NODE_H) / 2), w: NODE_W, h: NODE_H };
      });
    });
    return { width: LEFT * 2 + (LAYERS - 1) * COL_STEP + NODE_W, height: most * ROW + 2 * PAD, boxes: boxes };
  }

  const okBox = function (b) { return b && typeof b === 'object' && [b.x, b.y, b.w, b.h].every(function (v) { return typeof v === 'number' && isFinite(v); }); };

  // A cubic from the right edge of one box to the left edge of the next. '' for anything that is not two boxes.
  function edgePath(from, to) {
    if (!okBox(from) || !okBox(to)) return '';
    const x1 = round1(from.x + from.w), y1 = round1(from.y + from.h / 2);
    const x2 = round1(to.x), y2 = round1(to.y + to.h / 2);
    const xm = round1((x1 + x2) / 2);
    return 'M ' + x1 + ',' + y1 + ' C ' + xm + ',' + y1 + ' ' + xm + ',' + y2 + ' ' + x2 + ',' + y2;
  }

  // A box as percentages of the whole graph, for absolutely positioned buttons over the scaled svg.
  function percent(box, width, height) {
    const p = function (v, whole) { return (whole > 0 && isFinite(v) ? (v / whole) * 100 : 0).toFixed(2) + '%'; };
    return { left: p(box.x, width), top: p(box.y, height), width: p(box.w, width), height: p(box.h, height) };
  }

  Brain.graph = { NODE_W: NODE_W, NODE_H: NODE_H, layout: layout, edgePath: edgePath, percent: percent };
})();
