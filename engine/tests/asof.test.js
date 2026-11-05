const test = require("node:test");
const assert = require("node:assert");
const Engine = require("../engine.js");

const BASE_EPOCH = 1793714400; // contract: 2026-11-03T14:00:00Z
const run = (n) => Array.from({ length: n }, () => ({ type: "runBatch" }));
const iso = (n) => Engine.isoFromEpoch(Engine.exportRunEpoch(n));

// Independent count: built from generateExport rows, repairRow and isAbnormal, not from engine state.
const abn = (rows) => rows.filter((r) => Engine.isAbnormal(r)).length;
const exp = (n, sc) => Engine.generateExport(n, sc).rows;
const REPAIRED = [2, 6, 10, 15, 19], DISCARDED = [4, 9, 13, 17];
const STAGED_VALID = (rows) => rows.filter((r, i) => ![...REPAIRED, ...DISCARDED].includes(i + 1));

test("KPI tiles carry asOfBatchId, asOfIso and held while the gate is OPEN", () => {
  const s = Engine.getState("incident", [...Engine.PRELUDE.incident, { type: "runBatch" }]);
  assert.strictEqual(s.held, true);
  assert.strictEqual(s.kpis.length, 4);
  s.kpis.forEach((k) => {
    assert.strictEqual(k.asOfBatchId, "batch-2");
    assert.strictEqual(k.asOfIso, iso(2));
    assert.strictEqual(k.held, true);
  });
});

test("KPI tiles advance and un-hold after the full AUTOPLAY.incident", () => {
  const s = Engine.getState("incident", Engine.AUTOPLAY.incident);
  s.kpis.forEach((k) => {
    assert.strictEqual(k.asOfBatchId, "batch-4");
    assert.strictEqual(k.asOfIso, iso(4));
    assert.strictEqual(k.held, false);
  });
});

test("healthy with zero batches: asOf is the base epoch, not held", () => {
  const s = Engine.getState("healthy", []);
  s.kpis.forEach((k) => {
    assert.strictEqual(k.asOfBatchId, null);
    assert.strictEqual(k.asOfIso, Engine.isoFromEpoch(BASE_EPOCH));
    assert.strictEqual(k.held, false);
  });
});

test("7-day KPI numbers are unchanged by the as-of fields", () => {
  const plain = Engine.computeKpis(Engine.getHistory());
  const s = Engine.getState("healthy", []);
  plain.forEach((k, i) => {
    assert.strictEqual(s.kpis[i].value, k.value);
    assert.strictEqual(s.kpis[i].priorValue, k.priorValue);
    assert.strictEqual(s.kpis[i].deltaPct, k.deltaPct);
  });
});

test("todaySoFar: healthy batches publish 20 rows each", () => {
  const zero = Engine.getState("healthy", []).todaySoFar;
  assert.deepStrictEqual(zero, {
    label: "Live sample: published exports today.",
    note: "The first five readings are hand-picked edge cases, so early batches run above the 7-day rate.",
    observations: 0, abnormalCount: 0, notEvaluable: 0, abnormalVitalRate: 0,
  });
  const t1 = Engine.getState("healthy", run(1)).todaySoFar;
  const t2 = Engine.getState("healthy", run(2)).todaySoFar;
  assert.strictEqual(t1.observations, 20);
  assert.strictEqual(t2.observations, 40);
  assert.strictEqual(t1.abnormalCount, abn(exp(1, "healthy")));
  assert.strictEqual(t2.abnormalCount, abn(exp(1, "healthy")) + abn(exp(2, "healthy")));
  assert.strictEqual(t2.abnormalVitalRate, (t2.abnormalCount / 40) * 100);
  // Pins recorded after the explicit abnormal share (old values: 6 and 9 abnormal).
  assert.strictEqual(t1.abnormalCount, 5);
  assert.strictEqual(t2.abnormalCount, 5);
  assert.strictEqual(t2.abnormalVitalRate, 12.5);
});

test("todaySoFar: the held incident batch publishes nothing", () => {
  const two = Engine.getState("incident", run(2)).todaySoFar;
  const three = Engine.getState("incident", run(3)).todaySoFar;
  assert.strictEqual(two.observations, 40);
  assert.deepStrictEqual(three, two);
});

test("todaySoFar after AUTOPLAY.incident is 76 rows with an independently computed abnormal count", () => {
  const t = Engine.getState("incident", Engine.AUTOPLAY.incident).todaySoFar;
  const b3 = exp(3, "incident");
  const repaired = REPAIRED.map((i) => Engine.repairRow(b3[i - 1]));
  repaired.forEach((r) => assert.strictEqual(typeof r.vital_value, "number"));
  const rows = [...exp(1, "incident"), ...exp(2, "incident"), ...exp(4, "incident"), ...STAGED_VALID(b3), ...repaired];
  assert.strictEqual(rows.length, 76);
  assert.strictEqual(t.observations, 76);
  assert.strictEqual(t.abnormalCount, abn(rows));
  assert.strictEqual(t.abnormalVitalRate, (t.abnormalCount / t.observations) * 100);
  assert.strictEqual(t.abnormalCount, 10); // recorded pin (old value 18)
});

test("todaySoFar changes on every published batch of AUTOPLAY.healthy", () => {
  const seen = [];
  for (let n = 1; n <= 4; n++) seen.push(JSON.stringify(Engine.getState("healthy", Engine.AUTOPLAY.healthy.slice(0, n)).todaySoFar));
  assert.strictEqual(new Set(seen).size, 4);
});
