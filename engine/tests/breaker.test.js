const test = require("node:test");
const assert = require("node:assert");
const Engine = require("../engine.js");

const RUN = { type: "runBatch" };
const clone = (x) => JSON.parse(JSON.stringify(x));
const deepFreeze = (o) => {
  if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); }
  return o;
};
const drift = (s) => s.dlq.filter((d) => d.repairable).map((d) => d.dlqId);
const hard = (s) => s.dlq.filter((d) => !d.repairable).map((d) => d.dlqId);
const incidentOpen = () => Engine.replay("incident", [RUN, RUN, RUN]);
const resolvedAll = (s) =>
  drift(s).map((dlqId) => ({ type: "repairRow", dlqId }))
    .concat(hard(s).map((dlqId) => ({ type: "discardRow", dlqId, reason: "unrepairable" })));
const lastEvent = (s) => s.events[s.events.length - 1];

test("empty replay returns the starting state", () => {
  const s = Engine.replay("healthy", []);
  assert.deepStrictEqual(s, Engine.initialState("healthy"));
  assert.strictEqual(s.gate, "CLOSED");
  assert.strictEqual(s.clock.epoch, Engine.BASE_EPOCH);
  assert.strictEqual(s.clock.iso, "2026-11-03T14:00:00Z");
  assert.deepStrictEqual(s.events, []);
});

test("unknown scenario throws the standard message", () => {
  assert.throws(() => Engine.initialState("bogus"), /scenario must be 'healthy' or 'incident'/);
  assert.throws(() => Engine.replay("bogus", []), /scenario must be 'healthy' or 'incident'/);
});

test("four healthy batches publish 80 rows", () => {
  const s = Engine.replay("healthy", [RUN, RUN, RUN, RUN]);
  assert.strictEqual(s.productionRows, 80);
  assert.strictEqual(s.bronzeRows, 80);
  assert.strictEqual(s.gate, "CLOSED");
  assert.strictEqual(s.batchesRun, 4);
  assert.strictEqual(s.lastGoodBatchId, "batch-4");
  assert.strictEqual(s.dlq.length, 0);
  assert.strictEqual(s.alerts.length, 0);
});

test("incident: three batches open the gate with 9 DLQ entries and one alert", () => {
  const s = incidentOpen();
  assert.strictEqual(s.gate, "OPEN");
  assert.strictEqual(s.dlq.length, 9);
  assert.strictEqual(s.productionRows, 40);
  assert.strictEqual(s.bronzeRows, 60);
  assert.strictEqual(s.staging.length, 11);
  assert.strictEqual(s.alerts.length, 1);
  assert.strictEqual(s.alerts[0].count, 1);
  assert.strictEqual(s.alerts[0].status, "open");
  assert.strictEqual(s.alerts[0].severity, "SEV-2");
  assert.strictEqual(s.alerts[0].dedupeKey, "dq-stargate-silver_vital_observation");
  assert.strictEqual(s.alerts[0].title, "DQ gate opened: 9 error-severity failures in batch batch-3");
  assert.strictEqual(s.lastGoodBatchId, "batch-2");
  assert.deepStrictEqual(s.dlq.map((d) => d.dlqId), [2, 4, 6, 9, 10, 13, 15, 17, 19].map((p) => "dlq-3-" + p));
  assert.deepStrictEqual(drift(s).map((id) => +id.split("-")[2]), Engine.REPAIRABLE_ROWS);
  assert.deepStrictEqual(hard(s).map((id) => +id.split("-")[2]), Engine.HARD_FAIL_ROWS);
  s.dlq.forEach((d) => {
    assert.strictEqual(d.batchId, "batch-3");
    assert.strictEqual(d.status, "open");
    assert.ok(d.failedTests.length > 0 && d.reason && "column" in d && "observedValue" in d && d.payload);
  });
  assert.strictEqual(s.clock.epoch, Engine.exportRunEpoch(3));
});

test("full scripted incident ends CLOSED with 76 production rows", () => {
  const open = incidentOpen();
  const actions = [RUN, RUN, RUN, ...resolvedAll(open), { type: "ackAlert" }, { type: "resolveRetry" }, RUN, { type: "resolveAlert" }];
  const s = Engine.replay("incident", actions);
  assert.strictEqual(s.gate, "CLOSED");
  assert.strictEqual(s.productionRows, 40 + 11 + 5 + 20);
  assert.strictEqual(s.productionRows, 76);
  assert.strictEqual(s.bronzeRows, 80);
  assert.strictEqual(s.staging.length, 0);
  assert.strictEqual(s.batchesRun, 4);
  assert.strictEqual(s.lastGoodBatchId, "batch-4");
  assert.strictEqual(s.alerts.length, 1);
  assert.strictEqual(s.alerts[0].status, "resolved");
  assert.strictEqual(s.dlq.filter((d) => d.status === "repaired").length, 5);
  assert.strictEqual(s.dlq.filter((d) => d.status === "discarded").length, 4);
  assert.strictEqual(s.productionKeys.length, 76);
  ["ROW_REPAIRED", "ROW_DISCARDED", "GATE_HALF_OPEN", "GATE_CLOSED", "ALERT_ACKNOWLEDGED", "ALERT_RESOLVED", "BATCH_PUBLISHED"].forEach((t) =>
    assert.ok(s.events.some((e) => e.type === t), t));
  assert.ok(s.events.some((e) => e.type === "ROW_DISCARDED" && /unrepairable/.test(e.detail)));
});

