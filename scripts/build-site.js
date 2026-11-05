#!/usr/bin/env node
'use strict';
// Build the static site: node scripts/build-site.js [--out site]
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const ENGINE = path.join(ROOT, 'engine', 'engine.js');
const SHARED = path.join(ROOT, 'shared');

class BuildError extends Error {}

function readPages(file) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new BuildError('cannot read pages.json (' + file + '): ' + e.message);
  }
  if (!Array.isArray(data) || data.length === 0) throw new BuildError('pages.json must be a non-empty array: ' + file);
  data.forEach(function (p, i) {
    ['dir', 'engineTag'].forEach(function (k) {
      if (!p || typeof p[k] !== 'string' || !p[k]) throw new BuildError('pages.json entry ' + i + ' is missing "' + k + '"');
    });
  });
  return data;
}

function sameBytes(a, b) {
  return a.length === b.length && a.equals(b);
}

function checkEngineCopy(page, copyPath, enginePath) {
  let copy, engine;
  try {
    copy = fs.readFileSync(copyPath);
    engine = fs.readFileSync(enginePath);
  } catch (e) {
    throw new BuildError('page "' + page.dir + '": engine copy check failed: ' + e.message);
  }
  if (!sameBytes(copy, engine)) {
    throw new BuildError('page "' + page.dir + '": engine copy check failed: ' + copyPath + ' is not byte-identical to ' + enginePath);
  }
}

// Every shared/*.js in the repo must be present, byte-identical, in the page's built site folder (<dest>/shared/).
function checkSharedCopies(page, destDir, sharedDir) {
  let names;
  try {
    names = fs.readdirSync(sharedDir).filter(function (n) { return /\.js$/.test(n); }).sort();
  } catch (e) {
    throw new BuildError('page "' + page.dir + '": shared check failed: ' + e.message);
  }
  if (names.length === 0) throw new BuildError('page "' + page.dir + '": shared check failed: no shared/*.js files in ' + sharedDir);
  names.forEach(function (n) {
    const built = path.join(destDir, 'shared', n);
    let copy;
    try {
      copy = fs.readFileSync(built);
    } catch (e) {
      throw new BuildError('page "' + page.dir + '": shared check failed: ' + built + ' is missing');
    }
    if (!sameBytes(copy, fs.readFileSync(path.join(sharedDir, n)))) {
      throw new BuildError('page "' + page.dir + '": shared check failed: ' + built + ' is not byte-identical to ' + path.join(sharedDir, n));
    }
  });
}

function checkSingleFile(page, singlePath, enginePath) {
  let single, engine;
  try {
    single = fs.readFileSync(singlePath, 'utf8');
    engine = fs.readFileSync(enginePath, 'utf8');
  } catch (e) {
    throw new BuildError('page "' + page.dir + '": single file check failed: ' + e.message);
  }
  if (!single.includes(engine)) {
    throw new BuildError('page "' + page.dir + '": single file check failed: ' + singlePath + ' does not contain the full text of ' + enginePath);
  }
}

function defaultGitShow(tag) {
  return execFileSync('git', ['show', tag + ':engine/engine.js'],
    { cwd: ROOT, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

function lf(buf) {
  return Buffer.from(buf.toString('latin1').split('\r\n').join('\n'), 'latin1');
}

function checkEngineTag(page, enginePath, gitShow) {
  gitShow = gitShow || defaultGitShow;
  let blob;
  try {
    blob = gitShow(page.engineTag);
  } catch (e) {
    throw new BuildError('page "' + page.dir + '": engine tag check failed: cannot read engine/engine.js at tag ' + page.engineTag +
      '. The tag may be missing. CI needs a full clone with tags (fetch-depth: 0).');
  }
  // Git on Windows may check files out with CRLF (core.autocrlf); the blob is LF. Compare modulo line endings only.
  if (!sameBytes(lf(blob), lf(fs.readFileSync(enginePath)))) {
    throw new BuildError('page "' + page.dir + '": engine tag check failed: engine/engine.js differs from the one at tag ' + page.engineTag);
  }
}

function writeRoot(out) {
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'index.html'),
    '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
    '<meta http-equiv="refresh" content="0; url=hq/">\n' +
    '<title>Data Central</title>\n</head>\n<body>\n<p><a href="hq/">Open the HQ page</a></p>\n</body>\n</html>\n');
  fs.writeFileSync(path.join(out, '.nojekyll'), '');
}

function buildPage(page, out) {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'inline.js'), page.dir, '--out', path.join(page.dir, 'dist')],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  const dist = path.join(ROOT, page.dir, 'dist');
  const dest = path.join(out, page.dir);
  fs.cpSync(path.join(dist, 'pages'), dest, { recursive: true });
  // The single file is named after the page folder (<dir>-single.html), as the shared inliner and release.yml expect.
  const single = page.dir + '-single.html';
  fs.copyFileSync(path.join(dist, single), path.join(dest, single));
  checkEngineCopy(page, path.join(dest, 'engine.js'), ENGINE);
  checkSharedCopies(page, dest, SHARED);
  checkSingleFile(page, path.join(dest, single), ENGINE);
  checkEngineTag(page, ENGINE);
}

function main(argv) {
  const i = argv.indexOf('--out');
  const out = path.resolve(ROOT, i >= 0 && argv[i + 1] ? argv[i + 1] : 'site');
  try {
    const pages = readPages(process.env.PAGES_JSON || path.join(ROOT, 'pages.json'));
    fs.rmSync(out, { recursive: true, force: true });
    pages.forEach(function (p) {
      try {
        buildPage(p, out);
      } catch (e) {
        if (e instanceof BuildError) throw e;
        const detail = (e.stderr && e.stderr.toString().trim()) || e.message;
        throw new BuildError('page "' + p.dir + '": inline build failed: ' + detail);
      }
    });
    writeRoot(out);
    process.stdout.write('site built in ' + out + '\n');
  } catch (e) {
    if (!(e instanceof BuildError)) throw e;
    process.stderr.write('build-site failed: ' + e.message + '\n');
    process.exit(1);
  }
}

module.exports = { BuildError, readPages, sameBytes, checkEngineCopy, checkSharedCopies, checkSingleFile, checkEngineTag, writeRoot };

if (require.main === module) main(process.argv.slice(2));
