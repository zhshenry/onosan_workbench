import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowClockwise, ArrowLeft, ArrowRight, ArrowSquareOut, Browser, CaretDown, Check, CheckCircle, Circle, CircleNotch, Clock, Desktop, Gift, Info, Link, LockKey, PlugsConnected, ShieldCheck, SignOut, WarningCircle, ClockCounterClockwise } from '@phosphor-icons/react';
import { CHECKIN_PROVIDERS, emptyCheckinRow, type CheckinProvider, type CheckinRow, type CheckinSettings, type CheckinState, type CheckinStatus } from '../../shared/checkin-contracts';
import { Modal, Segmented, TimePicker, errorText } from '../ui/controls';
import workbuddyLogo from '../assets/checkin-providers/workbuddy.svg';
import qoderLogo from '../assets/checkin-providers/qoder.svg';
import traeLogo from '../assets/checkin-providers/trae.png';
import './checkin.css';

const api = window.workbench.checkin;
const providers = [
  { id: 'workbuddy' as const, name: 'WorkBuddy', owner: '腾讯', logo: workbuddyLogo, unit: '积分', method: '手机号与验证码登录', domain: 'www.workbuddy.cn', validity: '奖励与有效期以本期活动为准', cycle: '按当前活动的领取周期检查' },
  { id: 'qoder' as const, name: 'Qoder', owner: '阿里', logo: qoderLogo, unit: 'Credits', method: '官方浏览器授权', domain: 'qoder.com.cn', validity: '每日奖励领取后 30 天有效，以官方活动为准', cycle: '每天 10:00 至次日 10:00（北京时间）' },
  { id: 'trae' as const, name: 'TRAE CN', owner: '字节', logo: traeLogo, unit: '积分', method: '官方浏览器授权', domain: 'www.trae.cn', validity: '每笔签到奖励 31 个自然日有效，以官方规则为准', cycle: '按平台返回的当日状态检查' },
];
type Provider = typeof providers[number];
const captions: Record<CheckinStatus, string> = { disconnected: '未连接', ready: '待签到', checking: '查询签到状态', claiming: '正在领取', claimed: '本轮已领取', expired: '需要重新登录', pending: '领取待确认', error: '签到未完成', unavailable: '暂无可领取活动' };
const working = (row: CheckinRow): boolean => ['checking', 'claiming'].includes(row.status);
const time = (at: number): string => at ? new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' }).format(at) : '尚未检查';
function Logo({ provider, small = false }: { provider: Provider; small?: boolean }) { return <span className={`provider-logo${small ? ' small' : ''}`}><img src={provider.logo} alt="" /></span>; }
function Switch({ checked, onChange, label, disabled = false }: { checked: boolean; onChange(value: boolean): void; label: string; disabled?: boolean }) { return <button type="button" className="ci-switch" role="switch" aria-label={label} aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}><span /></button>; }
function Status({ status }: { status: CheckinStatus }) { const Icon = ['checking', 'claiming'].includes(status) ? CircleNotch : status === 'claimed' ? CheckCircle : ['expired', 'pending', 'error', 'unavailable'].includes(status) ? WarningCircle : status === 'disconnected' ? Link : Clock; return <span className={`ci-status ${status}`}><Icon size={15} className={['checking', 'claiming'].includes(status) ? 'spin' : ''} />{captions[status]}</span>; }
export function useCheckinState() {
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

function ConnectionDialog({ provider, state, close, connected }: { provider: Provider; state: CheckinState; close(): void; connected?(): void }) {
  const [phone, setPhone] = useState(''), [code, setCode] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [retryAt, setRetryAt] = useState(0), [now, setNow] = useState(Date.now());
  const phoneInput = useRef<HTMLInputElement>(null), codeInput = useRef<HTMLInputElement>(null), alive = useRef(true), initialAuth = useRef(state.auth?.id);
  const auth = state.auth?.provider === provider.id && state.auth.id !== initialAuth.current ? state.auth : null;
  useEffect(() => { alive.current = true; const timer = setInterval(() => setNow(Date.now()), 1000); return () => { alive.current = false; clearInterval(timer); void api.cancelAuth(provider.id).catch(() => {}); }; }, [provider.id]);
  useEffect(() => { if (auth?.stage === 'connected') { close(); connected?.(); } }, [auth?.stage]);
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
      <div className="connection-note compact"><Info size={18} /><p>{provider.id === 'qoder' ? '每日奖励面向符合条件的个人账号；能登录不代表有可领取活动。' : '连接时沿用本机设备标识。设备校验失败时，请到 TRAE CN 官方应用处理。'}</p></div>
      <div className="privacy-note"><ShieldCheck size={16} /><span>无需将账号密码填写到 Workbench；登录凭据仅在本机加密保存。</span></div><p className="field-error" role="alert">{error || (auth?.stage === 'error' ? auth.message : '')}</p>
      <div className="dialog-actions"><button className="ci-btn outline" onClick={cancel}>取消</button><button className="ci-btn primary" disabled={busy} onClick={() => { void authorize(); }}>前往 {provider.name} 授权<ArrowSquareOut size={16} /></button></div>
    </>}
  </div></Modal>;
}

