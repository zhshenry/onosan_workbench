import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dashboardPlacements, defaultDashboard, defaultWidget, findDashboardSlot, moveDashboardWidget, readDashboard, resizeDashboardHeight, resizeDashboardPlacement, updateDashboardPlacement, WIDGET_IDS, WIDGET_STYLES, type DashboardLayout } from '../shared/dashboard-layout';
import { dashboardSummary } from '../shared/dashboard-summary';
import { localDay, type Task } from '../shared/todo-contracts';
import { defaultAiScopeForWorkbench, chatScope, sameAiWorkbench, workbenchForScope } from '../shared/ai-scope';
import { NAV, ownerOfWorkbench } from '../src/nav';
import { pageAiContext } from '../src/ai-page-context';

test('看板保存后保留卡片顺序、行列和样式，空看板不回填默认卡片', () => {
  const layout = { widgets: [{ id: 'quota', width: 6, rows: 4, style: 'rings' }, { id: 'today', width: 2, rows: 1, style: 'agenda' }] };
  assert.deepEqual(readDashboard(JSON.stringify(layout)), layout);
  assert.deepEqual(readDashboard('{"widgets":[],"shortcuts":[]}'), { widgets: [] });
  assert.deepEqual(readDashboard(null), defaultDashboard());
  assert.deepEqual(readDashboard('{broken'), defaultDashboard());
  assert.deepEqual(readDashboard('{"widgets":null}'), defaultDashboard());
});

test('旧布局保留顺序和宽度，补齐默认高度样式，移除已取消的两类卡片', () => {
  assert.deepEqual(readDashboard(JSON.stringify({
    widgets: [null, { id: 'today', width: 4 }, { id: 'today', width: 6 }, { id: 'weather', width: 3 }, { id: 'focus', width: 999 }, { id: 'reading', width: 2 }, { id: 'shortcuts', width: 3 }, { id: 'quota', width: 2, rows: -1, style: 'history' }],
    shortcuts: ['todo', 'home', 'javascript:alert(1)', 'copy', 'copy', null, 'settings-ai'],
  })), { widgets: [defaultWidget('today'), defaultWidget('quota')] });
  assert.deepEqual(readDashboard('{"widgets":[{"id":"reading","width":2}]}'), { widgets: [] });
});

test('上边缩高固定底边并保留位置，下边缩放固定顶边，不能越过所在行的顶部', () => {
  const original = defaultWidget('quota'), shrunk = resizeDashboardHeight(original, 1, 'top');
  assert.deepEqual(shrunk, { ...original, rows: 1, topOffset: 1 });
  assert.equal(shrunk.rows + shrunk.topOffset!, original.rows);
  assert.deepEqual(resizeDashboardHeight(shrunk, 2, 'top'), original);
  assert.equal(resizeDashboardHeight(shrunk, 3, 'top'), shrunk, '不得覆盖上一行');
  const grown = resizeDashboardHeight(shrunk, 3, 'bottom');
  assert.deepEqual(grown, { ...shrunk, rows: 3 });
  assert.deepEqual(resizeDashboardHeight(original, 1, 'bottom'), { ...original, rows: 1 });
  assert.deepEqual(original, defaultWidget('quota'), '尺寸草稿不改写原卡片');
});

test('顶部位置随布局保存和排序保留，旧布局默认顶对齐，非法位置被忽略', () => {
  const widget = resizeDashboardHeight(defaultWidget('quota'), 1, 'top'), layout = { widgets: [defaultWidget('checkin'), widget] };
  assert.deepEqual(readDashboard(JSON.stringify(layout)), layout);
  assert.deepEqual(moveDashboardWidget(layout, 'quota', 'checkin').widgets[0], widget);
  for (const topOffset of [undefined, 0, -1, 1.5, '2', null, Number.MAX_SAFE_INTEGER + 1]) {
    assert.deepEqual(readDashboard(JSON.stringify({ widgets: [{ ...defaultWidget('quota'), topOffset }] })).widgets[0], defaultWidget('quota'));
  }
});

