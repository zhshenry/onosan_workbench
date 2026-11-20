import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { ArrowRight, CaretDown, CaretRight, Brain, Wrench } from '@phosphor-icons/react';
import type { AIToolEvent, ChatEntry } from '../../shared/todo-contracts';
import { renderAiMarkdown } from '../ai-markdown';
import { botTurnOutcomeLabel, type BotTurnOutcome } from '../bot-turn-outcomes';
import { errorText } from '../ui/controls';
import { BrowserTaskRecord } from '../../modules/browser/ui/task-record';
import type { BrowserTask } from '../../shared/browser-automation-contracts';
import { BrowserSiteApprovalReceipts } from '../../modules/browser/ui/site-approval';
import { thinkingElapsedMs } from '../../shared/ai-thinking';

const toolStatus = { running: '进行中', complete: '已完成', error: '失败', interrupted: '已中断' } as const;

const AiMarkdown = memo(function AiMarkdown({ text }: { text: string }) {
  const html = useMemo(() => renderAiMarkdown(text), [text]);
  const [linkError, setLinkError] = useState('');
  const openLink = (event: MouseEvent<HTMLDivElement>): void => {
    const anchor = (event.target as Element).closest('a[href]');
    if (!anchor) return;
    event.preventDefault();
    if (event.button !== 0 && event.button !== 1) return;
    setLinkError('');
    void window.workbench.ai.openLink(anchor.getAttribute('href')!).catch(cause => setLinkError(errorText(cause)));
  };
  return <>
    <div className="ai-markdown" onClick={openLink} onAuxClick={openLink} dangerouslySetInnerHTML={{ __html: html }} />
    {linkError && <div className="ai-error" role="alert">{linkError}</div>}
  </>;
});

function useClock(active: boolean) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

