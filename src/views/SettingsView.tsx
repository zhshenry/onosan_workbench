import { Activity, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Plugs, Sparkle } from '@phosphor-icons/react';
import type { AppSettings, AppSettingsPatch, AvatarColor, ReminderRange, TodoDbInfo, UpdateStatus, ViewId } from '../../shared/contracts';
import type { AppearanceController } from '../appearance';
import { AppearanceSettings } from './AppearanceSettings';
import { navigationView, resolveView } from '../nav';
import { errorText, Segmented, Select as TodoSelect, TimePicker } from '../ui/controls';
import { AiSettings } from './AiSettings';
import { IslandSettingsSection } from './IslandSettings';
import { useIslandSettingsEditor } from './island-state';
import { AgentConnectionSettings } from './AgentConnectionSettings';
import type { CheckinProvider } from '../../shared/checkin-contracts';
import { CheckinConnectionSettings } from './CheckinView';

const wb = window.workbench;

// ---------- 分区元信息(页头标题) ----------
const SECTION_META: Partial<Record<ViewId, { title: string }>> = {
  'settings-profile': { title: '个人资料' },
  'settings-general': { title: '通用' },
  'settings-appearance': { title: '个性化' },
  'settings-island': { title: '桌面灵动岛' },
  'settings-ai': { title: '模型配置' },
  'settings-bots': { title: 'Bot 管理' },
  'settings-apps': { title: 'Agent连接' },
  'settings-data': { title: '待办与日程' },
  'settings-about': { title: '关于' },
};

export interface RowSpec {
  key: string;
  title: string;
  desc: string;
  /** 状态展示行可不挂控件 */
  control?: ReactNode;
  heading?: ReactNode;
  content?: ReactNode;
  className?: string;
}

const matches = (query: string, row: { title: string; desc: string }): boolean =>
  !query.trim() || row.title.includes(query.trim()) || row.desc.includes(query.trim());

export function Rows({ rows, query }: { rows: RowSpec[]; query: string }) {
  const visible = rows.filter((r) => matches(query, r));
  if (!visible.length) return <p className="set-empty" role="status">没有匹配的设置</p>;
  return (
    <div className="set-rows">
      {visible.map((row) => (
        <div key={row.key} className={row.className ? `set-row ${row.className}` : 'set-row'} data-setting-key={row.key}>
          <div className="txt">
            {row.heading ?? <b>{row.title}</b>}
            {row.content}
            <span>{row.desc}</span>
          </div>
          {row.control != null && <div className="ctl">{row.control}</div>}
        </div>
      ))}
    </div>
  );
}

// ---------- 应用设置读写 ----------
function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void wb.settings.get().then((raw) => setSettings(raw), (e) => setError(errorText(e)));
  }, []);

  const apply = (patch: AppSettingsPatch, sideEffect?: (next: AppSettings) => void) => {
    if (!settings) return;
    const prev = settings;
    setError('');
    setSettings({
      ...settings,
      ...patch,
      profile: patch.profile ? { ...settings.profile, ...patch.profile } : settings.profile,
    });
    return wb.settings.patch(patch).then(
      (next) => sideEffect?.(next),
      (e) => {
        setSettings(prev);
        setError(errorText(e));
      },
    );
  };

  return { settings, error, apply };
}

// ---------- 通用 ----------
function GeneralSection({ query }: { query: string }) {
  const { settings, error, apply } = useAppSettings();

  const rows: RowSpec[] = settings ? [
    {
      key: 'launchAtLogin',
      title: '开机自启',
      desc: '登录 Windows 后自动启动,并驻留系统托盘',
      control: (
        <button type="button" className="toggle" role="switch" aria-checked={settings.launchAtLogin} aria-label="开机自启"
          onClick={() => apply({ launchAtLogin: !settings.launchAtLogin })} />
      ),
    },
    {
      key: 'closeAction',
      title: '关闭主窗口时',
      desc: '点击窗口 ✕ 不退出应用,后台任务继续运行',
      control: (
        <div className="seg" role="radiogroup" aria-label="关闭主窗口时">
          <button className={settings.closeAction === 'minimize' ? 'on' : ''} aria-pressed={settings.closeAction === 'minimize'}
            onClick={() => apply({ closeAction: 'minimize' })}>最小化到托盘</button>
          <button className={settings.closeAction === 'exit' ? 'on' : ''} aria-pressed={settings.closeAction === 'exit'}
            onClick={() => apply({ closeAction: 'exit' })}>退出应用</button>
        </div>
      ),
    },
    {
      key: 'language',
      title: '界面语言',
      desc: '界面显示语言,更多语言包规划中',
      control: <span className="set-value">简体中文</span>,
    },
  ] : [];

  return (
    <>
      <Rows rows={rows} query={query} />
      {error && <p className="error" role="alert">{error}</p>}
      {!settings && !error && <p className="help" role="status">正在读取设置…</p>}
      <NotificationSettingsSection query={query} />
    </>
  );
}

