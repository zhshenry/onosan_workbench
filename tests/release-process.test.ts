import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { unzipSync } from 'fflate';

const projectRoot = path.resolve(import.meta.dirname, '..');
const version = '2.3.4';
const installer = `Ono-Workbench-Setup-${version}-x64.exe`;
const portable = `Ono-Workbench-${version}-Windows-x64-Portable.zip`;
const assets = [`release/installer/${installer}`, `release/installer/${installer}.blockmap`, 'release/metadata/latest.yml', `release/portable/${portable}`, 'release/SHA256SUMS.txt'];
const digest = (value: string | Buffer, algorithm = 'sha256', encoding: 'hex' | 'base64' = 'hex') => createHash(algorithm).update(value).digest(encoding);

function fixture(t: TestContext) {
  const directory = mkdtempSync(path.join(tmpdir(), 'ono-release-test-'));
  t.after(() => {
    assert.equal(path.dirname(directory), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith('ono-release-test-'));
    rmSync(directory, { recursive: true, force: true });
  });
  const write = (file: string, value: string | Buffer) => {
    const target = path.join(directory, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, value);
  };
  write('package.json', JSON.stringify({ type: 'module', version, build: { publish: { owner: 'fixture', repo: 'workbench' } } }));
  write('package-lock.json', JSON.stringify({ version, packages: { '': { version } } }));
  write('CHANGELOG.md', `# Changelog\n\n## [Unreleased]\n\n## [${version}] - 2026-10-01\n\n### Added\n\n- 当前版本的变更。\n\n## [2.3.3] - 2026-09-30\n\n- 旧版变更，不应进入本次说明。\n`);
  write(assets[0], 'installer fixture');
  write(assets[1], 'blockmap fixture');
  write(assets[3], 'portable fixture');
  write(assets[2], `version: ${version}\r\nfiles:\r\n  - url: ${installer}\r\n    sha512: ${digest('installer fixture', 'sha512', 'base64')}\r\n    size: 17\r\npath: ${installer}\r\nsha512: ${digest('installer fixture', 'sha512', 'base64')}\r\n`);
  write(assets[4], `\uFEFF${digest('installer fixture')} *installer/${installer}\r\n${digest('portable fixture')} *portable/${portable}\r\n`);
  write('docs/PORTABLE-README.txt', 'portable usage fixture');
  mkdirSync(path.join(directory, 'tooling'));
  for (const script of ['publish.mjs', 'release-assets.mjs', 'package-release.ps1']) copyFileSync(path.join(projectRoot, 'tooling', script), path.join(directory, 'tooling', script));
  const publish = (...args: string[]) => spawnSync(process.execPath, ['tooling/publish.mjs', '--dry-run', ...args], { cwd: directory, encoding: 'utf8' });
  return { directory, write, publish };
}

test('本地发布检查读取五项资产与本版 CHANGELOG，不上传或生成说明文件', t => {
  const { directory, publish } = fixture(t);
  const result = publish();
  assert.equal(result.status, 0, result.stderr);
  for (const file of assets) assert.ok(result.stdout.includes(file));
  assert.match(result.stdout, /gh(?:\.exe)? release create v2\.3\.4 --repo fixture\/workbench --verify-tag --draft/);
  assert.match(result.stdout, /--title "OnO Workbench v2\.3\.4"/);
  assert.match(result.stdout, /当前版本的变更/);
  assert.doesNotMatch(result.stdout, /旧版变更/);
  assert.equal(existsSync(path.join(directory, 'release/metadata/release-notes.md')), false);
});

test('预发布检查明确设置 Pre-release 且不替换 Latest', t => {
  const { directory, publish } = fixture(t);
  const result = publish('--prerelease');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--verify-tag --draft --prerelease/);
  assert.doesNotMatch(result.stdout, /--latest\s/);
  assert.match(result.stdout, /预发布版，请手动下载测试/);
  assert.equal(existsSync(path.join(directory, 'release/metadata/release-notes.md')), false);
});