test('所有支持的卡片样式均可保存，新增统计卡片不挤入默认或已保存布局', () => {
  assert.deepEqual(defaultDashboard().widgets.map(widget => widget.id), ['today', 'focus', 'checkin', 'quota']);
  for (const id of WIDGET_IDS) for (const style of WIDGET_STYLES[id]) {
    const layout = { widgets: [{ id, width: 6, rows: 4, style }] };
    assert.deepEqual(readDashboard(JSON.stringify(layout)), layout);
  }
  const saved = defaultDashboard();
  saved.widgets[0] = { ...saved.widgets[0], rows: 4, style: 'activity' };
  const remaining = readDashboard(JSON.stringify({ widgets: saved.widgets.filter(widget => widget.id !== 'focus') }));
  assert.deepEqual(remaining.widgets, saved.widgets.filter(widget => widget.id !== 'focus'));
  assert.deepEqual(defaultWidget('schedule-stats'), { id: 'schedule-stats', width: 4, rows: 2, style: 'counts' });
  assert.deepEqual(readDashboard(JSON.stringify(saved)), saved);
});

test('拖动重排保持行列样式，编辑草稿不会改写已保存布局', () => {
  const saved = defaultDashboard(), snapshot = structuredClone(saved);
  const moved = moveDashboardWidget(saved, 'focus', 'quota');
  assert.deepEqual(moved.widgets.map(item => item.id), ['today', 'checkin', 'quota', 'focus']);
  assert.equal(moved.widgets.find(item => item.id === 'focus')?.width, 2);
  assert.equal(moved.widgets.find(item => item.id === 'focus')?.rows, 2);
  assert.equal(moved.widgets.find(item => item.id === 'focus')?.style, 'ring');
  assert.deepEqual(saved, snapshot);
  assert.equal(moveDashboardWidget(saved, 'today', 'today'), saved);
});

test('空白画布位置可保存，旧布局不添加位置，非法坐标忽略', () => {
  const layout = { widgets: [{ ...defaultWidget('quota'), position: { column: 3, top: 6 } }, { ...defaultWidget('checkin'), position: { column: 0, top: 3.4 } }] };
  assert.deepEqual(readDashboard(JSON.stringify(layout)), layout);
  assert.deepEqual(readDashboard(JSON.stringify(defaultDashboard())), defaultDashboard());
  for (const position of [{ column: -1, top: 1 }, { column: 6, top: 1 }, { column: 1.5, top: 1 }, { column: '3', top: 1 }, { column: 3, top: -1 }, { column: 3, top: '2' }, { column: 3, top: null }]) {
    assert.deepEqual(readDashboard(JSON.stringify({ widgets: [{ ...defaultWidget('quota'), position }] })).widgets[0], defaultWidget('quota'));
  }
});

test('落点避开占用和间距，向下吸附固定步长，保留整片留白', () => {
  const occupied = [{ id: 'checkin' as const, column: 0, span: 3, top: 0, height: 260 }, { id: 'today' as const, column: 0, span: 3, top: 320, height: 180 }];
  assert.deepEqual(findDashboardSlot(3, 0, 3, 260, occupied, 12, 80), { column: 3, top: 0 }, '左右相邻不被垂直避让影响');
  assert.deepEqual(findDashboardSlot(0, 240, 3, 260, occupied, 12, 80), { column: 0, top: 560 }, '碰撞连续卡片后再次吸附');
  assert.deepEqual(findDashboardSlot(0, 800, 3, 260, occupied, 12, 80), { column: 0, top: 800 }, '下方空白不压回上一行');
  assert.deepEqual(findDashboardSlot(0, 272, 3, 36, occupied, 12), { column: 0, top: 272 }, '恰好保留间距即可放置');
});

test('保存的坐标在宽窗恢复，窄窗及新增卡片避让重叠，不改写原坐标与尺寸', () => {
  const layout: DashboardLayout = { widgets: [{ ...defaultWidget('checkin'), width: 3, position: { column: 0, top: 0 } }, { ...defaultWidget('quota'), width: 3, position: { column: 3, top: 0 } }, { ...defaultWidget('today'), position: { column: 0, top: 8 } }, defaultWidget('schedule-stats')] };
  const original = structuredClone(layout);
  const wide = dashboardPlacements(layout.widgets, 6, 80, 100, 12);
  assert.deepEqual(wide.slice(0, 3).map(item => [item.column, item.top]), [[0, 0], [3, 0], [0, 640]]);
  for (const columns of [6, 2, 1]) {
    const placed = dashboardPlacements(layout.widgets, columns, 80, 100, 12);
    assert.equal(placed.length, layout.widgets.length);
    for (const card of placed) {
      assert.ok(card.column >= 0 && card.column + card.span <= columns);
      for (const other of placed.filter(item => item.id !== card.id)) {
        assert.ok(card.column + card.span <= other.column || other.column + other.span <= card.column || card.top + card.height + 12 <= other.top || other.top + other.height + 12 <= card.top);
      }
    }
  }
  assert.deepEqual(layout, original);
  assert.deepEqual(dashboardPlacements(layout.widgets, 6, 80, 100, 12), wide);
});

