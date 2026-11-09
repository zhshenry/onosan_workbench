import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { transformSync } from 'esbuild';
import { writeJsonAtomic } from '../modules/storage/json-file';
import * as parsers from '../shared/island-quota';

const require = createRequire(import.meta.url);
function fixture(t: any, authUrl = 'https://auth.openai.com/synthetic-test') {
  const dir = mkdtempSync(join(tmpdir(), 'ono-island-quota-'));
  const requests: any[] = [], launches: any[] = [], opened: string[] = [], secrets = new Map<string, string>();
  const sessions = new Map<string, any>(), waits: { run(): void; interval: number }[] = [];
  const delay = (interval: number, _value: unknown, { signal }: { signal: AbortSignal }) => new Promise<void>((resolve, reject) => {
    const entry = { interval, run: () => { signal.removeEventListener('abort', cancel); waits.splice(waits.indexOf(entry), 1); resolve(); } };
    const cancel = () => { signal.removeEventListener('abort', cancel); waits.splice(waits.indexOf(entry), 1); reject(new Error('Aborted')); };
    if (signal.aborted) { reject(new Error('Aborted')); return; }
    waits.push(entry); signal.addEventListener('abort', cancel, { once: true });
  });
  class AccountSession extends EventEmitter {
    values: any[] = []; requests: any[] = []; cleared = false;
    authorization: any = null; flushed = false;
    cookies = Object.assign(new EventEmitter(), {
      get: async () => this.values,
      set: async (cookie: any) => { this.values = [cookie]; },
      remove: async () => { this.values = []; },
      flushStore: async () => { this.flushed = true; },
    });
    usage: (url: string) => Response | Promise<Response> = url => Response.json(url.endsWith('usage-summary')
      ? { membershipType: 'pro', billingCycleEnd: '2026-12-01T00:00:00Z', individualUsage: { plan: { enabled: true, autoPercentUsed: 23, apiPercentUsed: 67 } } }
      : { usagePercent: 42, nextResetTimestampUtc: '2026-11-12T08:00:00Z', hasNonZeroIncludedLimit: true, grokPlanLabel: 'Premium' });
    response: (url: string) => Response | Promise<Response> = url => new URL(url).pathname === '/auth/poll'
      ? this.authorization ? Response.json(this.authorization) : new Response('', { status: 404 }) : this.usage(url);
    fetch = async (url: string, options: any) => { this.requests.push({ url, options }); return this.response(url); };
    clearStorageData = async () => { this.cleared = true; this.values = []; };
    signIn(subject: string) {
      const token = `${Buffer.from('{"alg":"RS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: `auth0|${subject}`, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.synthetic-signature`;
      this.authorization = { accessToken: token, refreshToken: 'synthetic-refresh-token' }; return token;
    }
  }
  const defaultReply = (request: any) => ({ result: request.method === 'account/login/start' ? { authUrl, loginId: 'synthetic-login' }
      : request.method === 'account/read' ? { account: { type: 'chatgpt', email: 'synthetic@example.test', planType: 'plus' } }
      : request.method === 'account/rateLimits/read' ? { rateLimits: { primary: { usedPercent: 28, windowDurationMins: 300, resetsAt: 1794000000 } } } : {} });
  let reply: (request: any) => { result?: unknown; error?: unknown } | undefined = defaultReply;
  const children: any[] = [];
  const send = (message: unknown, target = children.at(-1)) => target.stdout.write(`${JSON.stringify(message)}\n`);
  const makeChild = () => {
    const child: any = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.kill = () => { child.killed = true; child.emit('exit'); };
    child.stdin = new Writable({ write(chunk, _encoding, callback) {
      const request = JSON.parse(chunk.toString()); requests.push(request);
      const response = reply(request);
      if (request.id && response) queueMicrotask(() => send({ id: request.id, ...response }, child));
      callback();
    } });
    children.push(child); return child;
  };
  const child = makeChild();
  const electron = { session: { fromPartition: (name: string) => { if (!sessions.has(name)) sessions.set(name, new AccountSession()); return sessions.get(name); } }, shell: { openExternal: async (url: string) => { opened.push(url); } }, safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (key: string) => { const id = `protected-${secrets.size}`; secrets.set(id, key); return Buffer.from(id); },
    decryptString: (value: Buffer) => secrets.get(value.toString())!,
  } };
  const module = { exports: {} as any };
  const code = transformSync(readFileSync('electron/island-quotas.ts', 'utf8'), { loader: 'ts', format: 'cjs' }).code;
  new Function('require', 'module', 'exports', code)((name: string) => name === 'electron' ? electron
    : name === 'node:child_process' ? { spawn: (...args: any[]) => { const child = children[launches.length] ?? makeChild(); launches.push(args); return child; } }
    : name === 'node:timers/promises' ? { setTimeout: delay }
    : name === './codex-cli' ? { resolveCodexExecutable: () => join(dir, 'Codex CLI', 'codex.exe') }
    : name === '../modules/storage/json-file' ? { writeJsonAtomic } : name === '../shared/island-quota' ? parsers : require(name), module, module.exports);
  const service = new module.exports.IslandQuotas(dir, () => undefined);
  t.after(async () => { service.stop(); await settled(); rmSync(dir, { recursive: true, force: true }); });
  return { service, dir, requests, launches, opened, child, children, send, electron, sessions, waits, defaultReply,
    setReply: (value: typeof reply) => { reply = value; },
    poll: async () => { await settled(); for (const entry of [...waits]) entry.run(); await settled(); },
    restore: () => new module.exports.IslandQuotas(dir, () => undefined) };
}
const settled = () => new Promise(resolve => setImmediate(resolve));
const quotaResponse = () => Response.json({ success: true, data: { limits: [{ type: 'TOKENS_LIMIT', percentage: 37, windowDurationMins: 300 }] } });
const advance = async (t: any, milliseconds: number) => { t.mock.timers.tick(milliseconds); await settled(); };
async function connectedCodex(t: any) {
  const f = fixture(t);
  await f.service.connect('codex');
  f.send({ method: 'account/login/completed', params: { success: true } });
  await settled(); await f.service.refresh();
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() });
  return f;
}

