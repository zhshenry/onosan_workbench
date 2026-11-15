// 从项目依赖导出稿子用到的 Phosphor 图标，生成离线 icons.js（window.PH）。
// 用法：在项目根目录运行 node design/glass-concepts-2026-11-14/tools/icons.mjs
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as P from '@phosphor-icons/react/dist/ssr';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const icons = [
  ['sidebar', 'SidebarSimple'], ['calendar', 'CalendarBlank'], ['check-square', 'CheckSquare'],
  ['caret-down', 'CaretDown', 'bold'], ['caret-left', 'CaretLeft', 'bold'], ['caret-right', 'CaretRight', 'bold'],
  ['download', 'DownloadSimple'], ['sparkle', 'Sparkle'], ['sparkle-fill', 'Sparkle', 'fill'],
  ['plus', 'Plus', 'bold'], ['pencil', 'PencilSimple'], ['timer', 'Timer'], ['gift', 'Gift'],
  ['arrow-right', 'ArrowRight'], ['play', 'Play', 'fill'], ['dot', 'Circle', 'fill'], ['link', 'LinkSimple'],
  ['chart', 'ChartBar'], ['clock', 'Clock'], ['check', 'Check', 'bold'], ['info', 'Info'],
  ['mic', 'Microphone'], ['send', 'PaperPlaneRight', 'fill'], ['house', 'House'], ['flask', 'Flask'],
  ['gear', 'GearSix'], ['list-checks', 'ListChecks'], ['search', 'MagnifyingGlass'], ['video', 'VideoCamera'],
  ['x', 'X'], ['minus', 'Minus'], ['dots', 'DotsThree', 'bold'], ['check-circle', 'CheckCircle', 'fill'],
  ['note', 'Note'], ['sun', 'Sun'], ['moon', 'Moon'], ['warning', 'WarningCircle'],
];

const out = {};
for (const [key, name, weight = 'regular'] of icons) {
  const Icon = P[name];
  if (!Icon) throw new Error(`missing icon ${name}`);
  out[key] = renderToStaticMarkup(createElement(Icon, { size: '1em', weight })).replace(' xmlns="http://www.w3.org/2000/svg"', '');
}
const target = fileURLToPath(new URL('../icons.js', import.meta.url));
writeFileSync(target, `// 由 tools/icons.mjs 生成的 Phosphor 图标（MIT）。\nwindow.PH = ${JSON.stringify(out, null, 1)};\n`);
console.log(`wrote ${Object.keys(out).length} icons → ${target}`);
