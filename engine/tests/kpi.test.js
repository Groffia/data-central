const test = require("node:test");
const assert = require("node:assert");
const Engine = require("../engine.js");

test("history shape and dates", () => {
  const h = Engine.getHistory();
  assert.strictEqual(h.length, 120);
  assert.strictEqual(h[119].date, "2026-11-03");
  assert.strictEqual(h[118].date, "2026-11-02");
  assert.ok(h[0].date < h[1].date);
  assert.deepStrictEqual(Object.keys(h[0]), ["date", "beds_staffed", "beds_occupied", "discharges", "readmits_30d_all", "readmits_30d_unplanned", "observations", "abnormal_obs_strict", "abnormal_obs_standard", "patient_days"]);
});

test("history per-row invariants", () => {
  for (const r of Engine.getHistory()) {
    assert.strictEqual(r.beds_staffed, 400);
    assert.ok(r.beds_occupied <= r.beds_staffed);
    assert.ok(r.abnormal_obs_strict <= r.abnormal_obs_standard);
    assert.ok(r.abnormal_obs_standard <= r.observations);
    assert.ok(r.readmits_30d_unplanned <= r.readmits_30d_all);
    assert.ok(r.readmits_30d_all <= r.discharges);
  }
});

test("history is deterministic and a fresh copy", () => {
  const a = Engine.getHistory();
  assert.deepStrictEqual(a, Engine.getHistory());
  a[0].beds_occupied = -1;
  a.pop();
  const b = Engine.getHistory();
  assert.strictEqual(b.length, 120);
  assert.notStrictEqual(b[0].beds_occupied, -1);
});

test("average occupancy near 78%", () => {
  const h = Engine.getHistory();
  const occ = h.reduce((s, r) => s + r.beds_occupied, 0) / h.reduce((s, r) => s + r.beds_staffed, 0);
  assert.ok(Math.abs(occ - 0.78) < 0.03, String(occ));
});

test("KPI names, order and delta", () => {
  const h = Engine.getHistory();
  const k = Engine.computeKpis(h);
  assert.deepStrictEqual(k.map((x) => x.name), ["Bed Occupancy", "Abnormal Vital Rate", "Avg Length of Stay", "30-Day Readmission Rate"]);
  const sum = (rows, f) => rows.reduce((s, r) => s + r[f], 0);
  const cur = h.slice(-7), pri = h.slice(-14, -7);
  assert.strictEqual(k[0].value, sum(cur, "beds_occupied") / sum(cur, "beds_staffed"));
  assert.strictEqual(k[0].priorValue, sum(pri, "beds_occupied") / sum(pri, "beds_staffed"));
  assert.strictEqual(k[2].value, sum(cur, "patient_days") / sum(cur, "discharges"));
  for (const x of k) {
    assert.deepStrictEqual(Object.keys(x), ["name", "value", "priorValue", "deltaPct"]);
    assert.strictEqual(x.deltaPct, ((x.value - x.priorValue) / x.priorValue) * 100);
  }
  const k14 = Engine.computeKpis(h, 14);
  assert.strictEqual(k14[0].value, sum(h.slice(-14), "beds_occupied") / sum(h.slice(-14), "beds_staffed"));
});

test("facility profile reconciles", () => {
  const h = Engine.getHistory();
  const f = Engine.facilityProfile(h);
  const occ = Engine.computeKpis(h)[0].value;
  assert.strictEqual(f.bedsStaffed, 400);
  assert.strictEqual(f.patientsInHouse, Math.round(400 * occ));
  assert.strictEqual(f.obsPerDay, f.patientsInHouse * 24);
  assert.ok(Math.abs(f.obsPer15Min * 96 - f.obsPerDay) < 1e-6);
  assert.strictEqual(f.obsPerMonth, f.obsPerDay * 30);
});

