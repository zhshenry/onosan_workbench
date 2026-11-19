import { EventEmitter } from 'node:events';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { connect, type Socket } from 'node:net';
import { BotError } from './bot-store';
import { BOT_CONTRACT_VERSION } from '../shared/bot-contracts';

const MAX_FRAME = 4 * 1024 * 1024;
const MAX_MESSAGE = 64 * 1024 * 1024;
export function hostAddress(directory: string): string {
  const name = createHash('sha256').update(resolve(directory).toLowerCase()).digest('hex').slice(0, 24);
  return process.platform === 'win32' ? String.raw`\\.\pipe\ono-bot-${name}` : join(directory, 'bot-host.sock');
}
export function hostSecret(directory: string): string {
  mkdirSync(directory, { recursive: true }); const file = join(directory, 'bot-host.secret');
  if (!existsSync(file)) { try { writeFileSync(file, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 }); } catch (error) { if (!existsSync(file)) throw error; } }
  const secret = readFileSync(file, 'utf8').trim();
  if (!/^[a-f0-9]{64}$/.test(secret)) throw new Error('后台连接凭据无效，请保留数据并修复连接文件');
  return secret;
}
export function validSecret(a: unknown, b: string): boolean { return typeof a === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b)); }
type Frame = { id?: string; method?: string; args?: unknown[]; value?: unknown; error?: { code: string; message: string; current?: unknown }; event?: string; secret?: string; part?: { id: string; index: number; total: number; data: string } };
export class BotPeer extends EventEmitter {
  private buffer = '';
  private readonly transfers = new Map<string, { buffers: Buffer[]; total: number; bytes: number; timer: ReturnType<typeof setTimeout> }>();
  private readonly pending = new Map<string, { resolve(value: any): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  handler?: (method: string, args: unknown[]) => unknown | Promise<unknown>;
  authorized = false;
  contractVersion?: string;
  constructor(readonly socket: Socket, private readonly secret: string, readonly server = false) {
    super(); socket.setEncoding('utf8');
    socket.on('data', chunk => {
      this.buffer += chunk;
      let end: number;
      while ((end = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, end); this.buffer = this.buffer.slice(end + 1);
        if (Buffer.byteLength(line) > MAX_FRAME) { socket.destroy(new Error('后台通信数据超限')); return; }
        try { void this.receive(JSON.parse(line) as Frame).catch(() => socket.destroy(new Error('后台通信格式无效'))); } catch { socket.destroy(new Error('后台通信格式无效')); return; }
      }
      if (Buffer.byteLength(this.buffer) > MAX_FRAME) socket.destroy(new Error('后台通信数据超限'));
    });
    socket.on('error', () => {});
    socket.on('close', () => { for (const transfer of this.transfers.values()) clearTimeout(transfer.timer); this.transfers.clear(); for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(new BotError('HOST_DISCONNECTED', '后台连接已断开；已保存任务将在重连后显示')); } this.pending.clear(); this.emit('disconnected'); });
  }
  private write(frame: Frame): void {
    if (this.socket.destroyed) throw new BotError('HOST_DISCONNECTED', '后台连接已断开');
    const data = JSON.stringify(frame) + '\n', bytes = Buffer.byteLength(data);
    if (bytes > MAX_MESSAGE) throw new BotError('MESSAGE_TOO_LARGE', '对话快照超过 64 MB，请归档部分历史后重试');
    if (bytes <= MAX_FRAME) { this.socket.write(data); return; }
    const payload = Buffer.from(data), size = 256 * 1024, total = Math.ceil(payload.length / size), id = randomUUID();
    for (let index = 0; index < total; index++) this.socket.write(JSON.stringify({ part: { id, index, total, data: payload.subarray(index * size, (index + 1) * size).toString('base64') } }) + '\n');
  }
  private async receive(frame: Frame): Promise<void> {
    if (!frame || typeof frame !== 'object' || frame.args !== undefined && !Array.isArray(frame.args)) throw new Error('无效的后台通信帧');
    if (this.server && !this.authorized) {
      if (frame.method !== 'hello' || !validSecret(frame.secret, this.secret)) { this.socket.destroy(); return; }
      this.authorized = true; this.write({ id: frame.id, value: { version: 1, contractVersion: BOT_CONTRACT_VERSION } }); this.emit('authorized'); return;
    }
    if (frame.part) {
      const part = frame.part;
      if (typeof part.id !== 'string' || !Number.isInteger(part.index) || !Number.isInteger(part.total) || part.total < 1 || part.total > 256 || typeof part.data !== 'string' || part.data.length > 350000) throw new Error('无效的消息分片');
      let transfer = this.transfers.get(part.id);
      if (!transfer) {
        if (part.index !== 0 || this.transfers.size >= 4) throw new Error('消息分片顺序无效');
        transfer = { buffers: [], total: part.total, bytes: 0, timer: setTimeout(() => this.socket.destroy(new Error('消息分片超时')), 30000) }; this.transfers.set(part.id, transfer);
      }
      if (part.total !== transfer.total || part.index !== transfer.buffers.length) throw new Error('消息分片顺序无效');
      const chunk = Buffer.from(part.data, 'base64'); transfer.bytes += chunk.length;
      if (transfer.bytes > MAX_MESSAGE) throw new Error('消息分片超限'); transfer.buffers.push(chunk);
      if (transfer.buffers.length === transfer.total) { clearTimeout(transfer.timer); this.transfers.delete(part.id); await this.receive(JSON.parse(Buffer.concat(transfer.buffers).toString('utf8')) as Frame); }
      return;
    }
    if (frame.event) { this.emit('event', frame.event, frame.value); return; }
    if (frame.method && frame.id) {
      try { if (!this.handler) throw new BotError('RESOURCE_OFFLINE', '工作区尚未连接'); const value = await this.handler(frame.method, frame.args ?? []); this.write({ id: frame.id, value }); }
      catch (error) { if (!this.socket.destroyed) this.write({ id: frame.id, error: { code: error instanceof BotError ? error.code : 'REQUEST_FAILED', message: error instanceof Error ? error.message : '操作失败', ...(error instanceof BotError && error.current !== undefined ? { current: error.current } : {}) } }); }
      return;
    }
    if (!frame.id) return;
    const pending = this.pending.get(frame.id); if (!pending) return;
    this.pending.delete(frame.id); clearTimeout(pending.timer);
    if (frame.error) pending.reject(new BotError(frame.error.code, frame.error.message, frame.error.current)); else pending.resolve(frame.value);
  }
  call<T = unknown>(method: string, args: unknown[] = [], timeout = 60000): Promise<T> {
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new BotError('HOST_TIMEOUT', '后台未及时返回，请刷新记录核对结果后重试')); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      try { this.write({ id, method, args, ...(method === 'hello' ? { secret: this.secret } : {}) }); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  notify(event: string, value?: unknown): void { if (!this.socket.destroyed) this.write({ event, value }); }
  close(): void { this.socket.destroy(); }
}
export async function connectHost(directory: string): Promise<BotPeer> {
  const socket = connect(hostAddress(directory));
  await new Promise<void>((resolve, reject) => { const timer = setTimeout(() => { socket.destroy(); reject(new Error('连接后台超时')); }, 2000); socket.once('connect', () => { clearTimeout(timer); resolve(); }); socket.once('error', error => { clearTimeout(timer); reject(error); }); });
  const peer = new BotPeer(socket, hostSecret(directory));
  try { const hello = await peer.call<{ contractVersion?: string }>('hello', [], 2000); peer.contractVersion = hello.contractVersion; return peer; }
  catch (error) { peer.close(); throw error; }
}
