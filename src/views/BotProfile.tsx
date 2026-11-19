import { useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, CaretRight, ChatsCircle, Desktop, PencilSimple, Trash, X } from '@phosphor-icons/react';
import type { BotCard, BotMemory, BotProfile as Profile } from '../../shared/bot-contracts';
import type { AiConfig } from '../../shared/workbench-api';
import { errorText, IconButton, Segmented, Select } from '../ui/controls';
import { BotAvatar } from './BotAvatar';
import { BotAvatarPicker } from './BotAvatarPicker';
import { BotModelPicker } from './BotModelPicker';
import { BotSchedules } from './BotSchedules';
import { normalizeBotAvatar } from '../../shared/bot-avatar';

const api = window.workbench.bot;

export type InspectorTab = 'details' | 'library';
type Fields = Pick<Profile, 'name' | 'description' | 'avatar' | 'instructions' | 'modelId'>;
type Field = keyof Fields;
type IdentityField = 'name' | 'description';
type TextField = IdentityField | 'instructions';
type FieldEdit = { base: string | null; value?: string; saving?: boolean; error?: string };
type ProfileEdits = { saved?: Profile; fields: Partial<Record<Field, FieldEdit>> };
const edits = new Map<string, ProfileEdits>();
const writes = new Map<string, Promise<void>>();
const editListeners = new Set<() => void>();
const subscribeEdits = (listener: () => void) => {
  editListeners.add(listener);
  return () => { editListeners.delete(listener); };
};

