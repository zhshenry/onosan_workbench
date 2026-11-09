import { safeStorage, session, shell } from 'electron';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { writeJsonAtomic } from '../modules/storage/json-file';
import { resolveCodexExecutable } from './codex-cli';
import { codexQuotaWindows, cursorQuotaWindows, grokbotQuotaWindows, zcodeQuotaWindows } from '../shared/island-quota';
import { ISLAND_QUOTA_LABELS, ISLAND_QUOTA_PROVIDERS, type QuotaProvider } from '../shared/island-contracts';

type Provider = QuotaProvider['id'];
type RpcResult = Record<string, unknown>;
const blank = (id: Provider): QuotaProvider => ({ id, status: 'disconnected', account: '', plan: '', windows: [], updatedAt: null, message: '未连接' });
type CodexFailure = 'timeout' | 'transport' | 'auth' | 'cli-unavailable' | 'request';
class CodexQuotaError extends Error {
  constructor(readonly kind: CodexFailure, readonly rpcCode?: number) {
    super({ timeout: 'Codex 查询暂未完成', transport: 'Codex 后台连接暂不可用', auth: '登录授权已失效，请重新登录', 'cli-unavailable': '未找到 Codex CLI，请安装后重试', request: 'Codex 额度暂时无法查询' }[kind]);
  }
}
function codexRequestError(error: { message?: unknown; code?: unknown }): CodexQuotaError {
  const message = typeof error.message === 'string' ? error.message : '';
  const kind = /refresh_token_(?:reused|expired|invalidated)|invalid_grant|not (?:logged in|authenticated)|authentication required|\b401\s+unauthorized/i.test(message) ? 'auth'
    : /timed?\s*out|timeout/i.test(message) ? 'timeout' : /error sending request|ECONN|ENOTFOUND|connection|transport/i.test(message) ? 'transport' : 'request';
  return new CodexQuotaError(kind, typeof error.code === 'number' ? error.code : undefined);
}