test('island quota: disconnected providers perform no network requests or CLI reads', async t => {
  const f = fixture(t); let reads = 0;
  t.mock.method(globalThis, 'fetch', async () => { reads++; return quotaResponse(); });
  assert.ok((await f.service.refresh()).every((p: any) => p.status === 'disconnected' && !p.windows.length));
  assert.equal(reads, 0); assert.equal(f.launches.length, 0);
});

test('island quota: Codex uses independent keyring authorization and only account APIs', async t => {
  const f = fixture(t);
  await f.service.connect('codex');
  assert.equal(f.opened.length, 1);
  const [command, args, options] = f.launches[0];
  assert.equal(command, join(f.dir, 'Codex CLI', 'codex.exe')); assert.ok(args.includes('cli_auth_credentials_store="keyring"'));
  assert.notEqual(options.shell, true);
  assert.equal(options.env.CODEX_HOME, join(f.dir, 'island-codex')); assert.equal(options.windowsHide, true);
  assert.equal(options.env.OPENAI_API_KEY, undefined); assert.equal(options.env.CODEX_API_KEY, undefined);
  f.send({ method: 'account/login/completed', params: { success: true, loginId: 'synthetic-login' } });
  await settled(); await f.service.refresh();
  const provider = f.service.read()[0];
  assert.equal(provider.windows[0].remaining, 72); assert.equal(provider.account, 's***@example.test');
  assert.equal(provider.accountKey.includes('synthetic'), false);
  await f.service.disconnect('codex');
  assert.equal(f.service.read()[0].status, 'disconnected'); assert.equal(f.child.killed, true);
  f.send({ method: 'account/login/completed', params: { success: true } }); await settled();
  assert.equal(f.service.read()[0].status, 'disconnected');
  assert.ok(f.requests.every(r => ['initialize', 'initialized', 'account/login/start', 'account/read', 'account/rateLimits/read', 'account/logout'].includes(r.method)));
});

test('island quota: untrusted authorization URL never opens in the browser', async t => {
  const f = fixture(t, 'https://unexpected.example.test/login');
  const result = await f.service.connect('codex');
  assert.equal(result[0].status, 'error'); assert.match(result[0].message, /授权地址无效/); assert.equal(f.opened.length, 0);
});

test('island quota: an unavailable Codex executable reports startup failure without opening a browser', async t => {
  const f = fixture(t);
  f.setReply(request => request.method === 'initialize' ? undefined : f.defaultReply(request));
  const connected = f.service.connect('codex');
  await settled();
  f.child.emit('error', Object.assign(new Error('synthetic missing executable'), { code: 'ENOENT' }));
  const result = await connected;
  assert.equal(result[0].status, 'error'); assert.equal(result[0].issue, 'cli-unavailable'); assert.match(result[0].message, /安装/);
  assert.equal(f.opened.length, 0); assert.equal(f.child.killed, true);
});

