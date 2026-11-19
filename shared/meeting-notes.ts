import { z } from 'zod';
import type { Task } from './todo-contracts';
import { meetingEndAt } from './todo-format';
import type { TodoState } from './workbench-api';

export const meetingActionSchema = z.object({
  id: z.string().uuid(), title: z.string().max(200, '行动项最多200字'),
}).strict();
export const meetingNoteDraftSchema = z.object({
  body: z.string().max(200000, '纪要内容过长，请分段整理'),
  organized: z.boolean(), actions: z.array(meetingActionSchema).max(200, '行动项最多200条'),
}).strict().refine(value => new Set(value.actions.map(action => action.id)).size === value.actions.length, '行动项编号重复');
export type MeetingNoteDraft = z.infer<typeof meetingNoteDraftSchema>;
export interface MeetingAction extends z.infer<typeof meetingActionSchema> { taskId: string | null; }
export interface MeetingNote extends Omit<MeetingNoteDraft, 'actions'> {
  meetingId: string; actions: MeetingAction[]; revision: number; updatedAt: string;
}
export interface MeetingNotesBridge {
  list(): Promise<MeetingNote[]>;
  save(meetingId: string, draft: MeetingNoteDraft, revision: number): Promise<MeetingNote>;
  createTask(meetingId: string, actionId: string, input: unknown, revision: number): Promise<{ state: TodoState; note: MeetingNote }>;
  onChanged(callback: (note: MeetingNote) => void): () => void;
}
export const emptyMeetingNote = (): MeetingNoteDraft => ({ body: '', organized: false, actions: [] });
export function hasMeetingNotes(note: Pick<MeetingNoteDraft, 'body' | 'actions'>): boolean {
  return Boolean(note.body.replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;/g, '').trim() || note.actions.some(action => action.title.trim()));
}
export function meetingNoteStatus(note?: MeetingNote): string {
  return !note || !hasMeetingNotes(note) ? '未记录' : note.organized ? '已整理' : '记录中';
}
export function meetingTimeStatus(task: Task, now: number): { label: string; tone: 'upcoming' | 'live' | 'ended' | 'idle' } {
  const start = task.dateAt ? Date.parse(task.dateAt) : NaN;
  const endAt = meetingEndAt(task), end = endAt ? Date.parse(endAt) : NaN;
  if (!Number.isFinite(start)) return { label: '未开始', tone: 'idle' };
  if (Number.isFinite(end) && now >= end) return { label: '已结束', tone: 'ended' };
  if (now >= start) return { label: '进行中', tone: 'live' };
  const minutes = Math.ceil((start - now) / 60000);
  return minutes <= 60 ? { label: `${minutes}分钟后开始`, tone: 'upcoming' } : { label: '未开始', tone: 'idle' };
}
