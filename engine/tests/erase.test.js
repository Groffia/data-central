const test = require("node:test");
const assert = require("node:assert");
const Engine = require("../engine.js");

const BLOCK = "Erasure blocked: legal hold is on.";
const CHECK_IDS = ["subject-rows-gone", "published-count", "others-unchanged", "keys-unique", "kpis-unchanged"];
const CHECK_LABELS = [
  "No row of the subject remains in staging, Silver, the dead-letter queue or dim_patient",
  "The published row count fell by exactly the subject's Silver rows",
  "Every other subject's rows are unchanged",
  "Production keys are still unique",
  "The seven-day KPI values are unchanged",
];
const pool = () => Engine.buildPatientPool().map((p) => p.patient_id);
const acts = (sc, step) => Engine.actionsForStep(sc, step);
const fp = (sc, a, id) => Engine.subjectFootprint(sc, a, id);
const sum = (f) => f.staging + f.silver + f.deadLetter + f.dimPatient;
const deepFreeze = (o) => { if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };
const subjectOf = (p) => (p && typeof p === "object" ? (typeof p.patient_id === "string" ? p.patient_id : typeof p.patientId === "string" ? p.patientId : null) : null);
const count = (rows, id) => rows.filter((r) => subjectOf(r) === id).length;

// A subject that has rows in Silver and in the dead-letter queue at incident step 3.
function busySubject() {
  const a = acts("incident", 3);
  return pool().find((id) => { const f = fp("incident", a, id); return f.silver > 0 && f.deadLetter > 0 && f.bronze > 0; });
}

test("a busy subject exists at incident step 3 (the tests below rely on it)", () => {
  assert.ok(busySubject());
});

test("erasing one subject at incident step 3 removes their rows from staging, Silver, the dead-letter queue and dim_patient only", () => {
  const a = acts("incident", 3);
  const id = busySubject();
  const before = Engine.getState("incident", a);
  const f = fp("incident", a, id);
  const r = Engine.eraseSubjects("incident", a, [id]);
  assert.strictEqual(r.blocked, false);
  assert.strictEqual(r.reason, null);
  assert.deepStrictEqual(r.erased, [id]);
  assert.deepStrictEqual(r.ignored, []);
  assert.deepStrictEqual(r.footprints, [{ ...f, after: { staging: 0, silver: 0, deadLetter: 0, dimPatient: 0 } }]);
  const s = r.state;
  assert.deepStrictEqual(s.erasedSubjects, [id]);
  assert.strictEqual(count(s.staging, id), 0);
  assert.strictEqual(count(s.productionData, id), 0);
  assert.strictEqual(count(s.dlq.map((d) => d.payload), id), 0);
  assert.strictEqual(s.productionData.length, before.productionData.length - f.silver);
  assert.strictEqual(s.staging.length, before.staging.length - f.staging);
  assert.strictEqual(s.dlq.length, before.dlq.length - f.deadLetter);
  assert.deepStrictEqual(fp("incident", a, id), f, "the engine's replay of the same actions is untouched");
});

test("counters equal a recount of what remains; Bronze is never edited", () => {
  const a = acts("incident", 3);
  const id = busySubject();
  const before = Engine.getState("incident", a);
  const f = fp("incident", a, id);
  const s = Engine.eraseSubjects("incident", a, [id]).state;
  assert.strictEqual(s.productionRows, s.productionData.length);
  assert.strictEqual(s.productionKeys.length, s.productionRows);
  assert.strictEqual(new Set(s.productionKeys).size, s.productionKeys.length);
  const obs = s.productionData.length;
  const abn = s.productionData.filter((r) => Engine.isAbnormal(r)).length;
  assert.strictEqual(s.publishedObservations, obs);
  assert.strictEqual(s.publishedAbnormal, abn);
  assert.strictEqual(s.publishedNotEvaluable, s.productionData.filter((r) => !Engine.isEvaluable(r)).length);
  assert.strictEqual(s.todaySoFar.observations, s.publishedObservations);
  assert.strictEqual(s.todaySoFar.abnormalCount, s.publishedAbnormal);
  assert.strictEqual(s.bronzeRows, before.bronzeRows);
  assert.strictEqual(s.unreadableRawRows, f.bronze);
  assert.ok(s.unreadableRawRows > 0);
  assert.strictEqual(s.businessCase.rowsStopped, s.dlq.length);
});

