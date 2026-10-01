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
  for (const script of ['publish.mjs', 'package-release.ps1']) copyFileSync(path.join(projectRoot, 'tooling', script), path.join(directory, 'tooling', script));
  const publish = (...args: string[]) => spawnSync(process.execPath, [...args, 'tooling/publish.mjs', '--dry-run'], { cwd: directory, encoding: 'utf8' });
  return { directory, write, publish };
}

test('本地发布检查读取五项资产与本版 CHANGELOG，不上传或生成说明文件', t => {
  const { directory, publish } = fixture(t);
  const result = publish();
  assert.equal(result.status, 0, result.stderr);
  for (const file of assets) assert.ok(result.stdout.includes(file));
  assert.match(result.stdout, /gh(?:\.exe)? release create v2\.3\.4 --repo fixture\/workbench --verify-tag --latest/);
  assert.match(result.stdout, /当前版本的变更/);
  assert.doesNotMatch(result.stdout, /旧版变更/);
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
    tagName: `v${version}`, isDraft: false, isPrerelease: false, url: 'https://github.com/fixture/workbench/releases/tag/v2.3.4',
    assets: assets.map(file => ({ name: path.basename(file), size: statSync(path.join(f.directory, file)).size, url: `https://example.invalid/${path.basename(file)}` })),
  };
  f.write('state.json', JSON.stringify({ release, ...state }));
  f.write('stub.cjs', `
const fs = require('node:fs');
const cp = require('node:child_process');
const state = JSON.parse(fs.readFileSync('state.json', 'utf8'));
const log = value => fs.appendFileSync('calls.jsonl', JSON.stringify(value) + '\\n');
cp.spawnSync = (command, args) => {
  log({ command, args });
  let stdout = '';
  if (command === 'git') {
    if (args[0] === 'status') stdout = state.dirty ? ' M source.ts' : '';
    else if (args[0] === 'branch') stdout = 'main';
    else if (args[0] === 'rev-parse') stdout = args[1] === 'HEAD' ? 'abc123' : (state.wrongTag ? 'def456' : 'abc123');
    else if (args[0] === 'ls-remote') stdout = state.missingRemoteTag ? '' : 'abc123\\trefs/tags/v2.3.4';
    else throw new Error('Unexpected git command');
  } else if (command === 'gh' || command === 'gh.exe') {
    if (args[0] === '--version' || args[1] === 'create') stdout = '';
    else if (args[1] === 'view') stdout = JSON.stringify(state.release);
    else if (args[1] === 'download') stdout = state.badMetadata ? 'version: 1.0.0' : fs.readFileSync('release/metadata/latest.yml', 'utf8');
    else throw new Error('Unexpected gh command');
  } else if (command === 'curl' || command === 'curl.exe') {
    stdout = state.badDownload ? '404' : '200';
  } else throw new Error('Unexpected external command');
  return { status: 0, stdout, stderr: '' };
};
require('node:module').syncBuiltinESMExports();
`);
  const run = (mode?: string) => spawnSync(process.execPath, ['--require', './stub.cjs', 'tooling/publish.mjs', ...(mode ? [mode] : [])], { cwd: f.directory, encoding: 'utf8' });
  const calls = () => readFileSync(path.join(f.directory, 'calls.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  return { run, calls };
}

test('正式发布使用 gh release 的现有标签和说明文件，并核验五项下载与远端元数据', t => {
  const f = fixture(t);
  const { run, calls } = stubCommands(f);
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  const command = calls().find(call => call.args?.[1] === 'create');
  assert.deepEqual(command.args, ['release', 'create', 'v2.3.4', '--repo', 'fixture/workbench', '--verify-tag', '--latest', ...assets, '--title', 'Ono Workbench 2.3.4', '--notes-file', 'release/metadata/release-notes.md']);
  assert.match(readFileSync(path.join(f.directory, 'release/metadata/release-notes.md'), 'utf8'), /当前版本的变更/);
  const downloads = calls().filter(call => call.command === 'curl' || call.command === 'curl.exe');
  assert.equal(downloads.length, 5);
  assert.ok(downloads.every(call => call.args.includes('--head') && call.args.includes('--location')));
  assert.match(result.stdout, /核验通过/);
});

test('未提交、错误标签、未推送标签阻止上传；远端非正式发布和错误下载阻止通过核验', async t => {
  const cases: Array<[string, Record<string, unknown>, string | undefined, RegExp]> = [
    ['未提交', { dirty: true }, undefined, /工作区尚未提交/],
    ['本地标签指向旧提交', { wrongTag: true }, undefined, /必须指向当前提交/],
    ['远端标签缺失', { missingRemoteTag: true }, undefined, /远端 v2.3.4 未推送/],
    ['Draft', { release: { tagName: 'v2.3.4', isDraft: true, isPrerelease: false } }, '--verify', /必须是对应版本的正式发布/],
    ['下载地址错误', { badDownload: true }, '--verify', /未返回 HTTP 200/],
    ['远端元数据错误', { badMetadata: true }, '--verify', /GitHub latest.yml 与本地产物不一致/],
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
