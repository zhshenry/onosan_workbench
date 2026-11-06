import { z } from 'zod';
import { localDay } from './todo-contracts';

export const ISLAND_PAGES = ['schedule', 'files', 'quota', 'tools'] as const;
export type IslandPage = typeof ISLAND_PAGES[number];
export const ISLAND_LABELS: Record<IslandPage, string> = { schedule: '日程待办', files: '置物架', quota: 'AI 额度', tools: '小工具' };
export type IslandMode = 'collapsed' | 'expanded' | 'reminder' | 'speech';
export const ISLAND_DOCKS = ['top', 'left', 'right'] as const;
export type IslandDock = typeof ISLAND_DOCKS[number];
export const ISLAND_DOCK_LABELS: Record<IslandDock, string> = { top: '顶部', left: '左侧', right: '右侧' };
export const ISLAND_SIZES = { collapsed: [580, 40], expanded: [580, 270], reminder: [440, 144], speech: [580, 184] } as const;
const ISLAND_SIDE_SIZES = { collapsed: [64, 360], expanded: [320, 560], reminder: [320, 180], speech: [320, 360] } as const;
export const ISLAND_MOTION_MS = { collapsed: 160, expanded: 200, reminder: 200, speech: 200 } as const;
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const IslandSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  displayId: z.number().int().nullable().default(null),
  dock: z.enum(ISLAND_DOCKS).default('top'),
  topOffset: z.number().int().min(0).max(300).default(0),
  hoverPreview: z.boolean().default(true), // Retain the stored key; it now enables direct hover expansion.
  hideFullscreen: z.boolean().default(true),
  reducedMotion: z.boolean().default(false),
  dnd: z.boolean().default(false), dndStart: time.default('22:00'), dndEnd: time.default('08:00'),
  pages: z.object({ schedule: z.boolean().default(true), files: z.boolean().default(true), quota: z.boolean().default(true), tools: z.boolean().default(true) }).default({ schedule: true, files: true, quota: true, tools: true }),
  lastPage: z.enum(ISLAND_PAGES).default('schedule'),
  scheduleReminders: z.boolean().default(true), todoReminders: z.boolean().default(true), sound: z.boolean().default(false),
  clearFilesOnExit: z.boolean().default(false),
  focusEnabled: z.boolean().default(true), focusMinutes: z.number().int().min(1).max(180).default(25),
  waterEnabled: z.boolean().default(false), waterMinutes: z.number().int().min(10).max(240).default(60),
  waterStart: time.default('09:00'), waterEnd: time.default('18:00'),
  mascotEnabled: z.boolean().default(true), mascotMotion: z.boolean().default(true),
  lowQuota: z.number().int().min(0).max(50).default(10),
});
export type IslandSettings = z.infer<typeof IslandSettingsSchema>;
export type IslandSettingsPatch = Partial<Omit<IslandSettings, 'pages'>> & { pages?: Partial<IslandSettings['pages']> };
export interface IslandFile { id: string; path: string; name: string; directory: boolean; addedAt: number; missing?: boolean; size?: number; }
export const ISLAND_NOTE_MAX_LENGTH = 20000;
export const ISLAND_NOTE_LIMIT = 200;
export interface IslandNote { id: string; text: string; createdAt: number; updatedAt: number; }
export const IslandNoteDraftSchema = z.object({ text: z.string().max(ISLAND_NOTE_MAX_LENGTH, '文字最多 20000 字'), noteId: z.string().max(128).nullable() }).strict();
export type IslandNoteDraft = z.infer<typeof IslandNoteDraftSchema>;
export interface IslandFocus { durationMs: number; remainingMs: number; endsAt: number | null; taskId: string | null; }
export interface IslandReminder { id: string; kind: 'task' | 'meeting' | 'focus' | 'water' | 'quota'; title: string; createdAt: number; taskId?: string; }
export interface IslandData {
  settings: IslandSettings; files: IslandFile[]; focus: IslandFocus | null;
  water: { day: string; count: number; nextAt: number | null; pausedDay: string | null };
  reminders: IslandReminder[];
  quotaAlerts: string[];
  notes: IslandNote[];
  noteDraft: IslandNoteDraft;
}
export interface IslandState extends IslandData { mode: IslandMode; pinned: boolean; quiet: boolean; fullscreenDetection: boolean; error?: string; }
export interface QuotaWindow { label: string; remaining: number; resetsAt: number | null; }
export const ISLAND_QUOTA_PROVIDERS = ['codex', 'zcode', 'cursor', 'grokbot'] as const;
export const ISLAND_QUOTA_LABELS = { codex: 'Codex', zcode: 'Z Code', cursor: 'Cursor', grokbot: 'Grok Bot' } as const;
export interface QuotaProvider {
  id: typeof ISLAND_QUOTA_PROVIDERS[number]; status: 'disconnected' | 'connecting' | 'ready' | 'error' | 'unsupported';
  account: string; accountKey?: string; plan: string; windows: QuotaWindow[]; updatedAt: number | null; message: string;
}
export type IslandNavigation = { view: 'home' | 'settings-island' | 'settings-general'; taskId?: string; section?: 'quota' };
export interface IslandBridge {
  state(): Promise<IslandState>;
  patch(patch: IslandSettingsPatch): Promise<IslandState>;
  mode(mode: IslandMode, reducedMotion?: boolean): Promise<void>;
  pin(): Promise<IslandState>;
  hold(value: boolean): void;
  speechHeight(value: number): void;
  onChanged(callback: (state: IslandState) => void): () => void;
  onError(callback: (message: string) => void): () => void;
  navigate(target: IslandNavigation): Promise<void>;
  onNavigate(callback: (target: IslandNavigation) => void): () => void;
  displays(): Promise<{ id: number; label: string }[]>;
  filesAdd(paths?: string[], directory?: boolean): Promise<IslandState>;
  filePath(file: File): string;
  fileIcon(id: string): Promise<string>;
  fileOpen(id: string): Promise<void>;
  fileDrag(id: string): void;
  fileRelocate(id: string): Promise<IslandState>;
  filesRemove(id?: string): Promise<IslandState>;
  noteDraft(draft: IslandNoteDraft): Promise<IslandState>;
  noteSave(text: string, id?: string): Promise<IslandState>;
  noteRemove(id: string): Promise<IslandState>;
  focus(action: 'start' | 'pause' | 'resume' | 'stop', minutes?: number, taskId?: string): Promise<IslandState>;
  water(action: 'drink' | 'snooze' | 'pause'): Promise<IslandState>;
  dismiss(id: string): Promise<IslandState>;
  quotas(): Promise<QuotaProvider[]>;
  quotaRefresh(): Promise<QuotaProvider[]>;
  quotaConnect(provider: QuotaProvider['id'], key?: string): Promise<QuotaProvider[]>;
  quotaDisconnect(provider: QuotaProvider['id']): Promise<QuotaProvider[]>;
  quotaOfficial(provider: QuotaProvider['id']): Promise<void>;
}

