(function () {
  'use strict';
  const HQ = (globalThis.HQ = globalThis.HQ || {});
  const ap = (HQ.autoplay = HQ.autoplay || {});

  const CAPTIONS = {
    act1: 'This is the platform at rest. Each of the eight lifecycle stages reports its own health.',
    act2: 'A 20-row export arrives, lands unchanged in Bronze, passes the quality tests and is published. The tiles show which batch they are current as of.',
    act3: 'Now a bad export arrives. The quality gate opens, production keeps its last good snapshot, and the bad rows go to the dead-letter queue.',
    recovery: 'Operators repair the fixable rows, discard the rest with a logged reason, and retry. A clean trial batch closes the gate.',
    act5: 'Without the gate, rows would have vanished silently and impossible readings reached the dashboard. Here they were stopped at the batch.'
  };

  const CMD_TYPE = {
    runBatch: 'run', repairRow: 'repair', discardRow: 'discard',
    ackAlert: 'ack', resolveRetry: 'resolveRetry', resolveAlert: 'resolveAlert'
  };

  function toCmd(action) {
    const type = CMD_TYPE[action.type];
    if (!type) throw new Error('unmapped engine action: ' + action.type);
    const cmd = { type: type };
    if (type === 'repair' || type === 'discard') cmd.dlqId = action.dlqId; // discard: no reason, controller uses suggestedReason
    return cmd;
  }

  function spaced(cmds, startMs, gapMs) {
    return cmds.map(function (cmd, i) { return { atMs: startMs + i * gapMs, cmd: cmd }; });
  }

  ap.scenePlan = function scenePlan(Engine, mode) {
    if (mode !== 'short' && mode !== 'full') throw new Error("mode must be 'short' or 'full'");
    const incident = Engine.AUTOPLAY.incident;
    const healthyRun = toCmd(Engine.AUTOPLAY.healthy[1]);
    const gateRun = toCmd(incident[2]);
    const recovery = incident.slice(3).map(toCmd);
    const toHealthy = { type: 'setScenario', scenario: 'healthy' };
    const toIncident = { type: 'setScenario', scenario: 'incident' };
    const S = function (id, act, sec, steps) {
      return { id: id, act: act, durationMs: sec * 1000, caption: CAPTIONS[id], steps: steps };
    };
    if (mode === 'short') {
      return [
        S('act1', 1, 15, [{ atMs: 0, cmd: toHealthy }]),
        S('act3', 3, 50, [{ atMs: 0, cmd: toIncident }, { atMs: 10000, cmd: gateRun }]),
        S('recovery', 4, 20, spaced(recovery, 500, 1000)),
        S('act5', 5, 35, [])
      ];
    }
    return [
      S('act1', 1, 30, [{ atMs: 0, cmd: toHealthy }]),
      S('act2', 2, 60, [{ atMs: 10000, cmd: healthyRun }]),
      S('act3', 3, 90, [{ atMs: 5000, cmd: toIncident }, { atMs: 25000, cmd: gateRun }]),
      Object.assign(S('recovery', 4, 45, spaced(recovery, 500, 1500)), { id: 'act4' }),
      S('act5', 5, 45, [])
    ];
  };

  // opts.now: () => ms, injected clock used only to measure elapsed time for pause/resume.
  ap.createPlayer = function createPlayer(opts) {
    const controller = opts.controller, plan = opts.plan;
    const setTimer = opts.setTimer, clearTimer = opts.clearTimer, now = opts.now;
    if (typeof now !== 'function') throw new Error('now is required');
    const onScene = opts.onScene || function () {};
    const onCaption = opts.onCaption || function () {};
    const onEnd = opts.onEnd || function () {};

    let state = 'idle';
    let idx = 0;
    let sceneElapsed = 0; // ms into the current scene, as of segStart
    let segStart = 0;     // now() when the current running segment began
    let nextStep = 0;     // index of the first unapplied step in the current scene
    let timers = [];
    let gen = 0; // bumped on every scene entry and stop; detects re-entrant changes from callbacks

    function clearAll() {
      timers.forEach(function (h) { clearTimer(h); });
      timers = [];
    }

    function applyStep(i) {
      nextStep = i + 1;
      controller.dispatch(plan[idx].steps[i].cmd);
    }

    function applyDue(uptoMs) {
      const steps = plan[idx].steps;
      while (nextStep < steps.length && steps[nextStep].atMs <= uptoMs) applyStep(nextStep);
    }

    function schedule() {
      clearAll();
      const scene = plan[idx], from = sceneElapsed, mine = idx;
      scene.steps.forEach(function (st, i) {
        if (i < nextStep) return;
        timers.push(setTimer(function () {
          if (state !== 'playing' || idx !== mine || i < nextStep) return;
          applyStep(i);
        }, Math.max(0, st.atMs - from)));
      });
      timers.push(setTimer(function () {
        if (state !== 'playing' || idx !== mine) return;
        applyDue(Infinity);
        advance();
      }, Math.max(0, scene.durationMs - from)));
    }

    function enter(i) {
      idx = i;
      sceneElapsed = 0;
      nextStep = 0;
      const g = ++gen;
      onScene(plan[i], i);
      if (g !== gen) return;
      onCaption(plan[i].caption);
      if (g !== gen) return;
      applyDue(0);
      if (state === 'playing') { segStart = now(); schedule(); }
    }

    function advance() {
      clearAll();
      if (idx + 1 < plan.length) { enter(idx + 1); return; }
      state = 'ended';
      onEnd();
    }

    function elapsedMs() {
      let total = 0;
      for (let i = 0; i < idx; i++) total += plan[i].durationMs;
      if (state === 'ended') return total + plan[idx].durationMs;
      if (state === 'idle') return 0;
      return total + sceneElapsed + (state === 'playing' ? now() - segStart : 0);
    }

    return {
      start: function () {
        if (state !== 'idle') return;
        state = 'playing';
        enter(0);
      },
      pause: function () {
        if (state !== 'playing') return;
        sceneElapsed += now() - segStart;
        clearAll();
        state = 'paused';
      },
      resume: function () {
        if (state !== 'paused') return;
        state = 'playing';
        segStart = now();
        schedule();
      },
      skipScene: function () {
        if (state !== 'playing' && state !== 'paused') return;
        clearAll();
        applyDue(Infinity);
        if (idx + 1 < plan.length) { enter(idx + 1); return; }
        state = 'ended';
        onEnd();
      },
      stop: function () {
        clearAll();
        gen++;
        if (state !== 'idle') { state = 'idle'; idx = 0; sceneElapsed = 0; nextStep = 0; }
      },
      status: function () {
        return { state: state, sceneIndex: idx, elapsedMs: elapsedMs() };
      }
    };
  };
})();
