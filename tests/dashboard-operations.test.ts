import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DashboardStore } from '../electron/dashboard-store';
import { dashboardTools } from '../electron/dashboard-tools';
import { BotHost } from '../electron/bot-host';
import { BotStore } from '../electron/bot-store';
import { AiStore } from '../electron/ai-store';
import { dashboardPlacements, defaultWidget, type DashboardLayout, type WidgetId, WIDGET_IDS } from '../shared/dashboard-layout';
import { DASHBOARD_GRID, DashboardError, dashboardDropPlacement, dashboardTitles, placeDashboardWidget } from '../shared/dashboard-operations';
import type { BotTask } from '../shared/bot-contracts';

const hasQuotaRings = (WIDGET_IDS as readonly string[]).includes('schedule-stats');
const card: WidgetId = hasQuotaRings ? 'quota' : 'today';
const newStyle = hasQuotaRings ? 'rings' : 'counts';
const directory = () => mkdtempSync(join(tmpdir(), 'dashboard-native-'));
const save = (store: DashboardStore, layout: DashboardLayout, expectedRevision: number, movedIds: WidgetId[] = []) =>
  store.save({ operationId: randomUUID(), layout, expectedRevision, movedIds });

function placed(layout: DashboardLayout, id: WidgetId, column: number, top: number): DashboardLayout {
  const { columns, step, base, gap } = DASHBOARD_GRID;
  const occupied = dashboardPlacements(layout.widgets, columns, step, base, gap);
  return placeDashboardWidget(layout, layout.widgets.find(widget => widget.id === id)!,
    dashboardDropPlacement(id, column, top * step, occupied, DASHBOARD_GRID), occupied, DASHBOARD_GRID);
}

test('imports the old saved positions, size and legacy fields once, and retains an explicitly empty layout', () => {
  const dir = directory(), main = new DashboardStore(dir), host = new DashboardStore(dir);
  try {
    assert.equal(host.read(), null);
    const widget = { ...defaultWidget('quota'), position: { column: 3, top: 7 }, singleColumnTop: 10 };
    const imported = main.initialize(JSON.stringify({ widgets: [widget, { id: 'retired', width: 3 }], shortcuts: [] }));
    assert.deepEqual(imported.layout.widgets, [widget]);
    assert.deepEqual(host.initialize(null), imported);
    const emptied = save(main, { widgets: [] }, imported.revision);
    assert.deepEqual(emptied.snapshot.layout.widgets, []);
    const reopened = new DashboardStore(dir);
    try { assert.deepEqual(reopened.initialize(JSON.stringify({ widgets: [widget] })), host.read()); }
    finally { reopened.close(); }
  } finally { host.close(); main.close(); }
  const empty = new DashboardStore(directory());
  try { assert.deepEqual(empty.initialize('{"widgets":[]}').layout, { widgets: [] }); }
  finally { empty.close(); }
});

test('manual placement, Bot style, and manual resize share one versioned layout', () => {
  const dir = directory(), main = new DashboardStore(dir), host = new DashboardStore(dir);
  try {
    const start = main.initialize(null);
    const moved = save(main, placed(start.layout, card, 0, 10), start.revision, [card]);
    assert.deepEqual(moved.snapshot.lastUserMove, { revision: 2, widgetIds: [card] });
    const actual = moved.snapshot.layout.widgets.find(widget => widget.id === card)!;
    const styled = host.edit('bot-change', moved.snapshot.revision, { kind: 'style', id: 'last_moved', style: newStyle }, card);
    assert.deepEqual(styled.changed, [{ id: card, before: actual, after: { ...actual, style: newStyle } }]);
    assert.deepEqual(main.read()!.layout.widgets.find(widget => widget.id === card), { ...actual, style: newStyle });
    const resized = { widgets: styled.snapshot.layout.widgets.map(widget => widget.id === card ? { ...widget, rows: 3 as const } : widget) };
    const after = save(main, resized, styled.snapshot.revision);
    assert.equal(host.read()!.revision, after.snapshot.revision);
    assert.deepEqual(host.read()!.layout.widgets.find(widget => widget.id === card), { ...actual, style: newStyle, rows: 3 });
    assert.deepEqual(host.read()!.lastUserMove?.widgetIds, [card]);
  } finally { host.close(); main.close(); }
});

test('a stale save cannot overwrite a concurrent edit, and exact retries get back the original receipt', () => {
  const dir = directory(), main = new DashboardStore(dir), host = new DashboardStore(dir);
  try {
    const start = main.initialize(null);
    const draft = { operationId: randomUUID(), expectedRevision: start.revision, movedIds: [card], layout: placed(start.layout, card, 0, 10) };
    const committed = main.save(draft);
    const edited = host.edit('style', committed.snapshot.revision, { kind: 'style', id: card, style: newStyle }, card);
    assert.deepEqual(main.save(draft), committed);
    assert.deepEqual(host.edit('style', committed.snapshot.revision, { kind: 'style', id: card, style: newStyle }, card), edited);
    assert.throws(() => main.save({ ...draft, operationId: randomUUID() }), (error: unknown) => error instanceof DashboardError && error.code === 'VERSION_CONFLICT');
    assert.throws(() => main.save({ ...draft, movedIds: [] }), (error: unknown) => error instanceof DashboardError && error.code === 'REQUEST_ID_CONFLICT');
    assert.equal(main.read()!.revision, edited.snapshot.revision);
  } finally { host.close(); main.close(); }
});

