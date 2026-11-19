import type { BotActivity, BotRunActivity } from './bot-contracts';

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
