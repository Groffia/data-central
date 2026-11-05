const test = require("node:test");
const assert = require("node:assert");
const Engine = require("../engine.js");

const errPositions = (rows) => {
  const res = Engine.runTests(rows);
  const errTests = new Set(res.results.filter((r) => r.severity === "error").map((r) => r.test));
  return res.rowFailures.filter((f) => f.tests.some((t) => errTests.has(t))).map((f) => f.rowIndex + 1);
};
const exp3 = () => Engine.generateExport(3, "incident").rows;

test("incident exports 1, 2, 4 equal healthy", () => {
  [1, 2, 4].forEach((n) => assert.deepStrictEqual(Engine.generateExport(n, "incident"), Engine.generateExport(n, "healthy")));
});

test("export 3 has 20 rows and exactly nine error-failing rows", () => {
  const rows = exp3();
  assert.strictEqual(rows.length, 20);
  assert.deepStrictEqual(errPositions(rows), [2, 4, 6, 9, 10, 13, 15, 17, 19]);
});

test("four hard-failure values appear in order", () => {
  const rows = exp3();
  const [a, b, c, d] = Engine.HARD_FAIL_ROWS.map((p) => rows[p - 1]);
  assert.strictEqual(a.patient_id, null);
  assert.strictEqual(b.vital_code, "59408-5");
  assert.strictEqual(b.unit, "%");
  assert.strictEqual(b.vital_value, 130);
  assert.strictEqual(c.patient_id, "'; DROP TABLE silver_vital_observation;--");
  assert.strictEqual(d.vital_code, "8867-4");
  assert.strictEqual(d.unit, "mmHg");
  assert.ok(d.vital_value >= 55 && d.vital_value <= 125);
});

test("position constants", () => {
  assert.deepStrictEqual(Engine.REPAIRABLE_ROWS, [2, 6, 10, 15, 19]);
  assert.deepStrictEqual(Engine.HARD_FAIL_ROWS, [4, 9, 13, 17]);
});

test("drift rows are camelCase with string vital_value; repairRow fixes them", () => {
  const rows = exp3();
  const healthy = Engine.generateExport(3, "healthy").rows;
  const res = Engine.runTests(rows);
  const nuc = res.results.find((r) => r.test === "no_unexpected_columns").failingRows.map((i) => i + 1);
  assert.deepStrictEqual(nuc, Engine.REPAIRABLE_ROWS);
  Engine.REPAIRABLE_ROWS.forEach((p) => {
    const row = rows[p - 1];
    assert.ok("patientId" in row && "vitalValue" in row && "cipherSuite" in row);
    assert.ok(!("patient_id" in row));
    assert.strictEqual(typeof row.vitalValue, "string");
    const fixed = Engine.repairRow(row);
    assert.deepStrictEqual(fixed, healthy[p - 1]);
    assert.strictEqual(Engine.runTests([fixed]).hasErrors, false);
  });
});

test("repairRow leaves non-drift rows unchanged", () => {
  const rows = exp3();
  assert.deepStrictEqual(Engine.repairRow(rows[0]), rows[0]);
  assert.deepStrictEqual(Engine.repairRow(rows[3]), rows[3]);
});

test("healthy export 3 is clean", () => {
  assert.strictEqual(Engine.runTests(Engine.generateExport(3, "healthy").rows).hasErrors, false);
});

test("unknown scenario throws exact message", () => {
  const msg = "scenario must be 'healthy' or 'incident'";
  assert.throws(() => Engine.generateExport(3, "bogus"), { message: msg });
  assert.throws(() => Engine.assertScenario("bogus"), { message: msg });
  assert.doesNotThrow(() => Engine.assertScenario("healthy"));
});

test("faultExports forces the fault pattern", () => {
  const forced = Engine.generateExport(4, "healthy", { faultExports: [4] }).rows;
  assert.deepStrictEqual(errPositions(forced), [2, 4, 6, 9, 10, 13, 15, 17, 19]);
  assert.deepStrictEqual(Engine.generateExport(3, "incident", { faultExports: [] }), Engine.generateExport(3, "healthy"));
});
