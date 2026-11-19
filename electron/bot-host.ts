import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { botSeeds, draftValueSchema, terminalTask, type BotAction, type BotArtifact, type BotChanged, type BotDraftValue, type BotHostState, type BotMessage, type BotProfile, type BotResourceRef, type BotSubmit, type BotTask } from '../shared/bot-contracts';
import { BotError, BotStore, legacyBotOwner, payloadHash } from './bot-store';
import type { BotRunActivity } from '../shared/bot-contracts';

export interface BotExecutor {
  run(task: BotTask, host: BotHost, signal: AbortSignal): Promise<{ reply: string }>;
  apply(action: BotAction, answer: { approved?: boolean; indices?: number[]; text?: string }): Promise<unknown>;
  undo?(action: BotAction): Promise<unknown>;
  validateSubmission?(input: BotSubmit): void;
  redirect?(taskId: string): void;
}
const stamp = () => new Date().toISOString();
type Surface = { id: string; kind: 'main' | 'island' };
/** One host owns execution; each UI surface keeps its own versioned draft. */
export class BotHost extends EventEmitter {
  private readonly active = new Map<string, AbortController>();
  private readonly resourceWaits = new Set<string>();
  private runningIds(): string[] { return [...this.active.keys()].filter(id => !this.resourceWaits.has(id)); }
  waitForResourceApproval(id: string): void {
    const task = this.store.task(id); if (!this.active.has(id) || task.status !== 'running') return;
    this.resourceWaits.add(id); this.store.updateTask(id, { status: 'waiting_user', reason: '等待浏览器站点授权或继续操作' }); this.changed({ kind: 'task', botId: task.botId, taskId: id }); this.wake();
  }
  async resumeResourceExecution(id: string): Promise<void> {
    if (!this.resourceWaits.has(id)) return;
    while (this.resourceWaits.has(id)) {
      const task = this.store.task(id);
      if (this.stopping || this.suspended || terminalTask(task.status) || !this.active.has(id)) throw new BotError('RESOURCE_OFFLINE', '浏览器执行已停止');
      const running = this.runningIds();
      if (running.length < 2 && !running.some(other => this.store.task(other).botId === task.botId)) { this.resourceWaits.delete(id); this.store.updateTask(id, { status: 'running', reason: undefined }); this.changed({ kind: 'task', botId: task.botId, taskId: id }); return; }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  private timer?: ReturnType<typeof setInterval>;
  private pumping = false;
  private stopping = false;
  private suspended = false;
  readonly workerId = randomUUID();
  readonly startedAt = stamp();
  constructor(readonly store: BotStore, private readonly executor: BotExecutor, private readonly clock = Date.now) { super(); }
  changed(event: BotChanged): void {
    this.emit('changed', event);
    if (event.taskId && ['task', 'artifact'].includes(event.kind)) {
      const task = this.store.task(event.taskId);
      if (task.rootTaskId !== task.id) {
        const root = this.store.task(task.rootTaskId);
        this.emit('changed', { ...event, botId: root.botId, chatId: root.chatId, taskId: root.id });
      }
    }
  }
  activity(taskId: string, activity: BotRunActivity): void {
    if (this.store.setActivity(taskId, activity)) this.changed({ kind: 'activity', taskId, botId: this.store.task(taskId).botId });
  }
  private assertSurface(chatId: string, surface: Surface): void {
    const link = this.store.link(chatId);
    if (!link || link.role !== 'main') throw new BotError('HISTORY_READ_ONLY', '历史对话仅供查阅');
    if (surface.kind === 'island' && this.store.profile(link.bot_id!).seedKey !== 'coordinator') throw new BotError('SURFACE_FORBIDDEN', '灵动岛只连接总 Bot');
  }
  getDraft(chatId: string, surface: Surface) {
    this.assertSurface(chatId, surface);
    return this.store.draft(chatId, surface.kind);
  }
  saveDraft(chatId: string, revision: number, value: BotDraftValue, surface: Surface) {
    this.assertSurface(chatId, surface);
    const draft = this.store.saveDraft(chatId, revision, draftValueSchema.parse(value), surface.kind);
    this.changed({ kind: 'draft', chatId, draftSurface: surface.kind, revision: draft.revision }); return draft;
  }
  submit(input: BotSubmit, surface: Surface) {
    const started = performance.now();
    this.assertSurface(input.chatId, surface);
    this.validateContext(input.botId, input.pageContext, input.resources);
    if (input.target && this.resourceWaits.has(input.target.taskId)) throw new BotError('TASK_BUSY', '浏览器步骤仍在等待授权，请先完成或取消该步骤后补充');
    const receipt = this.store.submit(input, () => this.executor.validateSubmission?.(input), surface.kind);
    if (receipt.disposition === 'amended' && !receipt.duplicate) this.executor.redirect?.(receipt.task.id);
    this.emit('metric', { stage: 'accept', milliseconds: performance.now() - started, requestId: input.clientRequestId, taskId: receipt.task.id, rootTaskId: receipt.task.rootTaskId });
    this.changed({ kind: 'draft', chatId: input.chatId, draftSurface: surface.kind, revision: receipt.draft.revision });
    this.changed({ kind: 'task', botId: input.botId, taskId: receipt.task.id, chatId: input.chatId });
    this.changed({ kind: 'chat', botId: input.botId, chatId: input.chatId });
    this.wake(); return receipt;
  }
  submissionStatus(input: BotSubmit, surface: Surface, dataEpoch?: string) {
    this.assertSurface(input.chatId, surface);
    if (this.store.profile(input.botId).mainChatId !== input.chatId) throw new BotError('WRONG_BOT', '对话不属于当前 Bot');
    return this.store.submissionStatus(input, surface.kind, dataEpoch);
  }
  validateContext(botId: string, context: BotTask['context'] | undefined, resources: BotResourceRef[]): void {
    const bot = this.store.profile(botId);
    for (const scope of [context?.scope, context?.pageScope]) if (scope) {
      const owner = legacyBotOwner(scope);
      if (owner.key !== bot.seedKey) throw new BotError('SCOPE_FORBIDDEN', '当前页面不属于这个 Bot，请切换负责人后发送');
    }
    for (const ref of resources) {
      const owner = ref.kind === 'todo' ? 'schedule' : ref.kind === 'copy' ? 'media' : ref.kind === 'bazi' ? 'utilities' : ref.kind === 'reading' ? 'reading' : null;
      if (owner && bot.seedKey !== owner && bot.seedKey !== 'coordinator') throw new BotError('RESOURCE_FORBIDDEN', '参考对象不属于当前 Bot 的能力范围');
      if (ref.kind === 'chat' && this.store.link(ref.id)?.bot_id !== bot.id) throw new BotError('RESOURCE_FORBIDDEN', '只能引用当前 Bot 的历史');
      if (ref.kind === 'artifact' && this.store.get<BotArtifact>('bot_artifacts', ref.id).producerBotId !== bot.id && bot.seedKey !== 'coordinator') throw new BotError('RESOURCE_FORBIDDEN', '交付件尚未共享给当前 Bot');
    }
  }
  start(): void { this.store.recover(); this.timer = setInterval(() => this.wake(), 5000); this.timer.unref(); this.wake(); }
  wake(): void { if (!this.stopping && !this.pumping && !this.suspended) { this.pumping = true; queueMicrotask(() => { try { this.pump(); } finally { this.pumping = false; } }); } }
  private pump(): void {
    if (this.stopping || this.suspended) return;
    for (const task of this.store.fireSchedules()) {
      this.changed({ kind: 'schedule', botId: task.botId });
      this.changed({ kind: 'task', botId: task.botId, taskId: task.id });
    }
    this.deliverResults();
    const busyBots = new Set(this.runningIds().map(id => this.store.task(id).botId));
    const queued = this.store.tasks(undefined, Number.MAX_SAFE_INTEGER).filter(t => t.status === 'queued').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const task of queued) {
      if (this.runningIds().length >= 2) break;
      if (busyBots.has(task.botId)) continue;
      const controller = new AbortController(); this.active.set(task.id, controller); busyBots.add(task.botId);
      this.store.updateTask(task.id, { status: 'running', workerId: this.workerId, reason: undefined, runGeneration: (task.runGeneration ?? 0) + 1 });
      this.emit('metric', { stage: 'queue', milliseconds: Date.now() - Date.parse(task.updatedAt), taskId: task.id, rootTaskId: task.rootTaskId });
      this.changed({ kind: 'task', taskId: task.id, botId: task.botId });
      void this.executor.run(this.store.task(task.id), this, controller.signal).then(result => {
        const current = this.store.task(task.id);
        if (current.status === 'running') this.finish(task.id, 'completed', result.reply);
      }, error => {
        const current = this.store.task(task.id);
        if (current.status === 'running') this.finish(task.id, this.stopping || this.suspended ? 'interrupted' : 'failed', error instanceof Error ? error.message : '执行失败');
      }).finally(() => { this.active.delete(task.id); this.resourceWaits.delete(task.id); this.wake(); });
    }
  }
  finish(taskId: string, status: BotTask['status'], result: string): BotTask {
    const next = this.store.transaction(() => {
      const current = this.store.task(taskId);
      if (terminalTask(current.status)) return current;
      const task = this.store.updateTask(taskId, { status, result, reason: ['failed', 'interrupted', 'cancelled'].includes(status) ? result : undefined, workerId: undefined });
      if (task.kind === 'message' && terminalTask(status)) {
        const request = this.store.get<BotMessage>('bot_messages', task.sourceMessageId);
        this.store.insertMessage({ id: randomUUID(), fromBotId: task.botId, toBotId: request.fromBotId, kind: 'result', purpose: 'reply', content: status === 'completed' ? result : `${status} · ${result}`, references: [], replyTo: request.id, originTaskId: request.originTaskId, rootTaskId: request.rootTaskId, sourceUserMessageId: request.sourceUserMessageId, createdAt: stamp(), ...(!request.originTaskId ? { deliveredAt: stamp() } : {}) });
      } else if (task.parentTaskId && terminalTask(status)) {
        const parent = this.store.task(task.parentTaskId);
        this.store.insertMessage({ id: randomUUID(), fromBotId: task.botId, toBotId: parent.botId, taskId, rootTaskId: task.rootTaskId, parentTaskId: parent.id, kind: status === 'cancelled' ? 'cancel' : 'result', replyTo: task.sourceMessageId, sourceUserMessageId: parent.sourceMessageId, content: `${this.store.profile(task.botId).name}：${status === 'completed' ? result : `${status} · ${result}`}`, references: this.store.all<BotArtifact>('bot_artifacts').filter(a => a.taskId === taskId).map(a => ({ kind: 'artifact', id: a.id, label: a.title })), createdAt: stamp() });
      }
      return task;
    });
    this.changed({ kind: 'task', taskId, botId: next.botId, chatId: next.chatId }); this.wake(); return next;
  }
  private deliverResults(): void {
    for (const message of this.store.all<BotMessage>('bot_messages').filter(m => !m.deliveredAt && ['result', 'cancel'].includes(m.kind))) {
      const parentId = message.parentTaskId ?? message.originTaskId;
      if (!parentId) { this.store.deliverMessage(message.id); continue; }
      this.store.transaction(() => {
        const parent = this.store.task(parentId);
        this.store.deliverMessage(message.id);
        if (terminalTask(parent.status)) return;
        const children = parent.dependencyIds.map(id => this.store.task(id));
        const resources = [...parent.resources];
        for (const ref of message.references) if (!resources.some(r => r.kind === ref.kind && r.id === ref.id)) resources.push(ref);
        this.store.updateTask(parent.id, { resources, pendingReplyMessageIds: [...new Set([...(parent.pendingReplyMessageIds ?? []), message.id])] });
        const allMessages = this.store.all<BotMessage>('bot_messages');
        const pendingQueries = (parent.messageIds ?? []).filter(id => allMessages.find(item => item.id === id)?.purpose === 'query' && !allMessages.some(item => item.replyTo === id && ['result', 'cancel'].includes(item.kind)));
        if (!pendingQueries.length && children.every(child => terminalTask(child.status)) && parent.status === 'waiting_bot') {
          this.store.updateTask(parent.id, { status: 'queued', resumeInput: `协作结果已到达。请依据实际状态汇总并继续原请求，勿重复委派同一工作：\n${children.map(c => `${this.store.profile(c.botId).name} [${c.status}] ${c.result ?? ''}`).join('\n')}\n${allMessages.filter(item => item.originTaskId === parent.id && item.kind === 'result').map(item => item.content).join('\n')}`, reason: undefined });
        }
      });
      this.changed({ kind: 'chat', chatId: this.store.task(parentId).chatId, taskId: parentId });
    }
  }
  sendMessage(fromBotId: string, operationId: string, toBotId: string, content: string, purpose: 'query' | 'notification', references: BotResourceRef[] = [], originTaskId?: string): BotMessage {
    const source = this.store.profile(fromBotId), target = this.store.profile(toBotId), origin = originTaskId ? this.store.task(originTaskId) : undefined;
    if (!source.enabled || !target.enabled || source.id === target.id) throw new BotError('INVALID_PEER', '请选择可用的另一位 Bot');
    if (origin && (origin.botId !== source.id || origin.kind === 'message')) throw new BotError('MESSAGE_FORBIDDEN', '只读询问不能继续转发或扩散');
    for (const reference of references) if (!origin?.resources.some(item => item.kind === reference.kind && item.id === reference.id) && !(origin && reference.kind === 'artifact' && this.store.get<BotArtifact>('bot_artifacts', reference.id).taskId === origin.id)) throw new BotError('RESOURCE_FORBIDDEN', '只能传递当前明确共享的引用');
    const hash = payloadHash({ fromBotId, toBotId, content, purpose, references, originTaskId });
    const existing = this.store.db.prepare('SELECT input_hash,message_id FROM bot_message_requests WHERE id=?').get(operationId) as { input_hash: string; message_id: string } | undefined;
    if (existing) { if (existing.input_hash !== hash) throw new BotError('REQUEST_ID_CONFLICT', '消息标识不能改变用途、内容或接收方'); return this.store.get<BotMessage>('bot_messages', existing.message_id); }
    const message = this.store.transaction(() => {
      const message: BotMessage = { id: randomUUID(), fromBotId, toBotId, kind: purpose === 'query' ? 'question' : 'notification', purpose, content, references, originTaskId, rootTaskId: origin?.rootTaskId, sourceUserMessageId: origin?.sourceMessageId, sourceAssistantEntryId: origin?.assistantEntryId, createdAt: stamp(), deliveredAt: stamp() };
      this.store.insertMessage(message);
      this.store.db.prepare('INSERT INTO bot_message_requests VALUES(?,?,?)').run(operationId, hash, message.id);
      if (purpose === 'query') {
        const id = randomUUID(), chatId = randomUUID();
        this.store.ai.saveChat({ id: chatId, title: 'Bot 询问记录', entries: [], draft: '', updatedAt: stamp(), module: 'workbench', viewId: 'bot-message' });
        // Internal execution is queued with other runs; it is not a business work item or a private user chat.
        this.store.insertTask({ id, botId: target.id, chatId, rootTaskId: id, sourceMessageId: message.id, kind: 'message', status: 'queued', title: content.slice(0, 60), input: content, context: {}, resources: references, operationIds: [], dependencyIds: [], revision: 0, createdAt: stamp(), updatedAt: stamp() });
      }
      if (origin) this.store.updateTask(origin.id, { messageIds: [...(origin.messageIds ?? []), message.id], ...(purpose === 'query' ? { status: 'waiting_bot', reason: `等待${target.name}回复` } : {}) });
      return message;
    });
    this.changed({ kind: 'task', botId: source.id, taskId: origin?.id }); this.changed({ kind: 'task', botId: target.id }); this.wake(); return message;
  }
  delegate(taskId: string, operationId: string, toBotId: string, content: string, references: BotResourceRef[]): BotTask {
    const parent = this.store.task(taskId), target = this.store.profile(toBotId);
    if (!target.enabled) throw new BotError('BOT_DISABLED', '目标 Bot 已停用');
    const old = this.store.actions(taskId).find(a => a.id === operationId);
    if (old) { if (old.payload.hash !== payloadHash({ toBotId, content, references })) throw new BotError('REQUEST_ID_CONFLICT', '协作操作标识冲突'); return this.store.task(String(old.payload.childTaskId)); }
    const ancestry = [parent]; while (ancestry.at(-1)?.parentTaskId) ancestry.push(this.store.task(ancestry.at(-1)!.parentTaskId!));
    if (ancestry.length >= 4 || ancestry.some(t => t.botId === toBotId) || this.store.tasks(undefined, Number.MAX_SAFE_INTEGER).filter(t => t.rootTaskId === parent.rootTaskId).length >= 20) throw new BotError('DELEGATION_LIMIT', '协作链达到上限或出现循环，请直接返回已有结果');
    for (const ref of references) {
      const supplied = parent.resources.some(r => r.kind === ref.kind && r.id === ref.id);
      const produced = ref.kind === 'artifact' && this.store.get<BotArtifact>('bot_artifacts', ref.id).taskId === taskId;
      if (!supplied && !produced) throw new BotError('RESOURCE_FORBIDDEN', '只能转交本任务明确选择或产出的资料');
    }
    const child = this.store.transaction(() => {
      const id = randomUUID(), messageId = randomUUID();
      const task: BotTask = { id, botId: target.id, chatId: target.mainChatId, rootTaskId: parent.rootTaskId, parentTaskId: parent.id, sourceMessageId: messageId, kind: 'delegated', status: 'queued', title: content.slice(0, 60), input: content, context: {}, resources: references, operationIds: [], dependencyIds: [], revision: 0, createdAt: stamp(), updatedAt: stamp() };
      this.store.insertTask(task);
      this.store.insertMessage({ id: messageId, fromBotId: parent.botId, toBotId, taskId: id, rootTaskId: parent.rootTaskId, parentTaskId: parent.id, kind: 'request', content, references, sourceUserMessageId: parent.sourceMessageId, sourceAssistantEntryId: parent.assistantEntryId, createdAt: stamp(), deliveredAt: stamp() });
      this.store.insertAction({ id: operationId, taskId, botId: parent.botId, kind: 'delegate', status: 'applied', revision: 0, payload: { childTaskId: id, hash: payloadHash({ toBotId, content, references }) }, receipt: { accepted: true, childTaskId: id }, createdAt: stamp(), updatedAt: stamp() });
      this.store.updateTask(parent.id, { status: 'waiting_bot', dependencyIds: [...parent.dependencyIds, id], operationIds: [...parent.operationIds, operationId], reason: `等待${target.name}的结果` });
      return task;
    });
    this.changed({ kind: 'task', taskId, botId: parent.botId }); this.changed({ kind: 'task', taskId: child.id, botId: child.botId }); this.wake(); return child;
  }
  amendDelegation(taskId: string, operationId: string, toBotId: string, replyTo: string, content: string): BotMessage {
    const parent = this.store.task(taskId), original = this.store.get<BotMessage>('bot_messages', replyTo);
    if (original.fromBotId !== parent.botId || original.toBotId !== toBotId || original.rootTaskId !== parent.rootTaskId || !original.taskId) throw new BotError('WRONG_MESSAGE', '补充必须明确回复本次已交接的原消息');
    const hash = payloadHash({ taskId, toBotId, replyTo, content, when: 'now' });
    const old = this.store.db.prepare('SELECT input_hash,message_id FROM bot_message_requests WHERE id=?').get(operationId) as { input_hash: string; message_id: string } | undefined;
    if (old) { if (old.input_hash !== hash) throw new BotError('REQUEST_ID_CONFLICT', '补充标识对应了不同内容'); return this.store.get<BotMessage>('bot_messages', old.message_id); }
    const child = this.store.task(original.taskId), actions = this.store.actions(child.id);
    if (terminalTask(child.status)) throw new BotError('TASK_FINISHED', '原工作已结束，请依据真实回执发起新的修改');
    if (actions.some(action => ['executing', 'unknown'].includes(action.status))) throw new BotError('RECONCILIATION_REQUIRED', '请先核对正在写入的结果');
    const message = this.store.transaction(() => {
      const previous = actions.find(action => ['todo', 'copy'].includes(action.kind) && action.status === 'pending');
      for (const action of actions) if (action.status === 'pending') this.store.updateAction(action.id, { status: 'superseded', error: '已接收补充，正在更新建议' });
      this.store.updateTask(child.id, { status: 'queued', requirementsRevision: (child.requirementsRevision ?? 0) + 1, amendedActionId: previous?.id, input: `${child.input}\n补充：${content}`, resumeInput: `继续原事项：${child.input}\n最新要求：${content}\n原建议（未执行）：${JSON.stringify(previous?.payload ?? {})}`, reason: '正在按照补充更新建议' });
      const message: BotMessage = { id: randomUUID(), fromBotId: parent.botId, toBotId, taskId: child.id, parentTaskId: parent.id, rootTaskId: parent.rootTaskId, kind: 'request', purpose: 'amendment', when: 'now', content: `原目标：${child.input}\n补充：${content}`, replyTo, sourceUserMessageId: parent.sourceMessageId, sourceAssistantEntryId: parent.assistantEntryId, references: child.resources, createdAt: stamp(), deliveredAt: stamp() };
      this.store.insertMessage(message); this.store.db.prepare('INSERT INTO bot_message_requests VALUES(?,?,?)').run(operationId, hash, message.id);
      this.store.updateTask(parent.id, { status: 'waiting_bot', reason: '已交付补充，等待最新结果' }); return message;
    });
    this.executor.redirect?.(child.id); this.changed({ kind: 'task', botId: child.botId, taskId: child.id }); this.wake(); return message;
  }
  waitForAction(taskId: string, id: string, kind: BotAction['kind'], payload: Record<string, unknown>): BotAction {
    const task = this.store.task(taskId), existing = this.store.actions(taskId).find(a => a.id === id);
    if (existing && existing.status !== 'superseded') return existing;
    let action: BotAction = { id, taskId, botId: task.botId, kind, payload, status: 'pending', revision: 0, requirementsRevision: task.requirementsRevision ?? 0, createdAt: stamp(), updatedAt: stamp() };
    this.store.transaction(() => { if (existing) action = this.store.updateAction(id, { payload, status: 'pending', error: undefined, requirementsRevision: task.requirementsRevision ?? 0 }); else this.store.insertAction(action); this.store.updateTask(taskId, { status: 'waiting_user', operationIds: [...new Set([...task.operationIds, id])], reason: kind === 'question' ? String(payload.question) : '等待确认后写入' }); });
    this.changed({ kind: 'task', taskId, botId: task.botId }); return action;
  }
  async answerAction(id: string, revision: number, answer: { approved?: boolean; indices?: number[]; text?: string }): Promise<BotAction> {
    let action = this.store.action(id);
    if (['applied', 'discarded', 'undone'].includes(action.status)) return action;
    this.store.checkRevision(action, revision);
    if (action.status !== 'pending') throw new BotError('ACTION_NOT_PENDING', '操作已执行或结果待核对，不能重复提交');
    const task = this.store.task(action.taskId);
    if ((action.requirementsRevision ?? 0) !== (task.requirementsRevision ?? 0)) throw new BotError('VERSION_CONFLICT', '工作要求已经更新，请等待最新建议');
    if (terminalTask(task.status)) throw new BotError('TASK_FINISHED', '任务已结束');
    if (['todo', 'copy'].includes(action.kind) && task.status !== 'waiting_user') throw new BotError('PREVIEW_NOT_READY', '建议仍在生成，请等待完整预览后确认');
    if (answer.approved === false) {
      action = this.store.updateAction(id, { status: 'discarded', receipt: { declined: true } });
      this.finish(task.id, 'cancelled', '用户未批准该操作'); return action;
    }
    if (action.kind !== 'question' && answer.approved !== true) throw new BotError('APPROVAL_REQUIRED', '请明确确认要应用的操作');
    // Durable intent precedes the business commit. Unknown outcomes never auto-replay.
    this.store.updateAction(id, { status: 'executing', payload: { ...action.payload, answer } });
    try {
      const receipt = action.kind === 'question' ? { answer: answer.text?.trim() || '用户选择跳过，请说明必要假设' } : await this.executor.apply(action, answer);
      action = this.store.updateAction(id, { status: 'applied', receipt });
      if (action.kind === 'question') this.store.updateTask(task.id, { status: 'queued', resumeInput: `用户对“${String(action.payload.question)}”的回答：${answer.text || '跳过'}`, reason: undefined });
      else if (task.dependencyIds.some(childId => !terminalTask(this.store.task(childId).status))) this.store.updateTask(task.id, { status: 'waiting_bot', reason: '已应用本次确认，继续等待协作结果' });
      else this.finish(task.id, 'completed', action.kind === 'todo' ? `已完成用户确认的 ${(receipt as { appliedCount: number }).appliedCount} 项待办操作。\n实际写入回执：${JSON.stringify(receipt)}\n请依据实际值汇报；回执未包含的字段需先只读核对，不得从旧指令推断。` : action.kind === 'schedule' ? '已注册定时任务。' : '已将用户确认的修改保存到原稿。');
    } catch (error) {
      const safe = error instanceof BotError && error.code === 'PRECONDITION_FAILED';
      action = this.store.updateAction(id, { status: safe ? 'failed' : 'unknown', error: error instanceof Error ? error.message : '写入回执待核对' });
      this.store.updateTask(task.id, { status: 'waiting_user', reason: safe ? '对象已变化，请重新生成建议' : '写入结果待核对，不会自动重试' });
    }
    this.changed({ kind: 'task', taskId: task.id, botId: task.botId }); this.wake(); return action;
  }
  cancelTask(id: string, revision: number): BotTask {
    const task = this.store.task(id); this.store.checkRevision(task, revision);
    if (terminalTask(task.status)) return task;
    for (const child of this.store.tasks(undefined, Number.MAX_SAFE_INTEGER).filter(t => (t.parentTaskId === id || t.kind === 'message' && task.messageIds?.includes(t.sourceMessageId)) && !terminalTask(t.status))) this.cancelTask(child.id, child.revision);
    this.active.get(id)?.abort();
    for (const action of this.store.actions(id)) if (action.status === 'pending') this.store.updateAction(action.id, { status: 'discarded' });
    return this.finish(id, 'cancelled', '用户已取消');
  }
  reconcileAction(id: string, revision: number, result: 'applied' | 'not_applied', note: string): BotAction {
    const action = this.store.action(id); this.store.checkRevision(action, revision);
    if (action.status !== 'unknown') throw new BotError('NOT_UNCERTAIN', '只有结果待核对的操作需要人工核对');
    const next = this.store.updateAction(id, { status: action.payload.undoing ? result === 'applied' ? 'undone' : 'applied' : result === 'applied' ? 'applied' : 'discarded', receipt: { manual: true, result, note, checkedAt: stamp(), previous: action.receipt } });
    this.finish(action.taskId, result === 'applied' || action.payload.undoing ? 'completed' : 'cancelled', `用户已核对：${note}`);
    this.changed({ kind: 'task', taskId: action.taskId, botId: action.botId }); return next;
  }
  async undoAction(id: string, revision: number): Promise<BotAction> {
    const action = this.store.action(id);
    if (action.status === 'undone') return action;
    this.store.checkRevision(action, revision);
    if (action.kind !== 'copy' || action.status !== 'applied' || !this.executor.undo) throw new BotError('NOT_UNDOABLE', '当前操作不能自动撤销，请在原工作区查看');
    this.store.updateAction(id, { status: 'executing', payload: { ...action.payload, undoing: true } });
    let next: BotAction;
    try { next = this.store.updateAction(id, { status: 'undone', receipt: { original: action.receipt, undo: await this.executor.undo(action) } }); }
    catch (error) {
      const safe = error instanceof BotError && error.code === 'PRECONDITION_FAILED';
      next = this.store.updateAction(id, { status: safe ? 'applied' : 'unknown', error: error instanceof Error ? error.message : '撤销结果待核对' });
      if (safe) throw error;
    }
    this.changed({ kind: 'task', taskId: action.taskId, botId: action.botId }); return next;
  }
  retryTask(id: string, revision: number): BotTask {
    const task = this.store.task(id); this.store.checkRevision(task, revision);
    if (!['failed', 'interrupted', 'waiting_resource'].includes(task.status)) throw new BotError('NOT_RETRYABLE', '当前任务不能重试');
    if (this.store.actions(id).some(a => ['executing', 'unknown'].includes(a.status))) throw new BotError('RECONCILIATION_REQUIRED', '请先核对已有业务操作，不能重复执行');
    const next = this.store.updateTask(id, { status: 'queued', reason: undefined, resumeInput: task.piSessionPath ? '继续原任务。先核对已有工具记录和业务回执，不重复已成功操作。' : undefined }); this.changed({ kind: 'task', taskId: id, botId: next.botId }); this.wake(); return next;
  }
  suspend(): void {
    this.suspended = true;
    for (const [id, controller] of this.active) {
      if (this.resourceWaits.has(id)) this.store.updateTask(id, { status: 'waiting_resource', reason: '系统暂停了浏览器资源，请打开工作区后继续' });
      else if (this.store.task(id).status === 'running') this.finish(id, 'interrupted', '执行已暂停，请核对记录后继续');
      controller.abort();
    }
  }
  resume(): void { this.suspended = false; this.wake(); }
  state(): BotHostState { return { connected: true, running: !this.stopping, independent: true, pid: process.pid, activeTasks: this.runningIds().length, queuedTasks: this.store.tasks(undefined, Number.MAX_SAFE_INTEGER).filter(t => t.status === 'queued').length, startedAt: this.startedAt, supervised: false }; }
  async stop(): Promise<void> {
    this.stopping = true; if (this.timer) clearInterval(this.timer);
    for (const id of this.resourceWaits) this.store.updateTask(id, { status: 'waiting_resource', reason: '浏览器资源已断开，请打开工作区后继续' });
    for (const controller of this.active.values()) controller.abort();
    const deadline = this.clock() + 10000;
    while (this.active.size && this.clock() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
    for (const id of this.active.keys()) if (this.store.task(id).status === 'running') this.finish(id, 'interrupted', '后台已停止，任务已保存');
  }
  coordinator(): BotProfile { return this.store.all<BotProfile>('bots').find(bot => bot.seedKey === botSeeds[0].seedKey)!; }
}
