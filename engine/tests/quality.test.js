const test = require("node:test");
const assert = require("node:assert");
const Engine = require("../engine.js");

const GOLDEN = Engine.getContract().goldenRows;
const clone = (o) => JSON.parse(JSON.stringify(o));
const find = (res, test, column) => res.results.find((r) => r.test === test && (column === undefined || r.column === column));
const failed = (res, test) => res.results.filter((r) => r.test === test).flatMap((r) => r.failingRows);
const camel = (row) => {
  const o = {};
  for (const [k, v] of Object.entries(row)) o[k.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase())] = v;
  return o;
};

test("golden export and healthy exports 1-4 give hasErrors false", () => {
  assert.strictEqual(Engine.runTests(clone(GOLDEN)).hasErrors, false);
  for (let n = 1; n <= 4; n++) {
    const res = Engine.runTests(Engine.generateExport(n, "healthy").rows);
    assert.strictEqual(res.hasErrors, false, "export " + n);
    res.results.filter((r) => r.severity === "error").forEach((r) => assert.deepStrictEqual(r.failingRows, [], r.test));
  }
});

test("result shape and severities", () => {
  const res = Engine.runTests(clone(GOLDEN));
  assert.deepStrictEqual(Object.keys(res).sort(), ["hasErrors", "results", "rowFailures"]);
  const sev = {};
  res.results.forEach((r) => { sev[r.test] = r.severity; assert.ok(Array.isArray(r.failingRows)); assert.ok(r.column); });
  ["not_null", "unique_combination_of_columns", "accepted_values", "range", "matches_pattern", "unit_matches_code", "no_unexpected_columns"]
    .forEach((t) => assert.strictEqual(sev[t], "error", t));
  ["freshness", "abnormal_vital_flag"].forEach((t) => assert.strictEqual(sev[t], "warn", t));
});

test("null patient_id fails not_null", () => {
  const rows = clone(GOLDEN); rows[2].patient_id = null;
  const res = Engine.runTests(rows);
  assert.deepStrictEqual(find(res, "not_null", "patient_id").failingRows, [2]);
  assert.strictEqual(res.hasErrors, true);
  assert.ok(res.rowFailures.find((f) => f.rowIndex === 2).tests.includes("not_null"));
});

test("SpO2 130 fails range", () => {
  const rows = clone(GOLDEN); rows[2].vital_value = 130;
  const res = Engine.runTests(rows);
  assert.deepStrictEqual(find(res, "range", "vital_value").failingRows, [2]);
  assert.strictEqual(res.hasErrors, true);
});

test("string vital_value fails range without throwing", () => {
  const rows = clone(GOLDEN); rows[0].vital_value = "88";
  const res = Engine.runTests(rows);
  assert.deepStrictEqual(find(res, "range", "vital_value").failingRows, [0]);
});

test("injection string patient_id fails matches_pattern", () => {
  const rows = clone(GOLDEN); rows[1].patient_id = "'; DROP TABLE silver_vital_observation;--";
  const res = Engine.runTests(rows);
  assert.deepStrictEqual(find(res, "matches_pattern", "patient_id").failingRows, [1]);
  assert.strictEqual(res.hasErrors, true);
});

test("bad zip and birth_date fail matches_pattern", () => {
  const rows = clone(GOLDEN); rows[0].patient_zip5 = "5510"; rows[3].birth_date = "30/11/2004";
  const res = Engine.runTests(rows);
  assert.deepStrictEqual(find(res, "matches_pattern", "patient_zip5").failingRows, [0]);
  assert.deepStrictEqual(find(res, "matches_pattern", "birth_date").failingRows, [3]);
});

test("mmHg on 8867-4 fails accepted_values and unit_matches_code", () => {
  const rows = clone(GOLDEN); rows[0].unit = "mmHg";
  const res = Engine.runTests(rows);
  assert.deepStrictEqual(find(res, "accepted_values", "unit").failingRows, [0]);
  assert.deepStrictEqual(failed(res, "unit_matches_code"), [0]);
  assert.deepStrictEqual(res.rowFailures.find((f) => f.rowIndex === 0).tests.sort(), ["accepted_values", "unit_matches_code"]);
});

test("valid unit on the wrong code fails unit_matches_code only", () => {
  const rows = clone(GOLDEN); rows[0].unit = "%";
  const res = Engine.runTests(rows);
  assert.deepStrictEqual(failed(res, "accepted_values"), []);
  assert.deepStrictEqual(failed(res, "unit_matches_code"), [0]);
});

