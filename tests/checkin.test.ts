import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CHECKIN_PROVIDERS, DEFAULT_CHECKIN_SETTINGS, CheckinSettingsSchema, checkinCycle, emptyCheckinRow, type CheckinProvider, type CheckinState } from '../shared/checkin-contracts';
import { CheckinError, CheckinProviders, assertResponse, checkinError, parseQoderStatus, parseTraeStatus, parseWorkbuddyStatus, type CheckinCredential, type CheckinRequest, type ProviderStatus } from '../electron/checkin-providers';
import { CheckinService, type CheckinOptions } from '../electron/checkin';
import { authorizeCheckin, traeCallback } from '../electron/checkin-auth';

const at = Date.parse('2026-11-10T10:05:00+08:00');
const credential = (id = 'user-1'): CheckinCredential => ({ userId: id, name: 'Test account', accessToken: 'private-access-token', refreshToken: 'private-refresh-token', expiresAt: 0, deviceId: randomUUID() });
class FakeProviders extends CheckinProviders {
  claims: CheckinProvider[] = []; reads: CheckinProvider[] = []; refreshes = 0;
  states = new Map<CheckinProvider, ProviderStatus>();
  onClaim?: (provider: CheckinProvider) => Promise<{ reward: number | null; delayed: boolean }>;
  onStatus?: (provider: CheckinProvider, c: CheckinCredential) => Promise<ProviderStatus>;
  onLogin?: () => Promise<CheckinCredential>;
  constructor() { super(async () => ({ status: 200, body: {} })); }
  override async status(p: CheckinProvider, c: CheckinCredential): Promise<ProviderStatus> { this.reads.push(p); return this.onStatus ? this.onStatus(p, c) : this.states.get(p) || { status: 'ready', message: '可以签到', reward: 100, campaignId: 'daily' }; }
  override async claim(p: CheckinProvider): Promise<{ reward: number | null; delayed: boolean }> {
    this.claims.push(p);
    if (this.onClaim) return this.onClaim(p);
    this.states.set(p, { status: 'claimed', message: '平台确认领取', reward: null });
    return { reward: 100, delayed: false };
  }
  override async refresh(_p: CheckinProvider, c: CheckinCredential): Promise<CheckinCredential> { this.refreshes++; return { ...c, accessToken: 'rotated-access', refreshToken: 'rotated-refresh', expiresAt: at + 86400000 }; }
  override async workbuddyLogin(): Promise<CheckinCredential> { return this.onLogin ? this.onLogin() : credential(); }
}
function harness(t: TestContext, ids: CheckinProvider[] = ['workbuddy'], patch: Partial<CheckinOptions> = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'wb-checkin-')), key = randomBytes(32);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const protect = (text: string): string => { const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv); const body = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64'); };
  const unprotect = (text: string): string => { const bytes = Buffer.from(text, 'base64'), cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12)); cipher.setAuthTag(bytes.subarray(12, 28)); return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8'); };
  const file = join(directory, 'checkin.json');
  const credentials = Object.fromEntries(ids.map(p => [p, credential()]));
  writeFileSync(file, JSON.stringify({ version: 1, deviceId: randomUUID(), settings: DEFAULT_CHECKIN_SETTINGS, credentials: protect(JSON.stringify(credentials)), rows: CHECKIN_PROVIDERS.map(p => ({ ...emptyCheckinRow(p), ...(ids.includes(p) ? { connected: true, account: 'Test account', status: 'ready' } : {}) })), records: [], attempts: {}, autoRuns: {} }));
  const providers = new FakeProviders(), events: CheckinState[] = [], notices: string[] = [];
  let now = at;
  const options: CheckinOptions = { directory, providers, protect, unprotect, changed: state => events.push(state), open: async () => {}, notify: message => notices.push(message), now: () => now, ...patch };
  const service = new CheckinService(options); t.after(() => service.dispose());
  return { service, providers, events, notices, options, file, unprotect, setTime(value: number) { now = value; }, restart() { service.dispose(); const next = new CheckinService(options); t.after(() => next.dispose()); return next; } };
}

