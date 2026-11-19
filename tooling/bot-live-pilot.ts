import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { connectHost, type BotPeer } from '../electron/bot-transport';
import type { BotCard, BotSubmitReceipt, BotTask, DraftSnapshot } from '../shared/bot-contracts';

// Uses the user's configured provider, but all chats, originals and tool writes are isolated.
const output = resolve('test-results/bot-live'); mkdirSync(output, { recursive: true });
const root = mkdtempSync(join(output, 'data-')), directory = join(root, 'OnoWorkbench'); mkdirSync(directory);
const configPath = join(directory, 'ai-config.json');
copyFileSync(join(process.env.APPDATA!, 'OnoWorkbench', 'ai-config.json'), configPath);
const originalState = JSON.parse(readFileSync(join(process.env.APPDATA!, 'OnoWorkbench', 'Local State'), 'utf8'));
writeFileSync(join(directory, 'Local State'), JSON.stringify({ os_crypt: originalState.os_crypt }), { mode: 0o600 });
const require = createRequire(import.meta.url), report = { passed: false, checks: [] as string[], error: '', root, model: '', tasks: [] as string[] };
const env = { ...process.env, ELECTRON_RUN_AS_NODE: undefined };
const child = spawn(require('electron'), [resolve('.'), '--bot-host', '--bot-data-dir', directory, '--bot-todo-db', join(root, 'To-Do-List', 'tasks.db')], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let peer: BotPeer | undefined, diagnostics = '';
child.stderr?.on('data', value => { diagnostics += value; });
const pause = (ms: number) => new Promise(r => setTimeout(r, ms));
const surface = { id: 'live-pilot', kind: 'main' };
const bot = <T = any>(method: string, ...args: unknown[]) => peer!.call<T>('bot', [method, args, surface]);
const record = (name: string) => { report.checks.push(name); console.log(`PASS ${name}`); };
async function submit(card: BotCard, text: string, pageContext?: any) {
  const state = await bot<DraftSnapshot>('getDraft', card.mainChatId);
  const draft = await bot<DraftSnapshot>('saveDraft', card.mainChatId, state.revision, { text, replyToTaskId: null, resources: [] });
  const receipt = await bot<BotSubmitReceipt>('submit', { botId: card.id, chatId: card.mainChatId, expectedDraftRevision: draft.revision, clientRequestId: randomUUID(), text, replyToTaskId: null, resources: [], pageContext });
  report.tasks.push(receipt.task.id); return receipt.task;
}
async function until(id: string, status: string) {
  for (let i = 0; i < 600; i++) { const result = await bot<any>('getTask', id); if (result.task.status === status) return result; if (['failed', 'waiting_resource', 'cancelled'].includes(result.task.status)) throw new Error(`任务 ${id}: ${result.task.status}: ${result.task.reason}`); await pause(500); }
  throw new Error(`任务未到达 ${status}: ${id}`);
}
try {
  for (let i = 0; i < 100; i++) { if (child.exitCode !== null) throw new Error(diagnostics); try { peer = await connectHost(directory); break; } catch { await pause(100); } }
  assert.ok(peer);
  const config = await peer.call<any>('legacy', ['ai:config', []]);
  const model = config.models.find((item: any) => item.id === config.activeModelId) ?? config.models[0];
  assert.ok(model && config.hasConnection && config.aiEnabled);
  report.model = model.name;
  const cards = await bot<BotCard[]>('list'), media = cards.find(b => b.seedKey === 'media')!, schedule = cards.find(b => b.seedKey === 'schedule')!, coordinator = cards.find(b => b.seedKey === 'coordinator')!;
  for (const card of [media, schedule, coordinator]) {
    const { bot: { name, description, avatar, instructions } } = await bot('open', card.id);
    await bot('updateProfile', card.id, card.revision, { name, description, avatar, instructions, modelId: model.id });
  }
  const rootTask = await submit(media, `这是隔离验收。先使用 save_artifact 保存一个标题为“协作验收短文”的 Markdown 交付件，正文是你写的两句关于整理工作台的短文。然后必须使用 send_to_bot 把一次创建待办的任务委派给小历，botId=${schedule.id}，并带上交付件的 artifact 引用。交接内容要求：使用 propose_create 生成一条标题为“协作验收发布”的待办建议，不设时间、不设分类，等用户确认。你不要自己新建待办或重复交接。收到小历实际应用回执后，简短汇总。`);
  await until(rootTask.id, 'waiting_bot');
  let rootDetail = await bot<any>('getTask', rootTask.id); assert.equal(rootDetail.children.length, 1);
  const childDetail = await until(rootDetail.children[0].id, 'waiting_user');
  const action = childDetail.actions.find((a: any) => a.kind === 'todo'); assert.ok(action);
  assert.equal(childDetail.task.resources[0]?.kind, 'artifact');
  const applied = await bot<any>('answerAction', action.id, action.revision, { approved: true }); assert.equal(applied.status, 'applied');
  assert.deepEqual((await bot<any>('answerAction', action.id, action.revision, { approved: true })).receipt, applied.receipt);
  rootDetail = await until(rootTask.id, 'completed'); assert.equal(rootDetail.children[0].status, 'completed');
  assert.ok((await bot<any[]>('listArtifacts', media.id)).length); record('live model saves artifact, delegates media to schedule, confirms native write and returns result');
  const first = await until((await submit(coordinator, '仅回复“第一次会话验证”，不使用工具。')).id, 'completed');
  const second = await until((await submit(coordinator, '我上次让你回复什么？只回复原话，不使用工具。')).id, 'completed');
  assert.equal(first.task.piSessionPath, second.task.piSessionPath); assert.match(second.task.result, /第一次会话验证/); record('live main chat reuses Pi session and remembers previous turn');
  const copyState = await peer.call<any>('legacy', ['copy:save', [{ title: '原稿验证', body: '今天整理工作台。' }]]);
  const draft = copyState.drafts.find((d: any) => d.title === '原稿验证'); assert.ok(draft);
  const copyTask = await submit(media, '请使用 propose_edit，把当前原稿正文改成“今天整理了工作台，明天继续完善。”，只提出这一项修改，等我确认，不委派。', { scope: { module: 'copy', draftId: draft.id }, pageScope: { module: 'copy', draftId: draft.id } });
  const copyDetail = await until(copyTask.id, 'waiting_user'), copyAction = copyDetail.actions.find((a: any) => a.kind === 'copy'); assert.ok(copyAction);
  const write = await bot<any>('answerAction', copyAction.id, copyAction.revision, { approved: true, indices: [0] }); assert.equal(write.status, 'applied');
  const after = await peer.call<any>('legacy', ['copy:list', []]); assert.match(after.drafts.find((d: any) => d.id === draft.id).body, /明天继续完善/);
  assert.equal((await bot<any>('undoAction', write.id, write.revision)).status, 'undone');
  const undone = await peer.call<any>('legacy', ['copy:list', []]); assert.equal(undone.drafts.find((d: any) => d.id === draft.id).body, draft.body); record('live copy proposal writes native original and guarded undo restores it');
  report.passed = true;
} catch (error) { report.error = error instanceof Error ? error.stack ?? error.message : String(error); throw error; }
finally {
  await peer?.call('shutdown', [], 15000).catch(() => {}); peer?.close();
  if (child.exitCode === null) { await Promise.race([new Promise(r => child.once('exit', r)), pause(5000)]); if (child.exitCode === null) child.kill(); }
  if (existsSync(configPath)) unlinkSync(configPath);
  writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2));
}