test("failing trial after resolveRetry returns the gate to OPEN and increments the alert", () => {
  const open = incidentOpen();
  const actions = [RUN, RUN, RUN, ...resolvedAll(open), { type: "resolveRetry" }, RUN];
  const s = Engine.replay("incident", actions, { faultExports: [3, 4] });
  assert.strictEqual(s.gate, "OPEN");
  assert.strictEqual(s.batchesRun, 4);
  assert.strictEqual(s.dlq.length, 18);
  assert.strictEqual(s.dlq.filter((d) => d.status === "open").length, 9);
  assert.strictEqual(s.alerts.length, 1);
  assert.strictEqual(s.alerts[0].count, 2);
  assert.strictEqual(s.productionRows, 40);
  assert.strictEqual(s.bronzeRows, 80);
  assert.strictEqual(s.staging.length, 5 + 11 + 11);
});

test("repeat failure with the same dedupe key increments count, no second alert", () => {
  const open = incidentOpen();
  const actions = [RUN, RUN, RUN, ...resolvedAll(open), { type: "ackAlert" }, { type: "resolveRetry" }, RUN];
  const s = Engine.replay("incident", actions, { faultExports: [3, 4] });
  assert.strictEqual(s.alerts.length, 1);
  assert.strictEqual(s.alerts[0].count, 2);
  assert.strictEqual(s.alerts[0].status, "acknowledged");
  assert.ok(s.events.some((e) => e.type === "ALERT_INCREMENTED"));
});

test("a failure after the alert was resolved creates a new alert", () => {
  const open = incidentOpen();
  const actions = [RUN, RUN, RUN, ...resolvedAll(open), { type: "resolveAlert" }, { type: "resolveRetry" }, RUN];
  const s = Engine.replay("incident", actions, { faultExports: [3, 4] });
  assert.strictEqual(s.alerts.length, 2);
  assert.strictEqual(s.alerts[0].status, "resolved");
  assert.strictEqual(s.alerts[1].count, 1);
});

test("runBatch rejected while OPEN leaves batchesRun unchanged; trial is export 4", () => {
  const open = incidentOpen();
  const rej = Engine.reduce(open, RUN);
  assert.strictEqual(rej.batchesRun, 3);
  assert.strictEqual(rej.bronzeRows, 60);
  assert.strictEqual(lastEvent(rej).type, "ACTION_REJECTED");
  const s = Engine.replay("incident", [RUN, RUN, RUN, RUN, RUN, ...resolvedAll(open), { type: "resolveRetry" }, RUN]);
  assert.strictEqual(s.batchesRun, 4);
  assert.strictEqual(s.gate, "CLOSED");
  assert.strictEqual(s.clock.epoch, Engine.exportRunEpoch(4));
  assert.ok(s.events.some((e) => e.type === "BATCH_RUN" && /batch-4/.test(e.detail)));
  assert.ok(!s.events.some((e) => /batch-5/.test(e.detail)));
});

test("invalid actions leave state deep-equal plus exactly one rejection event", () => {
  const open = incidentOpen();
  const closed = Engine.initialState("incident");
  const cases = [
    [open, RUN],
    [open, { type: "repairRow", dlqId: "dlq-9-9" }],
    [open, { type: "repairRow", dlqId: open.dlq.find((d) => !d.repairable).dlqId }],
    [open, { type: "discardRow", dlqId: "nope", reason: "x" }],
    [open, { type: "discardRow", dlqId: open.dlq[0].dlqId, reason: "" }],
    [open, { type: "discardRow", dlqId: open.dlq[0].dlqId }],
    [open, { type: "resolveRetry" }],
    [closed, { type: "resolveRetry" }],
    [closed, { type: "ackAlert" }],
    [closed, { type: "resolveAlert" }],
    [open, { type: "bogus" }],
    [open, null],
    [open, {}],
  ];
  cases.forEach(([state, action]) => {
    const before = clone(state);
    const next = Engine.reduce(state, action);
    assert.deepStrictEqual(state, before);
    assert.strictEqual(next.events.length, before.events.length + 1, JSON.stringify(action));
    const ev = lastEvent(next);
    assert.strictEqual(ev.type, "ACTION_REJECTED");
    assert.ok(ev.detail);
    assert.strictEqual(ev.iso, state.clock.iso);
    assert.deepStrictEqual({ ...next, events: next.events.slice(0, -1) }, before);
  });
});

