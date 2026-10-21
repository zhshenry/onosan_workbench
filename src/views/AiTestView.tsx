import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowClockwise, ArrowSquareOut, CheckCircle, Code, Columns, CornersOut, DownloadSimple, Eye, FileCode, FileText, Flask, FolderOpen, LockSimple, Play, Plus, Robot, Stop, X } from '@phosphor-icons/react';
import type { ViewId } from '../../shared/contracts';
import type { AiConfig } from '../../shared/workbench-api';
import { DEFAULT_TEST_TASK, testTaskSchema, testCheckSchema, type TestLane, type TestRun, type TestRunSummary, type TestTask, type TestTaskInput } from '../../shared/ai-test-contracts';
import { Select, Segmented, Modal, errorText } from '../ui/controls';
import './ai-test.css';

const api = () => window.workbench.aiTest;
const running = (lane: TestLane) => lane.status === 'running' || lane.status === 'queued';
const statusText: Record<TestLane['status'], string> = { queued: '等待中', running: '执行中', complete: '已生成', cancelled: '已停止', error: '执行失败' };
const modeName = (mode: TestTaskInput['mode']) => mode === 'agent' ? 'Agent 执行' : '模型直出';
const stamp = (value: string) => new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const tabKey = (runId: string, laneId: string) => runId + '/' + laneId;
function taskInput(task: TestTask): TestTaskInput {
  const { updatedAt: _updatedAt, ...input } = task;
  return input;
}
function checkedInput(task: TestTaskInput, checks: string): TestTaskInput {
  let parsed: unknown;
  try { parsed = JSON.parse(checks); } catch { throw new Error('校验配置需要是有效的 JSON 数组'); }
  const checkResult = testCheckSchema.array().safeParse(parsed);
  if (!checkResult.success) throw new Error('校验配置格式有误：' + checkResult.error.issues[0].message);
  const result = testTaskSchema.safeParse({ ...task, checks: checkResult.data });
  if (!result.success) throw new Error('请检查测试配置：' + result.error.issues[0].path.join('.') + ' · ' + result.error.issues[0].message);
  return result.data;
}

export function AiTestHost({ active, view, onNavigate }: { active: boolean; view: ViewId; onNavigate(view: ViewId): void }) {
  const [visited, setVisited] = useState(active);
  useEffect(() => { if (active) setVisited(true); }, [active]);
  if (!visited && !active) return null;
  return <section className="ai-test-host" hidden={!active} aria-label="AI 测试工作台">
    <AiTestView active={active} view={view} onNavigate={onNavigate} />
  </section>;
}

