import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { botAvatarCharacters, botAvatarChoice, botAvatarColors, botAvatarGraphics, botAvatarRecommendations, isBotAvatar, normalizeBotAvatar } from '../shared/bot-avatar';
import { botSeeds, type BotProfile } from '../shared/bot-contracts';
import { characterArt, graphicArt, graphicPlate } from '../src/views/bot-avatar-art';
import { AiStore } from '../electron/ai-store';
import { BotStore } from '../electron/bot-store';
import { BotHost } from '../electron/bot-host';
import { botService } from '../electron/bot-service';

test('all 240 independent avatar and color choices validate; malformed values fall back safely', () => {
  assert.equal(botAvatarCharacters.length, 12); assert.equal(botAvatarGraphics.length, 12); assert.equal(botAvatarColors.length, 10);
  const values = [...botAvatarCharacters, ...botAvatarGraphics].flatMap(figure => botAvatarColors.map(color => `${figure.id}:${color.id}`));
  assert.equal(new Set(values).size, 240);
  for (const value of values) { assert.ok(isBotAvatar(value), value); assert.equal(normalizeBotAvatar(value), value); }
  for (const value of [undefined, null, 42, '', '__proto__', 'constructor', 'orb:unknown', 'unknown:blue', 'orb:blue:extra', 'orb', ' orb:blue']) {
    assert.equal(isBotAvatar(value), false); assert.equal(normalizeBotAvatar(value), 'orb:blue');
  }
  assert.deepEqual(botAvatarChoice('waves:graphite'), { figure: 'waves', color: 'graphite', kind: 'graphic' });
  assert.deepEqual(botAvatarChoice('bear:coral'), { figure: 'bear', color: 'coral', kind: 'character' });
});

test('legacy values follow the approved mapping independently of Bot identity', () => {
  const expected = { blue: 'ring:blue', violet: 'square:violet', sky: 'drop:graphite', green: 'ghost:green', orange: 'sail:orange', purple: 'hex:pink', teal: 'flower:mint' };
  for (const [old, current] of Object.entries(expected)) { assert.ok(isBotAvatar(old)); assert.equal(normalizeBotAvatar(old), current); }
  assert.deepEqual(botSeeds.filter(bot => bot.seedKey !== 'reading').map(bot => bot.avatar), Object.values(expected));
  assert.equal(botSeeds.find(bot => bot.seedKey === 'reading')!.avatar, 'orb:cyan');
  for (const bot of botSeeds) {
    assert.equal(botAvatarRecommendations[bot.seedKey].character, botAvatarChoice(bot.avatar).figure);
    assert.equal(botAvatarChoice(`${botAvatarRecommendations[bot.seedKey].graphic}:blue`).kind, 'graphic');
  }
});

test('vector geometry matches the approved design source', () => {
  const source = readFileSync('docs/requirements/shared/ai-assistant/design/bot-avatar-system-2026-11-16.md', 'utf8');
  const [characters, graphics] = [...source.matchAll(/```json\r?\n([\s\S]*?)```/g)].map(match => JSON.parse(match[1]));
  assert.deepEqual(characterArt, characters.shapes); assert.deepEqual(graphicArt, graphics.marks); assert.equal(graphicPlate, graphics.plate.d);
  assert.deepEqual(characterArt.map(shape => shape.id), botAvatarCharacters.map(shape => shape.id));
  assert.deepEqual(graphicArt.map(shape => shape.id), botAvatarGraphics.map(shape => shape.id));
});

test('legacy profile reads preserve stored data; profile saves validate and persist canonical avatars', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ono-bot-avatar-')), ai = new AiStore(dir, { recover: false }), store = new BotStore(ai, dir);
  const host = new BotHost(store, { run: async () => ({ reply: '已处理' }), apply: async () => ({ saved: true }) });
  try {
    const bot = store.cards()[0], original = { ...store.profile(bot.id), avatar: 'sky', name: '我的总管', instructions: '保留我的工作说明' };
    ai.db.prepare('UPDATE bots SET payload=? WHERE id=?').run(JSON.stringify(original), bot.id);
    assert.equal(store.profile(bot.id).avatar, 'drop:graphite');
    assert.equal(store.cards().find(item => item.id === bot.id)!.avatar, 'drop:graphite');
    assert.deepEqual(store.get<BotProfile>('bots', bot.id), original);
    const patch = { name: original.name, description: original.description, instructions: original.instructions, avatar: 'moon:pink' };
    const surface = { id: 'main:avatar-test', kind: 'main' };
    assert.throws(() => botService(host, 'updateProfile', [bot.id, original.revision, { ...patch, avatar: 'moon:invalid' }], surface), /有效的头像和颜色/);
    assert.deepEqual(store.get<BotProfile>('bots', bot.id), original);
    const saved = botService(host, 'updateProfile', [bot.id, original.revision, patch], surface) as BotProfile;
    assert.equal(saved.avatar, 'moon:pink'); assert.equal(saved.revision, original.revision + 1);
    assert.equal(saved.name, original.name); assert.equal(saved.instructions, original.instructions); assert.equal(saved.mainChatId, original.mainChatId);
    assert.equal(store.get<BotProfile>('bots', bot.id).avatar, 'moon:pink');
    assert.throws(() => botService(host, 'updateProfile', [bot.id, original.revision, patch], surface), /其他窗口|版本|更新/);
    const legacy = botService(host, 'updateProfile', [bot.id, saved.revision, { ...patch, avatar: 'teal' }], surface) as BotProfile;
    assert.equal(legacy.avatar, 'flower:mint');
    assert.throws(() => botService(host, 'updateProfile', [bot.id, legacy.revision, { ...patch, name: '   ' }], surface));
    assert.equal(store.profile(bot.id).revision, legacy.revision);
    const withoutDescription = botService(host, 'updateProfile', [bot.id, legacy.revision, { ...patch, avatar: legacy.avatar, description: '   ' }], surface) as BotProfile;
    assert.equal(withoutDescription.description, '');
    assert.equal(store.profile(bot.id).description, '');
    assert.equal(withoutDescription.name, original.name);
  } finally {
    await host.stop(); ai.close(); assert.equal(dirname(resolve(dir)), resolve(tmpdir())); assert.ok(dir.includes('ono-bot-avatar-')); rmSync(dir, { recursive: true, force: true });
  }
});
