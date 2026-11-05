const test = require("node:test");
const assert = require("node:assert");
const Engine = require("../engine.js");

// Every expected value is derived here from generateExport, repairRow and isAbnormal, not from engine counters.
// Literal pins were recorded after the explicit abnormal share (Item 1).
const A = Engine.AUTOPLAY.incident;
const exp = (n, sc = "incident") => Engine.generateExport(n, sc).rows;
const abn = (rows) => rows.filter((r) => Engine.isAbnormal(r)).length;
const REPAIRED = [2, 6, 10, 15, 19], DISCARDED = [4, 9, 13, 17];
const b3 = exp(3);
const validB3 = b3.filter((r, i) => ![...REPAIRED, ...DISCARDED].includes(i + 1));
const repairedB3 = REPAIRED.map((i) => Engine.repairRow(b3[i - 1]));
const discardedB3 = DISCARDED.map((i) => b3[i - 1]);
const clean = [...exp(1), ...exp(2)];
const CLEAN = { observations: 40, abnormalCount: abn(clean), abnormalVitalRate: (abn(clean) / 40) * 100 };

test("independent clean-batch pins", () => {
  assert.deepStrictEqual(CLEAN, { observations: 40, abnormalCount: 5, abnormalVitalRate: 12.5 });
  assert.strictEqual(validB3.length, 11);
  assert.strictEqual(repairedB3.length, 5);
});

for (let k = 3; k <= 14; k++) {
  test("held state, k=" + k + ": nothing from the held batch is counted", () => {
    const s = Engine.replay("incident", A.slice(0, k));
    const t = Engine.getState("incident", A.slice(0, k)).todaySoFar;
    assert.strictEqual(t.observations, CLEAN.observations);
    assert.strictEqual(t.abnormalCount, CLEAN.abnormalCount);
    assert.strictEqual(t.abnormalVitalRate, CLEAN.abnormalVitalRate);
    assert.strictEqual(s.productionRows, 40);
    // Gate: OPEN from the failed batch (k=3) through ackAlert (k=13); HALF_OPEN after resolveRetry (k=14).
    assert.strictEqual(s.gate, k === 14 ? "HALF_OPEN" : "OPEN");
    // Staged rows: 11 valid rows at k=3, +1 per repair (k=4..8) up to 16; discards leave them at 16.
    const repairsDone = Math.min(Math.max(k - 3, 0), 5);
    assert.strictEqual(s.staging.length, 11 + repairsDone);
    assert.strictEqual(s.publishedObservations, 40);
  });
}

test("held state: staged rows grow 11 -> 16 and are never counted", () => {
  assert.strictEqual(Engine.replay("incident", A.slice(0, 3)).staging.length, 11);
  assert.strictEqual(Engine.replay("incident", A.slice(0, 8)).staging.length, 16);
  assert.strictEqual(Engine.replay("incident", A.slice(0, 14)).staging.length, 16);
});

test("failing trial after repairs: the gate re-opens, nothing is published, staging and DLQ grow", () => {
  // replay(scenario, actions, opts): opts.faultExports seeds state.faultExports and is passed to every reduce.
  const before = Engine.replay("incident", A.slice(0, 14), { faultExports: [3, 4] });
  const trial = [...A.slice(0, 14), { type: "runBatch" }];
  const after = Engine.replay("incident", trial, { faultExports: [3, 4] });
  assert.strictEqual(before.gate, "HALF_OPEN");
  assert.strictEqual(after.gate, "OPEN");
  assert.strictEqual(after.productionRows, 40);
  const t = Engine.getState("incident", trial, { faultExports: [3, 4] }).todaySoFar;
  assert.strictEqual(t.observations, CLEAN.observations);
  assert.strictEqual(t.abnormalCount, CLEAN.abnormalCount);
  assert.strictEqual(t.abnormalVitalRate, CLEAN.abnormalVitalRate);
  assert.ok(after.staging.length > before.staging.length);
  assert.ok(after.dlq.length > before.dlq.length);
  assert.ok(after.dlq.some((d) => d.batchId === "batch-4" && d.status === "open"));
});

test("no double counting after the full AUTOPLAY.incident", () => {
  const s = Engine.getState("incident", A);
  assert.strictEqual(s.todaySoFar.observations, 76);
  assert.strictEqual(s.productionRows, 76);
  assert.strictEqual(new Set(s.productionKeys).size, 76);
  const once = abn([...exp(1), ...exp(2), ...exp(4), ...validB3, ...repairedB3]);
  assert.strictEqual(s.todaySoFar.abnormalCount, once);
  assert.strictEqual(once, 10);
  // Repaired rows must be counted exactly once: excluded or doubled gives a different count.
  const repairedAbn = abn(repairedB3);
  if (repairedAbn > 0) {
    assert.strictEqual(repairedAbn, 2); // row 6 (SpO2 89) and row 15 (temperature 38.7)
    assert.notStrictEqual(s.todaySoFar.abnormalCount, once - repairedAbn);
    assert.notStrictEqual(s.todaySoFar.abnormalCount, once + repairedAbn);
  } else {
    assert.strictEqual(s.todaySoFar.observations, 76);
    assert.notStrictEqual(s.todaySoFar.observations, 71);
    assert.notStrictEqual(s.todaySoFar.observations, 81);
  }
  assert.strictEqual(s.todaySoFar.abnormalVitalRate, (once / 76) * 100);
});