function CheckinAutomationForm({ state, onSavingChange }: { state: CheckinState; onSavingChange?(saving: boolean): void }) {
  const [settings, setSettings] = useState(state.settings);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const saving = useRef(false);
  useEffect(() => { if (!saving.current) setSettings(state.settings); }, [state.settings]);

  async function update(patch: Partial<CheckinSettings>) {
    if (saving.current) return;
    const next = { ...settings, ...patch };
    setError('');
    if (JSON.stringify(next) === JSON.stringify(settings)) return;
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(next.time)) { setError('请选择每天检查时间。'); return; }
    if (next.enabled) {
      const connected = state.rows.filter(row => row.connected).map(row => row.provider);
      next.providers = next.providers.filter(id => connected.includes(id));
      if (patch.enabled && !next.providers.length) next.providers = connected;
      if (!next.providers.length) {
        setError(patch.enabled ? '请先连接参与自动签到的账号。' : '请至少选择一个参与自动签到的应用。');
        return;
      }
    }
    saving.current = true;
    setBusy(true);
    onSavingChange?.(true);
    setSettings(next);
    try { await api.saveSettings(next); }
    catch (cause) {
      setSettings(settings);
      setError(`自动签到设置保存失败，已恢复上次设置。${errorText(cause)}`);
    } finally {
      saving.current = false;
      setBusy(false);
      onSavingChange?.(false);
    }
  }
  return <section className="checkin-scope ci-automation-settings" aria-label="自动签到设置" aria-busy={busy || undefined}>
    <div className="connection-note compact"><Desktop size={19} /><p>Workbench 运行或驻留托盘时才能执行。电脑关机或应用完全退出期间不运行；能否补领，以各平台规则为准。</p></div>
    <fieldset className="ci-settings-fields" disabled={busy}><div className="ci-dialog-body">
    <div className="setting-row"><div><strong>启用自动签到</strong><p>按所选应用和时间运行。未选时使用已连接的应用。</p></div><Switch label="启用自动签到" checked={settings.enabled} onChange={enabled => void update({ enabled })} /></div>
    {settings.enabled && <>
      <div className="setting-row"><div><label htmlFor="checkin-time"><strong>每天检查时间</strong></label><p>北京时间 · Qoder 每天 10:00 开放新一轮</p></div><TimePicker id="checkin-time" value={settings.time} commitOnClose aria-describedby={error ? 'checkin-settings-error' : undefined} onChange={time => void update({ time })} /></div>
      <fieldset className="ci-platforms"><legend>参与自动签到的应用</legend>{providers.map(p => { const row = state.rows.find(r => r.provider === p.id)!; return <label key={p.id}><Logo provider={p} small /><span>{p.name}<small>{row.connected ? row.account : '请先连接账号'}</small></span><input type="checkbox" disabled={!row.connected} checked={settings.providers.includes(p.id) && row.connected} onChange={e => void update({ providers: e.target.checked ? [...settings.providers, p.id] : settings.providers.filter(id => id !== p.id) })} /></label>; })}</fieldset>
      <div className="setting-row"><div><strong>启动或唤醒后补查</strong><p>错过检查时间时，补查仍可领取的奖励</p></div><Switch label="启动或唤醒后补查" checked={settings.catchup} onChange={catchup => void update({ catchup })} /></div>
      <div className="setting-row"><div><strong>需要处理时提醒我</strong><p>登录失效、设备校验或领取失败时提醒</p></div><Switch label="需要处理时提醒我" checked={settings.notify} onChange={notify => void update({ notify })} /></div>
    </>}
    {error && <p className="field-error" id="checkin-settings-error" role="alert">{error}</p>}
    </div></fieldset>
  </section>;
}
export type CheckinCardVariant = 'parallel' | 'list' | 'tiles' | 'progress';
export function CheckinHomeContent({ state, error = '', notice = '', busy = false, open, connect = open, run, embedded = false, variant = 'parallel' }: {
  state: CheckinState | null; error?: string; notice?: string; busy?: boolean; open(): void; connect?(provider?: CheckinProvider): void; run(): void; embedded?: boolean; variant?: CheckinCardVariant;
}) {
  const connected = state?.rows.filter(r => r.connected).length || 0, done = state?.rows.filter(r => r.status === 'claimed').length || 0;
  const label = connected ? done === connected ? '检查状态' : '一键签到' : '连接账号';
  const action = <button className="ci-btn primary" disabled={!state || busy || state.rows.some(working)} onClick={() => { if (!connected) connect(); else run(); }}>{busy ? <CircleNotch size={15} className="spin" /> : null}{label}{!busy ? <ArrowRight size={16} /> : null}</button>;
  return <section className={`panel glass checkin-scope ci-home-card${embedded ? ' embedded' : ''}`} data-variant={variant} aria-label="每日签到">
    {!embedded ? <header className="ci-home-heading">
      <div><h2><Gift size={18} />每日签到</h2><p className="ci-home-description">{done ? `${done} 个应用的本轮签到已确认` : '三个应用，一处领取'}</p></div>
      {action}
    </header> : null}
    {variant === 'progress' ? <div className="ci-home-progress"><strong>{state ? done : '—'} / 3</strong><span>本轮已领取</span><progress aria-label="本轮已领取应用数" max={3} value={done} /></div> : <div className="ci-home-providers" role="list" aria-label="签到应用">
      {providers.map(p => {
        const row = state?.rows.find(r => r.provider === p.id), status = row?.status || 'disconnected';
        const caption = variant === 'tiles' && status === 'claimed' ? '已领取' : captions[status];
        const statusLabel = state && (!row?.connected || status === 'expired') ? <button type="button" className={`ci-home-status ci-home-connect ${status}`} aria-label={`${status === 'expired' ? '重新连接' : '去连接'} ${p.name}`} disabled={busy} onClick={() => connect(p.id)}>{status === 'expired' ? '重新连接' : '去连接'}<ArrowRight size={12} /></button> : <small className={`ci-home-status ${status}`}><Circle size={6} weight="fill" aria-hidden="true" /><span>{variant === 'tiles' && !state ? '正在读取' : caption}</span></small>;
        return <div key={p.id} role="listitem" title={p.name} data-provider={p.id}>
          {variant === 'tiles' ? <>
            <div className="ci-home-tile-brand"><Logo provider={p} small /><strong>{p.name}</strong></div>
            <div className="ci-home-tile-details">{statusLabel}{row?.status === 'claimed' ? <span className="ci-home-reward"><strong>{row.reward === null ? '—' : `+${row.reward}`}</strong>{row.reward !== null ? <small>{p.unit}</small> : null}</span> : null}</div>
          </> : <>
            <Logo provider={p} small />
            <div className="ci-home-provider-copy"><strong>{p.name}</strong>{statusLabel}</div>
          </>}
        </div>;
      })}
    </div>}
    <footer className="ci-home-footer"><span className="ci-home-count">{state ? variant === 'tiles' ? `${connected} / 3 已连接` : `${connected} / 3 个账号已连接` : '正在读取签到状态…'}</span>{embedded ? action : null}<button className="ci-link" onClick={open}>查看全部<ArrowRight size={15} /></button></footer>
    {error || notice ? <p className="field-error" role="alert">{error || notice}</p> : null}
  </section>;
}

