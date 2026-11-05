#!/usr/bin/env node
'use strict';
// Build: node scripts/inline.js [--out <dir>]   (default dist)
// Writes <out>/hq-single.html and <out>/pages/ (index.html, engine.js, src/*).
// ENGINE_PATH env var overrides the engine location (default ..\engine\engine.js).
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function fail(msg) {
  process.stderr.write('build failed: ' + msg + '\n');
  process.exit(1);
}

function parseOut(argv) {
  const i = argv.indexOf('--out');
  if (i >= 0) {
    if (!argv[i + 1]) fail('--out needs a directory');
    return argv[i + 1];
  }
  return 'dist';
}

function attr(attrs, name) {
  const m = new RegExp('(?:^|\\s)' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')', 'i').exec(attrs);
  return m ? (m[1] !== undefined ? m[1] : m[2]) : null;
}
function hasFlag(attrs, name) {
  return new RegExp('(?:^|\\s)' + name + '(?=[\\s/=]|$)', 'i').test(attrs);
}
function stripFlag(tag) {
  return tag.replace(/\s+data-inline(?=[\s/>])/gi, '');
}

const engineFile = process.env.ENGINE_PATH
  ? path.resolve(process.env.ENGINE_PATH)
  : path.join(ROOT, '..', 'engine', 'engine.js');

// Resolve a src/href as written in index.html to a file on disk.
function resolveRef(ref) {
  if (ref === 'engine.js') return engineFile;
  return path.join(ROOT, ref);
}

function readSource(ref) {
  const file = resolveRef(ref);
  if (!fs.existsSync(file)) {
    if (ref === 'engine.js') fail('engine file is missing: ' + file + ' (set ENGINE_PATH to override)');
    fail('source file is missing: ' + file + ' (referenced as ' + ref + ')');
  }
  return { file, buf: fs.readFileSync(file) };
}

const outDir = path.resolve(parseOut(process.argv.slice(2)));
const indexText = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const SCRIPT_RE = /<script\b([^>]*)>\s*<\/script\s*>/gi;
const LINK_RE = /<link\b([^>]*?)\/?>/gi;

// Collect every data-inline reference and read it once.
const refs = [];
indexText.replace(SCRIPT_RE, function (m, a) {
  if (hasFlag(a, 'data-inline') && attr(a, 'src')) refs.push(attr(a, 'src'));
  return m;
});
indexText.replace(LINK_RE, function (m, a) {
  if (hasFlag(a, 'data-inline') && attr(a, 'href')) refs.push(attr(a, 'href'));
  return m;
});

const sources = {};
refs.forEach(function (ref) {
  const s = readSource(ref);
  const text = s.buf.toString('utf8');
  if (/<\/script/i.test(text)) {
    fail(s.file + ' contains "</script" (any case), which would end the inline script early. Remove it from the source.');
  }
  if (/<\/style/i.test(text)) {
    fail(s.file + ' contains "</style" (any case), which would end the inline style early. Remove it from the source.');
  }
  sources[ref] = { file: s.file, buf: s.buf, text };
});

// Single file: replacer functions only, so "$" sequences in source text are never interpreted.
let single = indexText.replace(SCRIPT_RE, function (m, a) {
  if (!hasFlag(a, 'data-inline') || !attr(a, 'src')) return m;
  const text = sources[attr(a, 'src')].text;
  return '<script>' + text + '</script>';
});
single = single.replace(LINK_RE, function (m, a) {
  if (!hasFlag(a, 'data-inline') || !attr(a, 'href')) return m;
  const text = sources[attr(a, 'href')].text;
  return '<style>' + text + '</style>';
});

// Pages form: same markup with the data-inline flag removed.
const pagesIndex = indexText.replace(SCRIPT_RE, function (m) { return stripFlag(m); })
  .replace(LINK_RE, function (m) { return stripFlag(m); });

fs.mkdirSync(path.join(outDir, 'pages', 'src'), { recursive: true });
fs.writeFileSync(path.join(outDir, 'hq-single.html'), single);
fs.writeFileSync(path.join(outDir, 'pages', 'index.html'), pagesIndex);
Object.keys(sources).forEach(function (ref) {
  const dest = path.join(outDir, 'pages', ref);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, sources[ref].buf); // byte-for-byte
});

process.stdout.write('built ' + path.join(outDir, 'hq-single.html') + ' and ' + path.join(outDir, 'pages') + '\n');