test("bad vital_code and cipher_suite fail accepted_values", () => {
  const rows = clone(GOLDEN); rows[1].vital_code = "0000-0"; rows[4].cipher_suite = "NULL";
  const res = Engine.runTests(rows);
  assert.deepStrictEqual(find(res, "accepted_values", "vital_code").failingRows, [1]);
  assert.deepStrictEqual(find(res, "accepted_values", "cipher_suite").failingRows, [4]);
});

test("camelCased row: missing keys count as null, extras fail no_unexpected_columns", () => {
  const rows = clone(GOLDEN); rows[3] = camel(rows[3]);
  const res = Engine.runTests(rows);
  assert.deepStrictEqual(failed(res, "no_unexpected_columns"), [3]);
  assert.deepStrictEqual(find(res, "not_null", "patient_id").failingRows, [3]);
  assert.strictEqual(res.hasErrors, true);
});

test("duplicate key within batch fails unique_combination_of_columns", () => {
  const rows = clone(GOLDEN); rows.push({ ...rows[0], vital_value: 90 });
  const res = Engine.runTests(rows);
  assert.deepStrictEqual(failed(res, "unique_combination_of_columns"), [0, 5]);
  assert.strictEqual(res.hasErrors, true);
});

test("key already in priorKeys fails unique_combination_of_columns", () => {
  const prior = new Set(["TMH-P-009317|1"]);
  const res = Engine.runTests(clone(GOLDEN), prior);
  assert.deepStrictEqual(failed(res, "unique_combination_of_columns"), [1]);
  assert.strictEqual(res.hasErrors, true);
});

test("row 25 hours old fails freshness only; hasErrors stays false", () => {
  const rows = clone(GOLDEN); rows[0].encounter_epoch = rows[4].encounter_epoch - 25 * 3600;
  const res = Engine.runTests(rows);
  assert.deepStrictEqual(find(res, "freshness", "encounter_epoch").failingRows, [0]);
  assert.strictEqual(find(res, "freshness").severity, "warn");
  assert.strictEqual(res.hasErrors, false);
});

test("freshness reference time is an optional third parameter", () => {
  const rows = clone(GOLDEN);
  const late = rows[4].encounter_epoch + 25 * 3600;
  const res = Engine.runTests(rows, undefined, late);
  assert.deepStrictEqual(find(res, "freshness").failingRows, [0, 1, 2, 3, 4]);
  assert.strictEqual(res.hasErrors, false);
  assert.deepStrictEqual(find(Engine.runTests(rows, undefined, rows[4].encounter_epoch), "freshness").failingRows, []);
});

test("abnormal_vital_flag marks golden rows 2, 3, 4 (indexes 1, 2, 3) and never sets hasErrors", () => {
  const res = Engine.runTests(clone(GOLDEN));
  const r = find(res, "abnormal_vital_flag");
  assert.strictEqual(r.severity, "warn");
  assert.deepStrictEqual(r.failingRows, [1, 2, 3]);
  assert.strictEqual(res.hasErrors, false);
});

test("runTests never throws on malformed input", () => {
  const bad = [
    null, undefined, [], {}, [null], [undefined], [1], ["x"], [[]],
    [{}], [{ patient_id: undefined, vital_code: null, vital_value: null, unit: null }],
    [{ vital_code: 5, unit: {}, vital_value: {}, patient_id: 12, birth_date: [], encounter_epoch: "soon", vital_sequence: "1" }],
    [{ vital_code: "8867-4", vital_value: NaN, unit: "/min" }],
  ];
  bad.forEach((rows) => {
    let res;
    assert.doesNotThrow(() => { res = Engine.runTests(rows); });
    assert.strictEqual(typeof res.hasErrors, "boolean");
    assert.ok(Array.isArray(res.results) && Array.isArray(res.rowFailures));
  });
  assert.doesNotThrow(() => Engine.runTests(clone(GOLDEN), "nope", "nope"));
  assert.strictEqual(Engine.runTests([{}]).hasErrors, true);
});

test("rowFailures lists every failed test per row", () => {
  const rows = clone(GOLDEN); rows[2].patient_id = null; rows[2].vital_value = 130;
  const res = Engine.runTests(rows);
  const f = res.rowFailures.find((x) => x.rowIndex === 2).tests;
  assert.ok(f.includes("not_null") && f.includes("range"));
});
