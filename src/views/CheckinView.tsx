import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowClockwise, ArrowRight, ArrowSquareOut, Browser, CaretDown, Check, CheckCircle, CircleNotch, Clock, CloudCheck, Desktop, FloppyDisk, Gift, Info, Link, LockKey, PlugsConnected, ShieldCheck, SignOut, WarningCircle } from '@phosphor-icons/react';
import { CHECKIN_PROVIDERS, DEFAULT_CHECKIN_SETTINGS, emptyCheckinRow, type CheckinProvider, type CheckinRow, type CheckinSettings, type CheckinState, type CheckinStatus } from '../../shared/checkin-contracts';
import { Modal, Segmented, TimePicker, errorText } from '../ui/controls';
import workbuddyLogo from '../assets/checkin-providers/workbuddy.svg';
import qoderLogo from '../assets/checkin-providers/qoder.svg';
import traeLogo from '../assets/checkin-providers/trae.png';
import './checkin.css';

const api = window.workbench.checkin;
const providers = [
  { id: 'workbuddy' as const, name: 'WorkBuddy', owner: '腾讯', logo: workbuddyLogo, unit: '积分', method: '手机号与验证码登录', domain: 'www.workbuddy.cn', rule: 'Buddy 加油站活动奖励', validity: '奖励与有效期以本期活动为准', cycle: '按当前活动的领取周期检查' },
  { id: 'qoder' as const, name: 'Qoder', owner: '阿里', logo: qoderLogo, unit: 'Credits', method: '官方浏览器授权', domain: 'qoder.com.cn', rule: '每日积分以平台当前活动为准', validity: '每日奖励领取后 30 天有效，以官方活动为准', cycle: '每天 10:00 至次日 10:00（北京时间）' },
  { id: 'trae' as const, name: 'TRAE', owner: '字节', logo: traeLogo, unit: '积分', method: '官方浏览器授权', domain: 'www.trae.cn', rule: '按账号套餐与当前活动领取', validity: '每笔签到奖励 31 个自然日有效，以官方规则为准', cycle: '按平台返回的当日状态检查' },
];
type Provider = typeof providers[number];
const captions: Record<CheckinStatus, string> = { disconnected: '未连接', ready: '待签到', checking: '查询签到状态', claiming: '正在领取', claimed: '本轮已领取', expired: '需要重新登录', pending: '领取待确认', error: '签到未完成', unavailable: '暂无可领取活动' };
const working = (row: CheckinRow): boolean => ['checking', 'claiming'].includes(row.status);
const time = (at: number): string => at ? new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' }).format(at) : '尚未检查';
function Logo({ provider, small = false }: { provider: Provider; small?: boolean }) { return <span className={`provider-logo${small ? ' small' : ''}`}><img src={provider.logo} alt="" /></span>; }
function Switch({ checked, onChange, label }: { checked: boolean; onChange(value: boolean): void; label: string }) { return <button type="button" className="ci-switch" role="switch" aria-label={label} aria-checked={checked} onClick={() => onChange(!checked)}><span /></button>; }
function Status({ status }: { status: CheckinStatus }) { const Icon = ['checking', 'claiming'].includes(status) ? CircleNotch : status === 'claimed' ? CheckCircle : ['expired', 'pending', 'error', 'unavailable'].includes(status) ? WarningCircle : status === 'disconnected' ? Link : Clock; return <span className={`ci-status ${status}`}><Icon size={15} className={['checking', 'claiming'].includes(status) ? 'spin' : ''} />{captions[status]}</span>; }
function useCheckinState() {
  const [state, setState] = useState<CheckinState | null>(null), [error, setError] = useState('');
  useEffect(() => {
    let alive = true, version = 0;
    const off = api.onChanged(next => { version++; setState(next); setError(''); });
    const read = () => { const current = version; void api.state().then(next => { if (alive && current === version) { setState(next); setError(''); } }, e => { if (alive) setError(errorText(e)); }); };
    read(); const timer = setInterval(read, 30000);
    return () => { alive = false; clearInterval(timer); off(); };
  }, []);
  return { state, error };
}

