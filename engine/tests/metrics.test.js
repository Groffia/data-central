"use strict";
const test = require("node:test");
const assert = require("node:assert");
const Engine = require("../engine.js");

function deepFrozen(o) {
  if (o === null || typeof o !== "object") return true;
  return Object.isFrozen(o) && Object.values(o).every(deepFrozen);
}

test("current definitions equal the matching computeKpis entry", () => {
  const h = Engine.getHistory();
  const kpis = Engine.computeKpis(h);
  for (const name of ["Abnormal Vital Rate", "30-Day Readmission Rate"]) {
    const cur = Engine.METRIC_DEFINITIONS[name].current;
    assert.deepStrictEqual(Engine.computeMetric(h, name, cur), (({ value, priorValue, deltaPct }) => ({ value, priorValue, deltaPct }))(kpis.find((k) => k.name === name)));
  }
});

test("definition ids and fields", () => {
  const d = Engine.METRIC_DEFINITIONS;
  assert.deepStrictEqual(Object.keys(d), ["Abnormal Vital Rate", "30-Day Readmission Rate"]);
  assert.strictEqual(d["Abnormal Vital Rate"].current, "standard_thresholds");
  assert.strictEqual(d["30-Day Readmission Rate"].current, "all_cause");
  const pick = (n) => d[n].definitions.map((x) => [x.id, x.numerator, x.denominator]);
  assert.deepStrictEqual(pick("Abnormal Vital Rate"), [["standard_thresholds", "abnormal_obs_standard", "observations"], ["strict_thresholds", "abnormal_obs_strict", "observations"]]);
  assert.deepStrictEqual(pick("30-Day Readmission Rate"), [["all_cause", "readmits_30d_all", "discharges"], ["unplanned_only", "readmits_30d_unplanned", "discharges"]]);
  for (const m of Object.values(d)) for (const x of m.definitions) assert.strictEqual(typeof x.label, "string");
});

test("alternate definitions are below the current one in every 7-day window", () => {
  const h = Engine.getHistory();
  const sum = (rows, f) => rows.reduce((s, r) => s + r[f], 0);
  for (let i = 6; i < h.length; i++) {
    const w = h.slice(i - 6, i + 1);
    assert.ok(sum(w, "abnormal_obs_strict") / sum(w, "observations") < sum(w, "abnormal_obs_standard") / sum(w, "observations"), "strict day " + i);
    assert.ok(sum(w, "readmits_30d_unplanned") / sum(w, "discharges") < sum(w, "readmits_30d_all") / sum(w, "discharges"), "unplanned day " + i);
  }
  for (let n = 14; n <= h.length; n++) {
    const p = h.slice(0, n);
    assert.ok(Engine.computeMetric(p, "Abnormal Vital Rate", "strict_thresholds").value < Engine.computeMetric(p, "Abnormal Vital Rate", "standard_thresholds").value);
    assert.ok(Engine.computeMetric(p, "30-Day Readmission Rate", "unplanned_only").value < Engine.computeMetric(p, "30-Day Readmission Rate", "all_cause").value);
  }
});

test("unknown metric, unknown definition, bad window give null", () => {
  const h = Engine.getHistory();
  assert.strictEqual(Engine.computeMetric(h, "Nope", "all_cause"), null);
  assert.strictEqual(Engine.computeMetric(h, "Abnormal Vital Rate", "nope"), null);
  assert.strictEqual(Engine.computeMetric(h, "Abnormal Vital Rate", "standard_thresholds", 0), null);
  assert.strictEqual(Engine.computeMetric(h, "Abnormal Vital Rate", "standard_thresholds", 61), null);
  assert.notStrictEqual(Engine.computeMetric(h, "Abnormal Vital Rate", "standard_thresholds", 60), null);
});

test("METRIC_DEFINITIONS is deep-frozen", () => {
  assert.ok(deepFrozen(Engine.METRIC_DEFINITIONS));
  assert.throws(() => { Engine.METRIC_DEFINITIONS["Abnormal Vital Rate"].current = "x"; }, TypeError);
  assert.throws(() => { Engine.METRIC_DEFINITIONS["Abnormal Vital Rate"].definitions[0].label = "x"; }, TypeError);
});

test("pinned hashes unchanged", () => {
  assert.strictEqual(Engine.DETERMINISM_HASH, "1f8ea357");
  assert.strictEqual(Engine.GENERATOR_HASH, "bc1e18dc");
});
