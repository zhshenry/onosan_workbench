import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { DefaultResourceLoader, ModelRuntime } from '@earendil-works/pi-coding-agent';
import { runAgentLoop } from '../electron/ai-core';

for (const stage of ['loader', 'runtime', 'missing-model'] as const) {
  test(`AI ${stage} 初始化失败仍清除本次临时目录`, async t => {
    const directories: string[] = [];
    const original = fs.mkdtempSync;
    t.mock.method(fs, 'mkdtempSync', ((...args: Parameters<typeof fs.mkdtempSync>) => {
      const directory = original(...args);
      if (typeof directory === 'string') directories.push(directory);
      return directory;
    }) as typeof fs.mkdtempSync);
    syncBuiltinESMExports();
    t.mock.method(DefaultResourceLoader.prototype, 'reload', async () => {
      if (stage === 'loader') throw new Error('synthetic loader failure');
    });
    t.mock.method(ModelRuntime, 'create', async () => {
      if (stage === 'runtime') throw new Error('synthetic runtime failure');
      return {
        registerProvider() {}, async setRuntimeApiKey() {}, getModel() { return undefined; },
      } as unknown as Awaited<ReturnType<typeof ModelRuntime.create>>;
    });
    try {
      await assert.rejects(runAgentLoop(
        { endpoint: 'http://127.0.0.1/v1', model: 'synthetic', protocol: 'openai-chat', key: '' },
        '合成检查', [], new AbortController().signal,
        { systemPrompt: () => '', buildTools: () => [], toolNames: [], labels: {} },
      ));
      assert.equal(directories.length, 1);
      assert.equal(fs.existsSync(directories[0]), false);
    } finally {
      t.mock.restoreAll();
      syncBuiltinESMExports();
      for (const directory of directories) {
        assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep));
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });
}
