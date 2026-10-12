import { z } from 'zod';
import { workbenchForScope, type AiScope } from './ai-scope';
import type { CopySource } from './todo-contracts';

// References are read-only turn inputs, never chat identity or a write target.
// Keep the existing copy/bazi/reading wire names for saved conversations.
const referenceId = z.string().min(1, '请选择有效的参考对象').max(200)
  .regex(/^[^\s\u0000-\u001f\u007f/\\]+$/u, '参考对象 ID 无效');
export const aiReferenceSchema = z.discriminatedUnion('module', [
  z.object({ module: z.literal('todo'), taskId: referenceId }).strict(),
  z.object({ module: z.literal('copy'), draftId: referenceId }).strict(),
  z.object({ module: z.literal('bazi'), profileId: referenceId }).strict(),
  z.object({ module: z.literal('reading'), profileId: referenceId }).strict(),
]);
export type AiReference = z.infer<typeof aiReferenceSchema>;
export type AiReferenceMode = AiReference['module'];
export const aiReferencesSchema = z.array(aiReferenceSchema).max(8, '每次最多添加8个参考对象');

export function aiReferenceId(reference: AiReference): string {
  switch (reference.module) {
    case 'todo': return reference.taskId;
    case 'copy': return reference.draftId;
    default: return reference.profileId;
  }
}

export function aiReferenceKey(reference: AiReference): string {
  return `${reference.module}:${aiReferenceId(reference)}`;
}

/** The visible page, not the chat's historical module, determines the picker. */
export function aiReferenceMode(pageScope: AiScope): AiReferenceMode | null {
  if (pageScope.module !== 'workbench') return pageScope.module;
  switch (pageScope.viewId) {
    case 'home': return 'todo';
    case 'copy': case 'copy-publish': case 'media-browser': case 'workspace:media': return 'copy';
    case 'bazi': return 'bazi';
    case 'reading': return 'reading';
    default: return null;
  }
}

export function aiReferenceLimit(mode: AiReferenceMode): number {
  return mode === 'todo' || mode === 'reading' ? 1 : 8;
}

/** Server and picker share eligibility, but the server always validates again. */
export function validateAiReferences(raw: unknown, pageScope: AiScope, primaryScope: AiScope): AiReference[] {
  const references = aiReferencesSchema.parse(raw ?? []);
  if (!references.length) return references;
  const mode = aiReferenceMode(pageScope);
  if (!mode || references.some(reference => reference.module !== mode)) throw new Error('参考对象与当前页面不匹配，请重新选择');
  if (workbenchForScope(primaryScope) !== workbenchForScope(pageScope)) throw new Error('参考对象必须属于本轮协助对象的工作台');
  if (primaryScope.module !== 'workbench' && primaryScope.module !== mode) throw new Error('参考对象与本轮协助对象类型不匹配，请先切换协助对象');
  if (references.length > aiReferenceLimit(mode)) throw new Error('当前页面每次只能添加1个参考对象');
  const seen = new Set<string>();
  for (const reference of references) {
    const key = aiReferenceKey(reference);
    if (seen.has(key)) throw new Error('不能重复添加同一个参考对象');
    seen.add(key);
    if (primaryScope.module === 'copy' && reference.module === 'copy' && primaryScope.draftId === reference.draftId
      || (primaryScope.module === 'bazi' || primaryScope.module === 'reading') && reference.module === primaryScope.module && primaryScope.profileId === reference.profileId) {
      throw new Error('本轮协助对象无需重复添加为参考');
    }
  }
  return references;
}

export const aiReferenceSnapshotSchema = z.object({
  reference: aiReferenceSchema,
  key: z.string().min(1).max(210),
  name: z.string().min(1).max(200),
  capturedAt: z.iso.datetime(),
  content: z.string().min(1).max(32000),
  baziSystem: z.enum(['bazi', 'ziwei', 'astro']).optional(),
}).strict().refine(snapshot => snapshot.key === aiReferenceKey(snapshot.reference), '参考快照标识无效');
export type AiReferenceSnapshot = z.infer<typeof aiReferenceSnapshotSchema>;

export interface AiTurnContext {
  scope?: AiScope;
  pageScope?: AiScope;
  references?: AiReference[];
  baziSystem?: 'bazi' | 'ziwei' | 'astro';
  copySource?: CopySource;
}

export function describeAiReference(reference: AiReference): string {
  const labels: Record<AiReferenceMode, string> = { todo: '事项', copy: '博客', bazi: '命例', reading: '书目' };
  return `${labels[reference.module]} ${aiReferenceId(reference)}`;
}
