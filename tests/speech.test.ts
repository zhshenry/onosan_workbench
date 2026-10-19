import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeSpeechWave, encodeSpeechWave, insertSpeechDraft, validateSpeechWave } from '../shared/speech-audio';
import { SPEECH_MAX_SECONDS, SPEECH_SAMPLE_RATE, speechAppUrl } from '../shared/speech-contracts';
import { SpeechRecorder } from '../src/ui/speech-recorder';

test('speech PCM round trip clips samples and respects typed-array offsets', () => {
  const encoded = encodeSpeechWave(new Float32Array([-2, -.5, 0, .5, 2]));
  const padded = new Uint8Array(encoded.length + 10); padded.set(encoded, 7);
  const audio = padded.subarray(7, 7 + encoded.length);
  assert.equal(validateSpeechWave(audio), 5 / SPEECH_SAMPLE_RATE);
  const decoded = decodeSpeechWave(audio);
  assert.equal(decoded[0], -1);
  assert.ok(Math.abs(decoded[1] + .5) < .0001);
  assert.ok(Math.abs(decoded[3] - .5) < .0001);
  assert.ok(decoded[4] > .999);
});

test('speech rejects malformed WAV headers, stereo, non-PCM and non-16 kHz recordings', () => {
  const original = encodeSpeechWave(new Float32Array(160));
  for (const offset of [0, 4, 8, 12, 16, 20, 22, 24, 28, 32, 34, 36, 40]) {
    const bytes = original.slice(); bytes[offset] ^= 1;
    assert.throws(() => validateSpeechWave(bytes), /格式无效/, 'header offset ' + offset);
  }
  assert.throws(() => validateSpeechWave(new Uint8Array(44)), /大小无效/);
});

test('speech encoder caps recording at two minutes; worker rejects oversized duration', () => {
  const bytes = encodeSpeechWave(new Float32Array((SPEECH_MAX_SECONDS + 1) * SPEECH_SAMPLE_RATE));
  assert.equal(validateSpeechWave(bytes), SPEECH_MAX_SECONDS);
  const oversized = new Uint8Array(bytes.length + 2); oversized.set(bytes);
  const view = new DataView(oversized.buffer);
  view.setUint32(4, oversized.length - 8, true); view.setUint32(40, oversized.length - 44, true);
  assert.throws(() => validateSpeechWave(oversized), /最长两分钟/);
});

test('confirmed transcription replaces only the original selected range', () => {
  assert.equal(insertSpeechDraft('保留原文，继续', '新内容', { context: 'a', revision: 3, start: 5, end: 7 }, 'a', 3), '保留原文，新内容');
});

test('edited draft is preserved and transcription is appended after explicit confirmation', () => {
  const snapshot = { context: 'a', revision: 3, start: 0, end: 4 };
  assert.equal(insertSpeechDraft('已经改好的文字', '语音结果', snapshot, 'a', 4), '已经改好的文字\n语音结果');
  assert.equal(insertSpeechDraft('已经改好的文字\n', '语音结果', snapshot, 'a', 5), '已经改好的文字\n语音结果');
});

test('transcription can never insert into another conversation', () => {
  assert.equal(insertSpeechDraft('其他对话', '语音结果', { context: 'a', revision: 0, start: 0, end: 0 }, 'b', 0), null);
});

test('microphone app URL excludes web pages, other files and remote file hosts', () => {
  const app = 'file:///C:/Workbench/dist/index.html';
  assert.ok(speechAppUrl(app + '#home', app));
  assert.equal(speechAppUrl('https://example.com', app), false);
  assert.equal(speechAppUrl('file:///C:/Workbench/dist/other.html', app), false);
  assert.equal(speechAppUrl('file://remote/C:/Workbench/dist/index.html', app), false);
  assert.ok(speechAppUrl('http://localhost:5173/', 'http://localhost:5173'));
  assert.equal(speechAppUrl('http://localhost:5174/', 'http://localhost:5173'), false);
});

test('cancelling before microphone permission resolves releases every late audio track', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let release!: (value: MediaStream) => void, stopped = 0;
  const track = { stop() { stopped++; } };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: {
    getUserMedia(input: MediaStreamConstraints) {
      assert.equal(input.video, false);
      return new Promise<MediaStream>(resolve => { release = resolve; });
    },
  } } });
  try {
    const recorder = new SpeechRecorder();
    const opening = recorder.start('', () => {});
    recorder.cancel();
    release({ getTracks: () => [track, track] } as unknown as MediaStream);
    await assert.rejects(opening, /听写已取消/);
    assert.equal(stopped, 2);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'navigator', previous);
    else Reflect.deleteProperty(globalThis, 'navigator');
  }
});
