// SenseVoice/Silero pipeline adapted from DeepSeek Harness rc.2 (MIT).
// Attribution and the separate model/runtime licenses ship in assets/speech/licenses.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { decodeSpeechWave, validateSpeechWave } from '../shared/speech-audio';
import type { SpeechLanguage, SpeechResult } from '../shared/speech-contracts';

const port = process.parentPort!;
const directory = process.argv[2];

async function initialize(): Promise<void> {
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')) as { files: { name: string; bytes: number; sha256: string }[] };
  for (const name of ['model.int8.onnx', 'tokens.txt', 'silero_vad.onnx']) {
    const asset = manifest.files.find(file => file.name === name), path = join(directory, name);
    if (!asset || (await stat(path)).size !== asset.bytes) throw new Error('语音资源缺失或损坏，请修复安装。');
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    if (hash.digest('hex') !== asset.sha256) throw new Error('语音资源校验失败，请修复安装。');
  }
  const sherpa = require('sherpa-onnx-node');
  const config = {
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: {
      senseVoice: { model: join(directory, 'model.int8.onnx'), language: 'auto', useInverseTextNormalization: 1 },
      tokens: join(directory, 'tokens.txt'), numThreads: 2, provider: 'cpu', debug: 0,
    },
  };
  const recognizer = new sherpa.OfflineRecognizer(config);
  const vad = new sherpa.Vad({
    sileroVad: { model: join(directory, 'silero_vad.onnx'), threshold: .5, minSilenceDuration: .5, minSpeechDuration: .25, maxSpeechDuration: 30, windowSize: 512 },
    sampleRate: 16000, numThreads: 2, provider: 'cpu', debug: 0,
  }, 32);
  port.on('message', ({ data }: { data: { id: string; audio: Uint8Array; language: SpeechLanguage } }) => {
    try {
      const audioSeconds = validateSpeechWave(data.audio), samples = decodeSpeechWave(data.audio);
      config.modelConfig.senseVoice.language = data.language;
      recognizer.setConfig(config); vad.reset();
      const started = performance.now(), texts: string[] = [];
      let first = true;
      const drain = (): void => {
        while (!vad.isEmpty()) {
          const segment = vad.front(false);
          const speech = first ? samples.subarray(Math.max(0, segment.start - 4800), segment.start + segment.samples.length) : segment.samples;
          first = false;
          const stream = recognizer.createStream();
          stream.acceptWaveform({ sampleRate: 16000, samples: speech });
          recognizer.decode(stream);
          texts.push(recognizer.getResult(stream).text.trim());
          vad.pop();
        }
      };
      for (let offset = 0; offset < samples.length; offset += 512) { vad.acceptWaveform(samples.subarray(offset, offset + 512)); drain(); }
      vad.flush(); drain();
      const result: SpeechResult = { text: texts.filter(Boolean).join(' ').trim(), audioSeconds, inferenceSeconds: (performance.now() - started) / 1000 };
      port.postMessage({ type: 'result', id: data.id, result });
    } catch { port.postMessage({ type: 'error', id: data.id, message: '本地转写失败，请重新录音。' }); }
  });
  port.postMessage({ type: 'ready' });
}

void initialize().catch(() => { port.postMessage({ type: 'error', message: '无法加载内置语音引擎，请修复安装后重试。' }); });
