import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CaretDown, Eye, EyeSlash, Lightning, LinkSimple, PencilSimple, Plus, Question, Trash } from '@phosphor-icons/react';
import { AI_PROVIDER_PRESETS, RLCD_PROVIDER_PRESETS, type AIModel, type AIProtocol, type AIProvider, type AIProviderKind, type RlcdModel, type RlcdProvider, type RlcdProviderKind } from '../../shared/todo-contracts';
import { errorText, IconButton, Modal, Select as TodoSelect } from '../ui/controls';
import type { AiConfig } from '../../shared/workbench-api';
import { GameOptionsMenu } from './GameOptionsMenu';

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
type ConnectionDraft = { endpoint: string; protocol: AIProtocol; apiKey: string; clearKey: boolean };
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

function ProviderEditor({ surface, provider, saved, close, inline = false, blocked = false, onBusyChange }: {
  surface: Surface; provider: ConfigProvider | null; saved(config: AiConfig): void; close(): void;
  inline?: boolean; blocked?: boolean; onBusyChange?(busy: boolean): void;
}) {
  const rlcd = surface === 'rlcd';
  const draftKey = `${surface}:${provider?.id}`;
  const prefix = inline ? `ai-provider-${surface}-${provider!.id}` : 'ai-provider';
  const preset = rlcd ? RLCD_PROVIDER_PRESETS.typesafe : AI_PROVIDER_PRESETS.deepseek;
  const [initial, setInitial] = useState(() => ({
    kind: provider?.kind ?? (rlcd ? 'typesafe' : 'deepseek') as AIProviderKind | RlcdProviderKind,
    name: provider?.name ?? preset.name,
    endpoint: provider?.endpoint ?? preset.endpoint,
    protocol: provider?.protocol ?? preset.protocol,
    apiKey: '', clearKey: false,
  }));
  const [draft, setDraft] = useState(() => inline ? { ...initial, ...connectionDrafts.get(draftKey) } : initial);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [invalid, setInvalid] = useState<'name' | 'endpoint' | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const endpointInput = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const disabled = busy || blocked;
  function updateDraft(next: typeof initial) {
    setDraft(next);
    if (inline) {
      if (JSON.stringify(next) === JSON.stringify(initial)) connectionDrafts.delete(draftKey);
      else connectionDrafts.set(draftKey, { endpoint: next.endpoint, protocol: next.protocol, apiKey: next.apiKey, clearKey: next.clearKey });
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (disabled) return;
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
        const persisted = (rlcd ? next.rlcdProviders : next.providers).find(item => item.id === provider!.id)!;
        const clean = { ...draft, name: persisted.name, endpoint: persisted.endpoint, protocol: persisted.protocol, apiKey: '', clearKey: false };
        connectionDrafts.delete(draftKey); setInitial(clean); setDraft(clean); setVisible(false);
      }
      saved(next);
    }
    catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); onBusyChange?.(false); }
  }

  const form = <form className={inline ? 'ai-provider-inline' : undefined} aria-label={inline ? `${provider!.name}连接配置` : undefined} aria-busy={disabled || undefined} noValidate onSubmit={event => void save(event)} onKeyDown={event => { if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault(); }}>
      <div className="ai-config-fields">
        {!provider && <div className="ai-config-field full">
          <label htmlFor={`${prefix}-kind`}>供应商类型</label>
          <TodoSelect id={`${prefix}-kind`} aria-label="供应商类型" value={draft.kind} disabled={disabled || Boolean(draft.apiKey)} options={rlcd ? RLCD_KIND_OPTIONS : LLM_KIND_OPTIONS}
            onChange={value => { const kind = value as AIProviderKind | RlcdProviderKind; updateDraft({ ...draft, kind, ...(rlcd ? RLCD_PROVIDER_PRESETS[kind as RlcdProviderKind] : AI_PROVIDER_PRESETS[kind as AIProviderKind]) }); }} />
          <span className="field-help">预设会填入服务地址和协议；填写密钥后不能切换类型。</span>
        </div>}
        {!inline && <div className="ai-config-field">
          <label htmlFor={`${prefix}-name`}>供应商名称</label>
          <input ref={nameInput} id={`${prefix}-name`} value={draft.name} maxLength={30} autoComplete="off" placeholder={rlcd ? '例如 TypeSafe' : '例如 DeepSeek'} disabled={disabled}
            aria-invalid={invalid === 'name'} aria-describedby={invalid === 'name' ? `${prefix}-error` : undefined}
            onChange={event => updateDraft({ ...draft, name: event.target.value })} />
        </div>}
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
          <label htmlFor={`${prefix}-key`}>API Key <span>{provider?.hasKey && !draft.clearKey ? '已保存' : '可选'}</span></label>
          <div className="ai-config-secret">
            <input id={`${prefix}-key`} type={visible ? 'text' : 'password'} value={draft.apiKey} maxLength={4000} autoComplete="new-password" disabled={disabled}
              placeholder={provider?.hasKey && !draft.clearKey ? inline ? '••••••••••••••••' : '留空保留已保存的密钥' : '填写服务提供的密钥'} aria-label="API Key" title={provider?.hasKey && !draft.clearKey ? '留空保留已保存的密钥' : undefined} aria-describedby={!inline || draft.clearKey ? `${prefix}-key-help` : undefined}
              onChange={event => updateDraft({ ...draft, apiKey: event.target.value, clearKey: false })} />
            <IconButton label={visible ? '隐藏密钥' : '显示密钥'} aria-pressed={visible} disabled={disabled || !draft.apiKey} onClick={() => setVisible(!visible)}>
              {visible ? <EyeSlash size={18} /> : <Eye size={18} />}
            </IconButton>
          </div>
          <div className="ai-config-key-help">
            {(!inline || draft.clearKey) && <span className="field-help" id={`${prefix}-key-help`}>{draft.clearKey ? '保存后移除密钥。' : '同一供应商的模型共用密钥，保存在本机。'}</span>}
            {provider?.hasKey && <button type="button" className="ai-config-link" disabled={disabled} onClick={() => updateDraft({ ...draft, apiKey: '', clearKey: !draft.clearKey })}>{draft.clearKey ? '保留原密钥' : '移除密钥'}</button>}
          </div>
        </div>
      </div>
      {(!inline || error) && <div className="ai-config-feedback" id={`${prefix}-error`} role="alert">{error}</div>}
      <footer className="ai-config-footer">{!inline && <span>点击保存后生效</span>}<button className="ai-config-button primary" type="submit" disabled={disabled || inline && !dirty}>{busy ? '保存中…' : inline ? '保存配置' : '保存供应商'}</button></footer>
    </form>;
  return inline ? form : <Modal title={provider ? `编辑${rlcd ? ' RLCD ' : ''}供应商` : `添加${rlcd ? ' RLCD ' : ''}供应商`} className="ai-config-dialog" dirty={dirty} busy={busy} close={close}>{form}</Modal>;
}

