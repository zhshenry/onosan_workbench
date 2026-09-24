// 设计稿局域网预览服务器:node tooling/serve-design.mjs [port]
// 从项目根目录提供静态文件,绑定 0.0.0.0 供手机/平板通过局域网访问
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { networkInterfaces } from 'node:os';

const ROOT = resolve(import.meta.dirname, '..');
const PORT = Number(process.argv[2]) || 4173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.md': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/design/README.md';
    const filePath = normalize(join(ROOT, pathname));
    if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
    let target = filePath;
    try { if ((await stat(filePath)).isDirectory()) target = join(filePath, 'index.html'); } catch {}
    const body = await readFile(target);
    res.writeHead(200, { 'Content-Type': MIME[extname(target).toLowerCase()] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  }
}).listen(PORT, '0.0.0.0', () => {
  console.log(`设计稿预览服务器已启动(项目根: ${ROOT})`);
  console.log(`  本机:   http://localhost:${PORT}/design/mockups/design-a-glass.html`);
  for (const list of Object.values(networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) {
        console.log(`  局域网: http://${ni.address}:${PORT}/design/mockups/design-a-glass.html`);
      }
    }
  }
});
