// 冒烟:加载已构建产物启动 Electron,2.5 秒后自动退出(主进程打印 WORKBENCH_SMOKE_OK)
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const electronPath = require('electron');

const child = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, WORKBENCH_SMOKE: '1' },
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
