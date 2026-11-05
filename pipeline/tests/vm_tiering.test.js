'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadPipeline } = require('./helpers/load');

const { Engine, Pipeline, Shared } = loadPipeline();
const vm = Pipeline.viewmodel;
const plain = (x) => JSON.parse(JSON.stringify(x));

const D = { hotToWarmDays: 30, warmToColdDays: 180, retentionDays: 2555, dailyGB: 18 };
const M1 = 'Hot to warm must be a whole number from 1 to 90 days.';
const M2 = 'Warm to cold must be a whole number of days, longer than hot to warm, up to 720.';
const M2b = 'Warm to cold must be longer than hot to warm.';
const M3 = 'Retention must be a whole number of days, at least warm to cold, up to 3650.';
const M4 = 'Daily volume must be a whole number from 1 to 500 GB.';
const money = (n) => '$' + Shared.format.thousands(Math.floor(Number(n.toFixed(2)))) + '.' + n.toFixed(2).split('.')[1];

test('defaults reproduce 78.4% and 93.8% and match the engine', () => {
  const T = plain(vm.tiering(null));
  assert.strictEqual(T.valid, true);
  assert.strictEqual(T.message, '');
  assert.deepStrictEqual(T.inputs, D);
  assert.strictEqual(T.result.headlineText, '78.4% saved versus keeping everything in warm storage');
  assert.strictEqual(T.result.secondaryText, '93.8% saved versus keeping everything in hot storage');
  assert.strictEqual(T.result.label, 'Illustrative figures for comparison, not vendor quotes');
  const e = Engine.tieringCost();
  assert.strictEqual(T.result.headlineText, e.savedVsWarmPct.toFixed(1) + '% saved versus keeping everything in warm storage');
  assert.strictEqual(T.result.secondaryText, e.savedVsHotPct.toFixed(1) + '% saved versus keeping everything in hot storage');
  assert.strictEqual(T.result.monthlyCostText, '$228.30');
  assert.strictEqual(T.result.monthlyCostText, money(e.monthlyCost));
  assert.strictEqual(T.result.allHotText, '$3,679.20');
  assert.strictEqual(T.result.allWarmText, '$1,057.77');
  assert.deepStrictEqual(plain(vm.tiering(D)), T);
});
test('hot 10 changes the cost and equals the engine', () => {
  const T = vm.tiering({ ...D, hotToWarmDays: 10 });
  const e = Engine.tieringCost({ hotToWarmDays: 10 });
  assert.strictEqual(T.valid, true);
  assert.strictEqual(T.result.monthlyCostText, money(e.monthlyCost));
  assert.strictEqual(T.result.monthlyCostText, '$207.78');
  assert.notStrictEqual(T.result.monthlyCostText, vm.tiering(null).result.monthlyCostText);
  assert.strictEqual(T.result.headlineText, e.savedVsWarmPct.toFixed(1) + '% saved versus keeping everything in warm storage');
});
test('string inputs from form fields are parsed', () => {
  const T = vm.tiering({ hotToWarmDays: ' 10 ', warmToColdDays: '180', retentionDays: '2555', dailyGB: '18' });
  assert.strictEqual(T.valid, true);
  assert.deepStrictEqual(plain(T.inputs), { ...D, hotToWarmDays: 10 });
  assert.strictEqual(T.result.monthlyCostText, '$207.78');
});

const prev = vm.tiering({ ...D, hotToWarmDays: 10 });
function bad(over, msg) {
  const T = vm.tiering({ ...D, ...over }, prev);
  assert.strictEqual(T.valid, false, JSON.stringify(over));
  assert.strictEqual(T.message, msg, JSON.stringify(over));
  assert.deepStrictEqual(plain(T.result), plain(prev.result));
}
test('hot to warm: empty, text, negative, zero, 91, NaN, Infinity, decimal', () => {
  ['', '   ', 'abc', -1, 0, 91, NaN, Infinity, 2.5, '1e2', null, undefined, true].forEach((v) => bad({ hotToWarmDays: v }, M1));
});
test('warm to cold: type and range violations use the long message', () => {
  ['', 'abc', NaN, Infinity, 721, 1.5, 0, -5, null].forEach((v) => bad({ warmToColdDays: v }, M2));
});
test('warm to cold not longer than hot to warm uses the ordering message', () => {
  bad({ warmToColdDays: 30 }, M2b);
  bad({ warmToColdDays: 29 }, M2b);
  bad({ hotToWarmDays: 200 }, M1);
  bad({ hotToWarmDays: 90, warmToColdDays: 90 }, M2b);
});
test('retention: type, below warm to cold, above 3650', () => {
  ['', 'x', NaN, Infinity, 3651, 100.5, -1].forEach((v) => bad({ retentionDays: v }, M3));
  bad({ retentionDays: 179 }, M3);
});
test('daily volume: type and limits', () => {
  ['', 'x', NaN, Infinity, 0, -1, 501, 1.5].forEach((v) => bad({ dailyGB: v }, M4));
});
test('invalid input with no previous falls back to the default result; never throws', () => {
  const T = vm.tiering({ ...D, hotToWarmDays: 'abc' });
  assert.strictEqual(T.valid, false);
  assert.deepStrictEqual(plain(T.result), plain(vm.tiering(null).result));
  assert.doesNotThrow(() => vm.tiering(undefined));
  assert.doesNotThrow(() => vm.tiering({}));
  assert.doesNotThrow(() => vm.tiering('junk', null));
  assert.strictEqual(vm.tiering({}).valid, true);
});
test('invalid result keeps the previous result even when previous was invalid itself', () => {
  const T1 = vm.tiering({ ...D, hotToWarmDays: -1 }, prev);
  const T2 = vm.tiering({ ...D, dailyGB: 0 }, T1);
  assert.deepStrictEqual(plain(T2.result), plain(prev.result));
});
test('extremes at the limits are accepted', () => {
  [
    { hotToWarmDays: 1, warmToColdDays: 2, retentionDays: 2, dailyGB: 1 },
    { hotToWarmDays: 90, warmToColdDays: 720, retentionDays: 3650, dailyGB: 500 },
    { hotToWarmDays: 90, warmToColdDays: 91, retentionDays: 91, dailyGB: 500 },
    { hotToWarmDays: 1, warmToColdDays: 720, retentionDays: 720, dailyGB: 18 }
  ].forEach((i) => {
    const T = vm.tiering(i);
    assert.strictEqual(T.valid, true, JSON.stringify(i));
    const e = Engine.tieringCost(i);
    assert.strictEqual(T.result.monthlyCostText, money(e.monthlyCost));
    assert.strictEqual(T.message, '');
  });
});

