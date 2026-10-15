import { z } from 'zod';

const id = z.string().min(1).max(100);
const point = z.object({ x: z.number().finite().nonnegative(), y: z.number().finite().nonnegative() }).strict();
export const browserSelectorSchema = z.object({
  by: z.enum(['role', 'label', 'text', 'placeholder', 'testId', 'css']), value: z.string().min(1).max(1000),
  name: z.string().max(300).optional(), exact: z.boolean().default(true),
}).strict();
export type BrowserSelector = z.infer<typeof browserSelectorSchema>;
export const browserQuerySchema = z.object({
  frameId: id.optional(), selector: browserSelectorSchema.optional(), within: z.array(browserSelectorSchema).max(5).optional(),
  and: z.array(browserSelectorSchema).max(5).optional(), or: z.array(browserSelectorSchema).max(5).optional(),
  has: browserSelectorSchema.optional(), hasNot: browserSelectorSchema.optional(),
  hasText: z.string().max(1000).optional(), hasNotText: z.string().max(1000).optional(), visible: z.boolean().optional(),
  nth: z.number().int().min(0).max(50000).optional(), offset: z.number().int().min(0).max(50000).default(0), limit: z.number().int().min(1).max(250).default(100),
  textOffset: z.number().int().min(0).max(2000000).default(0), textLimit: z.number().int().min(1).max(14000).default(14000),
}).strict();
export type BrowserQuery = z.infer<typeof browserQuerySchema>;
export const browserActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('click'), ref: id, button: z.enum(['left', 'right']).default('left'), count: z.number().int().min(1).max(2).default(1) }).strict(),
  z.object({ type: z.literal('hover'), ref: id }).strict(),
  z.object({ type: z.literal('fill'), ref: id, text: z.string().max(12000) }).strict(),
  z.object({ type: z.literal('setChecked'), ref: id, checked: z.boolean() }).strict(),
  z.object({ type: z.literal('pressSequentially'), ref: id, text: z.string().max(1000), delayMs: z.number().int().min(0).max(200).default(0) }).strict(),
  z.object({ type: z.literal('select'), ref: id, values: z.array(z.string().max(1000)).min(1).max(30), by: z.enum(['value', 'label']).default('value') }).strict(),
  z.object({ type: z.literal('press'), ref: id.optional(), key: z.enum(['Enter', 'Space', 'Tab', 'Escape', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'Control+A', 'Control+Enter', 'Shift+Tab']) }).strict(),
  z.object({ type: z.literal('type'), text: z.string().max(12000) }).strict(),
  z.object({ type: z.literal('coordinate'), screenshotId: id, point, button: z.enum(['left', 'right']).default('left'), count: z.number().int().min(1).max(2).default(1) }).strict(),
  z.object({ type: z.literal('scroll'), screenshotId: id, point, deltaX: z.number().finite().min(-5000).max(5000).default(0), deltaY: z.number().finite().min(-5000).max(5000) }).strict(),
  z.object({ type: z.literal('drag'), screenshotId: id, from: point, to: point }).strict(),
  z.object({ type: z.literal('locator'), query: browserQuerySchema, timeoutMs: z.number().int().min(0).max(15000).default(5000), action: z.discriminatedUnion('type', [
    z.object({ type: z.literal('click'), button: z.enum(['left', 'right']).default('left'), count: z.number().int().min(1).max(2).default(1) }).strict(),
    z.object({ type: z.literal('hover') }).strict(),
    z.object({ type: z.literal('fill'), text: z.string().max(12000) }).strict(),
    z.object({ type: z.literal('setChecked'), checked: z.boolean() }).strict(),
    z.object({ type: z.literal('pressSequentially'), text: z.string().max(1000), delayMs: z.number().int().min(0).max(200).default(0) }).strict(),
    z.object({ type: z.literal('select'), values: z.array(z.string().max(1000)).min(1).max(30), by: z.enum(['value', 'label']).default('value') }).strict(),
  ]) }).strict(),
]);
export type BrowserAction = z.infer<typeof browserActionSchema>;
export const browserConditionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string().min(1).max(1000), present: z.boolean().default(true) }).strict(),
  z.object({ type: z.literal('url'), text: z.string().min(1).max(2000) }).strict(),
  z.object({ type: z.literal('element'), role: z.string().min(1).max(100), name: z.string().max(300), frameId: id.optional(), present: z.boolean().default(true) }).strict(),
  z.object({ type: z.literal('field'), role: z.string().min(1).max(100), name: z.string().max(300), frameId: id.optional(), value: z.string().max(1000).optional(), checked: z.boolean().optional(), selected: z.boolean().optional(), expanded: z.boolean().optional() }).strict().refine(value => ['value', 'checked', 'selected', 'expanded'].some(key => key in value), '请指定要核验的字段值或状态'),
  z.object({ type: z.literal('locator'), query: browserQuerySchema, present: z.boolean().default(true), count: z.number().int().min(0).max(50000).optional(), value: z.string().max(1000).optional(), checked: z.boolean().optional(), selected: z.boolean().optional(), expanded: z.boolean().optional() }).strict(),
]);
export type BrowserCondition = z.infer<typeof browserConditionSchema>;
export interface BrowserTabInfo { id: string; workspace: string; url: string; title: string; ready: boolean; active: boolean; }
export interface BrowserElement { ref: string; role: string; name: string; value?: string; disabled: boolean; frameId: string; checked?: boolean | 'mixed'; selected?: boolean; expanded?: boolean; tag?: string; attributes?: Record<string, string>; cells?: { text: string; role: string; truncated: boolean }[]; cellsTruncated?: boolean; }
export interface BrowserScreenshot {
  id: string; data: string; mimeType: 'image/jpeg'; width: number; height: number;
  cssWidth: number; cssHeight: number; deviceScaleFactor: number; scrollX: number; scrollY: number; fullPage: boolean;
}
export interface BrowserObservation {
  id: string; tab: BrowserTabInfo; text: string; elements: BrowserElement[];
  frames: { id: string; url: string; available: boolean }[];
  truncated: boolean;
  page?: { totalElements: number; offset: number; nextOffset?: number; totalTextLength: number; textOffset: number; nextTextOffset?: number };
  screenshot?: BrowserScreenshot;
}
export type BrowserTaskStatus = 'ready' | 'running' | 'paused' | 'site-approval' | 'completed' | 'unverified' | 'cancelled' | 'failed' | 'interrupted';
export interface BrowserStep { at: string; operation: string; status: 'ok' | 'error'; detail: string; }
export interface BrowserTask {
  id: string; workspace: string; tabIds: string[]; origins: string[]; goal: string; status: BrowserTaskStatus;
  pendingOrigin?: string; error?: string; persistenceError?: string; chatId?: string; steps: BrowserStep[]; updatedAt: string;
}
export interface BrowserTabCommand { workspace: string; type: 'open' | 'close' | 'select'; tabId: string; url?: string; }
export interface BrowserSavedTab { id: string; url: string; }
export interface BrowserWorkspaceState {
  tabs: BrowserSavedTab[]; activeId: string;
  history: { id: string; url: string; title: string; at: string }[];
  tasks: BrowserTask[];
}
export interface BrowserAutomationBridge {
  tabs(workspace: string): Promise<BrowserTabInfo[]>;
  state(workspace: string): Promise<BrowserWorkspaceState>;
  saveTabs(workspace: string, tabs: BrowserSavedTab[], activeId: string): Promise<void>;
  activate(workspace: string, tabId: string): Promise<void>;
  control(id: string, action: 'pause' | 'resume' | 'cancel' | 'approve-site'): Promise<BrowserTask>;
  onTask(listener: (task: BrowserTask) => void): () => void;
  onTabCommand(listener: (command: BrowserTabCommand) => void): () => void;
  clear(workspace: string, kind: 'history' | 'site-data', origin?: string): Promise<void>;
  deleteHistory(workspace: string, ids: string[]): Promise<void>;
  clearData(input: BrowserClearData): Promise<void>;
}

export const browserClearDataSchema = z.object({
  workspace: z.enum(['default', 'xhs-creator']), origin: z.string().url().optional(),
  kinds: z.array(z.enum(['history', 'cookies', 'site-data', 'cache'])).min(1).max(4), since: z.number().int().nonnegative().optional(),
}).strict();
export type BrowserClearData = z.infer<typeof browserClearDataSchema>;

/** Preserve ordinary routes while excluding authentication callbacks and credential-bearing parameters. */
export function browserRecordUrl(value: string): string {
  try {
    const url = new URL(value); if (value.length > 4096 || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    const sensitive = /(?:token|password|passwd|secret|credential|authorization|api[-_]?key|session|signature)|^(?:code|state|auth|ticket|sig|samlresponse|assertion)$/i;
    if ([...url.searchParams.keys()].some(key => sensitive.test(key)) || /(?:access_token|id_token|token|code|password|secret|authorization)=|^#authorization/i.test(url.hash)) return url.origin + url.pathname;
    return url.href;
  }
  catch { return ''; }
}
