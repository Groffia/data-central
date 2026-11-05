#!/usr/bin/env node
'use strict';
// Static server for local checks: node scripts/serve.js <dir> [port]   (default 8080)
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8'
};

function createServer(dir) {
  const root = path.resolve(dir);
  return http.createServer(function (req, res) {
    function send(status, body, type) {
      res.writeHead(status, { 'Content-Type': type || 'text/plain; charset=utf-8' });
      res.end(body);
    }
    let rel;
    try {
      rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    } catch (e) {
      return send(400, 'Bad request');
    }
    if (rel.indexOf('\0') >= 0) return send(400, 'Bad request');
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.resolve(root, '.' + rel);
    if (file !== root && file.indexOf(root + path.sep) !== 0) return send(403, 'Forbidden');
    const type = TYPES[path.extname(file).toLowerCase()];
    if (!type) return send(404, 'Not found');
    fs.readFile(file, function (err, data) {
      if (err) return send(404, 'Not found');
      send(200, data, type);
    });
  });
}

if (require.main === module) {
  const dir = process.argv[2];
  if (!dir) {
    process.stderr.write('usage: node scripts/serve.js <dir> [port]\n');
    process.exit(1);
  }
  const port = process.argv[3] ? Number(process.argv[3]) : 8080;
  createServer(dir).listen(port, function () {
    process.stdout.write('serving ' + path.resolve(dir) + ' at http://localhost:' + port + '/\n');
  });
}

module.exports = { createServer };