test("blocked resolveRetry reports unresolved rows; gate-not-open reason", () => {
  const open = incidentOpen();
  const partial = Engine.replay("incident", [RUN, RUN, RUN, ...resolvedAll(open).slice(0, 6)]);
  assert.strictEqual(partial.dlq.filter((d) => d.status === "open").length, 3);
  const blocked = Engine.reduce(partial, { type: "resolveRetry" });
  assert.strictEqual(lastEvent(blocked).type, "ACTION_REJECTED");
  assert.ok(lastEvent(blocked).detail.includes("3 DLQ rows unresolved"));
  assert.strictEqual(blocked.gate, "OPEN");
  const notOpen = Engine.reduce(Engine.initialState("healthy"), { type: "resolveRetry" });
  assert.ok(lastEvent(notOpen).detail.includes("gate is not OPEN"));
});

test("repeated repair, discard, ack and resolve are no-ops", () => {
  const open = incidentOpen();
  const rid = drift(open)[0], did = hard(open)[0];
  let s = Engine.reduce(open, { type: "repairRow", dlqId: rid });
  assert.strictEqual(s.dlq.find((d) => d.dlqId === rid).status, "repaired");
  assert.strictEqual(s.staging.length, 12);
  assert.strictEqual(lastEvent(s).type, "ROW_REPAIRED");
  const repaired = s.staging[s.staging.length - 1];
  assert.strictEqual(typeof repaired.vital_value, "number");
  assert.ok("patient_id" in repaired);
  assert.deepStrictEqual(Engine.reduce(s, { type: "repairRow", dlqId: rid }), s);
  s = Engine.reduce(s, { type: "discardRow", dlqId: did, reason: "unrepairable" });
  assert.deepStrictEqual(Engine.reduce(s, { type: "discardRow", dlqId: did, reason: "again" }), s);
  s = Engine.reduce(s, { type: "ackAlert" });
  assert.strictEqual(s.alerts[0].status, "acknowledged");
  assert.deepStrictEqual(Engine.reduce(s, { type: "ackAlert" }), s);
  s = Engine.reduce(s, { type: "resolveAlert" });
  assert.strictEqual(s.alerts[0].status, "resolved");
  assert.deepStrictEqual(Engine.reduce(s, { type: "resolveAlert" }), s);
  assert.deepStrictEqual(Engine.reduce(s, { type: "ackAlert" }), s);
});

test("reduce does not mutate its input (deep-frozen state)", () => {
  const open = incidentOpen();
  const actions = [...resolvedAll(open), { type: "ackAlert" }, { type: "resolveRetry" }, RUN, { type: "resolveAlert" }, RUN, { type: "bogus" }];
  let s = deepFreeze(Engine.initialState("incident"));
  [RUN, RUN, RUN, ...actions].forEach((a) => { s = deepFreeze(Engine.reduce(s, a)); });
  assert.strictEqual(s.gate, "CLOSED");
});

test("state is JSON-serializable", () => {
  const s = incidentOpen();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(s)), s);
});

test("incident DLQ primary column and reason per entry", () => {
  const s = incidentOpen();
  const DRIFT = { column: "*", reason: "Unexpected columns (schema drift)" };
  const want = {
    "dlq-3-2": DRIFT, "dlq-3-6": DRIFT, "dlq-3-10": DRIFT, "dlq-3-15": DRIFT, "dlq-3-19": DRIFT,
    "dlq-3-4": { column: "patient_id", reason: "Failed not_null on patient_id" },
    "dlq-3-9": { column: "vital_value", reason: "Failed range on vital_value" },
    "dlq-3-13": { column: "patient_id", reason: "Failed matches_pattern on patient_id" },
    "dlq-3-17": { column: "unit", reason: "Failed accepted_values on unit" },
  };
  assert.deepStrictEqual(s.dlq.map((d) => d.dlqId).sort(), Object.keys(want).sort());
  s.dlq.forEach((d) => {
    assert.strictEqual(d.column, want[d.dlqId].column, d.dlqId);
    assert.strictEqual(d.reason, want[d.dlqId].reason, d.dlqId);
  });
  const d2 = s.dlq.find((d) => d.dlqId === "dlq-3-2");
  assert.ok(d2.failedTests.includes("not_null") && d2.failedTests.includes("no_unexpected_columns"));
  // Drift rows are camelCased: 9 of 10 keys are unexpected, the joined names are long, so the count is recorded.
  assert.strictEqual(d2.observedValue, 9);
});

test("incremental runBatch uses state.faultExports like replay", () => {
  const s = Engine.replay("incident", Engine.PRELUDE.incident);
  const after = Engine.reduce(s, RUN);
  assert.strictEqual(after.gate, "OPEN");
  assert.strictEqual(after.dlq.length, 9);
  const h = Engine.replay("healthy", [], { faultExports: [1] });
  const viaReplay = Engine.replay("healthy", [RUN], { faultExports: [1] });
  const viaReduce = Engine.reduce(h, RUN);
  assert.strictEqual(viaReplay.gate, "OPEN");
  assert.strictEqual(viaReduce.gate, "OPEN");
  assert.deepStrictEqual(viaReduce, viaReplay);
});
