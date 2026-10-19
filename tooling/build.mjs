// 主进程/preload 打包:esbuild → dist-electron/*.cjs
// banner+define:pi-coding-agent 在模块加载时读 import.meta.url,CJS 输出下需注入等价物(上游同款解法)
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
import { prepareSpeechAssets } from './speech-assets.mjs';

await prepareSpeechAssets();

mkdirSync('dist-electron', { recursive: true });

const shared = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  // LibreOffice kit uses sibling worker files and a native runtime resolved from its own package path.
  external: ['electron', 'electron-updater', '@deepseek-ai/libreoffice-kit', 'node-pty', 'sherpa-onnx-node'],
  minify: true,
  sourcemap: false,
  logLevel: 'info',
};

await build({ ...shared, entryPoints: ['electron/preload.ts'], outfile: 'dist-electron/preload.cjs' });
await build({ ...shared, entryPoints: ['electron/speech-worker.ts'], outfile: 'dist-electron/speech-worker.cjs' });
await build({
  ...shared,
  entryPoints: ['electron/main.ts'],
  outfile: 'dist-electron/main.cjs',
  banner: { js: 'var import_meta_url = require("url").pathToFileURL(__filename).href;' },
  define: { 'import.meta.url': 'import_meta_url' },
});
