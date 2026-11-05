const test = require("node:test");
const assert = require("node:assert");
const Engine = require("../engine.js");

const GOLDEN = [
  {"patient_id":"TMH-P-004821","patient_name":"Avery Lindqvist","patient_zip5":"55102","birth_date":"1958-03-14","encounter_epoch":1793714400,"vital_sequence":1,"vital_code":"8867-4","vital_value":88,"unit":"/min","cipher_suite":"TLS_AES_256_GCM_SHA384"},
  {"patient_id":"TMH-P-009317","patient_name":"Marcus Oyelaran","patient_zip5":"55455","birth_date":"1991-07-22","encounter_epoch":1793714700,"vital_sequence":1,"vital_code":"8480-6","vital_value":146,"unit":"mm[Hg]","cipher_suite":"TLS_AES_256_GCM_SHA384"},
  {"patient_id":"TMH-P-001156","patient_name":"Eleanor Brandvold","patient_zip5":"69201","birth_date":"1934-01-09","encounter_epoch":1793715000,"vital_sequence":1,"vital_code":"59408-5","vital_value":91,"unit":"%","cipher_suite":"TLS_CHACHA20_POLY1305_SHA256"},
  {"patient_id":"TMH-P-012004","patient_name":"Diego Ramirez-Holt","patient_zip5":"10001","birth_date":"2004-11-30","encounter_epoch":1793715300,"vital_sequence":1,"vital_code":"8310-5","vital_value":38.4,"unit":"Cel","cipher_suite":"TLS_AES_256_GCM_SHA384"},
  {"patient_id":"TMH-P-007730","patient_name":"Priya Natarajan","patient_zip5":"60614","birth_date":"1976-05-02","encounter_epoch":1793715600,"vital_sequence":1,"vital_code":"8867-4","vital_value":72,"unit":"/min","cipher_suite":"TLS_CHACHA20_POLY1305_SHA256"},
];

test("contract fields, order and sensitivity", () => {
  const c = Engine.getContract();
  assert.deepStrictEqual(c.fields.map((f) => f.name), [
    "patient_id", "patient_name", "patient_zip5", "birth_date", "encounter_epoch",
    "vital_sequence", "vital_code", "vital_value", "unit", "cipher_suite",
  ]);
  assert.deepStrictEqual(
    c.fields.filter((f) => f.sensitive).map((f) => f.name),
    ["patient_id", "patient_name", "patient_zip5", "birth_date", "encounter_epoch"]
  );
  assert.deepStrictEqual(c.primaryKey, ["patient_id", "vital_sequence"]);
  assert.strictEqual(c.entityField, "patient_id");
  assert.strictEqual(c.epochField, "encounter_epoch");
  assert.strictEqual(c.driftField, "vital_value");
  assert.strictEqual(c.facility.beds_staffed, 400);
  assert.strictEqual(Engine.PATIENT_POOL_SIZE, 40);
});

test("golden rows match the spec", () => {
  assert.deepStrictEqual(Engine.getContract().goldenRows, GOLDEN);
});

test("names match the spec", () => {
  const n = Engine.getContract().names;
  assert.strictEqual(n.bronze, "bronze_tamsworth_vitals");
  assert.strictEqual(n.silver, "silver_vital_observation");
  assert.deepStrictEqual(n.gold, ["fct_vital_observation", "dim_patient", "dim_vital_code", "fct_census_daily"]);
  assert.deepStrictEqual(n.kpis, ["Bed Occupancy", "Abnormal Vital Rate", "Avg Length of Stay", "30-Day Readmission Rate"]);
});

test("isAbnormal on golden rows", () => {
  assert.deepStrictEqual(GOLDEN.map(Engine.isAbnormal), [false, true, true, true, false]);
});

test("isAbnormal thresholds at the edges", () => {
  const hr = (v) => ({ vital_code: "8867-4", vital_value: v });
  assert.strictEqual(Engine.isAbnormal(hr(100)), false);
  assert.strictEqual(Engine.isAbnormal(hr(101)), true);
  assert.strictEqual(Engine.isAbnormal(hr(50)), false);
  assert.strictEqual(Engine.isAbnormal(hr(49)), true);
  assert.strictEqual(Engine.isAbnormal({ vital_code: "8480-6", vital_value: 140 }), false);
  assert.strictEqual(Engine.isAbnormal({ vital_code: "59408-5", vital_value: 92 }), false);
  assert.strictEqual(Engine.isAbnormal({ vital_code: "8310-5", vital_value: 38.0 }), true);
  assert.strictEqual(Engine.isAbnormal({ vital_code: "8310-5", vital_value: 37.9 }), false);
});

test("getContract returns an independent deep copy", () => {
  const a = Engine.getContract();
  a.fields[0].name = "x";
  a.goldenRows[0].patient_id = "x";
  a.names.gold.push("x");
  a.facility.beds_staffed = 1;
  const b = Engine.getContract();
  assert.strictEqual(b.fields[0].name, "patient_id");
  assert.strictEqual(b.goldenRows[0].patient_id, "TMH-P-004821");
  assert.strictEqual(b.names.gold.length, 4);
  assert.strictEqual(b.facility.beds_staffed, 400);
});
