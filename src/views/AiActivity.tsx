import { Browser, Pause, Question, ShieldCheck, Sparkle, SpinnerGap, Wrench } from '@phosphor-icons/react';
import type { ChatEntry } from '../../shared/todo-contracts';
import type { BrowserTask } from '../../shared/browser-automation-contracts';

export function AiActivity({ entry, browserTask, question }: { entry?: ChatEntry; browserTask?: BrowserTask; question: boolean }) {
  if (!entry?.streaming) return null;
  const tool = entry.tools?.find(tool => tool.status === 'running');
  let phase = 'waiting', label = '等待模型', detail = entry.tools?.length ? '正在思考下一步操作…' : '正在理解你的请求…', Icon = SpinnerGap;
  if (question) { phase = 'question'; label = '等待回答'; detail = '请回答上方问题后继续'; Icon = Question; }
  else if (browserTask?.status === 'site-approval') { phase = 'approval'; label = '等待授权'; detail = '需要允许访问此站点'; Icon = ShieldCheck; }
  else if (browserTask?.status === 'paused') { phase = 'paused'; label = '已暂停'; detail = '可在浏览器任务栏继续操作'; Icon = Pause; }
  else if (tool) { phase = 'tool'; label = tool.name.startsWith('browser_') ? '操作网页' : '执行工具'; detail = tool.name === 'browser_tabs' ? '正在处理浏览器标签…' : `正在${tool.label}…`; Icon = tool.name.startsWith('browser_') ? Browser : Wrench; }
  else if (entry.responsePhase === 'replying' || !entry.responsePhase && entry.content.trim()) { phase = 'replying'; label = '整理回复'; detail = entry.browserTask ? '正在汇总页面结果…' : '正在生成回复…'; Icon = Sparkle; }
  return <div className="ai-run-status" data-phase={phase} role="status" aria-live="polite" aria-atomic="true">
    <Icon size={18} aria-hidden="true" className={phase === 'waiting' ? 'ai-run-spinner' : undefined} />
    <strong>{label}</strong><span title={detail}>{detail}</span>
  </div>;
}
