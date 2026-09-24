import { useEffect, useState, type ReactNode } from 'react';
import type { AppSettings, AppSettingsPatch, TodoDbInfo, UiTheme, ViewId } from '../../shared/contracts';
import type { AIModel, AIProtocol } from '../../shared/todo-contracts';
import { errorText } from '../../modules/todo/ui/ui';
import type { AiConfig } from './AiPanel';

const wb = window.workbench;

// ---------- 分区元信息(页头标题) ----------
const SECTION_META: Partial<Record<ViewId, { title: string; sub: string }>> = {
  'settings-profile': { title: '个人资料', sub: '称呼与头像,只用于界面展示,存在本机' },
  'settings-general': { title: '通用', sub: '应用行为与启动选项' },
  'settings-appearance': { title: '外观', sub: '界面主题与观感' },
  'settings-ai': { title: 'AI 助手', sub: '供应商、模型与启用开关(工作台独立配置)' },
  'settings-data': { title: '待办与数据', sub: '与 To-Do-List 的共享库状态(只读展示)' },
  'settings-notifications': { title: '通知', sub: '提醒与系统通知' },
  'settings-about': { title: '关于', sub: '版本与数据位置' },
};

interface RowSpec {
  key: string;
  title: string;
  desc: string;
  /** 状态展示行可不挂控件 */
  control?: ReactNode;
}

const matches = (query: string, row: { title: string; desc: string }): boolean =>
  !query.trim() || row.title.includes(query.trim()) || row.desc.includes(query.trim());

function Rows({ rows, query }: { rows: RowSpec[]; query: string }) {
  const visible = rows.filter((r) => matches(query, r));
  if (!visible.length) return <p className="set-empty" role="status">没有匹配的设置</p>;
  return (
    <div className="set-rows">
      {visible.map((row) => (
        <div key={row.key} className="set-row">
          <div className="txt">
            <b>{row.title}</b>
            <span>{row.desc}</span>
          </div>
          {row.control != null && <div className="ctl">{row.control}</div>}
        </div>
      ))}
    </div>
  );
}

