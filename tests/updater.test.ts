import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { AppUpdates, type UpdateDriver } from '../electron/updater';

class FakeDriver extends EventEmitter implements UpdateDriver {
  autoDownload = false;
  autoInstallOnAppQuit = false;
  checks = 0;
  installs = 0;
  checkAction: () => Promise<null> = async () => {
    this.emit('update-not-available', { version: '0.1.0' });
    return null;
  };
  checkForUpdates(): Promise<null> { this.checks++; return this.checkAction(); }
  quitAndInstall(): void { this.installs++; }
}

test('开发或便携模式不检查、不安装，保留明确的模式说明', async () => {
  const updates = new AppUpdates(null, '便携版请下载替换', () => assert.fail('disabled updater must not publish'));
  await updates.check();
  updates.install();
  assert.equal(updates.status().enabled, false);
  assert.equal(updates.status().message, '便携版请下载替换');
});

test('检查中不会重复请求，未下载完成不能安装', async () => {
  const driver = new FakeDriver();
  let finish!: () => void;
  driver.checkAction = () => new Promise(resolve => {
    finish = () => { driver.emit('update-not-available', { version: '0.1.0' }); resolve(null); };
  });
  const updates = new AppUpdates(driver, '', () => {});
  const first = updates.check();
  await updates.check();
  updates.install();
  assert.equal(driver.checks, 1);
  assert.equal(driver.installs, 0);
  assert.equal(updates.status().phase, 'checking');
  finish();
  await first;
  assert.equal(updates.status().phase, 'latest');
});

test('下载进度、完成和安装状态按更新事件衔接，下载中不重复检查', async () => {
  const driver = new FakeDriver();
  const updates = new AppUpdates(driver, '', () => {});
  assert.equal(driver.autoDownload, true);
  assert.equal(driver.autoInstallOnAppQuit, true);
  driver.emit('update-available', { version: '0.2.0' });
  driver.emit('download-progress', { percent: 47.9 });
  assert.equal(updates.status().progress, 47);
  assert.match(updates.status().message, /47%/);
  await updates.check();
  assert.equal(driver.checks, 0);
  updates.install();
  assert.equal(driver.installs, 0);
  driver.emit('update-downloaded', { version: '0.2.0' });
  assert.equal(updates.status().phase, 'ready');
  assert.equal(updates.status().progress, 100);
  updates.install();
  assert.equal(driver.installs, 1);
  await updates.check();
  assert.equal(driver.checks, 0);
});

test('网络和发布源失败可重试，界面显示中文恢复提示', async () => {
  const driver = new FakeDriver();
  const updates = new AppUpdates(driver, '', () => {});
  driver.checkAction = async () => { throw new Error('net::ERR_PROXY_CONNECTION_FAILED'); };
  await updates.check();
  assert.equal(updates.status().phase, 'error');
  assert.match(updates.status().message, /网络或代理/);
  driver.emit('error', new Error('404 Cannot find latest.yml'));
  assert.match(updates.status().message, /发布源/);
  driver.checkAction = async () => { driver.emit('update-not-available', { version: '0.1.0' }); return null; };
  await updates.check();
  assert.equal(updates.status().phase, 'latest');
  assert.equal(driver.checks, 2);
});

test('下载失败后恢复检查，读取快照不能篡改主进程状态', async () => {
  const driver = new FakeDriver();
  const updates = new AppUpdates(driver, '', () => {});
  driver.emit('update-available', { version: '0.2.0' });
  driver.emit('error', new Error('download failed'));
  const snapshot = updates.status();
  snapshot.phase = 'ready';
  updates.install();
  assert.equal(driver.installs, 0);
  await updates.check();
  assert.equal(updates.status().phase, 'latest');
});
