import { BrowserWindow, protocol, session, type Session, type WebContents } from 'electron';
import { readFileSync, existsSync } from 'node:fs';
import { ARTIFACT_CSP, artifactMime, entryFile, scopedFile } from './ai-test-artifacts';
import type { TestCheck, TestCheckResult, TestFile } from '../shared/ai-test-contracts';

export const AI_TEST_SCHEME = 'ono-ai-test';
const configuredPartitions = new Set<string>();
export function registerAiTestScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: AI_TEST_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
}
export function guardAiTestPreview(owner: WebContents): void {
  owner.on('will-frame-navigate', event => {
    const from = event.frame?.url;
    if (!from?.startsWith(AI_TEST_SCHEME + ':')) return;
    try {
      const current = new URL(from), next = new URL(event.url);
      if (next.protocol !== current.protocol || next.host !== current.host) event.preventDefault();
    } catch { event.preventDefault(); }
  });
}
export function installArtifactProtocol(target: Session, directory: (id: string) => string | undefined): void {
  target.protocol.handle(AI_TEST_SCHEME, request => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) return new Response('', { status: 405 });
      const url = new URL(request.url), root = directory(url.hostname);
      if (!root) return new Response('产物不存在', { status: 404 });
      const name = decodeURIComponent(url.pathname.slice(1));
      const headers = { 'Content-Type': artifactMime(name) + '; charset=utf-8', 'Content-Security-Policy': ARTIFACT_CSP, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
      if (name === '__runner__.html') return new Response('<!doctype html><html><head><title>JavaScript 运行区</title></head><body></body></html>', { headers });
      const path = scopedFile(root, name);
      if (!existsSync(path)) return new Response('文件不存在', { status: 404 });
      return new Response(request.method === 'HEAD' ? '' : readFileSync(path, 'utf8'), { headers });
    } catch { return new Response('产物路径不可用', { status: 404 }); }
  });
}
export function previewAddress(id: string, files: TestFile[]): string | null {
  const entry = entryFile(files);
  return entry ? AI_TEST_SCHEME + '://' + id + '/' + entry.split('/').map(encodeURIComponent).join('/') : null;
}

/** Each lane has a separate origin and non-persistent browser partition. No preload or Node API. */
export class AiTestBrowser {
  private window?: BrowserWindow;
  readonly logs: string[] = [];
  private errors: string[] = [];
  constructor(private readonly id: string, private readonly root: string) {}
  private getWindow(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) return this.window;
    const partition = session.fromPartition('ai-test-' + this.id);
    if (!configuredPartitions.has(this.id)) { installArtifactProtocol(partition, id => id === this.id ? this.root : undefined); configuredPartitions.add(this.id); }
    partition.setPermissionRequestHandler((_web, _permission, callback) => callback(false));
    partition.setPermissionCheckHandler(() => false);
    partition.on('will-download', event => event.preventDefault());
    const origin = AI_TEST_SCHEME + '://' + this.id + '/';
    partition.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !details.url.startsWith(origin) && !details.url.startsWith('data:') && !details.url.startsWith('blob:') && details.url !== 'about:blank' }));
    const win = new BrowserWindow({ show: false, width: 1100, height: 780, webPreferences: {
      session: partition, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, backgroundThrottling: false,
    } });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event, url) => { if (!url.startsWith(origin)) event.preventDefault(); });
    win.webContents.on('console-message', details => {
      this.logs.push(details.message.slice(0, 1000)); if (this.logs.length > 100) this.logs.shift();
      if (details.level === 'error') this.errors.push(details.message.slice(0, 1000));
    });
    this.window = win;
    return win;
  }
  private async bounded<T>(action: () => Promise<T>, signal: AbortSignal, ms = 6000): Promise<T> {
    signal.throwIfAborted();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let abort: (() => void) | undefined;
    try {
      return await Promise.race([action(), new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => { this.close(); reject(new Error('产物操作超时')); }, ms);
        abort = () => { this.close(); reject(new Error('已停止产物操作')); };
        signal.addEventListener('abort', abort, { once: true });
      })]);
    } finally { clearTimeout(timeout); if (abort) signal.removeEventListener('abort', abort); }
  }
  async load(files: TestFile[], signal: AbortSignal): Promise<void> {
    const address = previewAddress(this.id, files) ?? AI_TEST_SCHEME + '://' + this.id + '/__runner__.html';
    await this.bounded(() => this.getWindow().loadURL(address), signal, 10000);
  }
  async evaluate(expression: string, signal: AbortSignal, argument?: unknown): Promise<unknown> {
    const script = 'Promise.resolve((' + expression + ')(' + JSON.stringify(argument ?? null) + '))';
    return this.bounded(() => this.getWindow().webContents.executeJavaScript(script, true), signal);
  }
  async inspect(files: TestFile[], signal: AbortSignal): Promise<unknown> {
    await this.load(files, signal);
    return this.evaluate('() => ({title: document.title, text: document.body.innerText.slice(0,12000), controls: [...document.querySelectorAll("button,input,select,textarea,a")].slice(0,80).map(x=>({tag:x.tagName,id:x.id,text:x.textContent?.slice(0,120),name:x.getAttribute("name"),type:x.getAttribute("type")}))})', signal);
  }
  async probe(files: TestFile[], signal: AbortSignal): Promise<void> {
    this.errors = [];
    await this.load(files, signal);
    await this.evaluate('async () => { await new Promise(r => setTimeout(r, 300)); return document.readyState; }', signal);
    if (this.errors.length) throw new Error(this.errors.join('\n'));
  }
  async action(selector: string, operation: 'click' | 'fill', value: string, signal: AbortSignal): Promise<unknown> {
    const code = '() => { const list = document.querySelectorAll(' + JSON.stringify(selector) + '); if(list.length!==1) throw new Error("需要唯一匹配元素，实际 "+list.length+" 个"); const el=list[0]; ' +
      (operation === 'click' ? 'el.click();' : 'const setter=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),"value")?.set; if(setter) setter.call(el,' + JSON.stringify(value) + '); else el.value=' + JSON.stringify(value) + '; el.dispatchEvent(new Event("input",{bubbles:true})); el.dispatchEvent(new Event("change",{bubbles:true}));') +
      'return document.body.innerText.slice(0,12000); }';
    return this.evaluate(code, signal);
  }
  async checks(files: TestFile[], checks: TestCheck[], signal: AbortSignal): Promise<TestCheckResult[]> {
    if (!entryFile(files)) throw new Error('网页校验需要 HTML 入口文件；其他产物可查看源码或导出');
    const results: TestCheckResult[] = [];
    for (const check of checks) {
      signal.throwIfAborted();
      try {
        await this.load(files, signal);
        await this.evaluate('() => { localStorage.clear(); sessionStorage.clear(); }', signal);
        await this.load(files, signal);
        const previous = check.setup ? await this.evaluate(check.setup, signal) : undefined;
        if (check.reload) await this.load(files, signal);
        const value = await this.evaluate(check.expression, signal, previous);
        results.push({ id: check.id, label: check.label, status: value === true ? 'passed' : 'failed', detail: value === true ? '断言返回 true' : '断言未返回 true：' + String(value).slice(0, 500) });
      } catch (error) {
        if (signal.aborted) throw error;
        results.push({ id: check.id, label: check.label, status: 'error', detail: error instanceof Error ? error.message : '校验失败' });
      }
    }
    return results;
  }
  close(): void { if (this.window && !this.window.isDestroyed()) this.window.destroy(); this.window = undefined; }
}
