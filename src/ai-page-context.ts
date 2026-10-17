import type { ViewId } from '../shared/contracts';
import { TODO_AI_WORKBENCH_NAME, type AiScope } from '../shared/ai-scope';
import { workbenchAiContext } from './nav';

export interface PageAiSelection {
  copy: { id: string; title: string } | null;
  bazi: { id: string; name: string; system: 'bazi' | 'ziwei' | 'astro' } | null;
  reading: { id: string; title: string } | null;
}

export interface PageAiContext {
  scope: AiScope;
  label: string;
  object: string;
  baziSystem?: 'bazi' | 'ziwei' | 'astro';
}

/** 还没选中博客或命例时，对象行保留空态，不用子页名假装已经选中。 */
const unselectedObject: Partial<Record<ViewId, string>> = {
  copy: '尚未选择博客',
  bazi: '尚未选择命例',
};

/** 当前页面交给助手卡片的上下文。待办、已选博客、命例和书目继续用各自的专用名称。 */
export function pageAiContext(view: ViewId, selection: PageAiSelection): PageAiContext {
  if (view === 'home') return { scope: { module: 'todo' }, label: '待办与日程', object: TODO_AI_WORKBENCH_NAME };
  if (view === 'copy' && selection.copy) {
    return { scope: { module: 'copy', draftId: selection.copy.id }, label: '博客编辑', object: selection.copy.title || '未命名博客' };
  }
  if (view === 'bazi' && selection.bazi) {
    return {
      scope: { module: 'bazi', profileId: selection.bazi.id },
      label: '命理解读',
      object: selection.bazi.name,
      baziSystem: selection.bazi.system,
    };
  }
  if (view === 'reading' && selection.reading) {
    return { scope: { module: 'reading', profileId: selection.reading.id }, label: '阅读助手', object: selection.reading.title };
  }
  const page = workbenchAiContext(view);
  return { scope: { module: 'workbench', viewId: view }, label: page.label, object: unselectedObject[view] ?? page.object };
}
