import { useEffect, useId, useRef, useState } from 'react';
import { ArrowClockwise, ArrowSquareOut, CalendarBlank, Eye, EyeSlash, Folder, Info, Monitor, Plugs, Sparkle, SquaresFour } from '@phosphor-icons/react';
import { ISLAND_DOCKS, ISLAND_DOCK_LABELS, ISLAND_LABELS, ISLAND_PAGES, ISLAND_QUOTA_LABELS, ISLAND_QUOTA_PROVIDERS, type IslandDock, type IslandSettingsPatch, type QuotaProvider } from '../../shared/island-contracts';
import { errorText, IconButton, Segmented, Select, TimePicker } from '../ui/controls';
import { Rows, type RowSpec } from './SettingsView';
import { useIslandState } from './island-state';
import { GameOptionsMenu } from './GameOptionsMenu';
import type { AgentConnection } from '../../shared/agent-message-contracts';

const sections = [
  { value: 'display', label: '显示与交互' },
  { value: 'pages', label: '页面' },
  { value: 'reminders', label: '提醒' },
  { value: 'quota', label: 'AI 额度' },
  { value: 'tools', label: '小工具' },
] as const;
type Section = typeof sections[number]['value'];
const pageIcons = { schedule: CalendarBlank, files: Folder, quota: Sparkle, tools: SquaresFour };
const pageDescriptions = { schedule: '月历、日程与待办', files: '文件与文件夹引用', quota: 'Codex 与 Z Code 额度', tools: '专注、喝水、久坐与圆环伙伴' };
const providerLogos = {
  codex: new URL('../assets/quota-providers/codex.png', import.meta.url).href,
  zcode: new URL('../assets/quota-providers/zcode.png', import.meta.url).href,
  cursor: new URL('../assets/quota-providers/cursor.svg', import.meta.url).href,
  grokbot: new URL('../assets/quota-providers/grokbot.png', import.meta.url).href,
};
const providerStatuses = { disconnected: '未连接', connecting: '待授权', ready: '已连接', stale: '更新延迟', recovering: '恢复中', error: '连接异常', unsupported: '暂无数据' };

function NumberSetting({ label, value, min, max, unit, disabled, save }: {
  label: string; value: number; min: number; max: number; unit: string; disabled: boolean; save(value: number): void;
}) {
  const [draft, setDraft] = useState(String(value));
  const errorId = useId();
  useEffect(() => setDraft(String(value)), [value]);
  const valid = draft !== '' && Number.isInteger(Number(draft)) && Number(draft) >= min && Number(draft) <= max;
  return <label className="island-setting-number">
    <span className="island-number-input"><input type="number" aria-label={label} min={min} max={max} disabled={disabled} value={draft} aria-invalid={!valid} aria-describedby={!valid ? errorId : undefined} onChange={e => setDraft(e.target.value)} onBlur={() => { if (valid && Number(draft) !== value) { save(Number(draft)); setDraft(String(value)); } }} /><span>{unit}</span></span>
    {!valid && <small id={errorId} role="alert">请输入 {min}–{max} 的整数</small>}
  </label>;
}