// ---------- 应用设置读写(通用/通知分区共用) ----------
function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void wb.settings.get().then((raw) => setSettings(raw), (e) => setError(errorText(e)));
  }, []);

  const apply = (patch: AppSettingsPatch, sideEffect?: (next: AppSettings) => void): void => {
    if (!settings) return;
    const prev = settings;
    setSettings({ ...settings, ...patch });
    void wb.settings.patch(patch).then(
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
function GeneralSection({ query, onSnavDefaultChange }: {
  query: string;
  onSnavDefaultChange(collapsed: boolean): void;
}) {
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
      desc: '点击窗口 ✕ 不退出应用,待办提醒与后台任务继续运行',
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
    {
      key: 'snavDefaultCollapsed',
      title: '二级导航默认收起',
      desc: '进入工作台时不自动展开二级目录,点击当前工作台图标可重新展开',
      control: (
        <button type="button" className="toggle" role="switch" aria-checked={settings.snavDefaultCollapsed} aria-label="二级导航默认收起"
          onClick={() => {
            const next = !settings.snavDefaultCollapsed;
            apply({ snavDefaultCollapsed: next }, () => onSnavDefaultChange(next));
          }} />
      ),
    },
  ] : [];

  return (
    <>
      <Rows rows={rows} query={query} />
      {error && <p className="error" role="alert">{error}</p>}
      {settings && <p className="help">设置即时生效并自动保存。关闭行为中的「退出应用」仍会保留托盘提醒开关,需从托盘菜单彻底退出。</p>}
      {!settings && !error && <p className="help" role="status">正在读取设置…</p>}
      <p className="help">开机自启在安装版中注册系统登录项;便携/开发模式下注册的是当前执行文件。</p>
    </>
  );
}

// ---------- 个人资料(方案 A:设置分区;昵称驱动首页问候与头像首字) ----------
const greetWord = (d: Date): string => {
  const h = d.getHours();
  return h < 5 ? '夜深了' : h < 11 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好';
};

function ProfileSection({ query }: { query: string }) {
  const { settings, error, apply } = useAppSettings();
  // null = 未在编辑;编辑中草稿存这里,失焦/回车保存,空值拒存
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const name = settings?.profile.name ?? '';
  const initial = (name.trim()[0] ?? 'O').toUpperCase();

  const saveName = (): void => {
    if (nameDraft == null) return;
    const next = nameDraft.trim().slice(0, 20);
    setNameDraft(null);
    if (!next || next === name) return;
    apply({ profile: { name: next } });
  };

  const rows: RowSpec[] = settings ? [
    {
      key: 'name',
      title: '昵称',
      desc: '首页问候与头像取首字显示',
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
      desc: '自动取昵称首字,暂不支持自定义图片',
      control: <span className="avatar-preview">{initial}</span>,
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
      {settings && <p className="help">资料保存在本机应用数据,不与任何账户或 To-Do-List 同步。</p>}
      {!settings && !error && <p className="help" role="status">正在读取设置…</p>}
    </>
  );
}

// ---------- 外观(界面主题:mist 雾灰墨点 = 默认,sunny 晴蓝 A+ = 备选) ----------
const THEME_OPTIONS: { value: UiTheme; label: string; desc: string; swatches: string[] }[] = [
  { value: 'mist', label: '雾灰 · 墨点', desc: '默认 · 暖灰画布 + 墨色激活', swatches: ['#e9eaee', '#ffffff', '#7f9dd3', '#232529'] },
  { value: 'sunny', label: '晴蓝 A+', desc: '冰蓝画布 + 晴蓝单强调色', swatches: ['#eaf1f7', '#ffffff', '#8fb6da', '#2b78b5'] },
];

function AppearanceSection({ query, uiTheme, onUiThemeChange }: {
  query: string;
  uiTheme: UiTheme;
  onUiThemeChange(theme: UiTheme): void;
}) {
  const { settings, error, apply } = useAppSettings();

  const rows: RowSpec[] = settings ? [
    {
      key: 'uiTheme',
      title: '界面主题',
      desc: '全局配色方案,即时生效;布局与按钮位置不受影响',
      control: (
        <div className="theme-pick" role="radiogroup" aria-label="界面主题">
          {THEME_OPTIONS.map((t) => (
            <button key={t.value} type="button" className={uiTheme === t.value ? 'theme-card on' : 'theme-card'}
              role="radio" aria-checked={uiTheme === t.value} aria-label={t.label}
              onClick={() => { if (uiTheme !== t.value) apply({ uiTheme: t.value }, () => onUiThemeChange(t.value)); }}>
              <span className="sw">{t.swatches.map((c, i) => <i key={i} style={{ background: c }} />)}</span>
              <b>{t.label}</b>
              <span>{t.desc}</span>
            </button>
          ))}
        </div>
      ),
    },
  ] : [];

  return (
    <>
      <Rows rows={rows} query={query} />
      {error && <p className="error" role="alert">{error}</p>}
      {settings && <p className="help">主题只影响配色;玻璃材质、圆角与字体两套方案一致。当前备选主题为原「晴蓝 A+」线上版,雾灰墨点为 2026-09-24 定稿默认。</p>}
      {!settings && !error && <p className="help" role="status">正在读取设置…</p>}
    </>
  );
}

// ---------- 待办与数据(只读状态页,策略上游为源) ----------
function DataSection({ query }: { query: string }) {
  const [info, setInfo] = useState<TodoDbInfo | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void wb.todo.info().then(setInfo, (e) => setError(errorText(e)));
  }, []);

  const rows: RowSpec[] = info ? [
    {
      key: 'dbPath',
      title: '共享库路径',
      desc: info.path,
      control: <button className="set-btn" onClick={() => void wb.appInfo.openTodoDir()}>打开目录</button>,
    },
    {
      key: 'syncState',
      title: '同步状态',
      desc: info.connected
        ? '已连接,与 To-Do-List 同库互通,两侧增删改实时可见'
        : '未连接:共享库暂不可用,请检查 To-Do-List 数据目录',
      control: <span className="set-value">{info.connected ? '已连接' : '未连接'}</span>,
    },
    {
      key: 'schemaVersion',
      title: '库结构版本',
      desc: '上游 To-Do-List 的库结构版本,上游升级后需按 SYNC.md 清单同步',
      control: <span className="set-value">v{info.schemaVersion}</span>,
    },
    {
      key: 'scale',
      title: '数据规模',
      desc: `${info.taskCount} 项事项(含日程与待办)· ${info.categoryCount} 个标签`,
    },
  ] : [];

  return (
    <>
      <Rows rows={rows} query={query} />
      {error && <p className="error" role="alert">{error}</p>}
      {info && <p className="help">待办数据以上游 To-Do-List 为单一事实源:工作台不做上游没有的私有功能,上游发版后按固定清单同步移植;工作台不写此库的 settings/chats 表。</p>}
      {!info && !error && <p className="help" role="status">正在读取共享库状态…</p>}
    </>
  );
}

