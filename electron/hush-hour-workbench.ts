import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { watch, type FSWatcher } from 'node:fs';
import { lstat, mkdir, readFile, readdir, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { HUSH_HOUR_PROJECT, HushHourPreview } from './hush-hour';
import { HushHourIssues } from './hush-hour-issues';
import { DEFAULT_HUSH_HOUR_ONLINE_URL, HushHourArtifactSchema, type HushHourArtifact, type HushHourState } from '../shared/hush-hour-contracts';
import { GameOnlineUrlSchema } from '../shared/game-contracts';
import type { GameDocument } from '../shared/game-documents';

const SOURCE = ['app', 'public', 'worker', 'build', 'dev', 'package.json', 'package-lock.json', 'next.config.ts', 'vite.config.ts', 'tsconfig.json', 'postcss.config.mjs'];
const PAGES = ['index.html', 'mood.html', 'catalog.html'];
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const inside = (root: string, file: string) => { const path = relative(root, file); return !isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`); };

/** Hush-Hour owns its preview, fixed build command, screenshots and issue records. */
export class HushHourWorkbench {
  readonly issues: HushHourIssues;
  private state: HushHourState;
  private readonly preview: HushHourPreview;
  private initializing?: Promise<void>;
  private opening?: Promise<HushHourState>;
  private building?: Promise<HushHourState>;
  private child?: ChildProcess;
  private cancelled = false;
  private builtSourceRevision?: string;
  private disposed = false;
  private watcher?: FSWatcher;
  private timer?: NodeJS.Timeout;
  private refreshing = Promise.resolve();
  private saving = Promise.resolve();
  private listeners = new Set<(state: HushHourState) => void>();
  constructor(private readonly options: { dataDir: string; root?: string; port?: number; runtime?: string }) {
    const root = options.root ?? HUSH_HOUR_PROJECT;
    this.preview = new HushHourPreview(root, options.port ?? 4187);
    this.issues = new HushHourIssues(options.dataDir);
    this.state = { root, sourceRevision: '', buildRevision: '', sourceChanged: false, sourceError: '', service: { phase: 'stopped', url: '', message: '本地未启动' }, online: { url: DEFAULT_HUSH_HOUR_ONLINE_URL }, build: { phase: 'idle', output: '', message: '尚未构建' }, captures: [] };
  }
  snapshot(): HushHourState { return structuredClone(this.state); }
  subscribe(listener: (state: HushHourState) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private emit(): void { if (!this.disposed) for (const listener of this.listeners) listener(this.snapshot()); }
  private initialize(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('Hush-Hour 工作区已关闭。'));
    this.initializing ??= (async () => {
      await this.capturesRoot();
      try {
        const saved = JSON.parse(await readFile(join(this.options.dataDir, 'settings.json'), 'utf8')) as { onlineUrl?: unknown };
        const url = GameOnlineUrlSchema.safeParse(saved.onlineUrl);
        if (url.success) this.state.online.url = url.data;
      } catch { /* first use or invalid settings: use the current published address */ }
      try {
        const saved: unknown = JSON.parse(await readFile(join(this.options.dataDir, 'captures.json'), 'utf8'));
        if (Array.isArray(saved)) this.state.captures = saved.flatMap(item => { const parsed = HushHourArtifactSchema.safeParse(item); return parsed.success ? [parsed.data] : []; }).slice(-40);
      } catch { /* first use or invalid capture metadata: keep existing files */ }
      await this.refresh();
      if (this.disposed) return;
      try {
        this.watcher = watch(this.state.root, { recursive: true }, (_event, filename) => {
          const name = filename?.toString().replaceAll('\\', '/') ?? '';
          if (!SOURCE.some(path => name === path || name.startsWith(path + '/')) && !(name.startsWith('dist/client/') && this.state.build.phase !== 'running')) return;
          clearTimeout(this.timer); this.timer = setTimeout(() => { void this.refresh(); }, 250);
        });
        this.watcher.on('error', error => { this.state.sourceError = `源码更新监听失败：${message(error)}`; this.emit(); });
      } catch (error) { this.state.sourceError = `源码更新监听失败：${message(error)}`; this.emit(); }
    })();
    return this.initializing;
  }
  private refresh(): Promise<void> {
    const next = this.refreshing.then(async () => {
      try {
        const root = await realpath(this.state.root), hash = createHash('sha256');
        let latest = 0;
        const visit = async (file: string): Promise<void> => {
          const info = await lstat(file).catch(() => null);
          if (!info || info.isSymbolicLink()) return;
          if (info.isDirectory()) {
            for (const entry of (await readdir(file)).sort()) await visit(join(file, entry));
          } else if (info.isFile()) { latest = Math.max(latest, info.mtimeMs); hash.update(relative(root, file)); hash.update(await readFile(file)); }
        };
        for (const path of SOURCE) await visit(join(root, path));
        this.state.sourceRevision = hash.digest('hex'); this.state.sourceError = '';
        if (this.state.build.phase !== 'running') {
          const output = createHash('sha256');
          let oldest = Infinity;
          try {
            for (const name of PAGES) {
              const file = join(root, 'dist', 'client', name), info = await stat(file);
              oldest = Math.min(oldest, info.mtimeMs); output.update(name); output.update(String(info.mtimeMs)); output.update(await readFile(file));
            }
            const buildRevision = output.digest('hex');
            if (buildRevision !== this.state.buildRevision && !this.building) this.builtSourceRevision = latest <= oldest ? this.state.sourceRevision : undefined;
            this.state.buildRevision = buildRevision;
            this.state.sourceChanged = this.builtSourceRevision ? this.builtSourceRevision !== this.state.sourceRevision : latest > oldest;
          } catch { this.state.buildRevision = ''; this.state.sourceChanged = true; }
        } else this.state.sourceChanged = true;
      } catch (error) { this.state.sourceError = `项目源码读取失败：${message(error)}`; this.state.sourceChanged = true; }
      this.emit();
    });
    this.refreshing = next.catch(() => {}); return this.refreshing;
  }
  async readState(): Promise<HushHourState> { await this.initialize(); return this.snapshot(); }
  async configureOnline(input: unknown): Promise<HushHourState> {
    const url = GameOnlineUrlSchema.parse(input); await this.initialize();
    const temporary = join(this.options.dataDir, 'settings.tmp');
    await writeFile(temporary, JSON.stringify({ onlineUrl: url })); await rename(temporary, join(this.options.dataDir, 'settings.json'));
    this.state.online = { url }; this.emit(); return this.snapshot();
  }
  open(): Promise<HushHourState> {
    this.opening ??= this.start().finally(() => { this.opening = undefined; });
    return this.opening;
  }
  private async start(): Promise<HushHourState> {
    await this.initialize();
    if (this.disposed) throw new Error('Hush-Hour 工作区已关闭。');
    if (this.state.service.phase === 'running') return this.snapshot();
    this.state.service = { phase: 'starting', url: '', message: '本地启动中…' }; this.emit();
    try {
      const url = await this.preview.open();
      this.state.service = { phase: 'running', url, message: '本地运行中' };
    } catch (error) { this.state.service = { phase: 'error', url: '', message: message(error) }; this.emit(); throw error; }
    this.emit(); return this.snapshot();
  }
  async stop(): Promise<HushHourState> {
    if (this.state.build.phase === 'running') throw new Error('请等待构建完成或先取消构建。');
    await this.opening?.catch(() => {}); await this.preview.dispose();
    this.state.service = { phase: 'stopped', url: '', message: '本地已停止' }; this.emit(); return this.snapshot();
  }
  async restart(): Promise<HushHourState> { await this.stop(); return this.open(); }
  build(): Promise<HushHourState> {
    this.building ??= this.runBuild().finally(() => { this.building = undefined; });
    return this.building;
  }
  private async runBuild(): Promise<HushHourState> {
    await this.initialize(); await this.refresh();
    if (this.disposed) throw new Error('Hush-Hour 工作区已关闭。');
    const root = await realpath(this.state.root), script = await realpath(join(root, 'dev', 'build-site.mjs'));
    if (!inside(root, script)) throw new Error('构建脚本必须位于 Hush-Hour 项目内。');
    const sourceRevision = this.state.sourceRevision, startedAt = Date.now();
    this.cancelled = false;
    this.state.build = { phase: 'running', output: '', message: '正在构建 Hush-Hour…', startedAt }; this.emit();
    try {
      const child = spawn(this.options.runtime ?? process.execPath, [script], { cwd: root, windowsHide: true, detached: process.platform !== 'win32', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
      this.child = child;
      for (const stream of [child.stdout, child.stderr]) {
        stream?.setEncoding('utf8'); stream?.on('data', (data: string) => { this.state.build.output = (this.state.build.output + data).slice(-64000); this.emit(); });
      }
      const code = await new Promise<number | null>((done, reject) => { child.once('error', reject); child.once('close', done); });
      if (this.cancelled) { this.state.build.phase = 'cancelled'; this.state.build.message = '构建已取消'; }
      else {
        if (code !== 0) throw new Error(`构建失败（退出码 ${code ?? '未知'}），请查看构建日志。`);
        for (const name of PAGES) {
          const info = await stat(join(root, 'dist', 'client', name)).catch(() => null);
          if (!info?.isFile() || info.mtimeMs < startedAt) throw new Error(`构建未生成最新的 ${name}，请查看构建日志。`);
        }
        this.state.build.phase = 'passed'; this.state.build.message = '构建完成'; this.builtSourceRevision = sourceRevision;
      }
    } catch (error) { this.state.build.phase = this.cancelled ? 'cancelled' : 'failed'; this.state.build.message = this.cancelled ? '构建已取消' : message(error); }
    finally { this.child = undefined; this.state.build.finishedAt = Date.now(); }
    await this.refresh();
    if (this.state.build.phase === 'passed' && this.state.sourceRevision !== sourceRevision) { this.state.sourceChanged = true; this.state.build.message = '构建完成，构建期间源码又有更新，请重新构建。'; }
    if (this.state.build.phase === 'passed' && this.state.service.phase !== 'running') await this.open().catch(() => {});
    this.emit(); return this.snapshot();
  }
  async cancelBuild(): Promise<void> {
    const child = this.child;
    if (!child?.pid || child.exitCode !== null) return;
    this.cancelled = true;
    if (process.platform === 'win32') await new Promise<void>(done => { execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }, error => { if (error) child.kill(); done(); }); });
    else { try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill(); } }
  }
  async readDocument(input: unknown = 'README.md'): Promise<GameDocument> {
    if (typeof input !== 'string' || !input || input.length > 2000 || input.includes('\0') || input.includes(':') || isAbsolute(input) || !/\.(md|markdown)$/i.test(input)) throw new Error('请使用项目内的 Markdown 文档相对路径。');
    const root = await realpath(this.state.root), candidate = resolve(root, input);
    if (!inside(root, candidate)) throw new Error('文档必须位于 Hush-Hour 项目内。');
    const file = await realpath(candidate), info = await stat(file);
    if (!inside(root, file) || !/\.(md|markdown)$/i.test(file) || !info.isFile() || info.size > 1024 * 1024) throw new Error('只支持项目内 1 MiB 以内的 Markdown 文档。');
    return { path: relative(root, file).replaceAll('\\', '/'), content: (await readFile(file, 'utf8')).replace(/^\uFEFF/, '') };
  }
  async capture(png: Buffer, url: string, revision: string, context?: Pick<HushHourArtifact, 'environment' | 'siteUrl'>): Promise<HushHourArtifact> {
    if (png.length > 20 * 1024 * 1024 || !png.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) throw new Error('截图不是有效的 PNG 或超过 20 MB。');
    const artifact = HushHourArtifactSchema.parse({ id: randomUUID(), name: `Hush-Hour · ${context?.environment === 'online' ? '正式网页' : '本地预览'} · ${new Date().toLocaleString('zh-CN')}`, url, revision, capturedAt: Date.now(), ...context });
    const file = join(await this.capturesRoot(), `${artifact.id}.png`);
    await writeFile(file, png); this.state.captures = [...this.state.captures, artifact].slice(-40);
    this.saving = this.saving.catch(() => {}).then(async () => {
      const temporary = join(this.options.dataDir, 'captures.tmp');
      await writeFile(temporary, JSON.stringify(this.state.captures)); await rename(temporary, join(this.options.dataDir, 'captures.json'));
    });
    try { await this.saving; } catch (error) { this.state.captures = this.state.captures.filter(item => item.id !== artifact.id); await unlink(file); throw error; }
    this.emit(); return artifact;
  }
  async artifactPath(input: unknown): Promise<string> {
    const artifact = this.state.captures.find(item => item.id === input);
    if (!artifact) throw new Error('Hush-Hour 截图不存在。');
    const root = await this.capturesRoot(), file = await realpath(join(root, `${artifact.id}.png`));
    if (!inside(root, file) || !(await stat(file)).isFile()) throw new Error('截图文件路径无效。');
    return file;
  }
  private async capturesRoot(): Promise<string> {
    const root = join(this.options.dataDir, 'captures');
    await mkdir(root, { recursive: true });
    if ((await lstat(root)).isSymbolicLink()) throw new Error('截图目录不能是符号链接。');
    return realpath(root);
  }
  async dispose(): Promise<void> {
    this.disposed = true; this.watcher?.close(); clearTimeout(this.timer);
    await this.cancelBuild(); await this.building?.catch(() => {}); await this.opening?.catch(() => {});
    await this.preview.dispose(); await this.refreshing; await this.saving.catch(() => {}); this.listeners.clear();
  }
}
