/* 極簡靜態伺服器 —— 讓 Playwright 用 http:// 開本機檔案。
   不能用 file://，因為 Service Worker、fetch 與 localStorage 的行為都不同，
   測不到真實情境。只服務本 repo，不接受路徑跳脫。 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function createServer() {
  return http.createServer((req, res) => {
    let rel = decodeURIComponent((req.url || '/').split('?')[0]);
    if (rel === '/') rel = '/index.html';
    const abs = path.join(ROOT, rel);
    // 防止路徑跳脫出 repo
    if (!abs.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
    fs.readFile(abs, (err, buf) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found: ' + rel); return; }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      res.end(buf);
    });
  });
}

module.exports = { createServer, ROOT };

if (require.main === module) {
  const port = Number(process.argv[2] || 4173);
  createServer().listen(port, () => console.log(`static server on http://127.0.0.1:${port}`));
}
