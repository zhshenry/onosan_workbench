import { useEffect, useState } from 'react';
import { CaretRight, CheckCircle, Clock, FileMagnifyingGlass, Info, ListChecks, WarningCircle } from '@phosphor-icons/react';
import { Modal, Segmented, errorText } from '../../../src/ui/controls';
import type { BrowserCondition, BrowserTask } from '../../../shared/browser-automation-contracts';

export const browserTaskLabels: Record<BrowserTask['status'], string> = { ready: '准备开始', running: 'AI 正在操作', paused: '已暂停 · 可手动操作', 'site-approval': '等待站点授权', completed: '页面条件验证通过', unverified: '执行结束 · 结果尚未验证', cancelled: '已停止', failed: '执行失败', interrupted: '任务已中断 · 请检查页面' };
const operationLabels: Record<string, string> = { observe: '读取页面', navigate: '跳转页面', check: '检查页面条件', wait: '等待页面', click: '点击', dblclick: '双击', hover: '悬停', fill: '填写', select: '选择选项', press: '按键', setChecked: '设置勾选', pressSequentially: '逐字输入', coordinate: '坐标点击', scroll: '滚动', drag: '拖动', locator: '定位并操作', extract: '提取表格' };
const checkLabels = { pending: '尚未核验', passed: '通过', failed: '不符合', unknown: '无法确认', stale: '证据已过期' };
const recordTime = (at: string) => new Date(at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
function recordHost(url: string) { try { return new URL(url).hostname; } catch { return url; } }

function conditionTitle(condition: BrowserCondition): string {
  if (condition.type === 'text') return `页面${condition.present ? '包含' : '不包含'}「${condition.text}」`;
  if (condition.type === 'url') return `页面地址包含「${condition.text}」`;
  if (condition.type === 'state') return ({ attached: '页面元素已加载', detached: '页面元素已移除', visible: '页面区域可见', hidden: '页面区域不可见', enabled: '页面控件可用', disabled: '页面控件已禁用', stable: '页面元素位置稳定' })[condition.state];
  if (condition.type === 'element') return `页面${condition.present ? '包含' : '不包含'}「${condition.name || condition.role}」元素`;
  const states = [condition.value === undefined ? '' : `内容为「${condition.value}」`, condition.checked === undefined ? '' : condition.checked ? '已勾选' : '未勾选', condition.selected === undefined ? '' : condition.selected ? '已选中' : '未选中', condition.expanded === undefined ? '' : condition.expanded ? '已展开' : '已收起'].filter(Boolean).join('、');
  if (condition.type === 'field') return `「${condition.name || condition.role}」${states}`;
  const target = condition.count !== undefined ? `定位结果为 ${condition.count} 项` : condition.present ? '找到符合条件的页面元素' : '未找到符合条件的页面元素';
  return states ? `${target}（${states}）` : target;
}

function BrowserRecordStatus({ task, compact = false }: { task: BrowserTask; compact?: boolean }) {
  const items = task.verification?.items ?? [];
  const passed = task.status === 'completed' && items.length > 0 && items.every(item => item.status === 'passed');
  const label = passed ? compact ? '页面条件已满足' : `页面检查 ${items.length}/${items.length} 通过` : task.status === 'completed' ? items.length ? '任务已结束 · 检查尚未全部通过' : '任务已结束 · 缺少检查记录' : browserTaskLabels[task.status];
  const Icon = passed ? CheckCircle : ['completed', 'failed', 'interrupted', 'unverified'].includes(task.status) ? WarningCircle : Clock;
  return <span className="browser-record-state" data-status={passed ? 'passed' : task.status} role={compact ? undefined : 'status'}><Icon size={16} weight={passed ? 'fill' : 'regular'} aria-hidden="true" />{label}</span>;
}

export function BrowserTaskHistory({ tasks }: { tasks: BrowserTask[] }) {
  const ordered = [...tasks].reverse();
  const [selected, setSelected] = useState(ordered[0]?.id);
  const task = ordered.find(item => item.id === selected) ?? ordered[0];
  if (!task) return <p className="browser-record-empty" role="status">还没有任务记录。使用右侧 AI 助手操作网页后，可在这里查看记录。</p>;
  return <div className="browser-task-browser">
    <nav className="browser-task-sidebar" aria-label="最近浏览器任务">
      <h3>最近任务 <span className="browser-record-count">{ordered.length}</span></h3>
      <div className="browser-task-list">{ordered.map(item => <button type="button" key={item.id} className="browser-task-item" title={item.goal} aria-current={item.id === task.id ? 'true' : undefined} onClick={() => setSelected(item.id)}>
        <FileMagnifyingGlass size={22} aria-hidden="true" />
        <span><strong>{item.goal}</strong><time dateTime={item.updatedAt}>{recordTime(item.updatedAt)}</time><BrowserRecordStatus task={item} compact /></span>
      </button>)}</div>
    </nav>
    <BrowserTaskDetails key={task.id} task={task} />
  </div>;
}

export function BrowserTaskDetails({ task }: { task: BrowserTask }) {
  const items = task.verification?.items ?? [];
  const [view, setView] = useState(items.length ? 'checks' : 'steps');
  return <div className="browser-task-detail">
    <header className="browser-record-heading"><p>任务详情</p><h3 className="browser-record-goal">{task.goal}</h3>
      <p className="browser-record-time">{task.origins.length > 0 && <span title={task.origins.join('、')}>{task.origins.map(recordHost).join('、')} · </span>}<time dateTime={task.updatedAt}>{recordTime(task.updatedAt)}</time></p>
      <BrowserRecordStatus task={task} />
    </header>
    {task.pendingOrigin && <p>待授权站点：{task.pendingOrigin}</p>}
    {task.status === 'interrupted' && <p>重启只恢复地址和记录，不会自动重放网页操作；检查页面后在右侧 AI 助手重新提出操作要求。</p>}
    {(task.error || task.persistenceError) && <p className="ai-error" role="alert">{task.error || task.persistenceError}</p>}
    <div className="browser-record-tabs"><Segmented value={view} onChange={setView} aria-label="任务记录内容" options={[
      { value: 'checks', label: '页面检查', icon: <span className="browser-record-count" aria-hidden="true">{items.length}</span> },
      { value: 'steps', label: '操作过程', icon: <span className="browser-record-count" aria-hidden="true">{task.steps.length}</span> },
    ]} /></div>
    <div className="browser-record-content">
      <section aria-label="任务核验清单" hidden={view !== 'checks'}>
        {items.length ? <ul className="browser-task-steps browser-record-checks">{items.map(item => <li key={item.id}><details>
          <summary><ListChecks size={20} aria-hidden="true" /><strong>{conditionTitle(item.condition)}</strong><span className="browser-check-state" data-status={item.status}>{item.status === 'passed' && <CheckCircle size={17} weight="fill" aria-hidden="true" />}{checkLabels[item.status]}</span><CaretRight size={16} className="browser-record-caret" aria-hidden="true" /></summary>
          <div className="browser-record-evidence">
            {item.evidence ? <><p className="browser-evidence-caption">实际读取到的内容</p><p className="browser-evidence-actual">{item.evidence.actual}</p>
              <dl><div><dt>来源</dt><dd><details className="browser-evidence-definition"><summary title="展开检查定义与完整来源">{recordHost(item.evidence.url)} <CaretRight size={12} aria-hidden="true" /></summary><p>AI 登记的名称：{item.label}</p><p>判定记录：{item.evidence.detail}</p><p>{item.evidence.url}</p></details></dd></div><div><dt>检查时间</dt><dd><time dateTime={item.evidence.at}>{recordTime(item.evidence.at)}</time></dd></div></dl>
            </> : <p>尚无页面检查证据。</p>}
          </div>
        </details></li>)}</ul> : <p className="browser-record-empty">还没有页面检查记录。操作正常返回并不代表任务目标已经完成。</p>}
      </section>
      <section aria-label="操作过程" hidden={view !== 'steps'}>
        <p className="browser-record-explainer">“已返回”表示操作正常返回，任务结果请查看页面检查。</p>
        {task.steps.length ? <ol className="browser-task-steps browser-record-operations">{task.steps.map((step, index) => <li key={index}><details>
          <summary><Clock size={18} aria-hidden="true" /><strong>{operationLabels[step.operation] ?? step.operation}<time dateTime={step.at}>{recordTime(step.at)}</time></strong><span data-status={step.status}>{step.status === 'ok' ? '已返回' : '错误'}</span><CaretRight size={16} className="browser-record-caret" aria-hidden="true" /></summary>
          <p className="browser-record-operation-detail">{step.detail}</p>
        </details></li>)}</ol> : <p className="browser-record-empty">此任务尚无网页操作记录。</p>}
        {task.siteApprovals?.length ? <section className="browser-record-approvals" aria-label="站点授权记录"><h4>站点授权</h4><ul>{task.siteApprovals.map((approval, index) => <li key={`${approval.origin}:${index}`}>{({ pending: '等待授权', allowed: '已允许', denied: '未授权', expired: '已失效' } as const)[approval.status]} · {approval.origin}</li>)}</ul></section> : null}
      </section>
    </div>
    <p className="browser-record-scope"><Info size={18} aria-hidden="true" /><span>页面检查只确认记录中的网页条件，不代表资料真实性或完整性已核验。</span></p>
  </div>;
}

export function BrowserTaskRecord({ reference, close }: { reference: Pick<BrowserTask, 'id' | 'workspace'>; close(): void }) {
  const [task, setTask] = useState<BrowserTask | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  useEffect(() => {
    let current = true, updated = false;
    setLoading(true); setError(''); setTask(null);
    const api = window.workbench.browserAutomation;
    const off = api.onTask(value => {
      if (value.id === reference.id && value.workspace === reference.workspace) { updated = true; setTask(value); }
    });
    void api.state(reference.workspace).then(value => {
      if (current && !updated) setTask(value.tasks.find(item => item.id === reference.id) ?? null);
    }, cause => { if (current) setError(errorText(cause)); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; off(); };
  }, [reference.id, reference.workspace, retry]);
  return <Modal title="浏览器操作记录" className="browser-dialog browser-task-single" close={close}>
    {loading ? <p role="status">正在读取操作记录…</p> : error ? <div role="alert"><p>{error}</p><button className="btn btn-sec" onClick={() => setRetry(value => value + 1)}>重试</button></div>
      : task ? <BrowserTaskDetails key={task.id} task={task} />
        : <p role="status">这次任务的操作记录已不在保留范围内。</p>}
  </Modal>;
}
