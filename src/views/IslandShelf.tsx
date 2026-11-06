import { useEffect, useId, useRef, useState } from 'react';
import { Check, Copy, File, Folder, Plus, X } from '@phosphor-icons/react';
import { ISLAND_NOTE_MAX_LENGTH, type IslandFile, type IslandNote, type IslandNoteDraft, type IslandState } from '../../shared/island-contracts';
import { localDay } from '../../shared/todo-contracts';
import { errorText, IconButton } from '../ui/controls';
import { GameOptionsMenu } from './GameOptionsMenu';

type Draft = IslandNoteDraft;
const emptyDraft = (): Draft => ({ text: '', noteId: null });
const isApplication = (file: IslandFile) => !file.directory && /\.(exe|lnk|appref-ms)$/i.test(file.name);

export function IslandShelf({ state, busy, run, now }: { state: IslandState; busy: boolean; run(action: () => Promise<unknown>): Promise<boolean>; now: number }) {
  const api = window.workbench.island, notes = state.notes ?? [], ready = Array.isArray(state.notes) && Boolean(state.noteDraft) && typeof api.noteSave === 'function';
  const [draft, setDraft] = useState<Draft>(() => state.noteDraft ?? emptyDraft());
  const [draftError, setDraftError] = useState(''), [pendingDraft, setPendingDraft] = useState<Draft | null>(null);
  const [clear, setClear] = useState(false), [selected, setSelected] = useState(''), [deleting, setDeleting] = useState<string | null>(null), [copied, setCopied] = useState<string | null>(null);
  const editor = useRef<HTMLTextAreaElement>(null), current = useRef(draft), changing = useRef(false);
  const errorId = useId(), active = state.mode === 'expanded' && state.settings.lastPage === 'files';
  const limitError = draft.text.length > ISLAND_NOTE_MAX_LENGTH ? '文字最多 20000 字' : '';
  const persist = async (value = current.current) => {
    if (!ready || changing.current || value.text.length > ISLAND_NOTE_MAX_LENGTH) return;
    try { await api.noteDraft(value); if (current.current === value) setDraftError(''); }
    catch (error) { if (current.current === value) setDraftError(errorText(error)); }
  };
  const changeDraft = (value: Draft) => {
    current.current = value; setDraft(value); setPendingDraft(null);
    void persist(value);
  };
  useEffect(() => () => { void persist(); }, []);
  useEffect(() => { if (!copied) return; const timeout = setTimeout(() => setCopied(null), 1600); return () => clearTimeout(timeout); }, [copied]);
  const focusEditor = () => { if (editor.current?.getClientRects().length && document.hasFocus()) editor.current.focus(); };
  const switchDraft = (value: Draft) => {
    if (value.noteId && value.noteId === current.current.noteId) { focusEditor(); return; }
    const original = notes.find(note => note.id === current.current.noteId);
    const dirty = current.current.noteId ? current.current.text !== original?.text : Boolean(current.current.text.trim());
    if (dirty) setPendingDraft(value); else { changeDraft(value); focusEditor(); }
  };
  const save = async (next = emptyDraft()) => {
    const value = current.current;
    if (busy || !ready || !value.text.trim() || value.text.length > ISLAND_NOTE_MAX_LENGTH) return;
    changing.current = true;
    const ok = await run(() => api.noteSave(value.text, value.noteId ?? undefined));
    changing.current = false;
    if (ok) { changeDraft(next); focusEditor(); } else void persist(value);
  };
  const remove = async (id: string) => {
    const editsThisNote = current.current.noteId === id;
    if (editsThisNote) changing.current = true;
    const ok = await run(() => api.noteRemove(id));
    changing.current = false;
    if (ok) { setDeleting(null); setPendingDraft(value => value?.noteId === id ? null : value); if (editsThisNote) changeDraft(emptyDraft()); }
    else if (editsThisNote) void persist();
  };
  const copy = async (note: IslandNote) => {
    setCopied(null);
    if (await run(() => window.workbench.clipboard.write(note.text))) setCopied(note.id);
  };
  return <div className="island-shelf">
    <section className="island-files" aria-label="文件">
      <header className="island-shelf-head"><h2>文件</h2><GameOptionsMenu kind="island" active={active} label="文件操作">{close => <button type="button" role="menuitem" disabled={busy || !state.files.length} onClick={() => { close(); setClear(true); }}>清空文件记录</button>}</GameOptionsMenu></header>
      {clear && <div className="island-shelf-confirm" role="group" aria-label="确认清空文件"><span>清空这些记录？</span><button type="button" onClick={() => setClear(false)}>取消</button><button type="button" disabled={busy} onClick={() => void run(() => api.filesRemove()).then(ok => { if (ok) { setClear(false); setSelected(''); } })}>确认清空</button></div>}
      <div className="island-list island-file-list">{state.files.length ? state.files.map(file => {
        const application = isApplication(file), name = application ? file.name.replace(/\.(exe|lnk|appref-ms)$/i, '') : file.name;
        return <div key={file.id} className={`island-file ${selected === file.id ? 'selected' : ''}`}>
          <button type="button" disabled={busy} className="island-file-name" draggable={!file.missing} title={file.missing ? `${file.path}\n文件已移动或不存在` : file.path} onClick={event => { if (application && !file.missing) { if (event.detail <= 1) void run(() => api.fileOpen(file.id)); } else setSelected(file.id); }} onDoubleClick={() => { if (!application) void run(() => api.fileOpen(file.id)); }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void run(() => api.fileOpen(file.id)); } }} onDragStart={event => { event.preventDefault(); api.fileDrag(file.id); }}>
            <FileIcon file={file} /><b>{name}</b>{!file.missing && !application && <small>{file.directory ? '文件夹' : fileSize(file.size)}</small>}
          </button>
          {file.missing && <button type="button" className="island-file-relocate" disabled={busy} onClick={() => void run(() => api.fileRelocate(file.id))}>重新定位</button>}
          <IconButton disabled={busy} label={`移除 ${file.name} 的记录`} onClick={() => void run(() => api.filesRemove(file.id))}><X size={12} /></IconButton>
        </div>;
      }) : <div className="island-empty"><Folder size={28} /><span>拖入文件</span></div>}</div>
    </section>
    <section className="island-notes" aria-label="便利贴">
      <header className="island-shelf-head"><h2>便利贴</h2><IconButton label="粘贴或写文字" disabled={busy || !ready} onClick={focusEditor}><Plus size={16} /></IconButton></header>
      <form className="island-note-editor" noValidate onSubmit={event => { event.preventDefault(); void save(); }}>
        <textarea ref={editor} aria-label="文字内容" aria-invalid={Boolean(limitError || draftError)} aria-describedby={limitError || draftError || !ready ? errorId : undefined} value={draft.text} disabled={busy || !ready} placeholder="粘贴或写点什么…" onChange={event => changeDraft({ ...current.current, text: event.target.value })} onBlur={() => void persist()} onKeyDown={event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) { event.preventDefault(); void save(); } }} />
        <div className="island-note-editor-actions">{draft.noteId && <button type="button" disabled={busy} onClick={() => switchDraft(emptyDraft())}>取消编辑</button>}<button type="submit" className="primary" disabled={busy || !ready || !draft.text.trim() || Boolean(limitError)}>保存</button></div>
        {(limitError || draftError || !ready) && <p className="island-note-error" id={errorId} role="alert">{!ready ? '重启工作台后可使用文字记录' : limitError || draftError}</p>}
        {pendingDraft && <div className="island-shelf-confirm" role="group" aria-label="处理未保存文字"><span>当前文字尚未保存</span><button type="button" disabled={busy} onClick={() => setPendingDraft(null)}>继续编辑</button><button type="button" disabled={busy || !draft.text.trim() || Boolean(limitError)} onClick={() => void save(pendingDraft)}>保存并继续</button><button type="button" disabled={busy} onClick={() => { changeDraft(pendingDraft); focusEditor(); }}>放弃修改</button></div>}
      </form>
      <div className="island-notes-list">{notes.map(note => <article className="island-note" key={note.id} data-note-id={note.id}>
        {deleting === note.id ? <div className="island-shelf-confirm" role="group" aria-label="确认删除文字"><span>删除这条文字？</span><button type="button" autoFocus onClick={() => setDeleting(null)}>取消</button><button type="button" className="danger" disabled={busy} onClick={() => void remove(note.id)}>确认删除</button></div> : <>
          <div className="island-note-body"><p>{note.text}</p><time dateTime={new Date(note.updatedAt).toISOString()} title={new Date(note.updatedAt).toLocaleString('zh-CN')}>{noteTime(note.updatedAt, now)}</time></div>
          <div className="island-note-actions"><IconButton label={copied === note.id ? '已复制' : '复制文字'} className={copied === note.id ? 'copied' : ''} disabled={busy} onClick={() => void copy(note)}>{copied === note.id ? <Check size={14} /> : <Copy size={14} />}</IconButton><GameOptionsMenu kind="island" active={active} context={note.id} label={`文字操作：${note.text.slice(0, 24)}`}>{close => <><button type="button" role="menuitem" disabled={busy} onClick={() => { close(); switchDraft({ text: note.text, noteId: note.id }); }}>编辑</button><button type="button" role="menuitem" className="danger" disabled={busy} onClick={() => { close(); setDeleting(note.id); }}>删除</button></>}</GameOptionsMenu></div>
        </>}
      </article>)}{!notes.length && <p className="island-notes-empty">将文字保存为便利贴</p>}<span className="island-shelf-status" role="status">{copied ? '已复制' : ''}</span></div>
    </section>
  </div>;
}

function FileIcon({ file }: { file: IslandFile }) {
  const [icon, setIcon] = useState('');
  useEffect(() => {
    let alive = true; setIcon('');
    if (!file.missing) void window.workbench.island.fileIcon(file.id).then(value => { if (alive) setIcon(value); }, () => undefined);
    return () => { alive = false; };
  }, [file.id, file.path, file.missing]);
  return <span className="island-file-icon">{icon ? <img src={icon} alt="" draggable={false} onError={() => setIcon('')} /> : file.directory ? <Folder size={32} /> : <File size={32} />}</span>;
}
function fileSize(bytes?: number): string {
  if (bytes === undefined) return '文件';
  const units = ['B', 'KB', 'MB', 'GB', 'TB']; let unit = 0;
  while (bytes >= 1024 && unit < units.length - 1) { bytes /= 1024; unit++; }
  return `${Number(bytes.toFixed(unit ? 1 : 0))} ${units[unit]}`;
}
function noteTime(value: number, now: number): string {
  if (now - value < 60000) return '刚刚';
  return localDay(new Date(value)) === localDay(new Date(now)) ? new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : new Date(value).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}
