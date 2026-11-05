(function () {
  'use strict';
  const HQ = (globalThis.HQ = globalThis.HQ || {});
  const links = (HQ.links = HQ.links || {});

  // Copy of the Pipeline renderer's safeHref (pipeline/src/render.js), same rules, so a base is accepted here
  // exactly when the Pipeline page would accept it as an href. Allowlist: only a scheme-less relative URL of safe
  // characters. Any ASCII control character or space (browsers ignore tab, LF and CR inside a scheme) rejects the
  // value; so do a scheme, "//", or over 2000 characters.
  function safeBase(href) {
    if (typeof href !== 'string' || href === '' || href.length > 2000) return '';
    if (href.replace(/[\u0000- \u007f]/g, '') !== href) return '';
    if (!/^[A-Za-z0-9_.\/?&=%#+~:-]*$/.test(href)) return '';
    if (href.indexOf('//') === 0) return '';
    const colon = href.indexOf(':');
    if (colon >= 0) {
      const stop = href.search(/[\/?#]/);
      if (stop < 0 || colon < stop) return '';
    }
    return href;
  }

  function focusOk(focus) { return typeof focus === 'string' && /^[A-Za-z0-9_-]+$/.test(focus); }

  // base + ?scenario=S + (&step=N when the actions are the first N scripted ones, else &a=<encoded> when encodable)
  // + (#focus when focus is a plain id). Null when there is no usable base.
  function pipelineUrl(base, scenario, actions, focus, Engine) {
    const b = safeBase(base);
    if (!b) return null;
    let url = b + '?scenario=' + encodeURIComponent(String(scenario));
    const step = Engine.stepForActions(scenario, actions);
    if (typeof step === 'number') url += '&step=' + step;
    else {
      const enc = Engine.encodeActions(actions);
      if (typeof enc === 'string') url += '&a=' + enc;
    }
    if (focusOk(focus)) url += '#' + focus;
    return url;
  }

  links.safeBase = safeBase;
  links.focusOk = focusOk;
  links.pipelineUrl = pipelineUrl;
})();
