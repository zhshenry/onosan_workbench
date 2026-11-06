import { safeStorage, session, shell } from 'electron';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
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
    for (const p of this.providers) if (this.credentials[p.id]) Object.assign(p, { status: 'error', message: '等待更新' });
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
  private rpc(method: string, params?: unknown): Promise<RpcResult> {
    return new Promise((resolve, reject) => {
      if (!this.child) { reject(new Error('Codex 连接已关闭')); return; }
      const id = ++this.serial;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Codex 查询超时，请重试')); }, 20000);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(`${JSON.stringify({ id, method, ...(params ? { params } : {}) })}\n`, error => {
        if (error && this.pending.delete(id)) { clearTimeout(timer); reject(new Error('Codex 连接已关闭')); }
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
      const fail = () => {
        if (this.child !== child) return;
        for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(new Error('无法启动 Codex CLI，请确认已安装且可运行')); }
        this.pending.clear(); this.child = null; this.ready = null; child.kill();
      };
      child.once('error', fail); child.once('exit', fail);
      child.stdin.once('error', fail);
      child.stderr.resume(); // Never forward authentication payloads or CLI diagnostics to the UI/log.
      createInterface({ input: child.stdout }).on('line', line => {
        if (this.child !== child) return;
        try {
          const message = JSON.parse(line);
          const request = this.pending.get(message.id);
          if (request) {
            clearTimeout(request.timer); this.pending.delete(message.id);
            if (message.error) request.reject(new Error('Codex 请求失败，请重新连接账户或稍后重试'));
            else request.resolve(message.result ?? {});
          } else if (message.method === 'account/login/completed' && this.credentials.codex) {
            const provider = this.providers[0];
            provider.status = message.params?.success ? 'ready' : 'error';
            provider.message = message.params?.success ? '' : '连接未完成，请重新连接';
            this.nextRead = 0; this.changed();
            if (message.params?.success) void this.refresh();
          } else if (message.method === 'account/rateLimits/updated' && this.credentials.codex) {
            const windows = codexQuotaWindows(message.params);
            if (windows.length) { Object.assign(this.providers[0], { windows, updatedAt: Date.now(), status: 'ready', message: '' }); this.changed(); }
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
    this.credentials.codex = true; this.save();
    Object.assign(this.providers[0], { status: 'connecting', message: '请在浏览器中完成连接' }); this.changed();
    try {
      await this.start();
      if (generation !== this.generation.codex) return this.read();
      const login = await this.rpc('account/login/start', { type: 'chatgpt' });
      if (generation !== this.generation.codex) return this.read();
      if (typeof login.authUrl !== 'string') throw new Error('Codex 未返回授权地址');
      const url = new URL(login.authUrl);
      if (url.protocol !== 'https:' || !['auth.openai.com', 'chatgpt.com', 'auth0.openai.com'].includes(url.hostname)) throw new Error('Codex 授权地址无效');
      await shell.openExternal(url.href);
    } catch (error) { if (generation === this.generation.codex) { Object.assign(this.providers[0], { status: 'error', message: error instanceof Error ? error.message : '连接失败' }); this.changed(); } }
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
      this.credentials.codex = false;
      try { if (connected) { await this.start(); await this.rpc('account/logout'); } }
      finally { this.stopCodex(); this.save(); this.providers[0] = blank('codex'); this.changed(); }
    } else if (provider === 'zcode') this.credentials.zcode = '';
    this.save(); this.providers[this.providers.findIndex(p => p.id === provider)] = blank(provider); this.changed(); return this.read();
  }
  refresh(): Promise<QuotaProvider[]> {
    if (this.refreshing) return this.refreshing;
    if (Date.now() < this.nextRead) return Promise.resolve(this.read());
    this.nextRead = Date.now() + 60000;
    const generation = { ...this.generation };
    this.refreshing = Promise.all(this.providers.map(async (provider, index) => {
      if (!this.credentials[provider.id] || provider.status === 'connecting') return;
      const next = { ...provider };
      try {
        if (provider.id === 'codex') {
          await this.start();
          const response = await this.rpc('account/read', { refreshToken: true });
          const account = response.account as { type?: string; email?: string; planType?: string } | null;
          if (account?.type !== 'chatgpt') throw new Error('请连接 ChatGPT 账户以读取编程额度');
          next.account = account.email ? account.email.replace(/^(.).+(@.*)$/, '$1***$2') : '已连接 ChatGPT';
          next.accountKey = createHash('sha256').update(account.email ?? 'chatgpt').digest('hex');
          next.plan = account.planType ?? '';
          next.windows = codexQuotaWindows(await this.rpc('account/rateLimits/read'));
        } else if (provider.id === 'zcode') {
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
    return this.refreshing;
  }
  stop(): void {
    for (const provider of ['cursor', 'grokbot'] as const) { this.generation[provider]++; this.browserLogins.get(provider)?.controller.abort(); }
    this.stopCodex();
  }
  private stopCodex(): void {
    this.child?.kill(); this.child = null; this.ready = null;
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(new Error('连接已关闭')); }
    this.pending.clear();
  }
}
