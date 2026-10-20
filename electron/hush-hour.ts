import { createServer, type Server } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export const HUSH_HOUR_PROJECT = 'C:/Myself/vibe_coding/some_idea/cocktail_web';
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.rsc': 'text/x-component', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};
const inside = (root: string, file: string): boolean => {
  const path = relative(root, file);
  return !isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`);
};

/** Read-only preview of Hush-Hour's existing static export. */
export class HushHourPreview {
  private server?: Server;
  private opening?: Promise<string>;
  constructor(private readonly project = HUSH_HOUR_PROJECT, private readonly port = 4187) {}

  open(): Promise<string> {
    this.opening ??= this.start().catch(error => { this.opening = undefined; throw error; });
    return this.opening;
  }

  private async start(): Promise<string> {
    const root = await realpath(join(this.project, 'dist', 'client')).catch(() => {
      throw new Error('找不到 Hush-Hour 网页构建，请在项目目录运行 npm run build:site 后重试。');
    });
    if (!(await stat(join(root, 'index.html')).catch(() => null))?.isFile()) {
      throw new Error('Hush-Hour 网页构建不完整，请在项目目录运行 npm run build:site 后重试。');
    }
    const server = createServer(async (request, response) => {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, { Allow: 'GET, HEAD' }).end(); return;
      }
      let pathname: string;
      try { pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname); }
      catch { response.writeHead(400).end('Bad request'); return; }
      const candidate = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!inside(root, candidate)) { response.writeHead(403).end('Forbidden'); return; }
      try {
        const file = await realpath(candidate).catch(error => {
          if (extname(candidate)) throw error;
          return realpath(`${candidate}.html`);
        });
        if (!inside(root, file)) { response.writeHead(403).end('Forbidden'); return; }
        const body = await readFile(file);
        response.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
        response.end(request.method === 'HEAD' ? undefined : body);
      } catch { response.writeHead(404).end('Not found'); }
    });
    await new Promise<void>((done, reject) => {
      server.once('error', reject);
      server.listen(this.port, '127.0.0.1', () => { server.off('error', reject); done(); });
    }).catch(error => {
      if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') throw new Error(`Hush-Hour 本地预览端口 ${this.port} 已被占用，请关闭占用该端口的服务后重试。`);
      throw error;
    });
    this.server = server;
    const address = server.address() as { port: number };
    return `http://127.0.0.1:${address.port}/`;
  }

  async dispose(): Promise<void> {
    await this.opening?.catch(() => {});
    const server = this.server;
    this.server = undefined; this.opening = undefined;
    if (!server) return;
    await new Promise<void>((done, reject) => {
      server.close(error => error ? reject(error) : done());
      server.closeAllConnections();
    });
  }
}
