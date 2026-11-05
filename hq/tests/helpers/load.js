'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const SHARED_DIR = path.join(ROOT, '..', 'shared');
const SHARED_ORDER = ['escape', 'format', 'vendor'];
const ORDER = ['viewmodel', 'render', 'controller', 'autoplay'];

function loadHQ() {
  const Engine = require(path.join(ROOT, '..', 'engine', 'engine.js'));
  const context = vm.createContext({ Engine, console });
  for (const name of SHARED_ORDER) {
    const file = path.join(SHARED_DIR, name + '.js');
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  }
  for (const name of ORDER) {
    const file = path.join(ROOT, 'src', name + '.js');
    if (!fs.existsSync(file)) continue;
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  }
  return { Engine, HQ: context.HQ, Shared: context.Shared };
}

module.exports = { loadHQ, SHARED_DIR, SHARED_ORDER };
