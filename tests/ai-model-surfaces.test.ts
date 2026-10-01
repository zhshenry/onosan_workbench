import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AiStore } from '../electron/ai-store';

test('空配置每次读取都生成独立的模型列表', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wb-ai-surfaces-'));
  const store = new AiStore(dir);
  try {
    const first = store.readConfig();
    first.rlcdProviders.push({ id: 'draft', kind: 'typesafe', name: 'TypeSafe', endpoint: 'https://api.typesafe.ai/v1', protocol: 'openai-chat', apiKey: '' });
    assert.deepEqual(store.readConfig().rlcdProviders, []);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('旧 AI 配置可读取，RLCD 与对话模型独立保存并在重启后恢复', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wb-ai-surfaces-'));
  const path = join(dir, 'ai-config.json');
  const legacy = {
    providers: [{ id: 'llm-provider', kind: 'deepseek', name: 'DeepSeek', endpoint: 'https://api.deepseek.com/v1', protocol: 'openai-chat', apiKey: 'encrypted-llm-key' }],
    models: [{ id: 'llm-model', providerId: 'llm-provider', name: 'deepseek-v4-flash' }],
    activeModelId: 'llm-model', aiEnabled: true,
  };
  writeFileSync(path, JSON.stringify(legacy));
  let store = new AiStore(dir);
  try {
    const original = store.readConfig();
    assert.deepEqual(original.rlcdProviders, []);
    assert.deepEqual(original.rlcdModels, []);
    assert.equal(original.activeRlcdModelId, '');
    store.writeConfig({ ...original,
      rlcdProviders: [{ id: 'rlcd-provider', kind: 'typesafe', name: 'TypeSafe', endpoint: 'https://api.typesafe.ai/v1', protocol: 'openai-chat', apiKey: 'encrypted-rlcd-key' }],
      rlcdModels: [{ id: 'rlcd-model', providerId: 'rlcd-provider', name: 'decision-v1' }],
      activeRlcdModelId: 'rlcd-model',
    });
    store.close();
    store = new AiStore(dir);
    const restored = store.readConfig();
    assert.deepEqual(restored.providers, legacy.providers);
    assert.deepEqual(restored.models, legacy.models);
    assert.equal(restored.activeModelId, legacy.activeModelId);
    assert.equal(restored.aiEnabled, true);
    assert.equal(restored.rlcdProviders[0].apiKey, 'encrypted-rlcd-key');
    assert.deepEqual(restored.rlcdModels, [{ id: 'rlcd-model', providerId: 'rlcd-provider', name: 'decision-v1' }]);
    assert.equal(restored.activeRlcdModelId, 'rlcd-model');
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).rlcdProviders.length, 1);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
