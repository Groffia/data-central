const test = require("node:test");
const assert = require("node:assert");
const Engine = require("../engine.js");

test("mulberry32(42) first three values", () => {
  const r = Engine.mulberry32(42);
  assert.strictEqual(r(), 0.6011037519201636);
  assert.strictEqual(r(), 0.44829055899754167);
  assert.strictEqual(r(), 0.8524657934904099);
});

test("makeRng(1) first two values", () => {
  const r = Engine.makeRng(1);
  assert.strictEqual(r(), 0.39791260845959187);
  assert.strictEqual(r(), 0.6019687016960233);
});

test("constants", () => {
  assert.strictEqual(Engine.SEED, 42);
  assert.strictEqual(Engine.BASE_EPOCH, 1793714400);
});

test("isoFromEpoch formats UTC without milliseconds", () => {
  assert.strictEqual(Engine.isoFromEpoch(1793714400), "2026-11-03T14:00:00Z");
  assert.strictEqual(Engine.isoFromEpoch(0), "1970-01-01T00:00:00Z");
  assert.strictEqual(Engine.isoFromEpoch(951782400 + 86399), "2000-02-29T23:59:59Z");
});

test("round", () => {
  assert.strictEqual(Engine.round(2.5, 0), 3);
  assert.strictEqual(Engine.round(1.234, 2), 1.23);
});

test("rngPick, rngRange, rngGauss", () => {
  const r = Engine.makeRng(1);
  assert.ok(["a", "b", "c"].includes(Engine.rngPick(r, ["a", "b", "c"])));
  const v = Engine.rngRange(r, 10, 20);
  assert.ok(v >= 10 && v < 20);
  assert.ok(Number.isFinite(Engine.rngGauss(r)));
});