test("every other subject's footprint in the erased state equals what it was", () => {
  const a = acts("incident", 3);
  const id = busySubject();
  const before = Engine.getState("incident", a);
  const s = Engine.eraseSubjects("incident", a, [id]).state;
  for (const other of pool().filter((x) => x !== id)) {
    for (const [k, rows] of [["productionData", (st) => st.productionData], ["staging", (st) => st.staging], ["dlq", (st) => st.dlq.map((d) => d.payload)]]) {
      assert.strictEqual(count(rows(s), other), count(rows(before), other), other + " " + k);
    }
  }
  assert.strictEqual(s.productionData.filter((r) => subjectOf(r) === null).length, before.productionData.filter((r) => subjectOf(r) === null).length);
});

test("the KPI history is untouched", () => {
  const a = acts("incident", 3);
  const before = Engine.getState("incident", a);
  const r = Engine.eraseSubjects("incident", a, [busySubject()]);
  assert.deepStrictEqual(r.state.kpis, before.kpis);
  assert.deepStrictEqual(Engine.computeKpis(Engine.getHistory()).map((k) => k.value), r.state.kpis.map((k) => k.value));
});

test("checks: the five ids and labels, all passing after a correct erasure", () => {
  const a = acts("incident", 3);
  const r = Engine.eraseSubjects("incident", a, [busySubject()]);
  assert.deepStrictEqual(r.checks.map((c) => c.id), CHECK_IDS);
  assert.deepStrictEqual(r.checks.map((c) => c.label), CHECK_LABELS);
  r.checks.forEach((c) => assert.strictEqual(c.pass, true, c.id));
  assert.deepStrictEqual(Object.keys(r.checks[0]), ["id", "label", "pass"]);
});

test("the live sample falls by exactly the subject's Silver rows and abnormal readings", () => {
  const a = acts("incident", 3);
  const id = busySubject();
  const before = Engine.getState("incident", a);
  const rows = before.productionData.filter((r) => subjectOf(r) === id);
  const s = Engine.eraseSubjects("incident", a, [id]).state;
  assert.strictEqual(before.todaySoFar.observations - s.todaySoFar.observations, rows.length);
  assert.strictEqual(before.todaySoFar.abnormalCount - s.todaySoFar.abnormalCount, rows.filter((r) => Engine.isAbnormal(r)).length);
  const c0 = Engine.liveSampleCheck(before), c1 = Engine.liveSampleCheck(s);
  assert.strictEqual(c0.published - c1.published, rows.length);
});

test("erasing two subjects equals erasing them one after the other", () => {
  const a = acts("incident", 3);
  const [x, y] = [pool()[0], pool()[2]];
  const both = Engine.eraseSubjects("incident", a, [x, y]);
  assert.deepStrictEqual(both.erased, [x, y]);
  const one = Engine.eraseSubjects("incident", a, [x]).state;
  assert.strictEqual(both.state.productionRows, one.productionRows - Engine.subjectFootprint("incident", a, y).silver);
  const swapped = Engine.eraseSubjects("incident", a, [y, x]);
  assert.deepStrictEqual(swapped.state.productionData, both.state.productionData);
  assert.deepStrictEqual(swapped.state.dlq, both.state.dlq);
  assert.deepStrictEqual(swapped.state.staging, both.state.staging);
});

test("a repeated id and an id outside the cohort land in ignored and change nothing", () => {
  const a = acts("incident", 3);
  const id = pool()[1];
  const r = Engine.eraseSubjects("incident", a, [id, id, "TMH-P-999999", "nobody"]);
  assert.deepStrictEqual(r.erased, [id]);
  assert.deepStrictEqual(r.ignored.map((x) => x.id), [id, "TMH-P-999999", "nobody"]);
  r.ignored.forEach((x) => assert.ok(typeof x.reason === "string" && x.reason.length > 0));
  assert.deepStrictEqual(r.state, Engine.eraseSubjects("incident", a, [id]).state);
  const none = Engine.eraseSubjects("incident", a, ["TMH-P-999999"]);
  assert.deepStrictEqual(none.state, Engine.getState("incident", a));
  assert.deepStrictEqual(none.erased, []);
  assert.deepStrictEqual(none.checks, []);
  assert.strictEqual(none.blocked, false);
});