export function IslandSettingsSection({ query, resetSearch }: { query: string; resetSearch(): void }) {
  const { state, setState, error, setError } = useIslandState();
  const [active, setActive] = useState<Section>('display');
  const [busy, setBusy] = useState(false), busyRef = useRef(false);
  const [displays, setDisplays] = useState<{ id: number; label: string }[]>([]);
  const [providers, setProviders] = useState<QuotaProvider[]>([]), [key, setKey] = useState(''), [showKey, setShowKey] = useState(false), [clear, setClear] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<QuotaProvider['id']>('codex'), [editingKey, setEditingKey] = useState(false), [quotaLoading, setQuotaLoading] = useState(true);
  const [agentConnections, setAgentConnections] = useState<AgentConnection[] | null>(null);
  const editKeyButton = useRef<HTMLButtonElement>(null);
  const quotaGroup = useRef<HTMLDivElement>(null), revealGroup = useRef<'quota' | 'water' | 'sedentary' | 'agents' | null>(null), fieldId = useId();
  const api = window.workbench.island;
  const run = async (action: () => Promise<unknown>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try { await action(); } catch (e) { setError(errorText(e)); } finally { busyRef.current = false; setBusy(false); }
  };
  const patch = (value: IslandSettingsPatch) => { void run(async () => { setState(await api.patch(value)); }); };
  useEffect(() => {
    void api.displays().then(setDisplays).catch(e => setError(errorText(e)));
    if (api.agentConnections) void api.agentConnections().then(setAgentConnections).catch(e => setError(errorText(e)));
  }, []);
  useEffect(() => {
    const showGroup = (group: string | null) => {
      if (group !== 'quota' && group !== 'water' && group !== 'sedentary' && group !== 'agents') return;
      revealGroup.current = group; setActive(group === 'quota' || group === 'agents' ? 'quota' : 'tools');
      if (group === 'agents') setSelectedProvider(current => current === 'codex' || current === 'cursor' ? current : 'codex');
      resetSearch(); sessionStorage.removeItem('island-settings-section');
    };
    showGroup(sessionStorage.getItem('island-settings-section'));
    const listener = (event: Event) => showGroup((event as CustomEvent).detail);
    window.addEventListener('island-settings-section', listener);
    return () => window.removeEventListener('island-settings-section', listener);
  }, [resetSearch]);
  useEffect(() => {
    let alive = true;
    void api.quotas().then(value => { if (alive) setProviders(value); }).catch(e => { if (alive) setError(errorText(e)); }).finally(() => { if (alive) setQuotaLoading(false); });
    if (state && revealGroup.current && quotaGroup.current) {
      const target = quotaGroup.current.querySelector(`[data-group="${revealGroup.current}"]`) ?? quotaGroup.current;
      target.scrollIntoView({ block: 'nearest' }); revealGroup.current = null;
    }
    return () => { alive = false; };
  }, [state, active, selectedProvider]);
  useEffect(() => setShowKey(false), [active, selectedProvider, query]);
  if (!state) return <p role={error ? 'alert' : 'status'}>{error || '正在读取灵动岛设置…'}</p>;
  const settings = state.settings;
  const toggle = (field: keyof IslandSettingsPatch, label: string) => <button type="button" className="toggle" role="switch" aria-checked={Boolean(settings[field as keyof typeof settings])} aria-label={label} disabled={busy} onClick={() => patch({ [field]: !settings[field as keyof typeof settings] })} />;
  const number = (field: 'topOffset' | 'focusMinutes' | 'waterMinutes' | 'sedentaryMinutes' | 'lowQuota', label: string, min: number, max: number, unit: string) => <NumberSetting label={label} value={settings[field]} min={min} max={max} unit={unit} disabled={busy} save={value => patch({ [field]: value })} />;
  const period = (start: 'dndStart' | 'waterStart', end: 'dndEnd' | 'waterEnd', label: string) => <fieldset className="island-setting-period" aria-label={label} disabled={busy}>
    <div><label htmlFor={`${fieldId}-${start}`}>开始</label><TimePicker id={`${fieldId}-${start}`} value={settings[start]} onChange={value => patch({ [start]: value })} /></div><span>—</span>
    <div><label htmlFor={`${fieldId}-${end}`}>结束</label><TimePicker id={`${fieldId}-${end}`} value={settings[end]} onChange={value => patch({ [end]: value })} /></div>
  </fieldset>;
  const groups: { id: string; section: Section; title: string; rows: RowSpec[] }[] = [
    { id: 'position', section: 'display', title: '窗口位置', rows: [
      { key: 'display', title: '显示器', desc: '在所选工作区边缘居中', control: <Select value={String(settings.displayId ?? '')} onChange={value => patch({ displayId: value ? Number(value) : null })} aria-label="灵动岛显示器" disabled={busy} options={[{ value: '', label: '主显示器' }, ...displays.map(d => ({ value: String(d.id), label: d.label }))]} /> },
      { key: 'dock', title: '停靠位置', desc: '顶部向下展开，侧边向屏幕内展开', control: <Select value={settings.dock} onChange={value => patch({ dock: value as IslandDock })} aria-label="停靠位置" disabled={busy} options={ISLAND_DOCKS.map(value => ({ value, label: ISLAND_DOCK_LABELS[value] }))} /> },
      { key: 'offset', title: settings.dock === 'top' ? '顶部间距' : '边缘间距', desc: `相对工作区${ISLAND_DOCK_LABELS[settings.dock]}`, control: number('topOffset', settings.dock === 'top' ? '顶部偏移' : '停靠边缘偏移', 0, 300, 'px') },
    ] },
    { id: 'interaction', section: 'display', title: '展开与外观', rows: [
      { key: 'hover', title: '悬停展开', desc: '停留片刻，直接打开完整面板', control: toggle('hoverPreview', '悬停展开') },
      { key: 'fullscreen', title: '全屏时隐藏', desc: state.fullscreenDetection ? '退出全屏后恢复' : '系统检测暂不可用，可手动隐藏', control: toggle('hideFullscreen', '全屏时隐藏') },
      { key: 'motion', title: '减少动态效果', desc: '即时切换尺寸，伙伴保持静止', control: toggle('reducedMotion', '减少动态效果') },
    ] },
    { id: 'files', section: 'pages', title: '文件暂存', rows: [
      { key: 'retention', title: '退出时清空文件记录', desc: '原文件与文字记录保留', control: toggle('clearFilesOnExit', '退出时清空文件记录') },
      { key: 'clear', title: `${state.files.length} 条暂存记录`, desc: clear ? '确认清空所有引用？原文件不受影响。' : '默认保留，直到手动移除', control: clear ? <div className="island-setting-actions"><button className="set-btn" disabled={busy} onClick={() => void run(async () => { setState(await api.filesRemove()); setClear(false); })}>确认清空记录</button><button className="set-btn" onClick={() => setClear(false)}>取消</button></div> : <button className="set-btn" disabled={!state.files.length || busy} onClick={() => setClear(true)}>清空记录</button> },
    ] },
    { id: 'reminders', section: 'reminders', title: '事项提醒', rows: [
      { key: 'schedule', title: '日程提醒', desc: '按事项已设置的时间提醒', control: toggle('scheduleReminders', '日程提醒') },
      { key: 'todo', title: '待办提醒', desc: '岛隐藏时，使用系统通知', control: toggle('todoReminders', '灵动岛待办提醒') },
      { key: 'sound', title: '提醒声音', desc: '勿扰期间保持安静', control: toggle('sound', '提醒声音') },
    ] },
    { id: 'quiet', section: 'reminders', title: '勿扰时段', rows: [
      { key: 'dnd', title: '定时勿扰', desc: '不弹开、不播放声音，提醒留待处理', control: toggle('dnd', '勿扰时段') },
      { key: 'dndTime', title: '勿扰时间', desc: '', className: 'island-period-row', control: period('dndStart', 'dndEnd', '勿扰时间') },
    ] },
    { id: 'quota-alerts', section: 'quota', title: '额度提醒', rows: [
      { key: 'threshold', title: '低额度阈值', desc: '每账户、每周期提醒一次；0 为关闭', control: number('lowQuota', '低额度阈值', 0, 50, '%') },
    ] },
    { id: 'focus', section: 'tools', title: '专注计时', rows: [
      { key: 'focus', title: '启用专注', desc: '结束时提醒，不自动完成待办', control: toggle('focusEnabled', '专注计时') },
      { key: 'duration', title: '默认时长', desc: '也可在岛内临时调整', control: number('focusMinutes', '默认专注时长', 1, 180, '分钟') },
    ] },
    { id: 'mascot', section: 'tools', title: '圆环伙伴', rows: [
      { key: 'mascot', title: '显示伙伴', desc: '在收起顶栏与小工具页中陪伴', control: toggle('mascotEnabled', '显示圆环伙伴') },
      { key: 'blink', title: '轻微动作', desc: '勿扰或减少动态效果时静止', control: toggle('mascotMotion', '伙伴轻微动作') },
    ] },
    { id: 'water', section: 'tools', title: '喝水提醒', rows: [
      { key: 'water', title: '启用喝水提醒', desc: '只统计主动确认的次数', control: toggle('waterEnabled', '喝水提醒') },
      { key: 'interval', title: '提醒间隔', desc: '休眠后不连续补弹', control: number('waterMinutes', '喝水间隔', 10, 240, '分钟') },
      { key: 'waterTime', title: '提醒时间', desc: '', className: 'island-period-row', control: period('waterStart', 'waterEnd', '喝水时间段') },
    ] },
    { id: 'sedentary', section: 'tools', title: '久坐提醒', rows: [
      { key: 'enabled', title: '启用久坐提醒', desc: '按使用时长提醒，不识别坐姿或离座', control: toggle('sedentaryEnabled', '久坐提醒') },
      { key: 'interval', title: '提醒间隔', desc: '锁屏、睡眠和勿扰时暂停，恢复后重新计时', control: number('sedentaryMinutes', '久坐间隔', 10, 240, '分钟') },
    ] },
  ];
  const term = query.trim().toLowerCase().replace(/\s+/g, '');
  const matches = (value: string) => !term || value.toLowerCase().replace(/\s+/g, '').includes(term);
  const selectedGroups = groups.filter(group => term || group.section === active).map(group => ({ ...group, rows: group.rows.filter(row => matches(`${sections.find(s => s.value === group.section)?.label} ${group.title} ${row.title} ${row.desc}`)) })).filter(group => group.rows.length);
  const visiblePages = (term || active === 'pages') ? ISLAND_PAGES.filter(page => matches(`页面 ${ISLAND_LABELS[page]} ${pageDescriptions[page]}`)) : [];
  const visibleProviders = (term || active === 'quota') ? ISLAND_QUOTA_PROVIDERS.filter(id => matches(`AI 额度 ${ISLAND_QUOTA_LABELS[id]} 账户 ${id === 'codex' ? 'ChatGPT Agent 消息提醒 回复完成 待授权 本机 新会话' : id === 'cursor' ? '登录 套餐 Agent 消息提醒 回复 运行失败 本机 新会话' : id === 'zcode' ? 'GLM Coding Plan API Key 密钥' : '登录 套餐'}`)) : [];
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
  const count = (term && matches('显示灵动岛 桌面显示 启用') ? 1 : 0) + selectedGroups.reduce((total, group) => total + group.rows.length, 0) + visiblePages.length + visibleProviders.length;
  const toolsEnabled = settings.focusEnabled || settings.waterEnabled || settings.sedentaryEnabled || settings.mascotEnabled;
  return <div className="island-settings">
    <div className="island-settings-overview">
      <span className="island-settings-symbol"><Monitor size={18} /></span>
      <div className="island-settings-overview-copy"><div><b>桌面显示</b><span className="island-enabled-status" data-enabled={settings.enabled}>{settings.enabled ? '已启用' : '未启用'}</span></div><p title={settings.enabled ? `${ISLAND_DOCK_LABELS[settings.dock]}居中 · 偏移 ${settings.topOffset} px` : '开启后，在桌面边缘查看日程与快捷工具'}>{settings.enabled ? `${ISLAND_DOCK_LABELS[settings.dock]}居中 · 偏移 ${settings.topOffset} px` : '开启后，在桌面边缘查看日程与快捷工具'}</p></div>
      {toggle('enabled', '显示灵动岛')}
    </div>
    {error && <p className="island-settings-error" role="alert">{error}</p>}
    {term ? <p className="island-settings-search-result" role="status">{count ? `找到 ${count} 项相关设置 · 已搜索所有分区` : '没有匹配的设置'}</p> : <div className="island-settings-tabs"><Segmented value={active} onChange={value => setActive(value as Section)} options={[...sections]} aria-label="灵动岛设置分区" /></div>}
    <div ref={quotaGroup} className={`island-settings-layout${!term && active === 'tools' ? ' island-settings-tools' : ''}`} aria-label={term ? '设置搜索结果' : sections.find(section => section.value === active)?.label}>
      {visiblePages.length > 0 && <section className="island-setting-card island-card-wide" aria-labelledby={`${fieldId}-pages`}><header><h2 id={`${fieldId}-pages`}>显示的页面</h2><p>隐藏页面会保留数据，底栏按固定顺序排列。</p></header><div className="island-page-options">{visiblePages.map(page => {
        const PageIcon = pageIcons[page];
        return <div className="island-page-option" key={page} data-enabled={settings.pages[page]}><div><PageIcon size={21} /><button type="button" className="toggle" role="switch" aria-label={`显示${ISLAND_LABELS[page]}页`} aria-checked={settings.pages[page]} disabled={busy} onClick={() => patch({ pages: { [page]: !settings.pages[page] } })} /></div><b>{ISLAND_LABELS[page]}</b><small>{page === 'tools' && !toolsEnabled ? '启用任一工具后显示' : pageDescriptions[page]}</small></div>;
      })}</div></section>}
      {providerId && <section className="island-connection-manager" aria-labelledby={`${fieldId}-connections`}>
        <header><h2 id={`${fieldId}-connections`}>账户连接</h2><button type="button" className="island-settings-link" disabled={busy} onClick={() => void run(async () => setProviders(await api.quotaRefresh(true)))}><ArrowClockwise size={15} />刷新额度</button></header>
        <div className="island-connection-layout">
          <nav className="island-connection-sources" aria-label="额度来源">{visibleProviders.map(id => {
            const item = providers.find(value => value.id === id);
            return <button type="button" key={id} data-provider={id} aria-label={`查看 ${ISLAND_QUOTA_LABELS[id]} 连接`} aria-pressed={id === providerId} onClick={() => setSelectedProvider(id)}>
              <span className="island-provider-symbol"><img src={providerLogos[id]} alt="" draggable={false} /></span><span className="island-source-copy"><strong>{ISLAND_QUOTA_LABELS[id]}</strong><small title={item?.plan}>{item?.plan || (item?.status === 'disconnected' ? '尚未连接账户' : '账户连接')}</small></span><span className="island-provider-status" data-status={item?.status}>{providerStatus(item)}</span>
            </button>;
          })}</nav>
          <section className="island-connection-detail" data-provider={providerId} aria-label={`${ISLAND_QUOTA_LABELS[providerId]} 账户详情`}>
            <header><span className="island-provider-symbol"><img src={providerLogos[providerId]} alt="" draggable={false} /></span><div className="island-provider-heading"><div><h3>{ISLAND_QUOTA_LABELS[providerId]}</h3><span className="island-provider-status" data-status={provider?.status}>{providerStatus(provider)}</span></div><p>{[provider?.account, provider?.plan].filter(Boolean).join(' · ')}{provider?.updatedAt && <>{(provider.account || provider.plan) && ' · '}<time dateTime={new Date(provider.updatedAt).toISOString()} title={new Date(provider.updatedAt).toLocaleString('zh-CN')}>{new Date(provider.updatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 更新</time></>}</p></div>
              <div className="island-provider-menu" inert={busy}><GameOptionsMenu kind="project" active={active === 'quota'} context={`${providerId}:${term}:${editingKey}:${provider?.status}`} label={`${ISLAND_QUOTA_LABELS[providerId]} 更多操作`}>{close => <>
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
              desc: agentConnection?.error || (!api.agentConnections ? '请完整重启测试环境以加载消息接口' : agentConnections === null ? '正在读取提醒状态…' : `${agentConnection?.connected ? agentProvider === 'codex' ? '监听已配置 · 请在 Codex 设置 → Hooks 中审核并信任，新会话生效' : '监听已配置 · 新会话生效' : '尚未接入 · 需单独开启消息监听，无需再次登录'} · ${agentProvider === 'codex' ? '回复完成、待授权' : '回复、运行失败'} · 消息仅保存在本机`),
              control: <button type="button" className="toggle" role="switch" aria-label={`${ISLAND_QUOTA_LABELS[agentProvider]} 消息提醒`} aria-checked={Boolean(agentConnection?.connected)} disabled={busy || agentConnections === null} onClick={() => void run(async () => {
                const enabled = !agentConnection?.connected;
                setAgentConnections(await api.agentConnect(agentProvider, enabled));
                if (enabled) setState(await api.patch({ mascotEnabled: true }));
              })} />,
            }]} /></div>}
          </section>
        </div>
      </section>}
      {selectedGroups.map(group => group.id === 'quota-alerts' ? <section className="island-setting-card island-quota-threshold island-card-wide" key={group.id} data-group={group.id} aria-labelledby={`${fieldId}-${group.id}`}><div><h2 id={`${fieldId}-${group.id}`}>{group.rows[0].title}</h2><span className="island-threshold-help" tabIndex={0} role="img" aria-label={group.rows[0].desc}><Info size={15} /><span role="tooltip">{group.rows[0].desc}</span></span></div>{group.rows[0].control}</section> : <section className={`island-setting-card${group.id === 'files' ? ' island-card-wide' : ''}`} key={group.id} data-group={group.id} aria-labelledby={`${fieldId}-${group.id}`}><header><h2 id={`${fieldId}-${group.id}`}>{group.title}</h2></header><Rows rows={group.rows} query="" /></section>)}
    </div>
  </div>;
}
