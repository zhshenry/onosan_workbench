import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv, createHash, generateKeyPairSync, randomBytes, randomUUID, verify } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { authorizeCheckin, traeCallback } from '../electron/checkin-auth';
import { CheckinService, type CheckinOptions } from '../electron/checkin';
import { CheckinCredentialSchema, CheckinError, CheckinProviders, type CheckinRequest } from '../electron/checkin-providers';
import { CHECKIN_PROVIDERS, DEFAULT_CHECKIN_SETTINGS, emptyCheckinRow } from '../shared/checkin-contracts';

test('TRAE CN authorization uses the IDE client, PKCE and the current authorization-code exchange', async () => {
  let challenge = '', exchanges = 0, userReads = 0;
  const request: CheckinRequest = async (url, options) => {
    const body = options.body as Record<string, unknown>;
    if (url.endsWith('/trae/api/v3/oauth/ExchangeToken')) {
      exchanges++;
      assert.equal(url, 'https://api.trae.cn/trae/api/v3/oauth/ExchangeToken');
      assert.equal(body.ClientID, 'ono9krqynydwx5');
      assert.equal(body.AuthCode, 'test-authorization-code');
      assert.equal(createHash('sha256').update(body.CodeVerifier as string).digest('base64url'), challenge);
      const device = body.DeviceInfo as Record<string, string>;
      assert.equal(device.DeviceID, 'test-fixed-device');
      assert.equal(device.MachineID, 'test-fixed-device');
      assert.equal(device.PlatformCode, 'IDE_PC');
      assert.match(device.DevicePublicKey, /BEGIN PUBLIC KEY/);
      assert.ok(!JSON.stringify(body).includes('PRIVATE KEY'));
      return { status: 200, body: { Result: { Token: 'verified-token', RefreshToken: 'verified-refresh', TokenExpireAt: Date.now() + 3600000 } } };
    }
    assert.equal(url, 'https://api.trae.cn/cloudide/api/v3/trae/GetUserInfo');
    assert.equal(options.headers?.['x-cloudide-token'], 'verified-token');
    userReads++;
    return { status: 200, body: { Result: { UserID: 'verified-user', ScreenName: 'TRAE test' } } };
  };
  const controller = new AbortController();
  try {
    const credential = await authorizeCheckin('trae', 'test-fixed-device', new CheckinProviders(request), controller.signal, async url => {
      const login = new URL(url), query = login.searchParams;
      assert.equal(login.origin, 'https://www.trae.cn');
      assert.equal(query.get('auth_from'), 'trae');
      assert.equal(query.get('client_id'), 'ono9krqynydwx5');
      assert.equal(query.get('code_challenge_method'), 'S256');
      challenge = query.get('code_challenge') || '';
      assert.match(challenge, /^[\w-]{43}$/);
      assert.ok(!query.has('code_verifier'));
      const callback = new URL(query.get('auth_callback_url')!);
      assert.match(callback.href, /^http:\/\/127\.0\.0\.1:\d+\/authorize$/);
      callback.searchParams.set('loginTraceID', query.get('login_trace_id')!);
      callback.searchParams.set('authCodeInfo', JSON.stringify({ AuthCode: 'test-authorization-code' }));
      callback.searchParams.set('userInfo', JSON.stringify({ UserID: 'untrusted-browser-user' }));
      assert.equal((await fetch(callback)).status, 200);
    }, () => {});
    assert.equal(exchanges, 1);
    assert.equal(userReads, 1);
    assert.equal(credential.userId, 'verified-user');
    assert.equal(credential.accessToken, 'verified-token');
    assert.match(credential.trae!.privateKey, /BEGIN PRIVATE KEY/);
    assert.deepEqual(CheckinCredentialSchema.parse(JSON.parse(JSON.stringify(credential))), credential);

    const saved = CheckinCredentialSchema.parse(JSON.parse(JSON.stringify(credential)));
    const seenNonces = new Set<string>();
    const refresh = new CheckinProviders(async (url, options) => {
      assert.equal(url, 'https://api.trae.cn/trae/api/v3/oauth/ExchangeToken');
      const body = options.body as Record<string, unknown>, proof = body.DeviceProof as { Signature: string; Timestamp: number; Nonce: string };
      assert.equal(body.ClientID, 'ono9krqynydwx5');
      assert.equal(body.RefreshToken, 'verified-refresh');
      assert.equal(body.ClientSecret, '');
      assert.ok(Math.abs(proof.Timestamp * 1000 - Date.now()) < 5000);
      assert.ok(!seenNonces.has(proof.Nonce)); seenNonces.add(proof.Nonce);
      const signed = ['POST', '/trae/api/v3/oauth/ExchangeToken', body.ClientID, body.RefreshToken, String(proof.Timestamp), proof.Nonce].join('\n');
      assert.equal(verify('sha256', Buffer.from(signed), saved.trae!.publicKey, Buffer.from(proof.Signature, 'base64')), true);
      assert.equal((body.DeviceInfo as Record<string, string>).DevicePublicKey, saved.trae!.publicKey);
      assert.ok(!JSON.stringify(body).includes('PRIVATE KEY'));
      return { status: 200, body: { Result: { Token: 'rotated-token', RefreshToken: 'rotated-refresh' } } };
    });
    const rotated = await refresh.refresh('trae', saved, controller.signal);
    await refresh.refresh('trae', saved, controller.signal);
    assert.equal(rotated.accessToken, 'rotated-token');
    assert.equal(rotated.refreshToken, 'rotated-refresh');
    assert.deepEqual(rotated.trae, saved.trae);
  } finally { controller.abort(); }
});

