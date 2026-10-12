import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { topbarTodoDate, topbarScheduleDate } from '../src/topbar-dates';
const now = new Date(2026, 9, 12, 12);
const at = (year: number, month: number, day: number, hour: number, minute: number) => new Date(year, month - 1, day, hour, minute).toISOString();

test('topbar todo uses padded local dates and times, showing non-current years', () => {
  assert.equal(topbarTodoDate({ dueAt: at(2026, 1, 2, 3, 4) }, now), '01-02 03:04');
  assert.equal(topbarTodoDate({ dueAt: at(2025, 12, 31, 23, 59) }, now), '2025-12-31 23:59');
  assert.equal(topbarTodoDate({ dueAt: at(2027, 1, 1, 0, 0) }, now), '2027-01-01 00:00');
});
test('topbar schedule same-day, cross-day and cross-year ranges preserve both endpoints', () => {
  assert.equal(topbarScheduleDate({ dueAt: at(2026, 10, 12, 14, 0), endAt: at(2026, 10, 12, 15, 0) }, now), '10-12 14:00–15:00');
  assert.equal(topbarScheduleDate({ dueAt: at(2026, 10, 11, 23, 30), endAt: at(2026, 10, 12, 0, 30) }, now), '10-11 23:30–\n10-12 00:30');
  assert.equal(topbarScheduleDate({ dueAt: at(2025, 12, 31, 23, 30), endAt: at(2026, 1, 1, 0, 30) }, now), '2025-12-31 23:30–\n2026-01-01 00:30');
  assert.equal(topbarScheduleDate({ dueAt: at(2026, 12, 31, 23, 30), endAt: at(2027, 1, 1, 0, 30) }, now), '2026-12-31 23:30–\n2027-01-01 00:30');
  assert.equal(topbarScheduleDate({ dueAt: at(2025, 10, 12, 14, 0), endAt: at(2025, 10, 12, 15, 0) }, now), '2025-10-12 14:00–15:00');
});
test('planned date with no time never invents midnight or an all-day event', () => {
  assert.equal(topbarTodoDate({ plannedDate: '2026-10-12' }, now), '10-12 · 不限时');
  assert.equal(topbarScheduleDate({ plannedDate: '2026-10-12' }, now), '10-12 · 时间待定');
  assert.equal(topbarTodoDate({ plannedDate: '2025-01-02', dueAt: null }, now), '2025-01-02 · 不限时');
  assert.equal(topbarScheduleDate({ plannedDate: '2025-01-02', dueAt: null }, now), '2025-01-02 · 时间待定');
});
test('missing and invalid values fail safely without rolled-over dates or Invalid Date', () => {
  for (const plannedDate of [undefined, null, '', 'no-date', '2026-02-30', '2026-13-12', '2026-1-2']) {
    assert.equal(topbarTodoDate({ plannedDate }, now), '未设置');
    assert.equal(topbarScheduleDate({ plannedDate }, now), '未设置');
  }
  for (const dueAt of ['', 'broken', '2026-10-12', '2026-02-30T12:00:00Z', '2026-10-12T29:00:00Z', '2026-10-12T24:00:00Z', '2026-03-08T02:30:00']) {
    assert.equal(topbarTodoDate({ dueAt }, now), '未设置');
    assert.equal(topbarScheduleDate({ dueAt }, now), '未设置');
    assert.equal(topbarTodoDate({ dueAt, plannedDate: '2026-10-12' }, now), '10-12 · 不限时');
    assert.equal(topbarScheduleDate({ dueAt, plannedDate: '2026-10-12' }, now), '10-12 · 时间待定');
  }
  const dueAt = at(2026, 10, 12, 14, 0);
  for (const endAt of [undefined, null, 'bad', dueAt, at(2026, 10, 12, 13, 0)]) assert.equal(topbarScheduleDate({ dueAt, endAt }, now), '10-12 14:00–时间待定');
});
test('date formatting is read-only and topbar callers retain titles, actions and panel size', () => {
  const task = Object.freeze({ plannedDate: '2026-10-12', dueAt: at(2026, 10, 12, 14, 0), endAt: at(2026, 10, 12, 15, 0) });
  const before = JSON.stringify(task); topbarTodoDate(task, now); topbarScheduleDate(task, now); assert.equal(JSON.stringify(task), before);
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.equal((app.match(/topbarScheduleDate\(t, todo.clock\)/g) ?? []).length, 2);
  assert.equal((app.match(/className="ipop-title" title=\{t.title\}/g) ?? []).length, 2);
  assert.match(app, /topbarTodoDate\(t, todo.clock\)/);
  assert.match(app, /openTopbarTaskCreator\('meeting'\)/);
  assert.match(app, /todo\.mutate\(\(\) => window\.workbench\.todo\.update\(t.id/);
  const css = readFileSync(new URL('../src/shell.css', import.meta.url), 'utf8');
  assert.match(css, /\.ipop \{[^}]*width: 320px;/s);
  assert.match(css, /\.ipop-time \{[^}]*white-space: pre-line;/s);
  assert.match(css, /\.schip \.n \{[^}]*text-overflow: ellipsis;/s);
});

test('UTC instants remain valid even when their source day was skipped locally', () => {
  const input = '2011-12-30T12:00:00Z';
  const local = new Date(input);
  const pad = (n: number) => String(n).padStart(2, '0');
  assert.equal(topbarTodoDate({ dueAt: input }, now), `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())} ${pad(local.getHours())}:${pad(local.getMinutes())}`);
});

test('compact topbar reserves intrinsic trigger widths instead of shrinking schedule beneath todo', () => {
  const css = readFileSync(new URL('../src/shell.css', import.meta.url), 'utf8');
  const compact = css.slice(css.indexOf('@media (max-width: 1180px) {'));
  assert.match(compact, /\.tb-middle \{[^}]*position: static;[^}]*transform: none;[^}]*flex: none;[^}]*max-width: none;/);
  assert.match(compact, /\.tb-left \{ flex: none; \}/);
  assert.match(compact, /\.ipop-sched \{ left: 0; margin-left: 0; \}/);
  assert.match(compact, /\.sched-track, \.sdiv, \.tprog \{ display: none; \}/);
});

test('mid-width topbar allocates real right-control space instead of a guessed center reserve', () => {
  const css = readFileSync(new URL('../src/shell.css', import.meta.url), 'utf8');
  const adaptive = css.slice(css.indexOf('@media (max-width: 1440px) {'));
  assert.match(adaptive, /\.topbar \{ gap: 8px; \}/);
  assert.match(adaptive, /\.tb-middle \{[^}]*position: static;[^}]*flex: 0 1 auto;[^}]*max-width: none;/);
  assert.doesNotMatch(adaptive, /calc\(100% - 520px\)/);
});
