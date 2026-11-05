const test = require("node:test");
const assert = require("node:assert");
const Engine = require("../engine.js");

// Positions in AUTOPLAY.incident: 0-2 runBatch; 3-7 repairRow; 8-11 discardRow; 12 ackAlert; 13 resolveRetry;
// 14 trial runBatch (export 4); 15 resolveAlert.
const A = Engine.AUTOPLAY.incident;
const iso = Engine.isoFromEpoch, run = Engine.exportRunEpoch;
const OPERATOR = new Set(["repairRow", "discardRow", "resolveRetry", "ackAlert", "resolveAlert"]);

test("scripted incident: operator actions finish before export 4, which sets the clock", () => {
  const afterRetry = Engine.replay("incident", A.slice(0, 14));
  // 11 accepted operator actions (5 repairs, 4 discards, ackAlert, resolveRetry) after batch 3: 11 * 60 = 660 s.
  assert.strictEqual(A.slice(3, 14).length, 11);
  assert.strictEqual(afterRetry.clock.epoch, run(3) + 660);
  assert.strictEqual(afterRetry.clock.iso, "2026-11-03T15:11:00Z");
  assert.ok(afterRetry.clock.epoch < run(4));
  assert.strictEqual(run(4), 1793718900); // 15:15:00Z
  const trial = Engine.replay("incident", A.slice(0, 15));
  assert.strictEqual(trial.clock.epoch, run(4));
  assert.strictEqual(trial.clock.iso, "2026-11-03T15:15:00Z");
  const done = Engine.replay("incident", A);
  assert.strictEqual(done.clock.epoch, run(4) + 60);
  assert.strictEqual(done.clock.iso, "2026-11-03T15:16:00Z");
  assert.strictEqual(Engine.getState("incident", A).clock.iso, "2026-11-03T15:16:00Z");
  assert.strictEqual(Engine.getState("healthy", Engine.AUTOPLAY.healthy).clock.iso, "2026-11-03T15:15:00Z");
});

test("timeline never goes backwards; each accepted operator action stamps its events 60 s after the clock before it", () => {
  const ev = Engine.getState("incident", A).events;
  for (let i = 1; i < ev.length; i++) assert.ok(ev[i].iso >= ev[i - 1].iso, "event " + i);
  const stamps = [];
  let prev = Engine.replay("incident", []);
  A.forEach((a, i) => {
    const cur = Engine.replay("incident", A.slice(0, i + 1));
    const added = cur.events.slice(prev.events.length);
    assert.ok(added.length >= 1);
    if (OPERATOR.has(a.type)) {
      assert.strictEqual(cur.clock.epoch, prev.clock.epoch + 60, "action " + i);
      added.forEach((e) => assert.strictEqual(e.iso, iso(prev.clock.epoch + 60), "action " + i));
      stamps.push({ i, epoch: cur.clock.epoch });
    } else {
      added.forEach((e) => assert.strictEqual(e.iso, iso(run(cur.batchesRun))));
    }
    prev = cur;
  });
  assert.strictEqual(stamps.length, 12);
  // Different operator actions: strictly increasing; back-to-back ones are exactly 60 s apart.
  for (let k = 1; k < stamps.length; k++) {
    assert.ok(stamps[k].epoch > stamps[k - 1].epoch);
    if (stamps[k].i === stamps[k - 1].i + 1) assert.strictEqual(stamps[k].epoch - stamps[k - 1].epoch, 60);
  }
});

test("rejected actions leave the clock unchanged and the rejection carries that time", () => {
  const open = Engine.replay("incident", A.slice(0, 3));
  const rejects = [
    { type: "runBatch" }, // gate OPEN
    { type: "repairRow", dlqId: "dlq-3-4" }, // not repairable
    { type: "repairRow", dlqId: "dlq-9-9" }, // unknown id
    { type: "discardRow", dlqId: "dlq-3-4", reason: "  " }, // needs a reason
    { type: "resolveRetry" }, // rows unresolved
    { type: "bogus" },
  ];
  rejects.forEach((a) => {
    const next = Engine.reduce(open, a);
    assert.deepStrictEqual(next.clock, open.clock, a.type);
    assert.strictEqual(next.events.length, open.events.length + 1);
    const last = next.events[next.events.length - 1];
    assert.strictEqual(last.type, "ACTION_REJECTED");
    assert.strictEqual(last.iso, open.clock.iso);
  });
  // resolveRetry / ackAlert / resolveAlert with nothing to act on
  const fresh = Engine.initialState("incident");
  ["resolveRetry", "ackAlert", "resolveAlert"].forEach((t) => {
    const next = Engine.reduce(fresh, { type: t });
    assert.deepStrictEqual(next.clock, fresh.clock, t);
    assert.strictEqual(next.events[next.events.length - 1].iso, fresh.clock.iso);
  });
});