export function islandPages(settings: IslandSettings): IslandPage[] {
  return ISLAND_PAGES.filter(page => settings.pages[page] && (page !== 'tools' || settings.focusEnabled || settings.waterEnabled || settings.mascotEnabled));
}
export function islandPage(settings: IslandSettings): IslandPage | null {
  const pages = islandPages(settings);
  return pages.includes(settings.lastPage) ? settings.lastPage : pages[0] ?? null;
}
export function inTimeRange(now: Date, start: string, end: string): boolean {
  const value = now.getHours() * 60 + now.getMinutes();
  const minutes = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  const a = minutes(start), b = minutes(end);
  return a === b || (a < b ? value >= a && value < b : value >= a || value < b);
}
export function nextWater(settings: IslandSettings, now: number, delay = settings.waterMinutes): number {
  const candidate = new Date(now + delay * 60000);
  if (inTimeRange(candidate, settings.waterStart, settings.waterEnd)) return candidate.getTime();
  const next = new Date(now);
  next.setHours(Number(settings.waterStart.slice(0, 2)), Number(settings.waterStart.slice(3)), 0, 0);
  if (next.getTime() <= now) next.setDate(next.getDate() + 1);
  return next.getTime();
}
export function focusRemaining(focus: IslandFocus | null, now: number): number {
  return focus ? Math.max(0, focus.endsAt === null ? focus.remainingMs : focus.endsAt - now) : 0;
}
export function initialIslandData(now = Date.now()): IslandData {
  return { settings: IslandSettingsSchema.parse({}), files: [], focus: null, water: { day: localDay(new Date(now)), count: 0, nextAt: null, pausedDay: null }, reminders: [], quotaAlerts: [], notes: [], noteDraft: { text: '', noteId: null } };
}
export function islandSize(mode: IslandMode, dock: IslandDock = 'top') {
  return (dock === 'top' ? ISLAND_SIZES : ISLAND_SIDE_SIZES)[mode];
}
export function islandBounds(mode: IslandMode, area: { x: number; y: number; width: number; height: number }, offset: number, dock: IslandDock = 'top') {
  const [w, h] = islandSize(mode, dock);
  const width = Math.max(1, Math.min(w, area.width - 24)), height = Math.max(1, Math.min(h, area.height - 12));
  const [expandedWidth, expandedHeight] = islandSize('expanded', dock);
  const inset = Math.min(offset, dock === 'top' ? area.height - Math.max(1, Math.min(expandedHeight, area.height - 12)) : area.width - Math.max(1, Math.min(expandedWidth, area.width - 24)));
  if (dock !== 'top') return { x: dock === 'left' ? area.x + inset : area.x + area.width - width - inset, y: Math.round(area.y + (area.height - height) / 2), width, height };
  return { x: Math.round(area.x + (area.width - width) / 2), y: area.y + inset, width, height };
}
