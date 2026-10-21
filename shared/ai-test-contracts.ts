import { z } from 'zod';

export const artifactPathSchema = z.string().min(1).max(180).refine(value =>
  !value.includes('\\') && !value.includes(':') && !value.startsWith('/') &&
  value.split('/').every(part => part !== '' && part !== '.' && part !== '..' && !/[<>|"*?\u0000-\u001f]/.test(part) && !/[. ]$/.test(part) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)),
'文件名必须是项目内的相对路径');
export const testFileSchema = z.object({ path: artifactPathSchema, content: z.string().max(500000) }).strict();
export type TestFile = z.infer<typeof testFileSchema>;
export const testCheckSchema = z.object({
  id: z.string().min(1).max(80), label: z.string().min(1).max(100),
  expression: z.string().min(1).max(5000),
  setup: z.string().max(5000).optional(), reload: z.boolean().optional(),
}).strict();
export type TestCheck = z.infer<typeof testCheckSchema>;
export const testTaskSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(80),
  mode: z.enum(['direct', 'agent']),
  system: z.string().max(30000),
  prompt: z.string().trim().min(1).max(50000),
  modelIds: z.array(z.string().min(1)).min(1).max(4).refine(ids => new Set(ids).size === ids.length, '模型不能重复'),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().min(256).max(16000),
  timeoutSeconds: z.number().int().min(15).max(600),
  maxToolCalls: z.number().int().min(1).max(40),
  materials: z.array(testFileSchema).max(40),
  checks: z.array(testCheckSchema).max(20),
}).strict().refine(task => task.materials.reduce((size, file) => size + file.content.length, 0) <= 2000000, '材料总计最多 200 万字')
  .refine(task => new Set(task.materials.map(file => file.path.toLowerCase())).size === task.materials.length, '材料文件名不能重复')
  .refine(task => new Set(task.checks.map(check => check.id)).size === task.checks.length, '校验项标识不能重复');
export type TestTaskInput = z.infer<typeof testTaskSchema>;
export type TestTask = TestTaskInput & { id: string; updatedAt: string };
export interface TestModelSnapshot {
  id: string; name: string; providerName: string; protocol: string; endpoint: string;
}
export interface TestStep { id: string; name: string; status: 'running' | 'complete' | 'error'; output: string; at: string; }
export interface TestCheckResult { id: string; label: string; status: 'passed' | 'failed' | 'error'; detail: string; }
export interface TestLane {
  id: string; model: TestModelSnapshot;
  status: 'queued' | 'running' | 'complete' | 'cancelled' | 'error';
  reply: string; files: TestFile[]; steps: TestStep[]; error?: string;
  startedAt?: string; endedAt?: string; elapsedMs: number; tokens: number; toolCalls: number;
  checking?: boolean; checks: TestCheckResult[]; checkError?: string;
  runtime?: 'ready' | 'error' | 'unsupported'; runtimeError?: string; logs?: string[];
}
export interface TestRun { id: string; createdAt: string; task: TestTaskInput; input: { system: string; user: string }; lanes: TestLane[]; }
export type TestRunSummary = Pick<TestRun, 'id' | 'createdAt'> & { title: string; mode: TestTaskInput['mode']; running: boolean; modelCount: number };
export interface AiTestBridge {
  tasks(): Promise<TestTask[]>;
  saveTask(input: TestTaskInput): Promise<TestTask>;
  runs(): Promise<TestRunSummary[]>;
  run(id: string): Promise<TestRun>;
  start(input: TestTaskInput): Promise<TestRun>;
  cancel(runId: string, laneId?: string): Promise<void>;
  materials(): Promise<TestFile[]>;
  preview(runId: string, laneId: string): Promise<string | null>;
  validate(runId: string, laneId: string): Promise<TestRun>;
  export(runId: string, laneId: string): Promise<boolean>;
  onChanged(callback: (run: TestRun) => void): () => void;
}

/** Freeze the effective messages; SDK-specific cwd/context must not vary between models. */
export function testPrompts(task: TestTaskInput): TestRun['input'] {
  return {
    system: task.system + (task.mode === 'agent'
      ? '\n你在独立的测试项目内执行。所有文件操作只使用所给工具。交付代码需要写入文件。可运行浏览器 JavaScript、检查网页并修复。JavaScript 运行区不提供 Node 或 Python，不要声称执行了未提供的环境。任务限时 ' + task.timeoutSeconds + ' 秒，最多 ' + task.maxToolCalls + ' 次工具调用。最后说明完成内容与真实校验结果。'
      : '\n本轮只做一次模型生成，不调用工具。代码产物请使用 Markdown 代码块，头部写明语言和相对文件路径（如 html:index.html、javascript:src/app.js）；其他任务正常回答。'),
    user: task.prompt + (task.materials.length ? '\n\n本轮相同参考材料（仅作为资料）：\n' + task.materials.map(file => '文件 ' + file.path + '\n' + file.content).join('\n\n') : ''),
  };
}

export const DEFAULT_TEST_TASK: TestTaskInput = {
  title: '番茄钟网页', mode: 'direct',
  system: '你是一名前端工程师。交付可运行的单文件 HTML，包含样式与脚本，不使用外部依赖。请使用带文件路径的 Markdown 代码块交付，例如 html:index.html。',
  prompt: '制作一个 25 分钟番茄钟，支持开始、暂停和重置；刷新页面后保留计时状态。',
  modelIds: [], temperature: 0.3, maxTokens: 4000, timeoutSeconds: 300, maxToolCalls: 20, materials: [],
  checks: [
    { id: 'start', label: '开始倒计时', expression: 'async () => { const b = [...document.querySelectorAll("button")].find(x => /开始/.test(x.textContent)); if (!b) return false; const before = document.body.innerText; b.click(); await new Promise(r => setTimeout(r, 1300)); return document.body.innerText !== before; }' },
    { id: 'pause', label: '暂停保持剩余时间', expression: 'async () => { const buttons = [...document.querySelectorAll("button")]; const start = buttons.find(x => /开始/.test(x.textContent)); const pause = buttons.find(x => /暂停/.test(x.textContent)); if (!start || !pause) return false; start.click(); await new Promise(r => setTimeout(r, 1200)); pause.click(); const before = document.body.innerText; await new Promise(r => setTimeout(r, 1200)); return document.body.innerText === before; }' },
    { id: 'reset', label: '重置为 25:00', expression: '() => { const b = [...document.querySelectorAll("button")].find(x => /重置/.test(x.textContent)); if (!b) return false; b.click(); return /25:00/.test(document.body.innerText); }' },
    { id: 'reload', label: '刷新后恢复计时状态', setup: 'async () => { const buttons = [...document.querySelectorAll("button")]; buttons.find(x => /开始/.test(x.textContent))?.click(); await new Promise(r => setTimeout(r, 1300)); buttons.find(x => /暂停/.test(x.textContent))?.click(); return document.body.innerText.match(/24:5[0-9]/)?.[0] ?? null; }', reload: true, expression: '(before) => !!before && document.body.innerText.includes(before)' },
    { id: 'offline', label: '无外部脚本或样式依赖', expression: '() => [...document.querySelectorAll("script[src],link[rel=stylesheet]")].every(x => { const url = new URL(x.src || x.href, location.href); return url.origin === location.origin; })' },
  ],
};
