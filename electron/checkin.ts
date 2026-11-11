import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { writeJsonAtomic } from '../modules/storage/json-file';
import { CHECKIN_PROVIDERS, CheckinProviderSchema, CheckinRecordSchema, CheckinRowSchema, CheckinSettingsSchema, DEFAULT_CHECKIN_SETTINGS, WorkbuddyLoginSchema, WorkbuddyPhoneSchema, checkinBeijingTime, checkinCycle, emptyCheckinRow, type CheckinAuthState, type CheckinProvider, type CheckinRecord, type CheckinRow, type CheckinSettings, type CheckinState } from '../shared/checkin-contracts';
import { CheckinCredentialSchema, CheckinError, CheckinProviders, checkinError, type CheckinCredential, type ProviderStatus } from './checkin-providers';
import { authorizeCheckin } from './checkin-auth';

const CredentialsSchema = z.partialRecord(CheckinProviderSchema, CheckinCredentialSchema);
type Credentials = z.infer<typeof CredentialsSchema>;
const AttemptSchema = z.object({ account: z.string(), cycle: z.string(), reward: z.number().nullable() });
const SavedSchema = z.object({
  version: z.literal(1), deviceId: z.string().uuid(), settings: CheckinSettingsSchema,
  credentials: z.string(), rows: z.array(CheckinRowSchema).max(3), records: z.array(CheckinRecordSchema).max(100),
  attempts: z.partialRecord(CheckinProviderSchema, AttemptSchema), autoRuns: z.partialRecord(CheckinProviderSchema, z.string()),
});
type Saved = z.infer<typeof SavedSchema>;
export interface CheckinOptions {
  directory: string; providers: CheckinProviders;
  protect(value: string): string; unprotect(value: string): string;
  open(url: string): Promise<void>; changed(state: CheckinState): void;
  notify(message: string): void;
  deviceId?(provider: CheckinProvider, fallback: string): string;
  native?(userId: string): Promise<CheckinCredential['native']>;
  now?(): number;
  write?(file: string, value: unknown): void;
}

