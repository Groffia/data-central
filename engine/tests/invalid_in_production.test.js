const test = require("node:test");
const assert = require("node:assert");
const Engine = require("../engine.js");

test("invalidRowsInProduction is 0 in every scripted state, healthy and incident", () => {
  for (const scenario of ["healthy", "incident"]) {
    const script = Engine.AUTOPLAY[scenario];
    for (let k = 0; k <= script.length; k++) {
      const s = Engine.getState(scenario, script.slice(0, k));
      assert.strictEqual(s.businessCase.invalidRowsInProduction, 0, scenario + " k=" + k);
    }
  }
});

test("production rows are kept in state and match the production count", () => {
  const s = Engine.getState("incident", Engine.AUTOPLAY.incident);
  assert.strictEqual(s.productionData.length, 76);
  assert.strictEqual(s.productionData.length, s.productionRows);
  assert.strictEqual(Engine.getState("healthy", []).productionData.length, 0);
});

test("the field can fail: one invalid row injected into production gives 1, two give 2", () => {
  const raw = Engine.replay("incident", Engine.AUTOPLAY.incident);
  assert.strictEqual(Engine.computeBusinessCase(raw).invalidRowsInProduction, 0);
  const bad = { ...raw.productionData[0], patient_id: null };
  const one = { ...raw, productionData: [...raw.productionData, bad] };
  assert.strictEqual(Engine.computeBusinessCase(one).invalidRowsInProduction, 1);
  assert.strictEqual(Engine.invalidRowsInProduction(one), 1);
  const two = { ...raw, productionData: [...raw.productionData, bad, { ...raw.productionData[2], patient_id: "'; DROP TABLE x;--" }] };
  assert.strictEqual(Engine.invalidRowsInProduction(two), 2);
});

test("abnormal readings fail only a warn test, so they are not counted; missing data is tolerated", () => {
  const raw = Engine.replay("healthy", Engine.AUTOPLAY.healthy);
  assert.ok(raw.productionData.some((r) => Engine.isAbnormal(r)), "production holds abnormal but valid readings");
  assert.strictEqual(Engine.invalidRowsInProduction(raw), 0);
  assert.strictEqual(Engine.invalidRowsInProduction({}), 0);
  assert.strictEqual(Engine.invalidRowsInProduction(null), 0);
  assert.strictEqual(Engine.invalidRowsInProduction({ ...raw, productionData: undefined }), 0);
});
