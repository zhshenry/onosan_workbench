import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { aiReferenceSchema, aiReferenceKey, aiReferenceMode, aiReferenceLimit, validateAiReferences, type AiReference } from '../shared/ai-reference';
import type { AiScope } from '../shared/ai-scope';
import { resolveAiReferences, withAiReferenceSnapshots, type AiReferenceSources } from '../electron/ai-reference';
import { runAgentLoop, type AiModuleContribution } from '../electron/ai-core';
import { buildTodoContribution, planFromReply, taskSnapshot } from '../modules/todo/ai-tools';
import { buildCopyContribution } from '../modules/copywriting/ai';
import { buildWorkbenchContribution } from '../modules/workbench-ai';
import { newTask, type Task } from '../shared/todo-contracts';
import type { CopyDraft } from '../shared/copy-contracts';
import type { BaziProfile } from '../shared/bazi-contracts';
import type { BookEntry } from '../shared/reading-contracts';

const now = new Date('2026-10-12T12:00:00.000Z');
const task = (id = randomUUID(), updatedAt = now.toISOString()): Task => ({ ...newTask('事项标题'), id, createdAt: updatedAt, updatedAt, deletedAt: null, notifiedFor: null, completedAt: null });
const draft = (id = 'copy-1'): CopyDraft => ({ id, title: '博客标题', body: '博客原正文', platform: 'xiaohongshu', createdAt: now.toISOString(), updatedAt: now.toISOString() });
const profile = (id = 'bazi-1'): BaziProfile => ({ id, name: '命例甲', gender: 1, date: '1990-08-16', time: '14:30', createdAt: now.toISOString() });
const book = (id = 'reading-1'): BookEntry => ({ id, title: '书目标题', author: '作者甲', status: 'reading', progressPct: 25, comment: '书目短评', tags: ['学习'], createdAt: now.toISOString(), updatedAt: now.toISOString() });
const generic = (viewId: string): AiScope => ({ module: 'workbench', viewId });
function fixtures() {
  const tasks = [task()];
  const drafts = [draft()];
  const profiles = [profile()];
  const books = [book()];
  const notes: Record<string, string> = { 'bazi-1': '命例原笔记' };
  const reads = { todo: 0, copy: 0, bazi: 0, reading: 0 };
  const sources: AiReferenceSources = {
    todo: { all: () => { reads.todo++; return tasks; }, categories: () => [] },
    copy: { get: id => { reads.copy++; return drafts.find(item => item.id === id); } },
    bazi: { all: () => { reads.bazi++; return { profiles, notes }; } },
    reading: { all: () => { reads.reading++; return { books }; } },
  };
  return { tasks, drafts, profiles, books, notes, reads, sources };
}
async function invoke(contribution: AiModuleContribution, name: string, params: Record<string, unknown>) {
  const tool = contribution.buildTools().find(item => item.name === name);
  assert.ok(tool, `missing tool ${name}`);
  return tool.execute('test-call', params, new AbortController().signal);
}

test('参考标识独立于会话范围，严格校验字段和 ID，并保留旧博客、命例和书目形状', () => {
  const refs: AiReference[] = [
    { module: 'todo', taskId: 'same-id' }, { module: 'copy', draftId: 'same-id' },
    { module: 'bazi', profileId: 'same-id' }, { module: 'reading', profileId: 'same-id' },
  ];
  assert.equal(new Set(refs.map(aiReferenceKey)).size, 4);
  for (const reference of refs) assert.deepEqual(aiReferenceSchema.parse(reference), reference);
  for (const id of ['', ' ', ' padded', 'two words', 'line\nbreak', '../file', 'folder\\file', 'x'.repeat(201), 'null\0byte']) {
    assert.equal(aiReferenceSchema.safeParse({ module: 'todo', taskId: id }).success, false, JSON.stringify(id));
  }
  for (const input of [
    { module: 'todo' }, { module: 'todo', profileId: 'x' }, { module: 'copy', draftId: 'x', content: 'renderer forged text' },
    { module: 'workbench', viewId: 'copy' }, { module: 'reading', profileId: 'book', vaultPath: '/private' },
  ]) assert.equal(aiReferenceSchema.safeParse(input).success, false);
});