// ---------- 个人资料(方案 A:设置分区;昵称驱动首页问候与头像首字) ----------
const AVATAR_COLOR_OPTIONS: { value: AvatarColor; label: string }[] = [
  { value: 'blue', label: '海蓝' },
  { value: 'teal', label: '青绿' },
  { value: 'violet', label: '紫藤' },
  { value: 'rose', label: '莓红' },
  { value: 'amber', label: '琥珀' },
];

const greetWord = (d: Date): string => {
  const h = d.getHours();
  return h < 5 ? '夜深了' : h < 11 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好';
};

function ProfileSection({ query, onAvatarColorChange, onProfileNameChange }: {
  query: string;
  onAvatarColorChange(color: AvatarColor): void;
  onProfileNameChange(name: string): void;
}) {
  const { settings, error, apply } = useAppSettings();
  // null = 未在编辑;编辑中草稿存这里,失焦/回车保存,空值拒存
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const name = settings?.profile.name ?? '';
  const initial = (name.trim()[0] ?? 'O').toUpperCase();

  const saveName = (): void => {
    if (nameDraft == null || !settings) return;
    const next = nameDraft.trim().slice(0, 20);
    setNameDraft(null);
    if (!next || next === name) return;
    apply({ profile: { ...settings.profile, name: next } }, (saved) => onProfileNameChange(saved.profile.name));
  };

  const rows: RowSpec[] = settings ? [
    {
      key: 'name',
      title: '昵称',
      desc: '用于看板标题、首页问候与头像',
      control: (
        <input className="name-input" value={nameDraft ?? name} maxLength={20} aria-label="昵称" placeholder="怎么称呼你"
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
      ),
    },
    {
      key: 'avatar',
      title: '头像',
      desc: '自动取昵称首字,可更改头像颜色',
      control: (
        <div className="avatar-settings-control">
          <span className="avatar-preview" data-avatar-color={settings.profile.avatarColor}>{initial}</span>
          <TodoSelect className="avatar-color-select" aria-label="头像颜色" value={settings.profile.avatarColor}
            onChange={(value) => apply({ profile: { ...settings.profile, avatarColor: value as AvatarColor } }, (next) => onAvatarColorChange(next.profile.avatarColor))}
            options={AVATAR_COLOR_OPTIONS}
            renderOption={(option) => (
              <span className="avatar-color-choice">
                <span className="avatar-color-indicator" data-avatar-color={option.value} aria-hidden="true" />
                <span>{option.label}</span>
              </span>
            )} />
        </div>
      ),
    },
    {
      key: 'greet',
      title: '问候预览',
      desc: '首页顶部将这样称呼你',
      control: <span className="greet-chip">{greetWord(new Date())},<em>{name}</em></span>,
    },
  ] : [];

  return (
    <>
      <Rows rows={rows} query={query} />
      {error && <p className="error" role="alert">{error}</p>}
      {!settings && !error && <p className="help" role="status">正在读取设置…</p>}
    </>
  );
}

