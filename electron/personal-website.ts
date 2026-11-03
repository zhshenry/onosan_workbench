import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { GameOnlineUrlSchema } from '../shared/game-contracts';
import { WebsiteSaveSchema, type WebsiteState } from '../shared/personal-website-contracts';
import { PersonalWebsiteContent } from './personal-website-content';

export const PERSONAL_WEBSITE_ROOT = 'C:/Myself/Personal_Website';
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
async function terminate(child?: ChildProcess) {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') await new Promise<void>(done => execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }, () => { child.kill(); done(); }));
  else { try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill(); } }
}
export class PersonalWebsite {
  readonly content: PersonalWebsiteContent;
  private state: WebsiteState;
  private dev?: ChildProcess;
  private builder?: ChildProcess;
  private opening?: Promise<WebsiteState>;
  private building?: Promise<WebsiteState>;
  private checking?: Promise<WebsiteState>;
  private initialized?: Promise<void>;
  private stopped = false;
  private cancelled = false;
  private revision = 0;
  private listeners = new Set<(state: WebsiteState) => void>();
  constructor(private readonly options: { dataDir: string; root?: string; runtime?: string; port?: number }) {
    const root = options.root ?? PERSONAL_WEBSITE_ROOT;
    this.content = new PersonalWebsiteContent(root);
    this.state = { root, service: { phase: 'stopped', url: '', message: '本地未启动', output: '' }, build: { phase: 'idle', output: '', message: '尚未构建' }, checks: { phase: 'idle', results: [] }, onlineUrl: '' };
  }
  snapshot(): WebsiteState { return structuredClone(this.state); }
  subscribe(listener: (state: WebsiteState) => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private emit() { const state = this.snapshot(); this.listeners.forEach(listener => listener(state)); }
  invalidate() { this.revision++; if (this.state.build.phase !== 'running') { this.state.build.phase = 'idle'; this.state.build.message = '内容有更新，请重新构建'; } if (this.state.checks.phase !== 'running') this.state.checks = { phase: 'idle', results: [] }; this.emit(); }
  async save(input: unknown) {
    const request = WebsiteSaveSchema.parse(input), collection = request.id.split('/')[0];
    // This project's Astro loader does not watch a collection that was empty at startup.
    const firstEntry = !request.version && this.state.service.phase === 'running' && !(await this.content.list()).some(item => item.collection === collection);
    const content = await this.content.save(request); this.invalidate();
    if (firstEntry && this.state.service.phase === 'running') { await this.stop(); await this.start(); }
    return content;
  }
  async readState(): Promise<WebsiteState> {
    this.initialized ??= (async () => {
      try { const saved = JSON.parse(await readFile(join(this.options.dataDir, 'settings.json'), 'utf8')); this.state.onlineUrl = GameOnlineUrlSchema.parse(saved.onlineUrl); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    })();
    await this.initialized; return this.snapshot();
  }
  async configureOnline(input: unknown): Promise<WebsiteState> {
    const onlineUrl = GameOnlineUrlSchema.parse(input); await this.readState();
    await mkdir(this.options.dataDir, { recursive: true });
    await writeFile(join(this.options.dataDir, 'settings.json'), JSON.stringify({ onlineUrl }));
    this.state.onlineUrl = onlineUrl; this.emit(); return this.snapshot();
  }
  private async launch(command: 'dev' | 'build'): Promise<ChildProcess> {
    const root = await realpath(this.state.root), entry = await realpath(join(root, 'node_modules', 'astro', 'astro.js')).catch(() => { throw new Error('未找到 Astro，请先在项目终端运行 npm install。'); });
    return spawn(this.options.runtime ?? process.execPath, [entry, command, ...(command === 'dev' ? ['--host', '127.0.0.1', '--port', String(this.options.port ?? 4321)] : [])], { cwd: root, windowsHide: true, detached: process.platform !== 'win32', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NO_COLOR: '1', FORCE_COLOR: '0', ASTRO_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  }
  start(): Promise<WebsiteState> { this.opening ??= this.open().finally(() => { this.opening = undefined; }); return this.opening; }
  private async open(): Promise<WebsiteState> {
    await this.readState(); if (this.state.service.phase === 'running') return this.snapshot();
    this.stopped = false; this.state.service = { phase: 'starting', url: '', message: '正在启动 Astro…', output: '' }; this.emit();
    try {
      const child = await this.launch('dev'); this.dev = child;
      if (this.stopped) { await terminate(child); throw new Error('本地已停止'); }
      await new Promise<void>((done, reject) => {
        let settled = false;
        const finish = (error?: Error) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : done(); };
        const timer = setTimeout(() => finish(new Error('Astro 启动超时，请查看开发日志。')), 45000);
        for (const stream of [child.stdout, child.stderr]) stream?.on('data', data => {
          this.state.service.output = (this.state.service.output + stripVTControlCharacters(String(data))).slice(-64000);
          const url = /http:\/\/(?:127\.0\.0\.1|localhost):\d+\//.exec(this.state.service.output)?.[0];
          if (url && !settled && !this.stopped) { this.state.service.url = url; this.state.service.phase = 'running'; this.state.service.message = '开发中'; finish(); }
          this.emit();
        });
        child.once('error', error => finish(error));
        child.once('exit', code => {
          if (this.dev === child) { this.dev = undefined; this.state.service.url = ''; this.state.service.phase = this.stopped ? 'stopped' : 'error'; this.state.service.message = this.stopped ? '本地已停止' : `Astro 已退出（${code ?? '中断'}），请查看开发日志。`; this.emit(); }
          finish(new Error(this.state.service.message));
        });
      });
    } catch (error) { await terminate(this.dev); this.dev = undefined; this.state.service.phase = this.stopped ? 'stopped' : 'error'; this.state.service.url = ''; this.state.service.message = message(error); this.emit(); }
    return this.snapshot();
  }
  async stop(): Promise<WebsiteState> {
    this.stopped = true; await terminate(this.dev); await this.opening;
    this.dev = undefined; this.state.service.phase = 'stopped'; this.state.service.url = ''; this.state.service.message = '本地已停止'; this.emit(); return this.snapshot();
  }
  build(): Promise<WebsiteState> { this.building ??= this.runBuild().finally(() => { this.building = undefined; }); return this.building; }
  private async runBuild(): Promise<WebsiteState> {
    const revision = this.revision;
    this.cancelled = false; this.state.build = { phase: 'running', output: '', message: '正在运行 Astro 构建…' }; this.emit();
    try {
      const child = await this.launch('build'); this.builder = child;
      const exited = new Promise<number | null>((done, reject) => {
        for (const stream of [child.stdout, child.stderr]) stream?.on('data', data => { this.state.build.output = (this.state.build.output + stripVTControlCharacters(String(data))).slice(-64000); this.emit(); });
        child.once('error', reject); child.once('exit', done);
      });
      if (this.cancelled) await terminate(child);
      const code = await exited;
      if (this.cancelled) { this.state.build.phase = 'cancelled'; this.state.build.message = '构建已取消'; }
      else if (revision !== this.revision) { this.state.build.phase = 'idle'; this.state.build.message = '构建期间内容有更新，请重新构建'; }
      else if (code === 0) { this.state.build.phase = 'passed'; this.state.build.message = '构建通过'; }
      else throw new Error(`构建失败（退出码 ${code ?? '中断'}），请查看日志。`);
    } catch (error) { this.state.build.phase = this.cancelled ? 'cancelled' : 'failed'; this.state.build.message = this.cancelled ? '构建已取消' : message(error); }
    finally { this.builder = undefined; this.state.build.finishedAt = Date.now(); this.emit(); }
    return this.snapshot();
  }
  async cancelBuild() { this.cancelled = true; await terminate(this.builder); }
  checkPages(): Promise<WebsiteState> { this.checking ??= this.runChecks().finally(() => { this.checking = undefined; }); return this.checking; }
  private async runChecks(): Promise<WebsiteState> {
    if (this.state.service.phase !== 'running') throw new Error('请先启动本地开发服务。');
    const origin = this.state.service.url, revision = this.revision;
    this.state.checks = { phase: 'running', results: [] }; this.emit();
    for (const [path, label] of [['/', '首页'], ['/works/', '作品'], ['/blog/', '博客'], ['/library/', '文库'], ['/about/', '关于']]) {
      try {
        const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(15000), redirect: 'manual' });
        const passed = response.ok && (response.headers.get('content-type') ?? '').includes('text/html');
        await response.body?.cancel();
        this.state.checks.results.push({ path, label, status: passed ? 'passed' : 'failed', message: passed ? `HTTP ${response.status} · 页面可访问` : `HTTP ${response.status} · 请查看页面或开发日志` });
      } catch (error) { this.state.checks.results.push({ path, label, status: 'failed', message: message(error) }); }
      this.emit();
    }
    if (revision !== this.revision) this.state.checks = { phase: 'idle', results: [] };
    else { this.state.checks.phase = this.state.checks.results.every(item => item.status === 'passed') ? 'passed' : 'failed'; this.state.checks.finishedAt = Date.now(); }
    this.emit(); return this.snapshot();
  }
  async dispose() { await this.cancelBuild(); await this.building; await this.stop(); await this.checking; this.listeners.clear(); }
}
