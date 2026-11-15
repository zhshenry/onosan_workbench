import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CheckinError, CheckinProviders, type CheckinCredential, type CheckinRequest } from '../electron/checkin-providers';
import { traeCheckinDeviceId } from '../electron/checkin-runtime';

test('TRAE check-in reads the current initialized device, never the machine ID or an older session', t => {
  const root = mkdtempSync(join(tmpdir(), 'trae-device-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const machineId = '33cc8c65-0000-4000-8000-000000000000', registeredId = '7500000000000000001';
  writeFileSync(join(root, 'machineid'), machineId);
  const old = join(root, 'logs', '20261114T120000'), current = join(root, 'logs', '20261115T120000');
  for (const directory of [old, current]) mkdirSync(directory, { recursive: true });
  writeFileSync(join(old, 'main.log'), '[ICDRS] (init) initialization done, did: 7500000000000000002, ldid: 0');
  writeFileSync(join(current, 'main.log'), `[info] unrelated secret\n[ICDRS] (init) initialization done, did: ${registeredId}, ldid: 0\n`);
  assert.equal(traeCheckinDeviceId(root), registeredId);
  for (const value of ['', '[ICDRS] (init) resolve rdid: 7500000000000000001', '[ICDRS] (init) initialization done, did: 0, ldid: 0', `[ICDRS] (init) initialization done, did: ${machineId}, ldid: 0`]) {
    writeFileSync(join(current, 'main.log'), value);
    assert.throws(() => traeCheckinDeviceId(root), error => error instanceof CheckinError && /打开官方应用/.test(error.message) && !/secret|7500000000|33cc8c65/.test(error.message));
  }
  assert.throws(() => traeCheckinDeviceId(join(root, 'missing')), /打开官方应用/);
});

test('TRAE check-in uses registered device headers while preserving the existing authorization binding', async () => {
  const c: CheckinCredential = { userId: 'test', name: 'Test', accessToken: 'test-token', refreshToken: 'test-refresh', expiresAt: 0, deviceId: 'bound-machine-id' };
  const calls: { url: string; options: Parameters<CheckinRequest>[1] }[] = [];
  let deviceReads = 0;
  const providers = new CheckinProviders(async (url, options) => {
    calls.push({ url, options });
    return { status: 200, body: { code: 0, enable: true, checked_in: false, credits: 100 } };
  }, () => { deviceReads++; return '7500000000000000001'; });
  const signal = new AbortController().signal;
  const before = await providers.status('trae', c, signal);
  await providers.claim('trae', c, before, signal);
  for (const call of calls) {
    assert.equal(call.options.headers?.['x-device-id'], '7500000000000000001');
    assert.equal(call.options.headers?.Authorization, 'Cloud-IDE-JWT test-token');
    assert.deepEqual(call.options.body, { req_source: 1 });
  }
  assert.equal(c.deviceId, 'bound-machine-id');
  await providers.claim('qoder', c, { status: 'ready', message: '', reward: 100, campaignId: 'daily' }, signal);
  await providers.claim('workbuddy', c, { status: 'ready', message: '', reward: 100 }, signal);
  assert.equal(deviceReads, 2);
  assert.equal(calls[2].options.headers?.Authorization, 'Bearer test-token');
  assert.equal(calls[3].options.headers?.Authorization, 'Bearer test-token');
});

test('missing native device metadata stops TRAE requests before any network access', async () => {
  let requests = 0;
  const providers = new CheckinProviders(async () => { requests++; return { status: 200, body: {} }; }, () => { throw new CheckinError('请先打开官方应用', 'blocked'); });
  const c: CheckinCredential = { userId: 'test', name: '', accessToken: 'test-token', refreshToken: '', expiresAt: 0, deviceId: 'machine-id' };
  await assert.rejects(providers.status('trae', c, new AbortController().signal), /打开官方应用/);
  await assert.rejects(providers.claim('trae', c, { status: 'ready', message: '', reward: 100 }, new AbortController().signal), /打开官方应用/);
  assert.equal(requests, 0);
});
