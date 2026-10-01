import type { AiModuleContribution } from '../electron/ai-core';
import { workbenchForScope, type AiScope } from '../shared/ai-scope';

const workbenchNames = { home: '首页', media: '自媒体工作台', game: '游戏工作台', web: '网页工作台', life: '小工具', settings: '设置' } as const;
const pageNames: Record<string, string> = {
  home: '今日概览', bazi: '命理', copy: '博客编辑', 'copy-publish': '图文发布', 'media-browser': '素材浏览器',
  'settings-profile': '个人资料', 'settings-general': '通用', 'settings-appearance': '外观', 'settings-ai': 'AI 助手',
  'settings-data': '待办与数据', 'settings-notifications': '通知', 'settings-about': '关于',
};

export function describeAiScope(scope: AiScope): string {
  if (scope.module === 'copy') return `博客草稿（ID ${scope.draftId}）`;
  if (scope.module === 'bazi') return `命例（ID ${scope.profileId}）`;
  if (scope.module === 'todo') return '待办与日程';
  if (scope.viewId.startsWith('workspace:')) {
    const workbench = workbenchForScope(scope);
    if (workbench) return `工作台「${workbenchNames[workbench]}」`;
  }
  return `页面「${pageNames[scope.viewId] ?? scope.viewId}」`;
}

export function withWorkbenchContext(contribution: AiModuleContribution, scope: AiScope, objectName?: string, pageScope: AiScope = scope): AiModuleContribution {
  const workbench = workbenchForScope(scope);
  const workspaceOnly = scope.module === 'workbench' && scope.viewId.startsWith('workspace:');
  const pageIsWorkspaceOnly = pageScope.module === 'workbench' && pageScope.viewId.startsWith('workspace:');
  const location = workspaceOnly ? describeAiScope(scope) : `${workbench ? workbenchNames[workbench] : '工作台'} / ${describeAiScope(scope)}${objectName ? ` / ${objectName}` : ''}`;
  const pageKind = pageIsWorkspaceOnly ? '工作台范围' : '页面';
  const page = `用户明确关联的${pageKind}：${describeAiScope(pageScope)}。${pageScope.module === 'workbench' ? `此${pageIsWorkspaceOnly ? '范围' : '页面'}没有提供业务数据或专用工具，不要声称已读取其内容。` : ''}`;
  return {
    ...contribution,
    systemPrompt: now => `这条对话按工作台归类，可在同一工作台的不同页面继续。当前这一轮的业务对象：${location}。${page}历史对话可用于延续话题，但当前可核实的业务数据和可用工具仅限本轮提供的内容；历史消息可能关联其他页面或对象，不要把历史对象当成本轮对象，也不要声称已读取未提供的页面内容。写入建议只能针对当前工具明确指定的对象，仍需用户确认。\n\n${contribution.systemPrompt(now)}`,
  };
}

export function buildWorkbenchContribution(viewId: string): AiModuleContribution {
  const workspaceOnly = viewId.startsWith('workspace:');
  return {
    toolNames: [], labels: {}, buildTools: () => [],
    systemPrompt: () => `你是 Ono Workbench 的通用助手。当前关联${describeAiScope({ module: 'workbench', viewId })}。只回答用户的问题和工作台使用上的一般问题；你没有${workspaceOnly ? '具体页面或业务对象的' : '此页面的'}业务数据或写入工具，不要声称已经查看或修改其内容。`,
  };
}