test('定位后的调序使用已有落位，顶部缩高固定底边，原布局不变', () => {
  const layout: DashboardLayout = { widgets: [{ ...defaultWidget('checkin'), position: { column: 0, top: 0 } }, { ...defaultWidget('quota'), position: { column: 3, top: 7 } }] };
  const before = structuredClone(layout), moved = moveDashboardWidget(layout, 'quota', 'checkin');
  assert.deepEqual(moved.widgets.map(widget => widget.position), before.widgets.map(widget => widget.position));
  assert.deepEqual(moved.widgets.map(widget => [widget.id, widget.width, widget.rows, widget.style]), [['quota', 2, 2, 'bars'], ['checkin', 4, 2, 'parallel']]);
  const widget = layout.widgets[1], shrunk = resizeDashboardHeight(widget, 1, 'top');
  assert.deepEqual(shrunk, { ...widget, rows: 1, position: { column: 3, top: 8 } });
  assert.deepEqual(resizeDashboardHeight(shrunk, 2, 'top'), widget);
  assert.deepEqual(resizeDashboardHeight(widget, 1, 'bottom'), { ...widget, rows: 1 });
  assert.deepEqual(layout, before);
});

const clock = new Date(2026, 10, 14, 17);
function task(id: string, patch: Partial<Task> = {}): Task {
  return { id, title: id, kind: 'task', status: 'todo', priority: 'medium', dateAt: '2026-11-14', endAt: null, remindAt: null, categoryId: null, progress: null, note: '', createdAt: clock.toISOString(), updatedAt: clock.toISOString(), completedAt: null, notifiedFor: null, deletedAt: null, ...patch };
}
test('摘要按计划日期统计任务当前完成状态，日程与删除项不计，进行中归待办，更早任务单列', () => {
  const at = (day: number, hour = 10) => new Date(2026, 10, day, hour).toISOString();
  const tasks = [task('done-later', { dateAt: '2026-11-13', status: 'done', completedAt: at(14) }), task('today'), task('doing', { status: 'doing' }), task('first-day', { dateAt: '2026-11-08', status: 'done', completedAt: at(14) }), task('old', { dateAt: '2026-11-07' }), task('old-doing', { dateAt: '2026-11-07', status: 'doing' }), task('old-done', { dateAt: '2026-11-07', status: 'done', completedAt: at(14) }), task('deleted', { status: 'done', completedAt: at(14), deletedAt: at(14) }), task('future', { dateAt: '2026-11-15' }), task('meeting', { kind: 'meeting', status: 'done', completedAt: at(13) }), task('reopened', { dateAt: '2026-11-13', status: 'doing', completedAt: at(14) }), task('missing', { status: 'done' })];
  const before = structuredClone(tasks), summary = dashboardSummary(tasks, clock);
  assert.deepEqual(summary.days.map(day => day.date), ['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14']);
  assert.deepEqual(summary.days.map(day => day.completed), [1, 0, 0, 0, 0, 1, 1]);
  assert.deepEqual(summary.days.map(day => day.pending), [0, 0, 0, 0, 0, 1, 2]);
  assert.equal(summary.total, 6); assert.equal(summary.plannedCompleted, 3); assert.equal(summary.plannedPending, 3); assert.equal(summary.earlierPending, 2);
  assert.deepEqual(summary.completed.map(item => item.id), ['done-later', 'first-day', 'old-done', 'meeting'], '旧最近完成样式仍按有效实际完成时间排序');
  assert.deepEqual(tasks, before);
});

