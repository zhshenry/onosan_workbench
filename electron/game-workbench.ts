import { createServer, type Server } from 'node:http';
import { createReadStream, existsSync, watch, type FSWatcher } from 'node:fs';
import { mkdir, readFile, writeFile, readdir, realpath, stat, rename } from 'node:fs/promises';
import { resolve, join, relative, isAbsolute, extname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import type { GameDocument } from '../shared/game-documents';
import { GameIssues } from './game-issues';
import { DEFAULT_GAME_CONFIG, GAME_TASKS, GameConfigSchema, GameOnlineUrlSchema, GameRunScopeSchema, type GameState, type GameRunScope, type GameTaskResult, type GameArtifact } from '../shared/game-contracts';

const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
export function inside(root: string, file: string): boolean {
  const rel = relative(root, file);
  return rel === '' || !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`);
}
export interface GameWorkbenchOptions {
  dataDir: string; appRoot: string; root?: string; runtime?: string; edgePath?: string;
}

/** One local game project; fixed task IDs, no renderer-supplied commands or shell. */
export class GameWorkbench {
  readonly issues: GameIssues;
  private state: GameState;
  private server?: Server;
  private watcher?: FSWatcher;
  private watchTimer?: NodeJS.Timeout;
  private child?: ChildProcess;
  private operation?: Promise<void>;
  private startOperation?: Promise<GameState>;
  private saving = Promise.resolve();
  private cancelled = false;
  private disposed = false;
  private listeners = new Set<(state: GameState) => void>();
  private readonly runtime: string;
  constructor(private readonly options: GameWorkbenchOptions) {
    this.issues = new GameIssues(options.dataDir);
    this.runtime = options.runtime ?? process.execPath;
    const config = { ...DEFAULT_GAME_CONFIG, root: options.root ?? DEFAULT_GAME_CONFIG.root };
    this.state = { config, online: { url: '' }, revision: '', sourceError: '', service: { phase: 'stopped', owned: false, message: '启动游戏后开始试玩', url: '' }, running: false, results: {}, captures: [], logs: [] };
  }
  async initialize(): Promise<void> {
    await mkdir(this.options.dataDir, { recursive: true });
    try {
      const saved = JSON.parse(await readFile(join(this.options.dataDir, 'state.json'), 'utf8'));
      const config = GameConfigSchema.safeParse(saved.config);
      if (config.success) this.state.config = config.data;
      const online = GameOnlineUrlSchema.safeParse(saved.online?.url ?? '');
      if (online.success) this.state.online = { url: online.data };
      for (const task of GAME_TASKS) {
        const result = saved.results?.[task.id] as GameTaskResult | undefined;
        if (!result || typeof result.output !== 'string' || !Array.isArray(result.artifacts) || !/^[\w-]+$/.test(result.id)) continue;
        this.state.results[task.id] = { ...result, taskId: task.id, output: result.output.slice(-64000), status: ['running', 'queued'].includes(result.status) ? 'cancelled' : result.status };
      }
      if (Array.isArray(saved.captures)) this.state.captures = saved.captures.filter((item: GameArtifact) => typeof item.id === 'string' && /^[\w-]+$/.test(item.id)).slice(-20);
    } catch { /* first use or invalid local settings: use defaults */ }
    await this.refreshSource();
    this.watchSource();
  }
  snapshot(): GameState { return structuredClone(this.state); }
  subscribe(listener: (state: GameState) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private emit(): void { if (!this.disposed) for (const listener of this.listeners) listener(this.snapshot()); }
  private log(text: string): void { this.state.logs = [...this.state.logs, `${new Date().toLocaleTimeString('zh-CN')} ${text}`].slice(-80); this.emit(); }
  private save(): Promise<void> {
    this.saving = this.saving.catch(() => {}).then(async () => {
      const temporary = join(this.options.dataDir, 'state.tmp');
      await writeFile(temporary, JSON.stringify({ config: this.state.config, online: { url: this.state.online.url }, results: this.state.results, captures: this.state.captures }, null, 2));
      await rename(temporary, join(this.options.dataDir, 'state.json'));
    });
    return this.saving;
  }
  async configure(input: unknown): Promise<GameState> {
    if (this.state.running || this.state.service.phase === 'running' || this.state.service.phase === 'starting') throw new Error('请先停止测试与本地服务，再修改项目设置。');
    const config = GameConfigSchema.parse(input);
    await this.webRoot(config);
    this.watcher?.close();
    this.state.config = config;
    this.state.service = { phase: 'stopped', owned: false, message: '项目设置已保存', url: '' };
    await this.refreshSource();
    this.watchSource();
    await this.save(); this.emit(); return this.snapshot();
  }
  async configureOnline(input: unknown): Promise<GameState> {
    this.state.online = { url: GameOnlineUrlSchema.parse(input) };
    await this.save(); this.emit(); return this.snapshot();
  }
  async readDocument(input: unknown = 'README.md'): Promise<GameDocument> {
    if (typeof input !== 'string' || !input || input.length > 2000 || input.includes('\0') || input.includes(':') || isAbsolute(input) || !/\.(md|markdown)$/i.test(input)) throw new Error('请使用项目内的 Markdown 文档相对路径。');
    const root = await realpath(this.state.config.root), candidate = resolve(root, input);
    if (!inside(root, candidate)) throw new Error('文档必须位于当前游戏项目内。');
    const file = await realpath(candidate);
    if (!inside(root, file)) throw new Error('文档必须位于当前游戏项目内。');
    if (!/\.(md|markdown)$/i.test(file)) throw new Error('应用内说明只支持 Markdown 文档。');
    const info = await stat(file);
    if (!info.isFile() || info.size > 1024 * 1024) throw new Error('只支持预览 1 MiB 以内的 Markdown 文档。');
    return { path: relative(root, file).replaceAll('\\', '/'), content: (await readFile(file, 'utf8')).replace(/^\uFEFF/, '') };
  }
  async checkOnline(): Promise<GameState> {
    const online = this.state.online;
    if (!online.url) throw new Error('请先设置线上地址。');
    if (online.check?.status === 'checking') return this.snapshot();
    online.check = { url: online.url, status: 'checking', message: '正在检查线上访问…' }; this.emit();
    try {
      const signal = AbortSignal.timeout(8000);
      let target = online.url;
      for (let redirects = 0; redirects <= 5; redirects++) {
        const response = await fetch(target, { signal, redirect: 'manual' });
        await response.body?.cancel();
        const location = response.headers.get('location');
        if ([301, 302, 303, 307, 308].includes(response.status) && location) {
          if (redirects === 5) throw new Error('重定向次数过多。');
          target = GameOnlineUrlSchema.parse(new URL(location, target).href); continue;
        }
        online.check = { url: target, status: response.ok ? 'passed' : 'failed', httpStatus: response.status, checkedAt: Date.now(), message: response.ok ? '最近检查可访问' : `访问失败 · HTTP ${response.status}` };
        break;
      }
    } catch (error) { online.check = { url: online.url, status: 'failed', checkedAt: Date.now(), message: `访问检查失败：${message(error)}` }; }
    if (this.state.online === online) this.emit();
    return this.snapshot();
  }
  private async webRoot(config = this.state.config): Promise<string> {
    const root = await realpath(config.root);
    const web = await realpath(resolve(root, config.webRoot));
    if (!inside(root, web) || !(await stat(web)).isDirectory()) throw new Error('网页目录必须位于游戏项目内。');
    if (!existsSync(join(web, 'index.html'))) throw new Error('网页目录中没有 index.html。');
    return web;
  }
  private async fingerprint(): Promise<string> {
    const hash = createHash('sha256');
    const root = await realpath(this.state.config.root);
    hash.update(root);
    const visit = async (folder: string): Promise<void> => {
      for (const entry of (await readdir(folder, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
        if (entry.isSymbolicLink()) continue;
        const path = join(folder, entry.name);
        if (entry.isDirectory()) await visit(path);
        else if (entry.isFile()) { hash.update(relative(root, path)); hash.update(await readFile(path)); }
      }
    };
    await visit(await this.webRoot());
    for (const folder of ['tests', 'cases']) if (existsSync(join(root, folder))) await visit(join(root, folder));
    return hash.digest('hex');
  }
  async refreshSource(): Promise<void> {
    try { this.state.revision = await this.fingerprint(); this.state.sourceError = ''; }
    catch (error) { this.state.revision = ''; this.state.sourceError = `无法读取游戏项目：${message(error)}`; }
    this.emit();
  }
  private watchSource(): void {
    try {
      this.watcher = watch(this.state.config.root, { recursive: true }, (_event, filename) => {
        if (!filename || ![this.state.config.webRoot, 'tests', 'cases'].some(dir => filename.toString().replaceAll('\\', '/').startsWith(`${dir.replaceAll('\\', '/')}/`))) return;
        clearTimeout(this.watchTimer);
        this.watchTimer = setTimeout(() => { void this.refreshSource(); }, 250);
      });
      this.watcher.on('error', error => this.log(`文件监听失败：${message(error)}`));
    } catch (error) { this.log(`文件监听暂不可用：${message(error)}`); }
  }
  start(): Promise<GameState> {
    this.startOperation ??= this.startService().finally(() => { this.startOperation = undefined; });
    return this.startOperation;
  }
  private async startService(): Promise<GameState> {
    if (this.disposed) throw new Error('游戏工作区已关闭');
    if (['starting', 'running'].includes(this.state.service.phase)) return this.snapshot();
    this.state.service = { phase: 'starting', owned: false, message: '正在启动本地服务…', url: '' }; this.emit();
    try {
      const webRoot = await this.webRoot();
      const server = createServer((request, response) => {
        void (async () => {
          if (!['GET', 'HEAD'].includes(request.method ?? '')) { response.writeHead(405).end(); return; }
          const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
          const candidate = resolve(webRoot, `.${pathname === '/' ? '/index.html' : pathname}`);
          if (!inside(webRoot, candidate)) { response.writeHead(403).end(); return; }
          const file = await realpath(candidate);
          if (!inside(webRoot, file) || !(await stat(file)).isFile()) { response.writeHead(403).end(); return; }
          response.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
          if (request.method === 'HEAD') response.end();
          else createReadStream(file).on('error', () => response.destroy()).pipe(response);
        })().catch(() => { if (!response.headersSent) response.writeHead(404); response.end('Not found'); });
      });
      await new Promise<void>((done, reject) => { server.once('error', reject); server.listen(this.state.config.port, '127.0.0.1', () => { server.off('error', reject); done(); }); });
      this.server = server;
      this.state.service = { phase: 'running', owned: true, message: '本地服务已就绪', url: `http://127.0.0.1:${this.state.config.port}/index.html` };
      this.log(`本地服务已就绪 · ${this.state.service.url}`);
    } catch (error) {
      this.state.service = { phase: 'error', owned: false, message: (error as NodeJS.ErrnoException).code === 'EADDRINUSE' ? '端口已被占用。可修改端口，或核对后连接已有服务。' : message(error), url: '' };
      this.log(this.state.service.message);
    }
    this.emit(); return this.snapshot();
  }
  async connect(): Promise<GameState> {
    if (this.state.service.owned) return this.snapshot();
    const url = `http://127.0.0.1:${this.state.config.port}/index.html`;
    const response = await fetch(url, { signal: AbortSignal.timeout(3000), redirect: 'error' });
    await response.body?.cancel();
    if (!response.ok) throw new Error(`已有服务返回 HTTP ${response.status}`);
    this.state.service = { phase: 'running', owned: false, message: '已连接外部服务，请核对预览是否为此游戏', url };
    this.log(this.state.service.message); return this.snapshot();
  }
  async stop(): Promise<GameState> {
    await this.startOperation;
    if (this.state.running) throw new Error('请先停止正在执行的测试。');
    const server = this.server; this.server = undefined;
    if (server) await new Promise<void>(done => { server.close(() => done()); server.closeAllConnections(); });
    this.state.service = { phase: 'stopped', owned: false, message: server ? '本地服务已停止' : '已断开连接，外部服务继续运行', url: '' };
    this.log(this.state.service.message); return this.snapshot();
  }
  private playwright(): string {
    return this.state.config.playwrightModule || createRequire(join(this.options.appRoot, 'package.json')).resolve('playwright');
  }
  async run(input: GameRunScope): Promise<GameState> {
    const scope = GameRunScopeSchema.parse(input);
    if (this.state.running) throw new Error('已有测试正在运行，请等待或停止。');
    this.cancelled = false;
    this.state.running = true;
    await this.refreshSource();
    if (this.state.sourceError) { this.state.running = false; this.emit(); throw new Error(this.state.sourceError); }
    if (this.cancelled) { this.state.running = false; this.emit(); return this.snapshot(); }
    const tasks = GAME_TASKS.filter(task => scope === task.id || scope === task.group);
    for (const task of tasks) this.state.results[task.id] = { id: randomUUID(), taskId: task.id, status: 'queued', revision: this.state.revision, root: this.state.config.root, url: `http://127.0.0.1:${this.state.config.port}`, output: '', message: '等待执行', artifacts: [] };
    this.operation = (async () => {
      try {
        for (const task of tasks) {
          const result = this.state.results[task.id]!;
          if (this.cancelled) { result.status = 'idle'; result.message = '尚未执行'; continue; }
          try {
            if (task.group === 'full') {
              if (this.state.service.phase !== 'running') throw new Error('请先启动或连接游戏服务。');
              this.playwright();
              const edge = this.options.edgePath ?? [process.env['PROGRAMFILES(X86)'], process.env.PROGRAMFILES, process.env.LOCALAPPDATA].filter(Boolean).map(base => join(base!, 'Microsoft/Edge/Application/msedge.exe')).find(existsSync);
              if (!edge || !existsSync(edge)) throw new Error('未找到 Microsoft Edge；快速检查仍可运行。');
            }
            const script = await realpath(resolve(this.state.config.root, task.script));
            if (!inside(await realpath(this.state.config.root), script)) throw new Error('测试脚本必须位于游戏项目内。');
            result.startedAt = Date.now(); result.status = 'running'; result.message = '正在执行…'; this.emit();
            const directory = join(this.options.dataDir, result.id);
            await mkdir(directory, { recursive: true });
            await this.execute(script, directory, result, task.group === 'full');
            result.artifacts = (await readdir(directory)).filter(file => file.endsWith('.png')).map(file => ({ id: `${result.id}/${file}`, name: file, file: join(directory, file) }));
          } catch (error) { result.status = result.startedAt ? 'failed' : 'unavailable'; result.message = `${result.startedAt ? '任务未完成' : '未执行'}：${message(error)}`; }
          result.finishedAt = Date.now();
          await this.refreshSource(); await this.save(); this.emit();
        }
      } finally { this.child = undefined; this.state.running = false; await this.save(); this.emit(); }
    })();
    void this.operation.catch(error => { this.log(`测试记录保存失败：${message(error)}`); });
    this.emit(); return this.snapshot();
  }
  private execute(script: string, directory: string, result: GameTaskResult, full: boolean): Promise<void> {
    return new Promise(done => {
      let timedOut = false;
      const child = spawn(this.runtime, [script], { cwd: this.state.config.root, windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', TEMP: directory, TMP: directory, GAME_URL: `http://127.0.0.1:${this.state.config.port}`, ...(full ? { PLAYWRIGHT_MODULE: this.playwright(), PW_BROWSER_CHANNEL: 'msedge' } : {}) } });
      this.child = child;
      const timer = setTimeout(() => { timedOut = true; void this.killChild(); }, full ? 180000 : 20000);
      const output = (data: Buffer) => { result.output = (result.output + data.toString('utf8')).slice(-64000); this.emit(); };
      child.stdout?.on('data', output); child.stderr?.on('data', output);
      child.once('error', error => { result.output += message(error); });
      child.once('close', code => {
        clearTimeout(timer); this.child = undefined; result.exitCode = code;
        result.status = this.cancelled ? 'cancelled' : !timedOut && code === 0 ? 'passed' : 'failed';
        result.message = this.cancelled ? '测试已停止，已完成结果保留。' : timedOut ? '测试超时，请查看原始输出。' : code === 0 ? '检查通过' : result.output.trim().split('\n').find(line => /Error|Assertion|FAIL/.test(line))?.slice(0, 240) || '脚本未通过，请查看原始输出。';
        done();
      });
    });
  }
  private async killChild(): Promise<void> {
    const child = this.child;
    if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
    if (process.platform === 'win32') await new Promise<void>(done => execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => done()));
    else child.kill('SIGTERM');
  }
  async cancel(): Promise<GameState> { this.cancelled = true; await this.killChild(); await this.operation; return this.snapshot(); }
  async capture(png: string, context?: Pick<GameArtifact, 'environment' | 'url' | 'siteUrl'>): Promise<GameArtifact> {
    if (png.length > 28 * 1024 * 1024) throw new Error('截图超过大小上限。');
    const bytes = Buffer.from(png, 'base64');
    if (bytes.length > 20 * 1024 * 1024 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('截图必须是 20MB 以内的 PNG。');
    const id = randomUUID();
    const artifact: GameArtifact = { id, name: `试玩截图-${new Date().toLocaleString('zh-CN')}`, file: join(this.options.dataDir, `${id}.png`), ...context, capturedAt: Date.now() };
    await writeFile(artifact.file, bytes);
    this.state.captures = [...this.state.captures, artifact].slice(-20); await this.save(); this.emit(); return artifact;
  }
  async artifactPath(id: string): Promise<string> {
    const item = [...this.state.captures, ...Object.values(this.state.results).flatMap(result => result?.artifacts ?? [])].find(item => item.id === id);
    if (!item || !inside(await realpath(this.options.dataDir), await realpath(item.file)) || extname(item.file) !== '.png') throw new Error('附件不存在或不属于游戏工作台。');
    return item.file;
  }
  async dispose(): Promise<void> {
    this.watcher?.close(); clearTimeout(this.watchTimer);
    await this.cancel(); await this.stop(); this.disposed = true; this.listeners.clear();
  }
}