test('island Codex: routine reads do not force token refresh and a 22-second query succeeds', async t => {
  const f = await connectedCodex(t);
  f.setReply(request => request.method === 'account/read' ? undefined : f.defaultReply(request));
  const pending = f.service.refresh(true); await settled();
  const account = f.requests.at(-1);
  assert.equal(account.method, 'account/read'); assert.deepEqual(account.params, { refreshToken: false });
  await advance(t, 22000);
  assert.equal(f.service.read()[0].status, 'ready');
  f.send({ id: account.id, ...f.defaultReply(account) }); await pending;
  assert.equal(f.service.read()[0].status, 'ready');
  assert.equal(f.requests.some(request => request.params?.refreshToken === true), false);
  assert.equal(f.opened.length, 1);
});

test('island Codex: timeout retains the last quota and automatically recovers after ten seconds', async t => {
  const f = await connectedCodex(t), snapshot = f.service.read()[0];
  f.setReply(request => request.method === 'account/rateLimits/read' ? undefined : f.defaultReply(request));
  const pending = f.service.refresh(true); await settled();
  await advance(t, 30000); await pending;
  const stale = f.service.read()[0];
  assert.equal(stale.status, 'stale'); assert.equal(stale.issue, undefined);
  assert.deepEqual(stale.windows, snapshot.windows); assert.equal(stale.updatedAt, snapshot.updatedAt);
  assert.equal(JSON.parse(readFileSync(join(f.dir, 'island-connections.json'), 'utf8')).codex, true);
  const count = f.requests.length; f.setReply(f.defaultReply);
  await advance(t, 9999); assert.equal(f.requests.length, count);
  await advance(t, 1); assert.equal(f.service.read()[0].status, 'ready');
  assert.ok(f.service.read()[0].updatedAt > snapshot.updatedAt);
  assert.equal(f.opened.length, 1); assert.equal(f.launches.length, 1);
});

test('island Codex: transient failures back off at 10, 30 and 60 seconds without reauthorizing', async t => {
  const f = await connectedCodex(t);
  f.setReply(request => request.method === 'account/rateLimits/read' ? { error: { code: -32001, message: 'Server overloaded; auth session remains valid' } } : f.defaultReply(request));
  await f.service.refresh(true);
  for (const wait of [10000, 30000, 60000]) {
    const count = f.requests.length;
    await advance(t, wait - 1); assert.equal(f.requests.length, count);
    await advance(t, 1); assert.equal(f.requests.length, count + 2);
    assert.equal(f.service.read()[0].status, 'stale'); assert.equal(f.service.read()[0].issue, undefined);
  }
  f.setReply(f.defaultReply);
  await f.service.refresh(true);
  assert.equal(f.service.read()[0].status, 'ready');
  const count = f.requests.length; await advance(t, 120000); assert.equal(f.requests.length, count);
  assert.equal(f.opened.length, 1); assert.equal(f.launches.length, 1);
});

test('island Codex: manual refresh bypasses cooldown, shares an in-flight read and cancels retry', async t => {
  const f = await connectedCodex(t);
  f.setReply(request => request.method === 'account/read' ? undefined : f.defaultReply(request));
  const first = f.service.refresh(true), second = f.service.refresh(true); await settled();
  const account = f.requests.at(-1), count = f.requests.length;
  assert.equal(account.method, 'account/read');
  f.send({ id: account.id, error: { message: 'error sending request: synthetic offline' } });
  await Promise.all([first, second]); assert.equal(f.requests.length, count);
  assert.equal(f.service.read()[0].status, 'stale');
  f.setReply(f.defaultReply); await f.service.refresh(true);
  assert.equal(f.service.read()[0].status, 'ready'); assert.equal(f.requests.length, count + 2);
  await advance(t, 60000); assert.equal(f.requests.length, count + 2);
  assert.equal(f.requests.filter(request => request.method === 'account/login/start').length, 1);
});

test('island Codex: only confirmed auth failure forces one refresh with a 60-second budget', async t => {
  const f = await connectedCodex(t);
  f.setReply(request => request.method !== 'account/read' ? f.defaultReply(request)
    : request.params.refreshToken ? undefined : { error: { message: 'authentication required', code: -32600 } });
  const pending = f.service.refresh(true); await settled();
  const refresh = f.requests.at(-1);
  assert.deepEqual(refresh.params, { refreshToken: true });
  await advance(t, 50000);
  f.send({ id: refresh.id, ...f.defaultReply(refresh) }); await pending;
  assert.equal(f.service.read()[0].status, 'ready');
  assert.equal(f.requests.filter(request => request.params?.refreshToken === true).length, 1);
  assert.equal(f.opened.length, 1);
});