function AiTestView({ active, view, onNavigate }: { active: boolean; view: ViewId; onNavigate(view: ViewId): void }) {
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [task, setTask] = useState<TestTaskInput>(() => structuredClone(DEFAULT_TEST_TASK));
  const [checksJson, setChecksJson] = useState(JSON.stringify(DEFAULT_TEST_TASK.checks, null, 2));
  const [tasks, setTasks] = useState<TestTask[]>([]);
  const [history, setHistory] = useState<TestRunSummary[]>([]);
  const [runs, setRuns] = useState<Record<string, TestRun>>({});
  const [currentId, setCurrentId] = useState('');
  const [tabs, setTabs] = useState<{ runId: string; laneId: string }[]>([]);
  const [selectedTab, setSelectedTab] = useState('overview');
  const [resultView, setResultView] = useState('artifact');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [material, setMaterial] = useState<{ path: string; content: string } | null>(null);
  const initialized = useRef(false);
  const refreshHistoryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tabStrip = useRef<HTMLDivElement>(null);
  const current = runs[currentId];
  const isRunning = Object.values(runs).some(run => run.lanes.some(running));
  useEffect(() => {
    tabStrip.current?.querySelector<HTMLElement>('[role=tab][aria-selected=true]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selectedTab]);
  function receive(run: TestRun) { setRuns(previous => ({ ...previous, [run.id]: run })); }
  async function refresh() {
    const [saved, summaries] = await Promise.all([api().tasks(), api().runs()]);
    setTasks(saved); setHistory(summaries);
  }
  useEffect(() => {
    const off = api().onChanged(run => {
      receive(run);
      clearTimeout(refreshHistoryTimer.current);
      refreshHistoryTimer.current = setTimeout(() => { void api().runs().then(setHistory).catch(e => setError(errorText(e))); }, 200);
    });
    void refresh().catch(e => setError(errorText(e)));
    return () => { off(); clearTimeout(refreshHistoryTimer.current); };
  }, []);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void window.workbench.ai.config().then(value => {
      if (cancelled) return;
      setConfig(value);
      if (!initialized.current) {
        initialized.current = true;
        setTask(previous => ({ ...previous, modelIds: value.models.slice(0, 3).map(model => model.id) }));
      }
    }).catch(e => setError(errorText(e)));
    return () => { cancelled = true; };
  }, [active]);
  function change<K extends keyof TestTaskInput>(key: K, value: TestTaskInput[K]) { setTask(previous => ({ ...previous, [key]: value })); setNotice(''); }
  async function perform(action: () => Promise<unknown>) {
    setError('');
    try { await action(); } catch (e) { setError(errorText(e)); }
  }
  function loadTask(input: TestTaskInput) {
    setTask(structuredClone(input)); setChecksJson(JSON.stringify(input.checks, null, 2)); setNotice('已载入配置；开始测试将创建新的运行记录');
    setSelectedTab('overview'); onNavigate('ai-test');
  }
  async function start(input?: TestTaskInput) {
    setBusy(true);
    try {
      const frozen = input ?? checkedInput(task, checksJson);
      const run = await api().start(frozen);
      receive(run); setCurrentId(run.id); setSelectedTab('overview'); onNavigate('ai-test');
      setNotice('本轮输入已冻结，结果自动保存'); await refresh();
    } finally { setBusy(false); }
  }
  async function saveTask() {
    setBusy(true);
    try {
      const saved = await api().saveTask(checkedInput(task, checksJson));
      setTask(taskInput(saved)); setNotice('测试配置已保存'); await refresh();
    } finally { setBusy(false); }
  }
  async function openRun(id: string) {
    const run = await api().run(id); receive(run); setCurrentId(id); setSelectedTab('overview'); onNavigate('ai-test');
  }
  function openResult(run: TestRun, lane: TestLane) {
    const key = tabKey(run.id, lane.id);
    setTabs(previous => previous.some(tab => tabKey(tab.runId, tab.laneId) === key) ? previous : [...previous, { runId: run.id, laneId: lane.id }]);
    setSelectedTab(key);
  }
  function closeTab(key: string) { setTabs(previous => previous.filter(tab => tabKey(tab.runId, tab.laneId) !== key)); if (selectedTab === key) setSelectedTab('overview'); }
  async function validateAll() {
    if (!current) return;
    await Promise.all(current.lanes.filter(lane => !running(lane) && lane.files.some(file => /\.html?$/i.test(file.path))).map(lane => api().validate(current.id, lane.id).then(receive)));
  }
  const showCompare = view === 'ai-test';
  return <div className="ai-test">
    <div className="at-tabs" ref={tabStrip} role="tablist" aria-label="测试结果标签" hidden={!showCompare}>
      <button id="at-overview-tab" role="tab" aria-selected={selectedTab === 'overview'} aria-controls="at-overview" onClick={() => setSelectedTab('overview')}><Columns size={16} />对比总览</button>
      {tabs.map(tab => {
        const key = tabKey(tab.runId, tab.laneId), run = runs[tab.runId], lane = run?.lanes.find(item => item.id === tab.laneId);
        return lane ? <div className={'at-result-tab' + (selectedTab === key ? ' is-selected' : '')} key={key}>
          <button role="tab" aria-selected={selectedTab === key} aria-controls={'at-panel-' + lane.id} id={'at-tab-' + lane.id} onClick={() => setSelectedTab(key)} title={run.task.title + ' · ' + lane.model.name}><FileCode size={16} /><span>{run.task.title} · {lane.model.name}</span></button>
          <button aria-label={'关闭 ' + lane.model.name + ' 结果标签'} onClick={() => closeTab(key)}><X size={13} /></button>
        </div> : null;
      })}
    </div>
    {error && <div className="at-error" role="alert">{error}<button aria-label="关闭错误提示" onClick={() => setError('')}><X size={16} /></button></div>}
    <div id="at-overview" role="tabpanel" aria-labelledby="at-overview-tab" className="at-overview" hidden={!showCompare || selectedTab !== 'overview'}>
      <header className="at-heading">
        <div><h1>任务对比</h1><p>同一套输入，比较不同模型的回复、代码与产物。</p></div>
        <div className="at-actions">
          <Segmented aria-label="测试模式" value={task.mode} onChange={value => change('mode', value as TestTaskInput['mode'])} options={[{ value: 'direct', label: '模型直出' }, { value: 'agent', label: 'Agent 执行', icon: <Robot size={15} /> }]} />
          <button className="btn btn-pri" disabled={busy || isRunning || !config?.aiEnabled || !config.models.length} onClick={() => void perform(() => start())}><Play size={16} weight="fill" />{busy ? '处理中…' : '开始测试'}</button>
        </div>
      </header>
      {config && (!config.aiEnabled || !config.models.length) && <div className="at-callout"><Flask size={18} /><span>先配置并启用模型服务，再选择参与对比的模型。</span><button className="btn btn-sec btn-sm" onClick={() => onNavigate('settings-ai')}>打开 AI 设置</button></div>}
      <section className="at-task" aria-label="统一测试配置">
        <div className="at-task-top">
          <input aria-label="测试任务名称" value={task.title} maxLength={80} onChange={event => change('title', event.target.value)} />
          <span className="at-muted at-task-notice" role="status">{notice || '配置可保存 · 结果自动留存'}</span>
          <button className="btn btn-sec btn-sm" disabled={busy || isRunning} onClick={() => void perform(saveTask)}>保存任务</button>
          <button className="btn btn-sec btn-sm" disabled={isRunning} onClick={() => void perform(async () => { const files = await api().materials(); change('materials', [...task.materials, ...files]); })}><Plus size={14} />添加材料</button>
        </div>
        <fieldset disabled={isRunning || busy} className="at-inputs">
          <label><span><FileText size={15} />System</span><textarea aria-label="System 提示词" value={task.system} onChange={event => change('system', event.target.value)} /></label>
          <label><span><FileText size={15} />User</span><textarea aria-label="User 提示词" value={task.prompt} onChange={event => change('prompt', event.target.value)} /></label>
        </fieldset>
        {task.materials.length > 0 && <div className="at-materials">{task.materials.map((file, index) => <span key={file.path + index}><button onClick={() => setMaterial(file)}><FileCode size={13} />{file.path}</button><button aria-label={'移除材料 ' + file.path} disabled={isRunning} onClick={() => change('materials', task.materials.filter((_, i) => i !== index))}><X size={12} /></button></span>)}</div>}
        <div className="at-options">
          <details className="at-model-picker"><summary>对比模型 <b>{task.modelIds.length}</b></summary>
            <div className="at-model-menu">{config?.models.map(model => <label key={model.id}><input type="checkbox" checked={task.modelIds.includes(model.id)} disabled={isRunning || !task.modelIds.includes(model.id) && task.modelIds.length >= 4} onChange={event => change('modelIds', event.target.checked ? [...task.modelIds, model.id] : task.modelIds.filter(id => id !== model.id))} /><span>{model.name}<small>{config.providers.find(provider => provider.id === model.providerId)?.name}</small></span></label>)}<p>最多同时对比 4 个模型</p></div>
          </details>
          <label>温度 <input type="number" aria-label="温度" min={0} max={2} step={0.1} value={task.temperature} disabled={isRunning} onChange={event => change('temperature', Number(event.target.value))} /></label>
          <label>单次输出上限 <input type="number" aria-label="输出上限 tokens" min={256} max={16000} step={256} value={task.maxTokens} disabled={isRunning} onChange={event => change('maxTokens', Number(event.target.value))} /><span>tokens</span></label>
          <label>限时 <input type="number" aria-label="执行限时秒" min={15} max={600} value={task.timeoutSeconds} disabled={isRunning} onChange={event => change('timeoutSeconds', Number(event.target.value))} /><span>秒</span></label>
          {task.mode === 'agent' && <label>工具上限 <input type="number" aria-label="工具调用上限" min={1} max={40} value={task.maxToolCalls} disabled={isRunning} onChange={event => change('maxToolCalls', Number(event.target.value))} /><span>次</span></label>}
          <details className="at-check-editor"><summary>统一校验配置</summary><p>网页断言独立运行，只有返回 true 才通过。可编辑或清空此数组。支持异步函数；setup 可返回刷新前的值供 expression 使用。</p><textarea aria-label="统一校验 JSON" spellCheck={false} value={checksJson} disabled={isRunning} onChange={event => { setChecksJson(event.target.value); setNotice(''); }} /></details>
        </div>
        <div className="at-mode-note">{task.mode === 'direct' ? '一次生成，无工具循环。代码自动提取为只读文件，预览和功能校验单独运行。' : '相同材料的独立项目副本 · 文件读写、网页操作、JavaScript 和统一校验 · 时间与工具限额一致。'}<span>运行环境：HTML / 浏览器 JavaScript；其他代码保留源码供导出。</span></div>
      </section>
      <section className="at-results" aria-label="模型对比结果">
        <div className="at-results-heading"><div><h2>本次结果</h2>{current && <span className="at-muted">{current.task.title} · {modeName(current.task.mode)} · {stamp(current.createdAt)}</span>}</div>
          <div className="at-actions">
            {current?.lanes.some(running) && <button className="btn btn-sec btn-sm" onClick={() => void perform(() => api().cancel(current.id))}><Stop size={14} />停止全部</button>}
            {current && !current.lanes.some(running) && <button className="btn btn-sec btn-sm" disabled={busy || isRunning} onClick={() => void perform(() => start(current.task))}><ArrowClockwise size={14} />复跑本次配置</button>}
            <Segmented aria-label="结果展示" value={resultView} onChange={setResultView} options={[{ value: 'artifact', label: '代码 + 预览' }, { value: 'reply', label: '原始回复' }, { value: 'files', label: '文件' }]} />
          </div>
        </div>
        {current ? <div className="at-lanes" style={{ '--lanes': current.lanes.length } as CSSProperties}>
          {current.lanes.map(lane => <LaneCard key={lane.id} run={current} lane={lane} view={resultView} open={() => openResult(current, lane)} stop={() => void perform(() => api().cancel(current.id, lane.id))} />)}
        </div> : <div className="at-empty"><Flask size={32} /><h3>让模型在同一个任务上见真章</h3><p>选择模型，填写提示词并开始。这里会并排展示各自的真实输出和产物。</p></div>}
        {current && <div className="at-check-bar"><span>{current.task.checks.length ? '已配置 ' + current.task.checks.length + ' 项网页断言；预览呈现不代表校验通过。' : '本次未配置功能断言。生成完成不代表代码已通过校验。'}</span><button className="btn btn-sec btn-sm" disabled={!current.task.checks.length || current.lanes.some(lane => running(lane) || lane.checking) || !current.lanes.some(lane => lane.files.some(file => /\.html?$/i.test(file.path)))} onClick={() => void perform(validateAll)}><Play size={13} />运行统一校验</button></div>}
      </section>
    </div>
    {tabs.map(tab => {
      const run = runs[tab.runId], lane = run?.lanes.find(item => item.id === tab.laneId), key = tabKey(tab.runId, tab.laneId);
      return run && lane ? <div key={key} className="at-detail-panel" id={'at-panel-' + lane.id} role="tabpanel" aria-labelledby={'at-tab-' + lane.id} hidden={!showCompare || selectedTab !== key}><ResultDetail run={run} lane={lane} receive={receive} perform={perform} /></div> : null;
    })}
    {view === 'ai-test-tasks' && <div className="at-library"><header className="at-heading"><div><h1>测试任务</h1><p>复用相同的提示词、材料、模型和校验配置。</p></div><button className="btn btn-pri" onClick={() => { loadTask({ ...structuredClone(DEFAULT_TEST_TASK), modelIds: task.modelIds }); setCurrentId(''); }}><Plus size={15} />新建测试</button></header>
      {tasks.length ? tasks.map(saved => <article key={saved.id} className="at-record"><FileText size={22} /><div><h3>{saved.title}</h3><p>{modeName(saved.mode)} · {saved.modelIds.length} 个模型 · {stamp(saved.updatedAt)}</p><span>{saved.prompt.slice(0, 150)}</span></div><button className="btn btn-sec btn-sm" onClick={() => loadTask(taskInput(saved))}>载入配置</button></article>) : <div className="at-empty"><FolderOpen size={32} /><h3>还没有保存的测试任务</h3><p>在对比总览中填写配置，点击“保存任务”即可复用。</p><button className="btn btn-sec" onClick={() => onNavigate('ai-test')}>前往对比测试</button></div>}</div>}
    {view === 'ai-test-history' && <div className="at-library"><header className="at-heading"><div><h1>运行记录</h1><p>每次测试独立保存输入快照和各模型结果。复跑会创建新记录，使用当前供应商连接。</p></div><button className="btn btn-sec" onClick={() => void perform(refresh)}><ArrowClockwise size={15} />刷新记录</button></header>
      {history.length ? history.map(summary => <article key={summary.id} className="at-record"><Flask size={22} /><div><h3>{summary.title}</h3><p>{modeName(summary.mode)} · {summary.modelCount} 个模型 · {stamp(summary.createdAt)} · {summary.running ? '执行中' : '已结束'}</p></div><button className="btn btn-sec btn-sm" onClick={() => void perform(() => openRun(summary.id))}>查看结果</button><button className="btn btn-sec btn-sm" disabled={busy || isRunning} onClick={() => void perform(async () => { const run = await api().run(summary.id); loadTask(run.task); })}>载入输入</button></article>) : <div className="at-empty"><Flask size={32} /><h3>还没有运行记录</h3><p>完成第一次测试后，提示词和真实结果会保存在这里。</p></div>}</div>}
    {material && <Modal title={material.path} close={() => setMaterial(null)} className="at-material-modal"><p className="at-muted">本轮相同参考材料 · 只读</p><pre>{material.content}</pre></Modal>}
  </div>;
}

function Evidence({ lane }: { lane: TestLane }) {
  const pass = lane.checks.filter(check => check.status === 'passed').length;
  return <div className="at-evidence">
    <span data-tone={lane.status === 'error' ? 'error' : lane.status === 'complete' ? 'ok' : ''}>{statusText[lane.status]}</span>
    {lane.runtime === 'ready' && <span data-tone="ok" title="HTML 已在隔离浏览器加载且未报告启动错误；功能需要单独校验">可运行 · 网页已加载</span>}
    {lane.runtime === 'error' && <span data-tone="error" title={lane.runtimeError}>运行有错误</span>}
    {lane.runtime === 'unsupported' && lane.files.length > 0 && <span>此语言尚未执行</span>}
    <span data-tone={lane.checks.length && pass === lane.checks.length ? 'ok' : lane.checks.length ? 'error' : ''}>{lane.checking ? '校验中…' : lane.checkError ? '校验未完成' : lane.checks.length ? (pass === lane.checks.length ? '校验通过 ' : '校验 ') + pass + '/' + lane.checks.length : '尚未校验'}</span>
  </div>;
}

function ArtifactPreview({ run, lane, compact = false, reload = 0 }: { run: TestRun; lane: TestLane; compact?: boolean; reload?: number }) {
  const [url, setUrl] = useState<string | null>(null), [error, setError] = useState('');
  useEffect(() => {
    if (running(lane)) return;
    let cancelled = false;
    void api().preview(run.id, lane.id).then(value => { if (!cancelled) setUrl(value); }).catch(e => { if (!cancelled) setError(errorText(e)); });
    return () => { cancelled = true; };
  }, [run.id, lane.id, lane.status, lane.endedAt]);
  if (error) return <div className="at-preview-empty">{error}</div>;
  if (!url) return <div className="at-preview-empty"><FileCode size={compact ? 20 : 32} /><span>{running(lane) ? '正在生成产物…' : lane.files.length ? '此产物暂无网页预览，可查看代码和导出文件' : '此结果没有文件产物，可查看原始回复'}</span></div>;
  return <iframe key={reload} src={url} sandbox="allow-scripts allow-same-origin" title={(compact ? '对比预览 ' : '产物预览 ') + lane.model.name} referrerPolicy="no-referrer" />;
}

function LaneCard({ run, lane, view, open, stop }: { run: TestRun; lane: TestLane; view: string; open(): void; stop(): void }) {
  const first = lane.files.find(file => file.path === 'index.html') ?? lane.files[0];
  return <article className="at-lane" aria-label={lane.model.name + ' 的结果'}>
    <header><span className="at-model-avatar">{lane.model.name.slice(0, 1).toUpperCase()}</span><div><h3 title={lane.model.name}>{lane.model.name}</h3><small>{lane.model.providerName}</small></div>{running(lane) && <button className="at-stop" onClick={stop} aria-label={'停止 ' + lane.model.name}><Stop size={14} /></button>}</header>
    <Evidence lane={lane} />
    {lane.error && <p className="at-lane-error">{lane.error}</p>}
    {view === 'reply' ? <pre className="at-reply">{lane.reply || '等待回复…'}</pre> : view === 'files' ? <div className="at-file-list">{lane.files.length ? lane.files.map(file => <button key={file.path} onClick={open}><FileCode size={15} /><span>{file.path}</span><small>{file.content.length.toLocaleString()} 字符</small></button>) : <p>尚无文件产物</p>}</div> : <div className="at-card-artifact">
      <div className="at-code-caption"><FileCode size={13} /><span>{first?.path ?? '生成内容'}</span><LockSimple size={12} /></div>
      <pre className="at-code-snippet">{first?.content || lane.reply || '等待模型输出…'}</pre>
      <span className="at-preview-label">产物预览</span><div className="at-mini-preview"><ArtifactPreview run={run} lane={lane} compact /></div>
    </div>}
    {run.task.mode === 'agent' && <div className="at-steps-mini">{lane.toolCalls} 次工具调用{lane.steps.at(-1) ? ' · ' + lane.steps.at(-1)!.name : ''}</div>}
    <footer><span>{lane.endedAt ? (lane.elapsedMs / 1000).toFixed(1) + 's' : running(lane) ? '执行中' : '—'} · {lane.tokens.toLocaleString()} tokens</span><button onClick={open}><ArrowSquareOut size={14} />展开产物</button></footer>
  </article>;
}

function ResultDetail({ run, lane, receive, perform }: { run: TestRun; lane: TestLane; receive(run: TestRun): void; perform(action: () => Promise<unknown>): Promise<void> }) {
  const [section, setSection] = useState('artifact'), [layout, setLayout] = useState('preview'), [selectedFile, setSelectedFile] = useState(''), [reload, setReload] = useState(0);
  const preview = useRef<HTMLDivElement>(null);
  const file = lane.files.find(item => item.path === selectedFile) ?? lane.files.find(item => item.path === 'index.html') ?? lane.files[0];
  const passes = lane.checks.filter(check => check.status === 'passed').length;
  return <div className="at-detail">
    <header className="at-heading"><div><h1>{run.task.title} <span>· {lane.model.name}</span></h1><p>{modeName(run.task.mode)} · {lane.model.providerName} · {(lane.elapsedMs / 1000).toFixed(1)}s · {lane.tokens.toLocaleString()} tokens</p></div><div className="at-actions">
      <button className="btn btn-sec" disabled={running(lane) || !lane.files.length} onClick={() => void perform(async () => { await api().export(run.id, lane.id); })}><DownloadSimple size={16} />导出产物</button>
      {lane.checking && <button className="btn btn-sec" onClick={() => void perform(() => api().cancel(run.id, lane.id))}><Stop size={15} />停止校验</button>}
      <button className="btn btn-pri" disabled={running(lane) || lane.checking || !run.task.checks.length || !lane.files.some(item => /\.html?$/i.test(item.path))} onClick={() => void perform(async () => receive(await api().validate(run.id, lane.id)))}><Play size={15} />{lane.checking ? '校验中…' : '运行校验'}</button>
    </div></header>
    <Evidence lane={lane} />
    {lane.error && <p className="at-lane-error">{lane.error}</p>}
    <div className="at-section-tabs" role="tablist" aria-label="结果内容">{[{ id: 'artifact', label: '产物' }, { id: 'reply', label: '原始回复' }, { id: 'input', label: '输入快照' }].map(item => <button key={item.id} role="tab" aria-selected={section === item.id} onClick={() => setSection(item.id)}>{item.label}</button>)}</div>
    <div className="at-artifact" hidden={section !== 'artifact'}>
      <div className="at-artifact-toolbar">
        <span className="at-readonly"><LockSimple size={13} />只读原始产物</span>
        {layout !== 'preview' && lane.files.length > 0 && <Select aria-label="查看产物文件" value={file?.path ?? ''} onChange={setSelectedFile} options={lane.files.map(item => ({ value: item.path, label: item.path }))} />}
        <Segmented aria-label="产物显示方式" value={layout} onChange={setLayout} options={[{ value: 'preview', label: '预览', icon: <Eye size={15} /> }, { value: 'code', label: '代码', icon: <Code size={15} /> }, { value: 'split', label: '分屏', icon: <Columns size={15} /> }]} />
        <span className="at-spacer" />
        <button className="btn btn-sec btn-sm" onClick={() => setReload(value => value + 1)} disabled={layout === 'code'}><ArrowClockwise size={14} />刷新预览</button>
        <button className="btn btn-sec btn-sm" disabled={layout === 'code'} onClick={() => void perform(async () => { if (document.fullscreenElement) await document.exitFullscreen(); else await preview.current?.requestFullscreen(); })}><CornersOut size={14} />全屏预览</button>
      </div>
      <div className={'at-artifact-body is-' + layout}>
        <div className="at-source" hidden={layout === 'preview'}><div className="at-code-caption"><FileCode size={14} />{file?.path ?? '暂无文件'}</div><pre>{file?.content ?? '此结果没有文件产物，请查看原始回复。'}</pre></div>
        <div className="at-large-preview" hidden={layout === 'code'} ref={preview}><ArtifactPreview run={run} lane={lane} reload={reload} /></div>
      </div>
    </div>
    <pre className="at-detail-text" hidden={section !== 'reply'}>{lane.reply || '暂无原始回复'}</pre>
    <div className="at-input-snapshot" hidden={section !== 'input'}><p>本次运行的只读快照。actualInput 为实际发送的统一提示词，包含模式说明与参考材料。密钥不保存于测试记录；复跑使用当前供应商连接。</p><pre>{JSON.stringify({ createdAt: run.createdAt, model: lane.model, ...run.task, actualInput: run.input }, null, 2)}</pre></div>
    <details className="at-evidence-tray"><summary><CheckCircle size={16} /><strong>校验与过程</strong><span>{lane.checking ? '校验中…' : lane.checks.length ? passes + '/' + lane.checks.length + ' 项通过' : '尚未运行统一校验'}</span><span className="at-muted">网页加载状态与功能断言分别记录</span></summary>
      <div className="at-tray-content">
        {lane.checkError && <p className="at-lane-error">{lane.checkError}</p>}
        {lane.runtimeError && <p className="at-lane-error">启动错误：{lane.runtimeError}</p>}
        {!lane.checks.length && <p>未运行的校验不会标为通过。</p>}
        {lane.checks.map(check => <div className="at-check-row" key={check.id} data-state={check.status}><span>{check.status === 'passed' ? '通过' : check.status === 'failed' ? '未通过' : '出错'}</span><b>{check.label}</b><code>{check.detail}</code></div>)}
        {lane.steps.length > 0 && <h3>Agent 执行过程 · {lane.toolCalls} 次工具调用</h3>}
        {lane.steps.map(step => <details className="at-step" key={step.id}><summary>{step.status === 'complete' ? '完成' : step.status === 'error' ? '出错' : '执行中'} · {step.name}</summary><pre>{step.output || '暂无返回内容'}</pre></details>)}
        <details className="at-step"><summary>运行日志 · {(lane.logs ?? []).length} 条</summary><pre>{lane.logs?.join('\n') || '隔离运行未收到控制台日志。此处不包含手动预览时的新日志。'}</pre></details>
      </div>
    </details>
  </div>;
}
