const test = require("node:test");
const assert = require("node:assert");
const Engine = require("../engine.js");

const INC = Engine.AUTOPLAY.incident;
const HEAL = Engine.AUTOPLAY.healthy;
const RENAMED = "renamed columns: patient_id key missing, dropped by join to dim_patient";

test("incident step 3: naive sample numbers", () => {
  const n = Engine.naiveSample("incident", INC.slice(0, 3));
  assert.equal(n.counted, 53);
  assert.equal(n.dropped, 7);
  assert.equal(n.droppedReasons.length, 7);
  const REN = ["dlq-3-2", "dlq-3-6", "dlq-3-10", "dlq-3-15", "dlq-3-19"];
  assert.deepEqual(n.droppedReasons.map((d) => d.dlqId), ["dlq-3-2", "dlq-3-4", "dlq-3-6", "dlq-3-10", "dlq-3-13", "dlq-3-15", "dlq-3-19"]);
  n.droppedReasons.forEach((d) => {
    const want = REN.includes(d.dlqId) ? RENAMED : d.dlqId === "dlq-3-4" ? "null patient_id: dropped by join to dim_patient" : "patient_id matches no dim_patient row";
    assert.equal(d.reason, want);
  });
  const bc = Engine.getState("incident", INC.slice(0, 3)).businessCase;
  assert.deepEqual(n.droppedReasons, bc.silentlyDroppedRows);
  assert.equal(n.invalidReadings, 2);
  assert.equal(n.invalidReadings, bc.invalidRowsReachingDashboard);
  assert.equal(n.abnormal, 7);
  assert.equal(n.ratePct.toFixed(1), "13.2");
  assert.equal(n.published, 40);
});

test("incident step 2 and healthy any step: nothing dropped or invalid", () => {
  const a = Engine.naiveSample("incident", INC.slice(0, 2));
  assert.equal(a.dropped, 0);
  assert.equal(a.invalidReadings, 0);
  for (let i = 0; i <= HEAL.length; i++) {
    const h = Engine.naiveSample("healthy", HEAL.slice(0, i));
    assert.equal(h.dropped, 0);
    assert.equal(h.invalidReadings, 0);
  }
});

test("does not change state", () => {
  const before = JSON.stringify(Engine.getState("incident", INC.slice(0, 3)));
  Engine.naiveSample("incident", INC.slice(0, 3));
  assert.equal(JSON.stringify(Engine.getState("incident", INC.slice(0, 3))), before);
});

test("invalid scenario throws like getState; bad actions return null", () => {
  let e1, e2;
  try { Engine.getState("nope", []); } catch (e) { e1 = e; }
  try { Engine.naiveSample("nope", []); } catch (e) { e2 = e; }
  assert.ok(e1 && e2);
  assert.equal(e2.message, e1.message);
  assert.equal(Engine.naiveSample("incident", "x"), null);
  assert.equal(Engine.naiveSample("incident", null), null);
  assert.equal(Engine.naiveSample("incident", {}), null);
});