test('发布检查阻止缺失资产、版本漂移、错误元数据、损坏文件与空变更记录', async t => {
  const cases: Array<[string, (value: ReturnType<typeof fixture>) => void, RegExp]> = [
    ['缺失便携包', f => rmSync(path.join(f.directory, assets[3])), /缺少发布产物/],
    ['锁文件版本漂移', f => f.write('package-lock.json', JSON.stringify({ version: '2.3.3', packages: { '': { version } } })), /版本不一致/],
    ['元数据版本漂移', f => f.write(assets[2], readFileSync(path.join(f.directory, assets[2]), 'utf8').replace('version: 2.3.4', 'version: 2.3.3')), /latest.yml 版本不一致/],
    ['安装器被改名', f => f.write(assets[2], readFileSync(path.join(f.directory, assets[2]), 'utf8').replaceAll(installer, 'renamed.exe')), /文件名与安装器不一致/],
    ['元数据大小错误', f => f.write(assets[2], readFileSync(path.join(f.directory, assets[2]), 'utf8').replace('size: 17', 'size: 18')), /大小或 SHA512/],
    ['安装器损坏', f => f.write(assets[0], 'corrupt installer'), /大小或 SHA512/],
    ['便携包损坏', f => f.write(assets[3], 'corrupt portable'), /SHA256SUMS.txt 校验失败/],
    ['缺失本版日志', f => f.write('CHANGELOG.md', '## [2.3.3]\n\n- older\n'), /没有 2.3.4 的条目/],
    ['空日志', f => f.write('CHANGELOG.md', `## [${version}]\n\n### Added\n\n## [2.3.3]\n\n- older\n`), /条目为空/],
  ];
  for (const [name, mutate, message] of cases) await t.test(name, child => {
    const value = fixture(child);
    mutate(value);
    const result = value.publish();
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, message);
  });
});