function ConnectionDialog({ provider, state, close }: { provider: Provider; state: CheckinState; close(): void }) {
  const [phone, setPhone] = useState(''), [code, setCode] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [retryAt, setRetryAt] = useState(0), [now, setNow] = useState(Date.now());
  const phoneInput = useRef<HTMLInputElement>(null), codeInput = useRef<HTMLInputElement>(null), alive = useRef(true), initialAuth = useRef(state.auth?.id);
  const auth = state.auth?.provider === provider.id && state.auth.id !== initialAuth.current ? state.auth : null;
  useEffect(() => { alive.current = true; const timer = setInterval(() => setNow(Date.now()), 1000); return () => { alive.current = false; clearInterval(timer); void api.cancelAuth(provider.id).catch(() => {}); }; }, [provider.id]);
  useEffect(() => { if (auth?.stage === 'connected') close(); }, [auth?.stage]);
  async function sendCode() {
    if (!/^1\d{10}$/.test(phone)) { setError('请输入 11 位手机号。'); phoneInput.current?.focus(); return; }
    setBusy(true); setError('');
    try { const result = await api.sendSms(phone); if (alive.current) { setRetryAt(result.retryAt); codeInput.current?.focus(); } }
    catch (e) { if (alive.current) { setError(errorText(e)); setRetryAt(Date.now() + 60000); } }
    finally { if (alive.current) setBusy(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!/^1\d{10}$/.test(phone)) { setError('请输入 11 位手机号。'); phoneInput.current?.focus(); return; }
    if (!/^\d{4,8}$/.test(code)) { setError('请输入短信验证码。'); codeInput.current?.focus(); return; }
    setBusy(true); setError('');
    try { await api.loginWorkbuddy({ phone, code }); }
    catch (e) { if (alive.current) setError(errorText(e)); }
    finally { if (alive.current) { setBusy(false); setCode(''); } }
  }
  async function authorize() { setBusy(true); setError(''); try { if (provider.id !== 'workbuddy') await api.authorize(provider.id); } catch (e) { if (alive.current) setError(errorText(e)); } finally { if (alive.current) setBusy(false); } }
  function cancel() { void api.cancelAuth(provider.id); close(); }
  const checking = auth?.stage === 'checking', waiting = auth?.stage === 'waiting';
  return <Modal title={`连接 ${provider.name}`} titleIcon={<Logo provider={provider} small />} close={cancel} className="checkin-scope ci-connect-dialog" subhead={<p className="dialog-subhead">{provider.method} · 连接后检查当前账号的签到资格</p>}><div className="ci-dialog-body">
    <ol className="connection-steps"><li className={!checking ? 'active' : ''}><span>1</span>登录账号</li><li className={checking ? 'active' : ''}><span>2</span>检查连接</li><li><span>3</span>开始签到</li></ol>
    {checking ? <div className="authorization-wait" role="status"><CircleNotch size={34} className="spin" /><h3>正在检查连接</h3><p>确认账号身份与当前领取资格…</p><button className="ci-btn outline" onClick={cancel}>取消连接</button></div> : waiting ? <><div className="authorization-wait"><Browser size={38} /><h3>等待你完成官方授权</h3><p>在系统浏览器登录 {provider.name}，<br />授权完成后将自动检查连接。</p><button className="ci-link" onClick={() => { if (auth) void api.reopenAuth(auth.id).catch(e => setError(errorText(e))); }}>重新打开授权页<ArrowSquareOut size={14} /></button><p className="field-error" role="alert">{error}</p></div><div className="dialog-actions"><button className="ci-btn outline" onClick={cancel}>取消连接</button></div></> : provider.id === 'workbuddy' ? <form noValidate onSubmit={submit}>
      <div className="connection-note"><LockKey size={20} /><div><strong>连接你自己的 WorkBuddy 账号</strong><p>仅用于查询与领取每日签到奖励，可随时断开。</p></div></div>
      <label className="ci-field">手机号<input ref={phoneInput} type="tel" inputMode="numeric" autoComplete="tel" maxLength={11} placeholder="输入 WorkBuddy 绑定的手机号" disabled={busy} value={phone} aria-invalid={!!error && !/^1\d{10}$/.test(phone)} aria-describedby="connection-error" onChange={e => setPhone(e.target.value)} /></label>
      <div className="ci-field"><label htmlFor="workbuddy-code">验证码</label><span className="verification-field"><input id="workbuddy-code" ref={codeInput} inputMode="numeric" autoComplete="one-time-code" maxLength={8} placeholder="填写短信验证码" disabled={busy} value={code} aria-describedby="connection-error" onChange={e => setCode(e.target.value)} /><button type="button" className="ci-btn outline" disabled={busy || retryAt > now} onClick={() => { void sendCode(); }}>{retryAt > now ? `${Math.ceil((retryAt - now) / 1000)} 秒后重发` : '获取验证码'}</button></span></div>
      <p className="field-error" id="connection-error" role="alert">{error || (auth?.stage === 'error' ? auth.message : '')}</p>
      <div className="privacy-note"><ShieldCheck size={16} /><span>登录凭据由系统加密后保存在本机，断开时移除。</span></div><div className="dialog-actions"><button type="button" className="ci-btn outline" onClick={cancel}>取消</button><button type="submit" className="ci-btn primary" disabled={busy}><PlugsConnected size={17} />{busy ? '正在连接' : '登录并连接'}</button></div>
    </form> : <><div className="authorization-intro"><Browser size={36} /><h3>在官方页面完成登录</h3><p>使用你的 {provider.name} 国内版账号授权，<br />完成后返回 Workbench。</p><span className="official-domain"><LockKey size={13} />{provider.domain}</span></div>
      <div className="connection-note compact"><Info size={18} /><p>{provider.id === 'qoder' ? '每日奖励面向符合条件的个人账号；能登录不代表有可领取活动。' : '连接时沿用本机设备标识。设备校验失败时，请到 TRAE 官方应用处理。'}</p></div>
      <div className="privacy-note"><ShieldCheck size={16} /><span>无需将账号密码填写到 Workbench；登录凭据仅在本机加密保存。</span></div><p className="field-error" role="alert">{error || (auth?.stage === 'error' ? auth.message : '')}</p>
      <div className="dialog-actions"><button className="ci-btn outline" onClick={cancel}>取消</button><button className="ci-btn primary" disabled={busy} onClick={() => { void authorize(); }}>前往 {provider.name} 授权<ArrowSquareOut size={16} /></button></div>
    </>}
  </div></Modal>;
}

function AutoDialog({ state, close, saved }: { state: CheckinState; close(): void; saved(): void }) {
  const [draft, setDraft] = useState<CheckinSettings>(structuredClone(state.settings)), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const update = (value: Partial<CheckinSettings>) => setDraft(current => ({ ...current, ...value }));
  async function save() {
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(draft.time)) { setError('请选择每天检查时间。'); return; }
    if (draft.enabled && !draft.providers.some(id => state.rows.some(r => r.provider === id && r.connected))) { setError('请先连接账号，并选择参与自动签到的应用。'); return; }
    setBusy(true); setError(''); try { await api.saveSettings({ ...draft, providers: draft.providers.filter(id => state.rows.some(r => r.provider === id && r.connected)) }); saved(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  return <Modal title="自动签到" titleIcon={<Clock size={21} />} close={close} busy={busy} className="checkin-scope ci-auto-dialog" subhead={<p className="dialog-subhead">按设定时间检查，已经领取的周期自动跳过。</p>}><div className="ci-dialog-body">
    <div className="setting-row"><div><strong>启用自动签到</strong><p>连接的账号将按下方规则运行</p></div><Switch label="启用自动签到" checked={draft.enabled} onChange={enabled => update({ enabled })} /></div>
    <div className="setting-row"><div><label htmlFor="checkin-time"><strong>每天检查时间</strong></label><p>北京时间 · Qoder 每天 10:00 开放新一轮</p></div><TimePicker id="checkin-time" value={draft.time} aria-invalid={!!error && !draft.time} aria-describedby="checkin-settings-error" onChange={value => update({ time: value })} /></div>
    <fieldset className="ci-platforms"><legend>参与自动签到的应用</legend>{providers.map(p => { const row = state.rows.find(r => r.provider === p.id)!; return <label key={p.id}><Logo provider={p} small /><span>{p.name}<small>{row.connected ? row.account : '请先连接账号'}</small></span><input type="checkbox" disabled={!row.connected} checked={draft.providers.includes(p.id) && row.connected} onChange={e => update({ providers: e.target.checked ? [...draft.providers.filter(id => id !== p.id), p.id] : draft.providers.filter(id => id !== p.id) })} /></label>; })}</fieldset>
    <div className="setting-row"><div><strong>启动或唤醒后补查</strong><p>错过检查时间时，补查仍可领取的奖励</p></div><Switch label="启动或唤醒后补查" checked={draft.catchup} onChange={catchup => update({ catchup })} /></div>
    <div className="setting-row"><div><strong>需要处理时提醒我</strong><p>登录失效、设备校验或领取失败时提醒</p></div><Switch label="需要处理时提醒我" checked={draft.notify} onChange={notify => update({ notify })} /></div>
    <div className="connection-note compact"><Desktop size={19} /><p>Workbench 运行或驻留托盘时才能执行。电脑关机或应用完全退出期间不运行；能否补领，以各平台规则为准。</p></div><p className="field-error" id="checkin-settings-error" role="alert">{error}</p>
  </div><div className="dialog-actions ci-modal-footer"><button className="ci-btn outline" disabled={busy} onClick={close}>取消</button><button className="ci-btn primary" disabled={busy} onClick={() => { void save(); }}><FloppyDisk size={16} />保存设置</button></div></Modal>;
}

export function CheckinHomeCard({ open }: { open(): void }) {
  const { state, error } = useCheckinState();
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const connected = state?.rows.filter(r => r.connected).length || 0, done = state?.rows.filter(r => r.status === 'claimed').length || 0;
  async function run() { setBusy(true); setNotice(''); try { await api.run([...CHECKIN_PROVIDERS]); } catch (e) { setNotice(errorText(e)); } finally { setBusy(false); } }
  return <section className="panel glass checkin-scope ci-home-card"><div className="section-title"><h2><Gift size={18} />每日签到</h2><button className="ci-link" onClick={open}>管理<ArrowRight size={14} /></button></div><p className="ci-home-description">{done ? `${done} 个应用的本轮签到已确认` : '常用 AI 应用的每日奖励，一起领取'}</p><div className="ci-home-providers">{providers.map(p => <div key={p.id} title={p.name}><Logo provider={p} small /><span>{p.name}</span><small>{captions[state?.rows.find(r => r.provider === p.id)?.status || 'disconnected']}</small></div>)}</div><div className="home-actions"><span>{connected} / 3 个账号已连接</span><button className="ci-btn primary" disabled={busy || state?.rows.some(working)} onClick={() => { if (!connected) open(); else void run(); }}>{busy ? <CircleNotch size={15} className="spin" /> : <Gift size={15} />}{connected ? done === connected ? '检查状态' : '一键签到' : '连接账号'}</button></div>{error || notice ? <p className="field-error" role="alert">{error || notice}</p> : null}</section>;
}

export function CheckinView() {
  const { state, error: loadError } = useCheckinState();
  const [view, setView] = useState('overview'), [selected, setSelected] = useState<CheckinProvider>('workbuddy'), [dialog, setDialog] = useState<'connect' | 'auto' | 'disconnect' | 'help' | null>(null), [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState(''), [showAll, setShowAll] = useState(false);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => { document.querySelector('.content')?.scrollTo(0, 0); }, [view]);
  const rows = state?.rows || CHECKIN_PROVIDERS.map(emptyCheckinRow), settings = state?.settings || DEFAULT_CHECKIN_SETTINGS;
  const connections = rows.filter(r => r.connected).length, done = rows.filter(r => r.status === 'claimed').length;
  const selectedProvider = providers.find(p => p.id === selected)!, selectedRow = rows.find(r => r.provider === selected)!;
  const processing = busy || rows.some(working), lastChecked = Math.max(...rows.map(r => r.checkedAt));
  async function action(task: () => Promise<void>, message?: string) { setBusy(true); setError(''); try { await task(); if (message) setNotice(message); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } }
  function connect(id: CheckinProvider) { setSelected(id); setError(''); setDialog('connect'); }
  function rowAction(p: Provider, row: CheckinRow) {
    const reconnect = !row.connected || row.status === 'expired';
    return <button className={`ci-btn ${row.status === 'claimed' ? 'claimed-button' : reconnect ? 'outline' : 'ghost'}`} disabled={processing || !state} onClick={() => { if (reconnect) connect(p.id); else void action(() => row.status === 'claimed' || row.status === 'pending' || row.status === 'unavailable' ? api.refresh(p.id) : api.run([p.id])); }}>{working(row) ? <CircleNotch size={15} className="spin" /> : row.status === 'claimed' ? <Check size={15} /> : null}{reconnect ? row.status === 'expired' ? '重新连接' : '连接账号' : row.status === 'pending' ? '核对结果' : row.status === 'claimed' ? '已领取 · 核对' : row.status === 'unavailable' ? '检查状态' : row.status === 'error' ? '重新检查' : '立即签到'}</button>;
  }
  return <section className="view on checkin-scope ci-main" aria-label="每日签到">
    <header className="page-heading"><div><h1>每日签到</h1><p>连接常用 AI 应用，在这里统一领取每日奖励。</p></div><button className="ci-btn ghost" onClick={() => setDialog('help')}><Info size={17} />使用说明</button></header>
    <div className="ci-view-tabs"><Segmented aria-label="签到页面" value={view} onChange={setView} options={[{ value: 'overview', label: '签到概览', icon: <Gift size={16} /> }, { value: 'accounts', label: '账号连接', icon: <Link size={16} /> }]} /><span className="local-caption"><ShieldCheck size={15} />本机连接 · 国内版</span></div>
    {loadError || error || state?.warning ? <div className="ci-page-error" role="alert"><WarningCircle size={18} /><span>{loadError || error || state?.warning}</span></div> : null}
    {!state && !loadError ? <p className="ci-page-error" role="status">正在读取本机签到状态…</p> : null}
    {view === 'overview' ? <div className="overview-grid"><div className="overview-primary"><section className="glass ci-panel provider-panel" aria-label="应用签到状态"><div className="provider-panel-heading"><div><h2>本轮签到<span className="count-chip">{done} / 3</span></h2><p>{connections ? `${connections} 个账号已连接，领取前会核对当前状态。` : '先连接账号，之后就能在这里一键领取。'}</p></div><button className="ci-btn primary sign-all" disabled={processing || !connections || !state} aria-busy={processing} onClick={() => { void action(() => api.run([...CHECKIN_PROVIDERS])); }}>{processing ? <CircleNotch size={17} className="spin" /> : <Gift size={17} />}{processing ? '正在处理' : done && done === connections ? '核对签到' : '一键签到'}</button></div>
      <div className="provider-list">{providers.map(p => { const row = rows.find(r => r.provider === p.id)!; return <article className="provider-row" key={p.id} data-provider={p.id}><div className="provider-row-main"><Logo provider={p} /><div className="provider-identity"><h3>{p.name}<span>国内版</span></h3><p>{row.connected ? row.account : '连接后即可查询与领取'}</p></div><div className="provider-reward"><b>{row.reward === null ? '—' : `${row.status === 'claimed' ? '+' : ''}${row.reward}`}</b><span>{p.unit}</span></div></div><div className="provider-row-footer"><div><Status status={row.status} /><span className="provider-state-note">{row.message}</span></div>{rowAction(p, row)}</div></article>; })}</div>
      <footer className="provider-panel-foot"><span><ArrowClockwise size={13} />最后检查：{time(lastChecked)}</span><button className="ci-link" onClick={() => setView('accounts')}>管理账号连接<ArrowRight size={14} /></button></footer>
    </section><section className="glass ci-panel records-panel"><div className="section-title"><h2>最近记录</h2>{(state?.records.length || 0) > 3 ? <button className="ci-link" onClick={() => setShowAll(!showAll)}>{showAll ? '收起' : `全部 ${state!.records.length} 条`}<CaretDown size={13} /></button> : null}</div>{state?.records.length ? <ul className="record-list">{(showAll ? state.records : state.records.slice(0, 3)).map(item => <li key={item.id}><span className={`record-symbol${item.status === 'claimed' ? '' : ' error'}`}>{item.status === 'claimed' ? <CheckCircle size={17} /> : <WarningCircle size={17} />}</span><div><strong>{providers.find(p => p.id === item.provider)!.name} · {item.source === 'auto' ? '自动' : '手动'}</strong><p>{item.message}{item.status === 'claimed' && item.reward !== null ? ` · +${item.reward} ${providers.find(p => p.id === item.provider)!.unit}` : ''}</p></div><time dateTime={new Date(item.at).toISOString()}>{time(item.at)}</time></li>)}</ul> : <div className="records-empty"><Clock size={19} /><p>还没有签到记录<span>领取结果会按应用分别保留在这里。</span></p></div>}</section></div>
    <aside className="overview-secondary"><section className="glass ci-panel automation-card"><div className="section-title"><h2><Clock size={18} />自动签到</h2><span className={`small-badge${settings.enabled ? ' enabled' : ''}`}>{settings.enabled ? '已开启' : '未开启'}</span></div><div className="scheduled-time">{settings.time}<span>每天 · 北京时间</span></div><p>{settings.enabled ? '到点检查已连接的账号，已领取的周期自动跳过。' : '设定一个时间，把每天重复的操作交给工作台。'}</p><div className="automation-catchup"><CloudCheck size={17} /><span>启动与唤醒后{settings.catchup ? '补查' : '不补查'}</span></div><button className="ci-btn outline full" disabled={!state} onClick={() => setDialog('auto')}>{settings.enabled ? '调整自动签到' : '设置自动签到'}<ArrowRight size={15} /></button><small>需保持 Workbench 运行或驻留托盘</small></section><section className="flow-guide"><h3>第一次使用？</h3><ol><li><span>1</span><div><strong>连接账号</strong><p>分别登录三个应用的国内版账号</p></div></li><li><span>2</span><div><strong>点击一键签到</strong><p>先核对状态，再领取可用奖励</p></div></li><li><span>3</span><div><strong>按需开启自动签到</strong><p>需要你处理时，会保留明确提示</p></div></li></ol><button className="ci-link" onClick={() => setView('accounts')}>去连接账号<ArrowRight size={14} /></button></section></aside></div> : <div className="glass ci-panel accounts-panel"><nav className="account-provider-list" aria-label="选择要管理的应用">{providers.map(p => { const row = rows.find(r => r.provider === p.id)!; return <button key={p.id} className={selected === p.id ? 'selected' : ''} aria-current={selected === p.id ? 'true' : undefined} onClick={() => setSelected(p.id)}><Logo provider={p} small /><span><strong>{p.name}</strong><small>{row.status === 'expired' ? '登录已失效' : row.connected ? '已连接' : '未连接'}</small></span><CaretDown size={13} /></button>; })}<div className="account-local-note"><ShieldCheck size={18} /><p>三个账号分别连接<br />断开一个不影响其他应用</p></div></nav><section className="account-details"><header><div><Logo provider={selectedProvider} /><div><h2>{selectedProvider.name}</h2><p>{selectedProvider.owner} · 国内版</p></div></div><span className={`account-connection-badge${selectedRow.connected ? ' connected' : ''}`}>{selectedRow.status === 'expired' ? '需要重新登录' : selectedRow.connected ? '已连接' : '未连接'}</span></header>
      {selectedRow.connected ? <><div className="connected-account"><span className="account-avatar">{selectedRow.account.slice(0, 1).toUpperCase()}</span><div><strong>{selectedRow.account}</strong><span>本机独立连接</span></div><ShieldCheck size={20} /></div><div className="account-meta"><div><span>连接方式</span><strong>{selectedProvider.method}</strong></div><div><span>签到状态</span><Status status={selectedRow.status} /></div></div><p className="provider-state-note">{selectedRow.message}</p></> : <div className="account-empty"><PlugsConnected size={33} /><h3>连接你的 {selectedProvider.name} 账号</h3><p>{selected === 'workbuddy' ? '使用手机号与验证码登录，完成后检查签到活动。' : '在官方浏览器页面登录，返回后检查账号与领取资格。'}</p><button className="ci-btn primary" disabled={!state} onClick={() => connect(selected)}>连接 {selectedProvider.name}<ArrowRight size={16} /></button></div>}
      <section className="account-rules"><h3>签到与奖励</h3><dl><div><dt>每日奖励</dt><dd>{selectedProvider.rule}</dd></div><div><dt>奖励有效期</dt><dd>{selectedProvider.validity}</dd></div><div><dt>领取周期</dt><dd>{selectedProvider.cycle}</dd></div></dl><button className="ci-link" onClick={() => { void action(() => api.openGuide(selected)); }}>查看官方说明<ArrowSquareOut size={14} /></button></section>
      {selectedRow.connected ? <div className="account-actions"><button className="ci-btn outline" disabled={processing} onClick={() => { void action(() => api.refresh(selected)); }}><ArrowClockwise size={16} />检查连接</button><button className="ci-btn ghost" disabled={processing} onClick={() => connect(selected)}>重新连接</button><button className="ci-btn ghost danger-text" disabled={processing} onClick={() => setDialog('disconnect')}><SignOut size={16} />断开连接</button></div> : <div className="privacy-note"><LockKey size={16} /><span>本机加密保存凭据。连接成功后，仍需平台确认领取资格。</span></div>}
    </section></div>}
    <div className={`ci-toast${notice ? ' visible' : ''}`} role="status" aria-live="polite"><CheckCircle size={18} />{notice}</div>
    {dialog === 'connect' && state ? <ConnectionDialog key={selected} provider={selectedProvider} state={state} close={() => setDialog(null)} /> : null}
    {dialog === 'auto' && state ? <AutoDialog state={state} close={() => setDialog(null)} saved={() => { setDialog(null); setNotice('自动签到设置已保存'); }} /> : null}
    {dialog === 'disconnect' ? <Modal title={`断开 ${selectedProvider.name} 连接？`} titleIcon={<SignOut size={21} />} close={() => setDialog(null)} busy={busy} className="checkin-scope ci-disconnect-dialog"><div className="ci-dialog-body"><p>将移除此应用在 Workbench 中的登录凭据，并停止为它自动签到。签到历史会保留。</p>{error ? <p className="field-error" role="alert">{error}</p> : null}<div className="dialog-actions"><button className="ci-btn outline" disabled={busy} autoFocus onClick={() => setDialog(null)}>保留连接</button><button className="ci-btn danger" disabled={busy} onClick={() => { void action(async () => { await api.disconnect(selected); setDialog(null); }, '已断开连接'); }}>断开连接</button></div></div></Modal> : null}
    {dialog === 'help' ? <Modal title="如何连接与签到" titleIcon={<Gift size={21} />} close={() => setDialog(null)} className="checkin-scope ci-help-dialog"><div className="ci-dialog-body"><p className="help-intro">连接账号后，在签到概览点击「一键签到」，也可以开启自动签到。</p>{providers.map(p => <div className="help-provider" key={p.id}><Logo provider={p} small /><div><h3>{p.name}</h3><p>{p.id === 'workbuddy' ? '输入手机号 → 获取短信验证码 → 登录并连接。' : '前往官方授权页 → 完成登录 → 返回工作台，自动检查连接。'}</p><small>{p.cycle}。{p.validity}。</small></div></div>)}<div className="connection-note compact"><Info size={20} /><p>登录失效时重新连接；领取待确认时先核对结果。平台未开放活动或未通过设备校验时，可到官方应用处理。一个应用未完成不会阻止其他应用继续签到。</p></div><div className="dialog-actions"><button className="ci-btn primary" onClick={() => { setDialog(null); setView('accounts'); }}>去连接账号<ArrowRight size={15} /></button></div></div></Modal> : null}
  </section>;
}
