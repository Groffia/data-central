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

test("metricSeries: shape, trailing last equals computeKpis, daily last is the day's ratio, dates match", () => {
  const h = Engine.getHistory();
  const kpis = Engine.computeKpis(h);
  const fields = { "Bed Occupancy": ["beds_occupied", "beds_staffed"], "Abnormal Vital Rate": ["abnormal_obs_standard", "observations"], "Avg Length of Stay": ["patient_days", "discharges"], "30-Day Readmission Rate": ["readmits_30d_all", "discharges"] };
  kpis.forEach((k) => {
    const s = Engine.metricSeries(h, k.name);
    assert.deepStrictEqual(s.dates, h.map((r) => r.date));
    assert.strictEqual(s.daily.length, 120);
    assert.strictEqual(s.trailing.length, 120);
    assert.strictEqual(s.trailing[119], k.value);
    const [nf, df] = fields[k.name], last = h[119];
    assert.strictEqual(s.daily[119], last[nf] / last[df]);
    assert.strictEqual(s.trailing[0], s.daily[0]);
    const w3 = Engine.metricSeries(h, k.name, undefined, 3);
    assert.strictEqual(w3.trailing[1], (h[0][nf] + h[1][nf]) / (h[0][df] + h[1][df]));
    assert.strictEqual(w3.trailing[5], (h[3][nf] + h[4][nf] + h[5][nf]) / (h[3][df] + h[4][df] + h[5][df]));
  });
});

test("metricSeries: definitions, defaults and nulls", () => {
  const h = Engine.getHistory();
  const cur = Engine.metricSeries(h, "Abnormal Vital Rate");
  assert.deepStrictEqual(cur, Engine.metricSeries(h, "Abnormal Vital Rate", "standard_thresholds"));
  const strict = Engine.metricSeries(h, "Abnormal Vital Rate", "strict_thresholds");
  assert.strictEqual(strict.daily[10], h[10].abnormal_obs_strict / h[10].observations);
  const un = Engine.metricSeries(h, "30-Day Readmission Rate", "unplanned_only");
  assert.strictEqual(un.daily[10], h[10].readmits_30d_unplanned / h[10].discharges);
  assert.strictEqual(Engine.metricSeries(h, "Bed Occupancy", "x"), null);
  assert.strictEqual(Engine.metricSeries(h, "Avg Length of Stay", "all_cause"), null);
  assert.strictEqual(Engine.metricSeries(h, "Abnormal Vital Rate", "nope"), null);
  assert.strictEqual(Engine.metricSeries(h, "Nope"), null);
  assert.strictEqual(Engine.metricSeries(h, "toString"), null);
  [0, -1, 1.5, "7", NaN].forEach((w) => assert.strictEqual(Engine.metricSeries(h, "Bed Occupancy", undefined, w), null));
});
