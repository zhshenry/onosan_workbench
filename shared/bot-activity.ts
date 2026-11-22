import type { BotActivity, BotRunActivity } from './bot-contracts';
import type { ChatEntry } from './todo-contracts';

/** Presentation only: tool execution and task status remain owned by the Host. */
export function botToolActivity(name: string): BotRunActivity {
  if (name === 'send_to_bot') return 'sending';
  if (/(^|_)(search|fetch|browse|read|grep|glob|list|recall|snapshot|screenshot|inspect|get|query)(_|$)/i.test(name)) return 'searching';
  return 'working';
}

export const botActivityLabels: Record<BotActivity, string> = {
  idle: '', queued: '排队中', thinking: '正在思考', searching: '正在查找资料', working: '正在执行',
  sending: '正在交接', replying: '正在回复', waiting_bot: '等待协作结果', waiting_user: '等待你确认',
  waiting_resource: '等待资源', interrupted: '执行已中断',
};

const toolProgressLabels: Record<string, string> = {
  ask_user: '准备补充提问',
  list_tasks: '查看待办和标签',
  propose_create: '准备待办建议',
  propose_update: '准备事项修改建议',
  propose_remove: '准备事项删除建议',
  propose_create_category: '准备标签建议',
  propose_update_category: '准备标签修改建议',
  propose_remove_category: '准备标签删除建议',
  list_resources: '查找工作区资料',
  read_resource: '读取你引用的资料',
  dashboard_read: '读取看板布局',
  dashboard_edit: '调整看板布局',
  browser_tabs: '查看工作区标签页',
  browser_navigate: '打开网页',
  browser_observe: '查看当前网页',
  browser_act: '操作当前网页',
  browser_wait: '等待页面结果',
  browser_check: '核对页面结果',
  browser_extract: '读取网页表格',
  list_bots: '查找协作 Bot',
  send_to_bot: '交接工作',
  save_artifact: '保存交付件',
  propose_schedule: '准备定时任务建议',
};

export function botReplyActivity(entry?: Pick<ChatEntry, 'tools' | 'responsePhase'>): { phase: BotRunActivity; label: string } {
  const tool = entry?.tools?.find(step => step.status === 'running');
  if (tool) {
    const phase = botToolActivity(tool.name);
    const knownLabel = Object.hasOwn(toolProgressLabels, tool.name) ? toolProgressLabels[tool.name] : undefined;
    const fallback = tool.label && tool.label !== tool.name ? tool.label : botActivityLabels[phase];
    return { phase, label: tool.progressLabel || knownLabel || fallback };
  }
  if (entry?.responsePhase === 'replying') return { phase: 'replying', label: '整理回复' };
  const hasResult = entry?.tools?.some(step => step.status === 'complete');
  return { phase: 'thinking', label: hasResult ? '整理结果' : '梳理你的要求' };
}
