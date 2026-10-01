import type { ChatSession } from './todo-contracts';
import type { ViewId, WorkbenchId } from './contracts';

export const TODO_AI_WORKBENCH_NAME = 'To-Do-List';

export type AiScope =
  | { module: 'todo' }
  | { module: 'copy'; draftId: string }
  | { module: 'bazi'; profileId: string }
  | { module: 'workbench'; viewId: string };

export function chatScope(chat: Pick<ChatSession, 'module' | 'draftId' | 'profileId' | 'viewId'>): AiScope {
  if (chat.module === 'copy' && chat.draftId) return { module: 'copy', draftId: chat.draftId };
  if (chat.module === 'bazi' && chat.profileId) return { module: 'bazi', profileId: chat.profileId };
  if (chat.module === 'workbench' && chat.viewId) return { module: 'workbench', viewId: chat.viewId };
  return { module: 'todo' }; // 旧会话没有 module，归入原来的待办会话。
}

export function aiScopeKey(scope: AiScope): string {
  switch (scope.module) {
    case 'copy': return `copy:${scope.draftId}`;
    case 'bazi': return `bazi:${scope.profileId}`;
    case 'workbench': return `workbench:${scope.viewId}`;
    default: return 'todo';
  }
}

export function sameAiScope(chat: Pick<ChatSession, 'module' | 'draftId' | 'profileId' | 'viewId'>, scope: AiScope): boolean {
  return aiScopeKey(chatScope(chat)) === aiScopeKey(scope);
}

const viewWorkbenches: Record<ViewId, WorkbenchId> = {
  home: 'home', bazi: 'life', copy: 'media', 'copy-publish': 'media', 'media-browser': 'media',
  'settings-profile': 'settings', 'settings-general': 'settings', 'settings-appearance': 'settings',
  'settings-ai': 'settings', 'settings-data': 'settings', 'settings-notifications': 'settings', 'settings-about': 'settings',
};

export function defaultAiScopeForWorkbench(workbench: WorkbenchId): AiScope | null {
  if (workbench === 'home') return { module: 'todo' };
  if (workbench === 'media' || workbench === 'life' || workbench === 'settings') return { module: 'workbench', viewId: `workspace:${workbench}` };
  return null;
}

export function workbenchForScope(scope: AiScope): WorkbenchId | null {
  if (scope.module === 'todo') return 'home';
  if (scope.module === 'copy') return 'media';
  if (scope.module === 'bazi') return 'life';
  if (scope.viewId === 'workspace:media') return 'media';
  if (scope.viewId === 'workspace:life') return 'life';
  if (scope.viewId === 'workspace:settings') return 'settings';
  return viewWorkbenches[scope.viewId as ViewId] ?? null;
}

export function sameAiWorkbench(chat: Pick<ChatSession, 'module' | 'draftId' | 'profileId' | 'viewId'>, scope: AiScope): boolean {
  const original = chatScope(chat);
  const workbench = workbenchForScope(original);
  return workbench ? workbench === workbenchForScope(scope) : aiScopeKey(original) === aiScopeKey(scope);
}

export function chatContextScope(chat: Pick<ChatSession, 'module' | 'draftId' | 'profileId' | 'viewId' | 'contextScope'>): AiScope {
  return chat.contextScope && sameAiWorkbench(chat, chat.contextScope) ? chat.contextScope : chatScope(chat);
}