test("tiering cost", () => {
  const t = Engine.tieringCost();
  assert.deepStrictEqual(Object.keys(t), ["monthlyCost", "allHotCost", "allWarmCost", "savedVsHotPct", "savedVsWarmPct"]);
  assert.ok(t.savedVsHotPct > 0);
  assert.strictEqual(t.savedVsHotPct, ((t.allHotCost - t.monthlyCost) / t.allHotCost) * 100);
  assert.strictEqual(t.savedVsWarmPct, ((t.allWarmCost - t.monthlyCost) / t.allWarmCost) * 100);
  // all-warm: 18 GB/day x 2555 ages x $0.023, retrieval price 0
  assert.ok(Math.abs(t.allWarmCost - 18 * 2555 * 0.023) < 1e-6);
  assert.ok(Math.abs(t.allWarmCost - 1057.77) < 1e-6);
  assert.ok(t.monthlyCost < t.allWarmCost && t.allWarmCost < t.allHotCost);
  const faster = Engine.tieringCost({ hotToWarmDays: 10 });
  assert.ok(faster.monthlyCost < t.monthlyCost);
  assert.ok(faster.savedVsWarmPct > t.savedVsWarmPct);
  assert.strictEqual(faster.allWarmCost, t.allWarmCost);
});

test("facility bytesPerRow is measured from generated rows", () => {
  const f = Engine.facilityProfile(Engine.getHistory());
  assert.ok(f.bytesPerRow >= 100 && f.bytesPerRow <= 1000, String(f.bytesPerRow));
  assert.strictEqual(f.bytesPerRow, 253.75); // re-recorded after the explicit abnormal share: unchanged, the new values have the same total JSON length
  assert.strictEqual(f.bytesPerMonth, f.obsPerMonth * f.bytesPerRow);
  assert.strictEqual(f.bytesPerMonth, 226080 * 253.75);
  assert.deepStrictEqual(Object.keys(f).slice(0, 5), ["bedsStaffed", "patientsInHouse", "obsPerDay", "obsPer15Min", "obsPerMonth"]);
});

const SAVED_VS_WARM = 78.4169; // (1057.77 - 228.3) / 1057.77 * 100 = 78.41686
// These numbers feed the demo script. If one changes, re-record it deliberately.
test("demo headline numbers are pinned", () => {
  const near = (a, b, tol) => assert.ok(Math.abs(a - b) < tol, a + " vs " + b);
  const t = Engine.tieringCost();
  near(t.monthlyCost, 228.3, 1e-4);
  near(t.allHotCost, 3679.2, 1e-4);
  near(t.savedVsHotPct, 93.7948, 1e-4);
  near(t.allWarmCost, 1057.77, 1e-6);
  near(t.savedVsWarmPct, SAVED_VS_WARM, 1e-4);
  const s = Engine.getState("healthy", []);
  const want = [
    ["Bed Occupancy", 0.785714, 0.791071, -0.677201],
    ["Abnormal Vital Rate", 0.062216, 0.060102, 3.517926],
    ["Avg Length of Stay", 4.680851, 4.538934, 3.126651],
    ["30-Day Readmission Rate", 0.134043, 0.133197, 0.635025],
  ];
  want.forEach(([name, value, priorValue, deltaPct], i) => {
    const k = s.kpis[i];
    assert.strictEqual(k.name, name);
    near(k.value, value, 5e-7);
    near(k.priorValue, priorValue, 5e-7);
    near(k.deltaPct, deltaPct, 5e-7);
  });
  const f = s.facility;
  assert.strictEqual(f.patientsInHouse, 314);
  assert.strictEqual(f.obsPerDay, 7536);
  assert.strictEqual(f.obsPer15Min, 78.5);
  assert.strictEqual(f.obsPerMonth, 226080);
});

test("TIERING_DEFAULTS is exported, frozen, and the base of tieringCost", () => {
  assert.deepStrictEqual({ ...Engine.TIERING_DEFAULTS }, { hotToWarmDays: 30, warmToColdDays: 180, retentionDays: 2555, dailyGB: 18, halfLifeDays: 45 });
  assert.ok(Object.isFrozen(Engine.TIERING_DEFAULTS));
  assert.deepStrictEqual(Engine.tieringCost(), Engine.tieringCost(Engine.TIERING_DEFAULTS));
  const copy = { ...Engine.TIERING_DEFAULTS, hotToWarmDays: 5 };
  assert.ok(copy.hotToWarmDays === 5);
  assert.strictEqual(Engine.TIERING_DEFAULTS.hotToWarmDays, 30);
  assert.deepStrictEqual(Engine.tieringCost(), Engine.tieringCost(Engine.TIERING_DEFAULTS));
});
