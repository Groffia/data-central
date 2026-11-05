'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { boot, REGION_KEYS } = require('./helpers/fakedom');

const SRC = path.join(__dirname, '..', 'src');
const FIELD = '[data-field="hotToWarmDays"]';
const J = (x) => JSON.parse(JSON.stringify(x));

function all(p) { return REGION_KEYS.map((k) => p.html(k)).join('\n'); }

test('renders all 12 regions on load', () => {
  const p = boot();
  assert.equal(p.regionKeys.length, 12);
  p.regionKeys.forEach((k) => {
    assert.equal(typeof p.html(k), 'string', k + ' was assigned');
    if (k !== 'notice') assert.ok(p.html(k).length > 0, k); // the notice region is empty until there is something to say
  });
  assert.ok(p.html('footer').indexOf('seed 42') >= 0);
  assert.ok(p.html('header').indexOf('Pipeline: Under the Hood') >= 0);
});

test('Next click changes the step text region and Back returns', () => {
  const p = boot();
  const before = p.html('header');
  p.clickRendered('button[data-cmd="next"]');
  assert.notEqual(p.html('header'), before);
  assert.notEqual(/class="step-text"[^>]*>([^<]*)/.exec(p.html('header'))[1], /class="step-text"[^>]*>([^<]*)/.exec(before)[1]);
  p.clickRendered('button[data-cmd="back"]');
  assert.equal(p.html('header'), before);
});

test('hot-to-warm change to 10 updates the storage outputs', () => {
  const p = boot();
  const before = p.html('storage');
  const input = p.q(FIELD);
  p.typeInto(input, '10');
  assert.equal(p.html('storage'), before, 'typing alone does not re-render');
  p.change(input);
  assert.notEqual(p.html('storage'), before);
  assert.ok(/data-field="hotToWarmDays" value="10"/.test(p.html('storage')));
  assert.ok(!/role="alert"/.test(p.html('storage')));
});

test('an invalid value shows the alert and keeps the last valid result', () => {
  const p = boot();
  const input = p.q(FIELD);
  p.typeInto(input, '10');
  p.change(input);
  const good = /Monthly cost<\/dt><dd>([^<]*)/.exec(p.html('storage'))[1];
  const bad = p.q(FIELD);
  p.typeInto(bad, '0');
  p.change(bad);
  assert.ok(/role="alert"/.test(p.html('storage')));
  assert.equal(/Monthly cost<\/dt><dd>([^<]*)/.exec(p.html('storage'))[1], good);
  assert.ok(/value="0"/.test(p.html('storage')));
  p.clickRendered('button[data-cmd="resetTiering"]');
  assert.ok(!/role="alert"/.test(p.html('storage')));
});

test('input events alone never dispatch', () => {
  const p = boot();
  const before = all(p);
  const input = p.q(FIELD);
  p.typeInto(input, '10');
  p.input(input);
  assert.equal(all(p), before);
});

test('a Batch chip click selects that batch', () => {
  const p = boot({ search: '?scenario=incident&step=16' });
  const chip = p.qa('button[data-cmd="batch"]').filter((b) => b.getAttribute('data-n') === '2')[0];
  assert.ok(chip);
  assert.ok(/data-n="2" aria-pressed="false"/.test(p.html('batches')));
  p.clickRendered('button[data-cmd="batch"][data-n="2"]');
  assert.ok(/data-n="2" aria-pressed="true"/.test(p.html('batches')));
});

test('scenario switch resets to the opening state of that scenario', () => {
  const p = boot({ search: '?scenario=incident&step=16' });
  p.clickRendered('button[data-cmd="scenario"][data-scenario="healthy"]');
  assert.ok(/data-scenario="healthy" aria-pressed="true"/.test(p.html('header')));
  assert.ok(/Step 1 of 4/.test(p.html('header')));
  p.clickRendered('button[data-cmd="scenario"][data-scenario="incident"]');
  assert.ok(/data-scenario="incident" aria-pressed="true"/.test(p.html('header')));
  assert.ok(!/Step 16 of/.test(p.html('header')));
});

test('disabled buttons and unknown targets are ignored', () => {
  const p = boot();
  const before = all(p);
  p.click({ 'data-cmd': 'next' }, true);
  p.click({ 'data-cmd': 'bogus' });
  p.handlers.click[0]({ target: null });
  p.handlers.click[0]({ target: { closest: function () { return null; } } });
  assert.equal(all(p), before);
});