test('修改计划日期后统计移动到新日期，重新打开任务后从完成转为待办', () => {
  const item = task('moved', { dateAt: '2026-11-13', status: 'done', completedAt: clock.toISOString() });
  assert.equal(dashboardSummary([item], clock).days[5].completed, 1);
  const moved = dashboardSummary([{ ...item, dateAt: '2026-11-14' }], clock);
  assert.equal(moved.days[5].completed, 0); assert.equal(moved.days[6].completed, 1);
  const reopened = dashboardSummary([{ ...item, status: 'todo' }], clock);
  assert.equal(reopened.days[5].completed, 0); assert.equal(reopened.days[5].pending, 1);
});

test('统计卡片显示今天起七天的未完成日程与待办，排除过去、范围外、完成和删除事项', () => {
  const tasks = [task('today'), task('doing', { status: 'doing' }), task('meeting', { kind: 'meeting' }), task('ongoing-meeting', { kind: 'meeting', status: 'doing' }), task('tomorrow', { dateAt: '2026-11-15' }), task('last-day', { dateAt: '2026-11-20', kind: 'meeting' }), task('too-late', { dateAt: '2026-11-21' }), task('old', { dateAt: '2026-11-13' }), task('done', { status: 'done' }), task('done-meeting', { kind: 'meeting', status: 'done' }), task('deleted', { deletedAt: clock.toISOString() }), task('deleted-meeting', { kind: 'meeting', deletedAt: clock.toISOString() })];
  const before = structuredClone(tasks), summary = dashboardSummary(tasks, clock);
  assert.deepEqual(summary.upcomingDays.map(day => day.date), ['2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20']);
  assert.deepEqual(summary.upcomingDays.map(day => day.tasks), [2, 1, 0, 0, 0, 0, 0]);
  assert.deepEqual(summary.upcomingDays.map(day => day.meetings), [2, 0, 0, 0, 0, 0, 1]);
  assert.deepEqual(tasks, before);
});
test('今日安排包括今日和逾期待办，排除未来待办及非当日日程', () => {
  const summary = dashboardSummary([task('future', { dateAt: '2026-11-15' }), task('overdue', { dateAt: '2026-11-13' }), task('today'), task('old-meeting', { kind: 'meeting', dateAt: '2026-11-13' }), task('meeting', { kind: 'meeting', dateAt: new Date(2026, 10, 14, 14, 30).toISOString() })], clock);
  assert.equal(summary.pending, 2); assert.equal(summary.meetings, 1);
  assert.deepEqual(summary.agenda.map(item => item.id), ['meeting', 'overdue', 'today']);
});
test('近7天跨年和本地午夜保持连续日期，空数据为真实零值', () => {
  const now = new Date(2027, 0, 2, 0, 1), beforeMidnight = new Date(2027, 0, 1, 23, 59);
  const summary = dashboardSummary([task('midnight', { dateAt: localDay(beforeMidnight), status: 'done', completedAt: beforeMidnight.toISOString() })], now);
  assert.equal(summary.days[0].date, '2026-12-27');
  assert.equal(summary.days[6].date, localDay(now));
  assert.equal(summary.days[5].completed, 1); assert.equal(summary.days[6].completed, 0);
  const yearEnd = dashboardSummary([task('next-year', { dateAt: '2027-01-01' })], new Date(2026, 11, 30, 23, 59));
  assert.equal(yearEnd.upcomingDays[6].date, '2027-01-05'); assert.equal(yearEnd.upcomingDays[2].tasks, 1);
  assert.equal(dashboardSummary([], now).total, 0);
  assert.ok(dashboardSummary([], now).upcomingDays.every(day => day.meetings === 0 && day.tasks === 0));
  assert.deepEqual(dashboardSummary([], now).agenda, []);
});

test('完整日程待办归属独立工作台，首页没有旧事项库占位，两个页面的 AI 上下文分开', () => {
  const selection = { copy: null, bazi: null, reading: null };
  assert.equal(ownerOfWorkbench('todo'), 'todo');
  assert.deepEqual(NAV.find(item => item.id === 'home')?.subs, [{ label: '我的看板', view: 'home' }, { label: '每日签到', view: 'checkin' }]);
  assert.deepEqual(pageAiContext('home', selection), { scope: { module: 'workbench', viewId: 'home' }, label: '首页', object: '我的看板' });
  assert.deepEqual(pageAiContext('todo', selection).scope, { module: 'todo' });
  assert.deepEqual(defaultAiScopeForWorkbench('home'), { module: 'workbench', viewId: 'home' });
  assert.equal(workbenchForScope({ module: 'todo' }), 'todo');
  assert.equal(sameAiWorkbench({ module: 'todo' }, { module: 'bazi', profileId: 'profile-1' }), false, '导航迁移不合并待办与命理会话');
  assert.equal(sameAiWorkbench({ module: 'todo' }, { module: 'workbench', viewId: 'home' }), false);
  assert.deepEqual(chatScope({}), { module: 'todo' }, '旧待办会话不改写或丢弃');
});

