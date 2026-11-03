import { z } from 'zod';
import type { GameTerminalBridge } from './game-contracts';

export const WEBSITE_COLLECTIONS = { works: '作品', blog: '博客', library: '文库' } as const;
export type WebsiteCollection = keyof typeof WEBSITE_COLLECTIONS;
export const WebsiteIdSchema = z.string().max(400).refine(value => /^(works|blog|library)\/.+\.md$/.test(value) && !value.includes('\\') && value.split('/').every(part => part && part !== '.' && part !== '..' && !/[<>:"|?*\x00-\x1f]/.test(part) && !/[. ]$/.test(part)), '请选择内容目录内的 Markdown 文件。');
const text = z.string().max(10000);
export const WebsiteFieldsSchema = z.object({
  title: text, description: text.optional(), summary: text.optional(), date: text.optional(), tags: z.array(z.string().max(200)).max(100).optional(),
  year: z.number().int().min(1).max(9999).optional(), category: z.enum(['product', 'game', 'skills']).optional(),
  cover: text.optional(), link: text.optional(), featured: z.boolean().optional(), order: z.number().finite().optional(),
  titleEn: text.optional(), board: text.optional(), topic: text.optional(), section: text.optional(),
}).strict();
export type WebsiteFields = z.infer<typeof WebsiteFieldsSchema>;
export const WebsiteSaveSchema = z.object({ id: WebsiteIdSchema, version: z.string().regex(/^(?:[a-f0-9]{64})?$/), fields: WebsiteFieldsSchema, body: z.string().max(1000000) }).strict();
export type WebsiteSave = z.infer<typeof WebsiteSaveSchema>;
export interface WebsiteContent extends WebsiteSave { collection: WebsiteCollection; source: string; slug?: string }
export interface WebsiteContentSummary { id: string; collection: WebsiteCollection; title: string; error?: string }
export interface WebsiteCheck { path: string; label: string; status: 'passed' | 'failed'; message: string }
export interface WebsiteState {
  root: string;
  service: { phase: 'stopped' | 'starting' | 'running' | 'error'; url: string; message: string; output: string };
  build: { phase: 'idle' | 'running' | 'passed' | 'failed' | 'cancelled'; output: string; message: string; finishedAt?: number };
  checks: { phase: 'idle' | 'running' | 'passed' | 'failed'; results: WebsiteCheck[]; finishedAt?: number };
  onlineUrl: string;
}
export interface PersonalWebsiteBridge {
  state(): Promise<WebsiteState>; start(): Promise<WebsiteState>; stop(): Promise<WebsiteState>;
  build(): Promise<WebsiteState>; cancelBuild(): Promise<void>; checkPages(): Promise<WebsiteState>;
  list(): Promise<WebsiteContentSummary[]>; read(id: string): Promise<WebsiteContent>; save(input: WebsiteSave): Promise<WebsiteContent>;
  previewSave(input: WebsiteSave): Promise<{ before: string; after: string }>;
  chooseCover(): Promise<{ path: string; preview: string } | null>; coverPreview(path: string): Promise<string>;
  configureOnline(url: string): Promise<WebsiteState>; openFolder(): Promise<void>; openExternal(url: string): Promise<void>;
  onChanged(callback: (state: WebsiteState) => void): () => void;
  terminal: GameTerminalBridge;
}

export function websitePreviewPath(content?: Pick<WebsiteContent, 'collection' | 'slug'>): string {
  if (!content) return '/';
  if (content.collection === 'works') return '/#works';
  if (content.collection === 'library') return '/#library';
  return content.slug ? '/blog/' + content.slug.split('/').map(encodeURIComponent).join('/') + '/' : '/#blog';
}
