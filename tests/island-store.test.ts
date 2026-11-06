import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { IslandStore } from '../electron/island-store';
import { initialIslandData, inTimeRange, islandBounds, islandPage, islandPages, nextWater, focusRemaining } from '../shared/island-contracts';
import { codexQuotaWindows, zcodeQuotaWindows, quotaSummary, quotaDisplayWindows } from '../shared/island-quota';

function fixture(t: Parameters<Parameters<typeof test>[1]>[0]) {
  const dir = mkdtempSync(join(tmpdir(), 'ono-island-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  let now = new Date('2026-11-04T10:00:00').getTime();
  return { dir, store: new IslandStore(dir, () => now), advance: (ms: number) => { now += ms; }, now: () => now };
}

test('island: opt-in defaults and partial page settings survive restart', t => {
  const { dir, store } = fixture(t);
  assert.equal(store.read().settings.enabled, false); assert.equal(store.read().settings.waterEnabled, false);
  store.patch({ pages: { quota: false }, topOffset: 30 });
  const loaded = new IslandStore(dir).read();
  assert.equal(loaded.settings.pages.quota, false); assert.equal(loaded.settings.pages.schedule, true); assert.equal(loaded.settings.topOffset, 30);
  assert.throws(() => store.patch({ topOffset: -1 })); assert.equal(store.read().settings.topOffset, 30);
});

test('island shelf: legacy file records load with an empty notes area and draft', t => {
  const { dir, store, now } = fixture(t), file = join(dir, 'existing.lnk'); writeFileSync(file, 'shortcut');
  store.addFiles([file]); store.patch({ lastPage: 'files' });
  const { notes, noteDraft, ...legacy } = store.read();
  writeFileSync(join(dir, 'desktop-island.json'), JSON.stringify(legacy));
  const loaded = new IslandStore(dir, now);
  assert.equal(loaded.loadError, ''); assert.deepEqual(loaded.read().notes, []);
  assert.deepEqual(loaded.read().noteDraft, { text: '', noteId: null });
  assert.deepEqual(loaded.read().files, legacy.files); assert.deepEqual(loaded.read().settings, legacy.settings);
});

test('island shelf: notes preserve exact text and edits update the same record across restart', t => {
  const { dir, store, advance, now } = fixture(t), text = '  第一行\n第二行 😀\n';
  store.saveNote(text); const first = store.read().notes[0];
  assert.equal(first.text, text);
  store.setNoteDraft({ text: '修改后的文字\n保留换行', noteId: first.id }); advance(1000);
  store.saveNote('修改后的文字\n保留换行', first.id);
  const saved = new IslandStore(dir, now).read();
  assert.equal(saved.notes.length, 1); assert.equal(saved.notes[0].id, first.id);
  assert.equal(saved.notes[0].createdAt, first.createdAt); assert.ok(saved.notes[0].updatedAt > first.updatedAt);
  assert.equal(saved.notes[0].text, '修改后的文字\n保留换行'); assert.deepEqual(saved.noteDraft, { text: '', noteId: null });
});

test('island shelf: drafts survive file clearing and deletion only clears the matching edit draft', t => {
  const { dir, store, now } = fixture(t); store.saveNote('记录一'); const first = store.read().notes[0];
  store.saveNote('记录二'); const second = store.read().notes[0];
  const draft = { text: '尚未保存的修改', noteId: first.id };
  store.setNoteDraft(draft); store.removeFiles(); store.removeNote(second.id);
  assert.deepEqual(new IslandStore(dir, now).read().noteDraft, draft); assert.equal(store.read().notes.length, 1);
  store.removeNote(first.id); assert.deepEqual(store.read().noteDraft, { text: '', noteId: null });
  store.setNoteDraft({ text: '新的独立草稿', noteId: null }); store.saveNote('其他记录'); const other = store.read().notes[0];
  store.setNoteDraft({ text: '新的独立草稿', noteId: null }); store.removeNote(other.id);
  assert.equal(store.read().noteDraft.text, '新的独立草稿');
});

test('island shelf: invalid or missing note writes leave saved content and drafts intact', t => {
  const { dir, store } = fixture(t); store.saveNote('有效记录'); store.setNoteDraft({ text: '保留草稿', noteId: null });
  const before = store.read(), file = readFileSync(join(dir, 'desktop-island.json'), 'utf8');
  for (const action of [() => store.saveNote(' \n '), () => store.saveNote('x'.repeat(20001)), () => store.saveNote('修改', 'missing'), () => store.setNoteDraft({ text: '内容', noteId: 'missing' }), () => store.removeNote('missing')]) {
    assert.throws(action); assert.deepEqual(store.read(), before); assert.equal(readFileSync(join(dir, 'desktop-island.json'), 'utf8'), file);
  }
  mkdirSync(join(dir, 'desktop-island.json.tmp')); assert.throws(() => store.saveNote('写入失败'));
  assert.deepEqual(store.read(), before); assert.equal(readFileSync(join(dir, 'desktop-island.json'), 'utf8'), file);
});

test('island shelf: a full notes collection rejects new entries without dropping old ones', t => {
  const { dir, now } = fixture(t), saved = initialIslandData(now());
  saved.notes = Array.from({ length: 200 }, (_, i) => ({ id: `note-${i}`, text: `记录 ${i}`, createdAt: now(), updatedAt: now() }));
  writeFileSync(join(dir, 'desktop-island.json'), JSON.stringify(saved)); const store = new IslandStore(dir, now);
  assert.throws(() => store.saveNote('第 201 条'), /200/); assert.equal(store.read().notes.length, 200);
  store.saveNote('仍可编辑现有记录', 'note-0'); assert.equal(store.read().notes.length, 200); assert.equal(store.read().notes[0].text, '仍可编辑现有记录');
});
test('island: dock defaults to top, persists side selection and rejects unsupported positions', t => {
  const { dir, store, now } = fixture(t);
  assert.equal(store.read().settings.dock, 'top');
  for (const dock of ['left', 'right', 'top'] as const) {
    store.patch({ dock });
    assert.equal(new IslandStore(dir).read().settings.dock, dock);
  }
  assert.throws(() => store.patch({ dock: 'bottom' as any }));
  const { dock, ...legacySettings } = store.read().settings;
  writeFileSync(join(dir, 'desktop-island.json'), JSON.stringify({ ...store.read(), settings: legacySettings }));
  assert.equal(new IslandStore(dir, now).read().settings.dock, 'top');
});

test('island: side docks stay on their edge and vertically centered across modes and displays', () => {
  const area = { x: -1920, y: 40, width: 1920, height: 1040 };
  assert.deepEqual(islandBounds('collapsed', area, 0, 'left'), { x: -1920, y: 380, width: 64, height: 360 });
  assert.deepEqual(islandBounds('expanded', area, 20, 'right'), { x: -340, y: 280, width: 320, height: 560 });
  for (const dock of ['top', 'left', 'right'] as const) for (const mode of ['collapsed', 'expanded', 'reminder'] as const) {
    for (const workArea of [area, { x: 50, y: -250, width: 300, height: 200 }]) {
      const b = islandBounds(mode, workArea, 300, dock);
      assert.ok(b.x >= workArea.x && b.x + b.width <= workArea.x + workArea.width);
      assert.ok(b.y >= workArea.y && b.y + b.height <= workArea.y + workArea.height);
      if (dock !== 'top') assert.ok(Math.abs(b.y + b.height / 2 - (workArea.y + workArea.height / 2)) <= .5);
      const frame = islandBounds('expanded', workArea, 300, dock);
      assert.ok(b.x >= frame.x && b.x + b.width <= frame.x + frame.width);
      assert.ok(b.y >= frame.y && b.y + b.height <= frame.y + frame.height);
      if (dock === 'top') assert.equal(b.y, frame.y);
      else assert.equal(dock === 'left' ? b.x : b.x + b.width, dock === 'left' ? frame.x : frame.x + frame.width);
    }
  }
});

test('island: legacy schedule and todo pages merge without losing other saved state', t => {
  const { dir, now } = fixture(t), path = join(dir, 'desktop-island.json');
  for (const [schedule, todo] of [[false, true], [true, false], [false, false], [true, true]]) {
    const saved = initialIslandData(now());
    const legacy = { ...saved, settings: { ...saved.settings, pages: { ...saved.settings.pages, schedule, todo, files: false }, lastPage: 'todo', topOffset: 25 } };
    writeFileSync(path, JSON.stringify(legacy));
    const loaded = new IslandStore(dir, now);
    assert.equal(loaded.loadError, '');
    assert.equal(loaded.read().settings.lastPage, 'schedule');
    assert.equal(loaded.read().settings.pages.schedule, schedule || todo);
    assert.equal(loaded.read().settings.pages.files, false);
    assert.equal(loaded.read().settings.topOffset, 25);
    assert.deepEqual(loaded.read().water, saved.water);
    loaded.patch({ pages: { schedule: false } });
    assert.equal(new IslandStore(dir, now).read().settings.pages.schedule, false);
    assert.equal('todo' in JSON.parse(readFileSync(path, 'utf8')).settings.pages, false);
  }
});
test('island: disabled tools and all-disabled pages have a recoverable settings state', () => {
  const s = initialIslandData().settings;
  Object.assign(s, { lastPage: 'tools', focusEnabled: false, waterEnabled: false, mascotEnabled: false });
  assert.equal(islandPages(s).includes('tools'), false); assert.equal(islandPage(s), 'schedule');
  for (const page of islandPages(s)) s.pages[page] = false;
  assert.equal(islandPage(s), null);
});
test('island: centered geometry stays inside non-primary work areas and short screens', () => {
  const area = { x: -1920, y: 40, width: 1920, height: 1040 };
  assert.deepEqual(islandBounds('expanded', area, 0), { x: -1250, y: 40, width: 580, height: 270 });
  for (const mode of ['collapsed', 'expanded', 'reminder'] as const) {
    const small = { x: 100, y: 80, width: 340, height: 240 }, b = islandBounds(mode, small, 300);
    assert.ok(b.x >= small.x && b.x + b.width <= small.x + small.width);
    assert.ok(b.y >= small.y && b.y + b.height <= small.y + small.height);
  }
});
test('island: focus pauses without drift, restores from deadlines, finishes once without changing a task', t => {
  const { dir, store, advance, now } = fixture(t);
  store.focus('start', 25, 'task-reference'); advance(120000);
  assert.equal(focusRemaining(store.read().focus, now()), 23 * 60000);
  store.focus('pause'); advance(300000); assert.equal(focusRemaining(store.read().focus, now()), 23 * 60000);
  store.focus('resume'); advance(24 * 60000);
  const reloaded = new IslandStore(dir, now); assert.equal(reloaded.tick()[0].kind, 'focus'); assert.equal(reloaded.tick().length, 0); assert.equal(reloaded.read().focus, null);
  assert.equal(new IslandStore(dir, now).read().reminders[0].kind, 'focus');
});
test('island: disabling focus pauses it and rejects hidden starts', t => {
  const { store, advance } = fixture(t);
  store.focus('start', 10); advance(60000); store.patch({ focusEnabled: false });
  assert.equal(store.read().focus?.remainingMs, 9 * 60000); assert.equal(store.read().focus?.endsAt, null);
  assert.throws(() => store.focus('start', 20));
});
test('island: water uses active hours, merges sleep, counts only explicit drink, and can stop today', t => {
  const { store, advance } = fixture(t);
  store.patch({ waterEnabled: true }); advance(4 * 3600000);
  assert.equal(store.tick().length, 1); assert.equal(store.tick().length, 0); assert.equal(store.read().water.count, 0);
  store.water('drink'); assert.equal(store.read().water.count, 1);
  store.water('snooze'); assert.equal(store.read().water.count, 1);
  store.water('pause'); advance(600000); assert.equal(store.tick().length, 0);
  store.patch({ waterEnabled: false }); advance(3600000); assert.equal(store.tick().length, 0); assert.equal(store.read().water.nextAt, null);
});
test('island: quiet hours include overnight and water scheduling skips inactive hours', () => {
  assert.equal(inTimeRange(new Date('2026-11-04T23:00:00'), '22:00', '08:00'), true);
  assert.equal(inTimeRange(new Date('2026-11-04T12:00:00'), '22:00', '08:00'), false);
  const s = initialIslandData().settings;
  assert.equal(new Date(nextWater(s, new Date('2026-11-04T17:45:00').getTime())).getHours(), 9);
  assert.equal(new Date(nextWater(s, new Date('2026-11-04T17:45:00').getTime())).getDate(), 5);
});
test('island: file shelf deduplicates references, detects missing files and clears without deletion', t => {
  const { dir, store } = fixture(t), path = join(dir, 'sample.txt'), folder = join(dir, 'folder');
  writeFileSync(path, 'original'); mkdirSync(folder);
  store.addFiles([path, path, folder]); assert.equal(store.files().length, 2);
  const file = store.files().find(f => !f.directory)!;
  assert.equal(file.size, 8); assert.equal(store.files().find(f => f.directory)?.size, undefined);
  writeFileSync(path, 'updated file'); assert.equal(store.files().find(f => f.id === file.id)?.size, 12);
  assert.equal(store.read().files.find(f => f.id === file.id)?.size, undefined);
  const replacement = join(dir, 'replacement.txt'); writeFileSync(replacement, 'replacement');
  store.relocate(file.id, replacement); rmSync(replacement);
  assert.equal(store.files().find(f => f.id === file.id)?.missing, true);
  store.removeFiles(); assert.ok(existsSync(path)); assert.ok(existsSync(folder));
  assert.throws(() => store.addFiles(['relative.txt']));
});
test('island: reminder priorities and ids avoid duplicates and retain unhandled entries', t => {
  const { store, now } = fixture(t);
  const water = { id: 'water', kind: 'water' as const, title: '喝水', createdAt: now() };
  store.enqueue([water]); store.enqueue([water, { id: 'task', kind: 'task', title: '待办', createdAt: now() }]);
  assert.deepEqual(store.read().reminders.map(r => r.id), ['task', 'water']);
  store.dismiss('task'); assert.equal(store.read().reminders[0].id, 'water');
});
test('island: invalid saved state does not get silently overwritten', t => {
  const { dir } = fixture(t); writeFileSync(join(dir, 'desktop-island.json'), 'broken');
  const damaged = new IslandStore(dir); assert.match(damaged.loadError, /无法读取/);
  assert.throws(() => damaged.patch({ enabled: true }), /无法读取/);
  assert.deepEqual(damaged.tick(), []); assert.equal(readFileSync(join(dir, 'desktop-island.json'), 'utf8'), 'broken');
});

test('island: quota notification claims survive restart and reset independently by account and period', t => {
  const { dir, store } = fixture(t);
  assert.equal(store.claimQuota('codex:account1:week:100'), true);
  const loaded = new IslandStore(dir);
  assert.equal(loaded.claimQuota('codex:account1:week:100'), false);
  assert.equal(loaded.claimQuota('codex:account1:week:200'), true);
  assert.equal(loaded.claimQuota('codex:account2:week:100'), true);
});
test('island: quotas preserve real periods, distinguish used from remaining and do not invent missing data', () => {
  const windows = codexQuotaWindows({ rateLimitsByLimitId: { codex: { primary: { usedPercent: 28, windowDurationMins: 300, resetsAt: 1793780000 }, secondary: { usedPercent: 56, windowDurationMins: 10080, resetsAt: null } } } });
  assert.equal(quotaSummary(windows), '44% · 周'); assert.equal(windows[0].remaining, 72); assert.equal(windows[0].resetsAt, 1793780000000);
  assert.deepEqual(codexQuotaWindows({ rateLimits: { primary: { usedPercent: null } } }), []);
  const z = zcodeQuotaWindows({ data: { limits: [{ type: 'TOKENS_LIMIT', percentage: 37 }, { name: '周', windowDurationMins: 10080, percentage: 19 }] } });
  assert.equal(z[0].label, 'Token 配额'); assert.equal(z[0].remaining, 63); assert.equal(z[1].label, '周');
  assert.deepEqual(zcodeQuotaWindows({ success: false }), []);
});
test('island: Z Code credit quotas use API hours and weeks instead of duplicate service labels', () => {
  assert.deepEqual(zcodeQuotaWindows({ data: { limits: [
    { type: 'CREDIT_LIMIT', unit: 3, number: 5, percentage: 28, nextResetTime: 1794000000000 },
    { type: 'CREDIT_LIMIT', unit: 6, number: 1, percentage: 56, nextResetTime: 1794400000000 },
    { type: 'CREDIT_LIMIT', unit: 99, number: 1, percentage: 10 },
    { type: 'TOKENS_LIMIT', unit: 3, number: 0, percentage: 10 },
  ] } }), [
    { label: '5h', remaining: 72, resetsAt: 1794000000000 },
    { label: '周', remaining: 44, resetsAt: 1794400000000 },
    { label: '积分配额', remaining: 90, resetsAt: null },
    { label: 'Token 配额', remaining: 90, resetsAt: null },
  ]);
});

test('island: quota rings keep 5h outside week and preserve unknown windows without changing source data', () => {
  const windows = [{ label: '服务配额', remaining: 100, resetsAt: null }, { label: '周', remaining: 0, resetsAt: 1793780000000 }, { label: '5h', remaining: 72, resetsAt: null }];
  assert.deepEqual(quotaDisplayWindows(windows), [windows[2], windows[1], windows[0]]);
  assert.deepEqual(windows.map(w => w.label), ['服务配额', '周', '5h']);
  assert.deepEqual(quotaDisplayWindows([windows[0]]), [windows[0]]);
  assert.deepEqual(quotaDisplayWindows([]), []);
});
