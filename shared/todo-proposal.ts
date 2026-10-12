import type { AIAction, Category, Task } from './todo-contracts';

export interface ProposalField { label: string; before: string; after: string; }
export interface ProposalPreview { title: string; verb: string; fields: ProposalField[]; warning?: string; }
export interface ProposalReceipt { appliedIndices: number[]; appliedCount: number; }
const labels: Record<string, string> = {
  title: '事项名称', kind: '事项类型', status: '状态', priority: '优先级', plannedDate: '计划日期',
  dueAt: '截止时间', endAt: '结束时间', remindAt: '提醒时间', categoryId: '标签', progress: '进度', note: '备注', name: '标签名称', color: '标签颜色',
};
const values: Record<string, string> = { task: '待办', meeting: '日程', todo: '待办', doing: '进行中', done: '已完成', high: '高', medium: '中', low: '低' };
function display(key: string, value: unknown, categories: Map<string, string>): string {
  if (value === undefined || value === null || value === '') return '未设置';
  if (key === 'categoryId') return categories.get(String(value)) ?? '标签不可用';
  if (['kind', 'status', 'priority'].includes(key)) return values[String(value)] ?? '未知';
  if (key === 'progress') return `${value}%`;
  if (['dueAt', 'endAt', 'remindAt'].includes(key)) {
    const date = new Date(String(value));
    if (!Number.isFinite(date.getTime())) return '时间无效';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  return String(value);
}
/** Called with the exact data used to generate the proposal, never the model's prose. */
export function previewTodoActions(actions: AIAction[], tasks: Task[], categories: Category[]): ProposalPreview[] {
  const names = new Map(categories.map(category => [category.id, category.name]));
  const proposedNames = new Map(names);
  for (const action of actions) if (action.type === 'create_category') proposedNames.set(action.category.id, action.category.name);
  const fields = (patch: object, before: object | undefined, meeting = false): ProposalField[] => Object.entries(patch).map(([key, value]) => ({
    label: key === 'categoryId' ? '标签（建议生成时名称）' : key === 'dueAt' && meeting ? '开始时间' : labels[key] ?? '字段',
    before: before ? display(key, (before as Record<string, unknown>)[key], names) : '无原始快照',
    after: display(key, value, proposedNames),
  }));
  return actions.map(action => {
    switch (action.type) {
      case 'create': return { title: action.task.title, verb: action.task.kind === 'meeting' ? '新增日程' : '新增待办', fields: fields(action.task, {}, action.task.kind === 'meeting') };
      case 'update': {
        const task = tasks.find(task => task.id === action.id);
        return { title: task?.title ?? '事项不可用', verb: '修改事项', fields: fields(action.patch, task, (action.patch.kind ?? task?.kind) === 'meeting') };
      }
      case 'remove': return { title: tasks.find(task => task.id === action.id)?.title ?? '事项不可用', verb: '删除事项', fields: [], warning: '此操作将删除该事项，请确认后再应用。' };
      case 'create_category': return { title: action.category.name, verb: '新增标签', fields: fields({ name: action.category.name, color: action.category.color }, {}) };
      case 'update_category': {
        const category = categories.find(category => category.id === action.id);
        return { title: category?.name ?? '标签不可用', verb: '修改标签', fields: fields(action.patch, category) };
      }
      case 'remove_category': return { title: categories.find(category => category.id === action.id)?.name ?? '标签不可用', verb: '删除标签', fields: [], warning: '此操作将删除标签，并解除事项与该标签的关联。' };
    }
  });
}