export function BotProfile({ ref, card, profile: loadedProfile, config, tab, expanded, focusOnOpen, onTab, close, onSaved, onReload, onWorkspace, onActivity, onSettings, onManageInMain, library, activity }: {
  ref: Ref<HTMLElement>; card: BotCard; profile?: Profile; config?: AiConfig; tab: InspectorTab; expanded: boolean; focusOnOpen: boolean;
  onTab(value: InspectorTab): void; close(): void; onSaved(profile: Profile): void; onReload(): void;
  onWorkspace(): void; onActivity(): void; onSettings(): void; onManageInMain?(): void; library: ReactNode; activity?: ReactNode;
}) {
  const [section, setSection] = useState<'details' | 'memory'>('details');
  const [picker, setPicker] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const draft = useSyncExternalStore(subscribeEdits, () => edits.get(card.id));
  const feedbackId = useId();
  const [memories, setMemories] = useState<BotMemory[]>(), [memory, setMemory] = useState<BotMemory>();
  const hasActivity = !!activity;
  const avatarButton = useRef<HTMLButtonElement>(null);
  const avatarPopover = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const running = useRef(false);
  const cancellingText = useRef(false);
  useEffect(() => {
    if (!expanded) setPicker(false);
    else if (focusOnOpen && !closeButton.current?.parentElement?.contains(document.activeElement)) closeButton.current?.focus({ preventScroll: true });
  }, [expanded, focusOnOpen]);
  useEffect(() => {
    if (hasActivity) {
      setPicker(false);
      if (!memory) setSection('details');
    }
  }, [hasActivity, memory]);
  useEffect(() => {
    if (!picker) return;
    const panel = avatarPopover.current;
    panel?.querySelector<HTMLButtonElement>('[role="radio"][aria-checked="true"]')?.focus({ preventScroll: true });
    const dismissOutside = (event: Event) => {
      if (event.target instanceof Node && !panel?.contains(event.target) && !avatarButton.current?.contains(event.target)) setPicker(false);
    };
    document.addEventListener('pointerdown', dismissOutside, true);
    document.addEventListener('focusin', dismissOutside, true);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside, true);
      document.removeEventListener('focusin', dismissOutside, true);
    };
  }, [picker]);
  const closePicker = () => { setPicker(false); avatarButton.current?.focus({ preventScroll: true }); };
  const latestProfile = (saved?: Profile) => saved && saved.revision >= (loadedProfile?.revision ?? -1) ? saved : loadedProfile;
  const profile = latestProfile(draft?.saved);
  const fieldEdit = (field: Field) => edits.get(card.id)?.fields[field];
  const remember = (field: Field, next?: FieldEdit, saved?: Profile) => {
    const previous = edits.get(card.id);
    const fields = { ...previous?.fields };
    if (next) fields[field] = next;
    else delete fields[field];
    edits.set(card.id, { saved: saved ?? previous?.saved, fields });
    editListeners.forEach(listener => listener());
  };
  const run = async (job: () => Promise<unknown>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true); setError('');
    try { await job(); } catch (cause) { setError(errorText(cause)); }
    finally { running.current = false; setBusy(false); }
  };
  const saveField = (field: Field, value: string) => {
    const current = latestProfile(edits.get(card.id)?.saved);
    if (!current) return;
    const previous = fieldEdit(field);
    if (!previous?.saving && current[field] === value) { remember(field); return; }
    remember(field, { base: previous ? previous.base : current[field] ?? null, value, saving: true });

    // Profile writes share a revision. Merge each edit into the last saved profile in order.
    const write = (writes.get(card.id) ?? Promise.resolve()).then(async () => {
      const submitted = fieldEdit(field);
      if (!submitted?.saving || submitted.value !== value) return;
      const base = latestProfile(edits.get(card.id)?.saved) ?? current;
      let saved = base;
      let failure: string | undefined;
      if (base[field] !== value) {
        if ((base[field] ?? null) !== submitted.base) failure = '此字段已在其他入口更新，请核对后重试。';
        else {
          const { name, description, instructions, avatar, modelId } = base;
          try {
            saved = await api.updateProfile(card.id, base.revision, {
              name, description, instructions, avatar: normalizeBotAvatar(avatar), modelId, [field]: value,
            });
          } catch (cause) {
            const reported = (cause as { current?: Profile })?.current;
            const fresh = reported?.id === card.id ? reported : (await api.open(card.id).catch(() => undefined))?.bot;
            if (fresh && fresh.revision > base.revision) saved = fresh;
            if (saved[field] !== value) failure = errorText(cause);
          }
        }
      }

      const next = fieldEdit(field);
      const savedValue = saved[field] ?? null;
      if (next?.value === value) {
        remember(field, failure ? { base: savedValue, value: field === 'modelId' || field === 'avatar' ? undefined : value, error: failure } : undefined, saved);
      } else {
        remember(field, next && !failure ? { ...next, base: savedValue } : next, saved);
      }
      if (saved.revision > base.revision) onSaved(saved);
    });
    writes.set(card.id, write);
    void write.finally(() => { if (writes.get(card.id) === write) writes.delete(card.id); });
  };
  const editText = (field: TextField, value: string) => {
    if (!profile || fieldEdit(field)?.saving) return;
    remember(field, value === profile[field] ? undefined : { base: fieldEdit(field)?.base ?? profile[field], value });
  };
  const saveText = (field: TextField, input: string) => {
    const pending = fieldEdit(field);
    if (cancellingText.current || !pending || pending.saving || pending.error) return;
    const value = field === 'instructions' ? input : input.trim();
    if (field === 'name' && !value) remember(field);
    else saveField(field, value);
  };
  const textKeys = (field: TextField, event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) { event.stopPropagation(); return; }
    if (event.key === 'Escape') {
      event.preventDefault();
      if (!fieldEdit(field)?.saving) remember(field);
      cancellingText.current = true;
      event.currentTarget.blur();
      cancellingText.current = false;
      closeButton.current?.focus({ preventScroll: true });
    } else if (event.key === 'Enter' && field !== 'instructions' && (field === 'name' || !event.shiftKey)) {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };
  const messageId = (field: Field) => `${feedbackId}-${field}`;
  const fieldError = (field: Field) => {
    const edit = draft?.fields[field];
    if (!edit?.error) return null;
    return <div className="bot-profile-feedback">
      <span id={messageId(field)} role="alert">{edit.error}</span>
      {edit.value !== undefined && <button type="button" onClick={() => saveField(field, edit.value!)}>重试</button>}
    </div>;
  };
  const openMemory = () => { setSection('memory'); void run(async () => setMemories(await api.listMemories(card.id))); };
  const editingChild = !!memory;
  const name = profile?.name ?? card.name;
  const avatar = draft?.fields.avatar?.value ?? profile?.avatar ?? card.avatar;
  const identityField = (field: IdentityField) => {
    const label = field === 'name' ? 'Bot 名称' : '简介';
    const edit = draft?.fields[field];
    const value = edit?.value ?? profile?.[field] ?? card[field];
    const placeholder = field === 'description' ? '添加简介' : undefined;
    if (onManageInMain) return <button type="button" className="bot-identity-text" aria-label={`在主窗口编辑${label}`} onClick={onManageInMain}>{value || placeholder}</button>;
    return <textarea className="bot-identity-text" aria-label={label} rows={1} maxLength={field === 'name' ? 30 : 100}
      aria-busy={edit?.saving} aria-invalid={!!edit?.error || undefined} aria-describedby={edit?.error ? messageId(field) : undefined}
      disabled={!profile || editingChild} readOnly={busy || edit?.saving} value={value} placeholder={placeholder}
      onChange={event => editText(field, field === 'name' ? event.target.value.replace(/[\r\n]+/g, ' ') : event.target.value)}
      onBlur={event => saveText(field, event.currentTarget.value)} onKeyDown={event => textKeys(field, event)} />;
  };
  return <aside ref={ref} id="bot-inspector" className="bot-inspector bot-profile" aria-label={`${name}的 Bot 资料`} onKeyDown={event => {
    if (event.key !== 'Escape' || event.defaultPrevented || busy) return;
    event.preventDefault();
    if (picker) closePicker(); else if (!editingChild) close();
  }}>
    <span className="bot-profile-save-status" role="status">{Object.values(draft?.fields ?? {}).some(edit => edit?.saving) ? '保存中…' : ''}</span>
    <button type="button" disabled={busy} className="ibtn bot-inspector-close" ref={closeButton} aria-label="关闭 Bot 侧栏" onClick={close}><X size={17} /></button>
    <div className="bot-inspector-hero">
      <button type="button" ref={avatarButton} className="bot-inspector-avatar" title="更换 Bot 头像" aria-label="更换 Bot 头像" aria-haspopup={onManageInMain ? undefined : 'dialog'} aria-expanded={onManageInMain ? undefined : picker} aria-controls={picker ? 'bot-avatar-editor' : undefined}
        aria-busy={draft?.fields.avatar?.saving} aria-describedby={draft?.fields.avatar?.error ? messageId('avatar') : undefined}
        disabled={!profile || busy || editingChild} onClick={onManageInMain ?? (() => setPicker(open => !open))}><BotAvatar avatar={avatar} /><span className="bot-avatar-edit-mark" aria-hidden="true"><PencilSimple size={16} weight="bold" /></span></button>
      {!picker && fieldError('avatar')}
      <h2 aria-label={name}>{identityField('name')}</h2>
      {fieldError('name')}
      <div className="bot-inspector-description">{identityField('description')}{fieldError('description')}</div>
      <Segmented aria-label="Bot 侧栏内容" value={tab} options={[{ value: 'details', label: '详情' }, { value: 'library', label: '资料库' }]} onChange={value => { setPicker(false); onTab(value as InspectorTab); }} />
    </div>
    {picker && profile && <div className="bot-avatar-popover-position">
      <div ref={avatarPopover} id="bot-avatar-editor" className="bot-avatar-popover" role="dialog" aria-label="编辑 Bot 头像">
        <BotAvatarPicker value={avatar} seedKey={card.seedKey} disabled={busy} onChange={value => saveField('avatar', normalizeBotAvatar(value))} />
        {fieldError('avatar')}
      </div>
    </div>}
    {error && <div role="alert" className="bot-error">{error}</div>}
    {tab === 'library' && <div className="bot-inspector-library">{library}</div>}
    {activity}
    {tab === 'details' && !hasActivity && section === 'memory' && <header className="bot-memory-header">
      <button type="button" className="bot-text-button" disabled={editingChild} onClick={() => { setSection('details'); setError(''); }}><ArrowLeft size={15} />返回详情</button>
      <h2>记忆</h2>
    </header>}
    <div className="bot-inspector-body" hidden={tab !== 'details' || hasActivity}>
      {section === 'memory' ? <section aria-label="Bot 记忆">
        <div className="bot-profile-section-heading"><h3>已保存</h3>{!memory && <button className="bot-button primary" disabled={busy || !memories} onClick={() => setMemory({ id: crypto.randomUUID(), botId: card.id, scope: 'private', text: '', source: '用户编辑', revision: 0, updatedAt: '' })}>＋ 添加记忆</button>}</div>
          <p className="bot-help">私人记忆仅当前 Bot 使用；共享记忆由全部 Bot 使用。</p>
          {!memories && !error && <p className="bot-empty" role="status">正在读取记忆…</p>}
          {memories?.length === 0 && <p className="bot-empty">还没有保存记忆。可以记录你的习惯或偏好。</p>}
      {memories?.map(item => <div className="bot-memory-item" key={item.id}><p>{item.text}</p><span className="bot-help">{item.scope === 'shared' ? '共享记忆' : '私人记忆'} · {item.source || '手动记录'}</span><div><IconButton className="bot-button" label="编辑记忆" disabled={busy} onClick={() => setMemory({ ...item })}><PencilSimple size={16} /></IconButton><button className="bot-button bot-button-danger" disabled={busy} onClick={() => setMemory({ ...item, text: '' })}><Trash size={16} />删除</button></div></div>)}
      {memory ? <form noValidate onSubmit={event => { event.preventDefault(); void run(async () => { if (!memory.text.trim()) { if (memory.revision) await api.removeMemory(memory.id, memory.revision); } else await api.updateMemory({ id: memory.id, revision: memory.revision, scope: memory.scope, source: memory.source, text: memory.text.trim(), botId: memory.scope === 'private' ? card.id : null }); setMemories(await api.listMemories(card.id)); setMemory(undefined); }); }}>
        <label>记忆内容<textarea aria-label="记忆内容" autoFocus value={memory.text} maxLength={4000} rows={4} placeholder={memory.revision ? '留空后确认删除这条记忆' : '例如：文章使用简洁、自然的中文'} onChange={event => setMemory({ ...memory, text: event.target.value })} /></label>
        <Select aria-label="记忆范围" value={memory.scope} options={[{ value: 'private', label: '当前 Bot' }, { value: 'shared', label: '全部 Bot' }]} onChange={value => setMemory({ ...memory, scope: value as 'private' | 'shared' })} />
        <div className="actions"><button type="button" disabled={busy} onClick={() => setMemory(undefined)}>取消</button><button className={!memory.text.trim() && memory.revision ? 'danger' : 'primary'} disabled={busy || !memory.text.trim() && !memory.revision}>{!memory.text.trim() && memory.revision ? '确认删除' : '保存记忆'}</button></div>
      </form> : null}

        {error && <button className="bot-button" disabled={busy} onClick={openMemory}>重新读取记忆</button>}
      </section> : <>
        {!onManageInMain && expanded && tab === 'details' && !hasActivity && <BotSchedules key={card.id} botId={card.id} botName={name} compact />}
        <h3 className="bot-inspector-workspace-title">工作台</h3>
        <button className="bot-inspector-workspace" onClick={onWorkspace}><span className="bot-screen-icon"><Desktop size={28} /></span><strong>工作台</strong><ArrowRight size={17} /></button>
        {onManageInMain ? <button className="bot-button" onClick={onManageInMain}><PencilSimple size={15} />在主窗口编辑 Bot</button> : profile ? <>
          <BotModelPicker config={config} value={draft?.fields.modelId?.value ?? profile.modelId ?? null} disabled={busy || !expanded || tab !== 'details'}
            saving={draft?.fields.modelId?.saving} errorId={draft?.fields.modelId?.error ? messageId('modelId') : undefined}
            onChange={modelId => saveField('modelId', modelId)} onSettings={onSettings}>{fieldError('modelId')}</BotModelPicker>
          <div className="bot-profile-guidance">
            <label>工作说明<textarea aria-label="工作说明" rows={4} maxLength={6000} readOnly={busy || draft?.fields.instructions?.saving}
              aria-busy={draft?.fields.instructions?.saving} aria-invalid={!!draft?.fields.instructions?.error || undefined}
              aria-describedby={draft?.fields.instructions?.error ? messageId('instructions') : undefined}
              value={draft?.fields.instructions?.value ?? profile.instructions} onChange={event => editText('instructions', event.target.value)}
              onBlur={event => saveText('instructions', event.currentTarget.value)} onKeyDown={event => textKeys('instructions', event)} /></label>
            {fieldError('instructions')}
          </div>
        </> : <button className="bot-text-button" onClick={onReload}>重新读取 Bot 资料</button>}
        <div className="bot-inspector-links">
          {!onManageInMain && <button onClick={openMemory}><BookOpen />记忆<CaretRight /></button>}
          <button data-open-activity onClick={onActivity}><ChatsCircle />工作与对话<CaretRight /></button>
        </div>
      </>}
    </div>
  </aside>;
}
