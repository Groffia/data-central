const test = require("node:test");
const assert = require("node:assert");
const Engine = require("../engine.js");

const SENSITIVE = Engine.getContract().fields.filter((f) => f.sensitive).map((f) => f.name);
const ACTORS = ["svc-ingest", "svc-dq-gate", "svc-silver-load", "operator", "privacy-office"];
const ACTIONS = ["READ", "WRITE", "MODIFY", "DELETE", "ERASE"];
const log = (sc, step, er) => Engine.accessLog(sc, Engine.actionsForStep(sc, step), er);
const pool = () => Engine.buildPatientPool().map((p) => p.patient_id);
const golden = (i) => Engine.getContract().goldenRows[i].patient_id;

test("healthy step 4: 12 entries, three per batch (land, test, load to Silver)", () => {
  const l = log("healthy", 4);
  assert.strictEqual(l.length, 12);
  for (let b = 0; b < 4; b++) {
    const [w, r, s] = l.slice(b * 3, b * 3 + 3);
    assert.deepStrictEqual([w.actor, w.action, w.object, w.rows], ["svc-ingest", "WRITE", "bronze_tamsworth_vitals", 20]);
    assert.deepStrictEqual([r.actor, r.action, r.object, r.rows], ["svc-dq-gate", "READ", "bronze_tamsworth_vitals", 20]);
    assert.deepStrictEqual([s.actor, s.action, s.object, s.rows], ["svc-silver-load", "WRITE", "silver_vital_observation", 20]);
  }
});

test("incident step 3: 10 entries; the held batch lands, is tested, quarantines 9 rows and holds 11", () => {
  const l = log("incident", 3);
  assert.strictEqual(l.length, 10);
  const held = l.slice(6);
  assert.deepStrictEqual(held.map((e) => [e.actor, e.action, e.object, e.rows]), [
    ["svc-ingest", "WRITE", "bronze_tamsworth_vitals", 20],
    ["svc-dq-gate", "READ", "bronze_tamsworth_vitals", 20],
    ["svc-dq-gate", "WRITE", "dead_letter_queue", 9],
    ["svc-dq-gate", "WRITE", "staging", 11],
  ]);
  const st = Engine.getState("incident", Engine.actionsForStep("incident", 3));
  assert.strictEqual(held[2].rows, st.dlq.length);
  assert.strictEqual(held[3].rows, st.staging.length);
});

test("every entry is well formed: contiguous seq, non-decreasing iso, known actor and action, integer rows, sensitive subset", () => {
  for (const [sc, step] of [["healthy", 4], ["incident", 3], ["incident", 16]]) {
    const l = log(sc, step);
    l.forEach((e, i) => {
      assert.strictEqual(e.seq, i + 1);
      if (i) assert.ok(e.iso >= l[i - 1].iso, "iso order");
      assert.ok(ACTORS.includes(e.actor) && ACTIONS.includes(e.action));
      assert.ok(Number.isInteger(e.rows) && e.rows >= 0);
      assert.ok(Array.isArray(e.phiFields) && e.phiFields.every((f) => SENSITIVE.includes(f)));
      assert.ok(typeof e.object === "string" && typeof e.purpose === "string" && e.purpose.length > 0);
      assert.deepStrictEqual(Object.keys(e), ["seq", "iso", "actor", "action", "object", "rows", "phiFields", "purpose"]);
    });
  }
});

test("sensitive fields: batches carry all five; the quarantine entry lists what its rows hold", () => {
  const l = log("incident", 3);
  assert.deepStrictEqual(l[0].phiFields, SENSITIVE);
  const st = Engine.getState("incident", Engine.actionsForStep("incident", 3));
  const union = new Set();
  st.dlq.forEach((d) => Engine.phiFields(d.payload).forEach((f) => union.add(f)));
  assert.deepStrictEqual(l[8].phiFields, SENSITIVE.filter((f) => union.has(f)));
});

test("Silver entries add up to the rows in production; the trial batch loads its own rows plus the held and repaired rows it releases", () => {
  const acts = Engine.actionsForStep("incident", 16);
  const l = Engine.accessLog("incident", acts);
  const silver = l.filter((e) => e.object === "silver_vital_observation");
  assert.strictEqual(silver.length, 3, "batches 1, 2 and the trial batch 4 (batch 3 was held)");
  const st = Engine.getState("incident", acts);
  assert.strictEqual(silver.reduce((n, e) => n + e.rows, 0), st.productionRows);
  const held = l.find((e) => e.object === "staging").rows;
  assert.ok(silver[2].rows > 20 && silver[2].rows >= 20 + held, "the trial load includes the released rows");
  assert.strictEqual(silver[2].rows, st.productionRows - 40);
});

test("full incident: 5 repairs (MODIFY, 1 row), 4 discards (DELETE, reason as purpose), nothing for alert actions or resolveRetry", () => {
  const acts = Engine.actionsForStep("incident", 16);
  const l = Engine.accessLog("incident", acts);
  const rep = l.filter((e) => e.action === "MODIFY");
  const del = l.filter((e) => e.action === "DELETE");
  assert.strictEqual(rep.length, 5);
  rep.forEach((e) => assert.deepStrictEqual([e.actor, e.object, e.rows], ["operator", "dead_letter_queue", 1]));
  assert.strictEqual(del.length, 4);
  const reasons = acts.filter((a) => a.type === "discardRow").map((a) => a.reason);
  assert.deepStrictEqual(del.map((e) => e.purpose), reasons);
  del.forEach((e) => assert.deepStrictEqual([e.actor, e.object, e.rows], ["operator", "dead_letter_queue", 1]));
  assert.strictEqual(l.filter((e) => e.actor === "operator").length, 9);
});

