const test = require("node:test");
const assert = require("node:assert");
const Engine = require("../engine.js");

// One block per vital code: [code, unit, a clearly abnormal value, a clearly normal value].
const CASES = [
  ["8867-4", "/min", 120, 80],
  ["8480-6", "mm[Hg]", 160, 120],
  ["59408-5", "%", 90, 97],
  ["8310-5", "Cel", 39.0, 36.8],
];
const ID = "SGH-P-100001";
const mk = (code, unit, value) => ({ patient_id: ID, vital_code: code, vital_value: value, unit });

CASES.forEach(([code, unit, high, normal]) => {
  test("not evaluable: " + code, () => {
    const withValue = (v) => mk(code, unit, v);
    const missing = { patient_id: ID, vital_code: code, unit };
    const bad = [withValue(null), missing, withValue(undefined), withValue(NaN), withValue(Infinity), withValue("88")];
    bad.forEach((r, i) => {
      assert.strictEqual(Engine.isAbnormal(r), false, code + " bad case " + i);
      assert.strictEqual(Engine.isEvaluable(r), false, code + " bad case " + i);
    });
    assert.strictEqual(Engine.isAbnormal(withValue(high)), true);
    assert.strictEqual(Engine.isEvaluable(withValue(high)), true);
    assert.strictEqual(Engine.isAbnormal(withValue(normal)), false);
    assert.strictEqual(Engine.isEvaluable(withValue(normal)), true);
  });

  test("naiveAbnormalStats keeps the not-evaluable row out of numerator and denominator: " + code, () => {
    const rows = [
      mk(code, unit, high), // counted, evaluable, abnormal
      mk(code, unit, normal), // counted, evaluable, normal
      mk(code, unit, null), // counted by the join, not evaluable
      { patientId: ID, vitalCode: code }, // renamed columns: dropped by the join
    ];
    // Hand calculation: 1 dropped; 3 pass the join (counted); 1 of those is not evaluable, so evaluable = 2;
    // abnormal = 1; ratePct = 1 / 2 * 100 = 50 (a naive 1 / 3 = 33.33 would count the null as normal).
    const st = Engine.naiveAbnormalStats(rows);
    assert.deepStrictEqual(st, { dropped: 1, counted: 3, evaluable: 2, notEvaluable: 1, abnormal: 1, ratePct: 50 });
    assert.strictEqual(Engine.naiveAbnormalRate(rows), 50);
  });

  test("summarizePublished on a mixed list: " + code, () => {
    const rows = [mk(code, unit, high), mk(code, unit, normal), mk(code, unit, null), mk(code, unit, NaN), mk(code, unit, "88")];
    assert.deepStrictEqual(Engine.summarizePublished(rows), { observations: 5, abnormalCount: 1, notEvaluable: 3 });
  });
});

test("naiveAbnormalStats edge cases", () => {
  assert.deepStrictEqual(Engine.naiveAbnormalStats([]), { dropped: 0, counted: 0, evaluable: 0, notEvaluable: 0, abnormal: 0, ratePct: 0 });
  const onlyNull = [mk("8867-4", "/min", null)];
  assert.strictEqual(Engine.naiveAbnormalStats(onlyNull).evaluable, 0);
  assert.strictEqual(Engine.naiveAbnormalRate(onlyNull), 0);
  assert.strictEqual(Engine.isEvaluable({ vital_code: "9999-9", vital_value: 80 }), false);
  assert.strictEqual(Engine.isEvaluable(null), false);
});

test("summarizePublished on an empty list", () => {
  assert.deepStrictEqual(Engine.summarizePublished([]), { observations: 0, abnormalCount: 0, notEvaluable: 0 });
});

test("todaySoFar.notEvaluable is 0 for the scripted incident and the rate uses the evaluable denominator", () => {
  const s = Engine.getState("incident", Engine.AUTOPLAY.incident);
  assert.strictEqual(s.publishedNotEvaluable, 0);
  const t = s.todaySoFar;
  assert.strictEqual(t.notEvaluable, 0);
  assert.strictEqual(t.observations, 76);
  assert.strictEqual(t.abnormalVitalRate, (t.abnormalCount / (t.observations - t.notEvaluable)) * 100);
  const zero = Engine.getState("healthy", []).todaySoFar;
  assert.strictEqual(zero.notEvaluable, 0);
  assert.strictEqual(zero.abnormalVitalRate, 0);
});

test("initialState starts with publishedNotEvaluable 0", () => {
  assert.strictEqual(Engine.initialState("healthy").publishedNotEvaluable, 0);
});

test("runTests abnormal_vital_flag does not flag non-evaluable rows", () => {
  const rows = [mk("8867-4", "/min", "130"), mk("8867-4", "/min", null), mk("8867-4", "/min", 130)];
  const flag = Engine.runTests(rows).results.find((r) => r.test === "abnormal_vital_flag");
  assert.deepStrictEqual(flag.failingRows, [2]);
});