test('页面和主对象独立校验：阅读与命理不能混用，通用自媒体允许博客，规划与设置不提供参考', () => {
  const expected: Record<string, ReturnType<typeof aiReferenceMode>> = {
    home: 'todo', copy: 'copy', 'copy-publish': 'copy', 'media-browser': 'copy', 'workspace:media': 'copy',
    bazi: 'bazi', reading: 'reading', 'workspace:life': null, 'workspace:settings': null,
    'settings-ai': null, 'settings-data': null, game: null, web: null, unknown: null,
  };
  for (const [view, mode] of Object.entries(expected)) assert.equal(aiReferenceMode(generic(view)), mode, view);
  const copyReference: AiReference = { module: 'copy', draftId: 'other-blog' };
  for (const view of ['copy', 'copy-publish', 'media-browser', 'workspace:media']) {
    assert.deepEqual(validateAiReferences([copyReference], generic(view), generic('workspace:media')), [copyReference]);
  }
  for (const mode of ['reading', 'bazi'] as const) {
    const reference = { module: mode, profileId: 'selected' };
    assert.deepEqual(validateAiReferences([reference], generic(mode), generic('workspace:life')), [reference]);
    const opposite = mode === 'reading' ? 'bazi' : 'reading';
    assert.throws(() => validateAiReferences([reference], generic(opposite), generic('workspace:life')), /页面/);
    assert.throws(() => validateAiReferences([reference], generic(mode), { module: opposite, profileId: 'main' }), /类型/);
  }
  assert.throws(() => validateAiReferences([copyReference], generic('media-browser'), generic('workspace:life')), /工作台/);
  for (const view of ['settings-ai', 'game', 'web', 'unknown']) assert.throws(() => validateAiReferences([copyReference], generic(view), generic(view)), /页面/);
  assert.deepEqual(validateAiReferences([], generic('settings-ai'), generic('settings-ai')), []);
});

test('事项和书目单选，博客和命例最多八个，不接受重复或与主对象相同的参考', () => {
  for (const mode of ['todo', 'copy', 'bazi', 'reading'] as const) {
    assert.equal(aiReferenceLimit(mode), mode === 'todo' || mode === 'reading' ? 1 : 8);
    const make = (id: string): AiReference => mode === 'todo' ? { module: mode, taskId: id } : mode === 'copy' ? { module: mode, draftId: id } : { module: mode, profileId: id };
    const primary: AiScope = mode === 'todo' ? { module: 'todo' } : mode === 'copy' ? { module: mode, draftId: 'main' } : { module: mode, profileId: 'main' };
    const refs = Array.from({ length: aiReferenceLimit(mode) }, (_, i) => make(`selected-${i}`));
    assert.deepEqual(validateAiReferences(refs, generic(mode === 'todo' ? 'home' : mode), primary), refs);
    assert.throws(() => validateAiReferences([...refs, make('extra')], generic(mode === 'todo' ? 'home' : mode), primary), /1个|8个/);
    assert.throws(() => validateAiReferences([make('duplicate'), make('duplicate')], generic(mode === 'todo' ? 'home' : mode), primary), /重复|1个/);
    if (mode !== 'todo') assert.throws(() => validateAiReferences([make('main')], generic(mode), primary), /无需重复/);
  }
  assert.throws(() => validateAiReferences([{ module: 'reading', profileId: 'same' }, { module: 'bazi', profileId: 'same' }], generic('reading'), generic('workspace:life')), /页面/);
});