test("rejected actions and no-op repeats add nothing", () => {
  const base = Engine.actionsForStep("incident", 3);
  const n = Engine.accessLog("incident", base).length;
  assert.strictEqual(Engine.accessLog("incident", [...base, { type: "runBatch" }]).length, n, "runBatch while the gate is open");
  const rep = [...base, { type: "repairRow", dlqId: "dlq-3-2" }];
  const once = Engine.accessLog("incident", rep).length;
  assert.strictEqual(once, n + 1);
  assert.strictEqual(Engine.accessLog("incident", [...rep, { type: "repairRow", dlqId: "dlq-3-2" }]).length, once, "repeated repair");
  assert.strictEqual(Engine.accessLog("incident", [...rep, { type: "repairRow", dlqId: "dlq-3-4" }]).length, once, "repair of a hard failure");
  assert.strictEqual(Engine.accessLog("incident", [...rep, { type: "ackAlert" }]).length, once, "alert actions");
});

test("erasures: one ERASE entry per distinct in-cohort id, last in the log, with the shown state's clock", () => {
  const base = log("incident", 3);
  const ids = [golden(0), golden(2)];
  const l = log("incident", 3, ids);
  assert.strictEqual(l.length, base.length + 2);
  assert.deepStrictEqual(l.slice(0, base.length), base);
  const e = l.slice(base.length);
  const clock = Engine.getState("incident", Engine.actionsForStep("incident", 3)).clock.iso;
  e.forEach((x, i) => {
    assert.deepStrictEqual([x.actor, x.action, x.object], ["privacy-office", "ERASE", "subject " + ids[i]]);
    assert.strictEqual(x.iso, clock);
    assert.strictEqual(x.seq, base.length + i + 1);
    assert.ok(x.iso >= base[base.length - 1].iso);
  });
});

test("erasures: ERASE entries are last at an earlier and at a later step", () => {
  for (const step of [2, 3, 8, 16]) {
    const l = log("incident", step, [golden(1)]);
    assert.strictEqual(l[l.length - 1].action, "ERASE", "step " + step);
    assert.strictEqual(l.filter((e) => e.action === "ERASE").length, 1);
  }
});

test("erasures: ids outside the cohort, repeats and non-cohort strings add nothing", () => {
  const base = log("incident", 3).length;
  assert.strictEqual(log("incident", 3, ["TMH-P-999999", "nobody", golden(0), golden(0)]).length, base + 1);
  assert.strictEqual(log("incident", 3, []).length, base);
});

test("erasures: rows on an ERASE entry are the subject's rows in staging, Silver, the dead-letter queue and dim_patient", () => {
  const acts = Engine.actionsForStep("incident", 3);
  let nonzero = 0;
  for (const id of pool()) {
    const st = Engine.getState("incident", acts);
    const own = (rows) => rows.filter((r) => r && (r.patient_id === id || r.patientId === id)).length;
    const silver = own(st.productionData);
    const expected = own(st.staging) + silver + st.dlq.filter((d) => d.payload && (d.payload.patient_id === id || d.payload.patientId === id)).length + (silver > 0 ? 1 : 0);
    const e = Engine.accessLog("incident", acts, [id]).pop();
    assert.strictEqual(e.rows, expected, id);
    if (expected) nonzero++;
  }
  assert.ok(nonzero > 0);
});

test("bad input: a non-array action list, or erasures that are not an array of strings, give null", () => {
  assert.strictEqual(Engine.accessLog("healthy", null), null);
  assert.strictEqual(Engine.accessLog("healthy", "r"), null);
  assert.strictEqual(Engine.accessLog("healthy", [], "x"), null);
  assert.strictEqual(Engine.accessLog("healthy", [], [1]), null);
  assert.strictEqual(Engine.accessLog("healthy", [], [null]), null);
  assert.deepStrictEqual(Engine.accessLog("healthy", []), []);
  assert.throws(() => Engine.accessLog("nope", []));
});

test("pure: equal inputs give equal outputs and inputs are not mutated", () => {
  const acts = Engine.actionsForStep("incident", 16);
  const copy = JSON.parse(JSON.stringify(acts));
  const ids = [golden(0)];
  const a = Engine.accessLog("incident", acts, ids);
  const b = Engine.accessLog("incident", acts, ids);
  assert.deepStrictEqual(a, b);
  assert.deepStrictEqual(acts, copy);
  assert.deepStrictEqual(ids, [golden(0)]);
});

test("200 runBatch actions finish in one replay pass under 1.5 s", () => {
  const acts = Array.from({ length: 200 }, () => ({ type: "runBatch" }));
  const t0 = Date.now();
  const l = Engine.accessLog("healthy", acts);
  assert.ok(Date.now() - t0 < 1500, "took " + (Date.now() - t0) + " ms");
  assert.strictEqual(l.length, 600);
});
