import { memo, useMemo, useState, type MouseEvent } from 'react';
import { CaretDown, Brain, Wrench } from '@phosphor-icons/react';
import type { ChatEntry } from '../../shared/todo-contracts';
import { renderAiMarkdown } from '../ai-markdown';
import { errorText } from '../../modules/todo/ui/ui';

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

export function AiResponse({ entry }: { entry: ChatEntry }) {
  const [thinkingExpanded, setThinkingExpanded] = useState<boolean | null>(null);
  const [toolsExpanded, setToolsExpanded] = useState<boolean | null>(null);
  const thinkingActive = Boolean(entry.streaming && entry.thinkingActive);
  const tools = entry.tools ?? [];
  const running = tools.some(tool => tool.status === 'running');
  const failed = tools.filter(tool => tool.status === 'error' || tool.status === 'interrupted').length;
  const thinkingOpen = thinkingExpanded ?? thinkingActive;
  const toolsOpen = toolsExpanded ?? running;
  return <div className="ai-response">
    {entry.thinking?.trim() && <details className="ai-activity ai-thinking" open={thinkingOpen}>
      <summary onClick={event => { event.preventDefault(); setThinkingExpanded(!thinkingOpen); }}>
        <Brain size={15} /><span>思考过程</span>
        <small>{thinkingActive ? '思考中' : entry.error ? '已停止' : '已结束'}</small><CaretDown size={13} className="ai-activity-caret" />
      </summary>
      <div className="ai-thinking-body"><AiMarkdown text={entry.thinking} /></div>
    </details>}
    {tools.length > 0 && <details className="ai-activity" open={toolsOpen}>
      <summary onClick={event => { event.preventDefault(); setToolsExpanded(!toolsOpen); }}>
        <Wrench size={15} /><span>工具执行 <small>· {tools.length} 项</small></span>
        <small className={failed ? 'ai-tool-failed' : undefined}>{running ? '进行中' : failed ? `${failed} 项未完成` : '已完成'}</small><CaretDown size={13} className="ai-activity-caret" />
      </summary>
      <div className="ai-tool-list">{tools.map(tool => <details key={tool.id} className={'ai-tool-detail ' + tool.status}>
        <summary><span>{tool.label}</span><small>{toolStatus[tool.status]}</small><CaretDown size={12} className="ai-activity-caret" /></summary>
        <pre>{tool.output || (tool.status === 'running' ? '等待工具返回…' : '未返回可见结果')}</pre>
      </details>)}</div>
    </details>}
    {entry.content ? <div className="ai-bubble"><AiMarkdown text={entry.content} />{entry.streaming && <span className="ai-caret" aria-hidden="true" />}</div>
      : entry.streaming && !(thinkingActive && entry.thinking?.trim()) && !running ? <div className="ai-typing" role="status"><i /><i /><i /><span>正在生成回复…</span></div> : null}
  </div>;
}
