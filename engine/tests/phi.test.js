const test = require("node:test");
const assert = require("node:assert");
const Engine = require("../engine.js");

const NAMES = ["patient_id", "patient_name", "patient_zip5", "birth_date", "encounter_epoch"];
const golden = () => ({ ...Engine.getContract().goldenRows[2] });

test("phiFields: a golden row lists all five sensitive fields in contract order", () => {
  assert.deepStrictEqual(Engine.phiFields(golden()), NAMES);
});

test("phiFields: the five names are exactly the contract's sensitive fields, in contract order", () => {
  const fromContract = Engine.getContract().fields.filter((f) => f.sensitive).map((f) => f.name);
  assert.deepStrictEqual(fromContract, NAMES);
});

test("phiFields: a renamed-column row (camelCase keys, string value) gives the same five contract names", () => {
  const g = golden();
  const renamed = { patientId: g.patient_id, patientName: g.patient_name, patientZip5: g.patient_zip5, birthDate: g.birth_date,
    encounterEpoch: g.encounter_epoch, vitalSequence: g.vital_sequence, vitalCode: g.vital_code, vitalValue: String(g.vital_value), unit: g.unit };
  assert.deepStrictEqual(Engine.phiFields(renamed), NAMES);
});

test("phiFields: null or undefined values do not count", () => {
  const g = golden();
  assert.deepStrictEqual(Engine.phiFields({ ...g, patient_id: null }), NAMES.slice(1));
  assert.deepStrictEqual(Engine.phiFields({ ...g, patient_id: undefined, birth_date: null }), ["patient_name", "patient_zip5", "encounter_epoch"]);
  const missing = { ...g };
  delete missing.patient_zip5;
  assert.deepStrictEqual(Engine.phiFields(missing), ["patient_id", "patient_name", "birth_date", "encounter_epoch"]);
});

test("phiFields: anything that is not a plain object gives an empty list", () => {
  for (const bad of [null, undefined, [], [golden()], "patient_id", 7, true, {}]) assert.deepStrictEqual(Engine.phiFields(bad), []);
});

test("phiFields: unknown keys and non-sensitive fields are ignored", () => {
  assert.deepStrictEqual(Engine.phiFields({ vital_code: "8867-4", vital_value: 88, unit: "/min", cipher_suite: "x", whatever: 1 }), []);
});

test("phiFields: returns a fresh array on every call", () => {
  const a = Engine.phiFields(golden());
  a.push("x");
  assert.deepStrictEqual(Engine.phiFields(golden()), NAMES);
});

// Recorded from the engine-v1.8 run before phiFields existed: phiRowsQuarantined must not move.
const RECORDED = {
  healthy: [0, 0, 0, 0, 0],
  incident: [0, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9],
};
for (const scenario of ["healthy", "incident"]) {
  test("phiRowsQuarantined is unchanged at every scripted " + scenario + " state", () => {
    const floor = Engine.PRELUDE[scenario].length;
    const got = [];
    for (let step = floor; step <= Engine.AUTOPLAY[scenario].length; step++) {
      got.push(Engine.getState(scenario, Engine.actionsForStep(scenario, step)).businessCase.phiRowsQuarantined);
    }
    assert.deepStrictEqual(got, RECORDED[scenario]);
  });
}
