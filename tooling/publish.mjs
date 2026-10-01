import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const gh = process.platform === 'win32' ? 'gh.exe' : 'gh';
const curl = process.platform === 'win32' ? 'curl.exe' : 'curl';
const read = file => readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, '');
const requireCheck = (condition, message) => { if (!condition) throw new Error(message); };
function run(command, args, inherit = false) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', stdio: inherit ? 'inherit' : 'pipe' });
  requireCheck(result.status === 0, result.error?.message ?? result.stderr?.trim() ?? `${command} 执行失败。`);
  return result.stdout?.trim() ?? '';
}
async function hash(file, algorithm, encoding = 'hex') {
  const digest = createHash(algorithm);
  for await (const chunk of createReadStream(path.join(root, file))) digest.update(chunk);
  return digest.digest(encoding);
}

async function main() {
  const mode = process.argv[2];
  requireCheck(process.argv.length <= 3 && (!mode || mode === '--dry-run' || mode === '--verify'), '用法：node tooling/publish.mjs [--dry-run|--verify]');
  const pkg = JSON.parse(read('package.json'));
  const version = pkg.version;
  requireCheck(/^\d+\.\d+\.\d+$/.test(version), '正式发布需要稳定版本号，例如 0.1.0。');
  const lock = JSON.parse(read('package-lock.json'));
  requireCheck(lock.version === version && lock.packages[''].version === version, 'package.json 与 package-lock.json 的版本不一致。');
  const repo = `${pkg.build.publish.owner}/${pkg.build.publish.repo}`;
  const tag = `v${version}`;
  const installer = `Ono-Workbench-Setup-${version}-x64.exe`;
  const files = [
    `release/installer/${installer}`,
    `release/installer/${installer}.blockmap`,
    'release/metadata/latest.yml',
    `release/portable/Ono-Workbench-${version}-Windows-x64-Portable.zip`,
    'release/SHA256SUMS.txt',
  ];
  for (const file of files) {
    requireCheck(statSync(path.join(root, file), { throwIfNoEntry: false })?.size > 0, `缺少发布产物或文件为空：${file}。请完整运行 npm run dist:installer。`);
  }
  const metadata = read(files[2]);
  requireCheck(/^version:\s*(\S+)/m.exec(metadata)?.[1] === version, 'latest.yml 版本不一致，请重新完整构建。');
  const fileEntry = /^  - url:\s*(\S+)\r?\n    sha512:\s*(\S+)\r?\n    size:\s*(\d+)/m.exec(metadata);
  const sha512 = await hash(files[0], 'sha512', 'base64');
  requireCheck(fileEntry?.[1] === installer && /^path:\s*(\S+)/m.exec(metadata)?.[1] === installer, 'latest.yml 的文件名与安装器不一致。');
  requireCheck(Number(fileEntry?.[3]) === statSync(path.join(root, files[0])).size && fileEntry?.[2] === sha512 && /^sha512:\s*(\S+)/m.exec(metadata)?.[1] === sha512, 'latest.yml 的大小或 SHA512 与安装器不一致。');
  const checksums = read(files[4]);
  for (const file of [files[0], files[3]]) {
    const entry = checksums.split(/\r?\n/).find(line => line.endsWith(` *${file.slice('release/'.length)}`));
    requireCheck(entry?.split(' ')[0].toLowerCase() === await hash(file, 'sha256'), `SHA256SUMS.txt 校验失败：${file}。`);
  }
  const changelog = read('CHANGELOG.md');
  const entryStart = new RegExp(`^## \\[${version.replaceAll('.', '\\.')}\\][^\\n]*\\n`, 'm').exec(changelog);
  requireCheck(entryStart, `CHANGELOG.md 中没有 ${version} 的条目。`);
  const bodyStart = entryStart.index + entryStart[0].length;
  const entryEnd = changelog.indexOf('\n## [', bodyStart);
  const changes = changelog.slice(bodyStart, entryEnd === -1 ? undefined : entryEnd).trim();
  requireCheck(changes && /^\s*-\s+\S/m.test(changes), `CHANGELOG.md 中 ${version} 的条目为空。`);
  const notes = [
    `Windows x64，版本 ${version}。`,
    '- 安装版（Setup）支持应用内自动下载更新和重启安装。',
    '- 便携版（Portable）需手动下载完整 ZIP 替换。',
    '- 应用数据保存在 %APPDATA%/OnoWorkbench；待办使用 %APPDATA%/To-Do-List/tasks.db。',
    '', '## 更新内容', '', changes,
  ].join('\n');
  const createArgs = ['release', 'create', tag, '--repo', repo, '--verify-tag', '--latest', ...files, '--title', `Ono Workbench ${version}`, '--notes-file', 'release/metadata/release-notes.md'];
  if (mode === '--dry-run') {
    console.log(`本地发布检查通过：${repo} / ${tag}\n${files.join('\n')}\n\n${gh} ${createArgs.map(arg => /\s/.test(arg) ? JSON.stringify(arg) : arg).join(' ')}\n\n${notes}`);
    return;
  }
  run(gh, ['--version']);
  if (mode !== '--verify') {
    requireCheck(run('git', ['status', '--porcelain']) === '', '工作区尚未提交。请先按提交清单提交、推送 main 和本次版本标签。');
    requireCheck(run('git', ['branch', '--show-current']) === 'main', '正式发布应从 main 分支执行。');
    const head = run('git', ['rev-parse', 'HEAD']);
    requireCheck(run('git', ['rev-parse', `${tag}^{commit}`]) === head, `${tag} 必须指向当前提交。`);
    const remoteTags = run('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`, `refs/tags/${tag}^{}`]).split(/\r?\n/);
    const remoteTag = remoteTags.find(line => line.endsWith(`refs/tags/${tag}^{}`)) ?? remoteTags.find(line => line.endsWith(`refs/tags/${tag}`));
    requireCheck(remoteTag?.split('\t')[0] === head, `远端 ${tag} 未推送或未指向当前提交。请推送 main 和本次版本标签。`);
    writeFileSync(path.join(root, 'release/metadata/release-notes.md'), notes, 'utf8');
    run(gh, createArgs, true);
  }
  const release = JSON.parse(run(gh, ['release', 'view', tag, '--repo', repo, '--json', 'tagName,isDraft,isPrerelease,url,assets']));
  requireCheck(release.tagName === tag && !release.isDraft && !release.isPrerelease, 'GitHub Release 必须是对应版本的正式发布，不能是 Draft 或 Pre-release。');
  for (const file of files) {
    const asset = release.assets.find(item => item.name === path.basename(file));
    requireCheck(asset?.size === statSync(path.join(root, file)).size, `GitHub 发布资产缺失或大小不符：${path.basename(file)}。`);
    const status = run(curl, ['--head', '--location', '--silent', '--show-error', '--max-time', '30', '--output', process.platform === 'win32' ? 'NUL' : '/dev/null', '--write-out', '%{http_code}', asset.url]);
    requireCheck(status === '200', `发布资产下载地址未返回 HTTP 200：${asset.name}（${status}）。`);
  }
  const publishedMetadata = run(gh, ['release', 'download', tag, '--repo', repo, '--pattern', 'latest.yml', '--output', '-']);
  requireCheck(publishedMetadata.replaceAll('\r\n', '\n') === metadata.trim().replaceAll('\r\n', '\n'), 'GitHub latest.yml 与本地产物不一致。');
  console.log(`正式 Release 与五项下载资产核验通过：${release.url}`);
}

main().catch(error => {
  console.error(error.message);
  console.error('若 Release 已创建但联网核验失败，可运行 npm run release:verify 重试核验。');
  process.exitCode = 1;
});
