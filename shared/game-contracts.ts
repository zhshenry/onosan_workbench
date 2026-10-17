import { z } from 'zod';
import type { GameDocument } from './game-documents';
import type { GameIssueBridge } from './game-issues';

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
export const GameOnlineUrlSchema = z.string().trim().max(2048).refine(value => {
  if (!value) return true;
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
}, '请填写完整的 HTTP 或 HTTPS 线上地址，不包含账号密码。').transform(value => value ? new URL(value).href : '');
export interface GameOnlineCheck {
  url: string; status: 'checking' | 'passed' | 'failed'; message: string;
  checkedAt?: number; httpStatus?: number;
}
export interface GameOnlineState { url: string; check?: GameOnlineCheck; }
export const GameTrialResetSchema = z.strictObject({
  environment: z.enum(['local', 'online']),
  origin: z.string().max(2048).refine(value => URL.canParse(value) && ['http:', 'https:'].includes(new URL(value).protocol) && new URL(value).origin === value, '试玩站点无效。'),
});
export type GameTrialReset = z.infer<typeof GameTrialResetSchema>;
export const DEFAULT_GAME_CONFIG: GameConfig = {
  root: 'C:\\Myself\\Personal_Game\\Trail-Detective', webRoot: 'ui-preview', port: 8765, playwrightModule: '',
};
export type GameTaskStatus = 'idle' | 'queued' | 'running' | 'passed' | 'failed' | 'cancelled' | 'unavailable';
export interface GameArtifact {
  id: string; name: string; file: string;
  environment?: 'local' | 'online'; url?: string; siteUrl?: string; capturedAt?: number;
}
export interface GameTaskResult {
  id: string; taskId: GameTaskId; status: GameTaskStatus; revision: string;
  root: string; url: string;
  startedAt?: number; finishedAt?: number; exitCode?: number | null;
  output: string; message: string; artifacts: GameArtifact[];
}
export interface GameState {
  config: GameConfig; revision: string; sourceError: string;
  online: GameOnlineState;
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
  issues: GameIssueBridge;
  terminal: GameTerminalBridge;
  state(): Promise<GameState>;
  configure(config: GameConfig): Promise<GameState>;
  configureOnline(url: string): Promise<GameState>;
  checkOnline(): Promise<GameState>;
  openOnline(tabId?: string): Promise<void>;
  resetTrial(input: GameTrialReset): Promise<void>;
  readDocument(path?: string): Promise<GameDocument>;
  openDocumentLink(url: string): Promise<void>;
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
export function gameTrialReport(online: GameOnlineState, page: string, viewport: string, zoom: number, profile: string, notes: string, artifacts: GameArtifact[]): string {
  const check = online.check;
  return ['项目：轨迹侦探', '环境：线上试玩', `配置地址：${online.url}`, `当前页面：${page}`,
    `视口：${viewport}`, `网页缩放：${Math.round(zoom * 100)}%`, `试玩档：${profile}`,
    `记录时间：${new Date().toLocaleString('zh-CN')}`, '发布版本：未接入',
    `访问检查：${check?.message || '尚未检查'}${check?.checkedAt ? `（${new Date(check.checkedAt).toLocaleString('zh-CN')}）` : ''}`,
    '', '复现步骤 / 期望表现 / 实际表现：', notes.slice(0, 4000) || '（待补充）', '', '附件：',
    ...artifacts.map(item => `${item.file}${item.url ? `\n截图页面：${item.url}` : ''}`)].join('\n').slice(0, 19000);
}
export function gameProblemReport(state: GameState, result: GameTaskResult, page: string, viewport: string, notes = ''): string {
  const task = GAME_TASKS.find(item => item.id === result.taskId)!;
  return [`项目：轨迹侦探`, `目录：${result.root}`, `任务：${task.label}`, `脚本：${task.script}`,
    `状态：${result.status}${gameResultStale(result, state.revision) ? '（代码已变化，待重测）' : ''}`,
    `测试服务：${result.url}`, `当前试玩页面：${page}`, `视口：${viewport}`, `时间：${result.startedAt ? new Date(result.startedAt).toLocaleString('zh-CN') : '未执行'}`,
    `说明：${result.message}`, '', '复现步骤 / 期望表现 / 实际表现：', notes.slice(0, 4000) || '（待补充）', '',
    '附件：', ...result.artifacts.map(item => item.file), ...state.captures.filter(item => item.environment !== 'online').map(item => item.file), '',
    '原始输出：', result.output || '暂无输出'].join('\n').slice(0, 19000);
}