test('参考从正确来源分派，缺失与软删除拒绝，未选来源不会读取', () => {
  const f = fixtures();
  f.books[0].id = f.profiles[0].id;
  const result = resolveAiReferences([{ module: 'reading', profileId: f.books[0].id }], generic('reading'), generic('workspace:life'), f.sources, { now });
  assert.match(result[0].content, /书目标题/);
  assert.equal(f.reads.bazi, 0);
  assert.equal(f.reads.todo, 0);
  assert.equal(f.reads.copy, 0);
  f.books.splice(0);
  assert.throws(() => resolveAiReferences([{ module: 'reading', profileId: f.profiles[0].id }], generic('reading'), generic('workspace:life'), f.sources), /参考书目不存在/);
  const missing: AiReference[] = [{ module: 'todo', taskId: 'missing' }, { module: 'copy', draftId: 'missing' }, { module: 'bazi', profileId: 'missing' }];
  for (const reference of missing) assert.throws(() => resolveAiReferences([reference], generic(reference.module === 'todo' ? 'home' : reference.module), generic(reference.module === 'todo' ? 'home' : reference.module), f.sources), /不存在或已删除/);
  f.tasks[0].deletedAt = now.toISOString();
  assert.throws(() => resolveAiReferences([{ module: 'todo', taskId: f.tasks[0].id }], { module: 'todo' }, { module: 'todo' }, f.sources), /参考事项不存在/);
});

test('书目快照只包含已记录书目信息，绝不读取库路径、附件、笔记或设置', async () => {
  const f = fixtures();
  f.books[0] = { ...f.books[0], chapterCurrent: 2, chapterTotal: 8, rating: 4, link: { vault: 'SECRET_VAULT', folder: 'SECRET_FOLDER' } };
  Object.defineProperty(f.books[0], 'attachments', { get: () => { throw new Error('attachments must not be read'); } });
  Object.defineProperty(f.sources.reading, 'vaultPath', { get: () => { throw new Error('vault must not be read'); } });
  const snapshots = resolveAiReferences([{ module: 'reading', profileId: 'reading-1' }], generic('reading'), generic('workspace:life'), f.sources, { now });
  const text = snapshots[0].content;
  for (const expected of ['书目标题', '作者甲', '书目短评', 'progressPct', 'chapterCurrent', 'rating', '学习']) assert.ok(text.includes(expected), expected);
  for (const forbidden of ['SECRET', 'link', 'vault', 'attachment', 'createdAt', 'updatedAt', 'settings']) assert.ok(!text.includes(forbidden), forbidden);
  const contribution = withAiReferenceSnapshots(buildWorkbenchContribution('workspace:life'), snapshots);
  assert.deepEqual(contribution.toolNames, ['read_reference']);
  assert.equal(contribution.buildTools().some(tool => tool.name === 'read_book_note'), false);
  assert.deepEqual((await invoke(contribution, 'read_reference', { id: 'reading:reading-1' })).content, [{ type: 'text', text }]);
});

test('参考正文有界并按发送时冻结，工具不能读取未选对象，通用自媒体不获得写入能力', async () => {
  const f = fixtures();
  f.drafts[0].body = `${'📝'.repeat(10000)}TRUNCATED_SECRET`;
  f.drafts[0].xhsPublished = { status: 'published', source: 'manual', url: 'https://secret.example', remoteId: 'secret-remote', confirmedAt: now.toISOString() };
  const snapshots = resolveAiReferences([{ module: 'copy', draftId: 'copy-1' }], generic('media-browser'), generic('workspace:media'), f.sources, { now });
  const original = snapshots[0].content;
  assert.ok(original.includes('已截断'));
  assert.ok(!original.includes('TRUNCATED_SECRET'));
  assert.ok(!original.includes('secret.example'));
  assert.ok(original.length <= 32000);
  assert.equal(snapshots[0].capturedAt, now.toISOString());
  assert.ok(Object.isFrozen(snapshots[0]));
  assert.ok(Object.isFrozen(snapshots[0].reference));
  const contribution = withAiReferenceSnapshots(buildWorkbenchContribution('media-browser'), snapshots);
  assert.deepEqual(contribution.toolNames, ['read_reference']);
  const prompt = contribution.systemPrompt(now);
  assert.ok(prompt.includes(JSON.stringify(snapshots)));
  f.drafts[0].body = 'SOURCE_EDITED_AFTER_SEND';
  f.drafts.splice(0);
  assert.deepEqual((await invoke(contribution, 'read_reference', { id: 'copy-1' })).content, [{ type: 'text', text: original }]);
  assert.deepEqual((await invoke(contribution, 'read_reference', { id: 'copy:copy-1' })).content, [{ type: 'text', text: original }]);
  assert.match(JSON.stringify((await invoke(contribution, 'read_reference', { id: 'unselected' })).content), /不能读取/);
  assert.equal(f.reads.copy, 1);
  assert.equal(contribution.systemPrompt(now), prompt);
});

