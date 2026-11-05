'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadHQ } = require('./helpers/load');

const { Engine, HQ } = loadHQ();
const J = (x) => JSON.parse(JSON.stringify(x));
const deq = (a, b) => assert.deepEqual(J(a), J(b));
const make = (s) => HQ.controller.createController(Engine, s);

// Virtual clock: timers fire in (time, insertion) order; now() is the virtual time.
function clock() {
  let t = 0, seq = 0, timers = [];
  return {
    now: () => t,
    setTimer(fn, ms) { const h = { fn, at: t + ms, seq: seq++ }; timers.push(h); return h; },
    clearTimer(h) { timers = timers.filter((x) => x !== h); },
    pending: () => timers.length,
    advance(ms) {
      const end = t + ms;
      for (;;) {
        const due = timers.filter((x) => x.at <= end).sort((a, b) => a.at - b.at || a.seq - b.seq)[0];
        if (!due) break;
        timers = timers.filter((x) => x !== due);
        t = Math.max(t, due.at);
        due.fn();
      }
      t = end;
    }
  };
}

function rig(mode, search) {
  const c = clock();
  const controller = make(search === undefined ? '?scenario=incident&step=3' : search);
  const scenes = [], captions = [];
  let ended = 0;
  const player = HQ.autoplay.createPlayer({
    controller, plan: HQ.autoplay.scenePlan(Engine, mode),
    setTimer: c.setTimer, clearTimer: c.clearTimer, now: c.now,
    onScene: (s) => scenes.push(s.id), onCaption: (x) => captions.push(x), onEnd: () => { ended++; }
  });
  return { c, controller, player, scenes, captions, ended: () => ended };
}

test('durations, ids, captions and step ordering', () => {
  const s = HQ.autoplay.scenePlan(Engine, 'short'), f = HQ.autoplay.scenePlan(Engine, 'full');
  assert.equal(s.reduce((a, x) => a + x.durationMs, 0), 120000);
  assert.equal(f.reduce((a, x) => a + x.durationMs, 0), 270000);
  deq(J(s.map((x) => x.id)), ['act1', 'act3', 'recovery', 'act5']);
  deq(J(f.map((x) => x.id)), ['act1', 'act2', 'act3', 'act4', 'act5']);
  assert.equal(s[0].caption, 'This is the platform at rest. Each of the eight lifecycle stages reports its own health.');
  assert.equal(f[1].caption, 'A 20-row export arrives, lands unchanged in Bronze, passes the quality tests and is published. The tiles show which batch they are current as of.');
  assert.equal(s[1].caption, 'Now a bad export arrives. The quality gate opens, production keeps its last good snapshot, and the bad rows go to the dead-letter queue.');
  assert.equal(s[2].caption, 'Operators repair the fixable rows, discard the rest with a logged reason, and retry. A clean trial batch closes the gate.');
  assert.equal(f[3].caption, s[2].caption);
  assert.equal(s[3].caption, 'Without the gate, rows would have vanished silently and impossible readings reached the dashboard. Here they were stopped at the batch.');
  for (const plan of [s, f]) for (const sc of plan) {
    let prev = -1;
    for (const st of sc.steps) { assert.ok(st.atMs > prev); assert.ok(st.atMs < sc.durationMs); prev = st.atMs; }
  }
  deq(s[0].steps, [{ atMs: 0, cmd: { type: 'setScenario', scenario: 'healthy' } }]);
  deq(s[1].steps.map((x) => [x.atMs, x.cmd.type]), [[0, 'setScenario'], [10000, 'run']]);
  assert.equal(s[1].steps[0].cmd.scenario, 'incident');
  deq(f[2].steps.map((x) => x.atMs), [5000, 25000]);
  deq(f[1].steps, [{ atMs: 10000, cmd: { type: 'run' } }]);
  assert.equal(s[2].steps.length, Engine.AUTOPLAY.incident.length - 3);
  assert.equal(s[2].steps[0].atMs, 500);
  assert.equal(s[2].steps[1].atMs, 1500);
  assert.equal(f[3].steps[1].atMs, 2000);
  deq(s[2].steps.map((x) => x.cmd.type), [
    'repair', 'repair', 'repair', 'repair', 'repair', 'discard', 'discard', 'discard', 'discard',
    'ack', 'resolveRetry', 'run', 'resolveAlert']);
  assert.ok(s[2].steps.filter((x) => x.cmd.type === 'discard').every((x) => !('reason' in x.cmd)));
});

test('bogus mode throws exact message', () => {
  assert.throws(() => HQ.autoplay.scenePlan(Engine, 'bogus'),
    (e) => e.name === 'Error' && e.message === "mode must be 'short' or 'full'");
});

test('act1 steps from an incident state show healthy chips (short and full)', () => {
  for (const mode of ['short', 'full']) {
    const ctl = make('?scenario=incident&step=3');
    assert.equal(ctl.getModel().status.gate, 'OPEN');
    for (const st of HQ.autoplay.scenePlan(Engine, mode)[0].steps) ctl.dispatch(st.cmd);
    const m = ctl.getModel();
    assert.equal(m.status.gate, 'CLOSED');
    const txt = JSON.stringify(m.chips);
    assert.ok(txt.includes('Gate closed'));
    assert.ok(txt.includes('Landed 20 rows unchanged'));
    assert.ok(txt.includes('20 rows in production'));
  }
});