function NotificationSettingsSection({ query }: { query: string }) {
  const { state, busy, patch, error } = useIslandSettingsEditor();
  const id = useId();
  const settings = state?.settings;
  const rows: RowSpec[] = settings ? [
    { key: 'sound', title: '提醒声音', desc: '控制灵动岛提示音和系统通知声音',
      control: <button type="button" className="toggle" role="switch" aria-label="提醒声音" aria-checked={settings.sound} disabled={busy} onClick={() => patch({ sound: !settings.sound })} /> },
    { key: 'dnd', title: '定时勿扰', desc: '在设定时段静默，提醒留待处理',
      control: <button type="button" className="toggle" role="switch" aria-label="定时勿扰" aria-checked={settings.dnd} disabled={busy} onClick={() => patch({ dnd: !settings.dnd })} /> },
  ] : [];
  if (settings?.dnd) rows.push({ key: 'dndTime', title: '勿扰时段', desc: '',
    control: <fieldset className="island-setting-period" aria-label="勿扰时段" disabled={busy}>
      <div><label htmlFor={`${id}-dnd-start`}>开始</label><TimePicker id={`${id}-dnd-start`} value={settings.dndStart} onChange={dndStart => patch({ dndStart })} /></div>
      <span aria-hidden="true">—</span>
      <div><label htmlFor={`${id}-dnd-end`}>结束</label><TimePicker id={`${id}-dnd-end`} value={settings.dndEnd} onChange={dndEnd => patch({ dndEnd })} /></div>
    </fieldset>,
  });
  return <section className="settings-group settings-notifications" aria-labelledby={`${id}-notifications`}>
    <h2 id={`${id}-notifications`}>通知与勿扰</h2>
    {settings && <Rows rows={rows} query={query} />}
    {error && <p className="error" role="alert">{error}</p>}
    {!settings && !error && <p className="help" role="status">正在读取通知设置…</p>}
  </section>;
}

// ---------- 事项提醒 ----------
const REMINDER_RANGE_OPTIONS: { value: ReminderRange; label: string }[] = [
  { value: 'all', label: '日程和待办' },
  { value: 'schedule', label: '仅日程' },
  { value: 'todo', label: '仅待办' },
  { value: 'off', label: '关闭' },
];

function ReminderSection({ query }: { query: string }) {
  const { settings, error, apply } = useAppSettings();
  const [saving, setSaving] = useState(false);
  const id = useId();
  const rows: RowSpec[] = settings ? [{
    key: 'reminderRange',
    title: '提醒范围',
    desc: '',
    control: <TodoSelect className="reminder-range-select" aria-label="提醒范围" value={settings.reminderRange}
      options={REMINDER_RANGE_OPTIONS} disabled={saving} onChange={async value => {
        if (value === settings.reminderRange) return;
        setSaving(true);
        await apply({ reminderRange: value as ReminderRange });
        setSaving(false);
      }} />,
  }] : [];

  return <section className="settings-group" aria-labelledby={`${id}-reminders`}>
    <h2 id={`${id}-reminders`}>事项提醒</h2>
    {settings && <Rows rows={rows} query={query} />}
    {error && <p className="error" role="alert">{error}</p>}
    {!settings && !error && <p className="help" role="status">正在读取提醒设置…</p>}
  </section>;
}

// ---------- 数据存储 ----------
function DataStorageSection({ query }: { query: string }) {
  const [info, setInfo] = useState<TodoDbInfo | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void wb.todo.info().then(setInfo, (e) => setError(errorText(e)));
  }, []);

  const rows: RowSpec[] = [
    {
      key: 'userData',
      title: '应用数据目录',
      desc: 'AI 配置、对话库与八字命例库都在这里',
      control: <button className="set-btn" aria-label="打开应用数据目录" onClick={() => void wb.appInfo.openUserDataDir().catch(e => setError(`应用数据目录：${errorText(e)}`))}>打开目录</button>,
    },
    {
      key: 'dbPath',
      title: '待办共享库',
      desc: info?.path ?? 'OnO 与 CMO 共用的事项数据目录',
      control: <button className="set-btn" aria-label="打开待办共享库目录" onClick={() => void wb.appInfo.openTodoDir().catch(e => setError(`待办共享库：${errorText(e)}`))}>打开目录</button>,
    },
  ];
  if (info) rows.push(
    {
      key: 'syncState',
      title: '存储状态',
      desc: info.connected
        ? 'OnO 与 CMO 共用本地事项库'
        : '共享事项库暂不可用，请检查数据目录',
      control: <span className="set-value">{info.connected ? '已连接' : '未连接'}</span>,
    },
    {
      key: 'schemaVersion',
      title: '库结构版本',
      desc: 'OnO 与 CMO 的共享事项协议版本，两边需同步升级',
      control: <span className="set-value">v{info.schemaVersion}</span>,
    },
    {
      key: 'scale',
      title: '数据规模',
      desc: `${info.taskCount} 项事项(含日程与待办)· ${info.categoryCount} 个标签`,
    },
  );

  return (
    <section className="settings-storage" aria-labelledby="settings-storage-title">
      <h2 id="settings-storage-title">数据存储</h2>
      <Rows rows={rows} query={query} />
      {error && <p className="error" role="alert">{error}</p>}
      {!info && !error && <p className="help" role="status">正在读取共享库状态…</p>}
    </section>
  );
}

