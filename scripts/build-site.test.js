'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const b = require('./build-site.js');

const ROOT = path.join(__dirname, '..');
const page = { dir: 'hq', engineTag: 'engine-v1.5.1', singleFile: 'hq-single.html' };

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'bs-')); }

test('readPages reads and validates pages.json', () => {
  const d = tmp();
  const f = path.join(d, 'pages.json');
  fs.writeFileSync(f, JSON.stringify([page]));
  assert.deepStrictEqual(b.readPages(f), [page]);
  fs.writeFileSync(f, '{}');
  assert.throws(() => b.readPages(f), /pages\.json/);
  fs.writeFileSync(f, JSON.stringify([{ dir: 'hq' }]));
  assert.throws(() => b.readPages(f), /engineTag|singleFile/);
});

test('sameBytes compares buffers', () => {
  assert.strictEqual(b.sameBytes(Buffer.from('abc'), Buffer.from('abc')), true);
  assert.strictEqual(b.sameBytes(Buffer.from('abc'), Buffer.from('abd')), false);
  assert.strictEqual(b.sameBytes(Buffer.from('abc'), Buffer.from('abcd')), false);
});

test('checkEngineCopy passes on identical bytes', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'a'), 'engine');
  fs.writeFileSync(path.join(d, 'b'), 'engine');
  b.checkEngineCopy(page, path.join(d, 'a'), path.join(d, 'b'));
});

test('checkEngineCopy fails on a one-byte difference and names the page', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'a'), 'engine');
  fs.writeFileSync(path.join(d, 'b'), 'enginf');
  assert.throws(() => b.checkEngineCopy(page, path.join(d, 'a'), path.join(d, 'b')),
    (e) => /hq/.test(e.message) && /engine copy/.test(e.message));
});

test('checkEngineCopy fails when the copy is missing', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'b'), 'engine');
  assert.throws(() => b.checkEngineCopy(page, path.join(d, 'nope'), path.join(d, 'b')), /hq.*engine copy/);
});

test('checkSingleFile passes when engine text is inside', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'e'), 'var x = 1;\n');
  fs.writeFileSync(path.join(d, 's.html'), '<script>var x = 1;\n</script>');
  b.checkSingleFile(page, path.join(d, 's.html'), path.join(d, 'e'));
});

test('checkSingleFile fails when engine text is missing', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'e'), 'var x = 1;\n');
  fs.writeFileSync(path.join(d, 's.html'), '<script>var y = 2;</script>');
  assert.throws(() => b.checkSingleFile(page, path.join(d, 's.html'), path.join(d, 'e')),
    (e) => /hq/.test(e.message) && /single file/.test(e.message));
});

test('checkEngineTag passes when the tag blob matches', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'e'), 'engine');
  let asked;
  b.checkEngineTag(page, path.join(d, 'e'), (tag) => { asked = tag; return Buffer.from('engine'); });
  assert.strictEqual(asked, 'engine-v1.5.1');
});

test('checkEngineTag fails when the tag blob differs', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'e'), 'engine');
  assert.throws(() => b.checkEngineTag(page, path.join(d, 'e'), () => Buffer.from('other')),
    (e) => /hq/.test(e.message) && /engine-v1\.5\.1/.test(e.message) && /differs/.test(e.message));
});

test('checkEngineTag fails on a missing tag with the fetch-depth hint', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'e'), 'engine');
  assert.throws(() => b.checkEngineTag(page, path.join(d, 'e'), () => { throw new Error('fatal: invalid object name'); }),
    (e) => /hq/.test(e.message) && /engine-v1\.5\.1/.test(e.message) && /fetch-depth: 0/.test(e.message));
});

test('writeRoot writes index.html with refresh and an empty .nojekyll', () => {
  const d = tmp();
  b.writeRoot(d);
  const html = fs.readFileSync(path.join(d, 'index.html'), 'utf8');
  assert.match(html, /<meta http-equiv="refresh" content="0; url=hq\/">/);
  assert.match(html, /<a href="hq\/">/);
  assert.match(html, /<meta charset="utf-8">/i);
  assert.match(html, /<title>[^<]+<\/title>/);
  assert.strictEqual(fs.readFileSync(path.join(d, '.nojekyll')).length, 0);
});

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}

test('integration: real build into a temp folder', () => {
  const out = path.join(tmp(), 'site');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build-site.js'), '--out', out],
    { cwd: ROOT, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.match(fs.readFileSync(path.join(out, 'index.html'), 'utf8'), /<meta http-equiv="refresh" content="0; url=hq\/">/);
  assert.strictEqual(fs.readFileSync(path.join(out, '.nojekyll')).length, 0);
  assert.ok(fs.existsSync(path.join(out, 'hq', 'index.html')));
  assert.ok(fs.existsSync(path.join(out, 'hq', 'engine.js')));
  assert.ok(fs.existsSync(path.join(out, 'hq', 'hq-single.html')));
  assert.ok(fs.readFileSync(path.join(out, 'hq', 'engine.js')).equals(fs.readFileSync(path.join(ROOT, 'engine', 'engine.js'))));
  const remote = /\b(?:src|href)\s*=\s*["']?\s*https?:\/\//i;
  walk(out).forEach((f) => {
    if (!/\.(html|js|css)$/i.test(f)) return;
    assert.ok(!remote.test(fs.readFileSync(f, 'utf8')), 'remote src/href in ' + f);
  });
});

test('integration: a failed check exits 1 with a message and no stack trace', () => {
  const d = tmp();
  fs.mkdirSync(path.join(d, 'scripts'));
  // Run the CLI against a pages.json naming a tag that does not exist.
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build-site.js'), '--out', path.join(d, 'site')],
    { cwd: ROOT, encoding: 'utf8', env: Object.assign({}, process.env, { PAGES_JSON: path.join(d, 'pages.json') }) });
  // PAGES_JSON points at a missing file: expected failure, exit 1.
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /pages\.json/);
  assert.doesNotMatch(r.stderr, /\n\s+at /);
});

test('checkEngineTag tolerates CRLF vs LF line endings only', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'e'), 'a\r\nb\r\n');
  b.checkEngineTag(page, path.join(d, 'e'), () => Buffer.from('a\nb\n'));
  assert.throws(() => b.checkEngineTag(page, path.join(d, 'e'), () => Buffer.from('a\nc\n')), /differs/);
});
