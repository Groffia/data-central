const test = require("node:test");
const assert = require("node:assert");
const Engine = require("../engine.js");

const H = Engine.AUTOPLAY.healthy, I = Engine.AUTOPLAY.incident;

test("actionsForStep healthy: floor 0, clamped to the four scripted actions", () => {
  assert.deepStrictEqual(Engine.actionsForStep("healthy", 0), []);
  assert.deepStrictEqual(Engine.actionsForStep("healthy", 2), H.slice(0, 2));
  assert.deepStrictEqual(Engine.actionsForStep("healthy", 4), H);
  assert.deepStrictEqual(Engine.actionsForStep("healthy", 99), H);
  assert.strictEqual(Engine.actionsForStep("healthy", 99).length, 4);
});

test("actionsForStep incident: floor is the two prelude actions", () => {
  assert.deepStrictEqual(Engine.actionsForStep("incident", 0), Engine.PRELUDE.incident);
  assert.deepStrictEqual(Engine.actionsForStep("incident", 1), Engine.PRELUDE.incident);
  assert.strictEqual(Engine.actionsForStep("incident", 0).length, 2);
  const three = Engine.actionsForStep("incident", 3);
  assert.strictEqual(three.length, 3);
  assert.deepStrictEqual(three, I.slice(0, 3));
  assert.strictEqual(Engine.getState("incident", three).gate, "OPEN");
  const all = Engine.actionsForStep("incident", 99);
  assert.deepStrictEqual(all, I);
  assert.strictEqual(Engine.getState("incident", all).gate, "CLOSED");
});

test("actionsForStep: non-integer, NaN, string and negative steps become the floor", () => {
  ["3", NaN, -1, 2.5, undefined, null, Infinity, {}].forEach((bad) => {
    assert.strictEqual(Engine.actionsForStep("incident", bad).length, 2, String(bad));
    assert.strictEqual(Engine.actionsForStep("healthy", bad).length, 0, String(bad));
  });
});

test("actionsForStep returns a fresh copy", () => {
  const a = Engine.actionsForStep("incident", 99);
  a.pop(); a.length = 0;
  assert.strictEqual(Engine.AUTOPLAY.incident.length, I.length);
  const b = Engine.actionsForStep("healthy", 2);
  b[0].type = "mutated";
  assert.strictEqual(Engine.AUTOPLAY.healthy[0].type, "runBatch");
  assert.notStrictEqual(Engine.actionsForStep("healthy", 2), Engine.actionsForStep("healthy", 2));
});

test("actionsForStep validates the scenario", () => {
  assert.throws(() => Engine.actionsForStep("bogus", 1), /scenario must be 'healthy' or 'incident'/);
  assert.throws(() => Engine.actionsForStep(undefined, 1), /scenario must be 'healthy' or 'incident'/);
});

test("actionsForStep composes with parseLinkParams", () => {
  const p = Engine.parseLinkParams("?scenario=incident&step=3");
  const a = Engine.actionsForStep(p.scenario, p.step);
  assert.strictEqual(a.length, 3);
  assert.strictEqual(Engine.getState(p.scenario, a).gate, "OPEN");
  const d = Engine.parseLinkParams("");
  assert.deepStrictEqual(Engine.actionsForStep(d.scenario, d.step), []);
});
