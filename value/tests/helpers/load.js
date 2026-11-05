'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const SHARED_DIR = path.join(ROOT, '..', 'shared');
const SHARED_ORDER = ['escape', 'format', 'vendor'];
// 'main-never' holds main.js's slot in the order but is never a file: main.js is the only DOM-touching script and is not loaded in tests.
const ORDER = ['viewmodel', 'chart', 'definitions', 'render', 'controller', 'main-never'];

// Loads engine, shared scripts, then the page scripts that exist (in order) into a vm context with no DOM.
function loadValue(opts) {
  const o = opts || {};
  const srcDir = o.srcDir || path.join(ROOT, 'src');
  const Engine = require(path.join(ROOT, '..', 'engine', 'engine.js'));
  const context = vm.createContext({ Engine, console });
  for (const name of SHARED_ORDER) {
    const file = path.join(SHARED_DIR, name + '.js');
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  }
  for (const name of ORDER) {
    const file = path.join(srcDir, name + '.js');
    if (!fs.existsSync(file)) continue;
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  }
  return { Engine, Value: context.Value, Shared: context.Shared, context };
}

module.exports = { loadValue, SHARED_DIR, SHARED_ORDER, ORDER };