// ---------- 通知 ----------
function NotificationsSection({ query }: { query: string }) {
  const { settings, error, apply } = useAppSettings();

  const rows: RowSpec[] = settings ? [
    {
      key: 'remindersEnabled',
      title: '待办提醒',
      desc: '到提醒时间弹系统通知,点击通知打开工作台处理',
      control: (
        <button type="button" className="toggle" role="switch" aria-checked={settings.remindersEnabled} aria-label="待办提醒"
          onClick={() => apply({ remindersEnabled: !settings.remindersEnabled })} />
      ),
    },
  ] : [];

  return (
    <>
      <Rows rows={rows} query={query} />
      {error && <p className="error" role="alert">{error}</p>}
      {settings && <p className="help">提醒由常驻托盘的轮询驱动,关闭后不再弹窗;更改在下一轮询周期(约 15 秒)内生效。通知中心为后续规划。</p>}
      {!settings && !error && <p className="help" role="status">正在读取设置…</p>}
    </>
  );
}

// ---------- AI 助手(自 AiPanel 设置弹窗整体迁入,单一来源) ----------
const PROTOCOL_OPTIONS: { value: AIProtocol; label: string }[] = [
  { value: 'openai-chat', label: 'OpenAI Chat' },
  { value: 'openai-responses', label: 'OpenAI Responses' },
  { value: 'anthropic', label: 'Anthropic Messages' },
];