// ---------- 关于 ----------
interface AboutInfo {
  name: string;
  version: string;
  electron: string;
  chrome: string;
  userDataPath: string;
  todoDbPath: string;
}

function AboutSection({ query }: { query: string }) {
  const [info, setInfo] = useState<AboutInfo | null>(null);
  const [update, setUpdate] = useState<UpdateStatus | null>(null);
  const [error, setError] = useState('');
  const [updateError, setUpdateError] = useState('');
  const [acting, setActing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const actionPending = useRef(false);
  const updateRevision = useRef(0);
  const detailsButton = useRef<HTMLButtonElement>(null);
  const detailsId = useId();

  useEffect(() => {
    let active = true;
    let receivedStatus = false;
    const off = wb.updater.onStatus(status => {
      receivedStatus = true;
      updateRevision.current++;
      if (active) { setUpdate(status); setUpdateError(''); }
    });
    void wb.appInfo.about().then(value => { if (active) setInfo(value); }, e => { if (active) setError(errorText(e)); });
    void wb.updater.status().then(status => {
      if (active && !receivedStatus) setUpdate(status);
    }, e => { if (active && !receivedStatus) setUpdateError(errorText(e)); });
    return () => { active = false; off(); };
  }, []);

  const fullError = updateError || (update?.phase === 'error' ? update.message : '');
  useEffect(() => setShowDetails(false), [fullError]);
  const busy = acting || update?.phase === 'checking' || update?.phase === 'downloading';
  const updateAction = (): void => {
    if (!update?.enabled || busy || actionPending.current) return;
    actionPending.current = true;
    setActing(true);
    setUpdateError('');
    const revision = updateRevision.current;
    void (update?.phase === 'ready' ? wb.updater.install() : wb.updater.check())
      .catch(e => { if (updateRevision.current === revision) setUpdateError(errorText(e)); })
      .finally(() => { actionPending.current = false; setActing(false); });
  };
  const statusLabel = fullError ? (update ? '更新失败' : '读取失败') : !update ? '读取中…' : !update.enabled ? '不可自动更新'
    : update.phase === 'latest' ? '当前已是最新版本' : update.phase === 'checking' ? '正在检查更新…'
      : update.phase === 'downloading' ? `正在下载 ${update.progress}%` : update.phase === 'ready' ? '已下载，待重启' : '待检查';
  const compactLabel = fullError || !update?.enabled ? statusLabel : update.phase === 'latest' ? '已是最新版本'
    : update.phase === 'checking' ? '检查中…' : update.phase === 'downloading' ? `下载 ${update.progress}%`
      : update.phase === 'ready' ? '待重启' : statusLabel;
  const rows: RowSpec[] = info ? [
    {
      key: 'version',
      title: `${info.name} v${info.version}`,
      desc: `Electron ${info.electron} · Chromium ${info.chrome}`,
    },
    {
      key: 'update',
      title: '应用更新',
      className: 'set-update-row',
      heading: <div className="set-update-heading">
        <b>应用更新</b>
        <span className="set-update-status" role={fullError ? 'alert' : 'status'} aria-atomic="true">
          <span className="set-update-status-full">{statusLabel}</span>
          <span className="set-update-status-compact">{compactLabel}</span>
        </span>
        {fullError && <button ref={detailsButton} type="button" className="set-update-details-toggle" aria-expanded={showDetails} aria-controls={detailsId}
          onClick={() => setShowDetails(value => !value)} onKeyDown={event => { if (event.key === 'Escape' && showDetails) { event.preventDefault(); setShowDetails(false); } }}>
          {showDetails ? '收起详情' : '详情'}
        </button>}
      </div>,
      desc: update?.enabled ? '自动检查并后台下载，下载完成后点击“重启并安装”更新。' : update?.message ?? (updateError ? '无法读取更新状态，请稍后重新打开此页。' : '正在读取更新状态…'),
      content: <>
        {update?.phase === 'downloading' && <progress className="set-update-progress" aria-label="更新下载进度" value={update.progress} max={100} />}
        {fullError && <p id={detailsId} className="set-update-details" hidden={!showDetails}>{fullError}</p>}
      </>,
      control: <button type="button" className="set-btn set-update-action" disabled={!update?.enabled || busy} aria-busy={busy} onClick={updateAction}>
        {update?.phase === 'ready' ? '重启并安装' : update?.phase === 'checking' ? '检查中…' : update?.phase === 'downloading' ? '下载中…' : '检查更新'}
      </button>,
    },
  ] : [];

  return (
    <>
      <Rows rows={rows} query={query} />
      {error && <p className="error" role="alert">{error}</p>}
      {!info && !error && <p className="help" role="status">正在读取应用信息…</p>}
      <DataStorageSection query={query} />
    </>
  );
}

// ---------- 入口 ----------
const accountTabs = [
  { value: 'settings-apps', label: 'Agent签到连接', icon: <Plugs size={16} aria-hidden="true" /> },
  { value: 'settings-agent-quota', label: 'Agent额度连接', icon: <Sparkle size={16} aria-hidden="true" /> },
];

export function SettingsView({ view, appearance, onAvatarColorChange, botManagement, onProfileNameChange, onNavigate, checkinProvider, checkinBusy, onCheckinConnected, onCheckinSavingChange }: {
  view: ViewId;
  appearance: AppearanceController;
  botManagement?: ReactNode;
  onAvatarColorChange(color: AvatarColor): void;
  onProfileNameChange(name: string): void;
  onNavigate?(view: ViewId): void;
  checkinProvider?: CheckinProvider;
  checkinBusy?: boolean;
  onCheckinConnected?(): void;
  onCheckinSavingChange?(saving: boolean): void;
}) {
  view = resolveView(view);
  const section = navigationView(view);
  const meta = SECTION_META[section] ?? { title: '设置' };
  const quotaTab = view === 'settings-agent-quota';

  return (
    <div className={view === 'settings-ai' ? 'settings-page settings-ai-page' : view === 'settings-about' ? 'settings-page settings-about-page' : view === 'settings-island' ? 'settings-page settings-island-page' : section === 'settings-apps' ? 'settings-page settings-agent-page' : 'settings-page'}>
      <div className="page-head">
        <div>
          <h1>{meta.title}</h1>
        </div>
      </div>
      {section === 'settings-apps' && onNavigate && <fieldset className="settings-account-tabs" disabled={checkinBusy}>
        <Segmented variant="content" aria-label="Agent连接分区" value={quotaTab ? 'settings-agent-quota' : 'settings-apps'} options={accountTabs} onChange={value => onNavigate(value as ViewId)} />
      </fieldset>}
      {view === 'settings-profile' && <ProfileSection query="" onAvatarColorChange={onAvatarColorChange} onProfileNameChange={onProfileNameChange} />}
      {view === 'settings-general' && <GeneralSection query="" />}
      {view === 'settings-appearance' && <AppearanceSettings controller={appearance} />}
      {view === 'settings-island' && <IslandSettingsSection query="" />}
      {view === 'settings-ai' && <AiSettings query="" />}
      {view === 'settings-bots' && botManagement}
      {section === 'settings-apps' && !quotaTab && <CheckinConnectionSettings provider={checkinProvider}
        focusAutomation={view === 'settings-checkin'} onConnected={onCheckinConnected} onSavingChange={onCheckinSavingChange} />}
      {section === 'settings-apps' && <Activity mode={quotaTab ? 'visible' : 'hidden'}>
        <AgentConnectionSettings query="" />
      </Activity>}
      {view === 'settings-data' && <ReminderSection query="" />}
      {view === 'settings-about' && <AboutSection query="" />}
    </div>
  );
}
