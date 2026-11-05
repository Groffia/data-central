(function () {
  'use strict';
  globalThis.Shared = globalThis.Shared || {};

  var MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  function esc(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, function (ch) { return MAP[ch]; });
  }

  globalThis.Shared.escape = { esc: esc };
})();