export function CheckinHomeCard({ open, connect, embedded = false, variant = 'parallel' }: { open(): void; connect?(provider?: CheckinProvider): void; embedded?: boolean; variant?: CheckinCardVariant }) {
  const { state, error } = useCheckinState();
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  async function run() { setBusy(true); setNotice(''); try { await api.run([...CHECKIN_PROVIDERS]); } catch (e) { setNotice(errorText(e)); } finally { setBusy(false); } }
  return <CheckinHomeContent state={state} error={error} busy={busy} notice={notice} open={open} connect={connect} run={() => { void run(); }} embedded={embedded} variant={variant} />;
}

export type OpenCheckinSettings = (view: 'settings-apps' | 'settings-checkin', provider?: CheckinProvider) => void;
export function CheckinView({ onOpenSettings, onBack }: { onOpenSettings: OpenCheckinSettings; onBack(): void }) {
  const { state, error: loadError } = useCheckinState();
  const [view, setView] = useState('overview'), [dialog, setDialog] = useState<'help' | null>(null), [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState('');
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => { document.querySelector('.content')?.scrollTo(0, 0); }, [view]);
  const rows = state?.rows || CHECKIN_PROVIDERS.map(emptyCheckinRow);
  const connections = rows.filter(r => r.connected).length, done = rows.filter(r => r.status === 'claimed').length;
  const processing = busy || rows.some(working), lastChecked = Math.max(...rows.map(r => r.checkedAt));
  async function action(task: () => Promise<void>, message?: string) { setBusy(true); setError(''); try { await task(); if (message) setNotice(message); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } }
  function rowAction(p: Provider, row: CheckinRow) {
    const reconnect = !row.connected || row.status === 'expired';
    return <button className={`ci-btn ${row.status === 'claimed' ? 'claimed-button' : reconnect ? 'outline' : row.status === 'ready' ? 'outline ci-ready' : 'ghost'}`} disabled={processing || !state} onClick={() => { if (reconnect) onOpenSettings('settings-apps', p.id); else void action(() => row.status === 'claimed' || row.status === 'pending' || row.status === 'unavailable' ? api.refresh(p.id) : api.run([p.id])); }}>{working(row) ? <CircleNotch size={15} className="spin" /> : row.status === 'claimed' ? <Check size={15} /> : null}{reconnect ? row.status === 'expired' ? '重新连接' : '连接账号' : row.status === 'pending' ? '核对结果' : row.status === 'claimed' ? '已领取 · 核对' : row.status === 'unavailable' ? '检查状态' : row.status === 'error' ? '重新检查' : '立即签到'}</button>;
  }
  return <section className="view on checkin-scope ci-main" aria-label="每日签到">
    <header className="ci-page-header">
      <div className="page-heading">
        <div className="ci-page-title"><button type="button" className="ci-btn outline ci-back-button" aria-label="返回总台" title="返回总台" onClick={onBack}><ArrowLeft size={18} /></button><h1>每日签到</h1></div>
        <div className="ci-view-tabs"><Segmented variant="content" aria-label="签到页面" value={view} onChange={setView} options={[{ value: 'overview', label: '签到概览', icon: <CheckCircle size={16} aria-hidden="true" /> }, { value: 'records', label: '签到记录', icon: <ClockCounterClockwise size={16} aria-hidden="true" /> }]} /></div>
        <div className="ci-heading-actions"><button className="ci-btn outline" disabled={!state} onClick={() => onOpenSettings('settings-checkin')}><Clock size={16} />自动签到</button><button className="ci-btn outline" disabled={!state || processing} onClick={() => { void action(async () => { for (const id of CHECKIN_PROVIDERS) await api.refresh(id); }); }}><ArrowClockwise size={16} className={processing ? 'spin' : ''} />刷新状态</button><button className="ci-btn outline ci-help-button" aria-label="使用说明" title="使用说明" onClick={() => setDialog('help')}><Info size={18} /></button></div>
      </div>
    </header>
    {loadError || error || state?.warning ? <div className="ci-page-error" role="alert"><WarningCircle size={18} /><span>{loadError || error || state?.warning}</span></div> : null}
    {!state && !loadError ? <p className="ci-page-error" role="status">正在读取本机签到状态…</p> : null}
    {view === 'records' ? <section className="glass ci-panel records-panel" aria-label="签到记录"><div className="section-title"><h2>签到记录</h2><span className="count-chip">{state?.records.length || 0} 条</span></div>{state?.records.length ? <ul className="record-list">{state.records.map(item => <li key={item.id}><span className={`record-symbol${item.status === 'claimed' ? '' : ' error'}`}>{item.status === 'claimed' ? <CheckCircle size={17} /> : <WarningCircle size={17} />}</span><div><strong>{providers.find(p => p.id === item.provider)!.name} · {item.source === 'auto' ? '自动' : '手动'}</strong><p>{item.message}{item.status === 'claimed' && item.reward !== null ? ` · +${item.reward} ${providers.find(p => p.id === item.provider)!.unit}` : ''}</p></div><time dateTime={new Date(item.at).toISOString()}>{time(item.at)}</time></li>)}</ul> : <div className="records-empty"><Clock size={19} /><p>还没有成功签到记录<span>成功领取的奖励和时间会保留在这里。</span></p></div>}</section> : <section className="glass ci-panel provider-panel" aria-label="应用签到状态"><div className="provider-panel-heading"><div><h2>本轮签到</h2><p>{done} / {providers.length} 已领取，{connections} / {providers.length} 账号已连接</p></div><button className="ci-btn primary sign-all" disabled={processing || !connections || !state} aria-busy={processing} onClick={() => { void action(() => api.run([...CHECKIN_PROVIDERS])); }}>{processing ? <CircleNotch size={17} className="spin" /> : null}{processing ? '正在处理' : done && done === connections ? '核对签到' : '一键签到'}</button></div>
      <progress className="ci-round-progress" aria-label="本轮已领取应用数" max={providers.length} value={done} />
      <div className="provider-list" role="table" aria-label="应用签到清单">
        <div className="provider-table-heading" role="row"><span role="columnheader">应用</span><span role="columnheader">连接状态</span><span role="columnheader">本轮状态</span><span role="columnheader">领取奖励</span><span role="columnheader">操作</span></div>
        {providers.map(p => { const row = rows.find(r => r.provider === p.id)!; return <article className="provider-row" role="row" key={p.id} data-provider={p.id}>
          <div className="provider-row-main" role="cell"><Logo provider={p} /><div className="provider-identity"><h3>{p.name}</h3><p>{row.connected ? row.account : `${p.owner} · 国内版`}</p></div></div>
          <span role="cell" className={`ci-connection ${row.status === 'expired' ? 'expired' : row.connected ? 'connected' : ''}`}><Circle size={8} weight="fill" aria-hidden="true" />{row.status === 'expired' ? '登录已失效' : row.connected ? '已连接' : '未连接'}</span>
          <div className="provider-round-state" role="cell"><Status status={row.status} />{row.message && <span className="provider-state-note" title={row.message}>{row.message}</span>}</div>
          <div className="provider-reward" role="cell"><b>{row.reward === null ? '—' : `${row.status === 'claimed' ? '+' : ''}${row.reward}`}</b>{row.reward !== null && <span>{p.unit}</span>}</div>
          <div className="provider-action" role="cell">{rowAction(p, row)}</div>
        </article>; })}
      </div>
      <footer className="provider-panel-foot"><span><ArrowClockwise size={13} />最后检查：{time(lastChecked)}</span><button className="ci-link" onClick={() => onOpenSettings('settings-apps')}>Agent连接<ArrowRight size={14} /></button></footer>
    </section>}
    <div className={`ci-toast${notice ? ' visible' : ''}`} role="status" aria-live="polite"><CheckCircle size={18} />{notice}</div>
    {dialog === 'help' ? <Modal title="如何连接与签到" titleIcon={<Gift size={21} />} close={() => setDialog(null)} className="checkin-scope ci-help-dialog"><div className="ci-dialog-body"><p className="help-intro">连接账号后，在签到概览点击「一键签到」，也可以开启自动签到。</p>{providers.map(p => <div className="help-provider" key={p.id}><Logo provider={p} small /><div><h3>{p.name}</h3><p>{p.id === 'workbuddy' ? '输入手机号 → 获取短信验证码 → 登录并连接。' : '前往官方授权页 → 完成登录 → 返回工作台，自动检查连接。'}</p><small>{p.cycle}。{p.validity}。</small></div></div>)}<div className="connection-note compact"><Info size={20} /><p>登录失效时重新连接；领取待确认时先核对结果。平台未开放活动或未通过设备校验时，可到官方应用处理。一个应用未完成不会阻止其他应用继续签到。</p></div><div className="dialog-actions"><button className="ci-btn primary" onClick={() => { setDialog(null); onOpenSettings('settings-apps'); }}>去连接账号<ArrowRight size={15} /></button></div></div></Modal> : null}
  </section>;
}

