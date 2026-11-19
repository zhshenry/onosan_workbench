import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { CaretDown, Check, Eye, EyeSlash, Lightning, LinkSimple, PencilSimple, Plus, Question, Trash } from '@phosphor-icons/react';
import { AI_PROVIDER_PRESETS, RLCD_PROVIDER_PRESETS, type AIModel, type AIProtocol, type AIProvider, type AIProviderKind, type RlcdModel, type RlcdProvider, type RlcdProviderKind } from '../../shared/todo-contracts';
import { errorText, IconButton, Modal, Select as TodoSelect } from '../ui/controls';
import type { AiConfig } from '../../shared/workbench-api';

const api = window.workbench.ai;
const PROTOCOL_OPTIONS = [
  { value: 'openai-chat', label: 'OpenAI Chat Completions' },
  { value: 'openai-responses', label: 'OpenAI Responses' },
  { value: 'anthropic', label: 'Anthropic Messages' },
];
const LLM_KIND_OPTIONS = [
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'custom', label: '自定义' },
];
const RLCD_KIND_OPTIONS = [
  { value: 'typesafe', label: 'TypeSafe' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'custom', label: '自定义' },
];
type Surface = 'llm' | 'rlcd';
type ConfigProvider = AIProvider | RlcdProvider;
type ConfigModel = AIModel | RlcdModel;
type ConnectionDraft = { name: string; endpoint: string; protocol: AIProtocol; apiKey: string };
// Unsaved connection fields, including keys, stay in renderer memory only.
const connectionDrafts = new Map<string, ConnectionDraft>();
const protocolLabel = (protocol: AIProtocol) => PROTOCOL_OPTIONS.find(option => option.value === protocol)?.label ?? protocol;

function showConfigHelp(button: HTMLButtonElement, id: string) {
  const tip = document.getElementById(id)!;
  if (!tip.matches(':popover-open')) tip.showPopover();
  const anchor = button.getBoundingClientRect();
  const bounds = tip.getBoundingClientRect();
  tip.style.left = `${Math.max(8, Math.min(anchor.left + anchor.width / 2 - bounds.width / 2, window.innerWidth - bounds.width - 8))}px`;
  tip.style.top = `${anchor.bottom + bounds.height <= window.innerHeight - 8 ? anchor.bottom : Math.max(8, anchor.top - bounds.height)}px`;
}

