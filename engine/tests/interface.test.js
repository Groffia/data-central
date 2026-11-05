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
  assert.strictEqual(s.businessCase.storageSavedVsWarmPct, Engine.tieringCost().savedVsWarmPct);
  assert.strictEqual(s.businessCase.storageSavedVsHotPct, Engine.tieringCost().savedVsHotPct);
  assert.strictEqual("storageSavedPct" in s.businessCase, false);
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

test("naiveAbnormalRate on a hand-built sample (strict rules)", () => {
  const base = { patient_id: "SGH-P-100001", vital_code: "8480-6", vital_value: 120 };
  const rows = [
    { patientId: "SGH-P-100002", vitalCode: "8867-4", vitalValue: "72" }, // renamed columns: no patient_id key, dropped
    { ...base, patient_id: null, vital_code: "8867-4", vital_value: 200 }, // null id, dropped
    { ...base, patient_id: "", vital_value: 200 }, // empty id, dropped
    { vital_code: "8480-6", vital_value: 200 }, // no patient_id key, dropped
    { ...base, patient_id: "'; DROP TABLE silver_vital_observation;--", vital_value: 200 }, // pattern mismatch, dropped
    { ...base, vital_code: "59408-5", vital_value: 130 }, // SpO2 130: counted, not abnormal
    { ...base, vital_value: 200 }, // systolic 200 > 140: counted, abnormal
    { ...base, vital_code: "8867-4", vital_value: 120, unit: "mmHg" }, // HR 120 > 100: counted, abnormal (unit ignored)
  ];
  // Hand calculation: 5 rows dropped; 3 counted (SpO2 130, systolic 200, HR 120); 2 abnormal.
  // 2 / 3 * 100 = 66.6667 %.
  assert.ok(Math.abs(Engine.naiveAbnormalRate(rows) - 200 / 3) < 1e-9);
  assert.strictEqual(Engine.naiveAbnormalRate([]), 0);
  // renamed rows lose every key, so nothing is counted: 0
  assert.strictEqual(Engine.naiveAbnormalRate([
    { patientId: "x", vitalCode: "8480-6" }, { patientId: "x", vitalCode: "8310-5" },
    { patientId: "x", vitalCode: "59408-5" }, { patientId: "x", vitalCode: "8867-4" }]), 0);
});

test("distortionAvoidedPts (secondary, can be negative) for the incident batch", () => {
  const bc = Engine.getState("incident", run3).businessCase;
  // Hand calculation, export 3: 20 rows. Naive drops 5 renamed rows (no patient_id key), the null-id row
  // and the injection-id row -> 13 counted. Of those, only row 7 (temperature 38.0 >= 38.0) is abnormal
  // (SpO2 130 is not, the mmHg heart-rate row is not): 1/13 = 7.6923 %.
  // Valid rows (error-free): 11 counted, abnormal only row 7 = 1/11 = 9.0909 %.
  // distortionAvoidedPts = 100/13 - 100/11 = -1.3986 (negative: the naive rate is LOWER).
  assert.ok(Math.abs(bc.distortionAvoidedPts - (100 / 13 - 100 / 11)) < 1e-9);
  assert.ok(Math.abs(bc.distortionAvoidedPts - -1.3986) < 1e-4);
});

test("business case outcome counts for the incident: 7 dropped, 2 reach the dashboard", () => {
  const bc = Engine.getState("incident", run3).businessCase;
  const RENAMED = "renamed columns: patient_id key missing, dropped by join to dim_patient";
  assert.strictEqual(bc.rowsSilentlyDropped, 7);
  const want = {
    "dlq-3-2": RENAMED, "dlq-3-6": RENAMED, "dlq-3-10": RENAMED, "dlq-3-15": RENAMED, "dlq-3-19": RENAMED,
    "dlq-3-4": "null patient_id: dropped by join to dim_patient",
    "dlq-3-13": "patient_id matches no dim_patient row",
  };
  // listed in DLQ order
  assert.deepStrictEqual(bc.silentlyDroppedRows.map((r) => r.dlqId), ["dlq-3-2", "dlq-3-4", "dlq-3-6", "dlq-3-10", "dlq-3-13", "dlq-3-15", "dlq-3-19"]);
  bc.silentlyDroppedRows.forEach((r) => assert.strictEqual(r.reason, want[r.dlqId]));
  assert.strictEqual(bc.invalidRowsReachingDashboard, 2);
  assert.deepStrictEqual(bc.invalidRowsListing.map((r) => r.dlqId).sort(), ["dlq-3-17", "dlq-3-9"]);
  const s = Engine.getState("incident", run3);
  s.dlq.filter((d) => ["dlq-3-9", "dlq-3-17"].includes(d.dlqId)).forEach((d) => {
    const r = bc.invalidRowsListing.find((x) => x.dlqId === d.dlqId);
    assert.deepStrictEqual(r, {
      dlqId: d.dlqId, patient_id: d.payload.patient_id, vital_code: d.payload.vital_code,
      vital_value: d.payload.vital_value, unit: d.payload.unit, failedTests: d.failedTests,
    });
  });
  const spo2 = bc.invalidRowsListing.find((r) => r.vital_code === "59408-5");
  assert.strictEqual(spo2.vital_value, 130);
  const hr = bc.invalidRowsListing.find((r) => r.vital_code === "8867-4");
  assert.strictEqual(hr.unit, "mmHg");
  assert.strictEqual(bc.rowsSilentlyDropped + bc.invalidRowsReachingDashboard, bc.rowsStopped);
  assert.strictEqual(bc.rowsStopped, 9);
});

test("business case outcome counts for healthy are zero", () => {
  const bc = Engine.getState("healthy", Engine.AUTOPLAY.healthy).businessCase;
  assert.strictEqual(bc.rowsSilentlyDropped, 0);
  assert.strictEqual(bc.invalidRowsReachingDashboard, 0);
  assert.deepStrictEqual(bc.silentlyDroppedRows, []);
  assert.deepStrictEqual(bc.invalidRowsListing, []);
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