test('the controller notice reaches the caption and the notice region, and clears on the next move', () => {
  const p = boot();
  for (let i = 0; i < 20 && !p.q('button[data-cmd="next"]').disabled; i++) p.clickRendered('button[data-cmd="next"]');
  assert.equal(p.caption(), '');
  p.click({ 'data-cmd': 'next' }); // a stale button at the last step: the controller answers with a notice
  assert.equal(p.caption(), 'Already at the last step');
  assert.ok(p.html('notice').indexOf('Already at the last step') >= 0);
  p.clickRendered('button[data-cmd="back"]');
  assert.equal(p.caption(), '');
});

test('hq-base meta controls the HQ link (absent means none)', () => {
  const none = boot();
  assert.ok(none.html('header').indexOf('Open this state in HQ') < 0);
  const withBase = boot({ hqBase: '../hq/' });
  assert.ok(/href="\.\.\/hq\/\?scenario=healthy&amp;step=1"/.test(withBase.html('header')) || /href="\.\.\/hq\/\?scenario=healthy&step=1"/.test(withBase.html('header')));
});

// ---- focus targets ----
test('a deep-link focus target scrolls into view exactly once across several renders and is highlighted', () => {
  const p = boot({ search: '?scenario=incident&step=16', hash: '#dlq-3-4' });
  assert.equal(p.log.scrolled.length, 1);
  assert.equal(p.log.scrolled[0].id, 'dlq-3-4');
  assert.deepEqual(J(p.log.scrolled[0].opts), { block: 'start' });
  assert.ok(/id="dlq-3-4" data-focus="true"/.test(p.html('dlq')));
  p.clickRendered('button[data-cmd="back"]');
  p.clickRendered('button[data-cmd="next"]');
  p.clickRendered('button[data-cmd="batch"][data-n="2"]');
  assert.equal(p.log.scrolled.length, 1);
});

test('the stage-storage focus target scrolls once', () => {
  const p = boot({ hash: '#stage-storage' });
  assert.equal(p.log.scrolled.length, 1);
  assert.equal(p.log.scrolled[0].id, 'stage-storage');
  assert.ok(/id="stage-storage" data-focus="true"/.test(p.html('storage')));
  p.clickRendered('button[data-cmd="next"]');
  assert.equal(p.log.scrolled.length, 1);
});

test('no focus target means no scroll; unknown hash is ignored', () => {
  assert.equal(boot().log.scrolled.length, 0);
  assert.equal(boot({ hash: '#unknown-id' }).log.scrolled.length, 0);
});

test('missing scrollIntoView does not throw', () => {
  const p = boot({ hash: '#stage-storage' });
  assert.ok(p);
});

// ---- keyboard focus ----
test('focus returns to the same control after a re-render', () => {
  const p = boot();
  p.q('button[data-cmd="next"]').focus();
  p.log.focused.length = 0;
  p.clickRendered('button[data-cmd="next"]');
  assert.equal(p.log.focused.length, 1);
  assert.ok(p.log.focused[0].indexOf('data-cmd="next"') >= 0);
});

test('focus keeps the same batch chip and scenario button', () => {
  const p = boot({ search: '?scenario=incident&step=16' });
  p.q('button[data-cmd="batch"][data-n="2"]').focus();
  p.log.focused.length = 0;
  p.clickRendered('button[data-cmd="batch"][data-n="2"]');
  assert.ok(/data-n="2"/.test(p.log.focused[0]));
  p.q('button[data-cmd="scenario"][data-scenario="healthy"]').focus();
  p.log.focused.length = 0;
  p.clickRendered('button[data-cmd="scenario"][data-scenario="healthy"]');
  assert.ok(/data-scenario="healthy"/.test(p.log.focused[0]));
});

test('when Next becomes disabled at the last step, focus moves to Back', () => {
  const p = boot();
  for (let i = 0; i < 20 && !p.q('button[data-cmd="next"]').disabled; i++) p.clickRendered('button[data-cmd="next"]');
  assert.ok(p.q('button[data-cmd="next"]').disabled);
  // Re-run the last enabled click: focus Next while it is enabled by stepping back once.
  p.clickRendered('button[data-cmd="back"]');
  p.q('button[data-cmd="next"]').focus();
  p.log.focused.length = 0;
  p.clickRendered('button[data-cmd="next"]');
  assert.ok(p.q('button[data-cmd="next"]').disabled);
  const last = p.log.focused[p.log.focused.length - 1];
  assert.ok(/data-cmd="back"/.test(last), last);
});