export function CheckinConnectionSettings({ provider, focusAutomation, onConnected, onSavingChange }: {
  provider?: CheckinProvider;
  focusAutomation?: boolean;
  onConnected?(): void;
  onSavingChange?(saving: boolean): void;
}) {
  const { state, error: loadError } = useCheckinState();
  const [selected, setSelected] = useState<CheckinProvider>(provider ?? 'workbuddy'), [dialog, setDialog] = useState<'connect' | 'disconnect' | null>(null), [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState('');
  const automationHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (provider) setSelected(provider); }, [provider]);
  useEffect(() => {
    if (!focusAutomation) return;
    automationHeading.current?.focus({ preventScroll: true });
    automationHeading.current?.scrollIntoView({ block: 'start' });
  }, [focusAutomation]);
  const rows = state?.rows || CHECKIN_PROVIDERS.map(emptyCheckinRow), selectedProvider = providers.find(item => item.id === selected)!, selectedRow = rows.find(row => row.provider === selected)!;
  const { status, message } = selectedRow;
  const displayAccount = selectedRow.account.trim()
    .replace(/^((?:\+86[ -]?)?1\d{2})[ -]?\d{4}[ -]?(\d{4})$/, '$1 **** $2')
    .replace(/^([^@\s])?[^@\s]+(@[^@\s]+)$/, '$1***$2');
  const showStatusNote = message && message !== captions[status] && ['expired', 'error', 'pending', 'unavailable'].includes(status);
  const processing = busy || rows.some(working);
  async function action(task: () => Promise<void>, message?: string) { if (busy) return; setBusy(true); setError(''); setNotice(''); try { await task(); if (message) setNotice(message); } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); } }
  function connect(id: CheckinProvider) { setSelected(id); setError(''); setDialog('connect'); }
  return <>
  <section className="checkin-scope ci-settings-accounts" aria-label="应用连接管理">
    {loadError || error || state?.warning ? <p className="field-error" role="alert">{loadError || error || state?.warning}</p> : null}
    {!state && !loadError && <p role="status">正在读取应用连接…</p>}
    <div className="ci-panel accounts-panel">
      <nav className="account-provider-list" aria-label="选择要管理的应用">{providers.map(p => { const row = rows.find(r => r.provider === p.id)!; return <button key={p.id} className={selected === p.id ? 'selected' : ''} aria-current={selected === p.id ? 'true' : undefined} onClick={() => setSelected(p.id)}><Logo provider={p} small /><span><strong>{p.name}</strong><small className={row.status === 'expired' ? 'expired' : row.connected ? 'connected' : undefined}>{row.status === 'expired' ? '登录已失效' : row.connected ? '已连接' : '未连接'}</small></span><CaretDown size={13} /></button>; })}</nav>
      <section className="account-details" aria-label="账号详情">
        <header>
          <Logo provider={selectedProvider} />
          <div className="account-summary">
            <div>
              <h2>{selectedProvider.name}</h2>
              {selectedRow.connected && displayAccount && <p>{displayAccount}</p>}
            </div>
            {state && <div className="account-checkin" aria-live="polite"><span>签到状态</span><Status status={status} /></div>}
          </div>
          <button type="button" className="ci-link" disabled={busy} onClick={() => { void action(() => api.openGuide(selected)); }}>查看官方说明<ArrowSquareOut size={14} /></button>
        </header>
        {showStatusNote && <p className="provider-state-note">{message}</p>}
        <div className="account-actions">
          {selectedRow.connected ? <>
            <button type="button" className="ci-btn outline" disabled={processing} onClick={() => { void action(() => api.refresh(selected)); }}><ArrowClockwise size={16} />检查连接</button>
            <button type="button" className="ci-btn ghost" disabled={processing} onClick={() => connect(selected)}>重新连接</button>
            <button type="button" className="ci-btn ghost danger-text" disabled={processing} onClick={() => setDialog('disconnect')}><SignOut size={16} />断开连接</button>
          </> : <button type="button" className="ci-btn primary" disabled={!state} onClick={() => connect(selected)}>连接 {selectedProvider.name}<ArrowRight size={16} /></button>}
        </div>
      </section>
    </div>
    {notice && <p className="ci-settings-notice" role="status">{notice}</p>}
    {dialog === 'connect' && state ? <ConnectionDialog key={selected} provider={selectedProvider} state={state} close={() => setDialog(null)} connected={onConnected} /> : null}
    {dialog === 'disconnect' ? <Modal title={`断开 ${selectedProvider.name} 连接？`} titleIcon={<SignOut size={21} />} close={() => setDialog(null)} busy={busy} className="checkin-scope ci-disconnect-dialog"><div className="ci-dialog-body"><p>将移除此应用在 Workbench 中的登录凭据，并停止为它自动签到。签到历史会保留。</p>{error ? <p className="field-error" role="alert">{error}</p> : null}<div className="dialog-actions"><button className="ci-btn outline" disabled={busy} autoFocus onClick={() => setDialog(null)}>保留连接</button><button className="ci-btn danger" disabled={busy} onClick={() => { void action(async () => { await api.disconnect(selected); setDialog(null); }, '已断开连接'); }}>断开连接</button></div></div></Modal> : null}
  </section>
  <div className="settings-checkin-automation">
    <h2 ref={automationHeading} tabIndex={-1}>自动签到</h2>
    {state ? <CheckinAutomationForm state={state} onSavingChange={onSavingChange} />
      : <p role="status">{loadError ? '暂时无法读取签到设置' : '正在读取签到设置…'}</p>}
  </div>
  </>;
}
