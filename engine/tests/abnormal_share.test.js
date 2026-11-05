const test = require("node:test");
const assert = require("node:assert");
const Engine = require("../engine.js");

// Recorded after Item 1 was implemented. A separate literal from engine.js, so editing only one fails.
const RECORDED_GENERATOR_HASH = "bc1e18dc";
// FNV-1a of every non-vital_value field of exports 1-8 (healthy), recorded from the v1.0/v1.1a generator.
const OLD_NON_VALUE_FINGERPRINT = "bbec8f01";

const contract = Engine.getContract();
const GOLDEN_COUNT = contract.goldenRows.length;
const tile = () => Engine.computeKpis(Engine.getHistory()).find((k) => k.name === "Abnormal Vital Rate").value;
const exp = (n) => Engine.generateExport(n, "healthy").rows;

function fnv(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i) & 0xff; h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

// Generated (non-golden) rows of exports 1..40.
function generatedRows() {
  const out = [];
  for (let n = 1; n <= 40; n++) exp(n).forEach((r, i) => { if (!(n === 1 && i < GOLDEN_COUNT)) out.push(r); });
  return out;
}

test("abnormal share of generated rows in exports 1-40 is within 2 points of the 7-day tile", () => {
  const rows = generatedRows();
  assert.strictEqual(rows.length, 40 * 20 - GOLDEN_COUNT);
  const share = rows.filter((r) => Engine.isAbnormal(r)).length / rows.length;
  assert.ok(Math.abs(share - tile()) <= 0.02, "share " + share + " vs tile " + tile());
});

test("every generated value is inside the contract range, with the right precision", () => {
  generatedRows().forEach((r) => {
    const vc = contract.vitalCodes.find((c) => c.code === r.vital_code);
    assert.ok(r.vital_value >= vc.min && r.vital_value <= vc.max, r.vital_code + " " + r.vital_value);
    if (r.vital_code === "8310-5") assert.strictEqual(r.vital_value, Math.round(r.vital_value * 10) / 10);
    else assert.ok(Number.isInteger(r.vital_value), r.vital_code + " " + r.vital_value);
  });
});

test("every vital code produces both normal and abnormal generated values", () => {
  const rows = generatedRows();
  contract.vitalCodes.forEach((vc) => {
    const mine = rows.filter((r) => r.vital_code === vc.code);
    assert.ok(mine.some((r) => Engine.isAbnormal(r)), vc.code + " has no abnormal values");
    assert.ok(mine.some((r) => !Engine.isAbnormal(r)), vc.code + " has no normal values");
  });
});

test("abnormalShare() equals the 7-day tile fraction, computed independently", () => {
  assert.strictEqual(Engine.abnormalShare(), tile());
  const h = Engine.getHistory().slice(-7);
  const num = h.reduce((s, r) => s + r.abnormal_obs_standard, 0), den = h.reduce((s, r) => s + r.observations, 0);
  assert.strictEqual(Engine.abnormalShare(), num / den);
  assert.ok(Math.abs(Engine.abnormalShare() - 0.0622) < 0.0001);
});

test("determinism: generateExport is pure for n 1..40 and golden rows are unchanged", () => {
  for (let n = 1; n <= 40; n++) assert.deepStrictEqual(Engine.generateExport(n, "healthy"), Engine.generateExport(n, "healthy"));
  assert.deepStrictEqual(exp(1).slice(0, GOLDEN_COUNT), contract.goldenRows);
});

test("only vital_value changed: all other fields match the old generator", () => {
  let s = "";
  for (let n = 1; n <= 8; n++) exp(n).forEach((r) => { const { vital_value, ...rest } = r; s += JSON.stringify(rest); });
  assert.strictEqual(fnv(s), OLD_NON_VALUE_FINGERPRINT);
  // Literal fields captured from the old generator (export 1, rows 6-8).
  const r = exp(1);
  assert.strictEqual(r[5].patient_id, "SGH-P-458121");
  assert.strictEqual(r[5].encounter_epoch, 1793715600);
  assert.strictEqual(r[5].vital_code, "8480-6");
  assert.strictEqual(r[5].cipher_suite, "TLS_AES_256_GCM_SHA384");
  assert.strictEqual(r[6].encounter_epoch, 1793715643);
  assert.strictEqual(r[6].vital_code, "59408-5");
  assert.strictEqual(r[7].encounter_epoch, 1793715686);
  assert.strictEqual(r[7].cipher_suite, "TLS_CHACHA20_POLY1305_SHA256");
  assert.strictEqual(r[7].vital_sequence, 1);
});

test("fault injector overrides still apply on the incident export", () => {
  const rows = Engine.generateExport(3, "incident").rows;
  assert.strictEqual(rows[8].vital_code, "59408-5");
  assert.strictEqual(rows[8].vital_value, 130);
  assert.strictEqual(rows[16].unit, "mmHg");
  assert.strictEqual(rows[16].vital_code, "8867-4");
});

test("todaySoFar carries the exact note and label", () => {
  const t = Engine.getState("healthy", []).todaySoFar;
  assert.strictEqual(t.note, "The first five readings are hand-picked edge cases, so early batches run above the 7-day rate.");
  assert.strictEqual(t.label, "Live sample: published exports today.");
});

test("GENERATOR_HASH literal matches the engine and the recomputed value", () => {
  const vals = [];
  for (let n = 1; n <= 8; n++) exp(n).forEach((r) => vals.push(r.vital_value));
  assert.strictEqual(Engine.hashValues(vals), RECORDED_GENERATOR_HASH);
  assert.strictEqual(Engine.GENERATOR_HASH, RECORDED_GENERATOR_HASH);
  assert.strictEqual(Engine.DETERMINISM_HASH, "1f8ea357");
});

test("selfTest determinism_hash check covers both hashes", () => {
  const c = Engine.selfTest().checks.find((x) => x.name === "determinism_hash");
  assert.strictEqual(c.ok, true);
});