test('island Codex: invalid authorization requires an explicit login and never retries in the background', async t => {
  const f = await connectedCodex(t);
  f.setReply(request => request.method === 'account/read' ? { result: { account: null } } : f.defaultReply(request));
  await f.service.refresh(true);
  assert.equal(f.service.read()[0].issue, 'auth-required'); assert.equal(f.service.read()[0].status, 'error');
  const count = f.requests.length;
  await advance(t, 300000); await f.service.refresh(true);
  assert.equal(f.requests.length, count); assert.equal(f.opened.length, 1);
  f.setReply(f.defaultReply); await f.service.connect('codex');
  assert.equal(f.opened.length, 2);
  f.send({ method: 'account/login/completed', params: { success: true } }); await settled();
  assert.equal(f.service.read()[0].status, 'ready'); assert.equal(f.service.read()[0].issue, undefined);
});

test('island Codex: a health check restarts only an unresponsive private quota service', async t => {
  for (const responsive of [true, false]) await t.test(responsive ? 'responsive CLI stays alive' : 'hung CLI restarts without login', async t => {
    const f = await connectedCodex(t);
    f.setReply(request => request.method === 'account/rateLimits/read' ? undefined : f.defaultReply(request));
    const first = f.service.refresh(true); await settled(); await advance(t, 30000); await first;
    await advance(t, 10000);
    if (!responsive) f.setReply(() => undefined);
    await advance(t, 30000);
    if (!responsive) await advance(t, 5000);
    assert.equal(Boolean(f.child.killed), !responsive);
    assert.equal(f.service.read()[0].status, 'stale');
    f.setReply(f.defaultReply); await advance(t, 30000);
    assert.equal(f.service.read()[0].status, 'ready');
    assert.equal(f.launches.length, responsive ? 1 : 2);
    assert.equal(f.opened.length, 1);
    assert.equal(f.requests.filter(request => request.method === 'account/login/start').length, 1);
    assert.equal(f.requests.some(request => request.method === 'account/logout'), false);
  });
});

test('island Codex: disconnect or shutdown cancels recovery and ignores delayed replies', async t => {
  for (const disconnect of [true, false]) await t.test(disconnect ? 'disconnect' : 'shutdown', async t => {
    const f = await connectedCodex(t);
    f.setReply(request => request.method === 'account/rateLimits/read' ? undefined : f.defaultReply(request));
    const pending = f.service.refresh(true); await settled();
    const held = f.requests.at(-1);
    await advance(t, 30000); await pending;
    if (disconnect) await f.service.disconnect('codex'); else f.service.stop();
    const count = f.requests.length;
    f.send({ id: held.id, ...f.defaultReply(held) }); await advance(t, 300000);
    assert.equal(f.requests.length, count); assert.equal(f.launches.length, 1);
    if (disconnect) assert.equal(f.service.read()[0].status, 'disconnected');
    else assert.equal(f.service.read()[0].status, 'stale');
  });
});

test('island Codex: auth-invalidated notifications cannot be revived by an older quota reply', async t => {
  const f = await connectedCodex(t);
  f.setReply(request => request.method === 'account/rateLimits/read' ? undefined : f.defaultReply(request));
  const pending = f.service.refresh(true); await settled(); const held = f.requests.at(-1);
  f.send({ method: 'account/updated', params: { authMode: null } }); await pending;
  f.send({ id: held.id, ...f.defaultReply(held) }); await advance(t, 300000);
  assert.equal(f.service.read()[0].issue, 'auth-required'); assert.equal(f.child.killed, true);
  assert.equal(f.opened.length, 1); assert.equal(f.launches.length, 1);
});

test('island Codex: a fresh quota notification wins over an older timed-out query', async t => {
  const f = await connectedCodex(t);
  f.setReply(request => request.method === 'account/rateLimits/read' ? undefined : f.defaultReply(request));
  const pending = f.service.refresh(true); await settled();
  f.send({ method: 'account/rateLimits/updated', params: { rateLimits: { primary: { usedPercent: 55, windowDurationMins: 300 } } } });
  await advance(t, 30000); await pending;
  assert.equal(f.service.read()[0].status, 'ready'); assert.equal(f.service.read()[0].windows[0].remaining, 45);
  const count = f.requests.length; await advance(t, 60000); assert.equal(f.requests.length, count);
});

