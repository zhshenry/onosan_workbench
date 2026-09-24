// 开发模式:先构建主进程/preload,再起 Vite(5174)与 Electron。
// 修改 electron/、shared/ 或主进程引用的 modules/ 后请重启 npm run dev。
import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

await import('./build.mjs');
const server = await createServer({ configFile: 'vite.config.ts' });
await server.listen();
server.printUrls();

const electronPath = require('electron');
const child = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    WORKBENCH_DEV_URL: 'http://localhost:5174',
    ELECTRON_ENABLE_LOGGING: '1',
  },
});

child.on('exit', () => {
  server.close();
  process.exit(0);
});

const forward = (signal) => {
  process.on(signal, () => {
    child.kill();
    server.close();
    process.exit(0);
  });
};
for (const sig of ['SIGINT', 'SIGTERM']) forward(sig);