test("no-op repeats do not advance the clock or add events", () => {
  const repaired = Engine.replay("incident", A.slice(0, 4));
  const discarded = Engine.replay("incident", A.slice(0, 9));
  const acked = Engine.replay("incident", A.slice(0, 13));
  const resolved = Engine.replay("incident", A);
  [[repaired, A[3]], [discarded, A[8]], [acked, A[12]], [resolved, A[15]]].forEach(([s, a]) => {
    const again = Engine.reduce(s, a);
    assert.deepStrictEqual(again.clock, s.clock, a.type);
    assert.strictEqual(again.events.length, s.events.length, a.type);
  });
});

test("runBatch never moves the clock backwards and export data does not depend on the clock", () => {
  // Hand-made state: after two exports, the clock is pushed 20 minutes past export 3's run epoch, as if
  // very many operator actions had been accepted (playing through the DLQ alone adds about 12 minutes at most).
  const base = Engine.replay("incident", A.slice(0, 2));
  const late = run(3) + 1200;
  const pushed = { ...base, clock: { epoch: late, iso: iso(late) } };
  const next = Engine.reduce(pushed, { type: "runBatch" });
  assert.strictEqual(next.clock.epoch, late);
  assert.ok(next.clock.epoch > run(3));
  next.events.slice(base.events.length).forEach((e) => assert.strictEqual(e.iso, iso(late)));
  const normal = Engine.reduce(base, { type: "runBatch" });
  assert.strictEqual(normal.clock.epoch, run(3));
  // Same export either way: bronze, DLQ, staging and gate are identical.
  assert.strictEqual(next.bronzeRows, normal.bronzeRows);
  assert.strictEqual(next.bronzeRows, 60);
  assert.deepStrictEqual(next.dlq, normal.dlq);
  assert.deepStrictEqual(next.staging, normal.staging);
  assert.strictEqual(next.gate, normal.gate);
  // A batch that follows a long operator session lands the same rows as one with no extra actions.
  const fixed = Engine.replay("incident", A.slice(0, 14));
  const extra = { ...fixed, clock: { epoch: run(4) + 600, iso: iso(run(4) + 600) } };
  const a = Engine.reduce(extra, { type: "runBatch" }), b = Engine.reduce(fixed, { type: "runBatch" });
  assert.strictEqual(a.clock.epoch, run(4) + 600);
  assert.strictEqual(b.clock.epoch, run(4));
  assert.strictEqual(a.bronzeRows, b.bronzeRows);
  assert.strictEqual(a.productionRows, b.productionRows);
  assert.deepStrictEqual(a.productionKeys, b.productionKeys);
  assert.strictEqual(a.publishedAbnormal, b.publishedAbnormal);
});

test("export data and run epochs are the same as v1.1", () => {
  assert.deepStrictEqual([1, 2, 3, 4, 5].map(run), [1793716200, 1793717100, 1793718000, 1793718900, 1793719800]);
  assert.strictEqual(Engine.exportRunEpoch(1), Engine.BASE_EPOCH + 1800);
  // Fingerprint (FNV-1a over the JSON text of incident exports 1-5), recorded from engine-v1.1 before the clock change.
  const text = JSON.stringify([1, 2, 3, 4, 5].map((n) => Engine.generateExport(n, "incident")));
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i) & 0xff; h = Math.imul(h, 0x01000193) >>> 0; }
  assert.strictEqual(h.toString(16), "cb6deb8b");
  assert.strictEqual(Engine.generateExport(3, "incident").runEpoch, 1793718000);
  // KPI tiles keep reading the export's run epoch, not the operator clock.
  Engine.getState("incident", A).kpis.forEach((k) => assert.strictEqual(k.asOfIso, "2026-11-03T15:15:00Z"));
});

test("getTimeline equals getState events", () => {
  [3, 8, 14, 16].forEach((k) => {
    assert.deepStrictEqual(Engine.getTimeline("incident", A.slice(0, k)), Engine.getState("incident", A.slice(0, k)).events);
  });
});