test('左右调整分别固定右边和左边，临近画布或邻卡时限制尺寸档', () => {
  const grid = { columns: 6, step: 80, base: 100, gap: 12 };
  const original = { id: 'today' as const, column: 1, span: 3, top: 160, height: 260 };
  const neighbor = { id: 'quota' as const, column: 4, span: 2, top: 160, height: 260 };
  const occupied = [original, neighbor];
  assert.deepEqual(resizeDashboardPlacement(original, { width: 2, rows: 2 }, 'left', occupied, grid),
    { ...original, column: 2, span: 2 });
  assert.deepEqual(resizeDashboardPlacement(original, { width: 2, rows: 2 }, 'right', occupied, grid),
    { ...original, span: 2 });
  assert.deepEqual(resizeDashboardPlacement(original, { width: 4, rows: 2 }, 'left', occupied, grid),
    { ...original, column: 0, span: 4 });
  assert.equal(resizeDashboardPlacement(original, { width: 4, rows: 2 }, 'right', occupied, grid), null);
  assert.equal(resizeDashboardPlacement(original, { width: 6, rows: 2 }, 'left', occupied, grid), null);
});

test('上下调整分别固定底边和顶边，扩张需要完整的卡片间距', () => {
  const grid = { columns: 6, step: 80, base: 100, gap: 12 };
  const original = { id: 'today' as const, column: 0, span: 3, top: 80, height: 260 };
  assert.deepEqual(resizeDashboardPlacement(original, { width: 3, rows: 1 }, 'top', [original], grid),
    { ...original, top: 160, height: 180 });
  assert.deepEqual(resizeDashboardPlacement(original, { width: 3, rows: 1 }, 'bottom', [original], grid),
    { ...original, height: 180 });
  assert.deepEqual(resizeDashboardPlacement(original, { width: 3, rows: 3 }, 'top', [original], grid),
    { ...original, top: 0, height: 340 });
  assert.equal(resizeDashboardPlacement(original, { width: 3, rows: 4 }, 'top', [original], grid), null);
  const nextRow = { id: 'quota' as const, column: 0, span: 3, top: 432, height: 260 };
  assert.deepEqual(resizeDashboardPlacement(original, { width: 3, rows: 3 }, 'bottom', [original, nextRow], grid),
    { ...original, height: 340 });
  assert.equal(resizeDashboardPlacement(original, { width: 3, rows: 3 }, 'bottom', [original, { ...nextRow, top: 431 }], grid), null);
});

test('调尺寸在草稿中保留邻卡坐标，单列留白独立保存并兼容旧布局', () => {
  const grid = { columns: 6, step: 80, base: 100, gap: 12 };
  const today = { ...defaultWidget('today'), width: 3 as const, position: { column: 0, top: 0 } };
  const quota = { ...defaultWidget('quota'), width: 3 as const, position: { column: 3, top: 0 } };
  const layout = { widgets: [today, quota] };
  const wide = dashboardPlacements(layout.widgets, 6, 80, 100, 12);
  const compact = dashboardPlacements(layout.widgets, 1, 80, 100, 12);
  const shrunk = updateDashboardPlacement(layout, { ...today, rows: 1 },
    { ...compact[0], height: 180 }, compact, { ...grid, columns: 1 });
  const reloaded = readDashboard(JSON.stringify(shrunk));
  assert.deepEqual(reloaded.widgets.map(widget => widget.position), layout.widgets.map(widget => widget.position));
  assert.equal(dashboardPlacements(reloaded.widgets, 1, 80, 100, 12)[1].top, 272);
  assert.deepEqual(dashboardPlacements(reloaded.widgets, 6, 80, 100, 12)[1], wide[1]);
  assert.equal(readDashboard(JSON.stringify({ widgets: [{ ...quota, singleColumnTop: -1 }] })).widgets[0].singleColumnTop, undefined);
  assert.equal(layout.widgets[0].rows, 2);
});