test("legal hold returns the unchanged state, blocked, with the verbatim reason", () => {
  const a = acts("incident", 3);
  const r = Engine.eraseSubjects("incident", a, [busySubject()], { legalHold: true });
  assert.strictEqual(r.blocked, true);
  assert.strictEqual(r.reason, BLOCK);
  assert.deepStrictEqual(r.state, Engine.getState("incident", a));
  assert.deepStrictEqual([r.erased, r.ignored, r.footprints, r.checks], [[], [], [], []]);
  assert.strictEqual(Engine.eraseSubjects("incident", a, [busySubject()], { legalHold: false }).blocked, false);
  assert.strictEqual(Engine.eraseSubjects("incident", a, [busySubject()], {}).blocked, false);
});

test("the same list applied at every step of both scenarios never throws and keeps every check passing", () => {
  for (const sc of ["healthy", "incident"]) {
    const floor = Engine.PRELUDE[sc].length;
    for (let step = floor; step <= Engine.AUTOPLAY[sc].length; step++) {
      const a = acts(sc, step);
      const r = Engine.eraseSubjects(sc, a, [pool()[0], pool()[2], pool()[4], pool()[7]]);
      assert.deepStrictEqual(r.erased.length, 4);
      r.checks.forEach((c) => assert.strictEqual(c.pass, true, sc + " step " + step + " " + c.id));
      r.erased.forEach((id) => {
        assert.strictEqual(count(r.state.productionData, id) + count(r.state.staging, id) + count(r.state.dlq.map((d) => d.payload), id), 0, sc + step + id);
      });
    }
  }
});

test("a diverged a= state works the same, including a later export that contains the subject again", () => {
  const diverged = Engine.decodeActions("r.r.p:dlq-3-2.r");
  assert.ok(diverged);
  const long = Array.from({ length: 12 }, () => ({ type: "runBatch" }));
  for (const [sc, a] of [["incident", diverged], ["healthy", long]]) {
    const id = pool().find((x) => fp(sc, a, x).silver >= 2) || pool()[0];
    const r = Engine.eraseSubjects(sc, a, [id]);
    r.checks.forEach((c) => assert.strictEqual(c.pass, true, sc + " " + c.id));
    assert.strictEqual(count(r.state.productionData, id), 0);
    assert.ok(fp(sc, a, id).silver >= 1, "the subject does appear in more than one export, and is absent after erasure");
  }
});

test("accessLog ERASE entries carry the rows eraseSubjects removed", () => {
  const a = acts("incident", 3);
  for (const id of pool()) {
    const f = fp("incident", a, id);
    const entry = Engine.accessLog("incident", a, [id]).pop();
    assert.strictEqual(entry.rows, sum(f), id);
    const r = Engine.eraseSubjects("incident", a, [id]);
    const before = Engine.getState("incident", a);
    const removed = (before.staging.length - r.state.staging.length) + (before.productionData.length - r.state.productionData.length) + (before.dlq.length - r.state.dlq.length) + f.dimPatient;
    assert.strictEqual(entry.rows, removed, id);
  }
});

test("inputs are deep-frozen and not mutated", () => {
  const a = deepFreeze(acts("incident", 3));
  const ids = deepFreeze([busySubject()]);
  const opts = deepFreeze({ legalHold: false });
  assert.doesNotThrow(() => Engine.eraseSubjects("incident", a, ids, opts));
  const x = Engine.eraseSubjects("incident", a, ids, opts);
  const y = Engine.eraseSubjects("incident", a, ids, opts);
  assert.deepStrictEqual(x, y);
});

test("bad arguments return null; an unknown scenario throws", () => {
  assert.strictEqual(Engine.eraseSubjects("healthy", null, []), null);
  assert.strictEqual(Engine.eraseSubjects("healthy", [], "x"), null);
  assert.strictEqual(Engine.eraseSubjects("healthy", [], [1]), null);
  assert.strictEqual(Engine.eraseSubjects("healthy", [], [null]), null);
  assert.strictEqual(Engine.eraseSubjects("healthy", [], undefined), null);
  assert.throws(() => Engine.eraseSubjects("nope", [], []));
});
