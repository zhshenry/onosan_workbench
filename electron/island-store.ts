import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, isAbsolute, join, normalize } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { writeJsonAtomic } from '../modules/storage/json-file';
import { localDay } from '../shared/todo-contracts';
import { focusRemaining, initialIslandData, inTimeRange, IslandNoteDraftSchema, IslandSettingsSchema, ISLAND_NOTE_LIMIT, ISLAND_NOTE_MAX_LENGTH, nextWater, type IslandData, type IslandReminder, type IslandSettingsPatch } from '../shared/island-contracts';

const SavedSchema = z.object({
  settings: IslandSettingsSchema,
  files: z.array(z.object({ id: z.string(), path: z.string(), name: z.string(), directory: z.boolean(), addedAt: z.number() })).max(200),
  focus: z.object({ durationMs: z.number().positive(), remainingMs: z.number().nonnegative(), endsAt: z.number().nullable(), taskId: z.string().nullable() }).nullable(),
  water: z.object({ day: z.string(), count: z.number().int().nonnegative(), nextAt: z.number().nullable(), pausedDay: z.string().nullable() }),
  sedentary: z.object({ nextAt: z.number().nullable(), pausedDay: z.string().nullable() }).default({ nextAt: null, pausedDay: null }),
  reminders: z.array(z.object({ id: z.string(), kind: z.enum(['task', 'meeting', 'focus', 'water', 'sedentary', 'quota', 'agent']), title: z.string(), createdAt: z.number(), taskId: z.string().optional() })).max(100),
  quotaAlerts: z.array(z.string()).max(200).default([]),
  notes: z.array(z.object({ id: z.string(), text: z.string().max(ISLAND_NOTE_MAX_LENGTH).refine(text => Boolean(text.trim())), createdAt: z.number(), updatedAt: z.number() })).max(ISLAND_NOTE_LIMIT).default([]),
  noteDraft: IslandNoteDraftSchema.default({ text: '', noteId: null }),
});

