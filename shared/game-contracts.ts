import { z } from 'zod';

export const GAME_TASKS = [
  { id: 'rules', label: '案件规则', script: 'cases/validate-game.cjs', group: 'quick' },
  { id: 'progress', label: '存档与解锁', script: 'tests/progress.cjs', group: 'quick' },
  { id: 'entry', label: '案件入口', script: 'tests/case-entry.cjs', group: 'quick' },
  { id: 'theme', label: '主题切换', script: 'tests/theme.cjs', group: 'quick' },
  { id: 'loading', label: '场景加载', script: 'tests/scene-loading.cjs', group: 'quick' },
  { id: 'playthrough', label: '浏览器完整流程', script: 'tests/game.e2e.cjs', group: 'full' },
] as const;
export type GameTaskId = typeof GAME_TASKS[number]['id'];
export const GameRunScopeSchema = z.enum(['quick', 'full', ...GAME_TASKS.map(task => task.id)]);
export type GameRunScope = z.infer<typeof GameRunScopeSchema>;
export const GameConfigSchema = z.object({
  root: z.string().trim().min(1).max(1000),
  webRoot: z.string().trim().min(1).max(200),
  port: z.number().int().min(1024).max(65535),
  playwrightModule: z.string().max(1000).default(''),
});
export type GameConfig = z.infer<typeof GameConfigSchema>;
export const DEFAULT_GAME_CONFIG: GameConfig = {
  root: 'C:\\Myself\\Personal_Game\\Trail-Detective', webRoot: 'ui-preview', port: 8765, playwrightModule: '',
};
export type GameTaskStatus = 'idle' | 'queued' | 'running' | 'passed' | 'failed' | 'cancelled' | 'unavailable';
export interface GameArtifact { id: string; name: string; file: string; }
export interface GameTaskResult {
  id: string; taskId: GameTaskId; status: GameTaskStatus; revision: string;
  root: string; url: string;
  startedAt?: number; finishedAt?: number; exitCode?: number | null;
  output: string; message: string; artifacts: GameArtifact[];
}
export interface GameState {
  config: GameConfig; revision: string; sourceError: string;
  service: { phase: 'stopped' | 'starting' | 'running' | 'error'; owned: boolean; message: string; url: string; };
  running: boolean; results: Partial<Record<GameTaskId, GameTaskResult>>;
  captures: GameArtifact[]; logs: string[];
}
export const GameTerminalSizeSchema = z.object({ cols: z.number().int().min(20).max(500), rows: z.number().int().min(2).max(200) });
export interface GameTerminalState {
  id: string; phase: 'idle' | 'starting' | 'running' | 'exited' | 'error'; cwd: string;
  pid?: number; exitCode?: number; message: string;
}
export interface GameTerminalSnapshot extends GameTerminalState { output: string; sequence: number; }
export type GameTerminalEvent = { kind: 'state'; state: GameTerminalState }
  | { kind: 'data'; id: string; sequence: number; data: string }
  | { kind: 'clear'; id: string; sequence: number };
export interface GameTerminalBridge {
  state(): Promise<GameTerminalSnapshot>;
  open(size: z.infer<typeof GameTerminalSizeSchema>): Promise<GameTerminalSnapshot>;
  write(id: string, data: string): Promise<void>;
  resize(id: string, cols: number, rows: number): Promise<void>;
  clear(id: string): Promise<void>;
  close(id: string): Promise<void>;
  onEvent(callback: (event: GameTerminalEvent) => void): () => void;
}
export interface GameBridge {
  terminal: GameTerminalBridge;
  state(): Promise<GameState>;
  configure(config: GameConfig): Promise<GameState>;
  chooseRoot(): Promise<string | null>;
  start(): Promise<GameState>;
  stop(): Promise<GameState>;
  connect(): Promise<GameState>;
  run(scope: GameRunScope): Promise<GameState>;
  cancel(): Promise<GameState>;
  open(target: 'root' | 'docs' | 'preview'): Promise<void>;
  capture(tabId: string): Promise<GameArtifact>;
  openArtifact(id: string): Promise<void>;
  onChanged(callback: (state: GameState) => void): () => void;
}
export const gameResultStale = (result: GameTaskResult | undefined, revision: string): boolean =>
  !!result && !!result.startedAt && result.revision !== revision;
export function gameProblemReport(state: GameState, result: GameTaskResult, page: string, viewport: string, notes = ''): string {
  const task = GAME_TASKS.find(item => item.id === result.taskId)!;
  return [`项目：轨迹侦探`, `目录：${result.root}`, `任务：${task.label}`, `脚本：${task.script}`,
    `状态：${result.status}${gameResultStale(result, state.revision) ? '（代码已变化，待重测）' : ''}`,
    `测试服务：${result.url}`, `当前试玩页面：${page}`, `视口：${viewport}`, `时间：${result.startedAt ? new Date(result.startedAt).toLocaleString('zh-CN') : '未执行'}`,
    `说明：${result.message}`, '', '复现步骤 / 期望表现 / 实际表现：', notes.slice(0, 4000) || '（待补充）', '',
    '附件：', ...result.artifacts.map(item => item.file), ...state.captures.map(item => item.file), '',
    '原始输出：', result.output || '暂无输出'].join('\n').slice(0, 19000);
}
