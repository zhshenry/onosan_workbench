import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager, defineTool } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { ZodError } from 'zod';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { piApi, assistantText, mapAiError } from './ai-core';
import { scopedFile, readTestFiles, writeTestFile, extractTestFiles, entryFile } from './ai-test-artifacts';
import { AiTestBrowser } from './ai-test-browser';
import type { AIProtocol } from '../shared/todo-contracts';
import type { TestTaskInput, TestLane, TestModelSnapshot } from '../shared/ai-test-contracts';
import { testPrompts } from '../shared/ai-test-contracts';

export interface TestConnection extends TestModelSnapshot { key: string; protocol: AIProtocol; }
export async function executeTestLane(task: TestTaskInput, connection: TestConnection, lane: TestLane, root: string, controller: AbortController, changed: () => void): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), 'ono-ai-test-'));
  const browser = new AiTestBrowser(lane.id, root);
  const signal = controller.signal;
  const started = Date.now();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false, limitReached = false;
  let session: Awaited<ReturnType<typeof createAgentSession>>['session'] | undefined;
  let unsubscribe: (() => void) | undefined;
  const abort = () => { void session?.abort(); browser.close(); };
  const updateFiles = () => { lane.files = readTestFiles(root); };
  try {
    signal.throwIfAborted();
    lane.status = 'running'; lane.startedAt = new Date().toISOString(); changed();
    for (const file of task.materials) writeTestFile(root, file);
    updateFiles();
    timeout = setTimeout(() => { timedOut = true; controller.abort(); }, task.timeoutSeconds * 1000);
    signal.addEventListener('abort', abort, { once: true });
    const tool = (name: string, label: string, description: string, parameters: any, run: (params: any) => Promise<unknown> | unknown) => defineTool({
      name, label, description, parameters, executionMode: 'sequential',
      execute: async (_id, params) => {
        signal.throwIfAborted();
        if (lane.toolCalls >= task.maxToolCalls) { limitReached = true; controller.abort(); throw new Error('达到工具调用上限'); }
        lane.toolCalls++;
        const value = await run(params);
        signal.throwIfAborted();
        changed();
        return { content: [{ type: 'text' as const, text: JSON.stringify(value).slice(0, 24000) }], details: {} };
      },
    });
    const tools = task.mode === 'direct' ? [] : [
      tool('list_files', '列出项目文件', '列出本模型独立项目副本中的文件。', Type.Object({}), () => readTestFiles(root).map(file => ({ path: file.path, characters: file.content.length }))),
      tool('read_file', '读取项目文件', '只读取本项目相对路径的 UTF-8 文件。', Type.Object({ path: Type.String() }), params => readFileSync(scopedFile(root, params.path), 'utf8').slice(0, 100000)),
      tool('write_file', '写入项目文件', '新建或替换本项目文件。修改会使已有校验证据过期。单文件最多 1MB。', Type.Object({ path: Type.String(), content: Type.String() }), params => {
        writeTestFile(root, { path: params.path, content: params.content }); updateFiles(); browser.close(); lane.checks = []; lane.checkError = undefined; lane.runtime = undefined; return { written: params.path };
      }),
      tool('inspect_preview', '观察网页产物', '加载当前 HTML 入口，返回页面文本和控件。每次调用会重新加载当前文件。', Type.Object({}), () => browser.inspect(readTestFiles(root), signal)),
      tool('browser_action', '操作网页产物', '在已观察的网页中使用唯一 CSS 选择器点击或填写控件。', Type.Object({ selector: Type.String(), operation: Type.Union([Type.Literal('click'), Type.Literal('fill')]), value: Type.Optional(Type.String()) }), params => browser.action(params.selector, params.operation, params.value ?? '', signal)),
      tool('run_javascript', '运行 JavaScript', '在隔离网页中运行 JavaScript 函数体，返回其 return 值。运行环境是浏览器，不提供 Node、Python 或本机文件接口。', Type.Object({ code: Type.String() }), async params => {
        await browser.load(readTestFiles(root), signal);
        return browser.evaluate('async () => {' + params.code + '\n}', signal);
      }),
      tool('run_checks', '运行统一校验', '对当前网页执行用户预先定义的全部断言。不能更改断言或把未运行标为通过。', Type.Object({}), async () => {
        lane.checks = await browser.checks(readTestFiles(root), task.checks, signal);
        return lane.checks;
      }),
    ];
    const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } });
    const input = testPrompts(task);
    const loader = new DefaultResourceLoader({ cwd: workspace, agentDir: workspace, settingsManager, noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true, systemPromptOverride: () => input.system });
    await loader.reload();
    const runtime = await ModelRuntime.create({ authPath: join(workspace, 'auth.json'), modelsPath: null, modelsStorePath: join(workspace, 'models.json'), allowModelNetwork: false, refreshOnCreate: false, signal });
    runtime.registerProvider('ai-test', {
      name: connection.providerName, baseUrl: connection.endpoint, api: piApi(connection.protocol), apiKey: connection.key || 'local', authHeader: connection.protocol !== 'anthropic',
      models: [{ id: connection.name, name: connection.name, reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: task.maxTokens, compat: { supportsDeveloperRole: false, supportsReasoningEffort: false } }],
    });
    await runtime.setRuntimeApiKey('ai-test', connection.key || 'local');
    const model = runtime.getModel('ai-test', connection.name);
    if (!model) throw new Error('无法创建模型会话');
    session = (await createAgentSession({ cwd: workspace, agentDir: workspace, model, modelRuntime: runtime, settingsManager, resourceLoader: loader, thinkingLevel: 'off', sessionManager: SessionManager.inMemory(workspace), noTools: 'builtin', customTools: tools, tools: tools.map(value => value.name) })).session;
    session.agent.streamFunction = (current, context, options) => runtime.streamSimple(current, { ...context, systemPrompt: input.system }, { ...options, temperature: task.temperature, maxTokens: task.maxTokens, maxRetries: 0, signal });
    unsubscribe = session.subscribe(event => {
      if (event.type === 'message_update' && event.message.role === 'assistant') { lane.reply = assistantText(event.message).slice(0, 250000); changed(); }
      if (event.type === 'tool_execution_start') {
        lane.steps.push({ id: event.toolCallId, name: tools.find(value => value.name === event.toolName)?.label ?? event.toolName, status: 'running', output: '', at: new Date().toISOString() }); changed();
      }
      if (event.type === 'tool_execution_end') {
        const step = lane.steps.find(item => item.id === event.toolCallId);
        if (step) { step.status = event.isError ? 'error' : 'complete'; step.output = event.result?.content?.filter((part: any) => part.type === 'text').map((part: any) => part.text).join('\n').slice(0, 20000) ?? ''; } changed();
      }
    });
    await session.prompt(input.user);
    signal.throwIfAborted();
    const messages = session.state.messages.filter(message => message.role === 'assistant');
    const last = messages.at(-1);
    if (last && 'stopReason' in last && ['error', 'aborted'].includes(last.stopReason)) throw new Error(('errorMessage' in last && typeof last.errorMessage === 'string' && last.errorMessage) || '模型未完成回复');
    if (last && 'stopReason' in last && last.stopReason === 'length') throw new Error('达到单次输出上限，回复可能不完整');
    lane.reply = messages.map(assistantText).filter(Boolean).join('\n\n').slice(0, 250000);
    lane.tokens = messages.reduce((total, message) => total + ('usage' in message ? message.usage.totalTokens ?? 0 : 0), 0);
    if (task.mode === 'direct' || lane.toolCalls === 0) {
      for (const file of extractTestFiles(lane.reply)) writeTestFile(root, file);
    }
    updateFiles();
    if (!lane.reply.trim() && lane.toolCalls === 0) throw new Error('模型没有返回可用内容');
    if (entryFile(lane.files)) {
      try { await browser.probe(lane.files, signal); lane.runtime = 'ready'; }
      catch (error) { signal.throwIfAborted(); lane.runtime = 'error'; lane.runtimeError = error instanceof Error ? error.message : '网页无法加载'; }
    } else lane.runtime = 'unsupported';
    lane.status = 'complete';
  } catch (error) {
    lane.status = signal.aborted && !timedOut && !limitReached ? 'cancelled' : 'error';
    lane.error = timedOut ? '达到本次测试的时间上限' : limitReached ? '达到本次测试的工具调用上限' : signal.aborted ? '已停止，已生成的内容保留'
      : error instanceof ZodError ? '生成文件的路径或内容不符合限制，原始回复已保留'
      : error instanceof Error && /生成文件|单个文件|产物超出|单次输出上限|没有返回可用内容/.test(error.message) ? error.message : mapAiError(error, signal).message;
    try { updateFiles(); } catch { /* Preserve the last bounded artifact snapshot. */ }
  } finally {
    clearTimeout(timeout); signal.removeEventListener('abort', abort); unsubscribe?.(); session?.dispose(); lane.logs = browser.logs; browser.close();
    lane.elapsedMs = Date.now() - started; lane.endedAt = new Date().toISOString();
    for (const step of lane.steps) if (step.status === 'running') step.status = 'error';
    rmSync(workspace, { recursive: true, force: true }); changed();
  }
}
