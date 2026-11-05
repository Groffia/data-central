const test = require("node:test");
const assert = require("node:assert");
const Engine = require("../engine.js");

const pool = () => Engine.buildPatientPool().map((p) => p.patient_id);
const ids = new Set(pool());
const fp = (sc, step, id) => Engine.subjectFootprint(sc, Engine.actionsForStep(sc, step), id);
const sum = (sc, step, key) => pool().reduce((n, id) => n + fp(sc, step, id)[key], 0);
const subjectOf = (p) => (p && typeof p === "object" ? (typeof p.patient_id === "string" ? p.patient_id : typeof p.patientId === "string" ? p.patientId : null) : null);

test("healthy step 4: per-subject rows add up to the rows in production and the rows landed", () => {
  const st = Engine.getState("healthy", Engine.actionsForStep("healthy", 4));
  assert.strictEqual(sum("healthy", 4, "silver"), st.productionRows);
  assert.strictEqual(sum("healthy", 4, "bronze"), st.bronzeRows);
  assert.strictEqual(sum("healthy", 4, "staging"), 0);
  assert.strictEqual(sum("healthy", 4, "deadLetter"), 0);
});

test("incident step 3: every layer adds up once rows with no cohort id are counted", () => {
  const acts = Engine.actionsForStep("incident", 3);
  const st = Engine.getState("incident", acts);
  const outside = (rows) => rows.filter((r) => !ids.has(subjectOf(r))).length;
  assert.strictEqual(sum("incident", 3, "silver") + outside(st.productionData), st.productionRows);
  assert.strictEqual(sum("incident", 3, "staging") + outside(st.staging), st.staging.length);
  // Every dead-letter row belongs to a cohort patient: by id, or (null or malformed id) by name, ZIP and birth date.
  assert.strictEqual(sum("incident", 3, "deadLetter") + sum("incident", 3, "deadLetterByFields"), st.dlq.length);
  assert.strictEqual(sum("incident", 3, "deadLetterByFields"), 2);
  let landed = 0, unmatched = 0;
  for (let n = 1; n <= st.batchesRun; n++) {
    const b = Engine.inspectBatch("incident", acts, n);
    landed += b.rows.length;
    unmatched += outside(b.rows);
  }
  assert.strictEqual(landed, st.bronzeRows);
  assert.strictEqual(sum("incident", 3, "bronze") + unmatched, st.bronzeRows);
  assert.ok(unmatched >= 2, "the null-id row and the injection-string row match nobody");
  assert.strictEqual(st.dlq.length, 9);
  assert.strictEqual(st.staging.length, 11);
});

test("the injection-string id and an empty id are not cohort ids, so they have no footprint", () => {
  const acts = Engine.actionsForStep("incident", 3);
  const inj = "'; DROP TABLE silver_vital_observation;--";
  assert.deepStrictEqual(Engine.subjectFootprint("incident", acts, inj), { patientId: inj, inCohort: false, bronze: 0, staging: 0, silver: 0, deadLetter: 0, deadLetterByFields: 0, dimPatient: 0 });
  assert.deepStrictEqual(Engine.subjectFootprint("incident", acts, ""), { patientId: "", inCohort: false, bronze: 0, staging: 0, silver: 0, deadLetter: 0, deadLetterByFields: 0, dimPatient: 0 });
});

test("the null-id row and the injection-string row are matched to their patients by name, ZIP and birth date", () => {
  const acts = Engine.actionsForStep("incident", 3);
  const st = Engine.getState("incident", acts);
  const nullRow = st.dlq.find((d) => d.dlqId === "dlq-3-4");
  const injRow = st.dlq.find((d) => d.dlqId === "dlq-3-13");
  [[nullRow, "TMH-P-012004"], [injRow, "TMH-P-536398"]].forEach(([d, id]) => {
    const p = d.payload;
    const owner = Engine.buildPatientPool().find((x) => x.patient_name === p.patient_name && x.patient_zip5 === p.patient_zip5 && x.birth_date === p.birth_date);
    assert.strictEqual(owner.patient_id, id, d.dlqId);
    const f = Engine.subjectFootprint("incident", acts, id);
    assert.strictEqual(f.deadLetterByFields, 1, d.dlqId);
  });
});

test("a renamed-column row (patientId) is matched to its subject", () => {
  const acts = Engine.actionsForStep("incident", 3);
  const st = Engine.getState("incident", acts);
  const renamed = st.dlq.filter((d) => d.payload && typeof d.payload.patientId === "string");
  assert.ok(renamed.length > 0);
  renamed.forEach((d) => {
    const f = Engine.subjectFootprint("incident", acts, d.payload.patientId);
    assert.ok(f.deadLetter >= 1 && f.bronze >= 1, d.dlqId);
  });
});

test("dimPatient is 1 exactly when the subject has a published row", () => {
  for (const [sc, step] of [["healthy", 4], ["incident", 3], ["incident", 16]]) {
    pool().forEach((id) => {
      const f = fp(sc, step, id);
      assert.strictEqual(f.dimPatient, f.silver > 0 ? 1 : 0, sc + step + id);
    });
  }
});

test("an id outside the cohort has no footprint; the cohort has 40 subjects", () => {
  assert.strictEqual(pool().length, 40);
  assert.deepStrictEqual(fp("healthy", 4, "TMH-P-999999"), { patientId: "TMH-P-999999", inCohort: false, bronze: 0, staging: 0, silver: 0, deadLetter: 0, deadLetterByFields: 0, dimPatient: 0 });
  assert.strictEqual(fp("healthy", 4, pool()[0]).inCohort, true);
});

test("bad input: a non-string id or a non-array action list gives null; an unknown scenario throws", () => {
  assert.strictEqual(Engine.subjectFootprint("healthy", [], 7), null);
  assert.strictEqual(Engine.subjectFootprint("healthy", [], null), null);
  assert.strictEqual(Engine.subjectFootprint("healthy", [], undefined), null);
  assert.strictEqual(Engine.subjectFootprint("healthy", null, pool()[0]), null);
  assert.throws(() => Engine.subjectFootprint("nope", [], pool()[0]));
});

test("golden patient TMH-P-004821 has a Bronze and a Silver row at healthy step 1", () => {
  const f = fp("healthy", 1, "TMH-P-004821");
  assert.ok(f.bronze >= 1 && f.silver >= 1 && f.dimPatient === 1);
  assert.strictEqual(f.deadLetter, 0);
});

test("pure: equal inputs give equal outputs and the actions are not mutated", () => {
  const acts = Engine.actionsForStep("incident", 16);
  const copy = JSON.parse(JSON.stringify(acts));
  assert.deepStrictEqual(Engine.subjectFootprint("incident", acts, pool()[1]), Engine.subjectFootprint("incident", acts, pool()[1]));
  assert.deepStrictEqual(acts, copy);
});
