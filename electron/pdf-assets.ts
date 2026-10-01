/**
 * PDF.js 资源协议:wb-pdf://cmaps|standard_fonts|wasm/<文件> 映射到 pdfjs-dist 的资源目录。
 * 使 CJK cMap/标准字体/wasm 解码器在 dev(http)与打包(file://)下都能本地加载,不走网络。
 * 安装包将这三个目录放在 resources/pdfjs/，开发模式仍从 node_modules 读取。
 */
import { net, protocol } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ALLOWED_DIRS = new Set(['cmaps', 'standard_fonts', 'wasm']);

/** 必须在 app.ready 之前调用。 */
export function registerPdfAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'wb-pdf',
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
    },
  ]);
}

/** app.ready 之后调用一次。 */
export function registerPdfAssetHandler(resourcesRoot: string): void {
  protocol.handle('wb-pdf', (request) => {
    const url = new URL(request.url);
    const file = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (!ALLOWED_DIRS.has(url.hostname) || file === '' || file.includes('..') || !/^[\w./-]+$/.test(file)) {
      return new Response('bad request', { status: 400 });
    }
    return net.fetch(pathToFileURL(join(resourcesRoot, url.hostname, file)).href);
  });
}
