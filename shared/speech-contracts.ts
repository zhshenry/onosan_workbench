export const SPEECH_SAMPLE_RATE = 16000;
export const SPEECH_MAX_SECONDS = 120;
export const SPEECH_MAX_BYTES = 4 * 1024 * 1024;
export const SPEECH_LANGUAGES = ['auto', 'zh', 'en', 'yue', 'ja', 'ko'] as const;
export type SpeechLanguage = typeof SPEECH_LANGUAGES[number];
export interface SpeechResult { text: string; audioSeconds: number; inferenceSeconds: number; }
export interface SpeechBridge {
  prepare(id: string): Promise<void>;
  transcribe(input: { id: string; audio: Uint8Array; language: SpeechLanguage }): Promise<SpeechResult>;
  cancel(id: string): Promise<void>;
}

/** Only our trusted main document may use audio; embedded pages and other windows cannot. */
export function speechAppUrl(value: string, appUrl: string): boolean {
  try {
    const actual = new URL(value), expected = new URL(appUrl);
    return expected.protocol === 'file:'
      ? actual.protocol === 'file:' && actual.host === expected.host && actual.pathname === expected.pathname
      : ['http:', 'https:'].includes(expected.protocol) && actual.origin === expected.origin;
  } catch { return false; }
}