function useDisclosureContent(open: boolean) {
  const details = useRef<HTMLDetailsElement>(null);
  const [retained, setRetained] = useState(open);
  useLayoutEffect(() => {
    if (open) {
      setRetained(true);
      return;
    }
    if (!retained) return;

    const element = details.current;
    const duration = element ? Number(window.getComputedStyle(element).getPropertyValue('--bot-disclosure-ms')) : 0;
    if (!duration) {
      setRetained(false);
      return;
    }
    // Chromium keeps the details-content transition inside its native disclosure.
    let timer = 0;
    const frame = window.requestAnimationFrame(() => {
      timer = window.setTimeout(() => setRetained(false), duration);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [open, retained]);
  return { details, showContent: open || retained };
}

function ToolDetails({ tool, waitingForSite }: { tool: AIToolEvent; waitingForSite: boolean }) {
  return <details className={'ai-tool-detail ' + tool.status}>
    <summary><span>{tool.label}</span><small>{waitingForSite && tool.status === 'running' ? '等待授权' : toolStatus[tool.status]}</small><CaretDown size={12} className="ai-activity-caret" /></summary>
    <pre>{tool.output || (tool.status === 'running' ? '等待工具返回…' : '未返回可见结果')}</pre>
  </details>;
}

function thinkingDuration(entry: ChatEntry, active: boolean, now: number) {
  if (entry.thinkingMs === undefined) return '耗时未记录';
  const elapsed = thinkingElapsedMs(active ? entry : { thinkingMs: entry.thinkingMs }, now);
  return `${Math.floor(elapsed / 1000)} 秒`;
}

function ThinkingDetails({ text, duration, active = false }: {
  text: string; duration?: string; active?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { details, showContent } = useDisclosureContent(open);
  const characters = useMemo(() => Array.from(text.replace(/\s/g, '')).length, [text]);
  const metrics = `${characters.toLocaleString('zh-CN')} 字${duration ? ` · ${duration}` : ''}`;
  return <details ref={details} className="ai-activity ai-thinking" open={open}>
    <summary aria-label={`思考过程，${active ? '思考中，' : ''}${metrics}`} onClick={event => { event.preventDefault(); setOpen(value => !value); }}>
      <Brain size={15} /><span>思考过程</span>
      <small className="ai-thinking-metrics" title={duration ? '思考文本字符数（不含空白）与累计思考耗时；等待工具或授权时暂停计时' : undefined}>{metrics}</small>
      <CaretRight size={13} className="ai-activity-caret" />
    </summary>
    {showContent && <div className="ai-thinking-body" inert={!open}><AiMarkdown text={text} /></div>}
  </details>;
}

function ToolsDetails({ tools, waitingForSite }: { tools: AIToolEvent[]; waitingForSite: boolean }) {
  const [open, setOpen] = useState(false);
  const { details, showContent } = useDisclosureContent(open);
  const running = tools.some(tool => tool.status === 'running');
  const failed = tools.filter(tool => tool.status === 'error').length;
  const interrupted = tools.filter(tool => tool.status === 'interrupted').length;
  const issues = [failed && `${failed} 次调用失败`, interrupted && `${interrupted} 次调用中断`].filter(Boolean).join(' · ');
  return <details ref={details} className="ai-activity" open={open}>
    <summary onClick={event => { event.preventDefault(); setOpen(value => !value); }}>
      <Wrench size={15} /><span>工具执行 <small>· {tools.length} 项</small></span>
      <small className={issues ? 'ai-tool-failed' : undefined}>{waitingForSite ? '等待授权' : running ? '进行中' : issues || '已完成'}</small>
      <CaretRight size={13} className="ai-activity-caret" />
    </summary>
    {showContent && <div className="ai-tool-list" inert={!open}>{tools.map(tool => <ToolDetails key={tool.id} tool={tool} waitingForSite={waitingForSite} />)}</div>}
  </details>;
}

function ReplyBubble({ text, streaming, record }: { text: string; streaming?: boolean; record?: ReactNode }) {
  return <div className="ai-bubble"><AiMarkdown text={text} />{streaming && <span className="ai-caret" aria-hidden="true" />}{record}</div>;
}

type ProcessStep = { kind: 'thinking'; text: string } | { kind: 'tools'; tools: AIToolEvent[] };
type ProcessGroup = { kind: 'process'; steps: ProcessStep[]; startedAt?: number; endedAt?: number };
type ReplyGroup = ProcessGroup | { kind: 'text'; text: string };
type ReplyContentProps = { entry: ChatEntry; tools: AIToolEvent[]; waitingForSite: boolean; showTyping: boolean; record?: ReactNode; outcome?: BotTurnOutcome; onOpenWork?(): void };

function replyGroups({ entry, tools, showTyping }: ReplyContentProps) {
  const groups: ReplyGroup[] = [];
  const createdAt = Date.parse(entry.createdAt ?? '');
  const replyStartedAt = Number.isFinite(createdAt) ? createdAt : undefined;
  const addStep = (step: ProcessStep, startedAt?: number) => {
    let group = groups.at(-1);
    if (group?.kind !== 'process') {
      group = { kind: 'process', steps: [], startedAt: groups.length ? startedAt : replyStartedAt ?? startedAt };
      groups.push(group);
    }
    const previous = group.steps.at(-1);
    if (step.kind === 'tools' && previous?.kind === 'tools') previous.tools.push(...step.tools);
    else if (step.kind === 'thinking' && previous?.kind === 'thinking') previous.text += '\n\n' + step.text;
    else group.steps.push(step);
  };
  let textTurn: number | undefined, lastText = '';
  if (entry.responseParts) {
    const toolsById = new Map(tools.map(tool => [tool.id, tool]));
    for (const part of entry.responseParts) {
      if (part.kind === 'tool') {
        const tool = toolsById.get(part.toolId);
        if (tool) addStep({ kind: 'tools', tools: [tool] }, part.startedAt);
      } else if (part.kind === 'thinking') {
        if (part.text.trim()) addStep({ kind: 'thinking', text: part.text }, part.startedAt);
      } else {
        const previous = groups.at(-1);
        if (previous?.kind === 'text' && textTurn === part.turn) previous.text += part.text;
        else {
          if (previous?.kind === 'process') previous.endedAt = part.startedAt;
          groups.push({ kind: 'text', text: part.text });
        }
        lastText = textTurn === part.turn ? lastText + part.text : part.text;
        textTurn = part.turn;
      }
    }
  } else {
    if (entry.thinking?.trim()) addStep({ kind: 'thinking', text: entry.thinking });
    if (tools.length) addStep({ kind: 'tools', tools: [...tools] });
  }
  if (entry.content && entry.content.trim() !== lastText.trim() && (!entry.streaming || !lastText)) {
    const previous = groups.at(-1);
    if (previous?.kind === 'process') previous.endedAt = entry.responseFinishedAt;
    groups.push({ kind: 'text', text: entry.content });
  }
  if (!groups.length && entry.streaming && showTyping) groups.push({ kind: 'process', steps: [], startedAt: replyStartedAt });
  return groups;
}

export function ResponseProcess({ group, entry, active = false, waitingForSite = false, outcome, onOpenWork }: {
  group?: ProcessGroup; entry?: ChatEntry; active?: boolean; waitingForSite?: boolean; outcome?: BotTurnOutcome; onOpenWork?(): void;
}) {
  const [override, setOverride] = useState<{ active: boolean; open: boolean }>();
  const open = override?.active === active ? override.open : active;
  const { details, showContent } = useDisclosureContent(open);
  const now = useClock(active);
  const steps = group?.steps ?? [];
  const end = active ? now : group?.endedAt ?? entry?.responseFinishedAt;
  const tools = steps.flatMap(step => step.kind === 'tools' ? step.tools : []);
  const duration = group?.startedAt !== undefined && end !== undefined ? Math.max(0, end - group.startedAt)
    : !entry?.responseParts && !tools.length && entry?.thinkingMs !== undefined ? thinkingElapsedMs(active ? entry : { thinkingMs: entry.thinkingMs }, now) : undefined;
  const interrupted = tools.some(tool => tool.status === 'interrupted') || Boolean(entry?.responseParts && end === undefined);
  const status = outcome ? botTurnOutcomeLabel[outcome.kind]
    : active ? '正在思考' : interrupted ? '已中断' : !group?.endedAt && entry?.error ? '执行失败' : '已完成';
  const replyStart = Date.parse(entry?.createdAt ?? '');
  const replyEnd = entry?.responseFinishedAt;
  const displayDuration = outcome ? outcome.kind === 'stopped' && replyEnd !== undefined && Number.isFinite(replyStart)
    ? Math.max(0, replyEnd - replyStart) : undefined : duration;
  const label = displayDuration === undefined ? status : `${status} ${Math.floor(displayDuration / 1000)}s`;
  const openWork = outcome?.kind === 'failed' || outcome?.kind === 'interrupted' ? onOpenWork : undefined;
  const reason = outcome?.kind === 'timeout' ? outcome.reason?.replace(/^任务超时(?:[：:]|$)\s*/, '') : outcome?.reason;
  if (!steps.length && !reason && !openWork) return <div className="ai-process-pending" data-outcome={outcome?.kind} role="status" aria-live="off">{label}</div>;
  return <details ref={details} className="ai-process" data-outcome={outcome?.kind} data-completed={status === '已完成' || undefined} open={open}>
    <summary onClick={event => { event.preventDefault(); setOverride({ active, open: !open }); }}>
      <span>{label}</span><CaretRight size={13} className="ai-activity-caret" aria-hidden="true" />
      {waitingForSite && active && <small>等待授权</small>}
    </summary>
    {showContent && <div className="ai-process-steps" inert={!open}>
      {reason && <p className="bot-outcome-reason">{reason}</p>}
      {openWork && <button type="button" className="bot-text-button" onClick={openWork}>查看工作详情<ArrowRight size={14} aria-hidden="true" /></button>}
      {steps.map((step, index) => {
        if (step.kind === 'tools') {
          const waiting = active && waitingForSite && step.tools.some(tool => tool.status === 'running');
          return <ToolsDetails key={index} tools={step.tools} waitingForSite={waiting} />;
        }
        const thinkingActive = active && index === steps.length - 1 && Boolean(entry?.thinkingActive);
        const duration = entry && step.text === entry.thinking ? thinkingDuration(entry, thinkingActive, now) : undefined;
        return <ThinkingDetails key={index} text={step.text} duration={duration} active={thinkingActive} />;
      })}
    </div>}
  </details>;
}

function OrderedReply(props: ReplyContentProps) {
  const { entry, record, waitingForSite, outcome, onOpenWork } = props;
  const groups = replyGroups(props);
  const finalProcess = outcome ? groups.reduce((last, group, index) => group.kind === 'process' ? index : last, -1) : -1;
  const lastText = groups.reduce((last, group, index) => group.kind === 'text' ? index : last, -1);
  return <>
    {outcome && finalProcess < 0 && <ResponseProcess entry={entry} outcome={outcome} onOpenWork={onOpenWork} />}
    {groups.map((group, index) => {
      const active = Boolean(!outcome && entry.streaming && index === groups.length - 1);
      return group.kind === 'process' ? <ResponseProcess key={index} group={group} entry={entry} active={active} waitingForSite={waitingForSite}
        outcome={index === finalProcess ? outcome : undefined} onOpenWork={onOpenWork} />
        : <ReplyBubble key={index} text={group.text} streaming={active && entry.responsePhase !== 'waiting'} record={index === lastText ? record : undefined} />;
    })}
    {lastText < 0 && record}
  </>;
}

function ClassicReply({ entry, tools, waitingForSite, showTyping, record }: ReplyContentProps) {
  const thinkingActive = Boolean(entry.streaming && entry.thinkingActive);
  const now = useClock(thinkingActive);
  const running = tools.some(tool => tool.status === 'running');
  return <>
    {entry.thinking?.trim() && <ThinkingDetails text={entry.thinking} duration={thinkingDuration(entry, thinkingActive, now)} active={thinkingActive} />}
    {tools.length > 0 && <ToolsDetails tools={tools} waitingForSite={waitingForSite} />}
    {entry.content ? <ReplyBubble text={entry.content} streaming={entry.streaming} record={record} />
      : showTyping && entry.streaming && !(thinkingActive && entry.thinking?.trim()) && !running ? <div className="ai-typing" role="status"><i /><i /><i /><span>正在生成回复…</span></div> : null}
    {!entry.content && record}
  </>;
}

export function AiResponse({ entry, browserTask, showTyping = true, showTools = true, showTimeline = false, approvalCardId, onLocateApproval, outcome, onOpenWork }: {
  entry: ChatEntry; browserTask?: BrowserTask; showTyping?: boolean; showTools?: boolean; showTimeline?: boolean; approvalCardId?: string; onLocateApproval?(): void;
  outcome?: BotTurnOutcome; onOpenWork?(): void;
}) {
  const [recordOpen, setRecordOpen] = useState(false);
  const record = entry.browserTask && !entry.streaming && <button type="button" className="ai-browser-record" onClick={() => setRecordOpen(true)}>查看操作记录<CaretRight size={13} /></button>;
  const Body = showTimeline ? OrderedReply : ClassicReply;
  return <div className="ai-response">
    <Body entry={entry} tools={showTools ? entry.tools ?? [] : []} waitingForSite={browserTask?.status === 'site-approval'} showTyping={showTyping} record={record} outcome={outcome} onOpenWork={onOpenWork} />
    {browserTask && approvalCardId && onLocateApproval && <BrowserSiteApprovalReceipts task={browserTask} onLocate={onLocateApproval} cardId={approvalCardId} />}
    {recordOpen && entry.browserTask && <BrowserTaskRecord reference={entry.browserTask} close={() => setRecordOpen(false)} />}
  </div>;
}
