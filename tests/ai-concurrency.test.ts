import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { randomUUID } from 'node:crypto';
import { createServer, type ServerResponse } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AiStore } from '../electron/ai-store';
import { Store } from '../modules/todo/store';
import { CopyStore } from '../modules/copywriting/store';
import { BaziStore } from '../modules/bazi/store';
import { ReadingStore } from '../modules/reading/store';

test('real IPC and model loops isolate concurrent streams, questions, cancellation and duplicate requests', { timeout: 30000 }, async () => {
  const symbol = `concurrency-${randomUUID()}`;
  const handlers = new Map<string, (...args: any[]) => any>(), listeners = new Map<string, (...args: any[]) => void>();
  const questions: { id: string; sessionId: string }[] = [];
  const state = { handlers, listeners, send: (name: string, value: any) => { if (name === 'ai:ask') questions.push(value); } };
  (globalThis as any)[Symbol.for(symbol)] = state;
  const source = `const s=globalThis[Symbol.for(${JSON.stringify(symbol)})];
    export const ipcMain={handle:(name,fn)=>s.handlers.set(name,fn),on:(name,fn)=>s.listeners.set(name,fn)};
    export const safeStorage={isEncryptionAvailable:()=>true,encryptString:v=>Buffer.from(v),decryptString:v=>v.toString()};
    export const BrowserWindow={getAllWindows:()=>[{isDestroyed:()=>false,isVisible:()=>true,webContents:{isDestroyed:()=>false,send:s.send}}]};
    export const shell={openExternal:async()=>{}};`;
  const hook = registerHooks({ resolve(specifier, context, next) { return specifier === 'electron' ? { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true } : next(specifier, context); } });
  const { registerAiIpc } = await import('../electron/ai-ipc'); hook.deregister();
  const directory = mkdtempSync(join(tmpdir(), 'ono-ai-concurrency-'));
  const ai = new AiStore(directory), todo = new Store(join(directory, 'tasks.db'), 'shared-tasks'), copy = new CopyStore(directory), bazi = new BaziStore(directory), reading = new ReadingStore(directory);
  const held = new Map<string, ServerResponse>();
  const reply = (response: ServerResponse, delta: object, finish = 'stop') => {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    for (const [value, reason] of [[delta, null], [{}, finish]]) response.write(`data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', choices: [{ index: 0, delta: value, finish_reason: reason }] })}\n\n`);
    response.end('data: [DONE]\n\n');
  };
  const server = createServer(async (request, response) => {
    let raw = ''; for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw), content = [...body.messages].reverse().find((message: any) => message.role === 'user')?.content;
    const user = /hold-[ab]|clarify-[cd]/.exec(JSON.stringify(content))?.[0] ?? 'unknown';
    if (String(user).startsWith('hold-')) { held.set(user, response); return; }
    if (!body.messages.some((message: any) => message.role === 'tool')) reply(response, { tool_calls: [{ index: 0, id: `question-${user}`, type: 'function', function: { name: 'ask_user', arguments: JSON.stringify({ question: `请选择 ${user}`, options: [{ label: '甲' }, { label: '乙' }] }) } }] }, 'tool_calls');
    else reply(response, { content: `已完成 ${user}` });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const wait = async (condition: () => boolean) => { const end = Date.now() + 10000; while (!condition()) { if (Date.now() > end) throw new Error('合成模型等待超时'); await new Promise(resolve => setTimeout(resolve, 10)); } };
  try {
    const providerId = randomUUID(), modelId = randomUUID();
    ai.writeConfig({ aiEnabled: true, providers: [{ id: providerId, kind: 'custom', name: 'fixture', endpoint: `http://127.0.0.1:${(server.address() as any).port}/v1`, protocol: 'openai-chat', apiKey: Buffer.from('synthetic').toString('base64') }], models: [{ id: modelId, providerId, name: 'fixture' }], activeModelId: modelId, rlcdProviders: [], rlcdModels: [], activeRlcdModelId: '' });
    registerAiIpc(todo, ai, copy, bazi, reading);
    const frame = {}, event = { sender: { mainFrame: frame }, senderFrame: frame };
    const ask = (id: string, text: string) => handlers.get('ai:ask')!(event, id, text, {});
    const a = ai.newChat(), b = ai.newChat();
    const first = ask(a.id, 'hold-a').then(() => null, (error: Error) => error);
    await wait(() => held.has('hold-a'));
    const second = ask(b.id, 'hold-b');
    await wait(() => held.has('hold-b'));
    await assert.rejects(ask(a.id, 'duplicate'), /这条对话正在生成/);
    listeners.get('ai:cancel')!(event, a.id);
    assert.match(String(await first), /取消|停止/);
    assert.equal(ai.chat(b.id).entries.at(-1)?.streaming, true);
    reply(held.get('hold-b')!, { content: '第二条独立完成' }); await second;
    assert.equal(ai.chat(b.id).entries.at(-1)?.content, '第二条独立完成');
    assert.equal(ai.chat(a.id).entries.at(-1)?.streaming, false);
    const c = ai.newChat(), d = ai.newChat();
    const third = ask(c.id, 'clarify-c').then(() => null, (error: Error) => error), fourth = ask(d.id, 'clarify-d');
    await wait(() => questions.length === 2);
    const qc = questions.find(question => question.sessionId === c.id)!, qd = questions.find(question => question.sessionId === d.id)!;
    listeners.get('ai:answer')!(event, { id: qc.id, sessionId: d.id, kind: 'option', value: '错误路由' });
    assert.equal(ai.chat(d.id).entries.at(-1)?.streaming, true);
    listeners.get('ai:cancel')!(event, c.id); await third;
    listeners.get('ai:answer')!(event, { id: qd.id, sessionId: d.id, kind: 'option', value: '乙' });
    await fourth;
    assert.equal(ai.chat(d.id).entries.at(-1)?.content, '已完成 clarify-d');
    assert.equal(ai.chat(c.id).entries.at(-1)?.streaming, false);
  } finally {
    for (const chat of ai.chats()) listeners.get('ai:cancel')?.({}, chat.id);
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    ai.close(); todo.close(); copy.close(); bazi.close(); reading.close();
    delete (globalThis as any)[Symbol.for(symbol)]; rmSync(directory, { recursive: true, force: true });
  }
});
