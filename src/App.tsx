import { useEffect, useRef, useState } from 'react';
import { GearSix, Sparkle } from '@phosphor-icons/react';
import { NAV, defaultViewOfWorkbench, ownerOfWorkbench, workbenchById, type WorkbenchId } from './nav';
import type { UiTheme, ViewId } from '../shared/contracts';
import { localDay, openToday, taskTime } from '../shared/todo-contracts';
import { HomeView, useTodoData } from './views/HomeView';
import { AiPanel } from './views/AiPanel';
import { SettingsView } from './views/SettingsView';
import { NotificationBell } from './views/NotificationCenter';
import { BaziView } from '../modules/bazi/ui/BaziView';
import { CopyView } from '../modules/copywriting/ui/CopyView';
import {
  IconCalendar, IconCheckSquare, IconChevronRight, IconCollapse,
  IconGamepad, IconHome, IconMoon, IconSearch, IconVideo, IconWeb, LogoMark,
} from './icons';

// 设置工作台图标:用户已定 Phosphor GearSix(自绘齿轮「太像太阳」被否),WB_ICONS 渲染无 props,包一层固定尺寸
const GearRail = () => <GearSix size={20} />;

const WB_ICONS = {
  home: IconHome,
  media: IconVideo,
  game: IconGamepad,
  web: IconWeb,
  life: IconMoon,
  settings: GearRail,
} as const;