function ProviderConfigPanel({ id, open, children }: { id: string; open: boolean; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const [retained, setRetained] = useState(open);
  useLayoutEffect(() => {
    if (open) { setRetained(true); return; }
    if (!retained) return;
    const transition = panel.current?.getAnimations?.().find(animation =>
      'transitionProperty' in animation && animation.transitionProperty === 'grid-template-rows');
    if (!transition) { setRetained(false); return; }
    let active = true;
    const finish = () => { if (active) setRetained(false); };
    void transition.finished.then(finish, finish);
    return () => { active = false; };
  }, [open, retained]);
  return <div ref={panel} id={id} className="ai-config-surface-panel ai-provider-config-panel" data-open={open} inert={!open} aria-hidden={!open}>
    <div className="ai-config-surface-clip">{(open || retained) && children}</div>
  </div>;
}

function ProviderEditor({ surface, provider, saved, close, blocked = false, expanded = true, onBusyChange }: {
  surface: Surface; provider: ConfigProvider | null; saved(config: AiConfig): void; close(): void;
  blocked?: boolean; expanded?: boolean; onBusyChange?(busy: boolean): void;
}) {
  const rlcd = surface === 'rlcd';
  const inline = provider !== null;
  const draftKey = `${surface}:${provider?.id}`;
  const prefix = inline ? `ai-provider-${surface}-${provider.id}` : 'ai-provider';
  const preset = rlcd ? RLCD_PROVIDER_PRESETS.typesafe : AI_PROVIDER_PRESETS.deepseek;
  const [initial] = useState(() => ({
    kind: provider?.kind ?? (rlcd ? 'typesafe' : 'deepseek') as AIProviderKind | RlcdProviderKind,
    name: provider?.name ?? preset.name,
    endpoint: provider?.endpoint ?? preset.endpoint,
    protocol: provider?.protocol ?? preset.protocol,
    apiKey: '',
  }));
  const [draft, setDraft] = useState(() => inline ? { ...initial, ...connectionDrafts.get(draftKey) } : initial);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [invalid, setInvalid] = useState<'name' | 'endpoint' | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const endpointInput = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const disabled = busy || blocked || !expanded;
  const keyVisible = visible && expanded;
  useLayoutEffect(() => { if (!expanded) setVisible(false); }, [expanded]);
  function updateDraft(next: typeof initial) {
    setDraft(next);
    if (inline) {
      if (JSON.stringify(next) === JSON.stringify(initial)) connectionDrafts.delete(draftKey);
      else connectionDrafts.set(draftKey, { name: next.name, endpoint: next.endpoint, protocol: next.protocol, apiKey: next.apiKey });
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (disabled || (inline && !dirty)) return;
    setError(''); setInvalid(null);
    if (!draft.name.trim()) {
      setInvalid('name'); setError('请填写供应商名称。'); nameInput.current?.focus(); return;
    }
    try {
      const url = new URL(draft.endpoint.trim());
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error();
    } catch {
      setInvalid('endpoint'); setError('请填写有效的 HTTP 或 HTTPS 服务地址，不含密钥、参数或锚点。'); endpointInput.current?.focus(); return;
    }
    setBusy(true); onBusyChange?.(true);
    try {
      const next = await (rlcd ? api.saveRlcdProvider : api.saveProvider)({ ...draft, id: provider?.id, name: draft.name.trim(), endpoint: draft.endpoint.trim(), apiKey: draft.apiKey || undefined });
      if (inline) {
        connectionDrafts.delete(draftKey);
        setDraft(initial);
        setVisible(false);
      }
      saved(next);
      close();
    }
    catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); onBusyChange?.(false); }
  }

  const form = <form id={inline ? prefix : undefined} className={inline ? 'ai-provider-inline' : undefined} aria-label={inline ? `${provider.name}连接配置` : undefined} aria-busy={disabled || undefined} noValidate onSubmit={event => void save(event)} onKeyDown={event => { if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault(); }}>
      <div className="ai-config-fields">
        {!provider && <div className="ai-config-field full">
          <label htmlFor={`${prefix}-kind`}>供应商类型</label>
          <TodoSelect id={`${prefix}-kind`} aria-label="供应商类型" value={draft.kind} disabled={disabled || Boolean(draft.apiKey)} options={rlcd ? RLCD_KIND_OPTIONS : LLM_KIND_OPTIONS}
            onChange={value => { const kind = value as AIProviderKind | RlcdProviderKind; updateDraft({ ...draft, kind, ...(rlcd ? RLCD_PROVIDER_PRESETS[kind as RlcdProviderKind] : AI_PROVIDER_PRESETS[kind as AIProviderKind]) }); }} />
        </div>}
        <div className="ai-config-field">
          <label htmlFor={`${prefix}-name`}>供应商名称</label>
          <input ref={nameInput} id={`${prefix}-name`} value={draft.name} maxLength={30} autoComplete="off" placeholder={rlcd ? '例如 TypeSafe' : '例如 DeepSeek'} disabled={disabled}
            aria-invalid={invalid === 'name'} aria-describedby={invalid === 'name' ? `${prefix}-error` : undefined}
            onChange={event => updateDraft({ ...draft, name: event.target.value })} />
        </div>
        <div className="ai-config-field">
          <label htmlFor={`${prefix}-protocol`}>{inline ? 'API 格式' : '服务协议'}</label>
          <TodoSelect id={`${prefix}-protocol`} aria-label={inline ? 'API 格式' : '服务协议'} title={protocolLabel(draft.protocol)} value={draft.protocol} options={PROTOCOL_OPTIONS} disabled={disabled}
            onChange={value => updateDraft({ ...draft, protocol: value as AIProtocol })} />
        </div>
        <div className="ai-config-field full ai-provider-endpoint">
          <label htmlFor={`${prefix}-endpoint`}>{inline ? 'Base URL' : '服务地址'}</label>
          <input ref={endpointInput} id={`${prefix}-endpoint`} type="url" value={draft.endpoint} maxLength={2000} autoComplete="off" placeholder="https://api.example.com/v1" disabled={disabled}
            aria-invalid={invalid === 'endpoint'} aria-describedby={invalid === 'endpoint' ? `${prefix}-error` : undefined}
            onChange={event => updateDraft({ ...draft, endpoint: event.target.value })} />
        </div>
        <div className="ai-config-field full ai-provider-key">
          <label htmlFor={`${prefix}-key`}>API Key <span>{provider?.hasKey ? '已保存' : '可选'}</span></label>
          <div className="ai-config-secret">
            <input id={`${prefix}-key`} type={keyVisible ? 'text' : 'password'} value={draft.apiKey} maxLength={4000} autoComplete="new-password" disabled={disabled}
              placeholder={provider?.hasKey ? '••••••••••••••••' : '填写服务提供的密钥'} aria-label="API Key" title={provider?.hasKey ? '留空保留已保存的密钥' : undefined}
              onChange={event => updateDraft({ ...draft, apiKey: event.target.value })} />
            <IconButton label={keyVisible ? '隐藏密钥' : '显示密钥'} aria-pressed={keyVisible} disabled={disabled || !draft.apiKey} onClick={() => setVisible(!visible)}>
              {keyVisible ? <EyeSlash size={18} /> : <Eye size={18} />}
            </IconButton>
          </div>
        </div>
      </div>
      {(!inline || error) && <div className="ai-config-feedback" id={`${prefix}-error`} role="alert">{error}</div>}
      <footer className="ai-config-footer"><button className="ai-config-button primary" type="submit" disabled={disabled || inline && !dirty}>{busy ? '保存中…' : inline ? '保存配置' : '保存供应商'}</button></footer>
    </form>;
  return inline ? form : <Modal title={`添加${rlcd ? ' RLCD ' : ''}供应商`} className="ai-config-dialog ai-provider-add-dialog" dirty={dirty} busy={busy} close={close}>{form}</Modal>;
}

