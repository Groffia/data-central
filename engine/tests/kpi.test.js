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
  assert.deepStrictEqual(Object.keys(t), ["monthlyCost", "allHotCost", "savedPct"]);
  assert.ok(t.savedPct > 0);
  assert.strictEqual(t.savedPct, ((t.allHotCost - t.monthlyCost) / t.allHotCost) * 100);
  assert.ok(Engine.tieringCost({ hotToWarmDays: 10 }).monthlyCost < t.monthlyCost);
});
