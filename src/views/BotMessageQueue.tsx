import { useRef, useState } from 'react';
import { ArrowBendDownRight, PencilSimple, Trash } from '@phosphor-icons/react';
import type { BotQueueChange, BotTask } from '../../shared/bot-contracts';
import { errorText, IconButton } from '../ui/controls';

export function BotMessageQueue({ items, active, onChange, focusComposer }: {
  items: BotTask[]; active?: BotTask; onChange(change: BotQueueChange): Promise<unknown>; focusComposer(): void;
}) {
  const [editing, setEditing] = useState<{ task: BotTask; text: string }>();
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const region = useRef<HTMLElement>(null);
  const editedTask = items.find(task => task.id === editing?.task.id);
  const rows = editing && !editedTask ? [...items, editing.task] : items;
  const editExpired = editing && (!editedTask || editedTask.revision !== editing.task.revision);

  const closeEditor = (id: string) => {
    setEditing(undefined);
    setError('');
    requestAnimationFrame(() => {
      const edit = region.current?.querySelector<HTMLButtonElement>('[data-queued-task="' + CSS.escape(id) + '"] [data-queue-edit]');
      if (edit) edit.focus({ preventScroll: true });
      else focusComposer();
    });
  };
  const submit = async (change: BotQueueChange) => {
    if (submitting.current) return;
    submitting.current = true;
    setPending(change.taskId);
    setError('');
    try {
      await onChange(change);
      if (change.kind === 'edit') closeEditor(change.taskId);
      else focusComposer();
    } catch (cause) { setError(errorText(cause)); }
    finally { submitting.current = false; setPending(undefined); }
  };

  if (!rows.length && !error) return null;
  return <section ref={region} className="bot-message-queue" aria-label="排队消息">
    <ol className="bot-queue-list">
      {rows.map(task => <li key={task.id} data-queued-task={task.id} aria-busy={pending === task.id || undefined}>
        {editing?.task.id === task.id ? <div className="bot-queue-editor">
          <textarea className="resize-none" aria-label="编辑排队消息" maxLength={10000} rows={2} autoFocus value={editing.text} readOnly={pending === task.id}
            onChange={event => setEditing({ ...editing, text: event.target.value })}
            onKeyDown={event => {
              if (event.key === 'Escape' && !event.nativeEvent.isComposing && !pending) {
                event.preventDefault(); event.stopPropagation(); closeEditor(task.id);
              }
            }} />
          {editExpired && <p className="bot-queue-note" role="status">这条排队消息已更新或开始执行。修改的文字仍可复制。</p>}
          <div className="bot-queue-edit-actions">
            <button type="button" className="bot-button" disabled={!!pending} onClick={() => closeEditor(task.id)}>取消</button>
            <button type="button" className="bot-button primary" disabled={!!pending || !!editExpired || !editing.text.trim()}
              onClick={() => void submit({ kind: 'edit', taskId: task.id, revision: editing.task.revision, text: editing.text })}>保存</button>
          </div>
        </div> : <div className="bot-queue-row">
          <p className="bot-queue-text" title={task.input}>{task.input}</p>
          <div className="bot-queue-actions">
            <button type="button" className="bot-queue-steer" disabled={!!pending || !!editing || !active}
              title={active ? '引导「' + active.title + '」' : '当前没有可引导的任务'}
              onClick={() => { if (active) void submit({ kind: 'steer', taskId: task.id, revision: task.revision, targetTaskId: active.id, targetRun: active.runGeneration ?? 0 }); }}>
              <ArrowBendDownRight size={16} aria-hidden="true" />引导
            </button>
            <IconButton label="编辑" data-queue-edit disabled={!!pending || !!editing}
              onClick={() => { setError(''); setEditing({ task, text: task.input }); }}><PencilSimple size={17} aria-hidden="true" /></IconButton>
            <IconButton label="删除" className="bot-queue-delete" disabled={!!pending || !!editing}
              onClick={() => void submit({ kind: 'delete', taskId: task.id, revision: task.revision })}><Trash size={17} aria-hidden="true" /></IconButton>
          </div>
        </div>}
      </li>)}
    </ol>
    {error && <div className="bot-queue-error" role="alert">{error}<button type="button" className="bot-text-button" onClick={() => setError('')}>关闭提示</button></div>}
  </section>;
}
