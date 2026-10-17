import { memo, useEffect, useMemo, useState, type MouseEvent } from 'react';
import { CaretDown, CaretRight, Brain, Wrench } from '@phosphor-icons/react';
import type { ChatEntry } from '../../shared/todo-contracts';
import { renderAiMarkdown } from '../ai-markdown';
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

export function AiResponse({ entry, browserTask, showTyping = true, approvalCardId = '', onLocateApproval = () => {} }: { entry: ChatEntry; browserTask?: BrowserTask; showTyping?: boolean; approvalCardId?: string; onLocateApproval?(): void }) {
  const [thinkingOpen, setThinkingExpanded] = useState(false);
  const [toolsOpen, setToolsExpanded] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const thinkingActive = Boolean(entry.streaming && entry.thinkingActive);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!thinkingActive) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [thinkingActive]);
  const thinkingCharacters = useMemo(() => Array.from((entry.thinking ?? '').replace(/\s/g, '')).length, [entry.thinking]);
  const thinkingSeconds = Math.floor(thinkingElapsedMs(thinkingActive ? entry : { thinkingMs: entry.thinkingMs }, now) / 1000);
  const thinkingMetrics = `${thinkingCharacters.toLocaleString('zh-CN')} 字 · ${entry.thinkingMs === undefined ? '耗时未记录' : `${thinkingSeconds} 秒`}`;
  const tools = entry.tools ?? [];
  const running = tools.some(tool => tool.status === 'running');
  const failed = tools.filter(tool => tool.status === 'error' || tool.status === 'interrupted').length;
  const waitingForSite = browserTask?.status === 'site-approval';
  return <div className="ai-response">
    {entry.thinking?.trim() && <details className="ai-activity ai-thinking" open={thinkingOpen}>
      <summary aria-label={`思考过程，${thinkingActive ? '思考中，' : ''}${thinkingMetrics}`} onClick={event => { event.preventDefault(); setThinkingExpanded(!thinkingOpen); }}>
        <Brain size={15} /><span>思考过程</span>
        <small className="ai-thinking-metrics" title="思考文本字符数（不含空白）与累计思考耗时；等待工具或授权时暂停计时">{thinkingMetrics}</small><CaretRight size={13} className="ai-activity-caret" />
      </summary>
      <div className="ai-thinking-body"><AiMarkdown text={entry.thinking} /></div>
    </details>}
    {tools.length > 0 && <details className="ai-activity" open={toolsOpen}>
      <summary onClick={event => { event.preventDefault(); setToolsExpanded(!toolsOpen); }}>
        <Wrench size={15} /><span>工具执行 <small>· {tools.length} 项</small></span>
        <small className={failed ? 'ai-tool-failed' : undefined}>{waitingForSite ? '等待授权' : running ? '进行中' : failed ? `${failed} 项未完成` : '已完成'}</small><CaretRight size={13} className="ai-activity-caret" />
      </summary>
      <div className="ai-tool-list">{tools.map(tool => <details key={tool.id} className={'ai-tool-detail ' + tool.status}>
        <summary><span>{tool.label}</span><small>{waitingForSite && tool.status === 'running' ? '等待授权' : toolStatus[tool.status]}</small><CaretDown size={12} className="ai-activity-caret" /></summary>
        <pre>{tool.output || (tool.status === 'running' ? '等待工具返回…' : '未返回可见结果')}</pre>
      </details>)}</div>
    </details>}
    {entry.content ? <div className="ai-bubble"><AiMarkdown text={entry.content} />{entry.streaming && <span className="ai-caret" aria-hidden="true" />}
      {entry.browserTask && !entry.streaming && <button type="button" className="ai-browser-record" onClick={() => setRecordOpen(true)}>查看操作记录<CaretRight size={13} /></button>}
    </div>
      : showTyping && entry.streaming && !(thinkingActive && entry.thinking?.trim()) && !running ? <div className="ai-typing" role="status"><i /><i /><i /><span>正在生成回复…</span></div> : null}
    {!entry.content && entry.browserTask && !entry.streaming && <button type="button" className="ai-browser-record" onClick={() => setRecordOpen(true)}>查看操作记录<CaretRight size={13} /></button>}
    {browserTask && <BrowserSiteApprovalReceipts task={browserTask} onLocate={onLocateApproval} cardId={approvalCardId} />}
    {recordOpen && entry.browserTask && <BrowserTaskRecord reference={entry.browserTask} close={() => setRecordOpen(false)} />}
  </div>;
}
