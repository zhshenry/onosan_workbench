import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CaretDown, Eye, EyeSlash, Key, Lightning, PencilSimple, Plus, Trash } from '@phosphor-icons/react';
import { AI_PROVIDER_PRESETS, RLCD_PROVIDER_PRESETS, type AIModel, type AIProtocol, type AIProvider, type AIProviderKind, type RlcdModel, type RlcdProvider, type RlcdProviderKind } from '../../shared/todo-contracts';
import { errorText, IconButton, Modal, Select as TodoSelect } from '../../modules/todo/ui/ui';
import type { AiConfig } from './AiPanel';

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
const protocolLabel = (protocol: AIProtocol) => PROTOCOL_OPTIONS.find(option => option.value === protocol)?.label ?? protocol;

function ProviderEditor({ surface, provider, saved, close }: {
  surface: Surface; provider: ConfigProvider | null; saved(config: AiConfig): void; close(): void;
}) {
  const rlcd = surface === 'rlcd';
  const preset = rlcd ? RLCD_PROVIDER_PRESETS.typesafe : AI_PROVIDER_PRESETS.deepseek;
  const [initial] = useState(() => ({
    kind: provider?.kind ?? (rlcd ? 'typesafe' : 'deepseek') as AIProviderKind | RlcdProviderKind,
    name: provider?.name ?? preset.name,
    endpoint: provider?.endpoint ?? preset.endpoint,
    protocol: provider?.protocol ?? preset.protocol,
    apiKey: '', clearKey: false,
  }));
  const [draft, setDraft] = useState(initial);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [invalid, setInvalid] = useState<'name' | 'endpoint' | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const endpointInput = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
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
    setBusy(true);
    try { saved(await (rlcd ? api.saveRlcdProvider : api.saveProvider)({ ...draft, id: provider?.id, name: draft.name.trim(), endpoint: draft.endpoint.trim(), apiKey: draft.apiKey || undefined }) as AiConfig); }
    catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }

  return <Modal title={provider ? `编辑${rlcd ? ' RLCD ' : ''}供应商` : `添加${rlcd ? ' RLCD ' : ''}供应商`} className="ai-config-dialog" dirty={dirty} close={() => { if (!busy) close(); }}>
    <form noValidate onSubmit={event => void save(event)} onKeyDown={event => { if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault(); }}>
      <div className="ai-config-fields">
        {!provider && <div className="ai-config-field full">
          <label htmlFor="ai-provider-kind">供应商类型</label>
          <TodoSelect id="ai-provider-kind" aria-label="供应商类型" value={draft.kind} disabled={busy || Boolean(draft.apiKey)} options={rlcd ? RLCD_KIND_OPTIONS : LLM_KIND_OPTIONS}
            onChange={value => { const kind = value as AIProviderKind | RlcdProviderKind; setDraft({ ...draft, kind, ...(rlcd ? RLCD_PROVIDER_PRESETS[kind as RlcdProviderKind] : AI_PROVIDER_PRESETS[kind as AIProviderKind]) }); }} />
          <span className="field-help">预设会填入服务地址和协议；填写密钥后不能切换类型。</span>
        </div>}
        <div className="ai-config-field">
          <label htmlFor="ai-provider-name">供应商名称</label>
          <input ref={nameInput} id="ai-provider-name" value={draft.name} maxLength={30} autoComplete="off" placeholder={rlcd ? '例如 TypeSafe' : '例如 DeepSeek'} disabled={busy}
            aria-invalid={invalid === 'name'} aria-describedby={invalid === 'name' ? 'ai-provider-error' : undefined}
            onChange={event => setDraft({ ...draft, name: event.target.value })} />
        </div>
        <div className="ai-config-field">
          <label htmlFor="ai-provider-protocol">服务协议</label>
          <TodoSelect id="ai-provider-protocol" aria-label="服务协议" value={draft.protocol} options={PROTOCOL_OPTIONS} disabled={busy}
            onChange={value => setDraft({ ...draft, protocol: value as AIProtocol })} />
        </div>
        <div className="ai-config-field full">
          <label htmlFor="ai-provider-endpoint">服务地址</label>
          <input ref={endpointInput} id="ai-provider-endpoint" type="url" value={draft.endpoint} maxLength={2000} autoComplete="off" placeholder="https://api.example.com/v1" disabled={busy}
            aria-invalid={invalid === 'endpoint'} aria-describedby={invalid === 'endpoint' ? 'ai-provider-error' : undefined}
            onChange={event => setDraft({ ...draft, endpoint: event.target.value })} />
        </div>
        <div className="ai-config-field full">
          <label htmlFor="ai-provider-key">API Key <span>{provider?.hasKey && !draft.clearKey ? '已保存' : '可选'}</span></label>
          <div className="ai-config-secret">
            <input id="ai-provider-key" type={visible ? 'text' : 'password'} value={draft.apiKey} maxLength={4000} autoComplete="new-password" disabled={busy}
              placeholder={provider?.hasKey && !draft.clearKey ? '留空保留已保存的密钥' : '填写服务提供的密钥'} aria-describedby="ai-key-help"
              onChange={event => setDraft({ ...draft, apiKey: event.target.value, clearKey: false })} />
            <IconButton label={visible ? '隐藏密钥' : '显示密钥'} aria-pressed={visible} disabled={busy || !draft.apiKey} onClick={() => setVisible(!visible)}>
              {visible ? <EyeSlash size={18} /> : <Eye size={18} />}
            </IconButton>
          </div>
          <div className="ai-config-key-help">
            <span className="field-help" id="ai-key-help">{draft.clearKey ? '保存后移除密钥。' : '同一供应商的模型共用密钥，保存在本机。'}</span>
            {provider?.hasKey && <button type="button" className="ai-config-link" disabled={busy} onClick={() => setDraft({ ...draft, apiKey: '', clearKey: !draft.clearKey })}>{draft.clearKey ? '保留原密钥' : '移除密钥'}</button>}
          </div>
        </div>
      </div>
      <div className="ai-config-feedback" id="ai-provider-error" role="alert">{error}</div>
      <footer className="ai-config-footer"><span>点击保存后生效</span><button className="ai-config-button primary" type="submit" disabled={busy}>{busy ? '保存中…' : '保存供应商'}</button></footer>
    </form>
  </Modal>;
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
      else saved(await (rlcd ? api.saveRlcdModel : api.saveModel)({ id: model?.id, providerId: provider.id, name: name.trim() }) as AiConfig);
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
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [sectionOpen, setSectionOpen] = useState<Record<Surface, boolean>>({ llm: true, rlcd: true });
  const [probe, setProbe] = useState<Probe | null>(null);
  const [removing, setRemoving] = useState<{ title: string; detail: string; action(): Promise<unknown> } | null>(null);
  const [removeError, setRemoveError] = useState('');
  const keepButton = useRef<HTMLButtonElement>(null);

  useEffect(() => { if (removing) keepButton.current?.focus(); }, [removing]);
  useEffect(() => { if (query.trim()) { setCollapsed([]); setSectionOpen({ llm: true, rlcd: true }); } }, [query]);

  useEffect(() => {
    let active = true;
    void api.config().then(raw => { if (active) setConfig(raw as AiConfig); }, cause => { if (active) setError(errorText(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function reload() {
    setLoading(true); setError('');
    try { setConfig(await api.config() as AiConfig); }
    catch (cause) { setError(errorText(cause)); }
    finally { setLoading(false); }
  }

  async function mutate(action: () => Promise<unknown>, message: string) {
    if (busy) return;
    setBusy(true); setError(''); setRemoveError(''); setNotice('');
    try { setConfig(await action() as AiConfig); setNotice(message); setRemoving(null); setProbe(null); }
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
    setConfig(next); setEditor(null); setError(''); setProbe(null); setNotice('配置已保存');
  }

  if (!config) return <div className="settings-ai"><p className={error ? 'error' : 'help'} role={error ? 'alert' : 'status'}>{loading ? '正在读取 AI 配置…' : error}</p>{!loading && <button className="set-btn" onClick={() => void reload()}>重新加载</button>}</div>;
  const current = config.models.find(model => model.id === config.activeModelId) ?? config.models[0];
  const needle = query.trim().toLocaleLowerCase();
  const includes = (value: string) => value.toLocaleLowerCase().includes(needle);
  const sections = [
    { surface: 'llm' as const, title: '对话模型', badge: 'AI 助手使用', help: '供 AI 助手对话与创作；同一供应商共用服务地址和密钥。', providers: config.providers, models: config.models },
    { surface: 'rlcd' as const, title: '决策模型（RLCD）', badge: '实验配置 · 仅保存', help: '独立于对话模型，暂不参与功能，也不会出现在 AI 助手选模中。', providers: config.rlcdProviders, models: config.rlcdModels },
  ];

  return <div className="settings-ai">
    <div className="set-rows"><div className="set-row">
      <div className="txt"><b>启用 AI 助手</b><span>{!current ? '先添加供应商和模型，即可启用。' : config.aiEnabled ? `当前模型：${current.name}` : '开启后，使用当前模型进行对话与创作。'}</span></div>
      <div className="ctl"><button type="button" className="toggle" role="switch" aria-label="启用 AI" aria-checked={config.aiEnabled} disabled={busy || !current}
        onClick={() => void mutate(() => api.setEnabled(!config.aiEnabled), config.aiEnabled ? 'AI 助手已关闭' : 'AI 助手已启用')} /></div>
    </div></div>
    <div className="ai-config-status" aria-live="polite">{error ? <span className="error" role="alert">{error}</span> : notice}</div>
    {sections.map(section => {
      const surface = section.surface;
      const providers = section.providers.filter(provider => includes(`${provider.name} ${provider.endpoint} ${protocolLabel(provider.protocol)}`) || section.models.some(model => model.providerId === provider.id && includes(model.name)));
      return <section className="ai-config-section" key={surface} aria-label={section.title}>
        <div className="ai-config-heading"><div>
          <h2><button type="button" className="ai-config-surface-toggle" aria-expanded={sectionOpen[surface]} aria-controls={`ai-surface-${surface}`} onClick={() => setSectionOpen(previous => ({ ...previous, [surface]: !previous[surface] }))}><CaretDown size={16} /><span>{section.title}</span><span className={`ai-config-surface-badge ${surface}`}>{section.badge}</span></button></h2>
          <p>{section.help}</p>
        </div><button type="button" className="ai-config-button primary" disabled={busy || section.providers.length >= 8} title={section.providers.length >= 8 ? '最多保存 8 个供应商' : undefined} onClick={() => setEditor({ type: 'provider', surface, provider: null })}><Plus size={16} />添加供应商</button></div>
        <div className="ai-config-list" id={`ai-surface-${surface}`} hidden={!sectionOpen[surface]}>
          {providers.map(provider => {
            const models = section.models.filter(model => model.providerId === provider.id);
            const open = !collapsed.includes(provider.id);
            return <article className="ai-config-card" key={provider.id} aria-label={`${provider.name} 配置`}>
              <header className="ai-config-card-head">
                <button type="button" className="ai-config-disclosure" aria-expanded={open} aria-controls={`ai-models-${provider.id}`} onClick={() => setCollapsed(open ? [...collapsed, provider.id] : collapsed.filter(id => id !== provider.id))}>
                  <CaretDown size={16} /><span><strong>{provider.name}</strong><span className="ai-config-endpoint">{provider.endpoint}</span></span>
                </button>
                <div className="ai-config-card-actions">
                  {surface === 'llm' && current?.providerId === provider.id && <span className="ai-config-badge">当前供应商</span>}
                  <IconButton label={`编辑供应商 ${provider.name}`} disabled={busy} onClick={() => setEditor({ type: 'provider', surface, provider })}><PencilSimple size={17} /></IconButton>
                  <IconButton label={`删除供应商 ${provider.name}`} className="ai-config-danger" disabled={busy} onClick={() => { setRemoveError(''); setRemoving({ title: `删除${surface === 'rlcd' ? ' RLCD ' : ''}供应商「${provider.name}」？`, detail: `将移除该供应商、已保存的密钥及其 ${models.length} 个模型。此操作无法撤销。`, action: () => (surface === 'rlcd' ? api.removeRlcdProvider : api.removeProvider)(provider.id) }); }}><Trash size={17} /></IconButton>
                </div>
              </header>
              <div className="ai-config-meta"><span>{protocolLabel(provider.protocol)}</span><span><Key size={13} />{provider.hasKey ? '密钥已保存' : '未设置密钥'}</span><span>{models.length} 个模型</span></div>
              <div className="ai-config-models" id={`ai-models-${provider.id}`} hidden={!open}>
                <div className="ai-config-model-head"><h3>模型列表</h3><button type="button" className="ai-config-link" disabled={busy || models.length >= 8} title={models.length >= 8 ? '每个供应商最多保存 8 个模型' : undefined} onClick={() => setEditor({ type: 'model', surface, provider })}><Plus size={14} />添加模型</button></div>
                {models.length ? <ul>{models.map(model => <li key={model.id}>
                  <div className="ai-config-model-row"><span className="ai-config-model-name">{model.name}</span>
                    <div className="ai-config-model-actions">
                      <button type="button" className="ai-config-button compact test" aria-label={`测试连接 ${model.name}`} disabled={busy} onClick={() => void test(surface, model)}><Lightning size={14} />{probe?.surface === surface && probe.id === model.id && probe.state === 'pending' ? '测试中…' : '测试连接'}</button>
                      <IconButton label={`编辑模型 ${model.name}`} disabled={busy} onClick={() => setEditor({ type: 'model', surface, provider, model })}><PencilSimple size={16} /></IconButton>
                      <IconButton label={`删除模型 ${model.name}`} className="ai-config-danger" disabled={busy} onClick={() => { setRemoveError(''); setRemoving({ title: `删除${surface === 'rlcd' ? ' RLCD ' : ''}模型「${model.name}」？`, detail: '将移除该模型配置，供应商和其他模型会保留。', action: () => (surface === 'rlcd' ? api.removeRlcdModel : api.removeModel)(model.id) }); }}><Trash size={16} /></IconButton>
                    </div>
                  </div>
                  {probe?.surface === surface && probe.id === model.id && <p className={`ai-config-test-result ${probe.state}`} role={probe.state === 'error' ? 'alert' : 'status'}>{probe.state === 'ok' ? '连接成功 · ' : probe.state === 'error' ? '连接失败 · ' : ''}{probe.message}</p>}
                </li>)}</ul> : <p className="ai-config-empty-models">还没有模型，点击“添加模型”填写服务提供的模型 ID。</p>}
              </div>
            </article>;
          })}
          {!providers.length && <div className="ai-config-empty" role="status"><strong>{needle ? '没有匹配的供应商或模型' : '还没有供应商'}</strong><p>{needle ? '试试供应商名称、服务地址或模型 ID。' : surface === 'rlcd' ? '可添加 TypeSafe、OpenRouter 或自定义服务；当前仅保存配置。' : '从“添加供应商”开始，再为它添加模型。支持 DeepSeek、OpenAI、Anthropic 和自定义服务。'}</p></div>}
        </div>
      </section>;
    })}
    <p className="help ai-config-privacy"><Key size={14} />密钥在本机加密保存。工作台的 AI 配置与对话独立于 To-Do-List。</p>
    {editor?.type === 'provider' && <ProviderEditor surface={editor.surface} provider={editor.provider} saved={saved} close={() => setEditor(null)} />}
    {editor?.type === 'model' && <ModelEditor surface={editor.surface} provider={editor.provider} model={editor.model} saved={saved} close={() => setEditor(null)} />}
    {removing && <Modal title={removing.title} className="ai-config-dialog" close={() => { if (!busy) setRemoving(null); }}>
      <div className="ai-config-confirm"><p>{removing.detail}</p>{removeError && <p className="error" role="alert">{removeError}</p>}<div className="ai-config-footer">
        <button ref={keepButton} type="button" className="ai-config-button" autoFocus disabled={busy} onClick={() => setRemoving(null)}>保留</button>
        <button type="button" className="ai-config-button danger" disabled={busy} onClick={() => void mutate(removing.action, '配置已删除')}>{busy ? '删除中…' : '确认删除'}</button>
      </div></div>
    </Modal>}
  </div>;
}
