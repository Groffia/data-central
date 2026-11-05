const test = require("node:test");
const assert = require("node:assert");
const Engine = require("../engine.js");

const INC = Engine.AUTOPLAY.incident;
const HEAL = Engine.AUTOPLAY.healthy;
const run = { type: "runBatch" };

const countsByTest = (results) => results.map((r) => [r.test + ":" + (r.column || ""), r.failingRows.length]);

test("incident batch 3: held, 20 rows, 9 dlq ids", () => {
  const b = Engine.inspectBatch("incident", INC.slice(0, 3), 3);
  assert.equal(b.n, 3);
  assert.equal(b.batchId, "batch-3");
  assert.equal(b.decision, "HELD");
  assert.equal(b.rows.length, 20);
  assert.equal(b.dlqIds.length, 9);
  assert.deepEqual(b.dlqIds, Engine.replay("incident", INC.slice(0, 3)).dlq.map((d) => d.dlqId));
  assert.equal(b.runEpoch, Engine.generateExport(3, "incident").runEpoch);
  assert.deepEqual(b.rows, Engine.generateExport(3, "incident").rows);
});

test("incident batch 3: failing-row counts match the spec matrix", () => {
  const b = Engine.inspectBatch("incident", INC.slice(0, 3), 3);
  const count = (test, column) => {
    const hits = b.results.filter((r) => r.test === test && (column === undefined || r.column === column));
    assert.ok(hits.length >= 1, test + " " + column);
    return hits.reduce((a, r) => a + r.failingRows.length, 0);
  };
  const expected = {
    "not_null:patient_id": 6,
    "not_null:patient_name": 5, "not_null:patient_zip5": 5, "not_null:birth_date": 5, "not_null:encounter_epoch": 5,
    "not_null:vital_sequence": 5, "not_null:vital_code": 5, "not_null:vital_value": 5, "not_null:cipher_suite": 5,
    "range:vital_value": 1, "matches_pattern:patient_id": 1, "accepted_values:unit": 1,
    "abnormal_vital_flag:vital_value": 2,
  };
  const seen = new Set();
  b.results.forEach((r) => {
    const key = r.test + ":" + r.column;
    seen.add(key);
    let want = 0;
    if (r.test === "no_unexpected_columns") want = 5;
    else if (r.test === "unit_matches_code") want = 1;
    else if (r.test === "abnormal_vital_flag") want = 2;
    else if (key in expected) want = expected[key];
    assert.equal(r.failingRows.length, want, key + " (" + r.severity + ")");
  });
  ["not_null:patient_id", "range:vital_value", "matches_pattern:patient_id", "accepted_values:unit"].forEach((k) => assert.ok(seen.has(k), k));
  assert.equal(count("no_unexpected_columns"), 5);
  assert.equal(count("unit_matches_code"), 1);
  assert.equal(count("abnormal_vital_flag"), 2);
  assert.equal(b.results.find((r) => r.test === "abnormal_vital_flag").severity, "warn");
});

test("published batches have zero error-severity failures", () => {
  [1, 2, 4].forEach((n) => {
    const b = Engine.inspectBatch("incident", INC, n);
    assert.equal(b.decision, "PUBLISHED", "batch " + n);
    b.results.filter((r) => r.severity === "error").forEach((r) => assert.equal(r.failingRows.length, 0, n + " " + r.test + " " + r.column));
  });
});

test("null cases", () => {
  assert.equal(Engine.inspectBatch("incident", INC, 5), null);
  assert.equal(Engine.inspectBatch("incident", INC.slice(0, 3), 4), null);
  [1, 2, 3, 4, 99].forEach((n) => assert.equal(Engine.inspectBatch("healthy", [], n), null));
  [0, -1, 1.5, NaN, Infinity, "3", null, undefined, {}].forEach((n) => assert.equal(Engine.inspectBatch("incident", INC, n), null, String(n)));
  assert.equal(Engine.inspectBatch("incident", null, 1), null);
  assert.throws(() => Engine.inspectBatch("bogus", [], 1));
});

