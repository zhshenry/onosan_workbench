import { useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { emptyMeetingNote, meetingNoteDraftSchema, type MeetingNote, type MeetingNoteDraft } from '../shared/meeting-notes';
import { errorText } from './ui/controls';

export function cleanMeetingHtml(body: string): string {
  return DOMPurify.sanitize(body, { ALLOWED_TAGS: ['p', 'div', 'br', 'h2', 'h3', 'strong', 'b', 'em', 'i', 'ul', 'ol', 'li', 'a', 'blockquote'],
    ALLOWED_ATTR: ['href'], ALLOWED_URI_REGEXP: /^https?:\/\//i, ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false });
}
export function meetingPlainText(body: string): string {
  const node = document.createElement('div'); node.innerHTML = cleanMeetingHtml(body); return node.textContent ?? '';
}
const draftOf = (note?: MeetingNote): MeetingNoteDraft => note ? { body: note.body, organized: note.organized, actions: note.actions.map(({ id, title }) => ({ id, title })) } : emptyMeetingNote();
const cacheKey = (id: string) => `wb.meeting-note.draft.${id}`;
function cachedDraft(id: string): MeetingNoteDraft | null {
  try {
    const raw = localStorage.getItem(cacheKey(id)); if (!raw) return null;
    const value = JSON.parse(raw), parsed = meetingNoteDraftSchema.safeParse({ ...value, body: '' });
    return parsed.success && typeof value.body === 'string' ? { ...parsed.data, body: value.body } : null;
  } catch { return null; }
}

export function useMeetingNotes() {
  const [notes, setNotes] = useState<MeetingNote[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const alive = useRef(true);
  function accept(note: MeetingNote) {
    setNotes(current => current.some(item => item.meetingId === note.meetingId && item.revision >= note.revision) ? current : [...current.filter(item => item.meetingId !== note.meetingId), note]);
  }
  async function load() {
    setLoading(true); setError('');
    try {
      if (!window.workbench.meetingNotes) throw new Error('请重新启动开发工作台，加载会议纪要服务');
      const value = await window.workbench.meetingNotes.list();
      if (alive.current) { value.forEach(accept); setLoading(false); }
    } catch (cause) { if (alive.current) { setError(errorText(cause)); setLoading(false); } }
  }
  useEffect(() => {
    alive.current = true; void load();
    const off = window.workbench.meetingNotes?.onChanged(note => { if (alive.current) accept(note); });
    return () => { alive.current = false; off?.(); };
  }, []);
  return { notes, loading, error, accept, reload: load };
}

export function useMeetingDraft(id: string, note: MeetingNote | undefined, onSaved: (note: MeetingNote) => void) {
  const [value, setValue] = useState(() => draftOf(note));
  const [status, setStatus] = useState<'idle' | 'saving' | 'error' | 'conflict'>('idle');
  const [error, setError] = useState(''), [recovery, setRecovery] = useState(() => {
    const cached = cachedDraft(id); return cached && JSON.stringify(cached) !== JSON.stringify(draftOf(note)) ? cached : null;
  });
  const [reset, setReset] = useState(0);
  const draft = useRef(value), baseline = useRef(JSON.stringify(value)), revision = useRef(note?.revision ?? 0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null), flight = useRef<Promise<boolean> | null>(null);
  const composing = useRef(false), alive = useRef(true), recoveryRef = useRef(recovery), conflict = useRef(false);
  const savedCallback = useRef(onSaved); savedCallback.current = onSaved;
  const dirty = () => JSON.stringify(draft.current) !== baseline.current;
  function cache() {
    try { localStorage.setItem(cacheKey(id), JSON.stringify(draft.current)); }
    catch { if (alive.current) setError('草稿暂存失败，请保持窗口打开并重试保存'); }
  }
  function clearCache() { try { localStorage.removeItem(cacheKey(id)); } catch { /* A server-confirmed copy is already durable. */ } }
  async function flush(): Promise<boolean> {
    if (timer.current) clearTimeout(timer.current);
    if (recoveryRef.current || composing.current) return !dirty();
    if (flight.current) { if (!(await flight.current)) return false; return dirty() ? flush() : true; }
    if (!dirty()) return true;
    if (conflict.current) return false;
    const snapshot = draft.current, serialized = JSON.stringify(snapshot);
    if (alive.current) { setStatus('saving'); setError(''); }
    const operation = (async () => {
      try {
        const result = await window.workbench.meetingNotes.save(id, snapshot, revision.current);
        revision.current = result.revision; baseline.current = serialized; savedCallback.current(result);
        if (dirty()) cache(); else clearCache();
        if (alive.current) setStatus(dirty() ? 'saving' : 'idle');
        return true;
      } catch (cause) {
        cache(); const message = errorText(cause); conflict.current = message.includes('其他操作中更新');
        if (alive.current) { setError(message); setStatus(conflict.current ? 'conflict' : 'error'); }
        return false;
      }
    })();
    flight.current = operation;
    const ok = await operation; flight.current = null;
    return ok && dirty() ? flush() : ok;
  }
  function change(next: MeetingNoteDraft) {
    draft.current = next; setValue(next); cache();
    if (timer.current) clearTimeout(timer.current);
    if (!composing.current && !conflict.current && !recoveryRef.current) {
      setStatus('saving'); timer.current = setTimeout(() => void flush(), 500);
    }
  }
  function composition(active: boolean) {
    composing.current = active;
    if (active && timer.current) clearTimeout(timer.current);
    if (!active && dirty()) { timer.current = setTimeout(() => void flush(), 500); }
  }
  async function resolve(keepLocal: boolean) {
    try {
      const latest = (await window.workbench.meetingNotes.list()).find(item => item.meetingId === id);
      revision.current = latest?.revision ?? 0; baseline.current = JSON.stringify(draftOf(latest));
      if (latest) savedCallback.current(latest);
      const local = recoveryRef.current ?? draft.current;
      const next = keepLocal ? { ...local, actions: [...local.actions, ...(latest?.actions.filter(item => item.taskId && !local.actions.some(action => action.id === item.id)).map(({ id, title }) => ({ id, title })) ?? [])] } : draftOf(latest);
      recoveryRef.current = null; setRecovery(null); conflict.current = false;
      draft.current = next; setValue(next); setReset(current => current + 1); setStatus('idle'); setError('');
      if (keepLocal) { cache(); await flush(); } else clearCache();
    } catch (cause) { setError(errorText(cause)); }
  }
  function acceptSaved(next: MeetingNote) {
    revision.current = next.revision; const nextDraft = draftOf(next);
    draft.current = nextDraft; baseline.current = JSON.stringify(nextDraft); setValue(nextDraft); clearCache();
    savedCallback.current(next); setStatus('idle');
  }
  useEffect(() => {
    if (note && note.revision > revision.current && !dirty() && !flight.current && !recoveryRef.current) {
      revision.current = note.revision; draft.current = draftOf(note); baseline.current = JSON.stringify(draft.current);
      setValue(draft.current); setReset(current => current + 1);
    }
  }, [note?.revision]);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; if (timer.current) clearTimeout(timer.current); void flush(); };
  }, []);
  return { value, status, error, recovery, reset, change, composition, flush, resolve, acceptSaved, revision: () => revision.current };
}