test('命例参考沿用本轮三种盘型，快照中的笔记不随之后改动变化', async () => {
  for (const [system, marker] of [['bazi', '八字四柱'], ['ziwei', '紫微斗数'], ['astro', '占星']] as const) {
    const f = fixtures();
    const snapshots = resolveAiReferences([{ module: 'bazi', profileId: 'bazi-1' }], generic('bazi'), { module: 'bazi', profileId: 'main' }, f.sources, { now, baziSystem: system });
    assert.equal(snapshots[0].baziSystem, system);
    assert.match(snapshots[0].content, new RegExp(marker));
    assert.match(snapshots[0].content, /命例原笔记/);
    f.notes['bazi-1'] = 'changed notes';
    const contribution = withAiReferenceSnapshots(buildWorkbenchContribution('bazi'), snapshots);
    assert.deepEqual(contribution.toolNames, ['read_reference']);
    assert.match(JSON.stringify((await invoke(contribution, 'read_reference', { id: 'bazi-1' })).content), /命例原笔记/);
    assert.equal(f.reads.bazi, 1);
  }
});

test('带模块前缀的旧 ID 不与另一个参考 key 混淆', async () => {
  const f = fixtures();
  f.drafts.push({ ...draft('copy:copy-1'), body: '另一个碰撞 ID 的正文' });
  const snapshots = resolveAiReferences([{ module: 'copy', draftId: 'copy-1' }, { module: 'copy', draftId: 'copy:copy-1' }], generic('media-browser'), generic('workspace:media'), f.sources, { now });
  const contribution = withAiReferenceSnapshots(buildWorkbenchContribution('media-browser'), snapshots);
  assert.deepEqual((await invoke(contribution, 'read_reference', { id: 'copy:copy-1' })).content, [{ type: 'text', text: snapshots[0].content }]);
  assert.deepEqual((await invoke(contribution, 'read_reference', { id: 'copy:copy:copy-1' })).content, [{ type: 'text', text: snapshots[1].content }]);
});

