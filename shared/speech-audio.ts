import { SPEECH_MAX_BYTES, SPEECH_MAX_SECONDS, SPEECH_SAMPLE_RATE } from './speech-contracts';

/** Canonical browser/worker format: mono, 16 kHz, PCM16, 44-byte WAV header. */
export function validateSpeechWave(bytes: Uint8Array): number {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 46 || bytes.byteLength > SPEECH_MAX_BYTES) throw new Error('录音数据大小无效。');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number, value: string): boolean => [...value].every((letter, i) => view.getUint8(at + i) === letter.charCodeAt(0));
  if (!tag(0, 'RIFF') || !tag(8, 'WAVE') || !tag(12, 'fmt ') || !tag(36, 'data')
    || view.getUint32(4, true) !== bytes.byteLength - 8 || view.getUint32(16, true) !== 16
    || view.getUint16(20, true) !== 1 || view.getUint16(22, true) !== 1
    || view.getUint32(24, true) !== SPEECH_SAMPLE_RATE || view.getUint32(28, true) !== SPEECH_SAMPLE_RATE * 2
    || view.getUint16(32, true) !== 2 || view.getUint16(34, true) !== 16
    || view.getUint32(40, true) !== bytes.byteLength - 44 || (bytes.byteLength - 44) % 2) throw new Error('录音格式无效，请重新录音。');
  const seconds = (bytes.byteLength - 44) / (SPEECH_SAMPLE_RATE * 2);
  if (seconds > SPEECH_MAX_SECONDS) throw new Error('每次听写最长两分钟。');
  return seconds;
}

export function encodeSpeechWave(samples: Float32Array): Uint8Array {
  const count = Math.min(samples.length, SPEECH_MAX_SECONDS * SPEECH_SAMPLE_RATE);
  const bytes = new Uint8Array(44 + count * 2), view = new DataView(bytes.buffer);
  const tag = (at: number, value: string): void => { [...value].forEach((letter, i) => view.setUint8(at + i, letter.charCodeAt(0))); };
  tag(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); tag(8, 'WAVE'); tag(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, SPEECH_SAMPLE_RATE, true); view.setUint32(28, SPEECH_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); tag(36, 'data'); view.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) { const sample = Math.max(-1, Math.min(1, samples[i] || 0)); view.setInt16(44 + i * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true); }
  return bytes;
}

export function decodeSpeechWave(bytes: Uint8Array): Float32Array {
  validateSpeechWave(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset + 44, bytes.byteLength - 44);
  return Float32Array.from({ length: view.byteLength / 2 }, (_, i) => view.getInt16(i * 2, true) / 32768);
}

export interface SpeechInsertion { context: string; revision: number; start: number; end: number; }
export function insertSpeechDraft(draft: string, text: string, snapshot: SpeechInsertion, context: string, revision: number): string | null {
  if (snapshot.context !== context) return null;
  if (snapshot.revision !== revision) return draft + (draft && !draft.endsWith('\n') ? '\n' : '') + text;
  const start = Math.max(0, Math.min(snapshot.start, draft.length)), end = Math.max(start, Math.min(snapshot.end, draft.length));
  return draft.slice(0, start) + text + draft.slice(end);
}