test('island Codex: a private service exit recovers automatically using the saved authorization', async t => {
  const f = await connectedCodex(t);
  f.child.emit('exit', 1);
  assert.equal(f.service.read()[0].status, 'stale');
  await advance(t, 10000);
  assert.equal(f.service.read()[0].status, 'ready'); assert.equal(f.launches.length, 2);
  assert.equal(f.opened.length, 1);
  assert.equal(f.requests.filter(request => request.method === 'account/login/start').length, 1);
});

test('island Codex: diagnostics record timing and failure category without account or credential payloads', async t => {
  const f = await connectedCodex(t);
  f.setReply(request => request.method === 'account/rateLimits/read'
    ? { error: { code: -32001, message: 'error sending request token=synthetic-secret user=synthetic@example.test https://secret.example/auth' } } : f.defaultReply(request));
  await f.service.refresh(true);
  const log = readFileSync(join(f.dir, 'island-codex-diagnostics.jsonl'), 'utf8');
  const entries = log.trim().split('\n').map(line => JSON.parse(line));
  assert.ok(entries.some(entry => entry.method === 'account/rateLimits/read' && entry.outcome === 'transport' && entry.code === -32001));
  assert.ok(entries.every(entry => Number.isFinite(entry.durationMs) && entry.at));
  for (const secret of ['synthetic-secret', 'synthetic@example.test', 'secret.example', 'authUrl', 'refreshToken', 'synthetic-login']) assert.equal(log.includes(secret), false);
  writeFileSync(join(f.dir, 'island-codex-diagnostics.jsonl'), 'x'.repeat(65536));
  f.setReply(f.defaultReply); await f.service.refresh(true);
  const rotated = readFileSync(join(f.dir, 'island-codex-diagnostics.jsonl'), 'utf8');
  assert.ok(rotated.length < 65536); assert.doesNotThrow(() => rotated.trim().split('\n').forEach(line => JSON.parse(line)));
});

test('island quota: Z Code encrypts credentials, throttles reads, retains last snapshot on failure and backs off', async t => {
  const f = fixture(t); let now = Date.now(), reads = 0, response = 'ok';
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'fetch', async (url: string, options: any) => {
    reads++; assert.equal(url, 'https://open.bigmodel.cn/api/monitor/usage/quota/limit');
    assert.equal(options.headers.Authorization, 'synthetic-key'); assert.equal(options.redirect, 'error');
    if (response === 'offline') throw new TypeError('fetch failed');
    return response === '429' ? new Response('', { status: 429, headers: { 'retry-after': '600' } }) : quotaResponse();
  });
  await f.service.connect('zcode', 'synthetic-key');
  const ready = f.service.read()[1]; assert.equal(ready.status, 'ready'); assert.equal(ready.windows[0].remaining, 63);
  assert.equal(readFileSync(join(f.dir, 'island-connections.json'), 'utf8').includes('synthetic-key'), false);
  assert.equal(JSON.stringify(f.service.read()).includes('synthetic-key'), false);
  await f.service.refresh(); assert.equal(reads, 1);
  now += 61000; response = 'offline'; await f.service.refresh();
  const stale = f.service.read()[1]; assert.equal(stale.status, 'error'); assert.deepEqual(stale.windows, ready.windows); assert.equal(stale.updatedAt, ready.updatedAt);
  now += 61000; response = '429'; await f.service.refresh(); assert.equal(reads, 3);
  now += 300000; await f.service.refresh(); assert.equal(reads, 3);
  now += 301000; response = 'ok'; await f.service.refresh(); assert.equal(reads, 4);
});

test('island quota: disconnect discards an in-flight response and removes saved key', async t => {
  const f = fixture(t); let finish!: (response: Response) => void;
  t.mock.method(globalThis, 'fetch', () => new Promise<Response>(resolve => { finish = resolve; }));
  const pending = f.service.connect('zcode', 'synthetic-key'); await settled();
  await f.service.disconnect('zcode'); finish(quotaResponse()); await pending;
  assert.equal(f.service.read()[1].status, 'disconnected'); assert.equal(f.service.read()[1].windows.length, 0);
  assert.equal(JSON.parse(readFileSync(join(f.dir, 'island-connections.json'), 'utf8')).zcode, '');
});

