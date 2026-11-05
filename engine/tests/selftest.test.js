const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const Engine = require("../engine.js");

// Recorded on first implementation of hashValues (first 100 values of makeRng(1)).
// A separate literal from engine.js, so editing only one of them fails the test.
const RECORDED_HASH = "1f8ea357";

const NAMES = ["determinism_hash", "golden_rows_first", "healthy_exports_pass", "incident_export_blocks", "breaker_path", "repair_only_drift", "state_deterministic", "facility_reconciles"];

test("selfTest passes with eight named checks in order", () => {
  const r = Engine.selfTest();
  assert.deepStrictEqual(r.checks.map((c) => c.name), NAMES);
  r.checks.forEach((c) => assert.strictEqual(c.ok, true, c.name + " " + (c.detail || "")));
  assert.strictEqual(r.passed, true);
});

test("hashValues is FNV-1a over toFixed(12) text", () => {
  assert.match(Engine.hashValues([0.5]), /^[0-9a-f]{8}$/);
  assert.strictEqual(Engine.hashValues([]), "811c9dc5");
  assert.strictEqual(Engine.hashValues([0.5]), Engine.hashValues([0.5]));
  assert.notStrictEqual(Engine.hashValues([0.5]), Engine.hashValues([0.5000001]));
  // FNV-1a 32 of "0.500000000000"
  let h = 0x811c9dc5;
  for (const ch of "0.500000000000") { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  assert.strictEqual(Engine.hashValues([0.5]), h.toString(16).padStart(8, "0"));
});

test("determinism constant matches in engine and test", () => {
  const rng = Engine.makeRng(1);
  const vals = Array.from({ length: 100 }, () => rng());
  assert.strictEqual(Engine.hashValues(vals), RECORDED_HASH);
  assert.strictEqual(Engine.DETERMINISM_HASH, RECORDED_HASH);
});

test("the hash check can fail: a wrong input does not match the constant", () => {
  assert.notStrictEqual(Engine.hashValues([0.5]), Engine.DETERMINISM_HASH);
});

test("selfTest is pure and quick", () => {
  const t0 = process.hrtime.bigint();
  const a = Engine.selfTest(), b = Engine.selfTest();
  assert.deepStrictEqual(a, b);
  assert.ok(Number(process.hrtime.bigint() - t0) / 1e6 < 1000);
});

// Returns the list of forbidden-form hits in a source string.
function scan(src) {
  const hits = [];
  ["Math.random", "Date.now", "new Date(", "require(", "import(", "window.", "document.", "globalThis.window"].forEach((t) => {
    if (src.includes(t)) hits.push(t);
  });
  if (src.split(/\r?\n/).some((l) => /^\s*import\s/.test(l))) hits.push("import statement");
  return hits;
}

test("engine.js source has no forbidden tokens", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "engine.js"), "utf8");
  assert.deepStrictEqual(scan(src), []);
});

test("the source scanner can fail", () => {
  ["x = Math.random()", "Date.now()", "new Date(0)", "require('fs')", "import('x')", "window.foo", "document.body",
    "globalThis.window", 'import x from "y"'].forEach((s) =>
    assert.ok(scan(s).length > 0, "scanner missed: " + s));
  ["const windowDays = 3", "globalThis.Engine = Engine", "the document describes it"].forEach((s) =>
    assert.deepStrictEqual(scan(s), [], "false hit: " + s));
});

test("engine.js leaks nothing to global scope", () => {
  const vm = require("node:vm");
  const src = fs.readFileSync(path.join(__dirname, "..", "engine.js"), "utf8");
  const ctx = {};
  vm.runInNewContext(src, ctx);
  assert.deepStrictEqual(Object.keys(ctx), ["Engine"]);
  assert.strictEqual(ctx.Engine.selfTest().passed, true);
});
