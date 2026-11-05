(function () {
  'use strict';
  globalThis.HQ = globalThis.HQ || {};

  function pct1(n) { return n.toFixed(1) + '%'; }
  function fracPct1(f) { return (f * 100).toFixed(1) + '%'; }
  function days1(n) { return n.toFixed(1) + ' days'; }

  function signed1(n) {
    var s = n.toFixed(1);
    if (Number(s) === 0) return '0.0';
    return Number(s) > 0 ? '+' + s : s;
  }
  function signedPct1(n) { return signed1(n) + '%'; }
  function signedPts1(n) { return signed1(n) + ' pts'; }

  function batchLabel(id) {
    if (id === null || id === undefined) return 'no batch yet';
    var m = /^batch-(\d+)$/.exec(String(id));
    return m ? 'Batch ' + m[1] : String(id);
  }

  function clockLabel(iso) {
    var m = /T(\d{2}:\d{2}:\d{2})/.exec(String(iso));
    return m ? m[1] + ' UTC' : String(iso);
  }

  function plural(n, one, many) { return n === 1 ? one : many; }

  globalThis.HQ.format = {
    plural: plural,
    pct1: pct1, fracPct1: fracPct1, days1: days1,
    signedPct1: signedPct1, signedPts1: signedPts1,
    batchLabel: batchLabel, clockLabel: clockLabel
  };
})();
