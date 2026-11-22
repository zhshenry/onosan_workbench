import { closeSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BotDraftSurface, BotDraftValue, BotPendingSubmission, BotSubmissionStatus, BotSubmit, BotSubmitReceipt } from '../shared/bot-contracts';
import { BotError, payloadHash } from './bot-store';

type Record = BotPendingSubmission & { surface: BotDraftSurface };
type Transport = (method: string, args: unknown[]) => Promise<unknown>;
const transient = new Set(['HOST_DISCONNECTED', 'HOST_TIMEOUT', 'HOST_UNAVAILABLE', 'HOST_VERSION_MISMATCH', 'DATA_EPOCH_CHANGED']);

/** The main process owns the outbox. A renderer restart never invents a new send id. */
export class BotOutbox {
  private readonly file: string;
  private records: Record[];
  private readonly active = new Map<string, { input: BotSubmit; promise: Promise<BotSubmitReceipt> }>();
  constructor(directory: string) {
    this.file = join(directory, 'bot-outbox.json');
    this.records = existsSync(this.file) ? JSON.parse(readFileSync(this.file, 'utf8')) : [];
    if (!Array.isArray(this.records)) throw new Error('发送记录损坏，请保留 bot-outbox.json 以恢复未发送内容');
  }
  private save(): void {
    const temporary = `${this.file}.tmp`, fd = openSync(temporary, 'w', 0o600);
    try { writeFileSync(fd, JSON.stringify(this.records)); fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(temporary, this.file);
  }
  pending(chatId: string, surface: BotDraftSurface, memory = false): Record | null {
    return structuredClone(this.records.find(record => record.input.chatId === chatId && record.surface === surface && !!record.input.memoryRequest === memory) ?? null);
  }
  retainDraft(chatId: string, surface: BotDraftSurface, value: BotDraftValue): void {
    const record = this.records.find(row => row.input.chatId === chatId && row.surface === surface && !row.input.memoryRequest);
    if (record) { record.localDraft = structuredClone(value); this.save(); }
  }
  send(input: BotSubmit, surface: BotDraftSurface, transport: Transport): Promise<BotSubmitReceipt> {
    const memory = !!input.memoryRequest;
    const key = `${surface}:${input.chatId}:${memory ? 'memory' : 'chat'}`, running = this.active.get(key);
    const record = this.records.find(row => row.input.chatId === input.chatId && row.surface === surface && !!row.input.memoryRequest === memory);
    if (record && payloadHash(record.input) !== payloadHash(input)) return Promise.reject(new BotError('SEND_PENDING', '上一条消息仍在核对接收状态，当前输入已保留'));
    if (running) return payloadHash(running.input) === payloadHash(input) ? running.promise : Promise.reject(new BotError('SEND_PENDING', '上一条消息仍在核对，请保留当前输入'));
    const request = this.deliver(structuredClone(input), surface, transport).finally(() => this.active.delete(key));
    this.active.set(key, { input: structuredClone(input), promise: request }); return request;
  }
  private async deliver(input: BotSubmit, surface: BotDraftSurface, transport: Transport): Promise<BotSubmitReceipt> {
    let record = this.records.find(row => row.input.clientRequestId === input.clientRequestId);
    const status = await transport('getSubmissionStatus', [input, record?.dataEpoch]) as BotSubmissionStatus;
    if (status.status === 'epoch_changed') throw new BotError('DATA_EPOCH_CHANGED', '后台数据已更换，旧消息不会自动重发。请先核对原记录；输入仍保留。');
    if (!record && status.status === 'not_found') {
      record = { input, surface, dataEpoch: status.dataEpoch };
      this.records.push(record); this.save();
    }
    try {
      const receipt = status.status === 'accepted' ? status.receipt : await transport('submit', [input]) as BotSubmitReceipt;
      // Keep the acknowledged record until the renderer has recovered its newer local draft.
      return receipt;
    } catch (error) {
      if (!transient.has((error as { code?: string }).code ?? '')) { this.records = this.records.filter(row => row.input.clientRequestId !== input.clientRequestId); this.save(); }
      throw error;
    }
  }
  acknowledge(chatId: string, surface: BotDraftSurface, requestId: string): void {
    this.records = this.records.filter(row => row.surface !== surface || row.input.chatId !== chatId || row.input.clientRequestId !== requestId); this.save();
  }
}