function stubCommands(f: ReturnType<typeof fixture>, state: Record<string, unknown> = {}) {
  const release = {
    id: 123, tag_name: `v${version}`, name: `OnO Workbench v${version}`, draft: state.draft === true, prerelease: state.prerelease === true, html_url: 'https://github.com/fixture/workbench/releases/tag/v2.3.4',
    assets: assets.map((file, index) => ({ id: index + 1, state: 'uploaded', name: path.basename(file), size: statSync(path.join(f.directory, file)).size, digest: `sha256:${digest(readFileSync(path.join(f.directory, file)))}`, browser_download_url: `https://github.com/fixture/workbench/releases/download/v2.3.4/${path.basename(file)}` })),
  };
  const content = Object.fromEntries(assets.map(file => [path.basename(file), readFileSync(path.join(f.directory, file)).toString('base64')]));
  f.write('state.json', JSON.stringify({ release, content, exists: true, ...state }));
  f.write('stub.cjs', `
const fs = require('node:fs');
const cp = require('node:child_process');
const state = JSON.parse(fs.readFileSync('state.json', 'utf8'));
const expectedAssets = structuredClone(state.release.assets);
if (state.partialDraft) state.release.assets = [expectedAssets[0], { ...expectedAssets[1], size: 1 }];
const log = value => fs.appendFileSync('calls.jsonl', JSON.stringify(value) + '\\n');
cp.spawnSync = (command, args) => {
  log({ command, args });
  let stdout = '';
  if (command === 'git') {
    if (args[0] === 'status') stdout = state.dirty ? ' M source.ts' : '';
    else if (args[0] === 'branch') stdout = 'main';
    else if (args[0] === 'rev-parse') stdout = args[1] === 'HEAD' ? 'abc123' : (state.wrongTag ? 'def456' : 'abc123');
    else if (args[0] === 'ls-remote') stdout = args.includes('refs/heads/main') ? 'abc123\\trefs/heads/main' : state.missingRemoteTag ? '' : 'abc123\\trefs/tags/v2.3.4';
    else throw new Error('Unexpected git command');
  } else if (command === 'gh' || command === 'gh.exe') {
    if (args[0] === '--version') stdout = '';
    else if (args[1] === 'create') { state.exists = true; state.release.draft = true; state.release.assets = []; }
    else if (args[1] === 'upload') {
      const name = require('node:path').basename(args[5]);
      state.release.assets = state.release.assets.filter(asset => asset.name !== name);
      state.release.assets.push(expectedAssets.find(asset => asset.name === name));
    }
    else if (args[0] === 'api' && args.includes('PATCH')) state.release.draft = false;
    else if (args[0] === 'api' && args.includes('--paginate')) stdout = state.exists ? '123' : '';
    else if (args[0] === 'api' && args[1] === 'repos/fixture/workbench/releases/123') stdout = JSON.stringify(state.release);
    else if (args[1] === 'download') {
      const name = args[args.indexOf('--pattern') + 1];
      fs.writeFileSync(args[args.indexOf('--output') + 1], Buffer.from(state.content[name], 'base64'));
    }
    else throw new Error('Unexpected gh command');
  } else if (command === 'curl' || command === 'curl.exe') {
    if (state.badDownload) return { status: 22, stdout: '', stderr: 'HTTP 404' };
    const name = args.at(-1).split('/').at(-1);
    let content = Buffer.from(state.content[name], 'base64');
    if (state.corruptDownload === name) { content = Buffer.from(content); content[0] ^= 1; }
    fs.writeFileSync(args[args.indexOf('--output') + 1], content);
  } else throw new Error('Unexpected external command');
  return { status: 0, stdout, stderr: '' };
};
require('node:module').syncBuiltinESMExports();
`);
  const run = (...args: (string | undefined)[]) => spawnSync(process.execPath, ['--require', './stub.cjs', 'tooling/publish.mjs', ...args.filter((arg): arg is string => arg !== undefined)], { cwd: f.directory, encoding: 'utf8' });
  const calls = () => readFileSync(path.join(f.directory, 'calls.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  return { run, calls };
}

test('创建草稿后按 ID 核验完整下载，通过后才发布并再下载公开文件', t => {
  const f = fixture(t);
  const { run, calls } = stubCommands(f, { exists: false });
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  const command = calls().find(call => call.args?.[1] === 'create');
  assert.deepEqual(command.args, ['release', 'create', 'v2.3.4', '--repo', 'fixture/workbench', '--verify-tag', '--draft', '--title', 'OnO Workbench v2.3.4', '--notes-file', 'release/metadata/release-notes.md']);
  assert.match(readFileSync(path.join(f.directory, 'release/metadata/release-notes.md'), 'utf8'), /当前版本的变更/);
  const downloads = calls().filter(call => call.command === 'curl' || call.command === 'curl.exe');
  assert.equal(downloads.length, 5);
  assert.ok(downloads.every(call => !call.args.includes('--head') && call.args.includes('--output') && call.args.includes('--location')));
  const entries = calls();
  assert.equal(entries.filter(call => call.args?.[1] === 'upload').length, 5);
  assert.equal(entries.filter(call => call.args?.[1] === 'download').length, 5);
  const patch = entries.findIndex(call => call.args?.includes('PATCH'));
  assert.ok(patch > entries.findLastIndex(call => call.args?.[1] === 'download'));
  assert.ok(entries.slice(0, patch).some(call => call.args?.includes('repos/fixture/workbench/releases/123')));
  assert.ok(!entries.some(call => call.args?.some((arg: string) => arg.includes('releases/tags/'))));
  assert.match(result.stdout, /完整下载.*SHA256\/SHA512/);
});

test('部分上传失败后的草稿只补传缺失或不同的文件，保持草稿并允许后续独立验收', t => {
  const f = fixture(t), { run, calls } = stubCommands(f, { draft: true, partialDraft: true });
  const result = run('--upload');
  assert.equal(result.status, 0, result.stderr);
  const uploads = calls().filter(call => call.args?.[1] === 'upload');
  assert.equal(uploads.length, 4);
  assert.equal(uploads.some(call => path.basename(call.args[5]) === installer), false);
  assert.equal(calls().some(call => call.args?.includes('PATCH')), false);
  assert.equal(calls().some(call => call.command.startsWith('curl')), false);
});

test('预发布创建和只读核验均要求 Pre-release，拒绝与正式通道混用', async t => {
  await t.test('创建预发布', child => {
    const f = fixture(child), { run, calls } = stubCommands(f, { prerelease: true, exists: false });
    const result = run('--prerelease');
    assert.equal(result.status, 0, result.stderr);
    const command = calls().find(call => call.args?.[1] === 'create');
    assert.ok(command.args.includes('--prerelease') && command.args.includes('--draft'));
    assert.ok(!command.args.includes('--latest'));
    assert.ok(calls().find(call => call.args?.includes('PATCH')).args.includes('make_latest=false'));
    assert.match(result.stdout, /预发布 Release.*完整下载/);
  });
  for (const [name, state, args, success] of [
    ['只读核验预发布', { prerelease: true }, ['--prerelease', '--verify'], true],
    ['正式校验拒绝预发布', { prerelease: true }, ['--verify'], false],
    ['预发布校验拒绝正式版', {}, ['--verify', '--prerelease'], false],
  ] as const) await t.test(name, child => {
    const f = fixture(child), { run, calls } = stubCommands(f, state);
    const result = run(...args);
    assert.equal(result.status, success ? 0 : 1, result.stderr);
    assert.equal(calls().some(call => call.args?.[1] === 'create'), false);
    assert.match(success ? result.stdout : result.stderr, success ? /预发布 Release.*完整下载/ : /GitHub Release 必须是/);
  });
});

test('未提交、错误标签、未推送标签阻止上传；远端非正式发布和错误下载阻止通过核验', async t => {
  const cases: Array<[string, Record<string, unknown>, string | undefined, RegExp]> = [
    ['未提交', { dirty: true }, undefined, /工作区尚未提交/],
    ['本地标签指向旧提交', { wrongTag: true }, undefined, /必须指向当前提交/],
    ['远端标签缺失', { missingRemoteTag: true }, undefined, /远端 v2.3.4 未推送/],
    ['Draft', { draft: true }, '--verify', /必须是对应版本的正式发布/],
    ['标题格式错误', { release: { tag_name: 'v2.3.4', name: 'Ono Workbench 2.3.4', draft: false, prerelease: false } }, '--verify', /标题必须是 OnO Workbench v2\.3\.4/],
    ['下载地址错误', { badDownload: true }, '--verify', /HTTP 404/],
    ['下载后同等大小的文件损坏', { corruptDownload: installer }, '--verify', /Downloaded file size or SHA256 mismatch/],
  ];
  for (const [name, state, mode, message] of cases) await t.test(name, child => {
    const f = fixture(child);
    const { run, calls } = stubCommands(f, state);
    const result = run(mode);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, message);
    assert.equal(calls().some(call => call.args?.[1] === 'create'), false);
  });
});

test('草稿校验与公开版本重试均只读，重试会重新计算缓存文件哈希', t => {
  const f = fixture(t), { run, calls } = stubCommands(f);
  assert.equal(run('--verify').status, 0);
  const verifiedFile = path.join(f.directory, 'release/downloads/v2.3.4-published', installer);
  writeFileSync(verifiedFile, 'corrupted cache');
  assert.equal(run('--verify').status, 0);
  assert.equal(readFileSync(verifiedFile, 'utf8'), 'installer fixture');
  const entries = calls();
  assert.equal(entries.filter(call => call.command.startsWith('curl')).length, 6);
  assert.ok(!entries.some(call => call.args?.includes('PATCH') || ['create', 'upload'].includes(call.args?.[1])));
  const report = JSON.parse(readFileSync(path.join(path.dirname(verifiedFile), 'verification.json'), 'utf8'));
  assert.equal(report.status, 'passed'); assert.equal(report.assets.length, 5);
});

test('独立远端校验不要求重建安装包，仍校验实际下载的元数据与校验清单', t => {
  const f = fixture(t), { run } = stubCommands(f);
  for (const file of assets) rmSync(path.join(f.directory, file));
  const result = run('--verify', '--remote-only');
  assert.equal(result.status, 0, result.stderr);
});

test('独立远端校验拒绝自洽服务端哈希下的错误更新元数据及多余资产', async t => {
  for (const kind of ['metadata', 'extra-asset']) await t.test(kind, child => {
    const f = fixture(child), { run } = stubCommands(f);
    const stateFile = path.join(f.directory, 'state.json');
    const state = JSON.parse(readFileSync(stateFile, 'utf8'));
    if (kind === 'metadata') {
      const content = Buffer.from('version: 0.0.0');
      state.content['latest.yml'] = content.toString('base64');
      const asset = state.release.assets.find((value: { name: string }) => value.name === 'latest.yml');
      asset.size = content.length; asset.digest = `sha256:${digest(content)}`;
    } else state.release.assets.push({ name: 'unexpected.exe' });
    writeFileSync(stateFile, JSON.stringify(state));
    const result = run('--verify', '--remote-only');
    assert.equal(result.status, 1); assert.match(result.stderr, kind === 'metadata' ? /latest.yml 版本不一致/ : /exactly the five expected/);
  });
});

test('真实升级脚本在开发者主机提前拒绝，不能修改本机安装和更新缓存', () => {
  const result = spawnSync(process.execPath, ['tooling/windows-upgrade-pilot.mjs'], {
    cwd: projectRoot, encoding: 'utf8', env: { ...process.env, GITHUB_ACTIONS: 'false' },
  });
  assert.equal(result.status, 1); assert.match(result.stderr, /never run a real upgrade on a developer profile/);
});

test('草稿文件与候选构建不一致时阻止发布，已上传草稿可以只验收不发布', t => {
  const f = fixture(t), { run, calls } = stubCommands(f, { draft: true });
  const result = run('--verify-draft');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(calls().some(call => call.args?.includes('PATCH')), false);
  f.write(assets[1], 'different accepted blockmap');
  const rejected = run('--publish');
  assert.equal(rejected.status, 1); assert.match(rejected.stderr, /differs from the accepted build/);
  assert.equal(calls().some(call => call.args?.includes('PATCH')), false);
});

test('独立发布阶段核验草稿后仅发布，公开下载由独立只读阶段验收', t => {
  const f = fixture(t), { run, calls } = stubCommands(f, { draft: true });
  const result = run('--publish');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(calls().filter(call => call.args?.includes('PATCH')).length, 1);
  assert.equal(calls().filter(call => call.args?.[1] === 'download').length, 5);
  assert.equal(calls().filter(call => call.command.startsWith('curl')).length, 0);
  assert.match(result.stdout, /separate remaining stages/);
});

test('完整发行打包保留运行文件、剥离便携更新源、归档旧版本并清理展开目录', { skip: process.platform !== 'win32' }, t => {
  const f = fixture(t);
  f.write('release/win-unpacked/Ono Workbench.exe', 'app fixture');
  f.write('release/win-unpacked/resources/app-update.yml', 'provider: github');
  f.write('release/win-unpacked/resources/runtime.dll', 'native runtime fixture');
  f.write(`release/${installer}`, 'installer fixture');
  f.write(`release/${installer}.blockmap`, 'blockmap fixture');
  f.write('release/latest.yml', readFileSync(path.join(f.directory, assets[2])));
  f.write('release/portable/Ono-Workbench-2.3.3-Windows-x64-Portable.zip', 'old portable');
  f.write('release/installer/Ono-Workbench-Setup-2.3.3-x64.exe', 'old installer');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'tooling/package-release.ps1', '-Mode', 'All'], { cwd: f.directory, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const zip = unzipSync(readFileSync(path.join(f.directory, assets[3])));
  const prefix = `Ono Workbench ${version} Portable/`;
  assert.equal(Buffer.from(zip[`${prefix}Ono Workbench.exe`]).toString(), 'app fixture');
  assert.equal(Buffer.from(zip[`${prefix}resources/runtime.dll`]).toString(), 'native runtime fixture');
  assert.equal(Buffer.from(zip[`${prefix}README.txt`]).toString(), 'portable usage fixture');
  assert.equal(zip[`${prefix}resources/app-update.yml`], undefined);
  assert.equal(existsSync(path.join(f.directory, 'release/win-unpacked')), false);
  assert.equal(existsSync(path.join(f.directory, 'release/portable', `Ono Workbench ${version} Portable`)), false);
  assert.ok(existsSync(path.join(f.directory, 'release/archive/2.3.3/portable/Ono-Workbench-2.3.3-Windows-x64-Portable.zip')));
  assert.ok(existsSync(path.join(f.directory, 'release/archive/2.3.3/installer/Ono-Workbench-Setup-2.3.3-x64.exe')));
  assert.equal(f.publish().status, 0);
});

test('单独便携打包不依赖安装器，完整发行缺少资产时在修改展开目录前中止', { skip: process.platform !== 'win32' }, t => {
  const f = fixture(t);
  f.write('release/win-unpacked/Ono Workbench.exe', 'portable app');
  for (const file of assets) rmSync(path.join(f.directory, file));
  const powershell = (mode: string) => spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'tooling/package-release.ps1', '-Mode', mode], { cwd: f.directory, encoding: 'utf8' });
  const rejected = powershell('All');
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /Required installer artifact is missing/);
  assert.equal(existsSync(path.join(f.directory, 'release/win-unpacked/Ono Workbench.exe')), true);
  const portableOnly = powershell('Portable');
  assert.equal(portableOnly.status, 0, portableOnly.stderr);
  const zip = unzipSync(readFileSync(path.join(f.directory, assets[3])));
  assert.ok(zip[`Ono Workbench ${version} Portable/Ono Workbench.exe`]);
  const checksums = readFileSync(path.join(f.directory, assets[4]), 'utf8');
  assert.match(checksums, /\*portable\/Ono-Workbench-2.3.4-Windows-x64-Portable\.zip/);
  assert.doesNotMatch(checksums, /\*installer\//);
});
