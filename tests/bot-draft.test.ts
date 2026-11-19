import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { AiStore } from '../electron/ai-store';
import { BotStore, BotError } from '../electron/bot-store';
import { BotHost } from '../electron/bot-host';
import { BotDraftController } from '../src/bot-draft';
import type { BotBridge, BotChanged } from '../shared/bot-contracts';

const delay = (ms = 10) => new Promise(r => setTimeout(r, ms));
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'ono-bot-draft-')), ai = new AiStore(directory, { recover: false }), store = new BotStore(ai, directory);
  const host = new BotHost(store, { run: async () => ({ reply: '完成' }), apply: async () => ({ ok: true }) });
  const bot = store.cards().find(b => b.seedKey === 'coordinator')!;
  const bridge = (id: string): BotBridge => {
    const surface = { id, kind: id === 'island' ? 'island' as const : 'main' as const };
    return {
      getDraft: async chat => host.getDraft(chat, surface),
      saveDraft: async (chat, revision, value) => host.saveDraft(chat, revision, value, surface), submit: async input => host.submit(input, surface),
      onChanged: callback => { const listener = (event: BotChanged) => callback(event); host.on('changed', listener); return () => { host.off('changed', listener); }; },
    } as BotBridge;
  };
  return { directory, host, store, bot, bridge, close: async () => { await host.stop(); ai.close(); assert.equal(dirname(resolve(directory)), resolve(tmpdir())); assert.ok(directory.includes('ono-bot-draft-')); rmSync(directory, { recursive: true, force: true }); } };
}

test('legacy Host draft envelopes never replace the valid local draft shape', async () => {
  const f = fixture(), api = f.bridge('main');
  api.getDraft = async () => ({ draft: { chatId: f.bot.mainChatId, revision: 0, text: '旧后台草稿', replyToTaskId: null, resources: [] }, owner: null }) as any;
  const draft = new BotDraftController(f.bot.mainChatId, api);
  try {
    await draft.start();
    assert.deepEqual(draft.value, { text: '', replyToTaskId: null, resources: [] });
    assert.equal(draft.ready, false); assert.match(draft.error, /后台.*格式.*不兼容/);
    draft.edit({ text: '本地继续输入' }); assert.equal(draft.value.resources.length, 0);
  } finally { await draft.stop(); await f.close(); }
});

test('IME input and draft notifications remain independent across main and island', async () => {
  const f = fixture(), main = new BotDraftController(f.bot.mainChatId, f.bridge('main')), island = new BotDraftController(f.bot.mainChatId, f.bridge('island'));
  try {
    await main.start(); await island.start(); assert.ok(main.ready); assert.ok(island.ready);
    main.composition(true); main.edit({ text: '输入法还在组合' });
    island.edit({ text: '灵动岛独立输入' }); await island.flush();
    assert.equal(main.value.text, '输入法还在组合'); assert.equal(f.store.draft(f.bot.mainChatId).text, '');
    main.composition(false); await main.flush(); await delay();
    assert.equal(island.value.text, '灵动岛独立输入');
    assert.equal(f.store.draft(f.bot.mainChatId, 'island').text, '灵动岛独立输入');
    assert.equal(f.store.draft(f.bot.mainChatId).text, '输入法还在组合');
  } finally { await main.stop(); await island.stop(); await f.close(); }
});

test('an accepted send with a lost receipt is retried once without autosaving over its revision', async () => {
  const f = fixture(), api = f.bridge('main'), original = api.submit; let lose = true;
  api.submit = async input => { const result = await original(input); if (lose) { lose = false; throw new BotError('HOST_TIMEOUT', '回执丢失'); } return result; };
  const draft = new BotDraftController(f.bot.mainChatId, api);
  try {
    await draft.start(); draft.edit({ text: '第一条请求' });
    await assert.rejects(draft.submit(f.bot.id, {}), /回执丢失/); assert.equal(draft.hasPendingSubmit, true);
    draft.edit({ text: '下一条仍在输入' }); await draft.flush(); assert.equal(f.store.draft(f.bot.mainChatId).text, '');
    await draft.submit(f.bot.id, {}); assert.equal(f.store.tasks().length, 1); assert.equal(draft.value.text, '下一条仍在输入'); assert.equal(f.store.draft(f.bot.mainChatId).text, '下一条仍在输入');
    assert.equal(draft.hasPendingSubmit, false);
  } finally { await draft.stop(); await f.close(); }
});

test('an incompatible send receipt preserves both local input and the original request id', async () => {
  const f = fixture(), api = f.bridge('main'), submit = api.submit; let malformed = true;
  api.submit = async input => { const result = await submit(input); if (malformed) { malformed = false; return { ...result, draft: { draft: result.draft, owner: null } } as any; } return result; };
  const draft = new BotDraftController(f.bot.mainChatId, api);
  try {
    await draft.start(); draft.edit({ text: '格式异常也不重复发送' });
    await assert.rejects(draft.submit(f.bot.id, {}), /草稿格式不兼容/);
    assert.equal(draft.hasPendingSubmit, true); assert.equal(draft.value.text, '格式异常也不重复发送');
    await draft.submit(f.bot.id, {}); assert.equal(f.store.tasks().length, 1); assert.equal(draft.value.text, '');
  } finally { await draft.stop(); await f.close(); }
});

