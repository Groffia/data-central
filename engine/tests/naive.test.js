const test = require("node:test");
const assert = require("node:assert");
const Engine = require("../engine.js");

const INC = Engine.AUTOPLAY.incident;
const HEAL = Engine.AUTOPLAY.healthy;
const RENAMED = "renamed columns: patient_id key missing, dropped by join to dim_patient";

test("incident step 3: naive sample numbers", () => {
  const n = Engine.naiveSample("incident", INC.slice(0, 3));
  assert.equal(n.counted, 53);
  assert.equal(n.dropped, 7);
  assert.equal(n.droppedReasons.length, 7);
  const REN = ["dlq-3-2", "dlq-3-6", "dlq-3-10", "dlq-3-15", "dlq-3-19"];
  assert.deepEqual(n.droppedReasons.map((d) => d.dlqId), ["dlq-3-2", "dlq-3-4", "dlq-3-6", "dlq-3-10", "dlq-3-13", "dlq-3-15", "dlq-3-19"]);
  n.droppedReasons.forEach((d) => {
    const want = REN.includes(d.dlqId) ? RENAMED : d.dlqId === "dlq-3-4" ? "null patient_id: dropped by join to dim_patient" : "patient_id matches no dim_patient row";
    assert.equal(d.reason, want);
  });
  const bc = Engine.getState("incident", INC.slice(0, 3)).businessCase;
  assert.deepEqual(n.droppedReasons, bc.silentlyDroppedRows);
  assert.equal(n.invalidReadings, 2);
  assert.equal(n.invalidReadings, bc.invalidRowsReachingDashboard);
  assert.equal(n.abnormal, 7);
  assert.equal(n.ratePct.toFixed(1), "13.2");
  assert.equal(n.published, 40);
});

test("incident step 2 and healthy any step: nothing dropped or invalid", () => {
  const a = Engine.naiveSample("incident", INC.slice(0, 2));
  assert.equal(a.dropped, 0);
  assert.equal(a.invalidReadings, 0);
  for (let i = 0; i <= HEAL.length; i++) {
    const h = Engine.naiveSample("healthy", HEAL.slice(0, i));
    assert.equal(h.dropped, 0);
    assert.equal(h.invalidReadings, 0);
  }
});

test("does not change state", () => {
  const before = JSON.stringify(Engine.getState("incident", INC.slice(0, 3)));
  Engine.naiveSample("incident", INC.slice(0, 3));
  assert.equal(JSON.stringify(Engine.getState("incident", INC.slice(0, 3))), before);
});

test("invalid scenario throws like getState; bad actions return null", () => {
  let e1, e2;
  try { Engine.getState("nope", []); } catch (e) { e1 = e; }
  try { Engine.naiveSample("nope", []); } catch (e) { e2 = e; }
  assert.ok(e1 && e2);
  assert.equal(e2.message, e1.message);
  assert.equal(Engine.naiveSample("incident", "x"), null);
  assert.equal(Engine.naiveSample("incident", null), null);
  assert.equal(Engine.naiveSample("incident", {}), null);
});

// ----- single-pass naiveSample equals the old per-batch computation (fix A) -----
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function oldNaiveSample(scenario, actions) {
  const state = Engine.getState(scenario, actions);
  let counted = 0, dropped = 0, abnormal = 0, evaluable = 0;
  for (let n = 1; n <= state.batchesRun; n++) {
    const b = Engine.inspectBatch(scenario, actions, n);
    if (!b) continue;
    const s = Engine.naiveAbnormalStats(b.rows);
    counted += s.counted; dropped += s.dropped; abnormal += s.abnormal; evaluable += s.evaluable;
  }
  return {
    counted, dropped,
    droppedReasons: state.businessCase.silentlyDroppedRows.map((d) => ({ dlqId: d.dlqId, reason: d.reason })),
    invalidReadings: state.businessCase.invalidRowsReachingDashboard,
    abnormal, ratePct: evaluable ? (abnormal / evaluable) * 100 : 0,
    published: state.todaySoFar.observations,
  };
}

test("single-pass naiveSample deep-equals the per-batch computation at every scripted step", () => {
  ["healthy", "incident"].forEach((sc) => {
    const script = Engine.AUTOPLAY[sc];
    for (let k = 0; k <= script.length; k++) {
      assert.deepStrictEqual(Engine.naiveSample(sc, script.slice(0, k)), oldNaiveSample(sc, script.slice(0, k)), sc + " step " + k);
    }
  });
});

test("single-pass naiveSample deep-equals the per-batch computation for 50 seeded diverged action lists", () => {
  const rnd = mulberry32(20261105);
  const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
  for (let i = 0; i < 50; i++) {
    const sc = i % 2 ? "incident" : "healthy";
    const actions = [];
    const len = 3 + Math.floor(rnd() * 12);
    for (let j = 0; j < len; j++) {
      const dlq = Engine.getState(sc, actions).dlq.map((d) => d.dlqId);
      const kind = pick(["runBatch", "runBatch", "repairRow", "discardRow", "ackAlert", "resolveRetry", "resolveAlert"]);
      if (kind === "repairRow" || kind === "discardRow") {
        if (!dlq.length) { actions.push({ type: "runBatch" }); continue; }
        const a = { type: kind, dlqId: pick(dlq) };
        if (kind === "discardRow") a.reason = pick(Engine.DISCARD_REASONS);
        actions.push(a);
      } else actions.push({ type: kind });
    }
    assert.deepStrictEqual(Engine.naiveSample(sc, actions), oldNaiveSample(sc, actions), "list " + i);
  }
});

test("naiveSample is fast for 200 runs and getState is not the bottleneck", () => {
  const actions = Array.from({ length: 200 }, () => ({ type: "runBatch" }));
  const t0 = process.hrtime.bigint();
  const n = Engine.naiveSample("healthy", actions);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const g0 = process.hrtime.bigint();
  Engine.getState("healthy", actions);
  const gms = Number(process.hrtime.bigint() - g0) / 1e6;
  console.log("naiveSample 200 runs: " + ms.toFixed(0) + " ms; getState: " + gms.toFixed(0) + " ms");
  assert.ok(n.counted > 0);
  assert.ok(ms < 1500, "took " + ms + " ms");
});