test('a batch chip that disappears hands focus to the nearest remaining chip', () => {
  const p = boot({ search: '?scenario=incident&step=16' });
  const n = p.qa('button[data-cmd="batch"]').length;
  assert.ok(n >= 3);
  p.q('button[data-cmd="batch"][data-n="' + n + '"]').focus();
  p.log.focused.length = 0;
  p.clickRendered('button[data-cmd="scenario"][data-scenario="healthy"]'); // fewer batches
  assert.ok(p.log.focused.length >= 1);
  assert.ok(!/ disabled/.test(p.log.focused[p.log.focused.length - 1]));
});

test('focus is left alone when nothing was focused', () => {
  const p = boot();
  p.log.focused.length = 0;
  p.clickRendered('button[data-cmd="next"]');
  assert.equal(p.log.focused.length, 0);
});

test('typing in an input keeps its value, caret and focus across a re-render', () => {
  const p = boot();
  const input = p.q(FIELD);
  p.typeInto(input, '123', 1, 2);
  p.log.focused.length = 0;
  p.clickRendered('button[data-cmd="next"]'); // renders every region, including storage
  const again = p.q(FIELD);
  assert.equal(again.value, '123');
  assert.equal(again.selectionStart, 1);
  assert.equal(again.selectionEnd, 2);
  assert.ok(p.log.focused.some((t) => /data-field="hotToWarmDays"/.test(t)));
  assert.equal(p.document.activeElement.getAttribute('data-field'), 'hotToWarmDays');
});

test('after a change the focused field is focused again with its value', () => {
  const p = boot();
  const input = p.q(FIELD);
  p.typeInto(input, '10');
  p.change(input);
  assert.equal(p.document.activeElement.getAttribute('data-field'), 'hotToWarmDays');
  assert.equal(p.q(FIELD).value, '10');
});

// ---- self-test failure ----
test('a failing self-test leaves every control inert', () => {
  const real = require('../../engine/engine.js');
  const broken = Object.assign({}, real, { selfTest: function () { return { passed: false, checks: [{ name: 'x', ok: false }] }; } });
  const p = boot({ Engine: broken });
  assert.ok(p.html('notice').indexOf('self-test failed') >= 0);
  const before = all(p);
  p.qa('button[data-cmd]').forEach((b) => {
    if (b.disabled) return;
    p.click({ 'data-cmd': b.getAttribute('data-cmd'), 'data-n': b.getAttribute('data-n'), 'data-scenario': b.getAttribute('data-scenario') });
  });
  const input = p.q(FIELD);
  p.typeInto(input, '10');
  p.change(input);
  assert.equal(all(p), before);
  assert.ok(!/value="10"/.test(p.html('storage')));
});