test('island quota: unavailable system encryption prevents credential persistence and requests', async t => {
  const f = fixture(t); f.electron.safeStorage.isEncryptionAvailable = () => false;
  await assert.rejects(f.service.connect('zcode', 'synthetic-key'), /加密不可用/);
  assert.equal(f.service.read()[1].status, 'disconnected');
});

test('island quota: Cursor and Grok Bot parse actual pools and never invent missing limits or resets', () => {
  const reset = Date.parse('2026-12-01T00:00:00Z');
  assert.deepEqual(parsers.cursorQuotaWindows({ billingCycleEnd: '2026-12-01T00:00:00Z', individualUsage: { plan: { autoPercentUsed: 20, apiPercentUsed: 70 } } }), [
    { label: 'Cursor 模型', remaining: 80, resetsAt: reset }, { label: '其他模型', remaining: 30, resetsAt: reset },
  ]);
  assert.deepEqual(parsers.cursorQuotaWindows({ individualUsage: { plan: { used: 1200, limit: 2000 } } }), [{ label: '套餐额度', remaining: 40, resetsAt: null }]);
  for (const value of [{}, { individualUsage: { plan: { enabled: false, totalPercentUsed: 20 } } }, { individualUsage: { plan: { totalPercentUsed: -1 } } }]) assert.deepEqual(parsers.cursorQuotaWindows(value), []);
  assert.deepEqual(parsers.grokbotQuotaWindows({ usagePercent: 37, nextResetTimestampUtc: '2026-12-01T00:00:00Z' }), [{ label: '周', remaining: 63, resetsAt: reset }]);
  assert.deepEqual(parsers.grokbotQuotaWindows({ usagePercent: 120 }), [{ label: '周', remaining: 0, resetsAt: null }]);
  for (const value of [{}, { usagePercent: -1 }, { usagePercent: 20, hasNonZeroIncludedLimit: false }, { usagePercent: 20, usesPooledEnterpriseAllowance: true }]) assert.deepEqual(parsers.grokbotQuotaWindows(value), []);
});

test('island quota: system browser PKCE sign-in isolates accounts, reads usage and restores private sessions', async t => {
  const f = fixture(t);
  for (const id of ['cursor', 'grokbot']) {
    const result = await f.service.connect(id);
    assert.equal(result.find((p: any) => p.id === id).status, 'connecting');
    const login = new URL(f.opened.at(-1)!), account = f.sessions.get(`persist:island-quota-${id}`);
    assert.equal(login.origin, 'https://cursor.com'); assert.equal(login.pathname, '/loginDeepControl');
    assert.equal(login.searchParams.get('mode'), 'login'); assert.equal(login.searchParams.get('redirectTarget'), id === 'cursor' ? 'cli' : 'sand');
    const token = account.signIn(`synthetic_${id}`);
    await f.poll(); await f.service.refresh();
    const ready = f.service.read().find((p: any) => p.id === id);
    assert.equal(ready.status, 'ready');
    assert.equal(ready.windows[0].remaining, id === 'cursor' ? 77 : 58);
    const poll = account.requests[0], pollUrl = new URL(poll.url), verifier = pollUrl.searchParams.get('verifier')!;
    assert.equal(pollUrl.origin, 'https://api2.cursor.sh'); assert.equal(pollUrl.pathname, '/auth/poll');
    assert.equal(pollUrl.searchParams.get('uuid'), login.searchParams.get('uuid'));
    assert.match(verifier, /^[\w-]{43}$/); assert.equal(login.searchParams.get('challenge'), createHash('sha256').update(verifier).digest('base64url'));
    assert.equal(login.href.includes(verifier), false); assert.equal(poll.options.credentials, 'omit'); assert.equal(poll.options.redirect, 'error'); assert.equal(poll.options.cache, 'no-store');
    const cookie = account.values[0];
    assert.equal(cookie.value, encodeURIComponent(`synthetic_${id}::${token}`));
    assert.equal(cookie.httpOnly, true); assert.equal(cookie.secure, true); assert.equal(cookie.sameSite, 'lax'); assert.equal(account.flushed, true);
    const request = account.requests[1];
    assert.equal(request.url, id === 'cursor' ? 'https://cursor.com/api/usage-summary' : 'https://cursor.com/api/dashboard/get-sand-usage-status');
    assert.equal(request.options.credentials, 'include'); assert.equal(request.options.redirect, 'error');
    assert.equal(request.options.method, id === 'cursor' ? 'GET' : 'POST');
    const saved = readFileSync(join(f.dir, 'island-connections.json'), 'utf8');
    for (const secret of [token, verifier, 'synthetic-refresh-token']) { assert.equal(saved.includes(secret), false); assert.equal(JSON.stringify(f.service.read()).includes(secret), false); }
  }
  assert.notEqual(new URL(f.opened[0]).searchParams.get('uuid'), new URL(f.opened[1]).searchParams.get('uuid'));
  assert.notEqual(new URL(f.opened[0]).searchParams.get('challenge'), new URL(f.opened[1]).searchParams.get('challenge'));
  assert.notEqual(f.service.read()[2].accountKey, f.service.read()[3].accountKey);
  const saved = readFileSync(join(f.dir, 'island-connections.json'), 'utf8');
  assert.equal(JSON.parse(saved).cursor, true); assert.equal(JSON.parse(saved).grokbot, true);
  const restored = f.restore(); await restored.refresh();
  assert.equal(restored.read()[2].status, 'ready'); assert.equal(restored.read()[3].status, 'ready'); restored.stop();
  await f.service.disconnect('cursor');
  assert.equal(f.sessions.get('persist:island-quota-cursor').cleared, true);
  assert.equal(f.sessions.get('persist:island-quota-grokbot').cleared, false);
  assert.equal(f.service.read()[3].status, 'ready'); assert.equal(f.service.read()[2].status, 'disconnected');
});