export function App() {
  const [curWb, setCurWb] = useState<WorkbenchId>('home');
  const [curView, setCurView] = useState<ViewId>('home');
  const [maximized, setMaximized] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<number | undefined>(undefined);
  const todo = useTodoData();
  const snavTimer = useRef<number | undefined>(undefined);
  const [snavPhase, setSnavPhase] = useState<'open' | 'closing' | 'closed'>('closed');
  // 二级导航收起(设置页「二级导航默认收起」):默认值持久化,snavOverride 为会话内临时开/关
  const [snavDefaultCollapsed, setSnavDefaultCollapsed] = useState(false);
  const [snavOverride, setSnavOverride] = useState<boolean | null>(null);
  const snavHidden = curWb !== 'home' && (snavOverride ?? snavDefaultCollapsed);
  // 界面主题(mist 雾灰墨点 = 默认;sunny 晴蓝 A+ = 备选),写入 <html data-theme> 驱动 shell.css 双主题
  const [uiTheme, setUiTheme] = useState<UiTheme>('mist');
  const applyUiTheme = (theme: UiTheme): void => {
    document.documentElement.dataset.theme = theme;
    setUiTheme(theme);
  };
  // 个人资料昵称(设置 → 个人资料):头像首字与首页问候共用
  const [profileName, setProfileName] = useState('Ono');

  useEffect(() => {
    void window.workbench.settings.get().then(
      (s) => {
        if (s) { setSnavDefaultCollapsed(s.snavDefaultCollapsed); applyUiTheme(s.uiTheme); setProfileName(s.profile.name); }
      },
      () => undefined,
    );
  }, []);

  // 二级目录显示/退出动效阶段(收起时与 home 同路径:播放退出动画后卸载)
  useEffect(() => {
    if (curWb === 'home' || snavHidden) {
      setSnavPhase((p) => {
        if (p !== 'open') return p;
        snavTimer.current = window.setTimeout(() => setSnavPhase('closed'), 190);
        return 'closing';
      });
    } else {
      window.clearTimeout(snavTimer.current);
      setSnavPhase('open');
    }
  }, [curWb, snavHidden]);

  const [aiOpen, setAiOpen] = useState(false);
  // 八字「AI 解读」进线:命令面板新建会话并直接发送(避免与面板自身的 chatOpen 竞态)
  const [aiSeed, setAiSeed] = useState<{ text: string; nonce: number } | null>(null);

  const askBazi = (prompt: string): void => {
    void window.workbench.ai.config().then((raw) => {
      const cfg = raw as { aiEnabled?: boolean };
      if (!cfg.aiEnabled) {
        showToast('请先在 AI 设置中配置并启用 AI');
        return;
      }
      setAiOpen(true);
      setAiSeed({ text: prompt, nonce: Date.now() });
    }, () => showToast('AI 状态读取失败,请重试'));
  };

  useEffect(() => window.workbench.onMaximized(setMaximized), []);

  const showToast = (msg: string): void => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 1800);
  };

  const activate = (id: WorkbenchId): void => {
    // 再次点击当前工作台:临时展开被收起的二级目录
    if (id === curWb && snavHidden) {
      setSnavOverride(true);
      return;
    }
    if (id !== curWb) {
      // 内容区渲染跟随 curView:切工作台必须同步落位,否则停留在上一个工作台的页面
      setSnavOverride(null);
      setCurView(defaultViewOfWorkbench(id));
    }
    setCurWb(id);
    const wb = workbenchById(id);
    if (wb.pending) showToast(`「${wb.title}」工作台规划中,敬请期待`);
  };

  const switchView = (view: ViewId): void => {
    setCurView(view);
    const owner = ownerOfWorkbench(view);
    if (owner) setCurWb(owner);
  };

  const wb = workbenchById(curWb);

  // 顶栏胶囊:今日待办统计与今日日程(真数据,与 To-Do-List 同库)
  const today = localDay(todo.clock);
  const todayMeetings = (todo.data?.tasks ?? [])
    .filter((t) => !t.deletedAt && t.kind === 'meeting' && t.status !== 'done' && t.plannedDate <= today)
    .sort((a, b) => taskTime(a) - taskTime(b))
    .slice(0, 4);
  const openCount = todo.data ? openToday(todo.data.tasks, today).length : 0;
  const doneCount = todo.data
    ? todo.data.tasks.filter((t) => !t.deletedAt && t.status === 'done' && t.completedAt && localDay(new Date(t.completedAt)) === today).length
    : 0;
  const totalCount = openCount + doneCount;
  const overdueCount = todo.data
    ? openToday(todo.data.tasks, today).filter((t) => (t.dueAt ? Date.parse(t.dueAt) < todo.clock.getTime() : new Date(`${t.plannedDate}T23:59:59`).getTime() < todo.clock.getTime())).length
    : 0;

  return (
    <div className="win">
      {/* 图标栏 = 一级:大工作台切换 */}
      <aside className="rail">
        <div className="logo" title="个人工作台">
          <LogoMark />
        </div>
        <nav className="rnav">
          {NAV.filter((w) => w.id === 'home').map((w) => {
            const Icon = WB_ICONS[w.id];
            return (
              <span key={w.id} className="rnav-item">
                <button
                  className={curWb === w.id ? 'ritem on' : w.pending ? 'ritem dim' : 'ritem'}
                  title={w.pending ? `${w.title}(即将上线)` : w.title}
                  onClick={() => activate(w.id)}
                >
                  <Icon />
                </button>
              </span>
            );
          })}
        </nav>
        {/* 工作台图标:在剩余空间垂直居中(设置不在此渲染,唯一入口在底部) */}
        <div className="rmid">
          {NAV.filter((w) => w.id !== 'home' && w.id !== 'settings').map((w) => {
            const Icon = WB_ICONS[w.id];
            return (
              <button
                key={w.id}
                className={curWb === w.id ? 'ritem on' : 'ritem dim'}
                title={w.pending ? `${w.title}(即将上线)` : w.title}
                onClick={() => activate(w.id)}
              >
                <Icon />
              </button>
            );
          })}
        </div>
        <div className="rbot">
          {/* 设置唯一入口:当前在设置页时点亮 */}
          <button
            className={curWb === 'settings' ? 'ritem on' : 'ritem'}
            title="设置"
            onClick={() => switchView('settings-general')}
          >
            <GearSix size={20} />
          </button>
        </div>
      </aside>
      <div className="main">
      <header className="topbar">
        <div className="tb-left">
        <div className="sched">
          <span className="sched-label">
            <IconCalendar />
            日程<span className="date">{todo.clock.getMonth() + 1}月{todo.clock.getDate()}日 · {['周日', '周一', '周二', '周三', '周四', '周五', '周六'][todo.clock.getDay()]}</span>
          </span>
          <span className="sdiv" />
          <div className="sched-track">
            {todayMeetings.length === 0 && <span className="sched-none">今天没有日程</span>}
            {todayMeetings.map((t) => {
              const start = t.dueAt ? new Date(t.dueAt) : null;
              const live = start ? start.getTime() <= todo.clock.getTime() && start.getTime() + 3600000 > todo.clock.getTime() : false;
              return (
                <button key={t.id} className={live ? 'schip now' : 'schip'} onClick={() => switchView('home')} title={t.title}>
                  {live && <span className="live" />}
                  <span className="t">{start ? `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}` : '待定'}</span>
                  <span className="n">{t.title}</span>
                </button>
              );
            })}
          </div>
          <button className="smore" title="更多日程" onClick={() => switchView('home')}>
            <IconChevronRight />
          </button>
        </div>
      </div>

      <div className="tb-center">
        <button className="todopill glass" title="今日待办" onClick={() => switchView('home')}>
          <IconCheckSquare />
          <span className="lbl">待办</span>
          <span className="num">{doneCount}/{totalCount}{overdueCount > 0 && <em>逾期 {overdueCount}</em>}</span>
          <span className="tprog"><i style={{ width: totalCount ? `${Math.round((doneCount / totalCount) * 100)}%` : '0%' }} /></span>
        </button>
      </div>

      <div className="tb-right">
        <button className="ibtn" title="AI 助手" aria-pressed={aiOpen} onClick={() => setAiOpen(v => !v)}><Sparkle size={18} weight={aiOpen ? 'fill' : 'regular'} /></button>
        <button className="ibtn" title="搜索" onClick={() => showToast('「全局搜索」规划中')}><IconSearch /></button>
        <NotificationBell tasks={todo.data?.tasks ?? []} clock={todo.clock}
          onOpenHome={() => switchView('home')} onOpenAi={() => setAiOpen(true)} />
        <span className="vdiv" />
        <button className="ibtn" title="设置" onClick={() => switchView('settings-general')}><GearSix size={18} /></button>
        <div className="avatar" title={profileName} onClick={() => switchView('settings-profile')}>
          {profileName.trim().charAt(0).toUpperCase() || 'O'}
        </div>

        <span className="vdiv" />
        <div className="wbtns">
          <button className="wbtn" title="最小化" onClick={() => window.workbench.minimize()}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M5 12h14" /></svg>
          </button>
          <button className="wbtn" title={maximized ? '还原' : '最大化'} onClick={() => window.workbench.maximizeToggle()}>
            {maximized ? (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M5 16V6a1 1 0 0 1 1-1h10" /></svg>
            ) : (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>
            )}
          </button>
          <button className="wbtn close" title="关闭" onClick={() => window.workbench.close()}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
      </div>
      </header>

      <div className="body">


      <div className="body">


      {/* 二级导航 = 当前工作台的二级目录(首页内容自明,不显示二级目录) */}
      {snavPhase !== 'closed' && (
      <aside key={curWb} className={snavPhase === 'closing' ? 'snav closing' : 'snav'}>
        <div className="shead">
          <span className="stitle">{wb.title}</span>
          <button className="collapse" title="收起导航" onClick={() => setSnavOverride(false)}>
            <IconCollapse />
          </button>
        </div>
        <nav className="tree">
          {wb.subs.map((sub) => (
            <a
              key={sub.label}
              className={sub.view && sub.view === curView ? 'nsub on' : 'nsub'}
              style={{ cursor: 'pointer' }}
              onClick={() => {
                if (sub.view) switchView(sub.view);
                else showToast(`「${sub.label}」规划中,敬请期待`);
              }}
            >
              <span className="ndot" />
              {sub.label}
              {sub.pending && <span className="ntag">规划中</span>}
            </a>
          ))}
        </nav>
      </aside>
      )}

      {/* 主区 */}
      <main className="content">
          {todo.error && <div className="todo-load-error" role="alert">{todo.error}</div>}
          {curView === 'bazi' ? (
            <BaziView onPending={showToast} onAskAI={askBazi} />
          ) : curView === 'copy' ? (
            <CopyView onPending={showToast} />
          ) : curView.startsWith('settings') ? (
            <SettingsView view={curView} onPending={showToast} onSnavDefaultChange={setSnavDefaultCollapsed} uiTheme={uiTheme} onUiThemeChange={applyUiTheme} />
          ) : todo.data ? (
            <HomeView data={todo.data} clock={todo.clock} mutate={todo.mutate} userName={profileName} onPending={showToast} onOpenBazi={() => switchView('bazi')} />
          ) : (
            <div className="todo-loading" role="status">正在读取本地待办…</div>
          )}
        </main>

      </div>
      </div>
      </div>
      <AiPanel open={aiOpen} onClose={() => setAiOpen(false)} seed={aiSeed} onOpenSettings={() => { setAiOpen(false); switchView('settings-ai'); }} />
      <div className="toast glass" data-show={toast ? '1' : '0'}>{toast}</div>
    </div>
  );
}