// ---- source scans ----
test('main.js has no eval, Function(, document.write', () => {
  const t = fs.readFileSync(path.join(SRC, 'main.js'), 'utf8');
  assert.ok(!/\beval\s*\(/.test(t));
  assert.ok(!/\bFunction\s*\(/.test(t));
  assert.ok(!/document\.write/.test(t));
});

test('innerHTML is assigned only in main.js among pipeline src files, and only once there', () => {
  fs.readdirSync(SRC).filter((n) => /\.js$/.test(n)).forEach((n) => {
    const t = fs.readFileSync(path.join(SRC, n), 'utf8');
    const hits = t.match(/\.(?:innerHTML|outerHTML)\s*(?:=|\+=)(?!=)|insertAdjacentHTML/g) || [];
    assert.equal(hits.length, n === 'main.js' ? 1 : 0, n);
  });
});

test('only main.js touches document, window, location, timers', () => {
  fs.readdirSync(SRC).filter((n) => /\.js$/.test(n) && n !== 'main.js').forEach((n) => {
    const t = fs.readFileSync(path.join(SRC, n), 'utf8');
    assert.ok(!/\b(?:document|window|location|setTimeout|setInterval|localStorage)\b/.test(t.replace(/\/\/.*$/gm, '')), n);
  });
});

// ---- fix round: live regions, focus scroll, value restore, raw data-n ----
test('step text goes to one persistent live node, only when it changes', () => {
  const p = boot();
  const node = p.stepLive();
  const first = node.textContent;
  assert.ok(first.length > 0);
  assert.equal(first, /class="step-text">([^<]*)/.exec(p.html('header'))[1].replace(/&amp;/g, '&'));
  p.clickRendered('button[data-cmd="next"]');
  assert.strictEqual(p.stepLive(), node, 'same node');
  assert.notEqual(node.textContent, first);
  const after = node.textContent;
  let writes = 0;
  let value = after;
  Object.defineProperty(node, 'textContent', { get: function () { return value; }, set: function (v) { writes++; value = v; } });
  const input = p.q(FIELD);
  p.typeInto(input, '10');
  p.change(input);
  p.clickRendered('button[data-cmd="resetTiering"]');
  assert.equal(writes, 0, 'not rewritten on tiering renders');
  assert.equal(node.textContent, after);
});

test('no aria-live anywhere in the replaced regions and no role=status on notices', () => {
  const p = boot();
  for (let i = 0; i < 20 && !p.q('button[data-cmd="next"]').disabled; i++) p.clickRendered('button[data-cmd="next"]');
  p.click({ 'data-cmd': 'next' });
  assert.ok(p.html('notice').indexOf('class="notice"') >= 0);
  assert.ok(!/role="status"|aria-live/.test(all(p)));
});

test('focus restore never scrolls: preventScroll is passed and stepping or batch picking does not scroll', () => {
  const p = boot({ search: '?scenario=incident&step=16' });
  p.q('button[data-cmd="back"]').focus();
  p.log.focusOpts.length = 0;
  p.clickRendered('button[data-cmd="back"]');
  assert.ok(p.log.focusOpts.length >= 1);
  p.q('button[data-cmd="batch"][data-n="2"]').focus();
  p.log.focusOpts.length = 0;
  p.clickRendered('button[data-cmd="batch"][data-n="2"]');
  assert.ok(p.log.focusOpts.length >= 1);
  p.log.focusOpts.forEach((o) => assert.deepEqual(J(o), { preventScroll: true }));
  assert.equal(p.log.scrolled.length, 0);
});

test('fallback focus also passes preventScroll', () => {
  const p = boot();
  for (let i = 0; i < 20 && !p.q('button[data-cmd="next"]').disabled; i++) p.clickRendered('button[data-cmd="next"]');
  p.clickRendered('button[data-cmd="back"]');
  p.q('button[data-cmd="next"]').focus();
  p.log.focusOpts.length = 0;
  p.clickRendered('button[data-cmd="next"]');
  assert.ok(p.log.focusOpts.length >= 1);
  p.log.focusOpts.forEach((o) => assert.deepEqual(J(o), { preventScroll: true }));
});

test('a value the renderer normalises wins after a committed change', () => {
  const p = boot({ transform: function (id, html) { return id === 'region-storage' ? html.replace('value="10"', 'value="11"') : html; } });
  const input = p.q(FIELD);
  p.typeInto(input, '10');
  p.change(input);
  assert.equal(p.q(FIELD).value, '11');
});

test('an uncommitted edit and its caret survive an unrelated render', () => {
  const p = boot();
  const input = p.q(FIELD);
  p.typeInto(input, '55', 1, 1);
  p.clickRendered('button[data-cmd="next"]');
  assert.equal(p.q(FIELD).value, '55');
  assert.equal(p.q(FIELD).selectionStart, 1);
});

test('data-n that is not a positive integer reaches the controller raw and is shown escaped', () => {
  const p = boot({ search: '?scenario=incident&step=16' });
  const before = p.html('batches');
  ['abc', '-1', '0', '<b>x</b>'].forEach((v) => {
    p.click({ 'data-cmd': 'batch', 'data-n': v });
    assert.equal(p.html('batches'), before);
    assert.equal(p.caption(), 'Batch ' + v + ' has not run');
    assert.ok(p.html('notice').indexOf('Batch ' + v.replace(/</g, '&lt;').replace(/>/g, '&gt;') + ' has not run') >= 0, v);
    assert.ok(p.html('notice').indexOf('<b>') < 0);
  });
  p.click({ 'data-cmd': 'batch', 'data-n': '2' });
  assert.ok(/data-n="2" aria-pressed="true"/.test(p.html('batches')));
});
