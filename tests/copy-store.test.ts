import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CopyStore, newCopyDraftInput } from '../modules/copywriting/store';
import { buildCopyContribution } from '../modules/copywriting/ai';
import { buildCoachSystemPrompt } from '../modules/copywriting/prompts';
import { matchXhsPublished, parseXhsNoteUrl } from '../modules/copywriting/xhs-publish';
import { copyAiActionsSchema, extractXhsTags, type CopyDraft } from '../shared/copy-contracts';

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
    assert.throws(() => store.remove(a.id), /博客不存在或已删除/);
  });
});

test('提示词:教练系统提示含追问规则、通用纪律与草稿快照', () => {
  const draft: CopyDraft = { ...newCopyDraftInput(), ...DRAFT, id: 'x', createdAt: '', updatedAt: '' };
  const prompt = buildCoachSystemPrompt(new Date(), draft);
  assert.ok(prompt.includes('追问') && prompt.includes('propose_edit') && prompt.includes('propose_title'));
  assert.ok(prompt.includes('不新增事实') && prompt.includes('小红书'));
  assert.ok(prompt.includes(DRAFT.title) && prompt.includes(DRAFT.body));
});

type ToolCall = { name: string; execute: (id: string, params: unknown) => Promise<{ content: { text: string }[] }> };

test('AI 贡献:propose_edit 收集并裁剪 notes,propose_title 单条收集', async () => {
  const draft: CopyDraft = { ...newCopyDraftInput(), ...DRAFT, id: 'x', createdAt: '', updatedAt: '' };
  const contribution = buildCopyContribution(draft);
  assert.deepEqual(contribution.toolNames, ['propose_edit', 'propose_title']);
  const tools = contribution.buildTools() as unknown as ToolCall[];
  await tools[0].execute('t1', { text: '  改好的正文  ', notes: ['一', '二', '三', '四'] });
  await tools[0].execute('t2', { text: '' });
  await tools[1].execute('t3', { title: '  标题候选  ' });
  const actions = copyAiActionsSchema.parse(contribution.collect());
  assert.equal(actions.length, 2);
  assert.deepEqual(actions[0], { kind: 'edit', text: '改好的正文', notes: ['一', '二', '三'] });
  assert.deepEqual(actions[1], { kind: 'title', title: '标题候选' });
});

test('标签提取:去重保序,忽略空标签,单标签最长30字', () => {
  assert.deepEqual(extractXhsTags('#读书笔记 好用 #自我提升#读书笔记'), ['读书笔记', '自我提升']);
  assert.deepEqual(extractXhsTags('没有标签的正文'), []);
  assert.deepEqual(extractXhsTags('# 含空格不完整 #'), []);
  assert.equal(extractXhsTags(`#${'a'.repeat(40)}`)[0].length, 30);
});

test('已发布关联:仅接受作品直链,旧草稿可读,关联与移除均不改正文版本', () => {
  withStore((store, dir) => {
    const draft = store.save(DRAFT).drafts[0];
    const unchangedAt = draft.updatedAt;
    const url = 'https://www.xiaohongshu.com/explore/68aa11223344556677889900?xsec_token=abc';
    assert.throws(() => store.markXhsPublished(draft.id, 'https://xiaohongshu.com.evil.test/explore/68aa11223344556677889900'));
    assert.throws(() => store.markXhsPublished(draft.id, 'https://www.xiaohongshu.com:8443/explore/68aa11223344556677889900'));
    assert.throws(() => store.markXhsPublished(draft.id, 'https://creator.xiaohongshu.com/publish/publish'));
    assert.equal(store.get(draft.id)?.xhsPublished, undefined);
    const marked = store.markXhsPublished(draft.id, url).drafts[0];
    assert.equal(marked.updatedAt, unchangedAt);
    assert.equal(marked.xhsPublished?.source, 'manual');
    assert.equal(marked.xhsPublished?.remoteId, '68aa11223344556677889900');
    assert.equal(marked.xhsPublished?.url, url);
    assert.equal(new CopyStore(dir).get(draft.id)?.xhsPublished?.url, url);
    assert.equal(store.save({ id: draft.id, body: '正文更新' }).drafts[0].xhsPublished?.url, url);
    assert.equal(store.clearXhsPublished(draft.id).drafts[0].xhsPublished, undefined);
    assert.equal(new CopyStore(dir).get(draft.id)?.xhsPublished, undefined);
  });
});

test('已发布匹配:作品 ID 优先,同名笔记只列候选', () => {
  const draft = {
    title: '第一篇心得',
    xhsPublished: {
      status: 'published' as const, source: 'manual' as const,
      remoteId: '68aa11223344556677889900',
      url: 'https://www.xiaohongshu.com/explore/68aa11223344556677889900',
      confirmedAt: new Date().toISOString(),
    },
  };
  const posts = [
    { title: '第一篇心得', url: 'https://www.xiaohongshu.com/explore/68aa11223344556677889901', remoteId: '68aa11223344556677889901' },
    { title: '第一篇心得', url: 'https://www.xiaohongshu.com/explore/68aa11223344556677889902', remoteId: '68aa11223344556677889902' },
    { title: '改过的平台标题', url: draft.xhsPublished.url, remoteId: draft.xhsPublished.remoteId },
  ];
  assert.deepEqual(matchXhsPublished(draft, posts).map((item) => item.reason), ['id', 'title', 'title']);
  assert.equal(matchXhsPublished({ title: draft.title }, posts).length, 2);
  assert.equal(parseXhsNoteUrl(draft.xhsPublished.url).remoteId, draft.xhsPublished.remoteId);
});
