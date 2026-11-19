import { taskDay } from './todo-date';
import { localDay, openToday, taskTime, type Task } from './todo-contracts';

/** Build read-only card views from the shared task library, using local calendar days. */
export function dashboardSummary(tasks: Task[], clock: Date) {
  const today = localDay(clock);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(clock); date.setDate(date.getDate() - 6 + index);
    return { date: localDay(date), weekday: date.getDay(), completed: 0, pending: 0 };
  });
  const upcomingDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(clock); date.setDate(date.getDate() + index);
    return { date: localDay(date), weekday: date.getDay(), tasks: 0, meetings: 0 };
  });
  const active = tasks.filter(task => !task.deletedAt);
  const completed = active.filter(task => task.status === 'done' && task.completedAt && Number.isFinite(Date.parse(task.completedAt)) && Date.parse(task.completedAt) <= clock.getTime()).sort((a, b) => Date.parse(b.completedAt!) - Date.parse(a.completedAt!));
  for (const task of active) {
    if (task.kind === 'task') {
      const day = days.find(item => item.date === taskDay(task));
      if (day) day[task.status === 'done' ? 'completed' : 'pending']++;
    }
    if (task.status !== 'done') {
      const day = upcomingDays.find(item => item.date === taskDay(task));
      if (day) day[task.kind === 'meeting' ? 'meetings' : 'tasks']++;
    }
  }
  const earlierPending = active.filter(task => task.kind === 'task' && task.status !== 'done' && taskDay(task) !== null && taskDay(task)! < days[0].date).length;
  const plannedCompleted = days.reduce((sum, day) => sum + day.completed, 0), plannedPending = days.reduce((sum, day) => sum + day.pending, 0);
  const pending = openToday(active, today).filter(task => task.kind === 'task' && (taskDay(task) === null || taskDay(task)! <= today));
  const meetings = active.filter(task => task.kind === 'meeting' && taskDay(task) === today && task.status !== 'done');
  const agenda = [...pending, ...meetings].sort((a, b) => taskTime(a) - taskTime(b));
  return { today, days, upcomingDays, earlierPending, plannedCompleted, plannedPending, completed, agenda, pending: pending.length, meetings: meetings.length, total: plannedCompleted + plannedPending };
}
