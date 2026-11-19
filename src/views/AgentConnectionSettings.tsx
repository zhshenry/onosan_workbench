import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ArrowClockwise, ArrowSquareOut, Eye, EyeSlash, Info, Plugs } from '@phosphor-icons/react';
import type { AgentConnection } from '../../shared/agent-message-contracts';
import { ISLAND_QUOTA_LABELS, ISLAND_QUOTA_PROVIDERS, type QuotaProvider } from '../../shared/island-contracts';
import { errorText, IconButton } from '../ui/controls';
import { GameOptionsMenu } from './GameOptionsMenu';
import { NumberSetting } from './IslandSettings';
import { Rows } from './SettingsView';
import { useIslandState } from './island-state';

const providerLogos = {
  codex: new URL('../assets/quota-providers/codex.png', import.meta.url).href,
  zcode: new URL('../assets/quota-providers/zcode.png', import.meta.url).href,
  cursor: new URL('../assets/quota-providers/cursor.svg', import.meta.url).href,
  grokbot: new URL('../assets/quota-providers/grokbot.png', import.meta.url).href,
};
const providerStatuses = { disconnected: '未连接', connecting: '待授权', ready: '已连接', stale: '更新延迟', recovering: '恢复中', error: '连接异常', unsupported: '暂无数据' };

