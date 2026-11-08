import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { downloadRelease, findRelease, inspectReleaseFiles, releaseFiles, requireCheck } from './release-assets.mjs';

const root = path.resolve(import.meta.dirname, '..');
const gh = process.platform === 'win32' ? 'gh.exe' : 'gh';
const curl = process.platform === 'win32' ? 'curl.exe' : 'curl';
const read = file => readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, '');
function run(command, args, inherit = false) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', stdio: inherit ? 'inherit' : 'pipe' });
  requireCheck(result.status === 0, result.error?.message ?? result.stderr?.trim() ?? `${command} 执行失败。`);
  return result.stdout?.trim() ?? '';
}
async function main() {
  const args = process.argv.slice(2);
  const stages = ['--dry-run', '--verify', '--upload', '--verify-draft', '--publish'];
  requireCheck(args.every(arg => [...stages, '--prerelease', '--remote-only'].includes(arg)) && new Set(args).size === args.length && args.filter(arg => stages.includes(arg)).length <= 1 && (!args.includes('--remote-only') || args.includes('--verify')), '用法：node tooling/publish.mjs [--dry-run|--upload|--verify-draft|--publish|--verify] [--prerelease] [--remote-only]');
  const mode = args.find(arg => stages.includes(arg));
  const prerelease = args.includes('--prerelease');
  const remoteOnly = args.includes('--remote-only');
  const pkg = JSON.parse(read('package.json'));
  const version = pkg.version;
  requireCheck(/^\d+\.\d+\.\d+$/.test(version), '正式发布需要稳定版本号，例如 0.1.0。');
  const lock = JSON.parse(read('package-lock.json'));
  requireCheck(lock.version === version && lock.packages[''].version === version, 'package.json 与 package-lock.json 的版本不一致。');
  const repo = `${pkg.build.publish.owner}/${pkg.build.publish.repo}`;
  const tag = process.env.WORKBENCH_RELEASE_TAG || `v${version}`;
  requireCheck(/^v\d+\.\d+\.\d+$/.test(tag) && (remoteOnly || tag === `v${version}`), 'Release tag must match the built package version.');
  const releaseTitle = `OnO Workbench ${tag}`;
  const files = releaseFiles(version).map(file => `release/${file}`);
  const expected = remoteOnly ? undefined : await inspectReleaseFiles(path.join(root, 'release'), version);
  const changelog = read('CHANGELOG.md');
  const entryStart = new RegExp(`^## \\[${version.replaceAll('.', '\\.')}\\][^\\n]*\\n`, 'm').exec(changelog);
  requireCheck(entryStart, `CHANGELOG.md 中没有 ${version} 的条目。`);
  const bodyStart = entryStart.index + entryStart[0].length;
  const entryEnd = changelog.indexOf('\n## [', bodyStart);
  const changes = changelog.slice(bodyStart, entryEnd === -1 ? undefined : entryEnd).trim();
  requireCheck(changes && /^\s*-\s+\S/m.test(changes), `CHANGELOG.md 中 ${version} 的条目为空。`);
  const notes = [
    `Windows x64，版本 ${version}。`,
    ...(prerelease ? ['本版为预发布版，请手动下载测试；不替换正式最新版。'] : []),
    '- 安装版（Setup）支持应用内自动下载更新和重启安装。',
    '- 便携版（Portable）需手动下载完整 ZIP 替换。',
    '- 应用数据保存在 %APPDATA%/OnoWorkbench；待办使用 %APPDATA%/To-Do-List/tasks.db。',
    '', '## 更新内容', '', changes,
  ].join('\n');
  const createArgs = ['release', 'create', tag, '--repo', repo, '--verify-tag', '--draft', ...(prerelease ? ['--prerelease'] : []), '--title', releaseTitle, '--notes-file', 'release/metadata/release-notes.md'];
  if (mode === '--dry-run') {
    console.log(`本地发布检查通过：${repo} / ${tag}\n${files.join('\n')}\n\n${gh} ${createArgs.map(arg => /\s/.test(arg) ? JSON.stringify(arg) : arg).join(' ')}\n\n${notes}`);
    return;
  }
  run(gh, ['--version']);
  if (![ '--verify', '--verify-draft' ].includes(mode)) {
    requireCheck(run('git', ['status', '--porcelain']) === '', '工作区尚未提交。请先按提交清单提交、推送 main 和本次版本标签。');
    requireCheck(run('git', ['branch', '--show-current']) === 'main' || process.env.GITHUB_ACTIONS === 'true', '正式发布应从 main 或受控的 Actions 版本标签执行。');
    const head = run('git', ['rev-parse', 'HEAD']);
    requireCheck(run('git', ['rev-parse', `${tag}^{commit}`]) === head, `${tag} 必须指向当前提交。`);
    requireCheck(run('git', ['ls-remote', 'origin', 'refs/heads/main']).split('\t')[0] === head, 'Release source must match remote main.');
    const remoteTags = run('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`, `refs/tags/${tag}^{}`]).split(/\r?\n/);
    const remoteTag = remoteTags.find(line => line.endsWith(`refs/tags/${tag}^{}`)) ?? remoteTags.find(line => line.endsWith(`refs/tags/${tag}`));
    requireCheck(remoteTag?.split('\t')[0] === head, `远端 ${tag} 未推送或未指向当前提交。请推送 main 和本次版本标签。`);
  }
  let release = findRelease(run, gh, repo, tag);
  if (!release) {
    requireCheck(!['--verify', '--verify-draft', '--publish'].includes(mode), 'Release does not exist; upload the draft first.');
    writeFileSync(path.join(root, 'release/metadata/release-notes.md'), notes, 'utf8');
    run(gh, createArgs, true);
    release = findRelease(run, gh, repo, tag);
  }
  requireCheck(release?.prerelease === prerelease, 'GitHub Release 必须是对应版本的正式/Pre-release 通道。');
  requireCheck(release.name === releaseTitle, `GitHub Release 标题必须是 ${releaseTitle}。`);
  if (release.draft && !['--verify', '--verify-draft', '--publish'].includes(mode)) {
    for (const asset of expected) {
      const remote = release.assets.find(value => value.name === asset.name);
      if (remote?.size === asset.size && remote.digest === `sha256:${asset.sha256}`) continue;
      run(gh, ['release', 'upload', tag, '--repo', repo, asset.file, '--clobber'], true);
    }
    release = JSON.parse(run(gh, ['api', `repos/${repo}/releases/${release.id}`]));
    console.log(`RELEASE_ASSET_HASHES ${JSON.stringify(expected.map(({ name, size, sha256 }) => ({ name, size, sha256 })))}`);
    if (mode === '--upload') { console.log(`Release draft uploaded: id=${release.id}`); return; }
  }
  requireCheck(mode !== '--verify' || !release.draft, 'GitHub Release 必须是对应版本的正式发布，不能是 Draft。');
  requireCheck(mode !== '--verify-draft' || release.draft, 'Expected a release draft.');
  const verify = draft => downloadRelease({ run, gh, curl, repo, tag, release, expected, draft,
    directory: path.resolve(process.env.WORKBENCH_RELEASE_DOWNLOAD_DIR || path.join(root, 'release/downloads'), `${tag}-${draft ? 'draft' : 'published'}`) });
  await verify(release.draft);
  if (release.draft && mode !== '--verify-draft') {
    run(gh, ['api', '--method', 'PATCH', `repos/${repo}/releases/${release.id}`, '--field', 'draft=false', '--field', `prerelease=${prerelease}`, '--raw-field', `make_latest=${!prerelease}`]);
    release = JSON.parse(run(gh, ['api', `repos/${repo}/releases/${release.id}`]));
    requireCheck(!release.draft, 'Release is still a draft.');
    await verify(false);
  }
  console.log(`${release.draft ? '草稿' : prerelease ? '预发布' : '正式'} Release 五项文件已完整下载并通过 SHA256/SHA512 校验：${release.html_url}`);
}

main().catch(error => {
  console.error(error.message);
  console.error('草稿可用 --upload / --verify-draft / --publish 继续；已发布版本用 npm run release:verify 只读重试。独立核验远端版本可追加 --remote-only。');
  process.exitCode = 1;
});