function ModelEditor({ surface, provider, model, saved, close }: {
  surface: Surface; provider: ConfigProvider; model?: ConfigModel; saved(config: AiConfig): void; close(): void;
}) {
  const rlcd = surface === 'rlcd';
  const [name, setName] = useState(model?.name ?? '');
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);

  async function run(action: 'save' | 'test') {
    if (busy) return;
    setError(''); setNotice('');
    if (!name.trim()) { setError('请填写模型名称或 ID。'); input.current?.focus(); return; }
    setBusy(action);
    try {
      if (action === 'test') setNotice(await (rlcd ? api.testRlcd : api.test)({ providerId: provider.id, model: name.trim() }));
      else saved(await (rlcd ? api.saveRlcdModel : api.saveModel)({ id: model?.id, providerId: provider.id, name: name.trim() }));
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(null); }
  }

  return <Modal title={model ? `编辑${rlcd ? ' RLCD ' : ''}模型` : `添加${rlcd ? ' RLCD ' : ''}模型`} className="ai-config-dialog" dirty={name !== (model?.name ?? '')} close={() => { if (!busy) close(); }}>
    <form noValidate onSubmit={event => { event.preventDefault(); void run('save'); }} onKeyDown={event => { if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault(); }}>
      <p className="ai-config-context">{provider.name} · {protocolLabel(provider.protocol)}</p>
      <div className="ai-config-field">
        <label htmlFor="ai-model-name">模型名称 / ID</label>
        <input ref={input} id="ai-model-name" autoFocus value={name} maxLength={200} autoComplete="off" disabled={Boolean(busy)} placeholder={rlcd ? '例如决策模型 ID' : '例如 deepseek-chat'} aria-invalid={Boolean(error) && !name.trim()} aria-describedby="ai-model-feedback"
          onChange={event => { setName(event.target.value); setError(''); setNotice(''); }} />
        <span className="field-help">使用服务提供的模型 ID。测试连接不会保存配置。</span>
      </div>
      <div className="ai-config-feedback" id="ai-model-feedback">{error ? <span role="alert">{error}</span> : <span className="ai-config-success" role="status">{notice}</span>}</div>
      <footer className="ai-config-footer">
        <button type="button" className="ai-config-button" disabled={Boolean(busy)} onClick={() => void run('test')}><Lightning size={15} />{busy === 'test' ? '测试中…' : '测试连接'}</button>
        <button type="submit" className="ai-config-button primary" disabled={Boolean(busy)}>{busy === 'save' ? '保存中…' : model ? '保存模型' : '添加模型'}</button>
      </footer>
    </form>
  </Modal>;
}

