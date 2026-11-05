'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');

const { createServer } = require(path.join(__dirname, '..', 'scripts', 'serve.js'));

function get(port, p) {
  return new Promise(function (resolve, reject) {
    http.get({ host: '127.0.0.1', port: port, path: p }, function (res) {
      let b = '';
      res.on('data', function (d) { b += d; });
      res.on('end', function () { resolve({ status: res.statusCode, type: res.headers['content-type'], body: b }); });
    }).on('error', reject);
  });
}
// Raw request so the client does not normalise "/../" away.
function raw(port, p) {
  return new Promise(function (resolve, reject) {
    const s = net.connect(port, '127.0.0.1', function () {
      s.write('GET ' + p + ' HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n');
    });
    let b = '';
    s.on('data', function (d) { b += d; });
    s.on('end', function () { resolve(b); });
    s.on('error', reject);
  });
}

test('serve: index, content types, 404, traversal refused', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hqserve-'));
  const dir = path.join(root, 'site');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'index.html'), '<p>hi</p>');
  fs.writeFileSync(path.join(dir, 'a.js'), 'var a;');
  fs.writeFileSync(path.join(dir, 'a.css'), 'a{}');
  fs.writeFileSync(path.join(root, 'secret.txt'), 'secret');
  const server = createServer(dir);
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  const port = server.address().port;
  try {
    const i = await get(port, '/');
    assert.strictEqual(i.status, 200);
    assert.ok(/text\/html/.test(i.type));
    assert.strictEqual(i.body, '<p>hi</p>');
    assert.ok(/javascript/.test((await get(port, '/a.js')).type));
    assert.ok(/text\/css/.test((await get(port, '/a.css')).type));
    assert.strictEqual((await get(port, '/missing.html')).status, 404);
    for (const p of ['/..%2Fsecret.txt', '/../secret.txt', '/%2e%2e/secret.txt']) {
      const res = await raw(port, p);
      assert.ok(res.indexOf('secret') < 0 || /^HTTP\/1\.1 (403|404)/.test(res) && res.split('\r\n\r\n')[1].indexOf('secret') < 0, p);
      assert.ok(/^HTTP\/1\.1 (403|404)/.test(res), p + ' -> ' + res.slice(0, 20));
    }
  } finally {
    server.close();
  }
});