export class CheckinService {
  private saved: Saved;
  private credentials: Credentials = {};
  private warning = '';
  private auth: (CheckinAuthState & { controller: AbortController; url: string }) | null = null;
  private operations = new Map<CheckinProvider, AbortController>();
  private sms = new Map<string, number>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;
  private lastTick: number;
  private readonly file: string;
  constructor(private readonly options: CheckinOptions) {
    this.file = join(options.directory, 'checkin.json');
    this.lastTick = this.now();
    this.saved = { version: 1, deviceId: randomUUID(), settings: structuredClone(DEFAULT_CHECKIN_SETTINGS), credentials: '', rows: CHECKIN_PROVIDERS.map(emptyCheckinRow), records: [], attempts: {}, autoRuns: {} };
    if (existsSync(this.file)) {
      try {
        this.saved = SavedSchema.parse(JSON.parse(readFileSync(this.file, 'utf8')));
        if (this.saved.credentials) this.credentials = CredentialsSchema.parse(JSON.parse(options.unprotect(this.saved.credentials)));
        this.saved.rows = CHECKIN_PROVIDERS.map(p => {
          const row = this.saved.rows.find(r => r.provider === p) || emptyCheckinRow(p);
          return this.credentials[p] ? { ...row, connected: true, ...(['checking', 'claiming'].includes(row.status) ? { status: this.saved.attempts[p] ? 'pending' as const : 'ready' as const } : {}) } : emptyCheckinRow(p);
        });
      } catch {
        this.credentials = {};
        this.saved.rows = CHECKIN_PROVIDERS.map(emptyCheckinRow);
        this.saved.settings.enabled = false;
        this.warning = '本机签到数据或加密凭据无法读取，自动签到已关闭，请重新连接账号。';
      }
    }
  }
  private now(): number { return this.options.now?.() ?? Date.now(); }
  private emit(): void { if (!this.disposed) this.options.changed(this.state()); }
  state(): CheckinState {
    const now = this.now();
    return {
      rows: this.saved.rows.map(row => row.cycle && row.cycle !== checkinCycle(row.provider, now) && ['claimed', 'pending', 'unavailable'].includes(row.status) ? { ...row, status: row.connected ? 'ready' : 'disconnected', reward: null, message: '新一轮领取周期，签到前将检查平台状态' } : { ...row }),
      settings: structuredClone(this.saved.settings), records: structuredClone(this.saved.records.filter(record => record.status === 'claimed')), warning: this.warning,
      auth: this.auth ? { id: this.auth.id, provider: this.auth.provider, stage: this.auth.stage, message: this.auth.message, expiresAt: this.auth.expiresAt } : null,
    };
  }
  private commit(patch: Partial<Saved>, credentials = this.credentials): void {
    let encrypted = this.saved.credentials;
    try {
      if (credentials !== this.credentials) encrypted = Object.keys(credentials).length ? this.options.protect(JSON.stringify(credentials)) : '';
      const next = { ...this.saved, ...patch, credentials: encrypted };
      (this.options.write ?? writeJsonAtomic)(this.file, next);
      this.saved = next;
      this.credentials = credentials;
    } catch { throw new CheckinError('无法安全保存签到数据，请检查磁盘与系统加密服务。', 'storage'); }
    this.emit();
  }
  private row(provider: CheckinProvider): CheckinRow { return this.saved.rows.find(r => r.provider === provider)!; }
  private update(provider: CheckinProvider, patch: Partial<CheckinRow>, extra: Partial<Saved> = {}): void {
    this.commit({ ...extra, rows: this.saved.rows.map(r => r.provider === provider ? { ...r, ...patch } : r) });
  }
  private record(provider: CheckinProvider, source: 'manual' | 'auto', row: CheckinRow): CheckinRecord[] {
    return [{ id: randomUUID(), provider, at: this.now(), source, status: row.status, message: row.message, reward: row.reward }, ...this.saved.records.filter(record => record.status === 'claimed')].slice(0, 100);
  }
  private device(provider: CheckinProvider): string { return this.options.deviceId?.(provider, this.saved.deviceId) || this.saved.deviceId; }
  private assertFree(provider: CheckinProvider): void {
    if (this.disposed) throw new CheckinError('工作台正在退出。');
    if (this.operations.has(provider) || this.auth?.provider === provider && ['waiting', 'checking'].includes(this.auth.stage)) throw new CheckinError('此应用正在处理，请稍候。');
  }
  async sendSms(value: string): Promise<{ retryAt: number }> {
    const phone = WorkbuddyPhoneSchema.parse(value);
    if ((this.sms.get(phone) || 0) > this.now()) throw new CheckinError('请稍候再获取验证码。');
    // Reserve the interval before sending, including uncertain network completion.
    const retryAt = this.now() + 60000;
    this.sms.set(phone, retryAt);
    await this.options.providers.sms(phone, AbortSignal.timeout(20000));
    return { retryAt };
  }
  private beginAuth(provider: CheckinProvider): NonNullable<CheckinService['auth']> {
    this.assertFree(provider);
    this.auth?.controller.abort();
    const auth = { id: randomUUID(), provider, stage: 'checking' as CheckinAuthState['stage'], message: '正在检查账号连接', expiresAt: this.now() + 300000, controller: new AbortController(), url: '' };
    this.auth = auth; this.emit();
    return auth;
  }
  private async connected(auth: NonNullable<CheckinService['auth']>, credential: CheckinCredential): Promise<void> {
    if (auth.provider === 'qoder') credential = { ...credential, native: await this.options.native?.(credential.userId) };
    if (this.auth !== auth || auth.controller.signal.aborted || this.disposed) return;
    const row = { ...emptyCheckinRow(auth.provider), account: credential.name.slice(0, 100), connected: true, status: 'ready' as const, message: '账号已连接，正在检查领取资格' };
    const attempts = { ...this.saved.attempts };
    // Preserve an uncertain claim when reauthorizing the same account.
    if (attempts[auth.provider]?.account !== credential.userId) delete attempts[auth.provider];
    const autoRuns = { ...this.saved.autoRuns }; delete autoRuns[auth.provider];
    this.commit({ rows: this.saved.rows.map(r => r.provider === auth.provider ? row : r), attempts, autoRuns }, { ...this.credentials, [auth.provider]: credential });
    auth.stage = 'connected'; auth.message = '账号连接成功'; this.emit();
    await this.refresh(auth.provider);
  }
  private authFailed(auth: NonNullable<CheckinService['auth']>, error: unknown): void {
    if (this.auth !== auth || this.disposed) return;
    auth.stage = 'error'; auth.message = auth.controller.signal.aborted ? '授权已取消或超时，请重新连接。' : checkinError(error); this.emit();
  }
  async loginWorkbuddy(input: { phone: string; code: string }): Promise<void> {
    const { phone, code } = WorkbuddyLoginSchema.parse(input), auth = this.beginAuth('workbuddy');
    try {
      const c = await this.options.providers.workbuddyLogin(phone, code, this.device('workbuddy'), AbortSignal.any([auth.controller.signal, AbortSignal.timeout(30000)]));
      await this.connected(auth, c);
    } catch (error) { this.authFailed(auth, error); throw new CheckinError(checkinError(error)); }
  }
  async authorize(provider: 'qoder' | 'trae'): Promise<void> {
    const auth = this.beginAuth(provider); auth.stage = 'waiting'; this.emit();
    const signal = AbortSignal.any([auth.controller.signal, AbortSignal.timeout(300000)]);
    void authorizeCheckin(provider, this.device(provider), this.options.providers, signal, async url => {
      if (this.auth !== auth || signal.aborted) return;
      auth.url = url; await this.options.open(url);
    }, () => { if (this.auth === auth) { auth.stage = 'checking'; this.emit(); } }).then(c => this.connected(auth, c)).catch(error => this.authFailed(auth, signal.aborted ? new CheckinError('官方授权已取消或超时，请重新连接。') : error));
  }
  async reopenAuth(id: string): Promise<void> {
    if (this.auth?.id !== id || this.auth.stage !== 'waiting' || this.auth.expiresAt <= this.now() || !this.auth.url) throw new CheckinError('授权已过期，请重新发起连接。');
    await this.options.open(this.auth.url);
  }
  cancelAuth(id: string): void { if (this.auth && (this.auth.id === id || this.auth.provider === id)) { this.auth.controller.abort(); this.auth = null; this.emit(); } }
  disconnect(provider: CheckinProvider): void {
    const credentials = { ...this.credentials }; delete credentials[provider];
    const autoRuns = { ...this.saved.autoRuns }; delete autoRuns[provider];
    this.commit({ rows: this.saved.rows.map(r => r.provider === provider ? emptyCheckinRow(provider) : r), autoRuns }, credentials);
    this.operations.get(provider)?.abort(); this.operations.delete(provider);
    if (this.auth?.provider === provider) this.cancelAuth(this.auth.id);
  }
  saveSettings(settings: CheckinSettings): void { this.commit({ settings: CheckinSettingsSchema.parse(settings) }); }
  async refresh(provider: CheckinProvider): Promise<void> { await this.perform(provider, false, 'manual'); }
  async run(providers: CheckinProvider[], source: 'manual' | 'auto' = 'manual'): Promise<void> {
    for (const provider of [...new Set(providers)]) {
      if (!this.credentials[provider] || this.operations.has(provider) || this.auth?.provider === provider && ['checking', 'waiting'].includes(this.auth.stage)) continue;
      await this.perform(provider, true, source);
    }
  }
  private async perform(provider: CheckinProvider, claim: boolean, source: 'manual' | 'auto'): Promise<void> {
    this.assertFree(provider);
    const initialCredential = this.credentials[provider];
    if (!initialCredential) throw new CheckinError('请先连接账号。');
    const initialRow = this.row(provider);
    let credential: CheckinCredential = initialCredential;
    const controller = new AbortController(), signal = controller.signal;
    this.operations.set(provider, controller);
    const active = (): boolean => !this.disposed && !signal.aborted && this.operations.get(provider) === controller && this.credentials[provider]?.userId === credential.userId;
    const cycle = checkinCycle(provider, this.now());
    const saveSession = (c: CheckinCredential): void => {
      if (!active()) throw new CheckinError('操作已取消。');
      this.commit({}, { ...this.credentials, [provider]: c }); credential = c;
    };
    const readStatus = async (): Promise<ProviderStatus> => {
      try { return await this.options.providers.status(provider, credential, signal); }
      catch (error) {
        if (!(error instanceof CheckinError) || error.kind !== 'auth') throw error;
        saveSession(await this.options.providers.refresh(provider, credential, signal));
        return this.options.providers.status(provider, credential, signal);
      }
    };
    try {
      this.update(provider, { status: 'checking', message: '正在查询平台状态' });
      if (credential.expiresAt && credential.expiresAt < this.now() + 60000) saveSession(await this.options.providers.refresh(provider, credential, signal));
      let status = await readStatus();
      if (!active()) return;
      let reward: number | null = null;
      let creditDelayed = false;
      const attempt = this.saved.attempts[provider];
      if (attempt?.cycle === cycle && attempt.account === credential.userId) {
        reward = attempt.reward;
        if (status.status === 'ready') status = { ...status, status: 'pending', message: '此前领取尚未确认，本轮只查询结果，避免重复提交' };
      } else if (claim && status.status === 'ready') {
        if (cycle !== checkinCycle(provider, this.now())) throw new CheckinError('领取周期已切换，请重新检查。');
        // Durable pending marker precedes the only mutation, including a crash or timeout.
        this.update(provider, { status: 'claiming', message: '正在领取，稍后核对平台结果', cycle }, { attempts: { ...this.saved.attempts, [provider]: { account: credential.userId, cycle, reward: null } } });
        try {
          const result = await this.options.providers.claim(provider, credential, status, signal);
          if (!active()) return;
          creditDelayed = result.delayed;
          reward = result.delayed ? null : result.reward;
          this.commit({ attempts: { ...this.saved.attempts, [provider]: { account: credential.userId, cycle, reward } } });
        } catch (error) {
          if (error instanceof CheckinError && error.kind === 'blocked') {
            const attempts = { ...this.saved.attempts }; delete attempts[provider];
            this.commit({ attempts }); throw error;
          }
          if (error instanceof CheckinError && error.kind === 'storage') throw error;
          // An uncertain POST is never repeated. A readback can still confirm it.
        }
        try { status = await readStatus(); }
        catch { status = { status: 'pending', message: '领取请求已发出，暂时无法确认，请稍后核对', reward: null }; }
        if (status.status === 'ready') status = { ...status, status: 'pending', message: '领取结果待平台确认，请稍后核对' };
        if (creditDelayed && status.status === 'claimed') status = { ...status, message: '本轮签到已确认，积分入账时间以平台记录为准' };
      }
      if (!active()) return;
      const row: CheckinRow = { ...this.row(provider), status: status.status, message: status.message, cycle, checkedAt: this.now(), reward: status.status === 'claimed' ? reward ?? (this.row(provider).cycle === cycle ? this.row(provider).reward : null) : status.status === 'ready' ? status.reward : null };
      const confirmed = row.status === 'claimed' && (claim || initialRow.status === 'pending' && initialRow.cycle === cycle);
      this.update(provider, row, confirmed ? { records: this.record(provider, source, row) } : {});
    } catch (error) {
      if (!active()) return;
      const pending = this.saved.attempts[provider]?.cycle === cycle;
      const row: CheckinRow = { ...this.row(provider), status: error instanceof CheckinError && error.kind === 'auth' ? 'expired' : error instanceof CheckinError && error.kind === 'blocked' ? 'unavailable' : pending ? 'pending' : 'error', message: checkinError(error), checkedAt: this.now(), cycle, reward: null };
      try { this.update(provider, row); }
      catch { this.warning = '签到数据无法保存，已停止本次操作，请检查磁盘后重试。'; this.emit(); }
    } finally { if (this.operations.get(provider) === controller) this.operations.delete(provider); }
  }
  start(): void {
    if (this.timer) return;
    void this.tick('startup');
    this.timer = setInterval(() => { void this.tick('timer'); }, 30000);
    this.timer.unref();
  }
  async tick(reason: 'startup' | 'resume' | 'timer', now = this.now()): Promise<void> {
    const lastTick = this.lastTick; this.lastTick = now;
    const settings = this.saved.settings;
    if (!settings.enabled || this.disposed || checkinBeijingTime(now) < settings.time) return;
    const missed = reason !== 'timer' || now - lastTick > 90000;
    if (missed && !settings.catchup) return;
    const scheduledAt = Date.parse(`${checkinCycle('workbuddy', now)}T${settings.time}:00+08:00`);
    if (!settings.catchup && lastTick >= scheduledAt) return;
    const day = checkinCycle('workbuddy', now), targets: CheckinProvider[] = [];
    for (const p of settings.providers) {
      if (!this.credentials[p] || this.operations.has(p) || this.auth?.provider === p && ['checking', 'waiting'].includes(this.auth.stage)) continue;
      const key = `${day}:${checkinCycle(p, now)}:${this.credentials[p]!.userId}`;
      if (this.saved.autoRuns[p] === key) continue;
      try { this.commit({ autoRuns: { ...this.saved.autoRuns, [p]: key } }); targets.push(p); }
      catch { this.warning = '自动签到未运行：无法保存本机记录。'; this.emit(); return; }
    }
    if (!targets.length) return;
    await this.run(targets, 'auto');
    if (settings.notify && !this.disposed) {
      const failed = targets.filter(p => ['expired', 'error', 'unavailable', 'pending'].includes(this.row(p).status));
      if (failed.length) this.options.notify(`${failed.map(p => p === 'workbuddy' ? 'WorkBuddy' : p === 'qoder' ? 'Qoder' : 'TRAE CN').join('、')} 的签到需要处理，请打开「每日签到」查看。`);
    }
  }
  dispose(): void { this.disposed = true; if (this.timer) clearInterval(this.timer); this.auth?.controller.abort(); for (const c of this.operations.values()) c.abort(); this.operations.clear(); }
}