test("discarded rows are never counted", () => {
  const s = Engine.getState("incident", A);
  assert.strictEqual(s.dlq.filter((d) => d.status === "discarded").length, 4);
  const without = abn([...exp(1), ...exp(2), ...exp(4), ...validB3, ...repairedB3]);
  assert.strictEqual(s.todaySoFar.abnormalCount, without);
  // Note: none of the four discarded rows is abnormal (systolic 106, SpO2 130, heart rate 55 and the mmHg row 78
  // or the null/injection ids), so an abnormal-count bug would not show here. The observation count (76, not 80)
  // and the key count are what catch a discarded row being published.
  assert.strictEqual(abn(discardedB3), 0);
  assert.strictEqual(s.todaySoFar.observations, 76);
  const keys = new Set(s.productionKeys);
  discardedB3.forEach((r) => assert.ok(!keys.has(r.patient_id + "|" + r.vital_sequence) || r.patient_id === null));
});

test("healthy: running counts after each of the 4 batches", () => {
  const rows = [];
  [5, 5, 9, 10].forEach((pin, i) => {
    rows.push(...exp(i + 1, "healthy"));
    const t = Engine.getState("healthy", Engine.AUTOPLAY.healthy.slice(0, i + 1)).todaySoFar;
    assert.strictEqual(t.observations, 20 * (i + 1));
    assert.strictEqual(t.abnormalCount, abn(rows));
    assert.strictEqual(t.abnormalCount, pin);
  });
});

test("after recovery: staging is empty, every DLQ entry is resolved, and the next batch does not double-publish", () => {
  const s = Engine.replay("incident", A);
  assert.strictEqual(s.staging.length, 0);
  assert.strictEqual(s.dlq.length, 9);
  s.dlq.forEach((d) => assert.ok(d.status === "repaired" || d.status === "discarded", d.dlqId + " is " + d.status));
  const next = [...A, { type: "runBatch" }];
  const n = Engine.replay("incident", next);
  assert.strictEqual(n.productionRows, 96);
  assert.strictEqual(Engine.getState("incident", next).todaySoFar.observations, 96);
  assert.strictEqual(new Set(n.productionKeys).size, n.productionKeys.length);
  assert.strictEqual(n.productionKeys.length, 96);
});

test("faultExports [6]: recovery after six batches, gate CLOSED, 136 observations, 14 abnormal", () => {
  const FE = { faultExports: [6] };
  const run = { type: "runBatch" };
  const actions = [
    run, run, run, run, run, run,
    ...REPAIRED.map((i) => ({ type: "repairRow", dlqId: "dlq-6-" + i })),
    ...DISCARDED.map((i) => ({ type: "discardRow", dlqId: "dlq-6-" + i, reason: "unrepairable" })),
    { type: "ackAlert" }, { type: "resolveRetry" }, run, // export 7 is the trial
  ];
  const gx = (n) => Engine.generateExport(n, "incident", FE).rows;
  const b6 = gx(6);
  const valid6 = b6.filter((r, i) => ![...REPAIRED, ...DISCARDED].includes(i + 1));
  const repaired6 = REPAIRED.map((i) => Engine.repairRow(b6[i - 1]));
  const discarded6 = DISCARDED.map((i) => b6[i - 1]);
  const published = [...gx(1), ...gx(2), ...gx(3), ...gx(4), ...gx(5), ...valid6, ...repaired6, ...gx(7)];
  // Independent expectations: 5 clean exports (100) + 11 valid + 5 repaired from export 6 + export 7 (20) = 136.
  assert.strictEqual(published.length, 136);
  assert.strictEqual(abn(published), 14);
  // A bug that counted discarded rows would change abnormalCount only if a discarded row is abnormal: row 4 is
  // a systolic 154 (above 140), so it is. This makes the assertions below sensitive to that bug.
  assert.ok(abn(discarded6) >= 1, "at least one discarded row must be abnormal");
  const s = Engine.getState("incident", actions, FE);
  assert.strictEqual(s.gate, "CLOSED");
  assert.strictEqual(s.todaySoFar.observations, published.length);
  assert.strictEqual(s.todaySoFar.abnormalCount, abn(published));
  assert.strictEqual(s.todaySoFar.observations, 136);
  assert.strictEqual(s.todaySoFar.abnormalCount, 14);
  assert.notStrictEqual(s.todaySoFar.abnormalCount, abn([...published, ...discarded6]));
  assert.strictEqual(s.staging.length, 0);
});