export class IslandStore {
  readonly loadError: string = '';
  private data: IslandData;
  private path: string;
  constructor(dir: string, private now = Date.now) {
    this.path = join(dir, 'desktop-island.json');
    this.data = initialIslandData(this.now());
    if (existsSync(this.path)) {
      // Do not overwrite a damaged file with defaults on the next ordinary action.
      try {
        const saved = JSON.parse(readFileSync(this.path, 'utf8'));
        if (saved.settings?.lastPage === 'todo') saved.settings.lastPage = 'schedule';
        if (saved.settings?.pages && 'todo' in saved.settings.pages) {
          const todo = z.boolean().parse(saved.settings.pages.todo);
          saved.settings.pages.schedule = (z.boolean().optional().parse(saved.settings.pages.schedule) ?? true) || todo;
          delete saved.settings.pages.todo;
        }
        this.data = SavedSchema.parse(saved);
      }
      catch { this.loadError = '桌面灵动岛数据无法读取，请检查 desktop-island.json；原文件已保留'; }
    }
  }
  read(): IslandData { return structuredClone(this.data); }
  private commit(data: IslandData): IslandData {
    if (this.loadError) throw new Error(this.loadError);
    writeJsonAtomic(this.path, data);
    this.data = data;
    return this.read();
  }
  patch(input: IslandSettingsPatch): IslandData {
    const data = this.read();
    data.settings = IslandSettingsSchema.strict().parse({ ...data.settings, ...input, pages: { ...data.settings.pages, ...input.pages } });
    if (!data.settings.waterEnabled) {
      data.water.nextAt = null;
      data.reminders = data.reminders.filter(r => r.kind !== 'water');
    } else if (!data.water.nextAt || 'waterMinutes' in input || 'waterStart' in input || 'waterEnd' in input) {
      data.water.nextAt = nextWater(data.settings, this.now());
    }
    if (!data.settings.sedentaryEnabled) {
      data.sedentary.nextAt = null;
      data.reminders = data.reminders.filter(r => r.kind !== 'sedentary');
    } else if (input.sedentaryEnabled === true || 'sedentaryMinutes' in input) {
      data.sedentary = { nextAt: this.now() + data.settings.sedentaryMinutes * 60000, pausedDay: null };
      data.reminders = data.reminders.filter(r => r.kind !== 'sedentary');
    }
    if (!data.settings.focusEnabled && data.focus?.endsAt) {
      data.focus.remainingMs = focusRemaining(data.focus, this.now());
      data.focus.endsAt = null;
    }
    return this.commit(data);
  }
  files(): IslandData['files'] {
    return this.data.files.map(file => {
      try { const stat = statSync(file.path); return { ...file, missing: false, size: stat.isFile() ? stat.size : undefined }; }
      catch { return { ...file, missing: true }; }
    });
  }
  addFiles(paths: string[]): IslandData {
    const data = this.read();
    for (const raw of z.array(z.string().min(1).max(32768)).max(200).parse(paths)) {
      if (!isAbsolute(raw)) throw new Error('请选择本机文件或文件夹');
      const path = normalize(raw);
      if (data.files.some(file => file.path.toLowerCase() === path.toLowerCase())) continue;
      const stat = statSync(path);
      if (!stat.isFile() && !stat.isDirectory()) throw new Error('仅支持文件与文件夹');
      data.files.unshift({ id: randomUUID(), path, name: basename(path), directory: stat.isDirectory(), addedAt: this.now() });
    }
    if (data.files.length > 200) throw new Error('文件暂存最多保留 200 条，请先移除部分记录');
    return this.commit(data);
  }
  file(id: string): string {
    const file = this.data.files.find(f => f.id === id);
    if (!file) throw new Error('文件记录不存在');
    return file.path;
  }
  relocate(id: string, path: string): IslandData {
    this.file(id);
    const stat = statSync(path);
    if (!isAbsolute(path) || (!stat.isDirectory() && !stat.isFile())) throw new Error('请选择本机文件或文件夹');
    const data = this.read();
    data.files = data.files.filter(file => file.id === id || file.path.toLowerCase() !== normalize(path).toLowerCase()).map(file => file.id === id ? { ...file, path: normalize(path), name: basename(path), directory: stat.isDirectory() } : file);
    return this.commit(data);
  }
  removeFiles(id?: string): IslandData { const data = this.read(); data.files = id ? data.files.filter(f => f.id !== id) : []; return this.commit(data); }
  setNoteDraft(input: unknown): IslandData {
    const draft = IslandNoteDraftSchema.parse(input), data = this.read();
    if (draft.noteId && !data.notes.some(note => note.id === draft.noteId)) throw new Error('文字记录已不存在');
    if (data.noteDraft.text === draft.text && data.noteDraft.noteId === draft.noteId) return data;
    data.noteDraft = draft; return this.commit(data);
  }
  saveNote(input: unknown, id?: string): IslandData {
    const text = z.string().max(ISLAND_NOTE_MAX_LENGTH, '文字最多 20000 字').parse(input), data = this.read(), now = this.now();
    if (!text.trim()) throw new Error('请先输入文字');
    if (id !== undefined) {
      if (!data.notes.some(note => note.id === id)) throw new Error('文字记录已不存在');
      data.notes = data.notes.map(note => note.id === id ? { ...note, text, updatedAt: now } : note);
    } else {
      if (data.notes.length >= ISLAND_NOTE_LIMIT) throw new Error('最多保存 200 条文字，请先删除部分记录');
      data.notes.unshift({ id: randomUUID(), text, createdAt: now, updatedAt: now });
    }
    if (data.noteDraft.noteId === (id ?? null)) data.noteDraft = { text: '', noteId: null };
    return this.commit(data);
  }
  removeNote(id: string): IslandData {
    const data = this.read();
    if (!data.notes.some(note => note.id === id)) throw new Error('文字记录已不存在');
    data.notes = data.notes.filter(note => note.id !== id);
    if (data.noteDraft.noteId === id) data.noteDraft = { text: '', noteId: null };
    return this.commit(data);
  }
  focus(action: 'start' | 'pause' | 'resume' | 'stop', minutes?: number, taskId?: string): IslandData {
    const data = this.read(), now = this.now();
    if (!data.settings.focusEnabled) throw new Error('请先在设置中启用专注');
    if (action === 'start') {
      if (data.focus) throw new Error('请先结束当前专注');
      const durationMs = z.number().int().min(1).max(180).parse(minutes ?? data.settings.focusMinutes) * 60000;
      data.focus = { durationMs, remainingMs: durationMs, endsAt: now + durationMs, taskId: taskId ?? null };
    } else if (action === 'stop') data.focus = null;
    else if (data.focus && action === 'pause' && data.focus.endsAt !== null) {
      data.focus.remainingMs = focusRemaining(data.focus, now); data.focus.endsAt = null;
    } else if (data.focus && action === 'resume' && data.focus.endsAt === null) data.focus.endsAt = now + data.focus.remainingMs;
    return this.commit(data);
  }
  water(action: 'drink' | 'snooze' | 'pause'): IslandData {
    const data = this.read(), now = this.now(), day = localDay(new Date(now));
    if (!data.settings.waterEnabled) throw new Error('请先启用喝水提醒');
    if (day !== data.water.day) { data.water.day = day; data.water.count = 0; }
    if (action === 'drink') data.water.count++;
    if (action === 'pause') data.water.pausedDay = day;
    data.water.nextAt = nextWater(data.settings, now, action === 'snooze' ? 10 : data.settings.waterMinutes);
    data.reminders = data.reminders.filter(r => r.kind !== 'water');
    return this.commit(data);
  }
  sedentary(action: 'reset' | 'snooze' | 'pause'): IslandData {
    const data = this.read(), now = this.now(), day = localDay(new Date(now));
    if (!data.settings.sedentaryEnabled) throw new Error('请先启用久坐提醒');
    if (action === 'snooze' && data.sedentary.pausedDay === day) throw new Error('久坐提醒今天已暂停，请先恢复');
    data.sedentary.pausedDay = action === 'pause' ? day : null;
    data.sedentary.nextAt = action === 'pause' ? null : now + (action === 'snooze' ? 10 : data.settings.sedentaryMinutes) * 60000;
    data.reminders = data.reminders.filter(r => r.kind !== 'sedentary');
    return this.commit(data);
  }
  restartSedentary(): void {
    if (this.loadError || !this.data.settings.sedentaryEnabled) return;
    const data = this.read(), now = this.now();
    data.sedentary.nextAt = data.sedentary.pausedDay === localDay(new Date(now)) ? null : now + data.settings.sedentaryMinutes * 60000;
    data.reminders = data.reminders.filter(r => r.kind !== 'sedentary');
    this.commit(data);
  }
  private mergeReminders(data: IslandData, reminders: IslandReminder[]): void {
    const day = localDay(new Date(this.now()));
    data.reminders = data.reminders.filter(r => localDay(new Date(r.createdAt)) === day);
    for (const reminder of reminders) if (!data.reminders.some(r => r.id === reminder.id)) data.reminders.push(reminder);
    const priority = { task: 0, meeting: 0, focus: 1, water: 2, sedentary: 2, quota: 3, agent: 0 };
    data.reminders.sort((a, b) => priority[a.kind] - priority[b.kind] || a.createdAt - b.createdAt);
    data.reminders = data.reminders.slice(0, 100);
  }
  enqueue(reminders: IslandReminder[]): void { const data = this.read(); this.mergeReminders(data, reminders); this.commit(data); }
  claimQuota(key: string): boolean {
    if (this.data.quotaAlerts.includes(key)) return false;
    const data = this.read(); data.quotaAlerts = [...data.quotaAlerts, key].slice(-200); this.commit(data); return true;
  }
  dismiss(id: string): IslandData { const data = this.read(); data.reminders = data.reminders.filter(r => r.id !== id); return this.commit(data); }
  tick(sedentaryPaused = false): IslandReminder[] {
    if (this.loadError) return [];
    const data = this.read(), now = this.now(), day = localDay(new Date(now));
    const alerts: IslandReminder[] = [];
    let changed = false;
    if (data.water.day !== day) { data.water.day = day; data.water.count = 0; changed = true; }
    if (data.reminders.some(r => localDay(new Date(r.createdAt)) !== day)) { data.reminders = data.reminders.filter(r => localDay(new Date(r.createdAt)) === day); changed = true; }
    if (data.focus?.endsAt !== null && data.focus && data.focus.endsAt <= now) {
      alerts.push({ id: randomUUID(), kind: 'focus', title: '专注完成，休息一下吧', createdAt: now });
      data.focus = null; changed = true;
    }
    if (data.settings.waterEnabled && data.water.nextAt !== null && data.water.nextAt <= now) {
      if (data.water.pausedDay !== day && inWaterHours(data, now)) alerts.push({ id: randomUUID(), kind: 'water', title: '喝口水，稍作休息', createdAt: now });
      data.water.nextAt = nextWater(data.settings, now); changed = true;
    }
    if (data.settings.sedentaryEnabled && !sedentaryPaused && data.sedentary.pausedDay !== day) {
      if (data.sedentary.nextAt === null) {
        data.sedentary = { nextAt: now + data.settings.sedentaryMinutes * 60000, pausedDay: null }; changed = true;
      } else if (data.sedentary.nextAt <= now) {
        if (!data.reminders.some(r => r.kind === 'sedentary')) alerts.push({ id: randomUUID(), kind: 'sedentary', title: '到活动时间了，起来走走吧。', createdAt: now });
        data.sedentary.nextAt = now + data.settings.sedentaryMinutes * 60000; changed = true;
      }
    } else if (data.sedentary.nextAt !== null || data.reminders.some(r => r.kind === 'sedentary')) {
      data.sedentary.nextAt = null; data.reminders = data.reminders.filter(r => r.kind !== 'sedentary'); changed = true;
    }
    if (changed) { this.mergeReminders(data, alerts); this.commit(data); }
    return alerts;
  }
}

function inWaterHours(data: IslandData, now: number): boolean { return inTimeRange(new Date(now), data.settings.waterStart, data.settings.waterEnd); }