type Editor = { type: 'provider'; surface: Surface; provider: ConfigProvider | null } | { type: 'model'; surface: Surface; provider: ConfigProvider; model?: ConfigModel };
type Probe = { surface: Surface; id: string; state: 'pending' | 'ok' | 'error'; message: string };

export function AiSettings({ query }: { query: string }) {
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [selectedProviders, setSelectedProviders] = useState<Partial<Record<Surface, string>>>({});
  const [sectionOpen, setSectionOpen] = useState<Record<Surface, boolean>>({ llm: true, rlcd: true });
  const [probe, setProbe] = useState<Probe | null>(null);
  const [removing, setRemoving] = useState<{ title: string; detail: string; action(): Promise<AiConfig> } | null>(null);
  const [removeError, setRemoveError] = useState('');
  const keepButton = useRef<HTMLButtonElement>(null);

  useEffect(() => { if (removing) keepButton.current?.focus(); }, [removing]);
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

  async function mutate(action: () => Promise<AiConfig>) {
    if (busy) return;
    setBusy(true); setError(''); setRemoveError('');
    try { setConfig(await action()); setRemoving(null); setProbe(null); }
    catch (cause) { if (removing) setRemoveError(errorText(cause)); else setError(errorText(cause)); }
    finally { setBusy(false); }
  }

  async function test(surface: Surface, model: ConfigModel) {
    if (busy) return;
    setBusy(true); setProbe({ surface, id: model.id, state: 'pending', message: '正在测试连接…' });
    try { setProbe({ surface, id: model.id, state: 'ok', message: await (surface === 'rlcd' ? api.testRlcd : api.test)({ providerId: model.providerId, model: model.name }) }); }
    catch (cause) { setProbe({ surface, id: model.id, state: 'error', message: errorText(cause) }); }
    finally { setBusy(false); }
  }

  function saved(next: AiConfig) {
    if (editor?.type === 'provider' && !editor.provider && config) {
      const before = editor.surface === 'llm' ? config.providers : config.rlcdProviders;
      const added = (editor.surface === 'llm' ? next.providers : next.rlcdProviders).find(provider => !before.some(previous => previous.id === provider.id));
      if (added) setSelectedProviders(previous => ({ ...previous, [editor.surface]: added.id }));
    }
    setConfig(next); setEditor(null); setError(''); setProbe(null);
  }

  if (!config) return <div className="settings-ai"><p className={error ? 'error' : 'help'} role={error ? 'alert' : 'status'}>{loading ? '正在读取 AI 配置…' : error}</p>{!loading && <button className="set-btn" onClick={() => void reload()}>重新加载</button>}</div>;
  const current = config.models.find(model => model.id === config.activeModelId) ?? config.models[0];
  const enableHint = !current ? '先添加供应商和模型，即可启用。' : config.aiEnabled ? `当前模型：${current.name}` : '开启后，使用当前模型进行对话与创作。';
  const needle = query.trim().toLocaleLowerCase();
  const includes = (value: string) => value.toLocaleLowerCase().includes(needle);
  const sections = [
    { surface: 'llm' as const, title: '对话模型', badge: 'AI 助手使用', help: '供 AI 助手对话与创作；同一供应商共用服务地址和密钥。', providers: config.providers, models: config.models },
    { surface: 'rlcd' as const, title: '决策模型（RLCD）', badge: '实验配置 · 仅保存', help: '独立于对话模型，暂不参与功能，也不会出现在 AI 助手选模中。', providers: config.rlcdProviders, models: config.rlcdModels },
  ];

  return <div className="settings-ai">
    <div className="set-rows"><div className="set-row ai-config-enable">
      <div className="txt"><b>启用 AI 助手</b><span title={enableHint}>{enableHint}</span></div>
      <div className="ctl"><button type="button" className="toggle" role="switch" aria-label="启用 AI" aria-checked={config.aiEnabled} disabled={busy || !current}
        onClick={() => void mutate(() => api.setEnabled(!config.aiEnabled))} /></div>
    </div></div>
    {error && <div className="ai-config-status" role="alert"><span className="error">{error}</span></div>}
    {sections.map(section => {
      const surface = section.surface;
      const providers = section.providers.filter(provider => includes(`${provider.name} ${provider.endpoint} ${protocolLabel(provider.protocol)}`) || section.models.some(model => model.providerId === provider.id && includes(model.name)));
      const preferred = selectedProviders[surface] ?? (surface === 'llm' ? current?.providerId : undefined);
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
        </div><button type="button" className="ai-config-button primary" disabled={busy || section.providers.length >= 8} title={section.providers.length >= 8 ? '最多保存 8 个供应商' : undefined} onClick={() => setEditor({ type: 'provider', surface, provider: null })}><Plus size={16} />添加供应商</button></div>
        <div className="ai-config-surface-panel" id={`ai-surface-${surface}`} data-open={sectionOpen[surface] ? 'true' : 'false'} inert={!sectionOpen[surface]} aria-hidden={!sectionOpen[surface]}>
        <div className="ai-config-surface-clip">
        {providers.length > 0 && <div className="ai-config-workspace">
          <nav className="ai-config-suppliers" aria-label={`${section.title}供应商`}>
            <div className="ai-config-provider-list">{providers.map(provider => <button type="button" key={provider.id} className="ai-config-provider-choice"
              aria-label={`查看${section.title}供应商 ${provider.name}`} title={provider.name} aria-pressed={provider.id === selected.id} aria-controls={`ai-provider-details-${surface}`}
              disabled={busy} onClick={() => setSelectedProviders(previous => ({ ...previous, [surface]: provider.id }))}>
              <span className="ai-config-provider-symbol" aria-hidden="true"><LinkSimple size={20} /></span>
              <span className="ai-config-provider-label"><strong>{provider.name}</strong><small>{section.models.filter(model => model.providerId === provider.id).length} 个模型</small></span>
            </button>)}</div>
          </nav>
        <div className="ai-config-list" id={`ai-provider-details-${surface}`}>
          {providers.filter(provider => provider.id === selected.id).map(provider => {
            const models = section.models.filter(model => model.providerId === provider.id);
            return <article className="ai-config-card" key={provider.id} aria-label={`${provider.name} 配置`}>
              <header className="ai-config-card-head">
                <div className="ai-config-provider-title"><LinkSimple size={23} aria-hidden="true" /><strong>{provider.name}</strong></div>
                <div className="ai-config-card-actions">
                  <GameOptionsMenu kind="project" label={`供应商 ${provider.name} 更多操作`} active={!busy && sectionOpen[surface]} context={`${surface}:${provider.id}:${query}`}>{close => <>
                    <button type="button" role="menuitem" disabled={busy} onClick={() => { close(); setEditor({ type: 'provider', surface, provider }); }}><PencilSimple size={16} />编辑供应商</button>
                    <button type="button" role="menuitem" className="ai-config-danger" disabled={busy} onClick={() => { close(); setRemoveError(''); setRemoving({ title: `删除${surface === 'rlcd' ? ' RLCD ' : ''}供应商「${provider.name}」？`, detail: `将移除该供应商、已保存的密钥及其 ${models.length} 个模型。此操作无法撤销。`, action: () => (surface === 'rlcd' ? api.removeRlcdProvider : api.removeProvider)(provider.id) }); }}><Trash size={16} />删除供应商</button>
                  </>}</GameOptionsMenu>
                </div>
              </header>
              <ProviderEditor key={`${provider.id}:${provider.name}:${provider.endpoint}:${provider.protocol}:${provider.hasKey}`} surface={surface} provider={provider} inline blocked={busy} onBusyChange={setBusy} saved={saved} close={() => setEditor(null)} />
              <div className="ai-config-models" id={`ai-models-${provider.id}`}>
                <div className="ai-config-model-head"><h3>模型列表 <span>{models.length}</span></h3><button type="button" className="ai-config-link" disabled={busy || models.length >= 8} title={models.length >= 8 ? '每个供应商最多保存 8 个模型' : undefined} onClick={() => setEditor({ type: 'model', surface, provider })}><Plus size={14} />添加模型</button></div>
                {models.length ? <ul>{models.map(model => {
                  const supportsImages = 'supportsImages' in model && model.supportsImages === true;
                  return <li key={model.id}>
                  <div className="ai-config-model-row"><span className="ai-config-model-name">{model.name}{surface === 'llm' && current?.id === model.id && <small className="ai-config-badge">当前使用</small>}</span>
                    <div className="ai-config-model-actions">
                      <IconButton label={`测试连接 ${model.name}`} title={probe?.surface === surface && probe.id === model.id && probe.state === 'pending' ? '测试中…' : '测试连接'} disabled={busy} onClick={() => void test(surface, model)}><Lightning size={16} /></IconButton>
                      <IconButton label={`编辑模型 ${model.name}`} disabled={busy} onClick={() => setEditor({ type: 'model', surface, provider, model })}><PencilSimple size={16} /></IconButton>
                      {surface === 'llm' && <IconButton label={`多模态 ${model.name}`} className="ai-config-multimodal" aria-pressed={supportsImages} title={supportsImages ? '多模态已开启（图片输入），点击关闭' : '多模态已关闭，点击开启图片输入'} disabled={busy} onClick={() => void mutate(() => api.saveModel({ id: model.id, providerId: model.providerId, name: model.name, supportsImages: !supportsImages }))}>{supportsImages ? <Eye size={18} /> : <EyeSlash size={18} />}</IconButton>}
                      <GameOptionsMenu kind="project" label={`模型 ${model.name} 更多操作`} active={!busy && sectionOpen[surface]} context={`${surface}:${model.id}:${query}`}>{close => <button type="button" role="menuitem" className="ai-config-danger" disabled={busy} onClick={() => { close(); setRemoveError(''); setRemoving({ title: `删除${surface === 'rlcd' ? ' RLCD ' : ''}模型「${model.name}」？`, detail: '将移除该模型配置，供应商和其他模型会保留。', action: () => (surface === 'rlcd' ? api.removeRlcdModel : api.removeModel)(model.id) }); }}><Trash size={16} />删除模型</button>}</GameOptionsMenu>
                    </div>
                  </div>
                  {probe?.surface === surface && probe.id === model.id && <p className={`ai-config-test-result ${probe.state}`} role={probe.state === 'error' ? 'alert' : 'status'}>{probe.state === 'ok' ? '连接成功 · ' : probe.state === 'error' ? '连接失败 · ' : ''}{probe.message}</p>}
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
    {editor?.type === 'provider' && <ProviderEditor surface={editor.surface} provider={editor.provider} saved={saved} close={() => setEditor(null)} />}
    {editor?.type === 'model' && <ModelEditor surface={editor.surface} provider={editor.provider} model={editor.model} saved={saved} close={() => setEditor(null)} />}
    {removing && <Modal title={removing.title} className="ai-config-dialog" close={() => { if (!busy) setRemoving(null); }}>
      <div className="ai-config-confirm"><p>{removing.detail}</p>{removeError && <p className="error" role="alert">{removeError}</p>}<div className="ai-config-footer">
        <button ref={keepButton} type="button" className="ai-config-button" autoFocus disabled={busy} onClick={() => setRemoving(null)}>保留</button>
        <button type="button" className="ai-config-button danger" disabled={busy} onClick={() => void mutate(removing.action)}>{busy ? '删除中…' : '确认删除'}</button>
      </div></div>
    </Modal>}
  </div>;
}