test('tierBar: defaults, widths sum to 100, days add to retention', () => {
  const B = plain(vm.tierBar(D));
  assert.deepStrictEqual(B.map((b) => [b.tier, b.days]), [['hot', 30], ['warm', 150], ['cold', 2375]]);
  assert.strictEqual(Number(B.reduce((a, b) => a + b.widthPct, 0).toFixed(1)), 100);
  [{ hotToWarmDays: 1, warmToColdDays: 2, retentionDays: 3650, dailyGB: 1 }, { hotToWarmDays: 90, warmToColdDays: 720, retentionDays: 721, dailyGB: 5 }, { hotToWarmDays: 7, warmToColdDays: 13, retentionDays: 17, dailyGB: 5 }]
    .forEach((i) => {
      const b = vm.tierBar(i);
      assert.strictEqual(Number(b.reduce((a, x) => a + x.widthPct, 0).toFixed(1)), 100);
      assert.strictEqual(b.reduce((a, x) => a + x.days, 0), i.retentionDays);
    });
  assert.deepStrictEqual(plain(vm.tierBar(null)), B);
  assert.deepStrictEqual(plain(vm.tierBar({ ...D, hotToWarmDays: 'abc' })), B);
});

test('vendorSubset: four rows, exact shared names and strings', () => {
  const V = plain(vm.vendorSubset());
  assert.deepStrictEqual(V.columns, ['Component', 'Databricks', 'Snowflake', 'Fabric']);
  assert.deepStrictEqual(V.rows.map((r) => r[0]), ['Batch ingestion', 'Landing (Bronze)', 'Cleaning (Silver, Gold)', 'Quality gate']);
  assert.strictEqual(V.rows.length, 4);
  V.rows.forEach((r) => assert.deepStrictEqual(r, plain(Shared.vendor.rows.find((s) => s[0] === r[0]))));
  V.rows[0][0] = 'mutated';
  assert.strictEqual(Shared.vendor.rows[0][0], 'Batch ingestion');
});

test('tierBar grid: widths non-negative, integer tenths sum to exactly 1000, empty cold tier is 0', () => {
  let n = 0;
  for (let hot = 1; hot <= 90; hot += 7) {
    for (let warm = hot + 1; warm <= 720; warm += 53) {
      const rets = [warm];
      for (let r = warm + 301; r <= 3650; r += 301) rets.push(r);
      rets.push(3650);
      rets.forEach((ret) => {
        const inp = { hotToWarmDays: hot, warmToColdDays: warm, retentionDays: ret, dailyGB: 18 };
        const b = vm.tierBar(inp);
        const tenths = b.map((x) => Math.round(x.widthPct * 10));
        const ctx = JSON.stringify(inp);
        b.forEach((x) => assert.ok(x.widthPct >= 0, ctx));
        assert.strictEqual(tenths[0] + tenths[1] + tenths[2], 1000, ctx);
        b.forEach((x, i) => assert.strictEqual(x.widthPct * 10, tenths[i], ctx));
        if (ret === warm) assert.strictEqual(b[2].widthPct, 0, ctx);
        assert.strictEqual(b[0].days + b[1].days + b[2].days, ret);
        n++;
      });
    }
  }
  assert.ok(n > 500);
});
test('tierBar known bad case: hot 1, warm 16, retention 16', () => {
  const b = plain(vm.tierBar({ hotToWarmDays: 1, warmToColdDays: 16, retentionDays: 16, dailyGB: 1 }));
  assert.deepStrictEqual(b.map((x) => x.widthPct), [6.3, 93.7, 0]);
});

test('whole numbers: plain integer text only', () => {
  const ok = (v) => assert.strictEqual(vm.tiering({ ...D, hotToWarmDays: v }).valid, true, JSON.stringify(v));
  const no = (v) => assert.strictEqual(vm.tiering({ ...D, hotToWarmDays: v }).valid, false, JSON.stringify(v));
  ok('08'); ok(' 10 '); ok('0030'); ok(10);
  assert.strictEqual(vm.tiering({ ...D, hotToWarmDays: '08' }).inputs.hotToWarmDays, 8);
  ['+5', '5.', '0x10', '0b11', '1e1', '1e2', '-0', '-5', '5 5', '1_0', '', '.5', '१०'].forEach(no);
  assert.strictEqual(vm.tiering({ ...D, dailyGB: '+5' }).message, M4);
});