test('platform query success alone never means checked-in or eligible', () => {
  assert.throws(() => parseTraeStatus({ code: 0 }), /明确/);
  assert.throws(() => parseWorkbuddyStatus({ code: 0, data: {} }), /明确/);
  assert.equal(parseTraeStatus({ code: 0, enable: true, checked_in: false, credits: 150 }).status, 'ready');
  assert.equal(parseTraeStatus({ code: 0, enable: false, checked_in: false }).status, 'unavailable');
  assert.equal(parseWorkbuddyStatus({ data: { active: false, today_checked_in: false } }).status, 'unavailable');
  assert.equal(parseWorkbuddyStatus({ data: { active: true, today_checked_in: true } }).status, 'claimed');
});
test('Qoder only accepts an unambiguous daily Credits campaign', () => {
  const daily = { campaignId: 'daily-2026', campaignKey: 'daily-credits', claimStatus: 'CLAIMABLE', actionType: 'CLAIM_BENEFIT', benefit: { kind: 'CREDITS', amount: 100 } };
  assert.equal(parseQoderStatus({ campaigns: [daily] }).campaignId, 'daily-2026');
  assert.equal(parseQoderStatus({ campaigns: [{ ...daily, claimStatus: 'CLAIMED', actionType: 'VIEW_DETAILS' }] }).status, 'claimed');
  for (const campaigns of [[], [{ ...daily, campaignKey: 'newcomer' }], [{ ...daily, benefit: { kind: 'REDEMPTION_CODE' } }], [daily, { ...daily, campaignId: 'another' }]]) assert.equal(parseQoderStatus({ campaigns }).status, 'unavailable');
});
test('authorization expiry, risk denial and unknown business errors are actionable and redact payloads', () => {
  assert.throws(() => assertResponse({ status: 401, body: { token: 'secret' } }), /重新连接/);
  assert.throws(() => assertResponse({ status: 200, body: { code: 9095, message: 'secret' } }), /设备校验/);
  assert.throws(() => assertResponse({ status: 200, body: { code: 3456, message: 'secret' } }), /未接受/);
  assert.equal(checkinError(new Error('private-token')), '操作未完成，请稍后重试。');
});
test('Qoder period changes at Beijing 10:00 and is independent of the OS timezone', () => {
  assert.equal(checkinCycle('qoder', Date.parse('2026-11-10T09:59:59+08:00')), '2026-11-09');
  assert.equal(checkinCycle('qoder', Date.parse('2026-11-10T10:00:00+08:00')), '2026-11-10');
  assert.equal(checkinCycle('trae', Date.parse('2026-11-10T00:00:00+08:00')), '2026-11-10');
  assert.equal(CheckinSettingsSchema.safeParse({ ...DEFAULT_CHECKIN_SETTINGS, time: '24:00' }).success, false);
});
test('one-click checks then claims and confirms; an already claimed account is never posted again', async t => {
  const h = harness(t);
  await h.service.run(['workbuddy', 'workbuddy']);
  assert.deepEqual(h.providers.claims, ['workbuddy']);
  assert.equal(h.service.state().rows[0].status, 'claimed');
  assert.equal(h.service.state().rows[0].reward, 100);
  await h.service.run(['workbuddy']);
  assert.equal(h.providers.claims.length, 1);
  const raw = readFileSync(h.file, 'utf8');
  assert.ok(!raw.includes('private-access-token') && !raw.includes('private-refresh-token'));
  assert.ok(!JSON.stringify(h.service.state()).includes('private-access-token'));
});
test('a timed out claim remains pending across clicks, restart and reauthorization of the same account', async t => {
  const h = harness(t);
  h.providers.onClaim = async () => { throw new CheckinError('网络不可用', 'network'); };
  await h.service.run(['workbuddy']);
  assert.equal(h.service.state().rows[0].status, 'pending');
  await h.service.run(['workbuddy']);
  const next = h.restart(); await next.run(['workbuddy']);
  next.disconnect('workbuddy'); await next.loginWorkbuddy({ phone: '13800000000', code: '123456' }); await next.run(['workbuddy']);
  assert.equal(h.providers.claims.length, 1);
  assert.equal(next.state().rows[0].status, 'pending');
  h.providers.states.set('workbuddy', { status: 'claimed', message: '已确认', reward: null });
  await next.refresh('workbuddy'); assert.equal(next.state().rows[0].status, 'claimed');
});
test('delayed settlement does not turn a successful POST into a false success', async t => {
  const h = harness(t);
  h.providers.onClaim = async () => ({ reward: 150, delayed: true });
  await h.service.run(['workbuddy']);
  assert.equal(h.service.state().rows[0].status, 'pending');
  assert.equal(h.service.state().rows[0].reward, null);
});
test('a confirmed check-in with delayed credits never displays an invented received amount', async t => {
  const h = harness(t);
  h.providers.onClaim = async () => { h.providers.states.set('workbuddy', { status: 'claimed', message: '签到已确认', reward: null }); return { reward: 100, delayed: true }; };
  await h.service.run(['workbuddy']);
  assert.equal(h.service.state().rows[0].status, 'claimed');
  assert.equal(h.service.state().rows[0].reward, null);
  assert.match(h.service.state().rows[0].message, /入账时间/);
});
test('network failure for one app does not stop other connected apps', async t => {
  const h = harness(t, [...CHECKIN_PROVIDERS]);
  h.providers.onStatus = async p => { if (p === 'workbuddy') throw new CheckinError('网络不可用', 'network'); return h.providers.states.get(p) || { status: 'ready', message: '可领取', reward: 100, campaignId: 'daily' }; };
  await h.service.run([...CHECKIN_PROVIDERS]);
  assert.deepEqual(h.providers.claims, ['qoder', 'trae']);
  assert.equal(h.service.state().rows[0].status, 'error');
  assert.equal(h.service.state().records.length, 3);
});
test('concurrent actions cannot submit the same provider twice', async t => {
  const h = harness(t); let complete!: () => void;
  h.providers.onClaim = () => new Promise(resolve => { complete = () => { h.providers.states.set('workbuddy', { status: 'claimed', message: '已确认', reward: null }); resolve({ reward: 100, delayed: false }); }; });
  const first = h.service.run(['workbuddy']);
  await new Promise(resolve => setImmediate(resolve));
  await h.service.run(['workbuddy']);
  assert.equal(h.providers.claims.length, 1); complete(); await first;
});
test('disconnect cancels in-flight work and late responses cannot restore credentials', async t => {
  const h = harness(t); let complete!: (value: ProviderStatus) => void;
  h.providers.onStatus = () => new Promise(resolve => { complete = resolve; });
  const first = h.service.run(['workbuddy']); h.service.disconnect('workbuddy'); complete({ status: 'ready', message: '', reward: 100 }); await first;
  assert.equal(h.service.state().rows[0].status, 'disconnected');
  assert.equal(h.providers.claims.length, 0);
  assert.equal(JSON.parse(readFileSync(h.file, 'utf8')).credentials, '');
});
test('canceling login prevents late completion from connecting or persisting tokens', async t => {
  const h = harness(t, []); let complete!: (c: CheckinCredential) => void;
  h.providers.onLogin = () => new Promise(resolve => { complete = resolve; });
  const first = h.service.loginWorkbuddy({ phone: '13800000000', code: '123456' });
  h.service.cancelAuth('workbuddy'); complete(credential()); await first;
  assert.equal(h.service.state().rows[0].connected, false);
  assert.deepEqual(JSON.parse(h.unprotect(JSON.parse(readFileSync(h.file, 'utf8')).credentials)), {});
});
test('refresh rotation is durably saved before a claim, and storage failure prevents the POST', async t => {
  const h = harness(t); let first = true;
  h.providers.onStatus = async (_p, c) => {
    if (first) { first = false; throw new CheckinError('expired', 'auth'); }
    assert.equal(c.accessToken, 'rotated-access');
    const stored = JSON.parse(h.unprotect(JSON.parse(readFileSync(h.file, 'utf8')).credentials));
    assert.equal(stored.workbuddy.refreshToken, 'rotated-refresh');
    return h.providers.states.get('workbuddy') || { status: 'ready', message: '', reward: 100 };
  };
  await h.service.run(['workbuddy']); assert.equal(h.providers.refreshes, 1); assert.equal(h.providers.claims.length, 1);
  const blocked = harness(t, ['workbuddy'], { write() { throw Error('disk failure'); } });
  await blocked.service.run(['workbuddy']); assert.equal(blocked.providers.claims.length, 0); assert.match(blocked.service.state().warning, /无法保存/);
});
test('automatic mode is opt-in, persistent, deduplicated after resume and reports required action once', async t => {
  const h = harness(t); await h.service.tick('startup'); assert.equal(h.providers.claims.length, 0);
  h.service.saveSettings({ ...DEFAULT_CHECKIN_SETTINGS, enabled: true, providers: ['workbuddy'] });
  h.providers.onStatus = async () => { throw new CheckinError('登录已失效', 'auth'); };
  await h.service.tick('startup'); await h.service.tick('resume'); await h.restart().tick('startup');
  assert.equal(h.notices.length, 1);
  assert.equal(h.service.state().records[0].source, 'auto');
});
test('catchup disabled skips startup and a long sleep, then runs on the next scheduled day', async t => {
  const h = harness(t); h.service.saveSettings({ ...DEFAULT_CHECKIN_SETTINGS, enabled: true, catchup: false, providers: ['workbuddy'] });
  await h.service.tick('startup'); assert.equal(h.providers.claims.length, 0);
  h.setTime(at + 30000); await h.service.tick('timer'); assert.equal(h.providers.claims.length, 0);
  h.setTime(at + 3600000); await h.service.tick('timer'); assert.equal(h.providers.claims.length, 0);
  h.setTime(at + 86400000 - 30000); await h.service.tick('timer');
  h.setTime(at + 86400000); await h.service.tick('timer'); assert.equal(h.providers.claims.length, 1);
});
test('loopback authorization rejects the wrong path and clears on cancellation', async () => {
  const controller = new AbortController(), callback = await traeCallback(controller.signal);
  try {
    const bad = new URL(callback.url); bad.pathname = '/authorize';
    assert.equal((await fetch(bad)).status, 404);
    const good = new URL(callback.url); good.searchParams.set('refreshToken', 'test-only');
    const response = await fetch(good); assert.equal(response.status, 200); assert.match(response.headers.get('cache-control') || '', /no-store/);
    assert.equal((await callback.result).get('refreshToken'), 'test-only');
    assert.equal((await fetch(good)).status, 404);
  } finally { callback.close(); }
  const second = await traeCallback(controller.signal); controller.abort(); await assert.rejects(second.result); second.close();
});
test('Qoder browser device flow uses PKCE and verifies the returned identity', async () => {
  let opened = '', calls = 0;
  const request: CheckinRequest = async (url, options) => {
    calls++;
    if (url.includes('/poll?')) {
      const query = new URL(url).searchParams;
      assert.ok(query.get('verifier')); assert.ok(opened.includes('challenge=')); assert.ok(!opened.includes(query.get('verifier')!));
      return { status: 200, body: { token: 'dt-test', refresh_token: 'drt-test', user_id: 'unverified' } };
    }
    assert.equal(options.headers?.Authorization, 'Bearer dt-test');
    return { status: 200, body: { id: 'verified-id', name: 'Real user' } };
  };
  const c = await authorizeCheckin('qoder', 'fixed-device', new CheckinProviders(request), new AbortController().signal, async url => { opened = url; }, () => {});
  assert.equal(c.userId, 'verified-id'); assert.equal(calls, 2); assert.equal(new URL(opened).hostname, 'qoder.com.cn');
});
test('platform adapters send TRAE status as POST and only the selected Qoder daily campaign can be claimed', async () => {
  const calls: { url: string; method?: string }[] = [];
  const p = new CheckinProviders(async (url, options) => { calls.push({ url, method: options.method }); return { status: 200, body: { code: 0, checked_in: false, enable: true, credits: 150 } }; });
  await p.status('trae', credential(), new AbortController().signal);
  assert.equal(calls[0].method, 'POST');
  await p.claim('qoder', credential(), { status: 'ready', message: '', reward: 100, campaignId: 'daily-123' }, new AbortController().signal);
  assert.ok(calls[1].url.endsWith('/campaigns/daily-123/claim'));
});
