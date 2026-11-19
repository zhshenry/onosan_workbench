import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AiStore } from '../electron/ai-store';
import { BotStore, legacyBotOwner } from '../electron/bot-store';
import { NAV, navigationView, ownerOfWorkbench, resolveView } from '../src/nav';
import { sameAiWorkbench, workbenchForScope } from '../shared/ai-scope';
import type { BotProfile } from '../shared/bot-contracts';

test('bazi and reading have independent workspaces; checkin belongs to the coordinator and settings', () => {
  assert.equal(NAV.some(item => item.id === 'life'), false);
  assert.equal(ownerOfWorkbench('bazi'), 'bazi'); assert.equal(ownerOfWorkbench('reading'), 'reading'); assert.equal(ownerOfWorkbench('checkin'), 'home');
  assert.deepEqual(NAV.find(item => item.id === 'settings')!.subs.filter(item => ['settings-apps', 'settings-agent-quota', 'settings-checkin'].includes(item.view!)).map(item => item.label), ['Agent连接']);
  assert.equal(resolveView('settings-checkin'), 'settings-checkin');
  assert.equal(navigationView('settings-checkin'), 'settings-apps');
  assert.equal(navigationView('settings-agent-quota'), 'settings-apps');
  assert.equal(ownerOfWorkbench('settings-checkin'), 'settings');
  assert.equal(workbenchForScope({ module: 'bazi', profileId: 'chart' }), 'bazi'); assert.equal(workbenchForScope({ module: 'reading', profileId: 'book' }), 'reading');
  assert.equal(sameAiWorkbench({ module: 'bazi', profileId: 'chart' }, { module: 'reading', profileId: 'book' }), false);
  assert.equal(workbenchForScope({ module: 'workbench', viewId: 'workspace:life' }), 'bazi');
  assert.equal(legacyBotOwner({ module: 'reading', profileId: 'book' }).key, 'reading');
});

test('splitting the old utility workspace preserves identity, customized profile, messages, drafts and pending work', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ono-workspace-split-')); let ai = new AiStore(dir, { recover: false });
  try {
    const original = new BotStore(ai, dir), utility = original.cards().find(bot => bot.seedKey === 'utilities')!, removed = original.cards().find(bot => bot.seedKey === 'reading')!;
    ai.db.prepare('DELETE FROM bot_drafts WHERE chat_id=?').run(removed.mainChatId); ai.db.prepare('DELETE FROM bot_chat_links WHERE bot_id=?').run(removed.id);
    ai.db.prepare('DELETE FROM bots WHERE id=?').run(removed.id); ai.db.prepare('DELETE FROM chats WHERE id=?').run(removed.mainChatId);
    const profile = { ...original.profile(utility.id), workspaceId: 'life', name: '我的助理', description: '自定义职责', instructions: '保留我的工作说明', avatar: 'teal', revision: 8 };
    ai.db.prepare('UPDATE bots SET workspace_id=?,payload=? WHERE id=?').run('life', JSON.stringify(profile), utility.id);
    const chat = ai.chat(utility.mainChatId); chat.entries.push({ id: randomUUID(), role: 'user', content: '这条原来的命理与阅读共用对话需要保留' }); ai.saveChat(chat);
    original.saveDraft(chat.id, 0, { text: '保留排队中的工作', replyToTaskId: null, resources: [] });
    const receipt = original.submit({ botId: utility.id, chatId: chat.id, expectedDraftRevision: 1, clientRequestId: randomUUID(), text: '保留排队中的工作', replyToTaskId: null, resources: [] }, () => {});
    original.saveDraft(chat.id, receipt.draft.revision, { text: '排队后仍未发送的内容', replyToTaskId: null, resources: [] });
    const memory = original.saveMemory({ id: randomUUID(), botId: utility.id, scope: 'private', text: '保留偏好', source: '用户编辑', revision: 0 });
    const book = ai.newChat({ module: 'reading', profileId: 'existing-book' }); book.entries.push({ id: randomUUID(), role: 'assistant', content: '旧读书笔记' }); ai.saveChat(book);
    ai.db.prepare("INSERT INTO bot_chat_links(chat_id,bot_id,role) VALUES(?,?,'history')").run(book.id, utility.id);
    const beforeChat = ai.chat(chat.id), beforeDraft = original.draft(chat.id), beforeTask = original.task(receipt.task.id);
    ai.close(); ai = new AiStore(dir, { recover: false }); const migrated = new BotStore(ai, dir);
    const next = migrated.profile(utility.id), reader = migrated.cards().find(bot => bot.seedKey === 'reading')!;
    assert.equal(migrated.cards().length, 8); assert.equal(next.workspaceId, 'bazi'); assert.equal(next.mainChatId, utility.mainChatId);
    assert.equal(next.name, profile.name); assert.equal(next.description, profile.description); assert.equal(next.instructions, profile.instructions); assert.equal(next.avatar, 'flower:mint');
    assert.deepEqual(ai.chat(chat.id), beforeChat); assert.deepEqual(migrated.draft(chat.id), beforeDraft); assert.deepEqual(migrated.task(receipt.task.id), beforeTask); assert.deepEqual(migrated.memories(utility.id), [memory]);
    assert.notEqual(reader.mainChatId, next.mainChatId); assert.equal(migrated.link(book.id)!.bot_id, reader.id); assert.equal(ai.chat(book.id).entries[0].content, '旧读书笔记');
    assert.ok(!migrated.capabilities('utilities').includes('阅读分析')); assert.ok(!migrated.capabilities('reading').includes('命例解读'));
    const ids = migrated.cards().map(bot => bot.id), backups = readdirSync(dir).filter(name => name.startsWith('chats-before-workspace-split'));
    assert.equal(backups.length, 1); assert.deepEqual(new BotStore(ai, dir).cards().map(bot => bot.id), ids); assert.equal(readdirSync(dir).filter(name => name.startsWith('chats-before-workspace-split')).length, 1);
    assert.equal(migrated.get<BotProfile>('bots', utility.id).avatar, 'teal', 'workspace migration does not rewrite saved avatar values');
  } finally { ai.close(); assert.equal(dirname(resolve(dir)), resolve(tmpdir())); assert.ok(dir.includes('ono-workspace-split-')); rmSync(dir, { recursive: true, force: true }); }
});
