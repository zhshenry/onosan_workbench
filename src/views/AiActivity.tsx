import { ArrowLineDown, Circle, Pause, Question, ShieldCheck } from '@phosphor-icons/react';
import type { ChatEntry } from '../../shared/todo-contracts';
import type { BrowserTask } from '../../shared/browser-automation-contracts';

export function AiActivity({ entry, browserTask, question, aboveBottom, onJump }: { entry?: ChatEntry; browserTask?: BrowserTask; question: boolean; aboveBottom: boolean; onJump(): void }) {
  const busy = !!entry?.streaming, visible = busy || aboveBottom;
  const tool = entry?.tools?.find(tool => tool.status === 'running');
  let phase = 'waiting', label = 'AI 处理中', detail = entry?.tools?.length ? '正在思考下一步操作…' : '正在理解你的请求…', Icon = Circle;
  if (question) { phase = 'question'; label = '待你回答'; detail = '请回答上方问题后继续'; Icon = Question; }
  else if (browserTask?.status === 'site-approval') { phase = 'approval'; label = '待你授权'; detail = '需要允许访问此站点'; Icon = ShieldCheck; }
  else if (browserTask?.status === 'paused') { phase = 'paused'; label = '已暂停'; detail = '可在浏览器任务栏继续操作'; Icon = Pause; }
  else if (tool) { phase = 'tool'; label = 'AI 操作中'; detail = tool.name === 'browser_tabs' ? '正在处理浏览器标签…' : `正在${tool.label}…`; }
  else if (entry?.responsePhase === 'replying' || entry && !entry.responsePhase && entry.content.trim()) { phase = 'replying'; detail = entry.browserTask ? '正在汇总页面结果…' : '正在生成回复…'; }
  return <div className="ai-run-controls" data-visible={visible} aria-hidden={!visible} inert={!visible}>
    <div className="ai-run-slot" data-visible={busy} aria-hidden={!busy} inert={!busy}>
      <div className="ai-run-slot-clip">
        <div className="ai-run-status" data-phase={phase} role="status" aria-live="polite" aria-atomic="true" aria-label={`${label}，${detail}`} title={detail}>
          <Icon size={Icon === Circle ? 8 : 16} weight={Icon === Circle ? 'fill' : 'regular'} aria-hidden="true" className={Icon === Circle ? 'ai-run-dot' : undefined} /><strong>{label}</strong>
        </div>
      </div>
    </div>
    <div className="ai-run-slot" data-visible={aboveBottom} aria-hidden={!aboveBottom} inert={!aboveBottom}>
      <div className="ai-run-slot-clip">
        <button type="button" className="ai-jump-latest" title="回到底端并跟随新回复" onClick={onJump}><ArrowLineDown size={17} aria-hidden="true" />回到底端</button>
      </div>
    </div>
  </div>;
}
