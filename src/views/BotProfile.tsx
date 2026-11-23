import { useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, CaretRight, ClockCounterClockwise, Desktop, PencilSimple, Quotes, Trash, X, FileText } from '@phosphor-icons/react';
import type { BotCard, BotMemory, BotMemorySource, BotMemoryView, BotProfile as Profile } from '../../shared/bot-contracts';
import type { AiConfig } from '../../shared/workbench-api';
import { errorText, Modal, Segmented, Select } from '../ui/controls';
import { BotAvatar } from './BotAvatar';
import { BotAvatarPicker } from './BotAvatarPicker';
import { BotModelPicker } from './BotModelPicker';
import { BotSchedules } from './BotSchedules';
import { normalizeBotAvatar } from '../../shared/bot-avatar';

const api = window.workbench.bot;
const memoryFilters: { value: 'all' | BotMemory['scope']; label: string }[] = [{ value: 'all', label: '全部' }, { value: 'private', label: '当前 Bot' }, { value: 'shared', label: '全局' }];

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

export function BotProfile({ ref, card, profile: loadedProfile, config, tab, expanded, focusOnOpen, onTab, close, onSaved, onReload, onWorkspace, onHistory, onSettings, onManageInMain, onAddMemory, onEditMemory, memoryLink, library, activity }: {
  ref: Ref<HTMLElement>; card: BotCard; profile?: Profile; config?: AiConfig; tab: InspectorTab; expanded: boolean; focusOnOpen: boolean;
  onTab(value: InspectorTab): void; close(): void; onSaved(profile: Profile): void; onReload(): void;
  onWorkspace(): void; onHistory?(): void; onSettings(): void; onManageInMain?(): void; onAddMemory(): void; onEditMemory?(memory: BotMemoryView): void; memoryLink?: { id: string }; library: ReactNode; activity?: ReactNode;
}) {
  const [section, setSection] = useState<'details' | 'memory'>('details');
  const [picker, setPicker] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const draft = useSyncExternalStore(subscribeEdits, () => edits.get(card.id));
  const feedbackId = useId();
  const [memories, setMemories] = useState<BotMemoryView[]>(), [removingMemory, setRemovingMemory] = useState<BotMemoryView>();
  const [memoryFilter, setMemoryFilter] = useState<(typeof memoryFilters)[number]['value']>('all');
  const [memoryId, setMemoryId] = useState<string>();
  const [memorySources, setMemorySources] = useState<BotMemorySource[]>();
  const memoryDetailBack = useRef<HTMLButtonElement>(null), memoryAdd = useRef<HTMLButtonElement>(null), memoryEntry = useRef<HTMLButtonElement>(null);
  const inspectorBody = useRef<HTMLDivElement>(null);
  const memoryListScroll = useRef(0);
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
      if (!removingMemory) setSection('details');
    }
  }, [hasActivity, removingMemory]);
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
  useEffect(() => {
    if (!memoryLink) return;
    let current = true;
    setSection('memory'); setMemoryFilter('all'); setMemorySources(undefined); setError('');
    setMemories(undefined); setMemoryId(memoryLink.id);
    void api.listMemories(card.id).then(rows => {
      if (!current) return;
      setMemories(rows);
      if (rows.some(row => row.id === memoryLink.id)) requestAnimationFrame(() => memoryDetailBack.current?.focus({ preventScroll: true }));
      else { setMemoryId(undefined); setError('这条记忆已删除或不可查看'); }
    }, cause => { if (current) { setMemoryId(undefined); setError(errorText(cause)); } });
    return () => { current = false; };
  }, [card.id, memoryLink]);
  const editingChild = !!removingMemory;
  const selectedMemory = memories?.find(item => item.id === memoryId);
  const filteredMemories = (memories ?? []).filter(item => memoryFilter === 'all' || memoryFilter === item.scope);
  const openMemoryDetail = (id: string) => {
    memoryListScroll.current = inspectorBody.current?.scrollTop ?? 0;
    setError(''); setMemorySources(undefined); setMemoryId(id);
    requestAnimationFrame(() => memoryDetailBack.current?.focus());
  };
  const backFromMemory = (id: string) => {
    setMemoryId(undefined); setMemorySources(undefined); setError('');
    requestAnimationFrame(() => {
      const body = inspectorBody.current;
      if (!body) return;
      body.scrollTop = memoryListScroll.current;
      const row = body.querySelector<HTMLButtonElement>('button[data-memory-id="' + CSS.escape(id) + '"]');
      (row ?? memoryAdd.current)?.focus({ preventScroll: true });
    });
  };
  const backToProfile = () => {
    setSection('details'); setError(''); setMemoryId(undefined); setMemorySources(undefined);
    requestAnimationFrame(() => memoryEntry.current?.focus({ preventScroll: true }));
  };
  const removeMemory = async () => {
    if (!removingMemory) return;
    await run(async () => {
      await api.removeMemory(removingMemory.id, removingMemory.revision);
      setMemories(rows => rows?.filter(item => item.id !== removingMemory.id));
      setRemovingMemory(undefined);
      backFromMemory(removingMemory.id);
    });
  };
  const closeMemoryDelete = () => { setRemovingMemory(undefined); setError(''); };
  useEffect(() => {
    if (!expanded || tab !== 'details' || section !== 'memory' || hasActivity) return;
    let current = true;
    const unlisten = api.onChanged(event => {
      if (event.kind !== 'memory' || event.botId && event.botId !== card.id) return;
      void api.listMemories(card.id).then(items => { if (current) setMemories(items); }, () => {});
    });
    return () => { current = false; unlisten(); };
  }, [card.id, expanded, hasActivity, section, tab]);
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
    if (event.key !== 'Escape' || event.defaultPrevented || busy || editingChild) return;
    event.preventDefault();
    if (picker) closePicker();
    else if (selectedMemory && tab === 'details' && section === 'memory') backFromMemory(selectedMemory.id);
    else close();
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
    {error && !removingMemory && <div role="alert" className="bot-error">{error}</div>}
    {tab === 'library' && <div className="bot-inspector-library">{library}</div>}
    {activity}
    {tab === 'details' && !hasActivity && section === 'memory' && <header className="bot-memory-header">
      <button ref={selectedMemory ? memoryDetailBack : undefined} type="button" className="bot-text-button"
        disabled={editingChild || (!!selectedMemory && busy)}
        onClick={selectedMemory ? () => backFromMemory(selectedMemory.id) : backToProfile}>
        <ArrowLeft size={15} aria-hidden="true" />{selectedMemory ? '返回记忆列表' : '返回 Bot 资料'}
      </button>
      <h2>{selectedMemory ? '记忆详情' : '记忆列表'}</h2>
    </header>}
    <div ref={inspectorBody} className="bot-inspector-body" hidden={tab !== 'details' || hasActivity}>
      {section === 'memory' ? <section aria-label="Bot 记忆">
        <div hidden={!!selectedMemory}>
          <div className="bot-profile-section-heading">
            <Select className="bot-memory-filter" aria-label="记忆范围筛选" value={memoryFilter} options={memoryFilters}
              onChange={value => setMemoryFilter(value as typeof memoryFilter)} />
            <button ref={memoryAdd} type="button" className="bot-button primary" disabled={busy || !memories} onClick={onAddMemory}>＋ 添加记忆</button>
          </div>
          {!memories && !error && <p className="bot-empty" role="status">正在读取记忆…</p>}
          {memories?.length === 0 && <p className="bot-empty">还没有保存记忆。可以记录你的习惯或偏好。</p>}
          {!!memories?.length && !filteredMemories.length && <p className="bot-empty">此范围暂无记忆。</p>}
          {!!filteredMemories.length && <div className="bot-library-group"><ul aria-label="已保存的记忆">
            {filteredMemories.map(item => <li className="bot-delivery-row" key={item.id}><button type="button" className="bot-work-row bot-memory-row" data-memory-id={item.id} title={item.title} onClick={() => openMemoryDetail(item.id)}>
              <FileText size={18} weight="duotone" aria-hidden="true" /><strong>{item.title}</strong>
              <span className="bot-memory-tag" title={item.topic}>{item.topic}</span>
            </button></li>)}
          </ul></div>}
        </div>
        {selectedMemory && <div className="bot-memory-detail" role="region" aria-labelledby={`${feedbackId}-memory-title`}>
          <div className="bot-memory-detail-toolbar">
            <div className="bot-memory-detail-heading">
              <h3 id={`${feedbackId}-memory-title`}>{selectedMemory.title}</h3>
              <span className="bot-memory-tag">{selectedMemory.topic}</span>
            </div>
            {!!selectedMemory.sourceCount && <button type="button" className="bot-button" aria-expanded={memorySources !== undefined}
              aria-controls={memorySources ? `${feedbackId}-memory-sources` : undefined} disabled={busy} onClick={() => {
                if (memorySources !== undefined) setMemorySources(undefined);
                else void run(async () => setMemorySources(await api.memorySources(card.id, selectedMemory.id)));
              }}><Quotes size={15} aria-hidden="true" />查看原话（{selectedMemory.sourceCount}）</button>}
          </div>
          <p className="bot-memory-text">{selectedMemory.text}</p>
          {memorySources && <div id={`${feedbackId}-memory-sources`} className="bot-memory-source-panel">
            {memorySources.length ? <ul className="bot-memory-sources">{memorySources.map(source => <li key={source.messageId}>{source.quote}</li>)}</ul> : <p className="bot-help">原话已不可用。</p>}
          </div>}
          <div className="actions">
            <button type="button" disabled={busy || !onEditMemory} onClick={() => onEditMemory?.(selectedMemory)}><PencilSimple size={16} />编辑</button>
            <button type="button" className="bot-button-danger" disabled={busy} onClick={() => { setError(''); setRemovingMemory(selectedMemory); }}><Trash size={16} />删除</button>
          </div>
        </div>}
        {removingMemory && <Modal title="删除记忆" className="confirm" close={closeMemoryDelete} busy={busy}>
          <p>确定删除{removingMemory.scope === 'shared' ? '全局记忆' : '记忆'}「{removingMemory.title}」？</p>
          {error && <p className="bot-error" role="alert">{error}</p>}
          <div className="actions">
            <button type="button" disabled={busy} autoFocus onClick={closeMemoryDelete}>取消</button>
            <button type="button" className="danger" disabled={busy} onClick={() => void removeMemory()}>确认删除</button>
          </div>
        </Modal>}

        {error && !memories && <button className="bot-button" disabled={busy} onClick={openMemory}>重新读取记忆</button>}
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
          {!onManageInMain && <button ref={memoryEntry} onClick={openMemory}><BookOpen />记忆<CaretRight /></button>}
          {onHistory && <button data-open-history onClick={onHistory}><ClockCounterClockwise />历史记录<CaretRight /></button>}
        </div>
      </>}
    </div>
  </aside>;
}