test('TRAE callback allows only the official browser origin, accepts code callbacks once and closes on cancellation', async () => {
  const controller = new AbortController(), callback = await traeCallback(controller.signal);
  try {
    const url = new URL(callback.url);
    const preflight = await fetch(url, { method: 'OPTIONS', headers: { Origin: 'https://www.trae.cn', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'x-jwt-token', 'Access-Control-Request-Private-Network': 'true' } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://www.trae.cn');
    assert.equal(preflight.headers.get('access-control-allow-private-network'), 'true');
    assert.equal((await fetch(url, { headers: { Origin: 'https://unrelated.example' } })).status, 403);
    url.searchParams.set('authCodeInfo', JSON.stringify({ AuthCode: '' }));
    url.searchParams.set('loginTraceID', callback.loginTraceId);
    assert.equal((await fetch(url)).status, 400);
    url.searchParams.set('authCodeInfo', JSON.stringify({ AuthCode: 'valid-test-code' }));
    url.searchParams.delete('loginTraceID');
    assert.equal((await fetch(url)).status, 400);
    url.searchParams.set('loginTraceID', 'different-attempt');
    assert.equal((await fetch(url)).status, 400);
    url.searchParams.set('loginTraceID', callback.loginTraceId);
    const response = await fetch(url, { headers: { Origin: 'https://www.trae.cn' } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://www.trae.cn');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(JSON.parse((await callback.result).get('authCodeInfo')!).AuthCode, 'valid-test-code');
    assert.equal((await fetch(url)).status, 404);
  } finally { callback.close(); }
  const cancelled = await traeCallback(controller.signal);
  controller.abort(); await assert.rejects(cancelled.result); cancelled.close();
});

test('TRAE legacy connections require reauthorization before refreshing without the bound device key', async () => {
  let requests = 0;
  const providers = new CheckinProviders(async () => { requests++; return { status: 200, body: {} }; });
  await assert.rejects(providers.refresh('trae', { userId: 'legacy', name: '', accessToken: 'old', refreshToken: 'old-refresh', expiresAt: 0, deviceId: 'fixed-device' }, new AbortController().signal), /重新连接/);
  assert.equal(requests, 0);
});

test('TRAE device signing keys stay protected and survive token rotation and restart', async t => {
  const prefix = join(tmpdir(), 'wb-trae-auth-'), directory = mkdtempSync(prefix), file = join(directory, 'checkin.json');
  t.after(() => { assert.ok(directory.startsWith(prefix)); rmSync(directory, { recursive: true, force: true }); });
  const key = randomBytes(32), keys = generateKeyPairSync('ec', { namedCurve: 'P-256', privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const protect = (value: string): string => { const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv), bytes = Buffer.concat([cipher.update(value), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString('base64'); };
  const unprotect = (value: string): string => { const bytes = Buffer.from(value, 'base64'), cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12)); cipher.setAuthTag(bytes.subarray(12, 28)); return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString(); };
  writeFileSync(file, JSON.stringify({ version: 1, deviceId: randomUUID(), settings: DEFAULT_CHECKIN_SETTINGS, credentials: protect(JSON.stringify({ trae: { userId: 'persisted-user', name: 'TRAE test', accessToken: 'token-0', refreshToken: 'refresh-0', expiresAt: 0, deviceId: 'fixed-device', trae: keys } })), rows: CHECKIN_PROVIDERS.map(p => ({ ...emptyCheckinRow(p), ...(p === 'trae' ? { connected: true, status: 'ready' } : {}) })), records: [], attempts: {}, autoRuns: {} }));
  let refreshes = 0, needsRefresh = true;
  const providers = new CheckinProviders(async (url, options) => {
    if (url.endsWith('/ExchangeToken')) {
      const body = options.body as Record<string, unknown>;
      assert.equal(body.RefreshToken, `refresh-${refreshes}`);
      const proof = body.DeviceProof as { Timestamp: number; Nonce: string; Signature: string };
      const signed = ['POST', '/trae/api/v3/oauth/ExchangeToken', body.ClientID, body.RefreshToken, String(proof.Timestamp), proof.Nonce].join('\n');
      assert.equal(verify('sha256', Buffer.from(signed), keys.publicKey, Buffer.from(proof.Signature, 'base64')), true);
      refreshes++;
      return { status: 200, body: { Result: { Token: `token-${refreshes}`, RefreshToken: `refresh-${refreshes}` } } };
    }
    assert.ok(url.endsWith('/checkin_credits/status'));
    if (needsRefresh) { needsRefresh = false; throw new CheckinError('登录已过期', 'auth'); }
    return { status: 200, body: { checked_in: false, enable: true } };
  });
  const options: CheckinOptions = { directory, providers, protect, unprotect, changed() {}, open: async () => {}, notify() {} };
  for (let round = 1; round <= 2; round++) {
    const service = new CheckinService(options);
    try {
      needsRefresh = true; await service.refresh('trae');
      assert.equal(service.state().rows.find(r => r.provider === 'trae')!.status, 'ready');
      const disk = readFileSync(file, 'utf8'), state = JSON.stringify(service.state());
      assert.ok(!disk.includes('PRIVATE KEY') && !disk.includes(`refresh-${round}`));
      assert.ok(!state.includes('PRIVATE KEY') && !state.includes(`token-${round}`));
      const stored = JSON.parse(unprotect(JSON.parse(disk).credentials)).trae;
      assert.deepEqual(stored.trae, keys);
      assert.equal(stored.refreshToken, `refresh-${round}`);
    } finally { service.dispose(); }
  }
  assert.equal(refreshes, 2);
});
