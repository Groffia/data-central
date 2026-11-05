const test = require("node:test");
const assert = require("node:assert");
const Engine = require("../engine.js");

// Independent brute-force binomial (log-space pmf, tail summed directly). Does not use the engine's helper.
function pmf(n, p, j) {
  let lg = 0;
  for (let i = 1; i <= n; i++) lg += Math.log(i);
  for (let i = 1; i <= j; i++) lg -= Math.log(i);
  for (let i = 1; i <= n - j; i++) lg -= Math.log(i);
  return Math.exp(lg + j * Math.log(p) + (n - j) * Math.log(1 - p));
}
function limitK(n, p) {
  for (let k = 0; k <= n; k++) {
    let tail = 0;
    for (let j = k + 1; j <= n; j++) tail += pmf(n, p, j);
    if (tail <= 0.025) return k;
  }
  return n;
}
const hist = Engine.getHistory();
const BASE = hist.reduce((s, r) => s + r.abnormal_obs_standard, 0) / hist.reduce((s, r) => s + r.observations, 0);
const at = (scenario, step) => Engine.getState(scenario, Engine.actionsForStep(scenario, step));
const check = (scenario, step) => Engine.liveSampleCheck(at(scenario, step));

test("baseline rate is the 120-day standard abnormal rate", () => {
  assert.ok(Math.abs(BASE - 0.0602) < 0.0001);
  assert.strictEqual(check("healthy", 4).baselineRate, BASE);
});

test("healthy step 1: only batch 1, five hand-picked rows, too few readings", () => {
  const c = check("healthy", 1);
  assert.strictEqual(c.published, 20);
  assert.strictEqual(c.handPicked, 5);
  assert.strictEqual(c.readings, 15);
  assert.strictEqual(c.verdict, "Not enough data yet (fewer than 30 readings)");
});

test("healthy step 4: hand-picked rows are excluded and the verdict is Within", () => {
  const c = check("healthy", 4);
  assert.strictEqual(c.published, 80);
  assert.strictEqual(c.abnormal, 10);
  assert.strictEqual(c.handPickedAbnormal, 3);
  assert.strictEqual(c.readings, 75);
  assert.strictEqual(c.abnormalReadings, 7);
  assert.strictEqual(c.ratePct.toFixed(1), "9.3");
  assert.strictEqual(limitK(75, BASE), 9);
  assert.strictEqual(c.upperLimitPct.toFixed(1), "12.0");
  assert.ok(Math.abs(c.upperLimitPct - (100 * limitK(75, BASE)) / 75) < 1e-9);
  assert.strictEqual(c.verdict, "Within the expected range");
});

test("counting the hand-picked rows would read Above, which is why they are excluded", () => {
  const k = limitK(80, BASE);
  assert.strictEqual(k, 9);
  assert.strictEqual(((100 * k) / 80).toFixed(1), "11.3");
  assert.ok(10 > k);
});

test("incident step 3 equals step 2 (held batch publishes nothing); step 16 publishes 76", () => {
  assert.deepStrictEqual(check("incident", 3), check("incident", 2));
  assert.strictEqual(check("incident", 16).published, 76);
});

test("30 readings with an abnormal count above the limit is Above", () => {
  const k = limitK(30, BASE);
  const s = { publishedObservations: 30, publishedAbnormal: k + 1, productionData: [] };
  const c = Engine.liveSampleCheck(s);
  assert.strictEqual(c.handPicked, 0);
  assert.strictEqual(c.readings, 30);
  assert.strictEqual(c.verdict, "Above the expected range");
  const ok = Engine.liveSampleCheck({ ...s, publishedAbnormal: k });
  assert.strictEqual(ok.verdict, "Within the expected range");
});

test("upper limit equals brute force for n = 30, 75, 200", () => {
  for (const n of [30, 75, 200]) {
    const c = Engine.liveSampleCheck({ publishedObservations: n, publishedAbnormal: 0, productionData: [] });
    assert.ok(Math.abs(c.upperLimitPct - (100 * limitK(n, BASE)) / n) < 1e-9, "n=" + n);
  }
});

test("zero readings: no NaN, limit is null, not enough data", () => {
  const c = Engine.liveSampleCheck({ publishedObservations: 0, publishedAbnormal: 0, productionData: [] });
  assert.strictEqual(c.readings, 0);
  assert.strictEqual(c.upperLimitPct, null);
  assert.strictEqual(c.ratePct, 0);
  assert.strictEqual(c.verdict, "Not enough data yet (fewer than 30 readings)");
});

test("junk input returns null and never throws", () => {
  for (const junk of [null, undefined, {}, 5, "x", [], { publishedObservations: "a" }, { publishedObservations: -1 }]) {
    assert.strictEqual(Engine.liveSampleCheck(junk), null);
  }
});

test("pure: does not change its input", () => {
  const s = at("healthy", 4);
  const before = JSON.stringify(s);
  Engine.liveSampleCheck(s);
  assert.strictEqual(JSON.stringify(s), before);
});
