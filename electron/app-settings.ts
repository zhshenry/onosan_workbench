// 应用设置(工作台自有,2026-09-24 定稿:设置 = 第六个大工作台):
// - 存储 userData/app-settings.json,与 ai-config.json 平级;损坏时整体回落默认值
// - 纯存储,不依赖 electron;开机自启/关闭行为等副作用在 main.ts 应用
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppSettingsSchema, DEFAULT_APP_SETTINGS, ReminderRangeSchema, type AppSettings, type AppSettingsPatch } from '../shared/contracts';
import { writeJsonAtomic } from '../modules/storage/json-file';
import { readIslandReminderSettings } from './island-store';

export class AppSettingsStore {
  private readonly configPath: string;
  private cached: AppSettings | null = null;

  constructor(private readonly directory: string) {
    this.configPath = join(directory, 'app-settings.json');
  }

  read(): AppSettings {
    if (this.cached) return this.cached;
    this.cached = this.readFromDisk();
    return this.cached;
  }

  patch(input: AppSettingsPatch): AppSettings {
    // 逐字段校验:非法值丢弃,合法部分照常生效;未知键忽略(字段已各自过 schema,收尾断言类型安全)
    const next: Record<string, unknown> = { ...this.read() };
    for (const key of Object.keys(DEFAULT_APP_SETTINGS) as (keyof AppSettings)[]) {
      if (key in input) {
        const value = (input as Record<string, unknown>)[key];
        const candidate = key === 'profile' && typeof value === 'object' && value !== null
          ? { ...(next.profile as AppSettings['profile']), ...(value as Record<string, unknown>) }
          : value;
        const field = AppSettingsSchema.shape[key].safeParse(candidate);
        if (field.success) next[key] = field.data;
      }
    }
    writeJsonAtomic(this.configPath, next);
    this.cached = next as AppSettings;
    return this.cached;
  }

  private readFromDisk(): AppSettings {
    let stored: Record<string, unknown> = {};
    try {
      if (existsSync(this.configPath)) {
        const parsed = JSON.parse(readFileSync(this.configPath, 'utf8')) as unknown;
        if (typeof parsed === 'object' && parsed !== null) stored = parsed as Record<string, unknown>;
      }
    } catch { /* 无法读取应用设置时使用默认值。 */ }
    const raw = { ...DEFAULT_APP_SETTINGS, ...stored };
    // 已下线的冷灰 / 晴蓝迁移到中性雾珀；其余偏好逐字段保留。
    if (stored.uiTheme === 'sunny' || stored.uiTheme === 'cool') raw.uiTheme = 'mist';
    // 逐字段恢复:单个字段损坏只丢弃该字段,其余保留(兼容旧文件/局部损坏)
    const next: Record<string, unknown> = { ...DEFAULT_APP_SETTINGS };
    for (const key of Object.keys(DEFAULT_APP_SETTINGS) as (keyof AppSettings)[]) {
      const field = AppSettingsSchema.shape[key].safeParse(raw[key]);
      if (field.success) next[key] = field.data;
    }
    if (!ReminderRangeSchema.safeParse(stored.reminderRange).success) {
      if (next.remindersEnabled === false) {
        next.reminderRange = 'off';
      } else {
        const { scheduleReminders, todoReminders } = readIslandReminderSettings(this.directory);
        if (!scheduleReminders) next.reminderRange = todoReminders ? 'todo' : 'off';
        else if (!todoReminders) next.reminderRange = 'schedule';
      }
    }
    return next as AppSettings;
  }
}
