const test = require("node:test");
const assert = require("node:assert");
const Engine = require("../engine.js");

const { AUTOPLAY, PRELUDE, encodeActions, decodeActions, stepForActions, parseLinkParams } = Engine;
const clone = (x) => JSON.parse(JSON.stringify(x));
const R = { type: "runBatch" };

// Encoded scripted incident, fixed by hand from the first run: three exports, five repairs, four discards
// (reason index = position in DISCARD_REASONS), acknowledge, retry, one more export, resolve.
const INCIDENT_LITERAL =
  "r.r.r.p:dlq-3-2.p:dlq-3-6.p:dlq-3-10.p:dlq-3-15.p:dlq-3-19.d:dlq-3-4:0.d:dlq-3-9:1.d:dlq-3-13:2.d:dlq-3-17:3.k.y.r.z";

test("the scripted incident encodes to a fixed, hand-reviewed literal", () => {
  assert.strictEqual(encodeActions(AUTOPLAY.incident), INCIDENT_LITERAL);
  assert.deepStrictEqual(decodeActions(INCIDENT_LITERAL), AUTOPLAY.incident);
});

test("empty action list uses the explicit marker '-' (the empty string is invalid)", () => {
  assert.strictEqual(encodeActions([]), "-");
  assert.deepStrictEqual(decodeActions("-"), []);
  assert.strictEqual(decodeActions(""), null);
});

test("every scripted prefix round-trips (healthy 0-4, incident 0-16: 22 prefixes)", () => {
  let n = 0;
  for (const scenario of ["healthy", "incident"]) {
    for (let k = 0; k <= AUTOPLAY[scenario].length; k++) {
      const x = AUTOPLAY[scenario].slice(0, k);
      const text = encodeActions(x);
      assert.strictEqual(typeof text, "string");
      assert.deepStrictEqual(decodeActions(text), x, `${scenario} prefix ${k}`);
      n++;
    }
  }
  assert.strictEqual(n, 22);
});

test("three diverged states round-trip exactly", () => {
  const inc = clone(AUTOPLAY.incident);
  // (1) a repairable drift row discarded with "Other, see note" instead of repaired
  const d1 = clone(inc);
  d1[3] = { type: "discardRow", dlqId: "dlq-3-2", reason: "Other, see note" };
  // (2) the alert acknowledged before the first repair
  const d2 = [...inc.slice(0, 3), { type: "ackAlert" }, ...inc.slice(3, 13), ...inc.slice(14)];
  // (3) a rejected-then-retried order: resolve and retry attempted twice (early attempts are rejected by the engine)
  const d3 = [
    ...inc.slice(0, 3), { type: "resolveRetry" }, { type: "resolveAlert" },
    ...inc.slice(3, 14), { type: "ackAlert" }, { type: "resolveRetry" }, { type: "resolveRetry" }, R, { type: "resolveAlert" }, { type: "resolveAlert" },
  ];
  [d1, d2, d3].forEach((x, i) => {
    const text = encodeActions(x);
    assert.strictEqual(typeof text, "string", `diverged ${i + 1}`);
    assert.deepStrictEqual(decodeActions(text), x, `diverged ${i + 1}`);
    assert.strictEqual(stepForActions("incident", x), null, `diverged ${i + 1} is not a scripted prefix`);
    Engine.getState("incident", decodeActions(text)); // decodes to something the engine can run
  });
  assert.strictEqual(encodeActions(d1).split(".")[3], "d:dlq-3-2:4");
});

test("an action list containing a discard with a reason outside DISCARD_REASONS is not encodable (null)", () => {
  assert.strictEqual(encodeActions([{ type: "discardRow", dlqId: "dlq-3-4", reason: "unrepairable" }]), null);
  assert.strictEqual(encodeActions([R, { type: "discardRow", dlqId: "dlq-3-4", reason: "unrepairable" }, R]), null);
});

test("encodeActions returns null (never throws) for other unencodable input", () => {
  assert.strictEqual(encodeActions(null), null);
  assert.strictEqual(encodeActions("r"), null);
  assert.strictEqual(encodeActions([{ type: "bogus" }]), null);
  assert.strictEqual(encodeActions([null]), null);
  assert.strictEqual(encodeActions([{ type: "repairRow", dlqId: "dlq 3-4" }]), null);
  assert.strictEqual(encodeActions([{ type: "repairRow", dlqId: "<x>" }]), null);
  assert.strictEqual(encodeActions(Array(1001).fill(R)), null, "would exceed the 2,000 character cap");
});

test("decodeActions rejects invalid input with null", () => {
  [
    "", "x", "r.x", "r..r", ".r", "r.", "R", "r r", "r,r", "rr",
    "d:dlq-3-4:9", "d:dlq-3-4:5", "d:dlq-3-4", "d:dlq-3-4:", "d:dlq-3-4:01", "d:dlq-3-4:-1", "d::0",
    "p:", "p", "p:dlq-3-4:0", "p:dlq 3-4", "p:dlq-3-<", "p:dlq-3-4 ", "p:DLQ-3-4", "p:dlq-3", "p:dlq-1234-1", "p:dlq-1-1234", "p:foo",
    "k:dlq-3-4", "r:dlq-3-4",
    "-.r", "r.-", "--",
    "%72", "r\n", "ré",
    "x".repeat(5000),
    ("r.").repeat(2500).slice(0, 4999),
  ].forEach((t) => assert.strictEqual(decodeActions(t), null, JSON.stringify(t).slice(0, 40)));
  [null, undefined, 5, 0, {}, [], ["r"], true].forEach((t) => assert.strictEqual(decodeActions(t), null));
});

