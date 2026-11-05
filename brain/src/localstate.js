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

  const cohort = function () { return Engine.buildPatientPool().map(function (p) { return p.patient_id; }); };
  // The block reason is the engine's own string, never retyped here.
  const blockedReason = function () { return Engine.eraseSubjects('healthy', [], [], { legalHold: true }).reason; };
  const known = function (id) { return Brain.lineage.nodes.some(function (n) { return n.id === id; }); };

  // Pure: never mutates its input and never throws. An action that changes nothing returns the (normalized) state as it was.
  function reduce(state, action) {
    const s = normalize(state);
    if (!action || typeof action !== 'object' || typeof action.type !== 'string') return s;
    const t = action.type;
    if (t === 'reset') return initial();
    if (t === 'selectNode') {
      if (typeof action.id !== 'string' || (action.id !== '' && !known(action.id))) return s;
      s.selectedNode = action.id;
      s.message = '';
      return s;
    }
    if (t === 'selectSubject') {
      if (typeof action.id !== 'string' || (action.id !== '' && cohort().indexOf(action.id) < 0)) return s;
      s.selectedSubject = action.id;
      s.message = '';
      return s;
    }
    if (t === 'eraseSubject') {
      if (s.legalHold) { s.message = blockedReason(); return s; }
      if (s.selectedSubject === '') { s.message = 'Choose a subject first'; return s; }
      if (s.erased.indexOf(s.selectedSubject) >= 0) { s.message = s.selectedSubject + ' is already erased'; return s; }
      s.erased.push(s.selectedSubject);
      s.message = 'Erased ' + s.selectedSubject;
      return s;
    }
    if (t === 'resetErasures') { s.erased = []; s.message = 'Erasures reset'; return s; }
    if (t === 'holdOn') { s.legalHold = true; s.message = 'Legal hold on'; return s; }
    if (t === 'holdOff') { s.legalHold = false; s.message = 'Legal hold off'; return s; }
    return s;
  }

  Brain.localstate = { initial: initial, normalize: normalize, reduce: reduce };
})();