export function AgentConnectionSettings({ query }: { query: string }) {
  const { state, setState, error, setError } = useIslandState();
  const [busy, setBusy] = useState(false), busyRef = useRef(false);
  const [providers, setProviders] = useState<QuotaProvider[]>([]), [key, setKey] = useState(''), [showKey, setShowKey] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<QuotaProvider['id']>('codex'), [editingKey, setEditingKey] = useState(false), [quotaLoading, setQuotaLoading] = useState(true);
  const [agentConnections, setAgentConnections] = useState<AgentConnection[] | null>(null);
  const editKeyButton = useRef<HTMLButtonElement>(null);
  const layout = useRef<HTMLDivElement>(null), fieldId = useId();
  const [reveal, setReveal] = useState<'quota' | 'agents' | null>(null);
  const api = window.workbench.island;
  const run = async (action: () => Promise<unknown>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try { await action(); } catch (e) { setError(errorText(e)); } finally { busyRef.current = false; setBusy(false); }
  };
  useEffect(() => {
    if (api.agentConnections) void api.agentConnections().then(setAgentConnections).catch(e => setError(errorText(e)));
  }, []);
  useEffect(() => {
    const showGroup = (group: unknown) => {
      if (group !== 'quota' && group !== 'agents') return;
      if (group === 'agents') setSelectedProvider(current => current === 'codex' || current === 'cursor' ? current : 'codex');
      setReveal(group);
      sessionStorage.removeItem('island-settings-section');
    };
    showGroup(sessionStorage.getItem('island-settings-section'));
    const listener = (event: Event) => showGroup((event as CustomEvent).detail);
    window.addEventListener('island-settings-section', listener);
    return () => window.removeEventListener('island-settings-section', listener);
  }, []);
  useEffect(() => {
    let alive = true;
    void api.quotas().then(value => { if (alive) setProviders(value); }).catch(e => { if (alive) setError(errorText(e)); }).finally(() => { if (alive) setQuotaLoading(false); });
    return () => { alive = false; };
  }, [state, selectedProvider]);
  useLayoutEffect(() => setShowKey(false), [selectedProvider, query]);
  useEffect(() => {
    if (!reveal || !layout.current) return;
    const target = reveal === 'agents' ? layout.current.querySelector('[data-group="agents"]') : layout.current;
    (target ?? layout.current).scrollIntoView({ block: 'nearest' });
    setReveal(null);
  }, [state, reveal]);

  if (!state) return <p role={error ? 'alert' : 'status'}>{error || '正在读取额度设置…'}</p>;
  const term = query.trim().toLowerCase().replace(/\s+/g, '');
  const matches = (value: string) => !term || value.toLowerCase().replace(/\s+/g, '').includes(term);
  const visibleProviders = ISLAND_QUOTA_PROVIDERS.filter(id => matches(`AI 额度 ${ISLAND_QUOTA_LABELS[id]} 账户 ${id === 'codex' ? 'ChatGPT Agent 消息提醒 本轮回复完成 本机 新会话' : id === 'cursor' ? '登录 套餐 Agent 消息提醒 回复 运行失败 本机 新会话' : id === 'zcode' ? 'GLM Coding Plan API Key 密钥' : '登录 套餐'}`));
  const providerId = visibleProviders.includes(selectedProvider) ? selectedProvider : visibleProviders[0];
  const provider = providers.find(item => item.id === providerId);
  const agentProvider = providerId === 'codex' || providerId === 'cursor' ? providerId : undefined;
  const agentConnection = agentConnections?.find(item => item.provider === agentProvider);
  const connected = provider?.status === 'ready' || provider?.status === 'unsupported' || provider?.status === 'stale';
  const keyEditor = providerId === 'zcode' && provider && (editingKey || !connected) && provider.status !== 'connecting';
  const providerStatus = (value?: QuotaProvider) => value ? value.issue === 'auth-required' ? '需重新登录' : providerStatuses[value.status] : quotaLoading ? '读取中' : '未读取';
  const connect = () => {
    if (!providerId || !provider || provider.status === 'connecting' || providerId === 'zcode' && !key.trim()) return;
    void run(async () => {
      if (providerId === 'codex' && provider.status !== 'disconnected' && provider.issue !== 'auth-required') { setProviders(await api.quotaRefresh(true)); return; }
      const next = await api.quotaConnect(providerId, providerId === 'zcode' ? key : undefined); setProviders(next);
      if (providerId === 'zcode' && next.some(item => item.id === providerId && ['ready', 'unsupported'].includes(item.status))) { setKey(''); setShowKey(false); setEditingKey(false); }
    });
  };
  const disconnect = () => {
    if (!providerId) return;
    void run(async () => {
      setProviders(await api.quotaDisconnect(providerId));
      if (providerId === 'zcode') { setKey(''); setShowKey(false); setEditingKey(false); }
    });
  };
  const thresholdHelp = '每账户、每周期提醒一次，0 为关闭';
  const showThreshold = matches(`AI 额度 额度提醒 低额度阈值 ${thresholdHelp}`);
  const count = visibleProviders.length + Number(showThreshold);

  return <div className="island-settings">
    {error && <p className="island-settings-error" role="alert">{error}</p>}
    {term && <p className="island-settings-search-result" role="status">{count ? `找到 ${count} 项相关设置` : '没有匹配的设置'}</p>}
    <div ref={layout} className="island-settings-layout" aria-label="Agent额度连接">
      {providerId && <section className="island-connection-manager" aria-labelledby={`${fieldId}-connections`}>
        <header><h2 id={`${fieldId}-connections`}>账户连接</h2><button type="button" className="island-settings-link" disabled={busy} onClick={() => void run(async () => setProviders(await api.quotaRefresh(true)))}><ArrowClockwise size={15} />刷新额度</button></header>
        <div className="island-connection-layout">
          <nav className="island-connection-sources" aria-label="额度来源">{visibleProviders.map(id => {
            const item = providers.find(value => value.id === id);
            const messageConnection = agentConnections?.find(value => value.provider === id);
            return <button type="button" key={id} data-provider={id} aria-label={`查看 ${ISLAND_QUOTA_LABELS[id]} 连接`} aria-describedby={`${fieldId}-${id}-status`} aria-pressed={id === providerId} onClick={() => setSelectedProvider(id)}>
              <span className="island-provider-symbol"><img src={providerLogos[id]} alt="" draggable={false} /></span><span className="island-source-copy"><strong>{ISLAND_QUOTA_LABELS[id]}</strong><small title={item?.plan}>{item?.plan || (item?.status === 'disconnected' ? '尚未连接账户' : '账户连接')}</small></span><span className="island-source-status" id={`${fieldId}-${id}-status`}>
                <span className="island-provider-status" data-status={item?.status}>{providerStatus(item)}</span>
                {(id === 'codex' || id === 'cursor') && <span className="island-source-reminder" data-enabled={messageConnection?.connected} data-error={Boolean(messageConnection?.error)} title={messageConnection?.error}>{agentConnections === null ? '提醒状态未读取' : messageConnection?.error ? '消息提醒异常' : `消息提醒${messageConnection?.connected ? '已开启' : '未开启'}`}</span>}
              </span>
            </button>;
          })}</nav>
          <section className="island-connection-detail" data-provider={providerId} aria-label={`${ISLAND_QUOTA_LABELS[providerId]} 账户详情`}>
            <header><span className="island-provider-symbol"><img src={providerLogos[providerId]} alt="" draggable={false} /></span><div className="island-provider-heading"><div><h3>{ISLAND_QUOTA_LABELS[providerId]}</h3><span className="island-provider-status" data-status={provider?.status}>{providerStatus(provider)}</span></div><p>{[provider?.account, provider?.plan].filter(Boolean).join(' · ')}{provider?.updatedAt && <>{(provider.account || provider.plan) && ' · '}<time dateTime={new Date(provider.updatedAt).toISOString()} title={new Date(provider.updatedAt).toLocaleString('zh-CN')}>{new Date(provider.updatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 更新</time></>}</p></div>
              <div className="island-provider-menu" inert={busy}><GameOptionsMenu kind="project" active context={`${providerId}:${term}:${editingKey}:${provider?.status}`} label={`${ISLAND_QUOTA_LABELS[providerId]} 更多操作`}>{close => <>
                <button type="button" role="menuitem" disabled={busy} aria-label={`打开 ${ISLAND_QUOTA_LABELS[providerId]} 官网`} onClick={() => { close(); void run(() => api.quotaOfficial(providerId)); }}><ArrowSquareOut size={16} />官网</button>
                {provider && !['disconnected', 'connecting'].includes(provider.status) && <button type="button" role="menuitem" className="danger" disabled={busy} aria-label={`断开 ${ISLAND_QUOTA_LABELS[providerId]} 连接`} onClick={() => { close(); disconnect(); }}><Plugs size={16} />断开连接</button>}
              </>}</GameOptionsMenu></div>
            </header>
            <div className="island-provider-content">
              {provider?.message && !['disconnected', 'ready'].includes(provider.status) && <p className="island-provider-message" data-status={provider.status} role="status">{provider.message}</p>}
              {!provider ? <p className="island-provider-description" role="status">{quotaLoading ? '正在读取账户信息…' : '尚未读取到账户信息，请刷新重试。'}</p> : keyEditor ? <form className="island-key-editor" noValidate onSubmit={event => { event.preventDefault(); connect(); }}>
                <h4>{connected || editingKey ? '更新密钥' : '连接账户'}</h4><div className="island-key-field"><label htmlFor="island-zcode-key">{connected || editingKey ? '新 API Key' : 'API Key'}</label><div><input id="island-zcode-key" type={showKey ? 'text' : 'password'} autoComplete="off" spellCheck={false} maxLength={4096} disabled={busy} value={key} onChange={event => setKey(event.target.value)} placeholder="输入 API Key" aria-describedby={`${fieldId}-key-help`} autoFocus={editingKey} /><IconButton label={showKey ? '隐藏密钥' : '显示密钥'} disabled={busy} onClick={() => setShowKey(!showKey)}>{showKey ? <EyeSlash size={18} /> : <Eye size={18} />}</IconButton></div><small id={`${fieldId}-key-help`}>{connected || editingKey ? '替换已保存的密钥' : '本机加密保存'}</small></div>
                <div className="island-provider-actions"><button type="submit" className="set-btn island-settings-primary" disabled={busy || !key.trim()}>{busy ? '处理中…' : connected || editingKey ? '更新密钥' : '连接'}</button>{editingKey && <button type="button" className="island-settings-link" disabled={busy} onClick={() => { setKey(''); setShowKey(false); setEditingKey(false); window.requestAnimationFrame(() => editKeyButton.current?.focus()); }}>取消</button>}</div>
              </form> : <>
                <h4>{provider.status === 'connecting' ? '等待账户授权' : provider.issue === 'auth-required' ? '需要重新登录' : provider.status === 'stale' ? '已连接 · 更新延迟' : provider.status === 'recovering' ? '正在恢复额度服务' : connected ? '账户已连接' : provider.status === 'error' ? '连接需要重试' : '连接账户'}</h4>
                {providerId === 'codex' && provider.issue === 'cli-unavailable' && <p className="island-provider-description">需安装 Codex CLI</p>}
                {!connected && providerId === 'grokbot' && <p className="island-provider-description">使用 Cursor 账号登录</p>}
                {providerId === 'zcode' && connected && <p className="island-provider-description">密钥已保存</p>}
                <div className="island-provider-actions">{providerId === 'zcode' && connected ? <button ref={editKeyButton} type="button" className="set-btn island-settings-primary" disabled={busy} onClick={() => setEditingKey(true)}>更新密钥</button> : <button type="button" className="set-btn island-settings-primary" disabled={busy || provider.status === 'connecting'} onClick={connect}>{provider.status === 'connecting' ? '授权中…' : busy ? '处理中…' : provider.issue === 'auth-required' ? '重新登录' : providerId === 'codex' && provider.status !== 'disconnected' ? connected && provider.status !== 'stale' ? '刷新额度' : '重试' : provider.status === 'error' ? '重试' : connected ? '重连' : '连接'}</button>}{provider.status === 'connecting' && <button type="button" className="island-settings-link" disabled={busy} onClick={disconnect}>取消授权</button>}</div>
              </>}
            </div>
            {agentProvider && <div className="island-provider-messages" data-group="agents"><Rows query="" rows={[{
              key: `agent-${agentProvider}`, title: '消息提醒',
              desc: agentConnection?.error || (!api.agentConnections ? '请完整重启测试环境以加载消息接口' : agentConnections === null ? '正在读取提醒状态…' : `${agentConnection?.connected ? agentProvider === 'codex' ? '监听已配置 · 请在 Codex 设置 → Hooks 中审核并信任，新会话生效' : '监听已配置 · 新会话生效' : '尚未接入 · 需单独开启消息监听，无需再次登录'} · ${agentProvider === 'codex' ? '本轮回复完成' : '回复、运行失败'} · 消息仅保存在本机`),
              control: <button type="button" className="toggle" role="switch" aria-label={`${ISLAND_QUOTA_LABELS[agentProvider]} 消息提醒`} aria-checked={Boolean(agentConnection?.connected)} disabled={busy || agentConnections === null} onClick={() => void run(async () => {
                const enabled = !agentConnection?.connected;
                setAgentConnections(await api.agentConnect(agentProvider, enabled));
                if (enabled) setState(await api.patch({ mascotEnabled: true }));
              })} />,
            }]} /></div>}
          </section>
        </div>
      </section>}
      {showThreshold && <section className="island-setting-card island-quota-threshold island-card-wide" aria-labelledby={`${fieldId}-threshold`}>
        <div><h2 id={`${fieldId}-threshold`}>低额度阈值</h2><span className="island-threshold-help" tabIndex={0} role="img" aria-label={thresholdHelp}><Info size={15} /><span role="tooltip">{thresholdHelp}</span></span></div>
        <NumberSetting label="低额度阈值" value={state.settings.lowQuota} min={0} max={50} unit="%" disabled={busy} save={value => void run(async () => { setState(await api.patch({ lowQuota: value })); })} />
      </section>}
    </div>
  </div>;
}
