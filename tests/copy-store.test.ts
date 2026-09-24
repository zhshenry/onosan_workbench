import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CopyStore, newCopyDraftInput } from '../modules/copywriting/store';
import { buildCopyContribution } from '../modules/copywriting/ai';
import { buildCopySystemPrompt, buildCopyUserMessage } from '../modules/copywriting/prompts';
import { copyAiActionsSchema, type CopyDraft } from '../shared/copy-contracts';

function withStore(run: (store: CopyStore, dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'wb-copy-test-'));
  try { run(new CopyStore(dir), dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

const DRAFT = { title: '第一篇心得', body: '今天试了新方法,有点意思。', platform: 'xiaohongshu' as const };

test('草稿库:新建生成 id 与时间戳,并置于列表首位', () => {
  withStore((store) => {
    const data = store.save(DRAFT);
    assert.equal(data.drafts.length, 1);
    const draft = data.drafts[0];
    assert.equal(draft.title, DRAFT.title);
    assert.match(draft.id, /^[0-9a-f-]{36}$/);
    assert.ok(draft.createdAt && draft.updatedAt);
    assert.equal(draft.createdAt, draft.updatedAt);
  });
});

test('草稿库:同 id 保存为更新,updatedAt 前进,createdAt 不变', () => {
  withStore((store) => {
    const first = store.save(DRAFT).drafts[0];
    const data = store.save({ id: first.id, title: '改过的标题', body: DRAFT.body, platform: 'xiaohongshu' });
    assert.equal(data.drafts.length, 1);
    assert.equal(data.drafts[0].title, '改过的标题');
    assert.equal(data.drafts[0].createdAt, first.createdAt);
    assert.ok(data.drafts[0].updatedAt >= first.updatedAt);
  });
});

test('草稿库:字段校验拒绝非法输入', () => {
  withStore((store) => {
    assert.throws(() => store.save({ ...DRAFT, title: 'x'.repeat(31) }));
    assert.throws(() => store.save({ ...DRAFT, body: 'x'.repeat(20001) }));
    assert.throws(() => store.save({ ...DRAFT, platform: 'douyin' }));
    assert.throws(() => store.save({ ...DRAFT, extra: 1 }));
  });
});

test('草稿库:删除与持久化重载', () => {
  withStore((store, dir) => {
    const a = store.save(DRAFT).drafts[0];
    store.save({ ...DRAFT, title: '第二篇' });
    store.remove(a.id);
    const reloaded = new CopyStore(dir);
    assert.equal(reloaded.all().drafts.length, 1);
    assert.equal(reloaded.all().drafts[0].title, '第二篇');
    assert.throws(() => store.remove(a.id), /笔记不存在或已删除/);
  });
});

test('提示词:系统提示含模式规则与通用纪律,用户消息含正文与指令', () => {
  const draft: CopyDraft = { ...newCopyDraftInput(), ...DRAFT, id: 'x', createdAt: '', updatedAt: '' };
  const humanize = buildCopySystemPrompt(new Date(), 'humanize', draft);
  assert.ok(humanize.includes('去 AI 味') && humanize.includes('不新增事实'));
  assert.ok(humanize.includes('小红书') && humanize.includes('propose_edit'));
  const titles = buildCopySystemPrompt(new Date(), 'titles', draft);
  assert.ok(titles.includes('起标题') && titles.includes('propose_titles'));
  const user = buildCopyUserMessage('humanize', DRAFT.body);
  assert.ok(user.includes(DRAFT.body) && user.includes('优化'));
});

type ToolCall = { name: string; execute: (id: string, params: unknown) => Promise<{ content: { text: string }[] }> };

test('AI 贡献:propose_edit 收集建议并裁剪 notes,propose_titles 校验数量', async () => {
  const draft: CopyDraft = { ...newCopyDraftInput(), ...DRAFT, id: 'x', createdAt: '', updatedAt: '' };
  const editContribution = buildCopyContribution('humanize', draft);
  assert.deepEqual(editContribution.toolNames, ['propose_edit']);
  const tools = editContribution.buildTools() as unknown as ToolCall[];
  const proposeEdit = tools[0];
  await proposeEdit.execute('t1', { text: '  改好的正文  ', notes: ['一', '二', '三', '四'] });
  await proposeEdit.execute('t2', { text: '' });
  const actions = copyAiActionsSchema.parse(editContribution.collect());
  assert.equal(actions.length, 1);
  assert.deepEqual(actions[0], { kind: 'edit', text: '改好的正文', notes: ['一', '二', '三'] });

  const titleContribution = buildCopyContribution('titles', draft);
  assert.deepEqual(titleContribution.toolNames, ['propose_titles']);
  const titleTools = titleContribution.buildTools() as unknown as ToolCall[];
  await titleTools[0].execute('t3', { titles: ['标题一', '标题二'] });
  const titleActions = copyAiActionsSchema.parse(titleContribution.collect());
  assert.deepEqual(titleActions, [{ kind: 'titles', titles: ['标题一', '标题二'] }]);
});
