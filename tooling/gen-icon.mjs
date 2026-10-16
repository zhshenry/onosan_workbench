// 同步 Windows 外部应用图标。icon.ico 与 icon-source.png 均提取自 v0.2.0
// 的原始 Electron 图标资源；安装器和卸载器共用 icon.ico。
// 仅同步托盘/通知 PNG，保留原始 ICO 和 PNG，不重新绘制。
// 软件左上角与悬浮待办内的 LogoMark 继续由 src/icons.tsx 管理。
// 用法: node tooling/gen-icon.mjs
import { copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const assetsDir = join(dirname(fileURLToPath(import.meta.url)), '../assets');
copyFileSync(join(assetsDir, 'icon-source.png'), join(assetsDir, 'tray.png'));
console.log('assets/tray.png synced from the original Electron PNG; assets/icon.ico preserved.');
