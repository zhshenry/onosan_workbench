import { z } from 'zod';

export const CHECKIN_PROVIDERS = ['workbuddy', 'qoder', 'trae'] as const;
export const CheckinProviderSchema = z.enum(CHECKIN_PROVIDERS);
export type CheckinProvider = z.infer<typeof CheckinProviderSchema>;
export const CheckinSettingsSchema = z.object({
  enabled: z.boolean(), time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  providers: z.array(CheckinProviderSchema).max(3).refine(ids => new Set(ids).size === ids.length),
  catchup: z.boolean(), notify: z.boolean(),
}).strict();
export type CheckinSettings = z.infer<typeof CheckinSettingsSchema>;
export const DEFAULT_CHECKIN_SETTINGS: CheckinSettings = {
  enabled: false, time: '10:05', providers: [...CHECKIN_PROVIDERS], catchup: true, notify: true,
};
export const CheckinStatusSchema = z.enum(['disconnected', 'ready', 'checking', 'claiming', 'claimed', 'expired', 'pending', 'error', 'unavailable']);
export type CheckinStatus = z.infer<typeof CheckinStatusSchema>;
export const CheckinRowSchema = z.object({
  provider: CheckinProviderSchema, account: z.string(), connected: z.boolean(), status: CheckinStatusSchema,
  message: z.string(), checkedAt: z.number(), cycle: z.string(), reward: z.number().nonnegative().nullable(),
});
export type CheckinRow = z.infer<typeof CheckinRowSchema>;
export const CheckinRecordSchema = z.object({
  id: z.string(), provider: CheckinProviderSchema, at: z.number(), source: z.enum(['manual', 'auto']),
  status: CheckinStatusSchema, message: z.string(), reward: z.number().nonnegative().nullable(),
});
export type CheckinRecord = z.infer<typeof CheckinRecordSchema>;
export interface CheckinAuthState {
  id: string; provider: CheckinProvider; stage: 'waiting' | 'checking' | 'connected' | 'error'; message: string; expiresAt: number;
}
export interface CheckinState {
  rows: CheckinRow[]; settings: CheckinSettings; records: CheckinRecord[]; auth: CheckinAuthState | null; warning: string;
}
export const WorkbuddyPhoneSchema = z.string().regex(/^1\d{10}$/, '请输入 11 位手机号。');
export const WorkbuddyLoginSchema = z.object({ phone: WorkbuddyPhoneSchema, code: z.string().regex(/^\d{4,8}$/, '请输入短信验证码。') }).strict();
export interface CheckinBridge {
  state(): Promise<CheckinState>;
  run(providers: CheckinProvider[]): Promise<void>;
  refresh(provider: CheckinProvider): Promise<void>;
  sendSms(phone: string): Promise<{ retryAt: number }>;
  loginWorkbuddy(input: { phone: string; code: string }): Promise<void>;
  authorize(provider: 'qoder' | 'trae'): Promise<void>;
  reopenAuth(id: string): Promise<void>;
  cancelAuth(id: string): Promise<void>;
  disconnect(provider: CheckinProvider): Promise<void>;
  saveSettings(settings: CheckinSettings): Promise<void>;
  openGuide(provider: CheckinProvider): Promise<void>;
  onChanged(callback: (state: CheckinState) => void): () => void;
}

/** The Qoder daily period starts at 10:00 Beijing time; the others use Beijing dates. */
export function checkinCycle(provider: CheckinProvider, now: number): string {
  return new Date(now + 8 * 3_600_000 - (provider === 'qoder' ? 10 * 3_600_000 : 0)).toISOString().slice(0, 10);
}
export function checkinBeijingTime(now: number): string { return new Date(now + 8 * 3_600_000).toISOString().slice(11, 16); }
export function emptyCheckinRow(provider: CheckinProvider): CheckinRow {
  return { provider, account: '', connected: false, status: 'disconnected', message: '连接账号后检查签到资格', checkedAt: 0, cycle: '', reward: null };
}
