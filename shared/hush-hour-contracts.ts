import { z } from 'zod';
import type { GameTerminalBridge } from './game-contracts';
import type { GameDocument } from './game-documents';

const revision = z.string().regex(/^(?:[a-f0-9]{64})?$/);
const pageUrl = z.string().max(2048).refine(value => !value || URL.canParse(value) && ['http:', 'https:'].includes(new URL(value).protocol) && !new URL(value).username && !new URL(value).password);
export const DEFAULT_HUSH_HOUR_ONLINE_URL = 'https://hush-hour.onosakayan.chatgpt.site/';
const environment = z.enum(['local', 'online']).default('local');
export type HushHourEnvironment = z.infer<typeof environment>;
export const HushHourArtifactSchema = z.object({ id: z.string().uuid(), name: z.string(), url: pageUrl, revision, capturedAt: z.number(), environment, siteUrl: pageUrl.default('') });
export type HushHourArtifact = z.infer<typeof HushHourArtifactSchema>;
export interface HushHourState {
  root: string; sourceRevision: string; buildRevision: string; sourceChanged: boolean; sourceError: string;
  service: { phase: 'stopped' | 'starting' | 'running' | 'error'; url: string; message: string };
  online: { url: string };
  build: { phase: 'idle' | 'running' | 'passed' | 'failed' | 'cancelled'; output: string; message: string; startedAt?: number; finishedAt?: number };
  captures: HushHourArtifact[];
}
export const HushHourIssueIdSchema = z.string().regex(/^HH-\d{8}-[a-f0-9]{8}$/);
export const HushHourIssueDraftSchema = z.object({
  title: z.string().trim().min(1, '请填写问题标题。').max(160), steps: z.string().trim().min(1, '请填写复现步骤。').max(4000),
  expected: z.string().trim().min(1, '请填写期望表现。').max(2000), actual: z.string().trim().min(1, '请填写实际表现。').max(2000),
  pageUrl, viewport: z.enum(['fit', 'desktop', 'narrow']), zoom: z.number().min(.25).max(5), previewRevision: revision, environment, siteUrl: pageUrl.default(''),
  screenshotIds: z.array(z.string().uuid()).max(6), includeLogs: z.boolean(),
}).strict();
export type HushHourIssueDraft = z.infer<typeof HushHourIssueDraftSchema>;
export const HushHourIssueRecordSchema = HushHourIssueDraftSchema.extend({
  schemaVersion: z.literal(1), id: HushHourIssueIdSchema, createdAt: z.number(), projectRoot: z.string(), currentBuildRevision: revision,
  buildLog: z.string().max(64000), images: z.array(z.object({ id: z.string().uuid(), name: z.string(), file: z.string().regex(/^screenshots\/[1-6]\.png$/) })).max(6),
});
export type HushHourIssueRecord = z.infer<typeof HushHourIssueRecordSchema>;
export type HushHourIssue = HushHourIssueRecord & { directory: string };
export type HushHourIssueSummary = Pick<HushHourIssue, 'id' | 'title' | 'createdAt' | 'environment'>;
export interface HushHourImage { issueId?: string; id: string }
export function hushHourIssueReport(issue: HushHourIssueRecord): string {
  return [`# ${issue.title}`, '', `项目：Hush-Hour`, `问题编号：${issue.id}`, `保存时间：${new Date(issue.createdAt).toLocaleString('zh-CN')}`,
    `环境：${issue.environment === 'online' ? '正式网页' : '本地预览'}`, `项目目录：${issue.projectRoot}`, `页面：${issue.pageUrl || '尚未打开'}`, `视口：${issue.viewport === 'fit' ? '跟随窗口' : issue.viewport === 'desktop' ? '1440×1000' : '390×844'} · 缩放 ${Math.round(issue.zoom * 100)}%`,
    ...(issue.environment === 'online' ? [`正式地址：${issue.siteUrl}`] : [`预览构建：${issue.previewRevision || '尚未载入'}`, `记录时本地构建：${issue.currentBuildRevision || '尚未构建'}`]),
    '', '## 复现步骤', issue.steps, '', '## 期望表现', issue.expected, '', '## 实际表现', issue.actual,
    '', '## 截图', ...issue.images.map(image => `![${image.name}](${image.file})`), '', '## 日志', issue.environment === 'online' ? '正式网页运行日志未接入。' : issue.includeLogs ? '构建日志见 build-output.txt（保存时快照）。' : '未附带构建日志。'].join('\n');
}
export interface HushHourBridge {
  open(): Promise<HushHourState>; state(): Promise<HushHourState>; stop(): Promise<HushHourState>; restart(): Promise<HushHourState>;
  build(): Promise<HushHourState>; cancelBuild(): Promise<void>; openFolder(): Promise<void>;
  configureOnline(url: string): Promise<HushHourState>;
  readDocument(path?: string): Promise<GameDocument>; openDocumentLink(url: string): Promise<void>;
  capture(input: { tabId: string; revision: string }): Promise<HushHourArtifact>; openExternal(tabId: string): Promise<void>;
  onChanged(callback: (state: HushHourState) => void): () => void;
  terminal: GameTerminalBridge;
  issues: {
    directory(): Promise<string>; list(): Promise<HushHourIssueSummary[]>; read(id: string): Promise<HushHourIssue>;
    save(draft: HushHourIssueDraft): Promise<HushHourIssue>; preview(image: HushHourImage): Promise<string>; openImage(image: HushHourImage): Promise<void>;
    openFolder(id?: string): Promise<void>; export(id: string): Promise<string | null>;
  };
}
