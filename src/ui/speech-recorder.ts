import { encodeSpeechWave } from '../../shared/speech-audio';
import { SPEECH_MAX_SECONDS, SPEECH_SAMPLE_RATE } from '../../shared/speech-contracts';

/** Capture/convert only in memory. Cancellation also handles a late permission grant. */
export class SpeechRecorder {
  private stream?: MediaStream;
  private context?: AudioContext;
  private recorder?: MediaRecorder;
  private analyser?: AnalyserNode;
  private chunks: Blob[] = [];
  private stopped?: Promise<void>;
  private cancelled = false;
  readonly levels = new Uint8Array(256);

  async start(deviceId: string, interrupted: () => void): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: false, audio: { echoCancellation: true, noiseSuppression: true, ...(deviceId ? { deviceId: { exact: deviceId } } : {}) },
    });
    if (this.cancelled) { stream.getTracks().forEach(track => track.stop()); throw new Error('听写已取消。'); }
    this.stream = stream;
    try {
      stream.getAudioTracks().forEach(track => { track.onended = interrupted; });
      this.context = new AudioContext();
      this.analyser = this.context.createAnalyser(); this.analyser.fftSize = 256;
      this.context.createMediaStreamSource(stream).connect(this.analyser);
      this.recorder = new MediaRecorder(stream);
      this.recorder.ondataavailable = event => { if (event.data.size && !this.cancelled) this.chunks.push(event.data); };
      this.stopped = new Promise(resolve => {
        this.recorder!.onstop = () => resolve();
        this.recorder!.onerror = () => { resolve(); interrupted(); };
      });
      this.recorder.start(250);
    } catch (error) { this.cancel(); throw error; }
  }

  readLevels(): Uint8Array { this.analyser?.getByteTimeDomainData(this.levels); return this.levels; }

  async finish(): Promise<Uint8Array> {
    if (!this.recorder || this.cancelled) throw new Error('录音已取消。');
    if (this.recorder.state !== 'inactive') this.recorder.stop();
    await this.stopped;
    this.releaseMicrophone();
    try {
      const context = this.context!;
      const buffer = await context.decodeAudioData(await new Blob(this.chunks).arrayBuffer());
      if (this.cancelled) throw new Error('录音已取消。');
      const frames = Math.max(1, Math.min(Math.ceil(buffer.duration * SPEECH_SAMPLE_RATE), SPEECH_MAX_SECONDS * SPEECH_SAMPLE_RATE));
      const offline = new OfflineAudioContext(1, frames, SPEECH_SAMPLE_RATE);
      const source = offline.createBufferSource(); source.buffer = buffer; source.connect(offline.destination); source.start();
      const mono = await offline.startRendering();
      if (this.cancelled) throw new Error('录音已取消。');
      return encodeSpeechWave(mono.getChannelData(0));
    } finally { this.chunks = []; void this.context?.close(); this.context = undefined; this.analyser = undefined; }
  }

  cancel(): void {
    this.cancelled = true; this.chunks = [];
    if (this.recorder?.state === 'recording') this.recorder.stop();
    this.releaseMicrophone();
    void this.context?.close(); this.context = undefined; this.analyser = undefined;
  }

  private releaseMicrophone(): void {
    this.stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
    this.stream = undefined;
  }
}
