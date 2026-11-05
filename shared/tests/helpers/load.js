'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SHARED = path.join(__dirname, '..', '..');
const ORDER = ['escape', 'format', 'vendor'];

function loadShared() {
  const context = vm.createContext({ console });
  for (const name of ORDER) {
    const file = path.join(SHARED, name + '.js');
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  }
  return { Shared: context.Shared };
}

module.exports = { loadShared, SHARED, ORDER };
