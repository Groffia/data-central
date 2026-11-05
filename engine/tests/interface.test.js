const test = require("node:test");
const assert = require("node:assert");
const Engine = require("../engine.js");

const run3 = [{ type: "runBatch" }, { type: "runBatch" }, { type: "runBatch" }];
const KPI_NAMES = ["Bed Occupancy", "Abnormal Vital Rate", "Avg Length of Stay", "30-Day Readmission Rate"];

test("getState healthy with no actions: gate CLOSED, four named KPIs", () => {
  const s = Engine.getState("healthy", []);
  assert.strictEqual(s.gate, "CLOSED");
  assert.strictEqual(s.held, false);
  assert.deepStrictEqual(s.kpis.map((k) => k.name), KPI_NAMES);
  assert.ok(s.facility.bedsStaffed > 0);
});

test("AUTOPLAY.incident ends CLOSED, alert resolved, 76 production rows", () => {
  const s = Engine.getState("incident", Engine.AUTOPLAY.incident);
  assert.strictEqual(s.gate, "CLOSED");
  assert.strictEqual(s.alerts[0].status, "resolved");
  assert.strictEqual(s.productionRows, 76);
  assert.strictEqual(Engine.AUTOPLAY.healthy.length, 4);
  assert.ok(Engine.AUTOPLAY.healthy.every((a) => a.type === "runBatch"));
  assert.strictEqual(Engine.AUTOPLAY.incident.length, 3 + 5 + 4 + 4);
});

test("incident after third runBatch: held, 9 stopped, 9 PHI rows", () => {
  const s = Engine.getState("incident", run3);
  assert.strictEqual(s.held, true);
  assert.strictEqual(s.gate, "OPEN");
  assert.strictEqual(s.businessCase.rowsStopped, 9);
  assert.strictEqual(s.businessCase.phiRowsQuarantined, 9);
  assert.strictEqual(s.businessCase.distortionBatchId, "batch-3");
  assert.strictEqual(s.businessCase.minutesToDetectWithGate, 15);
  assert.strictEqual(s.businessCase.hoursToDetectWithoutGate, 24);
  assert.strictEqual(s.businessCase.storageSavedPct, Engine.tieringCost().savedPct);
});

test("healthy scenario: nothing stopped, no distortion", () => {
  const s = Engine.getState("healthy", Engine.AUTOPLAY.healthy);
  assert.strictEqual(s.businessCase.rowsStopped, 0);
  assert.strictEqual(s.businessCase.phiRowsQuarantined, 0);
  assert.strictEqual(s.businessCase.distortionBatchId, null);
  assert.strictEqual(s.businessCase.distortionAvoidedPts, 0);
  assert.strictEqual(s.businessCase.minutesToDetectWithGate, null);
});

test("PRELUDE.incident leaves batchesRun 2; one more runBatch makes the 9-row DLQ", () => {
  assert.deepStrictEqual(Engine.PRELUDE.healthy, []);
  const pre = Engine.replay("incident", Engine.PRELUDE.incident);
  assert.strictEqual(pre.batchesRun, 2);
  assert.strictEqual(pre.dlq.length, 0);
  const next = Engine.replay("incident", [...Engine.PRELUDE.incident, { type: "runBatch" }]);
  assert.strictEqual(next.dlq.length, 9);
});

test("naiveAbnormalRate on a hand-built 4-row sample", () => {
  const base = { patient_id: "SGH-P-100001", vital_code: "8480-6", vital_value: 120 };
  const rows = [
    { patientId: "SGH-P-100002", vitalCode: "8867-4", vitalValue: "72" }, // renamed HR: 0 -> abnormal, counted
    { ...base, patient_id: null, vital_code: "8867-4", vital_value: 200 }, // dropped
    { ...base, patient_id: "'; DROP TABLE silver_vital_observation;--", vital_value: 200 }, // dropped
    { ...base, vital_code: "59408-5", vital_value: 130 }, // SpO2 130: not abnormal, counted
  ];
  assert.strictEqual(Engine.naiveAbnormalRate(rows), 50); // 1 abnormal / 2 counted
  assert.strictEqual(Engine.naiveAbnormalRate([]), 0);
  // renamed systolic and temperature: 0 is normal
  assert.strictEqual(Engine.naiveAbnormalRate([
    { patientId: "x", vitalCode: "8480-6" }, { patientId: "x", vitalCode: "8310-5" },
    { patientId: "x", vitalCode: "59408-5" }, { patientId: "x", vitalCode: "8867-4" }]), 50);
});

test("distortionAvoidedPts for the incident batch is the pinned value", () => {
  const bc = Engine.getState("incident", run3).businessCase;
  // Hand calculation, export 3. Batch rows: 20, dropped 2 (null id row 4, injection row 13) -> 18 counted.
  // Abnormal: renamed rows 2, 6, 10 (SpO2 shown as 0 < 92) = 3; rows 15, 19 (temperature 0) normal;
  // row 7 (temperature 38.0 >= 38.0) = 1. Total 4/18 = 22.222%.
  // Valid rows (error-free): 11 counted (1,3,5,7,8,11,12,14,16,18,20), abnormal only row 7 = 1/11 = 9.091%.
  // Avoided distortion = 22.222 - 9.091 = 13.1313 points (= 400/18 - 100/11).
  assert.ok(Math.abs(bc.distortionAvoidedPts - 13.131313131313131) < 1e-9);
});

test("getTimeline events are in nondecreasing iso order", () => {
  const ev = Engine.getTimeline("incident", Engine.AUTOPLAY.incident);
  assert.ok(ev.length > 10);
  for (let i = 1; i < ev.length; i++) assert.ok(ev[i].iso >= ev[i - 1].iso);
});

test("getState is deterministic", () => {
  assert.deepStrictEqual(Engine.getState("incident", run3), Engine.getState("incident", run3));
});

test("parseLinkParams", () => {
  assert.deepStrictEqual(Engine.parseLinkParams("?scenario=incident&step=3"), { scenario: "incident", step: 3 });
  assert.deepStrictEqual(Engine.parseLinkParams("scenario=incident&step=3"), { scenario: "incident", step: 3 });
  const def = { scenario: "healthy", step: 0 };
  assert.deepStrictEqual(Engine.parseLinkParams("?scenario=bogus"), def);
  assert.deepStrictEqual(Engine.parseLinkParams(""), def);
  assert.deepStrictEqual(Engine.parseLinkParams(undefined), def);
  assert.deepStrictEqual(Engine.parseLinkParams(42), def);
  assert.deepStrictEqual(Engine.parseLinkParams("?scenario=incident&step=-1"), { scenario: "incident", step: 0 });
  assert.deepStrictEqual(Engine.parseLinkParams("?step=2.5"), def);
  assert.deepStrictEqual(Engine.parseLinkParams("?step=abc"), def);
});

test("getState rejects unknown scenario with the standard message", () => {
  assert.throws(() => Engine.getState("bogus", []), { message: "scenario must be 'healthy' or 'incident'" });
});

test("faultExports opt is carried through replay", () => {
  const s = Engine.getState("incident", run3, { faultExports: [2] });
  assert.deepStrictEqual(s.faultExports, [2]);
  assert.strictEqual(s.businessCase.distortionBatchId, "batch-2");
  assert.strictEqual(Engine.replay("incident", []).faultExports, undefined);
});
