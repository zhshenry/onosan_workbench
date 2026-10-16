import { useEffect, useState } from 'react';
import { Modal, errorText } from '../../todo/ui/ui';
import type { BrowserTask } from '../../../shared/browser-automation-contracts';

export const browserTaskLabels: Record<BrowserTask['status'], string> = { ready: '准备开始', running: 'AI 正在操作', paused: '已暂停 · 可手动操作', 'site-approval': '等待站点授权', completed: '页面条件验证通过', unverified: '执行结束 · 结果尚未验证', cancelled: '已停止', failed: '执行失败', interrupted: '任务已中断 · 请检查页面' };
const operationLabels: Record<string, string> = { observe: '观察页面', navigate: '跳转页面', check: '核验结果', wait: '等待页面', click: '点击', dblclick: '双击', hover: '悬停', fill: '填写', select: '选择选项', press: '按键', setChecked: '设置勾选', pressSequentially: '逐字输入', coordinate: '坐标点击', scroll: '滚动', drag: '拖动', locator: '定位并操作' };

export function BrowserTaskDetails({ task }: { task: BrowserTask }) {
  return <div className="browser-task-detail">
    <p role="status">{browserTaskLabels[task.status]} · {task.steps.length} 条操作记录</p>
    <p className="browser-record-time">{new Date(task.updatedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</p>
    {task.origins.length > 0 && <p>{task.origins.join('、')}</p>}
    {task.pendingOrigin && <p>待授权站点：{task.pendingOrigin}</p>}
    {task.status === 'interrupted' && <p>重启只恢复地址和记录，不会自动重放网页操作；检查页面后在右侧 AI 助手重新提出操作要求。</p>}
    {(task.error || task.persistenceError) && <p className="ai-error" role="alert">{task.error || task.persistenceError}</p>}
    {task.steps.length ? <ol className="browser-task-steps">{task.steps.map((step, index) => <li key={index}>
      <div><strong>{operationLabels[step.operation] ?? step.operation}</strong><span>{step.status === 'ok' ? '已返回' : '错误'}</span></div>
      <p>{step.detail}</p>
    </li>)}</ol> : <p>此任务尚无网页操作记录。</p>}
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
  return <Modal title="浏览器操作记录" className="browser-dialog" close={close}>
    {loading ? <p role="status">正在读取操作记录…</p> : error ? <div role="alert"><p>{error}</p><button className="btn btn-sec" onClick={() => setRetry(value => value + 1)}>重试</button></div>
      : task ? <><h3 className="browser-record-goal">{task.goal}</h3><BrowserTaskDetails task={task} /></>
        : <p role="status">这次任务的操作记录已不在保留范围内。</p>}
  </Modal>;
}
