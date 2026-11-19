import { useEffect, useId, useRef, useState } from 'react';
import { CalendarBlank, Folder, Monitor, Sparkle, SquaresFour, Tabs } from '@phosphor-icons/react';
import { ISLAND_DOCK_LABELS, ISLAND_LABELS, ISLAND_PAGES, type IslandSettingsPatch } from '../../shared/island-contracts';
import { errorText, Segmented, Select, TimePicker } from '../ui/controls';
import { Rows, type RowSpec } from './SettingsView';
import { useIslandSettingsEditor } from './island-state';

const sections = [
  { value: 'display', label: '显示与交互', icon: <Monitor size={16} aria-hidden="true" /> },
  { value: 'pages', label: '页面', icon: <Tabs size={16} aria-hidden="true" /> },
  { value: 'tools', label: '小工具', icon: <SquaresFour size={16} aria-hidden="true" /> },
] as const;
type Section = typeof sections[number]['value'];
const pageIcons = { schedule: CalendarBlank, files: Folder, quota: Sparkle, tools: SquaresFour };
const pageDescriptions = { schedule: '月历、日程与待办', files: '文件与文件夹引用', quota: 'Codex 与 Z Code 额度', tools: '专注、喝水、久坐与圆环伙伴' };
export function NumberSetting({ label, value, min, max, unit, disabled, save }: {
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

export function IslandSettingsSection({ query }: { query: string }) {
  const { state, setState, error, setError, busy, run, patch } = useIslandSettingsEditor();
  const [active, setActive] = useState<Section>('display');
  const [displays, setDisplays] = useState<{ id: number; label: string }[] | null>(null);
  const [clear, setClear] = useState(false);
  const layout = useRef<HTMLDivElement>(null), revealGroup = useRef<'water' | 'sedentary' | null>(null), fieldId = useId();
  const api = window.workbench.island;
  useEffect(() => {
    let alive = true, version = 0;
    const load = () => {
      const request = ++version;
      void api.displays().then(value => { if (alive && request === version) setDisplays(value); }).catch(e => { if (alive && request === version) { setDisplays([]); setError(errorText(e)); } });
    };
    load(); const off = api.onChanged(load);
    window.addEventListener('focus', load);
    return () => { alive = false; off(); window.removeEventListener('focus', load); };
  }, []);
  useEffect(() => {
    const showGroup = (group: unknown) => {
      if (group !== 'water' && group !== 'sedentary') return;
      revealGroup.current = group; setActive('tools');
      sessionStorage.removeItem('island-settings-section');
    };
    showGroup(sessionStorage.getItem('island-settings-section'));
    const listener = (event: Event) => showGroup((event as CustomEvent).detail);
    window.addEventListener('island-settings-section', listener);
    return () => window.removeEventListener('island-settings-section', listener);
  }, []);
  useEffect(() => {
    if (!revealGroup.current || !layout.current) return;
    layout.current.querySelector(`[data-group="${revealGroup.current}"]`)?.scrollIntoView({ block: 'nearest' });
    revealGroup.current = null;
  }, [state, active]);
  if (!state) return <p role={error ? 'alert' : 'status'}>{error || '正在读取灵动岛设置…'}</p>;
  const settings = state.settings;
  const selectedDisplay = displays?.find(display => display.id === settings.displayId);
  const missingDisplay = settings.displayId !== null && Boolean(displays?.length) && !selectedDisplay;
  const toggle = (field: keyof IslandSettingsPatch, label: string) => <button type="button" className="toggle" role="switch" aria-checked={Boolean(settings[field as keyof typeof settings])} aria-label={label} disabled={busy} onClick={() => patch({ [field]: !settings[field as keyof typeof settings] })} />;
  const number = (field: 'topOffset' | 'focusMinutes' | 'waterMinutes' | 'sedentaryMinutes', label: string, min: number, max: number, unit: string) => <NumberSetting label={label} value={settings[field]} min={min} max={max} unit={unit} disabled={busy} save={value => patch({ [field]: value })} />;
  const period = (start: 'waterStart' | 'sedentaryStart', end: 'waterEnd' | 'sedentaryEnd', label: string) => <fieldset className="island-setting-period" aria-label={label} disabled={busy}>
    <div><label htmlFor={`${fieldId}-${start}`}>开始</label><TimePicker id={`${fieldId}-${start}`} value={settings[start]} onChange={value => patch({ [start]: value })} /></div><span>—</span>
    <div><label htmlFor={`${fieldId}-${end}`}>结束</label><TimePicker id={`${fieldId}-${end}`} value={settings[end]} onChange={value => patch({ [end]: value })} /></div>
  </fieldset>;
  const toolsEnabled = settings.focusEnabled || settings.waterEnabled || settings.sedentaryEnabled || settings.mascotEnabled;
  const groups: { id: string; section: Section; title: string; description?: string; rows: RowSpec[] }[] = [
    { id: 'position', section: 'display', title: '窗口位置', rows: [
      { key: 'display', title: '显示器', desc: missingDisplay ? '已选显示器已断开，暂用主屏' : '在所选工作区边缘居中', control: displays === null ? <span className="island-display-value" role="status">正在读取显示器…</span> : displays.length <= 1 ? <span className="island-display-value" title={displays[0]?.label}>{displays[0]?.label || '未读取到显示器'}</span> : <Select value={selectedDisplay ? String(selectedDisplay.id) : ''} onChange={value => patch({ displayId: value ? Number(value) : null })} aria-label="灵动岛显示器" disabled={busy} options={[{ value: '', label: '自动跟随主屏' }, ...displays.map(d => ({ value: String(d.id), label: d.label }))]} /> },
      { key: 'offset', title: settings.dock === 'top' ? '顶部间距' : '边缘间距', desc: `相对工作区${ISLAND_DOCK_LABELS[settings.dock]}`, control: number('topOffset', settings.dock === 'top' ? '顶部偏移' : '停靠边缘偏移', 0, 300, 'px') },
    ] },
    { id: 'interaction', section: 'display', title: '展开与外观', rows: [
      { key: 'hover', title: '悬停展开', desc: '鼠标停留片刻，直接打开完整面板', control: toggle('hoverPreview', '悬停展开') },
      { key: 'fullscreen', title: '全屏时隐藏', desc: state.fullscreenDetection ? '全屏时隐藏灵动岛，提醒留待处理' : '系统检测暂不可用，可手动隐藏', control: toggle('hideFullscreen', '全屏时隐藏') },
      { key: 'motion', title: '减少动态效果', desc: '即时切换尺寸，伙伴保持静止', control: toggle('reducedMotion', '减少动态效果') },
    ] },
    { id: 'page-visibility', section: 'pages', title: '显示的页面', description: '隐藏页面会保留数据，底栏按固定顺序排列。', rows: ISLAND_PAGES.map(page => {
      const PageIcon = pageIcons[page], title = ISLAND_LABELS[page];
      return {
        key: page, title, desc: page === 'tools' && !toolsEnabled ? '启用任一工具后显示' : pageDescriptions[page],
        heading: <b className="island-page-setting-title"><PageIcon size={18} aria-hidden="true" />{title}</b>,
        control: <button type="button" className="toggle" role="switch" aria-label={`显示${title}页`} aria-checked={settings.pages[page]} disabled={busy} onClick={() => patch({ pages: { [page]: !settings.pages[page] } })} />,
      };
    }) },
    { id: 'files', section: 'pages', title: '文件暂存', rows: [
      { key: 'retention', title: '退出时清空文件记录', desc: '原文件与文字记录保留', control: toggle('clearFilesOnExit', '退出时清空文件记录') },
      { key: 'clear', title: `${state.files.length} 条暂存记录`, desc: clear ? '确认清空所有引用？原文件不受影响。' : '默认保留，直到手动移除', control: clear ? <div className="island-setting-actions"><button className="set-btn" disabled={busy} onClick={() => void run(async () => { setState(await api.filesRemove()); setClear(false); })}>确认清空记录</button><button className="set-btn" onClick={() => setClear(false)}>取消</button></div> : <button className="set-btn" disabled={!state.files.length || busy} onClick={() => setClear(true)}>清空记录</button> },
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
      { key: 'interval', title: '提醒间隔', desc: '锁屏、睡眠和勿扰时暂停，恢复后重新计时', control: number('waterMinutes', '喝水间隔', 10, 240, '分钟') },
      { key: 'waterTime', title: '提醒时间', desc: '', className: 'island-period-row', control: period('waterStart', 'waterEnd', '喝水时间段') },
    ] },
    { id: 'sedentary', section: 'tools', title: '久坐提醒', rows: [
      { key: 'enabled', title: '启用久坐提醒', desc: '按使用时长提醒，不识别坐姿或离座', control: toggle('sedentaryEnabled', '久坐提醒') },
      { key: 'interval', title: '提醒间隔', desc: '锁屏、睡眠和勿扰时暂停，恢复后重新计时', control: number('sedentaryMinutes', '久坐间隔', 10, 240, '分钟') },
      { key: 'sedentaryTime', title: '提醒时间', desc: '', className: 'island-period-row', control: period('sedentaryStart', 'sedentaryEnd', '久坐时间段') },
    ] },
  ];
  const term = query.trim().toLowerCase().replace(/\s+/g, '');
  const matches = (value: string) => !term || value.toLowerCase().replace(/\s+/g, '').includes(term);
  const selectedGroups = groups.filter(group => term || group.section === active).map(group => ({ ...group, rows: group.rows.filter(row => matches(`${sections.find(s => s.value === group.section)?.label} ${group.title} ${row.title} ${row.desc}`)) })).filter(group => group.rows.length);
  const count = (term && matches('显示灵动岛 桌面显示 启用') ? 1 : 0) + selectedGroups.reduce((total, group) => total + group.rows.length, 0);
  return <div className="island-settings">
    <div className="island-settings-overview">
      <span className="island-settings-symbol"><Monitor size={18} /></span>
      <div className="island-settings-overview-copy"><div><b>显示灵动岛</b><span className="island-enabled-status" data-enabled={settings.enabled}>{settings.enabled ? '已启用' : '未启用'}</span></div></div>
      {toggle('enabled', '显示灵动岛')}
    </div>
    {error && <p className="island-settings-error" role="alert">{error}</p>}
    {term ? <p className="island-settings-search-result" role="status">{count ? `找到 ${count} 项相关设置 · 已搜索所有分区` : '没有匹配的设置'}</p> : <div className="island-settings-tabs"><Segmented variant="content" value={active} onChange={value => setActive(value as Section)} options={[...sections]} aria-label="灵动岛设置分区" /></div>}
    <div ref={layout} className={`island-settings-layout${!term && active === 'tools' ? ' island-settings-tools' : ''}`} data-section={!term ? active : undefined} aria-label={term ? '设置搜索结果' : sections.find(section => section.value === active)?.label}>
      {selectedGroups.map(group => <section className="island-setting-card" key={group.id} data-group={group.id} aria-labelledby={`${fieldId}-${group.id}`}>
        <header><h2 id={`${fieldId}-${group.id}`}>{group.title}</h2>{group.description && <p>{group.description}</p>}</header>
        <Rows rows={group.rows} query="" />
      </section>)}
    </div>
  </div>;
}