export class IslandQuotas {
  private providers: QuotaProvider[] = ISLAND_QUOTA_PROVIDERS.map(blank);
  private credentials = { codex: false, zcode: '', cursor: false, grokbot: false };
  private browserLogins = new Map<Provider, { controller: AbortController; done: Promise<void> }>();
  private child: ChildProcessWithoutNullStreams | null = null;
  private ready: Promise<void> | null = null;
  private serial = 0;
  private pending = new Map<number, { resolve(value: RpcResult): void; reject(error: Error): void; timer: NodeJS.Timeout }>();
  private refreshing: Promise<QuotaProvider[]> | null = null;
  private nextRead = 0;
  private codexRefreshing: Promise<void> | null = null;
  private codexNextRead = 0;
  private codexRetry: NodeJS.Timeout | null = null;
  private codexFailures = 0;
  private codexTimeouts = 0;
  private codexRevision = 0;
  private stopped = false;
  private generation = { codex: 0, zcode: 0, cursor: 0, grokbot: 0 };
  private path: string;
  constructor(private dir: string, private changed: () => void) {
    this.path = join(dir, 'island-connections.json');
    if (existsSync(this.path)) {
      try {
        const saved = JSON.parse(readFileSync(this.path, 'utf8'));
        this.credentials = { codex: saved.codex === true, zcode: typeof saved.zcode === 'string' ? saved.zcode : '', cursor: saved.cursor === true, grokbot: saved.grokbot === true };
      } catch { /* Connections remain disconnected when the credential record is unreadable. */ }
    }
    for (const p of this.providers) if (this.credentials[p.id]) Object.assign(p, { status: p.id === 'codex' ? 'recovering' : 'error', message: '等待更新' });
  }
  read(): QuotaProvider[] { return structuredClone(this.providers); }
  private save(): void { writeJsonAtomic(this.path, this.credentials); }
  private accountSession(provider: 'cursor' | 'grokbot') { return session.fromPartition(`persist:island-quota-${provider}`); }
  private async connectBrowser(provider: 'cursor' | 'grokbot', signal: AbortSignal): Promise<void> {
    const account = this.accountSession(provider), generation = this.generation[provider];
    const current = this.providers.find(p => p.id === provider)!;
    const verifier = randomBytes(32).toString('base64url'), uuid = randomUUID();
    const login = new URL('https://cursor.com/loginDeepControl');
    login.search = new URLSearchParams({ challenge: createHash('sha256').update(verifier).digest('base64url'), uuid, mode: 'login', redirectTarget: provider === 'cursor' ? 'cli' : 'sand' }).toString();
    const poll = new URL('https://api2.cursor.sh/auth/poll');
    poll.search = new URLSearchParams({ uuid, verifier }).toString();
    let failure = '无法打开系统浏览器，请重试', pendingCookie = false;
    Object.assign(current, { status: 'connecting', message: '请在系统浏览器中完成 Cursor 授权' }); this.changed();
    try {
      await shell.openExternal(login.href);
      failure = '连接未完成，请检查网络后重试';
      const deadline = Date.now() + 300000;
      let interval = 2000;
      while (!signal.aborted && generation === this.generation[provider]) {
        await delay(interval, undefined, { signal });
        if (Date.now() >= deadline) { failure = '授权已超时，请重试'; throw new Error(); }
        let response: Response;
        try {
          response = await account.fetch(poll.href, { credentials: 'omit', cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json' }, signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) });
        } catch { continue; }
        if (signal.aborted || generation !== this.generation[provider]) return;
        if (response.status === 401 || response.status === 403) { failure = '授权被拒绝或已失效，请重试'; throw new Error(); }
        if (response.status === 429) { interval = Math.max(2000, Math.min(60000, (Number(response.headers.get('retry-after')) || 5) * 1000)); continue; }
        if (!response.ok) continue; // 404 means the browser has not completed sign-in yet.
        let token: string, subject: string, expires: number;
        try {
          const data = await response.json();
          if (!data || typeof data !== 'object' || !('accessToken' in data) || typeof data.accessToken !== 'string') throw new Error();
          token = data.accessToken;
          if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) throw new Error();
          const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
          subject = typeof claims.sub === 'string' ? claims.sub.split('|').at(-1) : '';
          expires = claims.exp;
          if (!/^[\w-]+$/.test(subject) || !Number.isFinite(expires) || expires * 1000 <= Date.now()) throw new Error();
        } catch { failure = '未收到有效的登录结果，请重试'; throw new Error(); }
        if (signal.aborted || generation !== this.generation[provider]) return;
        // Keep only this authorization in our own Chromium store; never read another client's credentials.
        await account.cookies.set({ url: 'https://cursor.com', name: 'WorkosCursorSessionToken', value: encodeURIComponent(`${subject}::${token}`), secure: true, httpOnly: true, sameSite: 'lax', expirationDate: expires });
        pendingCookie = true;
        await account.cookies.flushStore();
        if (signal.aborted || generation !== this.generation[provider]) return;
        this.credentials[provider] = true; this.save(); pendingCookie = false;
        Object.assign(current, { status: 'ready', message: '' }); this.changed();
        void Promise.resolve(this.refreshing).then(() => {
          if (generation === this.generation[provider]) { this.nextRead = 0; void this.refresh(); }
        });
        return;
      }
    } catch {
      if (!signal.aborted && generation === this.generation[provider]) { Object.assign(current, { status: 'error', message: failure }); this.changed(); }
    } finally {
      if (pendingCookie) await account.cookies.remove('https://cursor.com', 'WorkosCursorSessionToken').catch(() => undefined);
    }
  }
  private diagnostic(method: string, durationMs: number, outcome: string, code?: number): void {
    try {
      const file = join(this.dir, 'island-codex-diagnostics.jsonl');
      if (existsSync(file) && statSync(file).size >= 65536) writeFileSync(file, '');
      appendFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), method, durationMs, outcome, ...(code === undefined ? {} : { code }) })}\n`);
    } catch { /* Diagnostics must not interrupt quota reads. Never record RPC payloads. */ }
  }
  private rpc(method: string, params?: unknown, timeout = 30000): Promise<RpcResult> {
    return new Promise((resolve, reject) => {
      if (!this.child) { reject(new CodexQuotaError('transport')); return; }
      const id = ++this.serial, started = Date.now();
      const finish = (error?: Error, value: RpcResult = {}) => {
        if (!this.pending.delete(id)) return;
        clearTimeout(timer);
        this.diagnostic(method, Date.now() - started, error instanceof CodexQuotaError ? error.kind : error ? 'request' : 'ok', error instanceof CodexQuotaError ? error.rpcCode : undefined);
        if (error) reject(error); else resolve(value);
      };
      const timer = setTimeout(() => finish(new CodexQuotaError('timeout')), timeout);
      this.pending.set(id, { resolve: value => finish(undefined, value), reject: error => finish(error), timer });
      this.child.stdin.write(`${JSON.stringify({ id, method, ...(params ? { params } : {}) })}\n`, error => {
        if (error) finish(new CodexQuotaError('transport'));
      });
    });
  }
  private start(): Promise<void> {
    if (this.ready) return this.ready;
    let started: ChildProcessWithoutNullStreams | null = null;
    this.ready = (async () => {
      const home = join(this.dir, 'island-codex'); mkdirSync(home, { recursive: true });
      const env: NodeJS.ProcessEnv = { ...process.env, CODEX_HOME: home };
      delete env.OPENAI_API_KEY; delete env.CODEX_API_KEY;
      const child = spawn(resolveCodexExecutable(env), ['app-server', '--listen', 'stdio://', '-c', 'cli_auth_credentials_store="keyring"'], { cwd: home, env, windowsHide: true, stdio: 'pipe' });
      this.child = child; started = child;
      const fail = (error: CodexQuotaError) => {
        if (this.child !== child) return;
        const waiting = this.pending.size > 0;
        this.child = null; this.ready = null;
        for (const request of this.pending.values()) request.reject(error);
        child.kill();
        if (!waiting && this.credentials.codex && !this.stopped && this.providers[0].issue !== 'auth-required') {
          const provider = this.providers[0];
          if (provider.status === 'connecting') Object.assign(provider, { status: 'error', issue: 'auth-required', message: '授权未完成，请重新登录' });
          else { Object.assign(provider, { status: provider.account ? 'stale' : 'recovering', message: '额度服务已中断，正在自动恢复' }); this.scheduleCodexRetry(); }
          this.changed();
        }
      };
      child.once('error', (error: NodeJS.ErrnoException) => fail(new CodexQuotaError(error.code === 'ENOENT' ? 'cli-unavailable' : 'transport')));
      child.once('exit', code => { if (this.child === child) this.diagnostic('process/exit', 0, 'transport', code ?? undefined); fail(new CodexQuotaError('transport')); });
      child.stdin.once('error', () => fail(new CodexQuotaError('transport')));
      child.stderr.resume(); // Never forward authentication payloads or CLI diagnostics to the UI/log.
      createInterface({ input: child.stdout }).on('line', line => {
        if (this.child !== child) return;
        try {
          const message = JSON.parse(line);
          const request = this.pending.get(message.id);
          if (request) {
            if (message.error) request.reject(codexRequestError(message.error));
            else request.resolve(message.result ?? {});
          } else if (message.method === 'account/login/completed' && this.credentials.codex) {
            const provider = this.providers[0];
            provider.status = message.params?.success ? 'ready' : 'error';
            provider.issue = message.params?.success ? undefined : 'auth-required';
            provider.message = message.params?.success ? '' : '连接未完成，请重新连接';
            this.nextRead = 0; this.codexNextRead = 0; this.changed();
            if (message.params?.success) void this.refresh();
          } else if (message.method === 'account/updated' && message.params?.authMode === null && this.credentials.codex && this.providers[0].status !== 'connecting') {
            this.generation.codex++; this.cancelCodexRetry();
            Object.assign(this.providers[0], { status: 'error', issue: 'auth-required', message: '登录授权已失效，请重新登录' });
            this.stopCodex(); this.changed();
          } else if (message.method === 'account/rateLimits/updated' && this.credentials.codex && this.providers[0].status !== 'connecting' && this.providers[0].issue !== 'auth-required') {
            const windows = codexQuotaWindows(message.params);
            if (windows.length) { this.codexRevision++; this.codexFailures = 0; this.codexTimeouts = 0; this.cancelCodexRetry(); Object.assign(this.providers[0], { windows, updatedAt: Date.now(), status: 'ready', issue: undefined, message: '' }); this.changed(); }
          }
        } catch { /* Ignore non-protocol output. */ }
      });
      await this.rpc('initialize', { clientInfo: { name: 'ono_island', title: 'Ono Workbench', version: '1.0.0' }, capabilities: {} });
      child.stdin.write('{"method":"initialized"}\n');
    })().catch(error => { if (this.child === started) { this.child = null; this.ready = null; started?.kill(); } throw error; });
    return this.ready;
  }
  async connect(provider: Provider, key?: string): Promise<QuotaProvider[]> {
    const generation = ++this.generation[provider];
    if (provider === 'cursor' || provider === 'grokbot') {
      const previous = this.browserLogins.get(provider);
      previous?.controller.abort(); await previous?.done;
      if (generation !== this.generation[provider]) return this.read();
      const controller = new AbortController(), done = this.connectBrowser(provider, controller.signal);
      const login = { controller, done }; this.browserLogins.set(provider, login);
      void done.finally(() => { if (this.browserLogins.get(provider) === login) this.browserLogins.delete(provider); });
      return this.read();
    }
    if (provider === 'zcode') {
      if (!key?.trim() || key.length > 4096) throw new Error('请输入有效的 GLM Coding Plan API Key');
      if (!safeStorage.isEncryptionAvailable()) throw new Error('本机凭据加密不可用，未保存密钥');
      this.credentials.zcode = safeStorage.encryptString(key.trim()).toString('base64'); this.save();
      this.providers[1] = blank('zcode');
      await this.refreshing; this.nextRead = 0;
      return this.refresh();
    }
    this.cancelCodexRetry(); this.codexFailures = 0; this.codexTimeouts = 0; this.codexNextRead = 0;
    this.stopCodex(); await this.codexRefreshing;
    if (generation !== this.generation.codex) return this.read();
    this.credentials.codex = true; this.save();
    Object.assign(this.providers[0], { status: 'connecting', message: '请在浏览器中完成连接' }); this.changed();
    try {
      await this.start();
      if (generation !== this.generation.codex) return this.read();
      const login = await this.rpc('account/login/start', { type: 'chatgpt' }, 60000);
      if (generation !== this.generation.codex) return this.read();
      if (typeof login.authUrl !== 'string') throw new Error('Codex 未返回授权地址');
      const url = new URL(login.authUrl);
      if (url.protocol !== 'https:' || !['auth.openai.com', 'chatgpt.com', 'auth0.openai.com'].includes(url.hostname)) throw new Error('Codex 授权地址无效');
      await shell.openExternal(url.href);
    } catch (error) { if (generation === this.generation.codex) { Object.assign(this.providers[0], { status: 'error', issue: error instanceof CodexQuotaError && error.kind === 'cli-unavailable' ? 'cli-unavailable' : 'auth-required', message: error instanceof Error ? error.message : '连接失败' }); this.changed(); } }
    return this.read();
  }
  async disconnect(provider: Provider): Promise<QuotaProvider[]> {
    this.generation[provider]++;
    if (provider === 'cursor' || provider === 'grokbot') {
      this.credentials[provider] = false;
      this.save();
      const login = this.browserLogins.get(provider);
      login?.controller.abort(); await login?.done;
      await this.accountSession(provider).clearStorageData();
    }
    if (provider === 'codex') {
      // This app owns a separate Codex home/keyring entry; other clients stay signed in.
      const connected = this.credentials.codex;
      this.cancelCodexRetry();
      this.credentials.codex = false;
      try { if (connected) { await this.start(); await this.rpc('account/logout'); } }
      finally { this.stopCodex(); this.save(); this.providers[0] = blank('codex'); this.changed(); }
    } else if (provider === 'zcode') this.credentials.zcode = '';
    this.save(); this.providers[this.providers.findIndex(p => p.id === provider)] = blank(provider); this.changed(); return this.read();
  }
  private cancelCodexRetry(): void { if (this.codexRetry) clearTimeout(this.codexRetry); this.codexRetry = null; }
  private scheduleCodexRetry(): void {
    this.cancelCodexRetry();
    if (this.stopped || !this.credentials.codex || this.providers[0].issue === 'auth-required') return;
    const generation = this.generation.codex;
    const wait = [10000, 30000, 60000][Math.min(this.codexFailures++, 2)];
    this.codexNextRead = Date.now() + wait;
    this.codexRetry = setTimeout(() => {
      this.codexRetry = null;
      if (!this.stopped && this.credentials.codex && generation === this.generation.codex) void this.refreshCodex(true);
    }, wait);
    this.codexRetry.unref();
  }
  private async readCodex(next: QuotaProvider, refreshToken = false): Promise<void> {
    const response = await this.rpc('account/read', { refreshToken }, refreshToken ? 60000 : 30000);
    const account = response.account as { type?: string; email?: string; planType?: string } | null;
    if (account?.type !== 'chatgpt') throw new CodexQuotaError('auth');
    const windows = codexQuotaWindows(await this.rpc('account/rateLimits/read'));
    next.account = account.email ? account.email.replace(/^(.).+(@.*)$/, '$1***$2') : '已连接 ChatGPT';
    next.accountKey = createHash('sha256').update(account.email ?? 'chatgpt').digest('hex');
    next.plan = account.planType ?? '';
    next.windows = windows;
  }
  private refreshCodex(force: boolean): Promise<void> {
    if (this.codexRefreshing) return this.codexRefreshing;
    const provider = this.providers[0], generation = this.generation.codex, revision = this.codexRevision;
    if (this.stopped || !this.credentials.codex || provider.status === 'connecting' || provider.issue === 'auth-required' || !force && Date.now() < this.codexNextRead) return Promise.resolve();
    this.cancelCodexRetry(); this.codexNextRead = Date.now() + 60000;
    this.codexRefreshing = (async () => {
      const next = { ...provider };
      try {
        await this.start();
        try { await this.readCodex(next); }
        catch (error) { if (!(error instanceof CodexQuotaError) || error.kind !== 'auth') throw error; await this.readCodex(next, true); }
        if (generation !== this.generation.codex || revision !== this.codexRevision) return;
        this.codexFailures = 0; this.codexTimeouts = 0;
        Object.assign(next, { status: next.windows.length ? 'ready' : 'unsupported', issue: undefined, updatedAt: Date.now(), message: next.windows.length ? '' : '当前套餐未返回可用指标，请去官方查看' });
        this.providers[0] = next; this.changed();
      } catch (error) {
        if (generation !== this.generation.codex || revision !== this.codexRevision) return;
        const kind = error instanceof CodexQuotaError ? error.kind : 'request';
        if (kind === 'auth' || kind === 'cli-unavailable') {
          Object.assign(next, { status: 'error', issue: kind === 'auth' ? 'auth-required' : 'cli-unavailable', message: error instanceof Error ? error.message : '连接暂不可用' });
          this.providers[0] = next; this.changed(); return;
        }
        this.codexTimeouts = kind === 'timeout' ? this.codexTimeouts + 1 : 0;
        Object.assign(next, { status: next.account ? 'stale' : 'recovering', issue: undefined, message: '额度更新延迟，将自动重试' });
        this.providers[0] = next; this.changed();
        if (this.codexTimeouts >= 2 && this.child) {
          // A local account read checks the RPC service without forcing network auth.
          try { await this.rpc('account/read', { refreshToken: false }, 5000); }
          catch { if (generation === this.generation.codex && revision === this.codexRevision) { this.stopCodex(); next.message = '额度服务无响应，正在自动恢复'; this.changed(); } }
        }
        if (generation === this.generation.codex && revision === this.codexRevision) this.scheduleCodexRetry();
      }
    })().finally(() => { this.codexRefreshing = null; });
    return this.codexRefreshing;
  }
  refresh(force = false): Promise<QuotaProvider[]> {
    const codex = this.refreshCodex(force);
    if (this.refreshing || Date.now() < this.nextRead) return Promise.all([this.refreshing, codex]).then(() => this.read());
    this.nextRead = Date.now() + 60000;
    const generation = { ...this.generation };
    this.refreshing = Promise.all(this.providers.map(async (provider, index) => {
      if (provider.id === 'codex' || !this.credentials[provider.id] || provider.status === 'connecting') return;
      const next = { ...provider };
      try {
        if (provider.id === 'zcode') {
          const key = safeStorage.decryptString(Buffer.from(this.credentials.zcode, 'base64'));
          const response = await fetch('https://open.bigmodel.cn/api/monitor/usage/quota/limit', { headers: { Authorization: key, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000), redirect: 'error' });
          if (response.status === 429) { this.nextRead = Date.now() + Math.max(300, Math.min(3600, Number(response.headers.get('retry-after')) || 300)) * 1000; throw new Error('请求较多，稍后自动重试'); }
          if (response.status === 401 || response.status === 403) throw new Error('凭据无效或已过期，请重新连接');
          if (!response.ok) throw new Error('Z Code 额度暂时无法查询');
          const data = await response.json() as { success?: boolean; code?: number };
          if (data.success === false || (data.code !== undefined && ![0, 200].includes(data.code))) throw new Error('额度查询未成功，请检查套餐与凭据');
          next.windows = zcodeQuotaWindows(data); next.account = '已连接个人套餐'; next.plan = '';
          next.accountKey = createHash('sha256').update(key).digest('hex');
        } else {
          const account = this.accountSession(provider.id);
          const cookies = await account.cookies.get({ url: 'https://cursor.com' });
          const cookie = cookies.find(cookie => cookie.name === 'WorkosCursorSessionToken');
          if (!cookie) throw new Error('登录已失效，请重新连接账户');
          const cursor = provider.id === 'cursor';
          const response = await account.fetch(cursor ? 'https://cursor.com/api/usage-summary' : 'https://cursor.com/api/dashboard/get-sand-usage-status', {
            method: cursor ? 'GET' : 'POST', ...(cursor ? {} : { body: '{}' }), credentials: 'include',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json', Origin: 'https://cursor.com' }, signal: AbortSignal.timeout(15000), redirect: 'error',
          });
          if (response.status === 429) { this.nextRead = Date.now() + Math.max(300, Math.min(3600, Number(response.headers.get('retry-after')) || 300)) * 1000; throw new Error('请求较多，稍后自动重试'); }
          if (response.status === 401 || response.status === 403) { if (generation[provider.id] === this.generation[provider.id]) await account.cookies.remove('https://cursor.com', 'WorkosCursorSessionToken'); throw new Error('登录已失效，请重新连接账户'); }
          if (!response.ok) throw new Error(`${ISLAND_QUOTA_LABELS[provider.id]} 额度暂时无法查询`);
          let data: Record<string, unknown>;
          try { const value: unknown = await response.json(); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); data = value as Record<string, unknown>; }
          catch { throw new Error('服务暂未返回可读的额度数据，请稍后重试'); }
          next.message = '';
          next.windows = cursor ? cursorQuotaWindows(data) : grokbotQuotaWindows(data);
          next.account = '已连接 Cursor 账户'; next.plan = typeof (cursor ? data.membershipType : data.grokPlanLabel) === 'string' ? String(cursor ? data.membershipType : data.grokPlanLabel).slice(0, 60) : '';
          next.accountKey = createHash('sha256').update(cookie.value.split(/%3a%3a|::/i)[0]).digest('hex');
          if (data.usesPooledEnterpriseAllowance === true || data.hasNonZeroIncludedLimit === false) next.message = data.usesPooledEnterpriseAllowance === true ? '该账户使用团队共享额度，未提供个人用量' : '该账户没有可用的 Grok Bot 套餐额度';
        }
        next.updatedAt = Date.now(); next.status = next.windows.length ? 'ready' : 'unsupported';
        next.message = next.windows.length ? '' : next.message && provider.id === 'grokbot' ? next.message : '当前套餐未返回可用指标，请去官方查看';
      } catch (error) {
        next.status = 'error'; next.message = error instanceof Error && !/fetch|abort|network/i.test(error.message) ? error.message : '网络暂不可用，请稍后重试';
      }
      if (generation[provider.id] === this.generation[provider.id]) this.providers[index] = next;
    })).then(() => { this.changed(); return this.read(); }).finally(() => { this.refreshing = null; });
    return Promise.all([this.refreshing, codex]).then(() => this.read());
  }
  stop(): void {
    this.stopped = true; this.generation.codex++; this.cancelCodexRetry();
    for (const provider of ['cursor', 'grokbot'] as const) { this.generation[provider]++; this.browserLogins.get(provider)?.controller.abort(); }
    this.stopCodex();
  }
  private stopCodex(): void {
    const child = this.child; this.child = null; this.ready = null; child?.kill();
    for (const request of this.pending.values()) request.reject(new CodexQuotaError('transport'));
    this.pending.clear();
  }
}