type ModelEdit = { surface: Surface; providerId: string; model?: ConfigModel; name: string; error?: string };
type Probe = { surface: Surface; id: string; state: 'pending' | 'ok' | 'error'; message: string };
type Removal = { surface: Surface; kind: 'provider' | 'model'; id: string; error?: string };

export function AiSettings({ query }: { query: string }) {
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [addingProvider, setAddingProvider] = useState<Surface | null>(null);
  const [editingProviders, setEditingProviders] = useState<Partial<Record<Surface, string>>>({});
  const [modelEdit, setModelEdit] = useState<ModelEdit | null>(null);
  const [selectedProviders, setSelectedProviders] = useState<Partial<Record<Surface, string>>>({});
  const [sectionOpen, setSectionOpen] = useState<Record<Surface, boolean>>({ llm: true, rlcd: true });
  const [probe, setProbe] = useState<Probe | null>(null);
  const [removal, setRemoval] = useState<Removal | null>(null);
  const deleting = useRef(false);
  const providerConfigButtons = useRef<Partial<Record<Surface, HTMLButtonElement | null>>>({});
  const modelInput = useRef<HTMLInputElement>(null);
  const modelSaveButton = useRef<HTMLButtonElement>(null);
  const modelCancelButton = useRef<HTMLButtonElement>(null);
  const savingModel = useRef(false);

  useEffect(() => { if (query.trim()) setSectionOpen({ llm: true, rlcd: true }); }, [query]);
  useEffect(() => {
    const dismiss = () => document.querySelectorAll<HTMLElement>('.ai-config-help-tooltip:popover-open').forEach(tip => tip.hidePopover());
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', dismiss, true);
    return () => { window.removeEventListener('resize', dismiss); window.removeEventListener('scroll', dismiss, true); };
  }, []);

  useEffect(() => {
    let active = true;
    void api.config().then(raw => { if (active) setConfig(raw); }, cause => { if (active) setError(errorText(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!config) return;
    const existing = new Set([...config.providers.map(provider => `llm:${provider.id}`), ...config.rlcdProviders.map(provider => `rlcd:${provider.id}`)]);
    for (const key of connectionDrafts.keys()) if (!existing.has(key)) connectionDrafts.delete(key);
  }, [config]);

  async function reload() {
    setLoading(true); setError('');
    try { setConfig(await api.config()); }
    catch (cause) { setError(errorText(cause)); }
    finally { setLoading(false); }
  }

  async function mutate(action: () => Promise<AiConfig>, onError?: (message: string) => void) {
    if (busy) return;
    setBusy(true); setError('');
    try { setConfig(await action()); setProbe(null); }
    catch (cause) { (onError ?? setError)(errorText(cause)); }
    finally { setBusy(false); }
  }

  async function removeConfig(target: Removal, confirmation: HTMLButtonElement) {
    if (busy || deleting.current) return;
    deleting.current = true;
    setRemoval(target);
    const { surface, kind, id } = target;
    const removeProvider = surface === 'rlcd' ? api.removeRlcdProvider : api.removeProvider;
    const removeModel = surface === 'rlcd' ? api.removeRlcdModel : api.removeModel;
    try {
      await mutate(async () => {
        const next = await (kind === 'provider' ? removeProvider : removeModel)(id);
        if (confirmation === document.activeElement) {
          const focusTarget = kind === 'provider'
            ? confirmation.closest('.ai-config-section')?.querySelector<HTMLButtonElement>('.ai-config-surface-toggle')
            : confirmation.closest('.ai-config-models')?.querySelector('h3');
          focusTarget?.focus({ preventScroll: true });
        }
        setRemoval(null);
        return next;
      }, error => setRemoval({ ...target, error }));
    } finally { deleting.current = false; }
  }

  async function saveModelName(edit: ModelEdit, input = modelInput.current) {
    if (busy || savingModel.current || !input) return;
    const name = input.value.trim();
    if (!name || name === edit.model?.name) { setModelEdit(null); return; }
    savingModel.current = true;
    try {
      await mutate(async () => {
        const next = await (edit.surface === 'rlcd' ? api.saveRlcdModel : api.saveModel)({ id: edit.model?.id, providerId: edit.providerId, name });
        setModelEdit(null);
        return next;
      }, message => setModelEdit({ ...edit, name, error: message }));
    } finally { savingModel.current = false; }
  }

  function modelEditKeepsFocus(target: EventTarget | null) {
    return target !== null && (target === modelInput.current || target === modelSaveButton.current || target === modelCancelButton.current);
  }

  function discardNewModel(origin: HTMLElement) {
    if (modelInput.current) modelInput.current.value = '';
    const addButton = origin.closest('.ai-config-models')?.querySelector<HTMLButtonElement>('.ai-config-model-head button');
    setModelEdit(null);
    window.requestAnimationFrame(() => addButton?.focus({ preventScroll: true }));
  }

  function modelEditKeyDown(event: KeyboardEvent<HTMLElement>, edit: ModelEdit, saveOnEnter = false) {
    const cancel = event.key === 'Escape';
    if (!cancel && !(saveOnEnter && event.key === 'Enter')) return;
    event.stopPropagation();
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    event.preventDefault();
    if (busy) return;
    if (cancel && !edit.model) { discardNewModel(event.currentTarget); return; }
    if (cancel && modelInput.current) modelInput.current.value = edit.model?.name ?? '';
    event.currentTarget.blur();
  }

  function modelNameInput(edit: ModelEdit) {
    return <div className="ai-config-model-editor">
      <input ref={modelInput} className="ai-config-model-input" autoFocus defaultValue={edit.name} aria-label="模型名称 / ID" placeholder="填写模型名称 / ID"
        maxLength={200} autoComplete="off" spellCheck={false} readOnly={busy}
        aria-invalid={edit.error ? true : undefined} aria-describedby={edit.error ? 'ai-config-model-error' : undefined}
        onBlur={event => {
          if (!modelEditKeepsFocus(event.relatedTarget)) void saveModelName(edit, event.currentTarget);
        }}
        onKeyDown={event => modelEditKeyDown(event, edit, true)} />
      {edit.error && <p id="ai-config-model-error" className="ai-config-model-error" role="alert">{edit.error}</p>}
    </div>;
  }

  async function test(surface: Surface, model: ConfigModel) {
    if (busy) return;
    setBusy(true); setProbe({ surface, id: model.id, state: 'pending', message: '正在测试连接…' });
    try { setProbe({ surface, id: model.id, state: 'ok', message: await (surface === 'rlcd' ? api.testRlcd : api.test)({ providerId: model.providerId, model: model.name }) }); }
    catch (cause) { setProbe({ surface, id: model.id, state: 'error', message: errorText(cause) }); }
    finally { setBusy(false); }
  }

  function saved(next: AiConfig) {
    if (addingProvider && config) {
      const before = addingProvider === 'llm' ? config.providers : config.rlcdProviders;
      const added = (addingProvider === 'llm' ? next.providers : next.rlcdProviders).find(provider => !before.some(previous => previous.id === provider.id));
      if (added) setSelectedProviders(previous => ({ ...previous, [addingProvider]: added.id }));
    }
    setConfig(next); setError(''); setProbe(null);
  }

  if (!config) return <div className="settings-ai"><p className={error ? 'error' : 'help'} role={error ? 'alert' : 'status'}>{loading ? '正在读取 AI 配置…' : error}</p>{!loading && <button className="set-btn" onClick={() => void reload()}>重新加载</button>}</div>;
  const needle = query.trim().toLocaleLowerCase();
  const includes = (value: string) => value.toLocaleLowerCase().includes(needle);
  const sections = [
    { surface: 'llm' as const, title: '对话模型', badge: 'AI 助手使用', help: '供 AI 助手对话与创作；同一供应商共用服务地址和密钥。', providers: config.providers, models: config.models },
    { surface: 'rlcd' as const, title: '决策模型（RLCD）', badge: '实验配置 · 仅保存', help: '独立于对话模型，暂不参与功能，也不会出现在 AI 助手选模中。', providers: config.rlcdProviders, models: config.rlcdModels },
  ];

  return <div className="settings-ai">
    {error && <div className="ai-config-status" role="alert"><span className="error">{error}</span></div>}
    {sections.map(section => {
      const surface = section.surface;
      const providers = section.providers.filter(provider => includes(`${provider.name} ${provider.endpoint} ${protocolLabel(provider.protocol)}`) || section.models.some(model => model.providerId === provider.id && includes(model.name)));
      const preferred = selectedProviders[surface];
      const selected = providers.find(provider => provider.id === preferred) ?? providers[0];
      return <section className="set-rows ai-config-section" key={surface} aria-label={section.title}>
        <div className="ai-config-heading"><div>
          <h2><button type="button" className="ai-config-surface-toggle" aria-expanded={sectionOpen[surface]} aria-controls={`ai-surface-${surface}`} onClick={() => setSectionOpen(previous => ({ ...previous, [surface]: !previous[surface] }))}><CaretDown size={16} /><span>{section.title}</span><span className={`ai-config-surface-badge ${surface}`}>{section.badge}</span></button>
            <span className="ai-config-help" onMouseLeave={event => {
              if (!event.currentTarget.contains(document.activeElement)) event.currentTarget.querySelector<HTMLElement>('[popover]')!.hidePopover();
            }} onBlur={event => {
              if (!event.currentTarget.matches(':hover')) event.currentTarget.querySelector<HTMLElement>('[popover]')!.hidePopover();
            }}>
              <IconButton label={`${section.title}说明`} title={undefined} className="ai-config-help-button" aria-describedby={`ai-config-help-${surface}`} popoverTarget={`ai-config-help-${surface}`}
                onMouseEnter={event => showConfigHelp(event.currentTarget, `ai-config-help-${surface}`)} onFocus={event => showConfigHelp(event.currentTarget, `ai-config-help-${surface}`)}
                onClick={event => { event.preventDefault(); showConfigHelp(event.currentTarget, `ai-config-help-${surface}`); }}><Question size={16} aria-hidden="true" /></IconButton>
              <span id={`ai-config-help-${surface}`} className="ai-scope-tooltip ai-config-help-tooltip" popover="auto" role="tooltip">{section.help}</span>
            </span>
          </h2>
        </div><button type="button" className="ai-config-button primary" disabled={busy || section.providers.length >= 8} title={section.providers.length >= 8 ? '最多保存 8 个供应商' : undefined} onClick={() => setAddingProvider(surface)}><Plus size={15} />添加供应商</button></div>
        <div className="ai-config-surface-panel" id={`ai-surface-${surface}`} data-open={sectionOpen[surface] ? 'true' : 'false'} inert={!sectionOpen[surface]} aria-hidden={!sectionOpen[surface]}>
        <div className="ai-config-surface-clip">
        {providers.length > 0 && <div className="ai-config-workspace">
          <nav className="ai-config-suppliers" aria-label={`${section.title}供应商`}>
            <div className="ai-config-provider-list">{providers.map(provider => <button type="button" key={provider.id} className="ai-config-provider-choice"
              aria-label={`查看${section.title}供应商 ${provider.name}`} title={provider.name} aria-pressed={provider.id === selected.id} aria-controls={`ai-provider-details-${surface}`}
              disabled={busy} onClick={() => setSelectedProviders(previous => ({ ...previous, [surface]: provider.id }))}>
              <LinkSimple className="ai-config-provider-symbol" size={17} aria-hidden="true" />
              <span className="ai-config-provider-label"><strong>{provider.name}</strong><small>{section.models.filter(model => model.providerId === provider.id).length} 个模型</small></span>
            </button>)}</div>
          </nav>
        <div className="ai-config-list" id={`ai-provider-details-${surface}`}>
          {providers.filter(provider => provider.id === selected.id).map(provider => {
            const models = section.models.filter(model => model.providerId === provider.id);
            const edit = modelEdit?.surface === surface && modelEdit.providerId === provider.id ? modelEdit : null;
            const modelRows = edit && !edit.model ? [...models, undefined] : models;
            const editingConfig = editingProviders[surface] === provider.id;
            const configPanelId = `ai-provider-${surface}-${provider.id}-panel`;
            const providerDeleteId = `ai-provider-delete-${surface}-${provider.id}`;
            const providerDeletion = removal?.kind === 'provider' && removal.surface === surface && removal.id === provider.id ? removal : null;
            const removalImpact = [models.length ? `${models.length} 个模型` : '', provider.hasKey ? '已保存的密钥' : ''].filter(Boolean).join('和');
            return <article className="ai-config-card" key={provider.id} aria-label={`${provider.name} 配置`}>
              <header className="ai-config-card-head">
                <div className="ai-config-provider-title">
                  <LinkSimple size={23} aria-hidden="true" />
                  <div>
                    <div className="ai-config-provider-name">
                      <strong>{provider.name}</strong>
                      <IconButton label={editingConfig ? '收起配置' : '编辑配置'} disabled={busy} aria-expanded={editingConfig}
                        ref={element => { providerConfigButtons.current[surface] = element; }}
                        aria-controls={configPanelId}
                        onClick={() => setEditingProviders(previous => ({ ...previous, [surface]: editingConfig ? undefined : provider.id }))}>
                        <PencilSimple size={16} aria-hidden="true" />
                      </IconButton>
                    </div>
                    <div className="ai-config-surface-panel" data-open={!editingConfig} aria-hidden={editingConfig}>
                      <div className="ai-config-surface-clip"><p className="ai-config-provider-summary">{protocolLabel(provider.protocol)} · {provider.hasKey ? '密钥已保存' : '未配置密钥'}</p></div>
                    </div>
                  </div>
                </div>
                <div className="ai-config-card-actions">
                  <IconButton label={`删除供应商 ${provider.name}`} title="删除供应商" className="ai-config-danger" disabled={busy} popoverTarget={providerDeleteId}><Trash size={16} aria-hidden="true" /></IconButton>
                  <div id={providerDeleteId} popover="auto" className="ai-config-delete-confirm ai-config-provider-delete-confirm">
                    <p id={`${providerDeleteId}-detail`}>{removalImpact ? `同时删除 ${removalImpact}` : '删除后无法撤销'}</p>
                    <button type="button" aria-label={`确认删除供应商 ${provider.name}`} aria-disabled={busy || undefined}
                      aria-describedby={`${providerDeleteId}-detail${providerDeletion?.error ? ` ${providerDeleteId}-error` : ''}`}
                      onClick={event => void removeConfig({ surface, kind: 'provider', id: provider.id }, event.currentTarget)}>
                      {providerDeletion && !providerDeletion.error ? '删除中…' : '确认删除'}
                    </button>
                  </div>
                </div>
              </header>
              {providerDeletion?.error && <p id={`${providerDeleteId}-error`} className="ai-config-test-result error" role="alert">{providerDeletion.error}</p>}
              <ProviderConfigPanel id={configPanelId} open={editingConfig}>
                <ProviderEditor key={`${provider.id}:${provider.name}:${provider.endpoint}:${provider.protocol}:${provider.hasKey}`} surface={surface} provider={provider} blocked={busy} expanded={editingConfig && sectionOpen[surface]} onBusyChange={setBusy} saved={saved} close={() => {
                  const button = providerConfigButtons.current[surface];
                  setEditingProviders(previous => ({ ...previous, [surface]: undefined }));
                  window.requestAnimationFrame(() => button?.focus({ preventScroll: true }));
                }} />
              </ProviderConfigPanel>
              <div className="ai-config-models" id={`ai-models-${provider.id}`}>
                <div className="ai-config-model-head"><h3 tabIndex={-1}>模型列表 <span>{models.length}</span></h3><button type="button" className="ai-config-link" disabled={busy || models.length >= 8} title={models.length >= 8 ? '每个供应商最多保存 8 个模型' : undefined} onClick={() => setModelEdit({ surface, providerId: provider.id, name: '' })}><Plus size={14} />添加模型</button></div>
                {modelRows.length ? <ul>{modelRows.map(model => {
                  const deleteId = model ? `ai-model-delete-${surface}-${model.id}` : undefined;
                  const deletion = model && removal?.kind === 'model' && removal.surface === surface && removal.id === model.id ? removal : null;
                  const supportsImages = !!model && 'supportsImages' in model && model.supportsImages === true;
                  const editing = edit && edit.model?.id === model?.id ? edit : null;
                  const modelLabel = model ? ` ${model.name}` : '';
                  const probing = model && probe?.surface === surface && probe.id === model.id ? probe : null;
                  return <li key={model?.id ?? 'new-model'}>
                  <div className="ai-config-model-row">
                    <div className="ai-config-model-name">
                      {model && <span className="ai-config-model-label" aria-hidden={!!editing || undefined}>{model.name}</span>}
                      {editing && modelNameInput(editing)}
                    </div>
                    <div className="ai-config-model-actions">
                      <IconButton label={`测试连接${modelLabel}`} title={probing?.state === 'pending' ? '测试中…' : model ? '测试连接' : '保存后可测试连接'} disabled={busy || !model} tabIndex={editing ? -1 : undefined} onClick={model ? () => void test(surface, model) : undefined}><Lightning size={16} /></IconButton>
                      <IconButton label={`${editing ? '保存' : '编辑'}模型${modelLabel}`} ref={editing ? modelSaveButton : undefined} className={editing ? 'ai-config-model-save' : undefined} disabled={busy}
                        onClick={() => {
                          if (editing) void saveModelName(editing);
                          else if (model) setModelEdit({ surface, providerId: provider.id, model, name: model.name });
                        }}
                        onBlur={editing ? event => {
                          if (!modelEditKeepsFocus(event.relatedTarget)) void saveModelName(editing);
                        } : undefined}
                        onKeyDown={editing ? event => modelEditKeyDown(event, editing) : undefined}
                      >{editing ? <Check size={16} /> : <PencilSimple size={16} />}</IconButton>
                      {surface === 'llm' && <IconButton label={`多模态${modelLabel}`} className="ai-config-multimodal" aria-pressed={supportsImages}
                        title={!model ? '保存后可设置图片输入' : supportsImages ? '多模态已开启（图片输入），点击关闭' : '多模态已关闭，点击开启图片输入'}
                        disabled={busy || !model} onClick={model ? () => void mutate(() => api.saveModel({ id: model.id, providerId: model.providerId, name: model.name, supportsImages: !supportsImages })) : undefined}>{supportsImages ? <Eye size={18} /> : <EyeSlash size={18} />}</IconButton>}
                      <IconButton label={model ? `删除模型${modelLabel}` : '取消新增模型'} title={model ? '删除模型' : '取消新增模型'} className="ai-config-danger" disabled={busy} popoverTarget={deleteId}
                        ref={model ? undefined : modelCancelButton} onClick={model ? undefined : event => discardNewModel(event.currentTarget)}
                        onBlur={!model && editing ? event => {
                          if (!modelEditKeepsFocus(event.relatedTarget)) void saveModelName(editing);
                        } : undefined}
                        onKeyDown={!model && editing ? event => modelEditKeyDown(event, editing) : undefined}>
                        <Trash size={16} aria-hidden="true" />
                      </IconButton>
                      {model && <button type="button" id={deleteId} popover="auto" className="ai-config-delete-confirm"
                        aria-label={`确认删除模型 ${model.name}`} aria-disabled={busy || undefined} aria-describedby={deletion?.error ? `${deleteId}-error` : undefined}
                        onClick={event => void removeConfig({ surface, kind: 'model', id: model.id }, event.currentTarget)}>
                        {deletion && !deletion.error ? '删除中…' : '确认删除'}
                      </button>}
                    </div>
                  </div>
                  {probing && <p className={`ai-config-test-result ${probing.state}`} role={probing.state === 'error' ? 'alert' : 'status'}>{probing.state === 'ok' ? '连接成功 · ' : probing.state === 'error' ? '连接失败 · ' : ''}{probing.message}</p>}
                  {deletion?.error && <p id={`${deleteId}-error`} className="ai-config-test-result error" role="alert">{deletion.error}</p>}
                </li>;
                })}</ul> : <p className="ai-config-empty-models">还没有模型，点击“添加模型”填写服务提供的模型 ID。</p>}
              </div>
            </article>;
          })}
        </div>
        </div>}
          {!providers.length && <div className="ai-config-empty" role="status"><strong>{needle ? '没有匹配的供应商或模型' : '还没有供应商'}</strong><p>{needle ? '试试供应商名称、服务地址或模型 ID。' : surface === 'rlcd' ? '可添加 TypeSafe、OpenRouter 或自定义服务；当前仅保存配置。' : '从“添加供应商”开始，再为它添加模型。支持 DeepSeek、OpenAI、Anthropic 和自定义服务。'}</p></div>}
        </div>
        </div>
      </section>;
    })}
    {addingProvider && <ProviderEditor surface={addingProvider} provider={null} saved={saved} close={() => setAddingProvider(null)} />}
  </div>;
}