test('a late send receipt never clears typing that happened after the request snapshot', async () => {
  const f = fixture(), api = f.bridge('main'), original = api.submit; let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  api.submit = async input => { const accepted = await original(input); await gate; return accepted; };
  const draft = new BotDraftController(f.bot.mainChatId, api);
  try {
    await draft.start(); draft.edit({ text: '发送旧内容' }); const sent = draft.submit(f.bot.id, {}); await delay();
    draft.edit({ text: '新内容' }); release(); await sent;
    assert.equal(draft.value.text, '新内容'); assert.equal(f.store.draft(f.bot.mainChatId).text, '新内容'); assert.equal(f.store.tasks()[0].input, '发送旧内容');
  } finally { release(); await draft.stop(); await f.close(); }
});

test('save failures preserve input and never enqueue a task or clear the stored draft', async () => {
  const f = fixture(), api = f.bridge('main'); api.saveDraft = async () => { throw new Error('磁盘写入失败'); };
  const draft = new BotDraftController(f.bot.mainChatId, api);
  try { await draft.start(); draft.edit({ text: '尚未保存的重要输入' }); await assert.rejects(draft.submit(f.bot.id, {}), /磁盘/); assert.equal(draft.value.text, '尚未保存的重要输入'); assert.equal(f.store.tasks().length, 0); assert.equal(draft.hasUnsavedInput, true); }
  finally { await draft.stop(); await f.close(); }
});

test('rapid mount/unmount/remount and layout switches retain this window draft', async () => {
  const f = fixture(), draft = new BotDraftController(f.bot.mainChatId, f.bridge('main'));
  let off = draft.attach(() => {}); off(); off = draft.attach(() => {});
  try { await delay(30); assert.ok(draft.ready); draft.edit({ text: '切换模式不换草稿' }); off(); await delay(30); off = draft.attach(() => {}); await delay(30); assert.equal(draft.value.text, '切换模式不换草稿'); assert.ok(draft.ready); }
  finally { off(); await delay(20); await draft.stop(); await f.close(); }
});

test('sending from island clears only its own draft and both entries use the same chat', async () => {
  const f = fixture(), main = new BotDraftController(f.bot.mainChatId, f.bridge('main')), island = new BotDraftController(f.bot.mainChatId, f.bridge('island'));
  try {
    await main.start(); await island.start();
    main.edit({ text: '主窗口尚未发送' }); island.edit({ text: '灵动岛发起的请求' }); await main.flush(); await island.submit(f.bot.id, {});
    assert.equal(main.value.text, '主窗口尚未发送'); assert.equal(f.store.draft(f.bot.mainChatId).text, main.value.text);
    assert.equal(island.value.text, ''); assert.equal(f.store.draft(f.bot.mainChatId, 'island').text, '');
    assert.equal(f.store.tasks().length, 1); assert.equal(f.store.tasks()[0].chatId, f.bot.mainChatId);
    assert.equal(f.store.ai.chat(f.bot.mainChatId).entries.filter(entry => entry.role === 'user')[0].content, '灵动岛发起的请求');
    await main.stop(); const restored = new BotDraftController(f.bot.mainChatId, f.bridge('main')); await restored.start();
    assert.equal(restored.value.text, '主窗口尚未发送'); await restored.stop();
  } finally { await main.stop(); await island.stop(); await f.close(); }
});

test('failed initial connection never locks local typing and retry saves without replacing it', async () => {
  const f = fixture(), api = f.bridge('main'), read = api.getDraft; let offline = true;
  api.getDraft = async chat => { if (offline) throw new BotError('HOST_UNAVAILABLE', '后台暂时不可用'); return read(chat); };
  const draft = new BotDraftController(f.bot.mainChatId, api);
  try {
    await draft.start(); draft.edit({ text: '离线时仍可输入' }); assert.equal(draft.value.text, '离线时仍可输入');
    offline = false; await draft.retrySave();
    assert.equal(f.store.draft(f.bot.mainChatId).text, '离线时仍可输入'); assert.equal(draft.error, '');
    f.host.changed({ kind: 'host' }); await delay(); assert.equal(draft.value.text, '离线时仍可输入');
  } finally { await draft.stop(); await f.close(); }
});

test('rapid duplicate send while saving creates one task', async () => {
  const f = fixture(), api = f.bridge('main'), save = api.saveDraft; let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  api.saveDraft = async (...args) => { await gate; return save(...args); };
  const draft = new BotDraftController(f.bot.mainChatId, api);
  try {
    await draft.start(); draft.edit({ text: '只发送一次' });
    const first = draft.submit(f.bot.id, {}), second = draft.submit(f.bot.id, {}); release(); await Promise.all([first, second]);
    assert.equal(f.store.tasks().length, 1);
  } finally { release(); await draft.stop(); await f.close(); }
});

test('typing during the initial save sends the saved snapshot and preserves newer text', async () => {
  const f = fixture(), api = f.bridge('main'), save = api.saveDraft; let release!: () => void, saving!: () => void;
  const started = new Promise<void>(resolve => { saving = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
  api.saveDraft = async (...args) => { saving(); await gate; return save(...args); };
  const draft = new BotDraftController(f.bot.mainChatId, api);
  try {
    await draft.start(); draft.edit({ text: '点击发送的内容' }); const sent = draft.submit(f.bot.id, {}); await started;
    draft.edit({ text: '保存期间继续输入的内容' }); release(); await sent;
    assert.equal(f.store.tasks()[0].input, '点击发送的内容'); assert.equal(draft.value.text, '保存期间继续输入的内容');
    assert.equal(f.store.draft(f.bot.mainChatId).text, draft.value.text);
  } finally { release(); await draft.stop(); await f.close(); }
});