test("length cap: exactly 2,000 valid characters accepted, 2,001 and 5,000 rejected", () => {
  const ok = Array(995).fill("r").concat("p:dlq-1-11").join(".");
  assert.strictEqual(ok.length, 2000);
  const decoded = decodeActions(ok);
  assert.strictEqual(decoded.length, 996);
  assert.deepStrictEqual(decoded[995], { type: "repairRow", dlqId: "dlq-1-11" });
  assert.strictEqual(encodeActions(decoded), ok);
  const over = Array(1001).fill("r").join(".");
  assert.strictEqual(over.length, 2001);
  assert.strictEqual(decodeActions(over), null);
  const big = Array(2500).fill("r").join(".");
  assert.strictEqual(big.length, 4999);
  assert.strictEqual(decodeActions(big + ".r".slice(0, 1)), null);
  assert.strictEqual(decodeActions(big), null);
  assert.strictEqual(decodeActions("r".repeat(5000)), null);
  assert.strictEqual(decodeActions(Array(1000).fill("r").join(".")).length, 1000); // 1,999 characters
});

test("decoded actions are fresh copies", () => {
  const a = decodeActions("r.r"), b = decodeActions("r.r");
  assert.notStrictEqual(a[0], b[0]);
  a[0].type = "x";
  assert.strictEqual(decodeActions("r.r")[0].type, "runBatch");
});

test("stepForActions", () => {
  assert.strictEqual(stepForActions("incident", AUTOPLAY.incident.slice(0, 5)), 5);
  assert.strictEqual(stepForActions("healthy", []), 0);
  assert.strictEqual(stepForActions("healthy", AUTOPLAY.healthy), 4);
  assert.strictEqual(stepForActions("incident", AUTOPLAY.incident), 16);
  assert.strictEqual(stepForActions("incident", AUTOPLAY.incident.slice(0, PRELUDE.incident.length)), 2);
  assert.strictEqual(stepForActions("incident", []), null, "below the prelude is not a step");
  const changed = clone(AUTOPLAY.incident.slice(0, 11));
  changed[10].reason = "Other, see note";
  assert.strictEqual(stepForActions("incident", AUTOPLAY.incident.slice(0, 10).concat([{ type: "discardRow", dlqId: "dlq-3-4", reason: "Other, see note" }])), null);
  assert.strictEqual(stepForActions("incident", changed), null);
  assert.strictEqual(stepForActions("incident", [...AUTOPLAY.incident, R]), null, "longer than the script");
  assert.strictEqual(stepForActions("bogus", []), null);
  assert.strictEqual(stepForActions("healthy", null), null);
  assert.strictEqual(stepForActions("healthy", "r"), null);
  assert.strictEqual(stepForActions("healthy", [null]), null);
});

test("parseLinkParams: scenario, actions, batch", () => {
  assert.deepStrictEqual(parseLinkParams("?scenario=incident&a=r.r.r&batch=2"), { scenario: "incident", step: 0, actions: [R, R, R], batch: 2 });
  assert.deepStrictEqual(parseLinkParams("?scenario=incident&step=3"), { scenario: "incident", step: 3, actions: null, batch: null });
  assert.deepStrictEqual(parseLinkParams(""), { scenario: "healthy", step: 0, actions: null, batch: null });
  assert.strictEqual(parseLinkParams("?batch=abc").batch, null);
  assert.strictEqual(parseLinkParams("?batch=0").batch, null);
  assert.strictEqual(parseLinkParams("?batch=-1").batch, null);
  assert.strictEqual(parseLinkParams("?batch=2.5").batch, null);
  assert.strictEqual(parseLinkParams("?batch=").batch, null);
  assert.strictEqual(parseLinkParams("?batch=99").batch, 99);
  assert.strictEqual(parseLinkParams("?batch=007").batch, 7);
  assert.strictEqual(parseLinkParams("?batch=99999999999999999999999").batch, null, "not a safe integer");
});

test("parseLinkParams: invalid a gives actions null, never throws", () => {
  ["?a=garbage", "?a=", "?a=r.", "?a=r..r", "?a=d:dlq-3-4:9", "?a=%E0%A4%A", "?a=" + "r".repeat(5000), "?a", "?a=-.r"].forEach((s) =>
    assert.strictEqual(parseLinkParams(s).actions, null, s));
  assert.deepStrictEqual(parseLinkParams("?a=-").actions, []);
  assert.deepStrictEqual(parseLinkParams("?a=p%3Adlq-3-4").actions, [{ type: "repairRow", dlqId: "dlq-3-4" }], "percent-encoded colon decodes");
  assert.strictEqual(parseLinkParams("?a=" + Array(1001).fill("r").join(".")).actions, null, "2,001 characters");
  assert.strictEqual(parseLinkParams("?a=" + Array(995).fill("r").concat("p:dlq-1-11").join(".")).actions.length, 996);
  assert.deepStrictEqual(parseLinkParams("?a=" + INCIDENT_LITERAL).actions, AUTOPLAY.incident);
});

test("parseLinkParams: repeated parameters, the first a= and batch= win (even if invalid)", () => {
  assert.strictEqual(parseLinkParams("?a=r&a=r.r").actions.length, 1);
  assert.strictEqual(parseLinkParams("?a=bad&a=r").actions, null);
  assert.strictEqual(parseLinkParams("?batch=2&batch=3").batch, 2);
  assert.strictEqual(parseLinkParams("?batch=abc&batch=3").batch, null);
});
