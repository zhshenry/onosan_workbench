import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { connectHost, type BotPeer } from '../electron/bot-transport';
import type { BotCard, BotSubmitReceipt, BotTask, DraftSnapshot } from '../shared/bot-contracts';

const require = createRequire(import.meta.url), electron = require('electron') as string;
const root = mkdtempSync(join(tmpdir(), 'ono-bot-pilot-')), directory = join(root, 'OnoWorkbench');
let peer: BotPeer | undefined;
const processes: ReturnType<typeof spawn>[] = [];
const requests: any[] = [];
const server = createServer(async (req, res) => {
  let raw = ''; for await (const chunk of req) raw += chunk;
  const input = JSON.parse(raw); requests.push(input);
  const messages = input.messages ?? [], hadProposal = messages.some((m: any) => m.role === 'tool' && JSON.stringify(m).includes('已记录新建建议'));
  const delta = hadProposal ? { content: '建议已准备，请确认后写入。' } : { tool_calls: [{ index: 0, id: 'fixture-create-1', type: 'function', function: { name: 'propose_create', arguments: JSON.stringify({ title: '隔离测试 · 周五发布', categoryId: null, note: 'Bot Host 实际业务写入测试' }) } }] };
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  res.write(`data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`);
  res.write(`data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: hadProposal ? 'stop' : 'tool_calls' }] })}\n\n`);
  res.end('data: [DONE]\n\n');
});
await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
async function start() {
  const child = spawn(electron, ['.', '--bot-host', '--bot-data-dir', directory, '--bot-todo-db', join(root, 'To-Do-List', 'tasks.db')], { cwd: resolve('.'), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WORKBENCH_TEST_DATA_DIR: root, ELECTRON_RUN_AS_NODE: undefined } });
  processes.push(child); let stderr = '';
  child.stderr?.on('data', b => { stderr += String(b); });
  child.stdout?.on('data', b => { stderr += String(b); });
  for (let i = 0; i < 100; i++) { if (child.exitCode !== null) throw new Error(`Host 提前退出 ${child.exitCode}: ${stderr}`); try { peer = await connectHost(directory); await peer.call('attach'); return; } catch { await new Promise(r => setTimeout(r, 100)); } }
  throw new Error(`Host 启动超时: ${stderr}`);
}
const surface = { id: 'pilot:main', kind: 'main' };
const bot = <T = any>(method: string, ...args: unknown[]) => peer!.call<T>('bot', [method, args, surface]);
async function waitTask(id: string, status: string) { for (let i = 0; i < 200; i++) { const result = await bot<{ task: BotTask }>('getTask', id); if (result.task.status === status) return result.task; if (result.task.status === 'failed') throw new Error(`任务失败: ${result.task.reason}`); await new Promise(r => setTimeout(r, 50)); } throw new Error(`任务未到达 ${status}`); }
try {
  await start();
  const config = await peer!.call<any>('legacy', ['ai:provider:save', [{ kind: 'custom', name: '本机测试模型', endpoint: `http://127.0.0.1:${(server.address() as any).port}/v1`, protocol: 'openai-chat', apiKey: '' }]]);
  const configured = await peer!.call<any>('legacy', ['ai:model:save', [{ providerId: config.providers[0].id, name: 'fixture' }]]);
  const cards = await bot<BotCard[]>('list'); assert.equal(cards.length, 8);
  for (const card of cards) {
    const { bot: { name, description, avatar, instructions } } = await bot('open', card.id);
    await bot('updateProfile', card.id, card.revision, { name, description, avatar, instructions, modelId: configured.models[0].id });
  }
  const schedule = cards.find(b => b.seedKey === 'schedule')!;
  const state = await bot<DraftSnapshot>('getDraft', schedule.mainChatId);
  const draft = await bot<DraftSnapshot>('saveDraft', schedule.mainChatId, state.revision, { text: '添加周五发布提醒，不设标签', replyToTaskId: null, resources: [] });
  const input = { botId: schedule.id, chatId: schedule.mainChatId, expectedDraftRevision: draft.revision, clientRequestId: randomUUID(), text: draft.text, replyToTaskId: null, resources: [] };
  const receipt = await bot<BotSubmitReceipt>('submit', input);
  const waiting = await waitTask(receipt.task.id, 'waiting_user');
  assert.ok(waiting.piSessionPath && existsSync(waiting.piSessionPath));
  const journal = readFileSync(waiting.piSessionPath!, 'utf8'); assert.match(journal, /toolResult/); assert.match(journal, /propose_create/);
  assert.equal((await bot<any>('getHostState')).activeTasks, 0);
  // Simulate complete UI disconnect while retaining the actual independent process.
  peer!.close(); peer = await connectHost(directory); await peer.call('attach');
  assert.equal((await bot<any>('getTask', receipt.task.id)).task.status, 'waiting_user');
  await peer.call('shutdown'); peer.close(); await new Promise(r => setTimeout(r, 700));
  await start();
  const recovered = await bot<any>('getTask', receipt.task.id);
  assert.equal(recovered.task.status, 'waiting_user'); assert.equal(recovered.actions.length, 1);
  const action = recovered.actions[0];
  const applied = await bot<any>('answerAction', action.id, action.revision, { approved: true }); assert.equal(applied.status, 'applied');
  const again = await bot<any>('answerAction', action.id, action.revision, { approved: true }); assert.deepEqual(again.receipt, applied.receipt);
  const replay = await bot<BotSubmitReceipt>('submit', input); assert.equal(replay.task.id, receipt.task.id); assert.equal(replay.duplicate, true);
  await waitTask(receipt.task.id, 'completed');
  assert.equal(applied.receipt.created.length, 1);
  assert.ok(requests.length >= 2);
  await assert.rejects(peer!.call('legacy', ['ai:chat:draft', [schedule.mainChatId, '旧入口覆盖']]), /DRAFT_PROTOCOL_REQUIRED/);
  const web = cards.find(b => b.seedKey === 'web')!, webState = await bot<DraftSnapshot>('getDraft', web.mainChatId);
  const webDraft = await bot<DraftSnapshot>('saveDraft', web.mainChatId, webState.revision, { text: '读取网页', replyToTaskId: null, resources: [] });
  const requestCount = requests.length;
  const browser = await bot<BotSubmitReceipt>('submit', { botId: web.id, chatId: web.mainChatId, expectedDraftRevision: webDraft.revision, clientRequestId: randomUUID(), text: webDraft.text, replyToTaskId: null, resources: [], pageContext: { scope: { module: 'workbench', viewId: 'browser' } } });
  await waitTask(browser.task.id, 'waiting_resource'); assert.equal(requests.length, requestCount); assert.equal((await bot<any>('getHostState')).activeTasks, 0);
  console.log(JSON.stringify({ passed: true, checks: ['independent-host', 'real-pi-tool-loop', 'persistent-jsonl', 'pending-approval-restart', 'native-todo-write', 'approval-idempotency', 'submit-replay-after-restart', 'legacy-write-denied', 'browser-without-UI-waits-without-model-call'], model: 'local deterministic fixture', externalModelTested: false, requests: requests.length }, null, 2));
} finally {
  try { await peer?.call('shutdown', [], 15000); } catch { /* Process is already stopped. */ } peer?.close();
  for (const child of processes) if (child.exitCode === null) { await Promise.race([new Promise(r => child.once('exit', r)), new Promise(r => setTimeout(r, 5000))]); if (child.exitCode === null) child.kill(); }
  server.closeAllConnections(); await new Promise<void>(r => server.close(() => r()));
  assert.equal(dirname(resolve(root)), resolve(tmpdir())); assert.ok(root.includes('ono-bot-pilot-')); rmSync(root, { recursive: true, force: true });
}