test('island quota: pending login tolerates 404 and temporary network errors, then can be cancelled', async t => {
  const f = fixture(t);
  await f.service.connect('cursor'); const account = f.sessions.get('persist:island-quota-cursor');
  await f.poll(); assert.equal(f.service.read()[2].status, 'connecting');
  account.response = () => { throw new TypeError('fetch failed with sensitive diagnostics'); };
  await f.poll(); assert.equal(f.service.read()[2].status, 'connecting');
  const pending = account.requests.length;
  await f.service.disconnect('cursor'); await f.poll();
  assert.equal(f.service.read()[2].status, 'disconnected'); assert.equal(f.waits.length, 0); assert.equal(account.requests.length, pending);
  assert.equal(account.cleared, true);
});

test('island quota: revoked browser login retains only a stale snapshot', async t => {
  const f = fixture(t); let now = Date.now(); t.mock.method(Date, 'now', () => now);
  await f.service.connect('cursor');
  const account = f.sessions.get('persist:island-quota-cursor');
  account.signIn('synthetic-user');
  await f.poll(); await f.service.refresh();
  const snapshot = f.service.read()[2];
  now += 61000; account.response = () => new Response('', { status: 401 }); await f.service.refresh();
  const stale = f.service.read()[2];
  assert.equal(stale.status, 'error'); assert.deepEqual(stale.windows, snapshot.windows); assert.equal(stale.updatedAt, snapshot.updatedAt);
  assert.match(stale.message, /登录已失效/); assert.equal(account.values.length, 0);
  await f.service.disconnect('cursor');
  assert.equal(f.service.read()[2].windows.length, 0);
});

test('island quota: disconnect cancels in-flight browser response without changing another provider', async t => {
  const f = fixture(t); let finish!: (value: Response) => void;
  await f.service.connect('cursor'); const account = f.sessions.get('persist:island-quota-cursor');
  account.usage = () => new Promise<Response>(resolve => { finish = resolve; });
  account.signIn('synthetic-user'); await f.poll();
  await f.service.disconnect('cursor'); finish(Response.json({ individualUsage: { plan: { totalPercentUsed: 10 } } }));
  await settled();
  assert.equal(f.service.read()[2].status, 'disconnected'); assert.deepEqual(f.service.read()[2].windows, []);
});

test('island quota: pooled or absent Grok Bot allowance is unsupported, with no fake percentage', async t => {
  const f = fixture(t);
  await f.service.connect('grokbot'); const account = f.sessions.get('persist:island-quota-grokbot');
  account.usage = () => Response.json({ usagePercent: 0, usesPooledEnterpriseAllowance: true });
  account.signIn('synthetic-user'); await f.poll(); await f.service.refresh();
  const provider = f.service.read()[3];
  assert.equal(provider.status, 'unsupported'); assert.deepEqual(provider.windows, []); assert.match(provider.message, /团队共享额度/);
});

