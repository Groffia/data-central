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

  // The longest scripted prefix of the actions (never below the scenario floor): where a link opens when the state
  // cannot be encoded within the cap. Mirrors the Value page's header.
  function nearestStep(scenario, actions, Engine) {
    const pre = Engine.PRELUDE && Engine.PRELUDE[scenario];
    const floor = pre ? pre.length : 0;
    const script = Engine.AUTOPLAY && Engine.AUTOPLAY[scenario];
    if (!Array.isArray(actions) || !script) return floor;
    for (let k = Math.min(actions.length, script.length); k >= floor; k--) {
      if (Engine.stepForActions(scenario, actions.slice(0, k)) === k) return k;
    }
    return floor;
  }

  // True when the state is not a scripted prefix and encodeActions gives null only because the encoding is over the
  // 2,000-character cap (every action on its own encodes). Unencodable action types are not "too long".
  function tooLong(scenario, actions, Engine) {
    if (!Array.isArray(actions) || actions.length === 0) return false;
    if (typeof Engine.stepForActions(scenario, actions) === 'number') return false;
    if (typeof Engine.encodeActions(actions) === 'string') return false;
    return actions.every(function (a) { return typeof Engine.encodeActions([a]) === 'string'; });
  }

  // base + ?scenario=S + (&step=N when the actions are the first N scripted ones, else &a=<encoded> when encodable,
  // else &step=<nearest scripted step>) + (#focus when focus is a plain id). Null when there is no usable base.
  function build(base, scenario, step, actions, focus, Engine) {
    const b = safeBase(base);
    if (!b) return null;
    let url = b + '?scenario=' + encodeURIComponent(String(scenario));
    const n = typeof step === 'number' ? step : Engine.stepForActions(scenario, actions);
    if (typeof n === 'number') url += '&step=' + n;
    else {
      const enc = Engine.encodeActions(actions);
      url += typeof enc === 'string' ? '&a=' + enc : '&step=' + nearestStep(scenario, actions, Engine);
    }
    if (focusOk(focus)) url += '#' + focus;
    return url;
  }

  function pipelineUrl(base, scenario, actions, focus, Engine) {
    return build(base, scenario, null, actions, focus, Engine);
  }

  // Link into the Value page: same allowlist, safeBase and a= rules as pipelineUrl. `step` is the scripted step number
  // when the caller knows it, else null (derived from the actions). Engine is the page global unless passed last.
  function valueUrl(base, scenario, step, actions, hash, Engine) {
    return build(base, scenario, step, actions, hash, Engine || globalThis.Engine);
  }

  // Link into the Brain page: same allowlist, safeBase and a= rules as pipelineUrl.
  function brainUrl(base, scenario, actions, focus, Engine) {
    return build(base, scenario, null, actions, focus, Engine);
  }

  links.safeBase = safeBase;
  links.focusOk = focusOk;
  links.pipelineUrl = pipelineUrl;
  links.valueUrl = valueUrl;
  links.brainUrl = brainUrl;
  links.nearestStep = nearestStep;
  links.tooLong = tooLong;
})();
