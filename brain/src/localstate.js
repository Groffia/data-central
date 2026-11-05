(function () {
  'use strict';
  const Brain = (globalThis.Brain = globalThis.Brain || {});

  // The page's local state (never in the URL): the selected lineage node, the selected subject, the erased subjects (in the
  // order erased) and the legal-hold toggle. `message` is the result of the last action, for the live element.
  function initial() {
    return { selectedNode: '', selectedSubject: '', erased: [], legalHold: false, message: '' };
  }

  // Any value to a valid state: fresh objects, unknown shapes repaired to the initial values, never throws.
  function normalize(s) {
    const o = s && typeof s === 'object' && !Array.isArray(s) ? s : {};
    const erased = [];
    (Array.isArray(o.erased) ? o.erased : []).forEach(function (id) { if (typeof id === 'string' && erased.indexOf(id) < 0) erased.push(id); });
    return {
      selectedNode: typeof o.selectedNode === 'string' ? o.selectedNode : '',
      selectedSubject: typeof o.selectedSubject === 'string' ? o.selectedSubject : '',
      erased: erased,
      legalHold: o.legalHold === true,
      message: typeof o.message === 'string' ? o.message : ''
    };
  }

  Brain.localstate = { initial: initial, normalize: normalize };
})();