test('recovery steps applied to a real controller close the gate with 76 rows', () => {
  const ctl = make('?scenario=incident&step=3');
  for (const st of HQ.autoplay.scenePlan(Engine, 'short')[2].steps) {
    const r = ctl.dispatch(st.cmd);
    assert.equal(r.ok, true, JSON.stringify(st) + ' ' + r.notice);
  }
  const m = ctl.getModel();
  assert.equal(m.status.gate, 'CLOSED');
  assert.equal(m.status.productionRows, 76);
});

test('player: scenes once in order, onEnd once at 120000, final state', () => {
  const r = rig('short');
  r.player.start();
  deq(r.scenes, ['act1']);
  assert.equal(r.captions.length, 1);
  r.c.advance(119999);
  assert.equal(r.ended(), 0);
  deq(r.scenes, ['act1', 'act3', 'recovery', 'act5']);
  r.c.advance(1);
  assert.equal(r.ended(), 1);
  r.c.advance(500000);
  assert.equal(r.ended(), 1);
  assert.equal(r.player.status().state, 'ended');
  assert.equal(r.c.pending(), 0);
  const m = r.controller.getModel();
  assert.equal(m.status.gate, 'CLOSED');
  assert.equal(m.status.productionRows, 76);
});

test('player: act3 opens the gate at 10s after setScenario incident', () => {
  const r = rig('short', '');
  r.player.start();
  r.c.advance(15000 + 9999);
  assert.equal(r.controller.getModel().status.gate, 'CLOSED');
  r.c.advance(1);
  assert.equal(r.controller.getModel().status.gate, 'OPEN');
});

test('pause stops time; resume continues with remaining time', () => {
  const r = rig('short', '');
  r.player.start();
  r.c.advance(24500); // act3 at 9.5 s, run not yet fired
  assert.equal(r.controller.getModel().status.gate, 'CLOSED');
  r.player.pause();
  assert.equal(r.player.status().state, 'paused');
  assert.equal(r.c.pending(), 0);
  r.c.advance(60000);
  assert.equal(r.controller.getModel().status.gate, 'CLOSED');
  deq(r.scenes, ['act1', 'act3']);
  r.player.resume();
  r.c.advance(499);
  assert.equal(r.controller.getModel().status.gate, 'CLOSED');
  r.c.advance(1);
  assert.equal(r.controller.getModel().status.gate, 'OPEN');
  r.c.advance(65000 - 25000 - 1);
  deq(r.scenes, ['act1', 'act3']);
  r.c.advance(1);
  deq(r.scenes, ['act1', 'act3', 'recovery']);
  assert.equal(r.player.status().elapsedMs, 65000);
});

test('skipScene applies remaining steps immediately and matches an unskipped run', () => {
  const r = rig('short', '');
  r.player.start();
  r.player.skipScene();
  deq(r.scenes, ['act1', 'act3']);
  r.player.skipScene();
  assert.equal(r.controller.getModel().status.gate, 'OPEN');
  deq(r.scenes, ['act1', 'act3', 'recovery']);
  r.player.skipScene();
  assert.equal(r.controller.getModel().status.gate, 'CLOSED');
  assert.equal(r.controller.getModel().status.productionRows, 76);
  r.player.skipScene();
  assert.equal(r.ended(), 1);
  assert.equal(r.player.status().state, 'ended');
  assert.equal(r.c.pending(), 0);
  const p = rig('short', '');
  p.player.start();
  p.c.advance(120000);
  deq(r.controller.actions(), p.controller.actions());
});

test('skipScene while paused stays paused with no timers, then resumes', () => {
  const r = rig('short', '');
  r.player.start();
  r.player.pause();
  r.player.skipScene();
  assert.equal(r.player.status().state, 'paused');
  assert.equal(r.c.pending(), 0);
  r.player.resume();
  assert.ok(r.c.pending() > 0);
  r.c.advance(10000);
  assert.equal(r.controller.getModel().status.gate, 'OPEN');
});

test('stop clears every timer and leaves controller state', () => {
  const r = rig('short', '');
  r.player.start();
  r.c.advance(30000);
  const before = JSON.stringify(r.controller.actions());
  assert.ok(r.c.pending() > 0);
  r.player.stop();
  assert.equal(r.c.pending(), 0);
  assert.equal(r.player.status().state, 'idle');
  r.c.advance(200000);
  assert.equal(JSON.stringify(r.controller.actions()), before);
  assert.equal(r.ended(), 0);
});

test('start twice is ignored', () => {
  const r = rig('short', '');
  r.player.start();
  const n = r.c.pending();
  r.player.start();
  assert.equal(r.c.pending(), n);
  deq(r.scenes, ['act1']);
  r.c.advance(120000);
  assert.equal(r.ended(), 1);
  deq(r.scenes, ['act1', 'act3', 'recovery', 'act5']);
});

test('full plan plays to 270000 and ends closed', () => {
  const r = rig('full');
  r.player.start();
  r.c.advance(269999);
  assert.equal(r.ended(), 0);
  r.c.advance(1);
  assert.equal(r.ended(), 1);
  deq(r.scenes, ['act1', 'act2', 'act3', 'act4', 'act5']);
  assert.equal(r.controller.getModel().status.gate, 'CLOSED');
  assert.equal(r.controller.getModel().status.productionRows, 76);
});