function AiSection({ query }: { query: string }) {
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [name, setName] = useState('');
  const [endpoint, setEndpoint] = useState('https://api.deepseek.com/v1');
  const [protocol, setProtocol] = useState<AIProtocol>('openai-chat');
  const [apiKey, setApiKey] = useState('');
  const [modelName, setModelName] = useState('');
  const [providerId, setProviderId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const reload = (): void => {
    void wb.ai.config().then((raw) => setConfig(raw as AiConfig), (e) => setError(errorText(e)));
  };
  useEffect(reload, []);

  useEffect(() => {
    if (!providerId && config?.providers.length) setProviderId(config.providers[0].id);
  }, [config?.providers, providerId]);

  const run = (action: () => Promise<unknown>, done?: () => void): void => {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    void action().then(
      () => { setBusy(false); reload(); done?.(); },
      (e) => { setBusy(false); setError(errorText(e)); },
    );
  };

  const enableRow: RowSpec = {
    key: 'aiEnabled',
    title: '启用 AI 助手',
    desc: '工作台独立配置,与 To-Do-List 的 AI 互不影响',
    control: (
      <button type="button" className="toggle" role="switch" aria-checked={config?.aiEnabled ?? false} aria-label="启用 AI"
        disabled={busy} onClick={() => run(() => wb.ai.setEnabled(!config?.aiEnabled))} />
    ),
  };

  return (
    <div className="settings-ai">
      <Rows rows={[enableRow]} query={query} />
      <h3 className="set-group-title">供应商</h3>
      <div className="ai-provider-list">
        {(config?.providers ?? []).map((p) => (
          <div key={p.id} className="ai-provider-row">
            <b>{p.name}</b>
            <span>{PROTOCOL_OPTIONS.find((o) => o.value === p.protocol)?.label ?? p.protocol}</span>
            <span>{p.hasKey ? '已存密钥' : '无密钥'}</span>
            <button className="ai-remove" disabled={busy} onClick={() => run(() => wb.ai.removeProvider(p.id))}>删除</button>
          </div>
        ))}
        {!config?.providers.length && <p className="field-help">还没有供应商。推荐 DeepSeek:端点 https://api.deepseek.com/v1,协议 OpenAI Chat。</p>}
      </div>
      <div className="ai-form-grid">
        <input aria-label="供应商名称" placeholder="名称,如 DeepSeek" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
        <select aria-label="协议" value={protocol} onChange={(e) => setProtocol(e.target.value as AIProtocol)}>
          {PROTOCOL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input aria-label="服务地址" placeholder="服务地址(https://…/v1)" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
        <input aria-label="API Key" type="password" placeholder="API Key(本机加密保存)" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        <button className="ai-add" disabled={busy || !name.trim() || !endpoint.trim()}
          onClick={() => run(() => wb.ai.saveProvider({ kind: 'custom', name, endpoint, protocol, apiKey: apiKey || undefined }), () => { setApiKey(''); setNotice('供应商已保存'); })}>添加供应商</button>
      </div>

      <h3 className="set-group-title">模型</h3>
      <div className="ai-provider-list">
        {(config?.models ?? []).map((m: AIModel) => {
          const provider = config?.providers.find((p) => p.id === m.providerId);
          const active = m.id === config?.activeModelId || (!config?.activeModelId && config?.models[0]?.id === m.id);
          return (
            <div key={m.id} className={active ? 'ai-provider-row on' : 'ai-provider-row'}>
              <b>{m.name}</b>
              <span>{provider?.name ?? ''}</span>
              {active ? <span className="ai-badge">使用中</span> : <button disabled={busy} onClick={() => run(() => wb.ai.activateModel(m.id))}>启用</button>}
              <button className="ai-remove" disabled={busy} onClick={() => run(() => wb.ai.removeModel(m.id))}>删除</button>
            </div>
          );
        })}
        {!config?.models.length && <p className="field-help">为供应商添加至少一个模型(名称或 ID,如 deepseek-chat)。</p>}
      </div>
      <div className="ai-form-grid">
        <select aria-label="所属供应商" value={providerId} onChange={(e) => setProviderId(e.target.value)}>
          {(config?.providers ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input aria-label="模型名称" placeholder="模型名称或 ID,如 deepseek-chat" value={modelName} onChange={(e) => setModelName(e.target.value)} />
        <button className="ai-add" disabled={busy || !providerId || !modelName.trim()}
          onClick={() => run(() => wb.ai.saveModel({ providerId, name: modelName }), () => { setModelName(''); setNotice('模型已保存'); })}>添加模型</button>
        <button disabled={busy || !providerId || !modelName.trim()}
          onClick={() => run(() => wb.ai.test({ providerId, model: modelName }).then((msg) => setNotice(msg)))}>测试连接</button>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="field-help" role="status">{notice}</p>}
      <p className="help">API Key 用系统加密(DPAPI)保存在工作台自己的目录;AI 配置与对话历史均独立于 To-Do-List,仅待办数据同库。</p>
    </div>
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

function AboutSection({ query, onPending }: { query: string; onPending(msg: string): void }) {
  const [info, setInfo] = useState<AboutInfo | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void wb.appInfo.about().then(setInfo, (e) => setError(errorText(e)));
  }, []);

  const rows: RowSpec[] = info ? [
    {
      key: 'version',
      title: `${info.name} v${info.version}`,
      desc: `Electron ${info.electron} · Chromium ${info.chrome}`,
      control: <button className="set-btn" onClick={() => onPending('自动更新将在后续版本提供,当前可从 GitHub Releases 获取')}>检查更新</button>,
    },
    {
      key: 'userData',
      title: '应用数据目录',
      desc: 'AI 配置、对话库与八字命例库都在这里',
      control: <button className="set-btn" onClick={() => void wb.appInfo.openUserDataDir()}>打开</button>,
    },
    {
      key: 'todoDb',
      title: '待办共享库',
      desc: '与 To-Do-List 同库互通,两侧数据实时一致',
      control: <button className="set-btn" onClick={() => void wb.appInfo.openTodoDir()}>打开</button>,
    },
  ] : [];

  return (
    <>
      <Rows rows={rows} query={query} />
      {error && <p className="error" role="alert">{error}</p>}
      {info && <p className="help">待办模块与上游 To-Do-List 保持零漂移,上游发版后经同步清单移植并跑一致性测试。</p>}
      {!info && !error && <p className="help" role="status">正在读取应用信息…</p>}
    </>
  );
}

// ---------- 入口 ----------
export function SettingsView({ view, onPending, onSnavDefaultChange, uiTheme, onUiThemeChange }: {
  view: ViewId;
  onPending(msg: string): void;
  onSnavDefaultChange(collapsed: boolean): void;
  uiTheme: UiTheme;
  onUiThemeChange(theme: UiTheme): void;
}) {
  const [query, setQuery] = useState('');
  // 切换分区时清空搜索,避免"看起来没内容"的错觉
  useEffect(() => setQuery(''), [view]);
  const meta = SECTION_META[view] ?? { title: '设置', sub: '' };

  return (
    <div className="settings-page">
      <div className="page-head">
        <div>
          <h1>{meta.title}</h1>
          <div className="sub">{meta.sub}</div>
        </div>
        <span className="spacer" />
        <div className="set-search">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-3.8-3.8" /></svg>
          <input value={query} placeholder="搜索当前页设置" onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>
      {view === 'settings-profile' && <ProfileSection query={query} />}
      {view === 'settings-general' && <GeneralSection query={query} onSnavDefaultChange={onSnavDefaultChange} />}
      {view === 'settings-appearance' && <AppearanceSection query={query} uiTheme={uiTheme} onUiThemeChange={onUiThemeChange} />}
      {view === 'settings-ai' && <AiSection query={query} />}
      {view === 'settings-data' && <DataSection query={query} />}
      {view === 'settings-notifications' && <NotificationsSection query={query} />}
      {view === 'settings-about' && <AboutSection query={query} onPending={onPending} />}
    </div>
  );
}