test("a rejected runBatch does not count as a run", () => {
  const acts = [run, run, run, run, run]; // gate OPEN after 3: 4th and 5th are rejected
  assert.equal(Engine.replay("incident", acts).batchesRun, 3);
  assert.equal(Engine.inspectBatch("incident", acts, 4), null);
  assert.equal(Engine.inspectBatch("incident", acts, 3).decision, "HELD");
  // unknown actions interleaved do not shift batch numbering
  const mixed = [{ type: "nope" }, run, { type: "resolveRetry" }, run, run];
  assert.equal(Engine.inspectBatch("healthy", mixed, 2).batchId, "batch-2");
  assert.equal(Engine.inspectBatch("healthy", mixed, 3).batchId, "batch-3");
  assert.equal(Engine.inspectBatch("healthy", mixed, 4), null);
});

test("does not change state; repeat call deep-equals", () => {
  const before = JSON.stringify(Engine.replay("incident", INC));
  const a = Engine.inspectBatch("incident", INC, 3);
  const b = Engine.inspectBatch("incident", INC, 3);
  assert.deepStrictEqual(a, b);
  assert.equal(JSON.stringify(Engine.replay("incident", INC)), before);
  a.rows[0].patient_id = "mutated";
  assert.notEqual(Engine.inspectBatch("incident", INC, 3).rows[0].patient_id, "mutated");
});

function batchPlan(scenario, actions) {
  // independent oracle: state before each runBatch that the reducer accepted
  const out = [];
  for (let i = 0; i < actions.length; i++) {
    const before = Engine.replay(scenario, actions.slice(0, i));
    const after = Engine.replay(scenario, actions.slice(0, i + 1));
    if (after.batchesRun === before.batchesRun + 1) out.push({ n: after.batchesRun, before, after });
  }
  return out;
}

for (const [scenario, actions] of [["incident", INC], ["healthy", HEAL]]) {
  test(scenario + ": every batch equals independently recomputed results and the reducer's decision", () => {
    const plan = batchPlan(scenario, actions);
    assert.ok(plan.length >= 4);
    plan.forEach(({ n, before, after }) => {
      const b = Engine.inspectBatch(scenario, actions, n);
      const exp = Engine.generateExport(n, scenario);
      const t = Engine.runTests(exp.rows, new Set(before.productionKeys), exp.runEpoch);
      assert.deepEqual(b.rows, exp.rows, "rows " + n);
      assert.equal(b.runEpoch, exp.runEpoch);
      assert.deepEqual(b.results, t.results, "results " + n);
      assert.deepEqual(b.rowFailures, t.rowFailures, "rowFailures " + n);
      const published = after.productionRows > before.productionRows;
      assert.equal(b.decision, published ? "PUBLISHED" : "HELD", "decision " + n);
      assert.equal(b.decision === "HELD", after.gate === "OPEN");
      assert.deepEqual(b.dlqIds, after.dlq.slice(before.dlq.length).map((d) => d.dlqId), "dlq " + n);
      assert.equal(b.decision === "HELD", b.results.some((r) => r.severity === "error" && r.failingRows.length > 0));
    });
  });
}

test("healthy batches all PUBLISHED with no dlq ids", () => {
  [1, 2, 3, 4].forEach((n) => {
    const b = Engine.inspectBatch("healthy", HEAL, n);
    assert.equal(b.decision, "PUBLISHED");
    assert.deepEqual(b.dlqIds, []);
  });
});

test("faultExports option is respected like getState", () => {
  const opts = { faultExports: [2] };
  const b = Engine.inspectBatch("healthy", [run, run], 2, opts);
  assert.equal(b.decision, "HELD");
  assert.deepEqual(b.rows, Engine.generateExport(2, "healthy", opts).rows);
  assert.equal(Engine.inspectBatch("healthy", [run, run], 2).decision, "PUBLISHED");
});