test('事项保留最近120条基线，明确选中的更早事项加入有效建议快照，未选旧事项仍不授权', async () => {
  const tasks = Array.from({ length: 123 }, (_, i) => task(randomUUID(), new Date(now.getTime() - i * 1000).toISOString()));
  const selected = tasks[121];
  selected.note = '这是更早事项的实际内容';
  const before = JSON.stringify(tasks);
  const baseline = taskSnapshot(tasks, []);
  const expanded = taskSnapshot(tasks, [], [selected.id]);
  assert.equal(baseline.context.length, 120);
  assert.deepEqual(expanded.context.slice(0, 120), baseline.context);
  assert.equal(expanded.context.length, 121);
  assert.equal(expanded.known.has(selected.id), true);
  assert.equal(expanded.known.has(tasks[122].id), false);
  assert.equal(taskSnapshot(tasks, [], [tasks[0].id, selected.id, selected.id]).context.length, 121);
  const f = fixtures();
  f.sources.todo.all = () => tasks;
  const snapshots = resolveAiReferences([{ module: 'todo', taskId: selected.id }], { module: 'todo' }, { module: 'todo' }, f.sources, { now });
  assert.match(snapshots[0].content, /实际内容/);
  const primary = buildTodoContribution(tasks, [], undefined, [selected.id]);
  const contribution = withAiReferenceSnapshots(primary, snapshots);
  assert.match(JSON.stringify((await invoke(contribution, 'propose_update', { id: tasks[122].id, status: 'done' })).content), /事项不存在/);
  assert.match(JSON.stringify((await invoke(contribution, 'propose_update', { id: selected.id, status: 'done' })).content), /等待用户确认/);
  const plan = planFromReply('待确认', primary.collect(), expanded.known);
  assert.deepEqual(plan.actions, [{ type: 'update', id: selected.id, patch: { status: 'done' } }]);
  assert.throws(() => planFromReply(JSON.stringify({ message: '伪造事项', actions: [{ type: 'remove', id: tasks[122].id }] }), [], expanded.known), /不存在的事项/);
  assert.equal(JSON.stringify(tasks), before);
});

test('博客参考不改变原有建议主对象，参考源不被写入', async () => {
  const f = fixtures();
  const main = draft('primary-blog');
  const primary = buildCopyContribution(main);
  const snapshots = resolveAiReferences([{ module: 'copy', draftId: 'copy-1' }], { module: 'copy', draftId: main.id }, { module: 'copy', draftId: main.id }, f.sources, { now });
  const contribution = withAiReferenceSnapshots(primary, snapshots);
  await invoke(contribution, 'propose_edit', { text: '等待确认的新正文' });
  assert.deepEqual(primary.collect(), [{ kind: 'edit', text: '等待确认的新正文', notes: [] }]);
  assert.equal(main.id, 'primary-blog');
  assert.equal(main.body, '博客原正文');
  assert.equal(f.drafts[0].body, '博客原正文');
});

test('真实模型请求包含选中快照，工具读取同一冻结文本而非发送后的业务内容', async () => {
  const f = fixtures();
  const snapshots = resolveAiReferences([{ module: 'copy', draftId: 'copy-1' }], generic('media-browser'), generic('workspace:media'), f.sources, { now });
  const contribution = withAiReferenceSnapshots(buildWorkbenchContribution('media-browser'), snapshots);
  const requests: Record<string, unknown>[] = [];
  const server = createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    requests.push(JSON.parse(raw));
    f.drafts[0].body = 'AFTER_SEND_EDIT';
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const delta = requests.length === 1
      ? { tool_calls: [{ index: 0, id: 'read-frozen', type: 'function', function: { name: 'read_reference', arguments: JSON.stringify({ id: 'copy:copy-1' }) } }] }
      : { content: '已按发送时参考回答。' };
    response.write(`data: ${JSON.stringify({ id: `completion-${requests.length}`, object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`);
    response.write(`data: ${JSON.stringify({ id: `completion-${requests.length}`, object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: requests.length === 1 ? 'tool_calls' : 'stop' }] })}\n\n`);
    response.end('data: [DONE]\n\n');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address() as { port: number };
    const result = await runAgentLoop({ endpoint: `http://127.0.0.1:${address.port}/v1`, model: 'fixture-model', protocol: 'openai-chat', key: 'test-only' }, '参考这篇博客', [], AbortSignal.timeout(15000), contribution);
    assert.equal(result.reply, '已按发送时参考回答。');
    assert.equal(requests.length, 2);
    const first = JSON.stringify(requests[0]);
    assert.ok(first.includes('博客原正文'));
    const messages = requests[1].messages as { role: string; content: string }[];
    assert.equal(messages.find(message => message.role === 'tool')?.content, snapshots[0].content);
    assert.ok(!JSON.stringify(requests).includes('AFTER_SEND_EDIT'));
    assert.equal(f.reads.copy, 1);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
