const test = require("node:test");
const assert = require("node:assert");
const Engine = require("../engine.js");

const CODES = ["8867-4", "8480-6", "59408-5", "8310-5"];
const contract = Engine.getContract();
const GOLDEN = contract.goldenRows;
const pool = Engine.buildPatientPool();

test("pool: size, unique ids, id pattern, golden first", () => {
  assert.strictEqual(pool.length, 40);
  const ids = pool.map((p) => p.patient_id);
  assert.strictEqual(new Set(ids).size, 40);
  ids.forEach((id) => assert.match(id, /^SGH-P-\d{6}$/));
  GOLDEN.forEach((g, i) => assert.strictEqual(pool[i].patient_id, g.patient_id));
});

test("pool: names have no digits, zips are 5 digits, ages 18-95, one is 90+", () => {
  pool.slice(5).forEach((p) => {
    assert.doesNotMatch(p.patient_name, /\d/);
    assert.match(p.patient_name, /^\S+ \S+$/);
    assert.match(p.patient_zip5, /^\d{5}$/);
    assert.match(p.birth_date, /^\d{4}-\d{2}-\d{2}$/);
  });
  const ref = "2026-11-03";
  const age = (b) => {
    const y = +b.slice(0, 4);
    return 2026 - y - (b.slice(5) > ref.slice(5) ? 1 : 0);
  };
  const ages = pool.slice(5).map((p) => age(p.birth_date));
  ages.forEach((a) => assert.ok(a >= 18 && a <= 95, "age " + a));
  assert.ok(ages.some((a) => a >= 90));
});

test("pool: deterministic", () => {
  assert.deepStrictEqual(Engine.buildPatientPool(), pool);
});

test("exportRunEpoch", () => {
  assert.strictEqual(Engine.exportRunEpoch(1), Engine.BASE_EPOCH + 1800);
  assert.strictEqual(Engine.exportRunEpoch(3), Engine.BASE_EPOCH + 1800 + 1800);
});

const idx = (row) => pool.findIndex((p) => p.patient_id === row.patient_id);

test("export 1: golden rows, 20 rows, patients 1-20, timing", () => {
  const e = Engine.generateExport(1, "healthy");
  assert.strictEqual(e.n, 1);
  assert.strictEqual(e.runEpoch, Engine.BASE_EPOCH + 1800);
  assert.strictEqual(e.rows.length, 20);
  assert.deepStrictEqual(e.rows.slice(0, 5), GOLDEN);
  assert.deepStrictEqual(e.rows.map(idx), [...Array(20).keys()]);
  let prev = 0;
  e.rows.slice(5).forEach((r) => {
    assert.ok(r.encounter_epoch >= 1793715600 && r.encounter_epoch <= 1793716200);
    assert.ok(r.encounter_epoch >= prev);
    prev = r.encounter_epoch;
  });
});

test("rotation: export 2 is 21-40, export 3 is 1-20 again", () => {
  assert.deepStrictEqual(Engine.generateExport(2, "healthy").rows.map(idx), [...Array(20).keys()].map((i) => i + 20));
  assert.deepStrictEqual(Engine.generateExport(3, "healthy").rows.map(idx), [...Array(20).keys()]);
});

test("export k>=2 timing covers the 15 minutes before the run", () => {
  [2, 3, 8].forEach((n) => {
    const e = Engine.generateExport(n, "healthy");
    e.rows.forEach((r) => assert.ok(r.encounter_epoch >= e.runEpoch - 900 && r.encounter_epoch <= e.runEpoch));
  });
});

test("golden vital_sequence and code cycle", () => {
  const e1 = Engine.generateExport(1, "healthy").rows;
  const e3 = Engine.generateExport(3, "healthy").rows;
  for (let i = 0; i < 5; i++) {
    assert.strictEqual(e1[i].vital_sequence, 1);
    assert.strictEqual(e3[i].vital_sequence, 2);
    assert.strictEqual(e3[i].vital_code, CODES[(CODES.indexOf(GOLDEN[i].vital_code) + 1) % 4]);
  }
  assert.deepStrictEqual(e3.slice(0, 5).map((r) => r.vital_code), ["8480-6", "59408-5", "8310-5", "8867-4", "8480-6"]);
});

test("generated patients start at code index i mod 4", () => {
  const e2 = Engine.generateExport(2, "healthy").rows;
  e2.forEach((r, k) => assert.strictEqual(r.vital_code, CODES[(k + 20) % 4]));
  const e1 = Engine.generateExport(1, "healthy").rows;
  for (let i = 5; i < 20; i++) assert.strictEqual(e1[i].vital_code, CODES[i % 4]);
});

test("exports 1-8 conform to contract; keys unique", () => {
  const seen = new Set();
  for (let n = 1; n <= 8; n++) {
    Engine.generateExport(n, "healthy").rows.forEach((r) => {
      assert.deepStrictEqual(Object.keys(r), contract.fields.map((f) => f.name));
      assert.match(r.patient_id, /^SGH-P-\d{6}$/);
      assert.match(r.patient_zip5, /^\d{5}$/);
      assert.match(r.birth_date, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(Number.isInteger(r.encounter_epoch));
      assert.ok(Number.isInteger(r.vital_sequence) && r.vital_sequence >= 1);
      const vc = contract.vitalCodes.find((c) => c.code === r.vital_code);
      assert.ok(vc);
      assert.strictEqual(r.unit, vc.unit);
      assert.ok(r.vital_value >= vc.min && r.vital_value <= vc.max, r.vital_code + " " + r.vital_value);
      assert.strictEqual(r.vital_value, Engine.round(r.vital_value, 1));
      assert.ok(["TLS_AES_256_GCM_SHA384", "TLS_CHACHA20_POLY1305_SHA256"].includes(r.cipher_suite));
      const key = r.patient_id + "|" + r.vital_sequence;
      assert.ok(!seen.has(key), key);
      seen.add(key);
    });
  }
});

test("pure: same n twice equal, independent of earlier exports, n=9 works", () => {
  const a = Engine.generateExport(5, "healthy");
  Engine.generateExport(1, "healthy");
  assert.deepStrictEqual(Engine.generateExport(5, "healthy"), a);
  const e9 = Engine.generateExport(9, "healthy");
  assert.strictEqual(e9.rows.length, 20);
  assert.strictEqual(e9.rows[0].vital_sequence, 5);
});
