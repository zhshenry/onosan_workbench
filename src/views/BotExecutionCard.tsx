import { useState } from 'react';
import { ArrowRight, Browser, CheckSquare, SquaresFour } from '@phosphor-icons/react';
import type { AIToolEvent, ChatEntry } from '../../shared/todo-contracts';
import type { BrowserTask, BrowserTaskStatus, BrowserVerificationItem } from '../../shared/browser-automation-contracts';
import { dashboardStyleNames, dashboardTitles } from '../../shared/dashboard-operations';
import { botTurnOutcomeLabel, type BotTurnOutcome } from '../bot-turn-outcomes';
import { BrowserTaskRecord } from '../../modules/browser/ui/task-record';
import { BotOperationCard, BotOperationSubject, type BotOperationTone } from './BotOperationCard';

const stepState = { running: '进行中', complete: '已完成', error: '失败', interrupted: '已中断' } as const;

function parseOutput(output: string): unknown {
  try { return JSON.parse(output); } catch { return undefined; }
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function knownLabel(labels: Record<string, string>, value: unknown) {
  return typeof value === 'string' && Object.hasOwn(labels, value) ? labels[value] : undefined;
}

function toolReceiptFields(output: string): string[] {
  const value = parseOutput(output);
  if (Array.isArray(value)) return ['返回条数 · ' + value.length];
  const result = object(value);
  if (!result) return [];
  const fields: string[] = [];
  for (const [key, label] of Object.entries({ id: '对象', taskId: '事项', sourceId: '来源', operationId: '操作', code: '状态码' })) {
    const id = result[key];
    if (typeof id === 'string' && /^[\w:.#-]{1,96}$/u.test(id)) fields.push(label + ' · ' + id);
  }
  if (typeof result.revision === 'number' && typeof result.operationId === 'string') fields.push('版本 · ' + result.revision);
  if (typeof result.appliedCount === 'number') fields.push('已应用 · ' + result.appliedCount + ' 项');
  for (const key of ['created', 'updated']) {
    const entries = result[key];
    if (!Array.isArray(entries)) continue;
    const ids = entries.flatMap(item => {
      const id = object(item)?.id;
      return typeof id === 'string' && /^[\w:.#-]{1,96}$/u.test(id) ? [id] : [];
    });
    if (ids.length) fields.push((key === 'created' ? '新建' : '更新') + ' · ' + ids.join('、'));
  }
  return fields;
}

export function hasBotExecutionDetails(entry: ChatEntry): boolean {
  return !!entry.tools?.length || !!entry.browserTask;
}

export function BotExecutionDetails({ entry, collapsed = false }: { entry: ChatEntry; collapsed?: boolean }) {
  const [openBrowser, setOpenBrowser] = useState(false);
  if (!hasBotExecutionDetails(entry)) return null;
  const body = <>
    {!!entry.tools?.length && <ul aria-label="实际步骤">{entry.tools.map(tool => {
      const fields = toolReceiptFields(tool.output);
      const part = entry.responseParts?.find(step => step.kind === 'tool' && step.toolId === tool.id);
      return <li key={tool.id}><strong>{tool.label || '工具操作'}</strong> <code>{tool.name}</code> · {stepState[tool.status]}
        {part && Number.isFinite(part.startedAt) && <time dateTime={new Date(part.startedAt).toISOString()}> · {new Date(part.startedAt).toLocaleTimeString('zh-CN')}</time>}
        {fields.length > 0 && <details><summary>查看回执</summary><ul>{fields.map(field => <li key={field}>{field}</li>)}</ul></details>}</li>;
    })}</ul>}
    {entry.browserTask && !entry.streaming && <button type="button" className="bot-text-button" onClick={() => setOpenBrowser(true)}>查看网页操作记录<ArrowRight size={14} /></button>}
    {openBrowser && entry.browserTask && <BrowserTaskRecord reference={entry.browserTask} close={() => setOpenBrowser(false)} />}
  </>;
  return collapsed ? <details className="bot-operation-trace"><summary>操作记录</summary>{body}</details>
    : <div className="bot-operation-trace">{body}</div>;
}

function dashboardResult(tool?: AIToolEvent) {
  if (!tool) return;
  const result = object(parseOutput(tool.output));
  if (!result) return;
  if (tool.name === 'dashboard_read' && typeof result.handoffIssue === 'string') {
    return { title: '总台看板', summary: result.handoffIssue, waiting: true };
  }
  if (tool.name !== 'dashboard_edit' || tool.status !== 'complete') return;
  const changes = Array.isArray(result.changed) ? result.changed.map(object) : [];
  // A tool may pin neighboring cards when it first places a card. Focus the card it actually targeted.
  const item = changes.find(change => change?.id === result.id) ?? changes[0];
  const before = object(item?.before);
  const replacedId = item?.id === 'today' ? 'schedule-stats' : item?.id === 'schedule-stats' ? 'today' : undefined;
  const replacement = before && !item?.after && replacedId ? changes.find(change => change?.id === replacedId && !change.before) : undefined;
  const after = object(item?.after ?? replacement?.after);
  const name = knownLabel(dashboardTitles, after?.id ?? before?.id ?? result.id);
  const style = knownLabel(dashboardStyleNames, after?.style);
  const size = after && typeof after.width === 'number' && typeof after.rows === 'number' ? after.width + ' 列 × ' + after.rows + ' 行' : '';
  const summary = !item ? '布局已核对' : !after ? '已从看板移除' : !before ? [style, size].filter(Boolean).join(' · ')
    : after.style !== before.style ? style : after.width !== before.width || after.rows !== before.rows ? size : '布局已保存';
  return { title: name ? name + '卡片' : '更新看板', summary, waiting: false };
}

function outcomeTone(kind: BotTurnOutcome['kind']): BotOperationTone {
  return kind === 'stopped' || kind === 'interrupted' ? 'neutral' : 'error';
}

const outcomeDescription: Record<BotTurnOutcome['kind'], string> = {
  stopped: '已按你的要求停止本次操作。',
  timeout: '已达到本次操作的时间限制。',
  failed: '本次操作未能完成。',
  interrupted: '本次操作已中断。',
};

const browserState: Record<BrowserTaskStatus, { status: string; tone: BotOperationTone }> = {
  ready: { status: '待执行', tone: 'pending' },
  running: { status: '执行中', tone: 'active' },
  paused: { status: '待接手', tone: 'pending' },
  'site-approval': { status: '待授权', tone: 'pending' },
  completed: { status: '已完成', tone: 'success' },
  unverified: { status: '待核对', tone: 'pending' },
  cancelled: { status: '已取消', tone: 'neutral' },
  failed: { status: '执行失败', tone: 'error' },
  interrupted: { status: '已中断', tone: 'neutral' },
};

const browserActionText: Record<string, string> = {
  navigate: '已打开网页', extract: '已提取网页数据', fill: '已填写页面内容',
  type: '已输入内容', pressSequentially: '已输入内容', select: '已选择页面选项', setChecked: '已设置勾选状态',
  click: '已点击网页', dblclick: '已双击网页', coordinate: '已点击网页', locator: '已操作网页',
  press: '已在页面上按键', scroll: '已滚动网页', drag: '已在网页上拖动',
};
const browserNextStep: Partial<Record<BrowserTaskStatus, string>> = {
  paused: '请在网页中接手，完成后点浏览器工具栏的「继续操作」。',
  'site-approval': '请确认是否允许访问该站点。',
  unverified: '请在网页上核对结果。',
  failed: '操作遇到问题，请检查当前网页。',
  interrupted: '操作已中断，请检查当前网页。',
};
const browserWriteSteps = new Set([
  'click', 'dblclick', 'coordinate', 'locator', 'fill', 'type', 'pressSequentially', 'select', 'setChecked', 'press', 'drag',
  'declare_write', 'group_submit',
]);

function verifiedPageResult(checks: BrowserVerificationItem[]): string {
  if (checks.length > 1) return `已核对 ${checks.length} 项页面结果`;
  const condition = checks[0]?.condition;
  if (condition?.type === 'text' || condition?.type === 'element') {
    const text = (condition.type === 'text' ? condition.text : condition.name).trim().replace(/\s+/g, ' ');
    if (text && text.length <= 32 && !text.includes('://')) return `${condition.present === false ? '未找到' : '找到'}「${text}」`;
  }
  if (condition?.type === 'url') return '已核对页面地址';
  if (condition?.type === 'locator' && condition.count !== undefined) return `页面有 ${condition.count} 项符合条件的结果`;
  return '已核对页面结果';
}

function browserOperation(task: BrowserTask) {
  const checks = task.verification?.items ?? [];
  const verified = task.status === 'completed' && checks.length > 0 && checks.every(item => item.status === 'passed');
  const state = task.status === 'completed' && !verified ? 'unverified' : task.status;
  const step = task.steps.filter(item => item.status === 'ok' && Object.hasOwn(browserActionText, item.operation)).at(-1);
  const action = step ? browserActionText[step.operation]
    : task.steps.some(item => item.status === 'ok' && item.operation === 'observe') ? '已查看网页' : undefined;
  const summary = verified ? [action, verifiedPageResult(checks)].filter(Boolean).join('，') + '。'
    : state === 'unverified' && action ? action + '。' + browserNextStep.unverified
    : state === 'running' && action ? action + '。' : browserNextStep[state];
  return { ...browserState[state], summary };
}

export function BotExecutionCard({ entry, browserTask, outcome, onOpenWork, onOpenBrowser, onOpenDashboard, conversation = false }: {
  entry: ChatEntry; browserTask?: BrowserTask; outcome?: BotTurnOutcome; onOpenWork?(): void;
  onOpenBrowser?(task: BrowserTask): void; onOpenDashboard?(): void;
  conversation?: boolean;
}) {
  const tools = [...(entry.tools ?? [])].reverse();
  const latest = tools[0];
  const tool = tools.find(step => step.status === 'running')
    ?? (latest?.status === 'complete' ? tools.find(step => step.name === 'dashboard_edit' && step.status === 'complete') : undefined)
    ?? latest;
  const dashboard = dashboardResult(tools.find(step => step.name.startsWith('dashboard_')));
  const isDashboard = dashboard || tool?.name.startsWith('dashboard_');
  const web = !!entry.browserTask;
  const showToolDetails = !conversation && !outcome;
  const browser = browserTask && browserOperation(browserTask);
  const browserHandoff = conversation && browserTask && (browserTask.status === 'paused'
    || browser?.status === browserState.unverified.status && browserTask.steps.some(step => browserWriteSteps.has(step.operation)));
  const browserFailure = conversation && browserTask && ['failed', 'interrupted'].includes(browserTask.status);
  if (conversation && !outcome && !browserHandoff && !browserFailure && !dashboard?.waiting) return null;
  if (!hasBotExecutionDetails(entry) && !outcome && !browserHandoff && !browserFailure) return null;
  const handoff = conversation && dashboard?.waiting ? dashboard.summary : undefined;
  const { status, tone } = outcome ? { status: botTurnOutcomeLabel[outcome.kind], tone: outcomeTone(outcome.kind) }
    : browser ? browser
    : browserTask ? browserState[browserTask.status]
    : dashboard?.waiting ? { status: '待处理', tone: 'pending' as const }
    : entry.streaming || tool?.status === 'running' ? { status: '执行中', tone: 'active' as const }
    : tool?.status === 'error' ? { status: '执行失败', tone: 'error' as const }
    : tool?.status === 'interrupted' ? { status: '已中断', tone: 'neutral' as const }
    : tool ? { status: '已完成', tone: 'success' as const }
    : { status: '有操作记录', tone: 'neutral' as const };
  const goal = browserTask?.goal?.trim();
  const handoffTitle = browserHandoff && !outcome ? goal : undefined;
  const label = web ? handoffTitle || '网页操作' : dashboard?.waiting ? '调整看板' : dashboard?.title ?? ((showToolDetails ? tool?.label : isDashboard ? '总台看板' : undefined) || '处理请求');
  const summary = handoffTitle ? undefined : goal || (showToolDetails ? dashboard?.summary : undefined);
  const site = handoffTitle && browserTask?.origins.length === 1 ? browserTask.origins[0] : undefined;
  const operationSummary = browserHandoff || browserFailure || showToolDetails ? browser?.summary ?? handoff : handoff;
  const reason = outcome?.kind === 'timeout' ? outcome.reason?.replace(/^任务超时(?:[：:]|$)\s*/, '') : outcome?.reason;
  const detail = outcome ? reason || outcomeDescription[outcome.kind] : browserFailure ? browserTask?.error || operationSummary : operationSummary;
  const openWork = (outcome || browserFailure || browserHandoff && !onOpenBrowser) && onOpenWork;
  return <BotOperationCard label={label} summary={summary} aria-label={web ? label : undefined}
    data-outcome={outcome?.kind} initialOpen={!outcome && !!operationSummary}
    icon={web ? <Browser size={18} /> : isDashboard ? <SquaresFour size={18} /> : <CheckSquare size={18} />}
    status={status} tone={tone}>
    {detail && (site || !handoffTitle ? <BotOperationSubject title={site || summary || dashboard?.title || label}>{detail}</BotOperationSubject>
      : <p className="bot-help">{detail}</p>)}
    {!outcome && browserHandoff && browserTask && onOpenBrowser && <div className="bot-action-buttons"><button type="button" onClick={() => onOpenBrowser(browserTask)}>打开网页<ArrowRight size={14} aria-hidden="true" /></button></div>}
    {!outcome && handoff && onOpenDashboard && <div className="bot-action-buttons"><button type="button" onClick={onOpenDashboard}>打开看板<ArrowRight size={14} aria-hidden="true" /></button></div>}
    {openWork && <div className="bot-action-buttons"><button type="button" onClick={openWork}>查看工作详情</button></div>}
    {showToolDetails && <BotExecutionDetails entry={entry} />}
  </BotOperationCard>;
}
