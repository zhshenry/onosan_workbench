import { utilityProcess, type UtilityProcess } from 'electron';
import { join } from 'node:path';
import type { SpeechLanguage, SpeechResult } from '../shared/speech-contracts';
import { validateSpeechWave } from '../shared/speech-audio';

/** One app-owned recording lease and one native inference, never a public server. */
export class SpeechService {
  private child: UtilityProcess | null = null;
  private loading: Promise<void> | null = null;
  private rejectLoad: ((error: Error) => void) | null = null;
  private lease: string | null = null;
  private pending: { id: string; resolve(result: SpeechResult): void; reject(error: Error): void; timer: NodeJS.Timeout } | null = null;
  private idle: NodeJS.Timeout | undefined;

  constructor(private readonly directory: string, private readonly worker = join(__dirname, 'speech-worker.cjs')) {}

  async prepare(id: string): Promise<void> {
    if (this.lease && this.lease !== id) throw new Error('另一次听写正在进行。');
    this.lease = id; clearTimeout(this.idle);
    try {
      await this.load();
      if (this.lease !== id) throw new Error('听写已取消。');
    } catch (error) { if (this.lease === id) this.stop('语音引擎启动失败，请重试。'); throw error; }
  }

  transcribe(id: string, audio: Uint8Array, language: SpeechLanguage): Promise<SpeechResult> {
    if (this.lease !== id || !this.child || this.pending) return Promise.reject(new Error('听写已失效，请重新录音。'));
    validateSpeechWave(audio);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.stop('本地转写超时，请重试。'), 120000);
      this.pending = { id, resolve, reject, timer };
      this.child!.postMessage({ id, audio, language });
    });
  }

  cancel(id?: string): void { if (!id || this.lease === id) this.stop('听写已取消。'); }
  dispose(): void { this.stop('语音引擎已关闭。'); }

  private load(): Promise<void> {
    if (this.loading) return this.loading;
    this.loading = new Promise<void>((resolve, reject) => {
      this.rejectLoad = reject;
      const child = utilityProcess.fork(this.worker, [this.directory], { stdio: 'ignore', serviceName: 'Workbench 离线语音' });
      this.child = child;
      const timeout = setTimeout(() => { if (this.child === child) this.stop('语音引擎准备超时，请重试。'); }, 60000);
      child.on('message', (message: { type: string; id?: string; message?: string; result?: SpeechResult }) => {
        if (this.child !== child) return;
        if (message.type === 'ready') { clearTimeout(timeout); this.rejectLoad = null; resolve(); return; }
        if (message.type === 'error' && !message.id) { clearTimeout(timeout); this.stop(message.message!); return; }
        const pending = this.pending;
        if (!pending || message.id !== pending.id) return;
        this.pending = null; this.lease = null; clearTimeout(pending.timer);
        if (message.type === 'result' && message.result) pending.resolve(message.result);
        else pending.reject(new Error(message.message || '本地转写失败，请重试。'));
        this.idle = setTimeout(() => this.stop('语音引擎已释放。'), 300000);
        this.idle.unref();
      });
      child.once('exit', () => { clearTimeout(timeout); if (this.child === child) this.stop('语音引擎意外退出，请重试。'); });
    });
    return this.loading;
  }

  private stop(message: string): void {
    const child = this.child;
    this.child = null; this.loading = null; this.lease = null; clearTimeout(this.idle);
    this.rejectLoad?.(new Error(message)); this.rejectLoad = null;
    if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(new Error(message)); this.pending = null; }
    child?.kill();
  }
}