test('island quota: replacing login aborts the old poll and cannot accept its delayed result', async t => {
  const f = fixture(t); let finish!: (value: Response) => void;
  await f.service.connect('cursor'); const account = f.sessions.get('persist:island-quota-cursor');
  const token = account.signIn('abandoned-user');
  account.response = () => new Promise<Response>(resolve => { finish = resolve; });
  await f.poll(); const old = account.requests[0];
  const next = f.service.connect('cursor'); assert.equal(old.options.signal.aborted, true);
  finish(Response.json({ accessToken: token })); await next;
  assert.equal(account.values.length, 0); assert.equal(f.service.read()[2].status, 'connecting');
  account.response = (url: string) => new URL(url).pathname === '/auth/poll' ? Response.json({ accessToken: token }) : account.usage(url); await f.poll(); await f.service.refresh();
  assert.equal(f.service.read()[2].status, 'ready');
});

test('island quota: an old rejected usage response cannot erase a newly authorized session', async t => {
  const f = fixture(t); let now = Date.now(), finish!: (value: Response) => void;
  t.mock.method(Date, 'now', () => now);
  await f.service.connect('cursor'); const account = f.sessions.get('persist:island-quota-cursor');
  account.signIn('first-user'); await f.poll(); await f.service.refresh();
  const usage = account.usage;
  account.usage = () => new Promise<Response>(resolve => { finish = resolve; });
  now += 61000; const pending = f.service.refresh(); await settled();
  await f.service.connect('cursor'); const token = account.signIn('next-user'); await f.poll();
  assert.ok(account.values[0].value.includes(token));
  account.usage = usage; finish(new Response('', { status: 401 })); await pending; await settled();
  assert.equal(account.values[0].value, encodeURIComponent(`next-user::${token}`));
  assert.equal(f.service.read()[2].status, 'ready');
});

test('island quota: cancelling while a cookie is being saved clears it before returning', async t => {
  const f = fixture(t); let finish!: () => void;
  await f.service.connect('grokbot'); const account = f.sessions.get('persist:island-quota-grokbot');
  account.cookies.set = (cookie: any) => new Promise<void>(resolve => { finish = () => { account.values = [cookie]; resolve(); }; });
  account.signIn('cancelled-user'); await f.poll();
  const cancelled = f.service.disconnect('grokbot'); finish(); await cancelled;
  assert.equal(account.values.length, 0); assert.equal(f.service.read()[3].status, 'disconnected');
  assert.equal(JSON.parse(readFileSync(join(f.dir, 'island-connections.json'), 'utf8')).grokbot, false);
});

test('island quota: browser-open failure, refusal, invalid tokens and timeout leave a retryable status', async t => {
  const f = fixture(t); let now = Date.now(); t.mock.method(Date, 'now', () => now);
  f.electron.shell.openExternal = async () => { throw new Error('sensitive URL'); };
  await f.service.connect('cursor'); await settled();
  assert.match(f.service.read()[2].message, /无法打开系统浏览器/); assert.equal(f.service.read()[2].status, 'error');
  f.electron.shell.openExternal = async (url: string) => { f.opened.push(url); };
  const account = f.sessions.get('persist:island-quota-cursor');
  for (const [response, message] of [
    [() => new Response('sensitive server body', { status: 403 }), /授权被拒绝/],
    [() => Response.json({ accessToken: 'sensitive-invalid-token' }), /有效的登录结果/],
    [() => { const token = account.signIn('expired-user'); const claims = JSON.stringify({ sub: 'user', exp: Math.floor(now / 1000) - 60 }); return Response.json({ accessToken: `${token.split('.')[0]}.${Buffer.from(claims).toString('base64url')}.signature` }); }, /有效的登录结果/],
  ] as const) {
    await f.service.connect('cursor'); account.response = response; await f.poll();
    assert.equal(f.service.read()[2].status, 'error'); assert.match(f.service.read()[2].message, message); assert.equal(account.values.length, 0);
  }
  await f.service.connect('cursor'); now += 300000; await f.poll();
  assert.equal(f.service.read()[2].status, 'error'); assert.match(f.service.read()[2].message, /超时/); assert.equal(f.waits.length, 0);
});

test('island quota: rate-limited login respects retry-after and cancels immediately', async t => {
  const f = fixture(t);
  await f.service.connect('cursor'); const account = f.sessions.get('persist:island-quota-cursor');
  account.response = () => new Response('', { status: 429, headers: { 'retry-after': '20' } }); await f.poll();
  assert.equal(f.waits[0].interval, 20000); assert.equal(f.service.read()[2].status, 'connecting');
  await f.service.disconnect('cursor'); assert.equal(f.waits.length, 0);
});
