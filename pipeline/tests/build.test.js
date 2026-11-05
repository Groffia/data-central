'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const ENGINE = path.join(ROOT, '..', 'engine', 'engine.js');
const SCRIPT = path.join(ROOT, 'scripts', 'inline.js');
const SHARED = path.join(ROOT, '..', 'shared');
const engineText = fs.readFileSync(ENGINE, 'utf8');
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'pipebuild-'));
const r = cp.spawnSync(process.execPath, [SCRIPT, '--out', OUT], { cwd: ROOT, encoding: 'utf8' });

test('build succeeds', () => {
  assert.strictEqual(r.status, 0, (r.stdout || '') + (r.stderr || ''));
});

test('pipeline-single.html has the engine and shared files exactly once, no external refs', () => {
  const html = fs.readFileSync(path.join(OUT, 'pipeline-single.html'), 'utf8');
  assert.strictEqual(html.split(engineText).length - 1, 1);
  ['escape.js', 'format.js', 'vendor.js'].forEach(function (n) {
    const t = fs.readFileSync(path.join(SHARED, n), 'utf8');
    assert.strictEqual(html.split(t).length - 1, 1, n);
  });
  assert.ok(!/<script\s+src/i.test(html));
  assert.ok(!/<link/i.test(html));
  assert.ok(!/data-inline/.test(html));
  assert.ok(/<style>[\s\S]*<\/style>/.test(html));
});

test('pages form has engine and shared files byte-for-byte and relative refs', () => {
  const pages = path.join(OUT, 'pages');
  assert.ok(fs.readFileSync(path.join(pages, 'engine.js')).equals(fs.readFileSync(ENGINE)));
  fs.readdirSync(SHARED).filter(function (n) { return /\.js$/.test(n); }).forEach(function (n) {
    assert.ok(fs.readFileSync(path.join(pages, 'shared', n)).equals(fs.readFileSync(path.join(SHARED, n))), n);
  });
  const idx = fs.readFileSync(path.join(pages, 'index.html'), 'utf8');
  assert.ok(idx.indexOf('src="src/main.js"') >= 0);
  assert.ok(!/data-inline/.test(idx));
});

// Runs every inline <script> of a built page in a vm with a tiny DOM; returns the rendered header region.
function runPage(htmlText) {
  const regions = {};
  const metaRe = /<meta[^>]*name="hq-base"[^>]*content="([^"]*)"[^>]*>/i;
  const document = {
    activeElement: null,
    getElementById: function (id) { return regions[id] || (regions[id] = { id: id, innerHTML: '', textContent: '' }); },
    querySelector: function (s) {
      if (s.indexOf('meta') !== 0) return null;
      const m = metaRe.exec(htmlText);
      return m ? { getAttribute: function (k) { return k === 'content' ? m[1] : null; } } : null;
    },
    querySelectorAll: function () { return []; },
    addEventListener: function () {}
  };
  const ctx = vm.createContext({ document, location: { search: '', hash: '' }, window: {}, console });
  htmlText.replace(/<script>([\s\S]*?)<\/script>/g, function (m, code) { vm.runInContext(code, ctx); return m; });
  return regions['region-header'].innerHTML;
}

test('single file has no hq-base meta; pages index.html has it', () => {
  const single = fs.readFileSync(path.join(OUT, 'pipeline-single.html'), 'utf8');
  const pages = fs.readFileSync(path.join(OUT, 'pages', 'index.html'), 'utf8');
  assert.ok(!/<meta[^>]*hq-base/i.test(single), 'no hq-base meta tag (main.js still names it in its lookup)');
  assert.ok(/<meta name="hq-base" content="\.\.\/hq\/">/.test(pages));
  assert.ok(single.indexOf('<meta charset="utf-8">') >= 0 && single.indexOf('name="viewport"') >= 0, 'other metas kept');
});

test('running the single file gives no HQ link; the pages form gives the relative link', () => {
  const single = fs.readFileSync(path.join(OUT, 'pipeline-single.html'), 'utf8');
  const header = runPage(single);
  assert.ok(header.indexOf('Pipeline: Under the Hood') >= 0);
  assert.ok(header.indexOf('Open this state in HQ') < 0);
  assert.ok(!/class="hq-link"/.test(header));
  // The pages form loads scripts by src; inline them here in index.html order to run it.
  const pages = path.join(OUT, 'pages');
  let idx = fs.readFileSync(path.join(pages, 'index.html'), 'utf8');
  idx = idx.replace(/<script\s+src="([^"]+)"><\/script>/g, function (m, src) {
    return '<script>' + fs.readFileSync(path.join(pages, src), 'utf8') + '</script>';
  });
  const pagesHeader = runPage(idx);
  assert.ok(/<a class="hq-link" href="\.\.\/hq\/\?scenario=healthy&amp;step=1">Open this state in HQ<\/a>/.test(pagesHeader), pagesHeader);
});
