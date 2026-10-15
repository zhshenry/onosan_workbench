import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { AiStore } from '../electron/ai-store';
import { Store } from '../modules/todo/store';
import { CopyStore } from '../modules/copywriting/store';
import { BaziStore } from '../modules/bazi/store';
import { ReadingStore } from '../modules/reading/store';
import { newTask } from '../shared/todo-contracts';
import type { AiTurnContext } from '../shared/ai-reference';
import type { BrowserAutomation } from '../electron/browser/tasks';

// Only Electron's process transport is replaced. Handlers, stores, model loop,
// reference resolution, proposal collection and explicit apply all run for real.
test('真实 ai:ask 拒绝越界输入后不解密、不存消息；发送冻结并持久化内容，应用仍确认原目标', async () => {
  const symbol = `reference-ipc-${randomUUID()}`;
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const state = { handlers, decryptions: 0 };
  const globals = globalThis as unknown as Record<symbol, typeof state>;
  globals[Symbol.for(symbol)] = state;
  const source = `const state = globalThis[Symbol.for(${JSON.stringify(symbol)})];
    export const ipcMain = { handle: (name, fn) => state.handlers.set(name, fn), on: () => {} };
    export const safeStorage = { isEncryptionAvailable: () => true, encryptString: value => Buffer.from(value), decryptString: buffer => { state.decryptions++; return buffer.toString(); } };
    export const BrowserWindow = { getAllWindows: () => [] };
    export const shell = { openExternal: async () => {} };`;
  const mockUrl = `data:text/javascript,${encodeURIComponent(source)}`;
  const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
    return specifier === 'electron' ? { url: mockUrl, shortCircuit: true } : nextResolve(specifier, context);
  } });
  const { registerAiIpc } = await import('../electron/ai-ipc');
  hooks.deregister();
  const dir = mkdtempSync(join(tmpdir(), 'wb-reference-ipc-'));
  let ai = new AiStore(dir);
  const todo = new Store(join(dir, 'tasks.db'), 'shared-tasks');
  const copy = new CopyStore(dir);
  const bazi = new BaziStore(dir);
  const reading = new ReadingStore(dir);
  const requests: { messages: { role: string; content: string }[]; tools?: { function: { name: string } }[] }[] = [];
  let action: { name: string; arguments: Record<string, unknown> } | undefined;
  let firstRequest = true;
  let onFirstRequest: (() => void) | undefined;
  const server = createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    requests.push(JSON.parse(raw));
    const callTool = firstRequest && action;
    if (firstRequest) onFirstRequest?.();
    firstRequest = false;
    const delta = callTool ? { tool_calls: [{ index: 0, id: 'selected-tool', type: 'function', function: { name: callTool.name, arguments: JSON.stringify(callTool.arguments) } }] } : { content: '这是等待确认的回答。' };
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.write(`data: ${JSON.stringify({ id: 'fixture-response', object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`);
    response.write(`data: ${JSON.stringify({ id: 'fixture-response', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: callTool ? 'tool_calls' : 'stop' }] })}\n\n`);
    response.end('data: [DONE]\n\n');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const providerId = randomUUID();
    const modelId = randomUUID();
    const address = server.address() as { port: number };
    ai.writeConfig({ providers: [{ id: providerId, kind: 'custom', name: 'Local fixture', endpoint: `http://127.0.0.1:${address.port}/v1`, protocol: 'openai-chat', apiKey: Buffer.from('fixture-key').toString('base64') }], models: [{ id: modelId, providerId, name: 'fixture' }], activeModelId: modelId, rlcdProviders: [], rlcdModels: [], activeRlcdModelId: '', aiEnabled: true });
    let browserEnabled = false;
    const browserCalls: { workspace: string; chatId: string; tabId?: string }[] = [];
    const browserTask = { id: randomUUID(), workspace: 'xhs-creator', tabIds: ['creator-tab'], origins: ['https://creator.xiaohongshu.com'], goal: '填写当前博客', status: 'ready', steps: [], updatedAt: new Date().toISOString() };
    registerAiIpc(todo, ai, copy, bazi, reading, {
      forChat: (_owner: unknown, workspace: string, _goal: string, chatId: string, _previous?: string, tabId?: string) => {
        if (!browserEnabled) return undefined;
        browserCalls.push({ workspace, chatId, tabId }); return browserTask;
      },
      bind: () => {}, finish: () => {}, signal: () => new AbortController().signal,
      observe: () => ({ id: 'observation', tab: { id: 'creator-tab' }, text: '合成发布表单', elements: [], frames: [], truncated: false }),
    } as unknown as BrowserAutomation);
    const browser = ai.newChat({ module: 'workbench', viewId: 'browser' });
    browser.browserTaskId = randomUUID(); ai.saveChat(browser);
    const mainFrame = {};
    await assert.rejects(() => handlers.get('ai:ask')!({ sender: { mainFrame }, senderFrame: {} }, browser.id, '继续浏览器任务', { scope: { module: 'workbench', viewId: 'browser' }, pageScope: { module: 'workbench', viewId: 'browser' } }), /主窗口文档/);
    assert.equal(ai.chat(browser.id).entries.length, 0);
    assert.equal(state.decryptions, 0);
    const ask = async (id: string, context: AiTurnContext | Record<string, unknown>) => {
      firstRequest = true;
      const mainFrame = {};
      await handlers.get('ai:ask')!({ sender: { mainFrame }, senderFrame: mainFrame }, id, '请按明确选中的资料回答', context);
    };
    const life = ai.newChat({ module: 'workbench', viewId: 'workspace:life' });
    const invalid = [
      { pageScope: { module: 'workbench', viewId: 'reading' }, references: [{ module: 'bazi', profileId: 'same-life-wrong-module' }] },
      { pageScope: { module: 'workbench', viewId: 'bazi' }, references: [{ module: 'reading', profileId: 'same-life-wrong-module' }] },
      { pageScope: { module: 'workbench', viewId: 'reading' }, references: [{ module: 'reading', profileId: 'not-a-book' }] },
      { pageScope: { module: 'workbench', viewId: 'reading' }, references: [{ module: 'reading', profileId: 'book', content: 'forged content' }] },
      { pageScope: { module: 'workbench', viewId: 'reading' }, referenceSnapshots: [{ content: 'forged snapshot' }] },
    ];
    const before = JSON.stringify(ai.chat(life.id));
    for (const context of invalid) await assert.rejects(() => ask(life.id, context));
    assert.equal(state.decryptions, 0);
    assert.equal(requests.length, 0);
    assert.equal(JSON.stringify(ai.chat(life.id)), before);

    const selectedBook = reading.save({ title: '仅书目字段', author: '已记录作者', status: 'reading', comment: '已记录短评', tags: ['参考'], link: { vault: 'FORBIDDEN_VAULT', folder: 'FORBIDDEN_FOLDER' } }).books[0];
    reading.setVaultPath(join(dir, 'FORBIDDEN_VAULT_PATH'));
    action = { name: 'read_reference', arguments: { id: `reading:${selectedBook.id}` } };
    await ask(life.id, { scope: { module: 'workbench', viewId: 'workspace:life' }, pageScope: { module: 'workbench', viewId: 'reading' }, references: [{ module: 'reading', profileId: selectedBook.id }] });
    const bookEntry = ai.chat(life.id).entries[0];
    assert.match(bookEntry.referenceSnapshots![0].content, /已记录作者/);
    assert.ok(!JSON.stringify(requests).includes('FORBIDDEN_'));
    assert.deepEqual(requests[0].tools?.map(tool => tool.function.name), ['read_reference']);
    assert.equal(requests[1].messages.find(message => message.role === 'tool')?.content, bookEntry.referenceSnapshots![0].content);

    const selectedCopy = copy.save({ title: '参考博客', body: '发送时原始资料' }).drafts[0];
    const generic = ai.newChat({ module: 'workbench', viewId: 'workspace:media' });
    requests.length = 0;
    action = { name: 'read_reference', arguments: { id: selectedCopy.id } };
    onFirstRequest = () => { copy.save({ id: selectedCopy.id, body: '发送后变更资料' }); };
    await ask(generic.id, { scope: { module: 'workbench', viewId: 'workspace:media' }, pageScope: { module: 'workbench', viewId: 'media-browser' }, references: [{ module: 'copy', draftId: selectedCopy.id }] });
    const saved = ai.chat(generic.id);
    assert.deepEqual(requests[0].tools?.map(tool => tool.function.name), ['read_reference']);
    assert.match(saved.entries[0].referenceSnapshots![0].content, /发送时原始资料/);
    assert.equal(requests[1].messages.find(message => message.role === 'tool')?.content, saved.entries[0].referenceSnapshots![0].content);
    assert.ok(!JSON.stringify(requests).includes('发送后变更资料'));
    assert.deepEqual(saved.entries[0].referenceSnapshots, saved.entries[1].referenceSnapshots);
    assert.equal(saved.module, 'workbench');
    assert.equal(saved.viewId, 'workspace:media');
    assert.equal(saved.entries[1].copyProposal, undefined);

    onFirstRequest = undefined;
    const primaryCopy = copy.save({ title: '原主博客', body: '主博客原文' }).drafts[0];
    const copyChat = ai.newChat({ module: 'copy', draftId: primaryCopy.id });
    action = { name: 'propose_edit', arguments: { text: '等待用户确认的新主正文' } };
    await ask(copyChat.id, { scope: { module: 'copy', draftId: primaryCopy.id }, pageScope: { module: 'workbench', viewId: 'copy-publish' }, references: [{ module: 'copy', draftId: selectedCopy.id }] });
    const copyProposal = ai.chat(copyChat.id).entries[1].copyProposal!;
    assert.ok(copyProposal);
    assert.equal(copy.get(primaryCopy.id)!.body, '主博客原文');
    assert.equal(copy.get(selectedCopy.id)!.body, '发送后变更资料');

    browserEnabled = true;
    requests.length = 0;
    action = { name: 'browser_observe', arguments: { tabId: 'creator-tab' } };
    await ask(copyChat.id, { scope: { module: 'copy', draftId: primaryCopy.id }, pageScope: { module: 'workbench', viewId: 'media-browser' }, browserTabId: 'creator-tab' });
    assert.deepEqual(browserCalls.at(-1), { workspace: 'xhs-creator', chatId: copyChat.id, tabId: 'creator-tab' });
    const tools = requests[0].tools!.map(tool => tool.function.name);
    assert.ok(tools.includes('propose_edit') && tools.includes('browser_act') && tools.includes('browser_check'));
    assert.match(JSON.stringify(requests[0].messages), /主博客原文/);
    assert.match(JSON.stringify(requests[1].messages), /合成发布表单/);
    assert.equal(copy.get(primaryCopy.id)!.body, '主博客原文');
    assert.deepEqual(ai.chat(copyChat.id).contextScope, { module: 'copy', draftId: primaryCopy.id });
    assert.deepEqual(ai.chat(copyChat.id).pageScope, { module: 'workbench', viewId: 'media-browser' });
    browserEnabled = false;

    action = { name: 'propose_edit', arguments: { text: '等待用户确认的新主正文' } };
    await ask(copyChat.id, { scope: { module: 'copy', draftId: primaryCopy.id }, pageScope: { module: 'workbench', viewId: 'copy-publish' } });
    const latestProposal = ai.chat(copyChat.id).entries.at(-1)!.copyProposal!;
    await handlers.get('ai:apply')!(undefined, latestProposal.token, [0]);
    assert.equal(copy.get(primaryCopy.id)!.body, '等待用户确认的新主正文');
    assert.equal(copy.get(selectedCopy.id)!.body, '发送后变更资料');

    const tasks = Array.from({ length: 122 }, (_, i) => todo.put({ ...newTask(`事项 ${i}`), id: randomUUID(), createdAt: '2026-10-12T12:00:00.000Z', updatedAt: new Date(Date.parse('2026-10-12T12:00:00Z') - i * 1000).toISOString(), completedAt: null, notifiedFor: null, deletedAt: null }));
    const older = tasks[121];
    const todoChat = ai.newChat({ module: 'todo' });
    requests.length = 0;
    action = { name: 'propose_update', arguments: { id: older.id, status: 'done' } };
    await ask(todoChat.id, { scope: { module: 'todo' }, pageScope: { module: 'todo' }, references: [{ module: 'todo', taskId: older.id }] });
    const proposal = ai.chat(todoChat.id).entries[1].proposal!;
    assert.deepEqual(proposal.actions, [{ type: 'update', id: older.id, patch: { status: 'done' } }]);
    assert.equal(todo.get(older.id).status, 'todo');
    await handlers.get('ai:apply')!(undefined, proposal.token, [0]);
    assert.equal(todo.get(older.id).status, 'done');
    assert.equal(todo.get(tasks[0].id).status, 'todo');

    ai.close();
    ai = new AiStore(dir);
    assert.deepEqual(ai.chat(generic.id).entries.map(entry => entry.referenceSnapshots), saved.entries.map(entry => entry.referenceSnapshots));
    assert.deepEqual(ai.chat(generic.id).pageScope, saved.pageScope);
    assert.deepEqual(ai.chat(generic.id).contextScope, saved.contextScope);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    ai.close(); todo.close(); copy.close(); bazi.close(); reading.close();
    delete globals[Symbol.for(symbol)];
    rmSync(dir, { recursive: true, force: true });
  }
});
