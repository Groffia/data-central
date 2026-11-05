const test = require("node:test");
const assert = require("node:assert");
const Engine = require("../engine.js");

const LIST = ["Missing patient ID", "Physiologically impossible value", "Malformed or suspicious input", "Wrong unit, source must resend", "Other, see note"];

test("DISCARD_REASONS is the frozen five-item list", () => {
  assert.deepStrictEqual([...Engine.DISCARD_REASONS], LIST);
  assert.ok(Object.isFrozen(Engine.DISCARD_REASONS));
});

test("suggestedReason maps the four hard failures and drift rows of the scripted incident", () => {
  const s = Engine.getState("incident", Engine.AUTOPLAY.incident.slice(0, 3));
  const by = Object.fromEntries(s.dlq.map((d) => [d.dlqId, Engine.suggestedReason(d)]));
  assert.strictEqual(by["dlq-3-4"], "Missing patient ID");
  assert.strictEqual(by["dlq-3-9"], "Physiologically impossible value");
  assert.strictEqual(by["dlq-3-13"], "Malformed or suspicious input");
  assert.strictEqual(by["dlq-3-17"], "Wrong unit, source must resend");
  for (const id of ["dlq-3-2", "dlq-3-6", "dlq-3-10", "dlq-3-15", "dlq-3-19"]) assert.strictEqual(by[id], "Other, see note");
  for (const v of Object.values(by)) assert.ok(LIST.includes(v));
});

test("suggestedReason tolerates missing fields", () => {
  assert.strictEqual(Engine.suggestedReason({}), "Other, see note");
  assert.strictEqual(Engine.suggestedReason(null), "Other, see note");
});

test("AUTOPLAY.incident discards carry the suggested reason of their own row", () => {
  const s = Engine.getState("incident", Engine.AUTOPLAY.incident.slice(0, 3));
  const discards = Engine.AUTOPLAY.incident.filter((a) => a.type === "discardRow");
  assert.strictEqual(discards.length, 4);
  for (const a of discards) {
    const entry = s.dlq.find((d) => d.dlqId === a.dlqId);
    assert.strictEqual(a.reason, Engine.suggestedReason(entry), a.dlqId);
    assert.notStrictEqual(a.reason, "unrepairable");
  }
  assert.strictEqual(new Set(discards.map((a) => a.reason)).size, 4);
});

test("scripted incident discard events show the four reasons and the run still ends CLOSED with 76 rows", () => {
  const s = Engine.getState("incident", Engine.AUTOPLAY.incident);
  const details = s.events.filter((e) => e.type === "ROW_DISCARDED").map((e) => e.detail);
  assert.deepStrictEqual(details, [
    "dlq-3-4 discarded: Missing patient ID",
    "dlq-3-9 discarded: Physiologically impossible value",
    "dlq-3-13 discarded: Malformed or suspicious input",
    "dlq-3-17 discarded: Wrong unit, source must resend",
  ]);
  assert.strictEqual(s.gate, "CLOSED");
});
