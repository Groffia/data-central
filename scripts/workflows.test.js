'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '..', '.github', 'workflows');
const read = (n) => fs.readFileSync(path.join(dir, n), 'utf8').replace(/\r\n/g, '\n');
const T_ENGINE = 'cd engine && node --test tests/';
const T_SHARED = 'node --test shared/tests/';
const T_HQ = 'cd hq && node --test tests/';
const T_PIPELINE = 'cd pipeline && node --test tests/';
const T_SCRIPTS = 'node --test scripts/';
const BUILD = 'node scripts/build-site.js';

// Slice of the text from a top-level key line (e.g. "  build:") to the next job key.
function job(text, name) {
  const start = text.indexOf('\n  ' + name + ':\n');
  assert.ok(start >= 0, 'job ' + name + ' exists');
  const rest = text.slice(start + 1);
  const next = rest.slice(1).search(/\n  [a-z-]+:\n/);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

function testsBeforeBuild(text) {
  const i = [T_ENGINE, T_SHARED, T_HQ, T_PIPELINE, T_SCRIPTS].map((c) => text.indexOf(c));
  const b = text.indexOf(BUILD);
  i.forEach((x) => assert.ok(x >= 0));
  assert.ok(b >= 0);
  assert.ok(i[0] < i[1] && i[1] < i[2] && i[2] < i[3] && i[3] < i[4] && i[4] < b, 'tests run in order before the build');
}

for (const f of ['pages.yml', 'release.yml']) {
  test(f + ': pinned actions, no floating refs, full clone', () => {
    const t = read(f);
    assert.ok(t.includes('uses: actions/checkout@v6'));
    assert.ok(t.includes('uses: actions/setup-node@v7'));
    assert.match(t, /node-version: '20'/);
    assert.match(t, /fetch-depth: 0/);
    assert.doesNotMatch(t, /@main|@latest/);
    testsBeforeBuild(t);
  });
}

test('pages.yml: name, triggers, permissions, concurrency', () => {
  const t = read('pages.yml');
  assert.match(t, /^name: Deploy site$/m);
  assert.match(t, /^on:\n  push:\n    branches: \[main\]\n  workflow_dispatch:/m);
  assert.match(t, /^permissions:\n  contents: read$/m);
  assert.match(t, /^concurrency:\n  group: pages\n  cancel-in-progress: false$/m);
});

test('pages.yml: pinned pages actions and upload path', () => {
  const t = read('pages.yml');
  assert.ok(t.includes('uses: actions/configure-pages@v5'));
  assert.ok(t.includes('uses: actions/upload-pages-artifact@v4'));
  assert.ok(t.includes('uses: actions/deploy-pages@v4'));
  assert.match(t, /upload-pages-artifact@v4\n\s+with:\n\s+path: site/);
  const b = t.indexOf(BUILD);
  assert.ok(b < t.indexOf('configure-pages') && t.indexOf('configure-pages') < t.indexOf('upload-pages-artifact'));
});

test('pages.yml: deploy job', () => {
  const t = read('pages.yml');
  const d = job(t, 'deploy');
  assert.match(d, /needs: build/);
  assert.match(d, /pages: write/);
  assert.match(d, /id-token: write/);
  assert.match(d, /environment:\n\s+name: github-pages\n\s+url: \$\{\{ steps\.deployment\.outputs\.page_url \}\}/);
  assert.match(d, /id: deployment/);
  assert.match(d, /uses: actions\/deploy-pages@v4/);
  const bj = job(t, 'build');
  assert.match(bj, /runs-on: ubuntu-latest/);
  assert.ok(!bj.includes('deploy-pages'));
});

test('release.yml: tag trigger, permissions, release command', () => {
  const t = read('release.yml');
  assert.match(t, /^name: Release$/m);
  assert.match(t, /^on:\n  push:\n    tags:\n      - 'hq-v\*'$/m);
  assert.match(t, /^permissions:\n  contents: write$/m);
  assert.match(t, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.ok(t.includes('gh release create "$GITHUB_REF_NAME" site/hq/hq-single.html --title "HQ $GITHUB_REF_NAME" --notes "Single-file HQ demo (open it from disk or attach it to an email), built from this tag. Source and notes: README.md in the hq folder."'));
  assert.ok(t.indexOf(BUILD) < t.indexOf('gh release create'));
});

// YAML regression guard (no parser available in the repo, so a cheap line check). A single-line `run:` value is a
// YAML plain scalar unless it starts with a quote or a block indicator; a plain scalar must not contain ": "
// (even inside shell quotes) or " #", or GitHub rejects the whole workflow file ("mapping values are not allowed here").
function plainRunProblems(text) {
  const problems = [];
  text.split('\n').forEach((line, i) => {
    const m = /^\s*(?:- )?run:[ \t]+(.*)$/.exec(line);
    if (!m) return;
    const value = m[1].trim();
    if (value === '' || /^[|>]/.test(value) || /^["']/.test(value)) return;
    if (value.includes(': ') || /:$/.test(value) || / #/.test(value)) {
      problems.push('line ' + (i + 1) + ': single-line run value contains ": " or " #" (use "run: |")');
    }
  });
  return problems;
}

test('workflow files: no single-line run value that YAML would reject', () => {
  for (const f of fs.readdirSync(dir).filter((n) => /\.ya?ml$/.test(n))) {
    assert.deepStrictEqual(plainRunProblems(read(f)), [], f);
  }
});

test('the YAML guard flags the broken line that failed on GitHub, and passes the block form', () => {
  const broken = '        run: gh release create "$GITHUB_REF_NAME" f.html --notes "Single-file demo. Source and notes: README.md in the hq folder."';
  assert.strictEqual(plainRunProblems(broken).length, 1);
  assert.strictEqual(plainRunProblems('        run: |\n          gh release create x --notes "a: b"').length, 0);
  assert.strictEqual(plainRunProblems("        run: 'echo a: b'").length, 0);
  assert.strictEqual(plainRunProblems('      - run: cd engine && node --test tests/').length, 0);
  assert.strictEqual(plainRunProblems('        run: echo done # comment').length, 1);
});