test('validates available styles, fits placement and size, adds from the catalog and removes only the card', () => {
  const store = new DashboardStore(directory());
  try {
    const start = store.initialize('{"widgets":[]}');
    const edit = (kind: string, id: WidgetId, args = {}) =>
      store.edit(randomUUID(), store.read()!.revision, { kind, id, ...args }, id);
    const added = edit('add', 'quota');
    assert.equal(added.snapshot.revision, start.revision + 1);
    assert.throws(() => edit('add', 'quota'), /尚未添加/);
    assert.throws(() => edit('style', 'quota', { style: 'history' }), /不支持/);
    const shifted = edit('move', 'quota', { column: 5, top: 3 });
    assert.deepEqual(shifted.snapshot.layout.widgets[0].position, { column: 4, top: 3 });
    assert.throws(() => edit('resize', 'quota', { width: 4 }), /空间不足/);
    const resized = edit('resize', 'quota', { width: 4, rows: 3, edge: 'left' });
    assert.deepEqual(resized.snapshot.layout.widgets[0].position, { column: 2, top: 3 });
    assert.equal(resized.snapshot.layout.widgets[0].rows, 3);
    edit('add', 'today');
    const reordered = edit('reorder', 'today', { targetId: 'quota' });
    assert.deepEqual(reordered.snapshot.layout.widgets.map(widget => widget.id), ['today', 'quota']);
    const removed = edit('remove', 'quota');
    assert.deepEqual(removed.changed.map(change => change.id), ['quota']);
    assert.deepEqual(removed.snapshot.layout.widgets.map(widget => widget.id), ['today']);
  } finally { store.close(); }
});

test('asks which of multiple moved cards to change and binds the selected card to the existing work', async () => {
  const dir = directory(), ai = new AiStore(dir, { recover: false }), tasks = new BotStore(ai, dir);
  const store = new DashboardStore(dir);
  // The real Host handles questions; the fixture keeps the model idle.
  const host = new BotHost(tasks, { run: async () => new Promise(() => {}), apply: async () => null });
  host.suspend();
  try {
    const initial = store.initialize(null);
    const moved = save(store, placed(placed(initial.layout, card, 0, 10), card === 'quota' ? 'today' : 'quota', 0, 16), initial.revision, ['today','quota']);
    const bot = host.coordinator(), scope = { module: 'workbench' as const, viewId: 'home' };
    const text = '把刚挪的那张换个样式', draft = tasks.saveDraft(bot.mainChatId, 0, { text, resources: [], replyToTaskId: null });
    const { task } = tasks.submit({ botId: bot.id, chatId: bot.mainChatId, expectedDraftRevision: draft.revision, clientRequestId: randomUUID(), text,
      replyToTaskId: null, resources: [], pageContext: { scope } }, () => {}, 'main', undefined,
    () => ({ revision: moved.snapshot.revision, targetIds: moved.snapshot.lastUserMove!.widgetIds }));
    const [read] = dashboardTools(task, store, host, () => {});
    await read.execute('read-1', {} as never, undefined, undefined, undefined as never);
    const [question] = tasks.actions(task.id);
    assert.equal(question.kind, 'question');
    assert.deepEqual((question.payload.options as { label: string }[]).map(option => option.label), [dashboardTitles.today, dashboardTitles.quota]);
    await host.answerAction(question.id, question.revision, { approved: true, text: dashboardTitles[card] });
    let changes = 0;
    const [readAfterChoice, change] = dashboardTools(tasks.task(task.id), store, host, () => { changes++; });
    await readAfterChoice.execute('read-2', {} as never, undefined, undefined, undefined as never);
    await change.execute('edit-1', { expectedRevision: moved.snapshot.revision, action: { kind: 'style', id: 'last_moved', style: newStyle } } as never,
      undefined, undefined, undefined as never);
    assert.equal(changes, 1);
    assert.equal(store.read()!.layout.widgets.find(widget => widget.id === card)?.style, newStyle);
  } finally { await host.stop(); store.close(); ai.close(); }
});

test('an open draft or a removed and re-added card cannot serve as the captured move target', async () => {
  const store = new DashboardStore(directory());
  try {
    const start = store.initialize(null);
    const moved = save(store, placed(start.layout, card, 0, 10), start.revision, [card]);
    const host = {} as BotHost;
    async function mustReject(draftOpen: boolean, expected: RegExp) {
      const task = { id: randomUUID(), dashboardHandoff: { revision: moved.snapshot.revision, targetIds: [card], draftOpen } } as BotTask;
      const [read, edit] = dashboardTools(task, store, host, () => assert.fail('should not write'));
      await read.execute('read', {} as never, undefined, undefined, undefined as never);
      await assert.rejects(edit.execute('edit', { expectedRevision: store.read()!.revision, action: { kind: 'style', id: card, style: newStyle } } as never,
        undefined, undefined, undefined as never), expected);
    }
    await mustReject(true, /先在看板点/);
    const removed = store.edit('remove', moved.snapshot.revision, { kind: 'remove', id: card }, card);
    store.edit('add', removed.snapshot.revision, { kind: 'add', id: card }, card);
    await mustReject(false, /原卡片已被移除/);
  } finally { store.close(); }
});
