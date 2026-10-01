import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const weights = new Set(['400', '500', '600', '700', '800']);
const scale = new Set(
  [...readFileSync('src/shell.css', 'utf8').matchAll(/(--type-[a-z]+):\s*\d+px;/g)].map((match) => match[1]),
);
const problems = [];
let files = 0;

function checkDirectory(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      checkDirectory(path);
    } else if (entry.name.endsWith('.css')) {
      files += 1;
      const css = readFileSync(path, 'utf8');
      for (const match of css.matchAll(/font-size:\s*([^;}\n]+)/g)) {
        const token = /^var\((--[\w-]+)\)$/.exec(match[1].trim())?.[1];
        if (!token || !(scale.has(token) || (token === '--bazi-type-pillar' && path.endsWith('bazi.css')))) {
          problems.push(`${relative('.', path)}:${css.slice(0, match.index).split('\n').length} ${match[0]}`);
        }
      }
      for (const match of css.matchAll(/font-weight:\s*(\d+)\b/g)) {
        if (!weights.has(match[1])) {
          problems.push(`${relative('.', path)}:${css.slice(0, match.index).split('\n').length} ${match[0]}`);
        }
      }
    }
  }
}

checkDirectory('src');
checkDirectory('modules');
if (problems.length) {
  console.error('Typography declarations outside the shared scale:\n' + problems.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Typography tokens OK (${files} CSS files)`);
}
