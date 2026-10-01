import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppSettingsStore } from '../electron/app-settings';
import { DEFAULT_APP_SETTINGS } from '../shared/contracts';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'workbench-settings-'));
}

test('设置:缺省文件返回默认值', () => {
  const dir = tempDir();
  try {
    const store = new AppSettingsStore(dir);
    assert.deepEqual(store.read(), DEFAULT_APP_SETTINGS);
    assert.equal(store.read().launchAtLogin, false);
    assert.equal(store.read().closeAction, 'minimize');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('设置:patch 合并并落盘,未知键被忽略', () => {
  const dir = tempDir();
  try {
    const store = new AppSettingsStore(dir);
    const next = store.patch({ launchAtLogin: true, evilKey: 'x' } as Record<string, unknown>);
    assert.equal(next.launchAtLogin, true);
    assert.equal(next.closeAction, 'minimize');
    // 新实例读到同一份落盘数据
    const reloaded = new AppSettingsStore(dir).read();
    assert.equal(reloaded.launchAtLogin, true);
    const onDisk = JSON.parse(readFileSync(join(dir, 'app-settings.json'), 'utf8')) as Record<string, unknown>;
    assert.equal('evilKey' in onDisk, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('设置:损坏文件整体回落默认值', () => {
  const dir = tempDir();
  try {
    writeFileSync(join(dir, 'app-settings.json'), '{ not json', 'utf8');
    const store = new AppSettingsStore(dir);
    assert.deepEqual(store.read(), DEFAULT_APP_SETTINGS);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('设置:非法字段值丢弃,合法字段照常生效', () => {
  const dir = tempDir();
  try {
    writeFileSync(
      join(dir, 'app-settings.json'),
      JSON.stringify({ launchAtLogin: 'yes', closeAction: 'explode', language: 'fr', snavDefaultCollapsed: true, uiTheme: 'rainbow' }),
      'utf8',
    );
    const store = new AppSettingsStore(dir);
    const s = store.read();
    assert.equal(s.launchAtLogin, false);
    assert.equal(s.closeAction, 'minimize');
    assert.equal(s.language, 'zh-CN');
    // snavDefaultCollapsed 已被产品移除:遗留文件中的旧键按未知键丢弃
    assert.equal('snavDefaultCollapsed' in s, false);
    assert.equal(s.uiTheme, 'mist');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('设置:patch 非法值不生效且不写坏文件', () => {
  const dir = tempDir();
  try {
    const store = new AppSettingsStore(dir);
    store.patch({ launchAtLogin: true });
    const next = store.patch({ closeAction: 'boom' } as Record<string, unknown>);
    assert.equal(next.closeAction, 'minimize');
    assert.equal(next.launchAtLogin, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('设置:旧文件缺新字段自动落默认(remindersEnabled 缺省开启)', () => {
  const dir = tempDir();
  try {
    writeFileSync(
      join(dir, 'app-settings.json'),
      JSON.stringify({ launchAtLogin: true, closeAction: 'exit', language: 'zh-CN', snavDefaultCollapsed: false }),
      'utf8',
    );
    const store = new AppSettingsStore(dir);
    const s = store.read();
    assert.equal(s.remindersEnabled, true);
    assert.equal(s.launchAtLogin, true);
    assert.equal(s.closeAction, 'exit');
    // 显式关闭被保留
    const patched = store.patch({ remindersEnabled: false });
    assert.equal(patched.remindersEnabled, false);
    assert.equal(new AppSettingsStore(dir).read().remindersEnabled, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('设置:uiTheme 默认轻雾,三款可切换并落盘,旧晴蓝映射冷灰', () => {
  const dir = tempDir();
  try {
    const store = new AppSettingsStore(dir);
    // 旧版设置文件(无 uiTheme 字段)自动落默认
    writeFileSync(join(dir, 'app-settings.json'), JSON.stringify({ launchAtLogin: true }), 'utf8');
    assert.equal(store.read().uiTheme, 'mist');
    // 合法切换持久化,新实例可读回
    store.patch({ uiTheme: 'cool' });
    assert.equal(new AppSettingsStore(dir).read().uiTheme, 'cool');
    store.patch({ uiTheme: 'warm' });
    assert.equal(new AppSettingsStore(dir).read().uiTheme, 'warm');
    // 非法值被丢弃
    const next = store.patch({ uiTheme: 'dark' } as Record<string, unknown>);
    assert.equal(next.uiTheme, 'warm');
    writeFileSync(join(dir, 'app-settings.json'), JSON.stringify({ uiTheme: 'sunny' }), 'utf8');
    assert.equal(new AppSettingsStore(dir).read().uiTheme, 'cool');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('设置:profile 旧文件缺省落 Ono,非法昵称整字段回落', () => {
  const dir = tempDir();
  try {
    // 个人资料上线前的旧文件没有 profile 字段 → 默认 Ono
    writeFileSync(join(dir, 'app-settings.json'), JSON.stringify({ launchAtLogin: true }), 'utf8');
    const store = new AppSettingsStore(dir);
    assert.equal(store.read().profile.name, 'Ono');
    // 合法昵称可保存并持久化
    const next = store.patch({ profile: { name: '小野' } });
    assert.equal(next.profile.name, '小野');
    assert.equal(new AppSettingsStore(dir).read().profile.name, '小野');
    // 非法(空)昵称:patch 丢弃,旧值保留;文件里坏了则整字段回落默认
    const kept = store.patch({ profile: { name: '' } });
    assert.equal(kept.profile.name, '小野');
    writeFileSync(join(dir, 'app-settings.json'), JSON.stringify({ profile: { name: 'x'.repeat(30) } }), 'utf8');
    assert.equal(new AppSettingsStore(dir).read().profile.name, 'Ono');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
