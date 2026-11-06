(function () {
  'use strict';
  globalThis.Shared = globalThis.Shared || {};

  // The page wordmark, the same on every page. A title of the form "Name: tagline" becomes a name in mono capitals and a
  // lighter tagline beside a small colour mark; the h1 is labelled with the full title so a screen reader reads it whole.
  function html(title) {
    var esc = globalThis.Shared.escape.esc;
    var t = title === null || title === undefined ? '' : String(title);
    var i = t.indexOf(': ');
    var name = i < 0 ? t : t.slice(0, i);
    var tag = i < 0 ? '' : t.slice(i + 2);
    return '<div class="brand"><span class="mark" aria-hidden="true"></span><h1 aria-label="' + esc(t) + '">' +
      '<span class="w1">' + esc(name) + '</span>' + (tag ? ' <span class="w2">' + esc(tag) + '</span>' : '') + '</h1></div>';
  }

  globalThis.Shared.brand = { html: html };
})();
