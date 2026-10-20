import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { IPty, IPtyForkOptions } from 'node-pty';
import { GameTerminalSizeSchema, type GameTerminalEvent, type GameTerminalSnapshot, type GameTerminalState } from '../shared/game-contracts';

type PtyProcess = Pick<IPty, 'pid' | 'write' | 'resize' | 'clear' | 'kill' | 'onData' | 'onExit'>;
type PtySpawn = (shell: string, args: string[], options: IPtyForkOptions) => PtyProcess;

/** One manually operated project shell. Output stays in memory; no AI command tool. */
export class GameTerminal {
  private state: GameTerminalState = { id: '', phase: 'idle', cwd: '', message: '尚未打开项目终端' };
  private pty?: PtyProcess;
  private output = '';
  private sequence = 0;
  private opening?: Promise<GameTerminalSnapshot>;
  private exited = Promise.resolve();
  private disposed = false;
  private listeners = new Set<(event: GameTerminalEvent) => void>();
  constructor(private readonly options: { spawn?: PtySpawn; shell?: string } = {}) {}
  get active(): boolean { return !!this.pty || !!this.opening; }
  snapshot(): GameTerminalSnapshot { return { ...this.state, output: this.output, sequence: this.sequence }; }
  subscribe(listener: (event: GameTerminalEvent) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private emit(event: GameTerminalEvent): void { for (const listener of this.listeners) listener(event); }
  private changed(): void { this.emit({ kind: 'state', state: { ...this.state } }); }
  private append(data: string): void {
    this.output = (this.output + data).slice(-500000);
    this.emit({ kind: 'data', id: this.state.id, sequence: ++this.sequence, data });
  }
  open(root: string, size: unknown): Promise<GameTerminalSnapshot> {
    const dimensions = GameTerminalSizeSchema.parse(size);
    if (this.pty) { this.pty.resize(dimensions.cols, dimensions.rows); return Promise.resolve(this.snapshot()); }
    this.opening ??= this.start(root, dimensions).finally(() => { this.opening = undefined; });
    return this.opening;
  }
  private async start(root: string, size: { cols: number; rows: number }): Promise<GameTerminalSnapshot> {
    this.state = { id: randomUUID(), phase: 'starting', cwd: root, message: '正在打开 PowerShell…' };
    this.output = ''; this.sequence = 0; this.changed();
    try {
      const cwd = await realpath(root);
      if (!(await stat(cwd)).isDirectory()) throw new Error('项目目录无效');
      if (this.disposed) throw new Error('项目终端已关闭');
      const shell = this.options.shell ?? join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
      if (!existsSync(shell)) throw new Error('未找到 Windows PowerShell');
      const spawn: PtySpawn = this.options.spawn ?? createRequire(import.meta.url)('node-pty').spawn;
      const env: NodeJS.ProcessEnv = { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' };
      delete env.ELECTRON_RUN_AS_NODE;
      const pty = spawn(shell, ['-NoLogo', '-NoProfile'], { name: 'xterm-256color', cwd, env, ...size });
      this.pty = pty;
      let finished!: () => void;
      this.exited = new Promise<void>(done => { finished = done; });
      pty.onData(data => { if (this.pty === pty) this.append(data); });
      pty.onExit(({ exitCode }) => {
        if (this.pty === pty) {
          this.pty = undefined;
          this.append(`\r\n[PowerShell 会话已结束，退出码 ${exitCode}]\r\n`);
          this.state = { ...this.state, phase: 'exited', exitCode, message: `会话已结束 · 退出码 ${exitCode}` };
          this.changed();
        }
        finished();
      });
      this.state = { id: this.state.id, phase: 'running', cwd, pid: pty.pid, message: 'PowerShell · 已连接' };
    } catch (error) { this.state = { ...this.state, phase: 'error', message: `终端无法启动：${error instanceof Error ? error.message : String(error)}` }; }
    this.changed(); return this.snapshot();
  }
  private current(id: string): void {
    if (id !== this.state.id || !id) throw new Error('终端会话已变化，请重新打开终端');
  }
  write(id: string, data: string): void {
    this.current(id);
    if (typeof data !== 'string' || data.length > 65536) throw new Error('单次终端输入不能超过 64KB');
    if (!this.pty) throw new Error('终端会话未连接');
    this.pty.write(data);
  }
  resize(id: string, size: unknown): void {
    this.current(id); const dimensions = GameTerminalSizeSchema.parse(size);
    this.pty?.resize(dimensions.cols, dimensions.rows);
  }
  clear(id: string): void {
    this.current(id); this.pty?.clear(); this.output = '';
    this.emit({ kind: 'clear', id, sequence: ++this.sequence });
  }
  async close(id: string): Promise<void> {
    this.current(id);
    const pty = this.pty;
    if (!pty) return;
    pty.kill();
    await this.exited;
  }
  async dispose(): Promise<void> {
    this.disposed = true;
    await this.opening;
    if (this.pty) await this.close(this.state.id);
    this.listeners.clear();
  }
}
