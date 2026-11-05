(function () {
  'use strict';
  globalThis.Value = globalThis.Value || {};

  var esc = function (s) { return globalThis.Shared.escape.esc(s); };

  var W = 640, H = 220;
  var PLOT = { left: 52, right: 628, top: 12, bottom: 176 };
  var PLOT_W = PLOT.right - PLOT.left;
  var PLOT_H = PLOT.bottom - PLOT.top;

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function finiteOf(values) { return (values || []).filter(isNum); }
  function f(n) { return (Math.round(n * 100) / 100).toFixed(2); }

  // Axis range over finite values; a flat or single-value series gets a non-zero range.
  function scale(values, plotHeight) {
    var fin = finiteOf(values);
    var h = isNum(plotHeight) && plotHeight > 0 ? plotHeight : 1;
    var min = 0, max = 1;
    if (fin.length) {
      min = fin[0]; max = fin[0];
      for (var i = 1; i < fin.length; i++) { if (fin[i] < min) min = fin[i]; if (fin[i] > max) max = fin[i]; }
      if (max === min) {
        var pad = Math.abs(min) * 0.05 || 1;
        min -= pad; max += pad;
      }
    }
    function y(v) {
      if (!isNum(v)) return h;
      var span = max - min;
      var t;
      if (isFinite(span)) t = (v - min) / span;
      else t = (v / 2 - min / 2) / (max / 2 - min / 2);
      if (!isFinite(t)) t = 0.5;
      if (t < 0) t = 0;
      if (t > 1) t = 1;
      return h - t * h;
    }
    return { min: min, max: max, y: y };
  }

  function fmt(v, unit) {
    if (!isNum(v)) return '';
    var s;
    if (unit === 'pct') s = (v * 100).toFixed(1) + '%';
    else if (unit === 'days') s = v.toFixed(1) + ' days';
    else s = v.toFixed(2);
    return s.replace(/^-(0\.0+)(%| days)?$/, '$1$2');
  }

  function dropped(series, n) {
    var d = 0;
    (series || []).forEach(function (s) {
      var vals = (s && s.values) || [];
      var len = Math.max(vals.length, n);
      for (var i = 0; i < len; i++) if (!isNum(vals[i])) d++;
    });
    return d;
  }

  function summary(o) {
    var series = o.series || [], dates = o.dates || [], unit = o.unit || '';
    var first = series[0] ? series[0].values || [] : [];
    var n = dates.length || first.length;
    var lastIdx = -1;
    for (var i = Math.min(first.length, n) - 1; i >= 0; i--) if (isNum(first[i])) { lastIdx = i; break; }
    var title = esc(o.title);
    if (lastIdx < 0) return title + ': no data to chart';
    var fin = finiteOf(first);
    var mn = Math.min.apply(null, fin), mx = Math.max.apply(null, fin);
    var out = title + ': ' + fmt(first[lastIdx], unit) + ' on ' + esc(dates[lastIdx]) + ', range ' + fmt(mn, unit) + ' to ' + fmt(mx, unit) + ' over ' + n + ' days';
    if (o.weekendIndexes && o.weekendIndexes.length) out += ', weekends shaded';
    var d = dropped(series, 0);
    if (d > 0) out += ', ' + d + ' points could not be drawn';
    return out;
  }

  function table(o) {
    var series = o.series || [], dates = o.dates || [], unit = o.unit || '';
    var h = '<table><caption>' + esc(o.title) + '</caption><thead><tr><th scope="col">Date</th>';
    series.forEach(function (s) { h += '<th scope="col">' + esc(s && s.name) + '</th>'; });
    h += '</tr></thead><tbody>';
    dates.forEach(function (d, i) {
      h += '<tr><th scope="row">' + esc(d) + '</th>';
      series.forEach(function (s) {
        var v = s && s.values ? s.values[i] : undefined;
        h += '<td>' + (isNum(v) ? fmt(v, unit) : 'no data') + '</td>';
      });
      h += '</tr>';
    });
    return h + '</tbody></table>';
  }

  function lineChart(o) {
    var id = esc(o.id), series = o.series || [], dates = o.dates || [], unit = o.unit || '';
    var n = dates.length;
    for (var k = 0; k < series.length; k++) n = Math.max(n, (series[k].values || []).length);
    var all = [];
    series.forEach(function (s) { all = all.concat(finiteOf(s.values)); });
    var head = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-labelledby="' + id + '-title ' + id + '-desc">' +
      '<title id="' + id + '-title">' + esc(o.title) + '</title><desc id="' + id + '-desc">' + summary(o) + '</desc>';
    if (!all.length) {
      return head + '<text x="' + (W / 2) + '" y="' + (H / 2) + '" text-anchor="middle">No data to chart</text></svg>';
    }
    var sc = scale(all, PLOT_H);
    function X(i) { return n > 1 ? PLOT.left + (i * PLOT_W) / (n - 1) : PLOT.left + PLOT_W / 2; }
    function Y(v) { return PLOT.top + sc.y(v); }
    var body = '';
    var step = n > 1 ? PLOT_W / (n - 1) : PLOT_W;
    (o.weekendIndexes || []).forEach(function (wi) {
      if (!isNum(wi) || wi < 0 || wi >= n || Math.floor(wi) !== wi) return;
      var x0 = Math.max(PLOT.left, X(wi) - step / 2), x1 = Math.min(PLOT.right, X(wi) + step / 2);
      if (x1 <= x0) return;
      body += '<rect class="weekend" aria-hidden="true" x="' + f(x0) + '" y="' + PLOT.top + '" width="' + f(x1 - x0) + '" height="' + PLOT_H + '" fill="currentColor" fill-opacity="0.08"/>';
    });
    body += '<rect class="plot-frame" x="' + PLOT.left + '" y="' + PLOT.top + '" width="' + PLOT_W + '" height="' + PLOT_H + '" fill="none" stroke="currentColor" stroke-opacity="0.3"/>';
    series.forEach(function (s, si) {
      var vals = s.values || [];
      var cls = esc(s.className || ('series-' + si));
      var sw = si === 0 ? '1.5' : '3';
      var d = '', pts = [], prevOk = false;
      for (var i = 0; i < n; i++) {
        if (!isNum(vals[i])) { prevOk = false; continue; }
        var px = f(X(i)), py = f(Y(vals[i]));
        pts.push([px, py]);
        d += (prevOk ? ' L ' : (d ? ' M ' : 'M ')) + px + ' ' + py;
        prevOk = true;
      }
      if (pts.length === 1) {
        body += '<circle class="' + cls + '" cx="' + pts[0][0] + '" cy="' + pts[0][1] + '" r="3" fill="currentColor"/>';
      } else if (pts.length > 1) {
        body += '<path class="' + cls + '" d="' + d + '" fill="none" stroke="currentColor" stroke-width="' + sw + '" stroke-linejoin="round" stroke-linecap="round"/>';
      }
    });
    body += '<text class="axis-label" x="' + (PLOT.left - 6) + '" y="' + (PLOT.top + 10) + '" text-anchor="end">' + fmt(sc.max, unit) + '</text>';
    body += '<text class="axis-label" x="' + (PLOT.left - 6) + '" y="' + PLOT.bottom + '" text-anchor="end">' + fmt(sc.min, unit) + '</text>';
    if (dates.length) {
      body += '<text class="axis-label" x="' + PLOT.left + '" y="' + (PLOT.bottom + 18) + '" text-anchor="start">' + esc(dates[0]) + '</text>';
      if (dates.length > 1) body += '<text class="axis-label" x="' + PLOT.right + '" y="' + (PLOT.bottom + 18) + '" text-anchor="end">' + esc(dates[dates.length - 1]) + '</text>';
    }
    return head + body + '</svg>';
  }

  globalThis.Value.chart = { scale: scale, lineChart: lineChart, summary: summary, table: table, format: fmt };
})();
