(function () {
  'use strict';
  globalThis.Shared = globalThis.Shared || {};

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

  // Comma thousands separators by string manipulation only. Non-integers and negatives are rounded via toFixed(0).
  // Non-finite or non-numeric input (NaN, Infinity, null, undefined, '', 'abc', objects, booleans) gives '' and never throws.
  // Numeric strings are parsed. Magnitudes of 1e15 and above are written in full digits (no exponent), without separators.
  function thousands(n) {
    if (typeof n === 'string') n = n.trim() === '' ? NaN : Number(n);
    if (typeof n !== 'number' || !isFinite(n)) return '';
    if (Math.abs(n) >= 1e15) return BigInt(Math.round(n)).toString();
    var s = n.toFixed(0);
    var neg = s.charAt(0) === '-';
    if (neg) s = s.slice(1);
    var out = '';
    for (var i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 === 0) out += ',';
      out += s.charAt(i);
    }
    return (neg && Number(s) !== 0 ? '-' : '') + out;
  }

  function plural(n, one, many) { return n === 1 ? one : many; }

  globalThis.Shared.format = {
    plural: plural, thousands: thousands,
    pct1: pct1, fracPct1: fracPct1, days1: days1,
    signedPct1: signedPct1, signedPts1: signedPts1,
    batchLabel: batchLabel, clockLabel: clockLabel
  };
})();
