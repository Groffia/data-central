'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const ORDER = ['format', 'escape', 'viewmodel', 'render', 'controller', 'autoplay'];

function loadHQ() {
  const Engine = require(path.join(ROOT, '..', 'engine', 'engine.js'));
  const context = vm.createContext({ Engine, console });
  for (const name of ORDER) {
    const file = path.join(ROOT, 'src', name + '.js');
    if (!fs.existsSync(file)) continue;
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  }
  return { Engine, HQ: context.HQ };
}

module.exports = { loadHQ };
