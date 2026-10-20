import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { unzipSync } from 'fflate';
import { HushHourWorkbench } from '../electron/hush-hour-workbench';
import { DEFAULT_HUSH_HOUR_ONLINE_URL } from '../shared/hush-hour-contracts';
import type { HushHourIssueDraft, HushHourState } from '../shared/hush-hour-contracts';

async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const directory = await mkdtemp(join(tmpdir(), 'hush-hour-workbench-')), root = join(directory, 'site'), dataDir = join(directory, 'data');
  for (const path of ['app', 'dev', 'dist/client']) await mkdir(join(root, path), { recursive: true });
  await writeFile(join(root, 'app/page.tsx'), 'original source'); await writeFile(join(root, 'README.md'), '# Hush-Hour\nLocal website.');
  await writeFile(join(root, 'dev/build-site.mjs'), [
    "import { mkdir, readFile, writeFile } from 'node:fs/promises';",
    "import { spawn } from 'node:child_process';",
    "const mode = await readFile('build-mode.txt', 'utf8').catch(() => 'ok');",
    "if (mode === 'fail') { console.error('fixture build failure'); process.exit(2); }",
    "if (mode === 'slow') { const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']); console.log('CHILD=' + child.pid); setInterval(() => {}, 1000); }",
    "else {",
    "if (mode === 'change') await writeFile('app/page.tsx', 'source changed during build');",
    "const source = await readFile('app/page.tsx', 'utf8');",
    "await mkdir('dist/client', { recursive: true });",
    "for (const name of ['index.html', 'mood.html', 'catalog.html']) await writeFile('dist/client/' + name, '<h1>' + source + '</h1>');",
    "console.log('fixture build completed');",
    "}",
  ].join('\n'));
  for (const name of ['index.html', 'mood.html', 'catalog.html']) await writeFile(join(root, 'dist/client', name), '<h1>Original</h1>');
  const site = new HushHourWorkbench({ root, dataDir, port: 0, runtime: process.execPath });
  t.after(async () => { await site.dispose(); await rm(directory, { recursive: true, force: true }); });
  return { site, root, dataDir };
}
async function until(fn: () => boolean, label: string) { for (let i = 0; i < 80; i++) { if (fn()) return; await delay(50); } throw new Error('Timeout: ' + label); }

test('website service start, stop, restart and document reads stay within its own project', async t => {
  const { site, root } = await fixture(t);
  const initial = await site.open(); assert.equal(initial.root, root); assert.equal(initial.service.phase, 'running');
  assert.equal((await fetch(initial.service.url)).status, 200);
  assert.match((await site.readDocument()).content, /Hush-Hour/);
  for (const path of ['../outside.md', '/README.md', 'C:/README.md', 'app/page.tsx']) await assert.rejects(site.readDocument(path));
  assert.equal((await site.stop()).service.phase, 'stopped');
  await assert.rejects(fetch(initial.service.url));
  const restarted = await site.restart(); assert.equal(restarted.service.phase, 'running');
  assert.equal((await fetch(restarted.service.url)).status, 200);
});

test('fixed website builds are deduplicated and source changes remain stale until a new build', async t => {
  const { site, root } = await fixture(t);
  const initial = await site.open(); const snapshots: HushHourState[] = [];
  site.subscribe(value => snapshots.push(value));
  await delay(15); await writeFile(join(root, 'app/page.tsx'), 'updated source');
  await until(() => site.snapshot().sourceChanged, 'source update notice');
  const first = site.build(), second = site.build(); assert.equal(first, second);
  const built = await first;
  assert.equal(built.build.phase, 'passed'); assert.equal(built.sourceChanged, false); assert.notEqual(built.buildRevision, initial.buildRevision);
  assert.match(built.build.output, /fixture build completed/); assert.match(await (await fetch(built.service.url)).text(), /updated source/);
  assert(snapshots.some(value => value.build.phase === 'running'));
  await writeFile(join(root, 'build-mode.txt'), 'change');
  const changed = await site.build(); assert.equal(changed.build.phase, 'passed'); assert.equal(changed.sourceChanged, true);
  await delay(400); assert.equal(site.snapshot().sourceChanged, true);
  await writeFile(join(root, 'build-mode.txt'), 'ok'); assert.equal((await site.build()).sourceChanged, false);
});

test('a failed build reports real output and can be retried without stopping the preview', async t => {
  const { site, root } = await fixture(t);
  const original = await site.open();
  await writeFile(join(root, 'build-mode.txt'), 'fail');
  const failed = await site.build(); assert.equal(failed.build.phase, 'failed'); assert.match(failed.build.output, /fixture build failure/);
  assert.equal(failed.service.url, original.service.url); assert.equal((await fetch(original.service.url)).status, 200);
  await writeFile(join(root, 'build-mode.txt'), 'ok'); assert.equal((await site.build()).build.phase, 'passed');
});

test('cancelling a build ends its child process tree and permits another build', async t => {
  const { site, root } = await fixture(t);
  await site.open(); await writeFile(join(root, 'build-mode.txt'), 'slow');
  const pending = site.build(); await until(() => /CHILD=\d+/.test(site.snapshot().build.output), 'child process starts');
  const pid = Number(site.snapshot().build.output.match(/CHILD=(\d+)/)![1]);
  await assert.rejects(site.stop(), /构建/); await site.cancelBuild();
  assert.equal((await pending).build.phase, 'cancelled'); assert.throws(() => process.kill(pid, 0));
  await writeFile(join(root, 'build-mode.txt'), 'ok'); assert.equal((await site.build()).build.phase, 'passed');
});

test('website issues preserve screenshot and build-log snapshots and export only their manifest files', async t => {
  const { site, root, dataDir } = await fixture(t);
  await site.open(); await site.build();
  const png = Buffer.from('89504e470d0a1a0a00000000', 'hex');
  const shot = await site.capture(png, site.snapshot().service.url, site.snapshot().buildRevision);
  const draft: HushHourIssueDraft = { title: 'Catalog filter', steps: 'Open catalog and select a filter.', expected: 'Matching cards', actual: 'Unexpected card', environment: 'local', siteUrl: site.snapshot().service.url, pageUrl: site.snapshot().service.url + 'catalog.html', viewport: 'narrow', zoom: 1, previewRevision: shot.revision, screenshotIds: [shot.id], includeLogs: true };
  const record = await site.issues.save(draft, site.snapshot(), id => site.artifactPath(id));
  assert.match(record.id, /^HH-/); assert.equal(record.projectRoot, root); assert.match(record.buildLog, /fixture build completed/);
  await writeFile(join(record.directory, 'unrelated-secret.txt'), 'must not export');
  const files = unzipSync(await site.issues.archive(record.id));
  assert.deepEqual(Object.keys(files).map(file => file.slice(record.id.length + 1)).sort(), ['build-output.txt', 'issue.json', 'report.md', 'screenshots/1.png']);
  assert.deepEqual(await readFile(await site.issues.imagePath(record.id, shot.id)), png);
  await writeFile(join(root, 'build-mode.txt'), 'fail'); await site.build();
  assert.equal((await site.issues.read(record.id)).buildLog, record.buildLog);
  assert.equal((await site.issues.list())[0].id, record.id);
  const reopened = new HushHourWorkbench({ root, dataDir, port: 0 });
  try { await reopened.readState(); assert.deepEqual(await readFile(await reopened.artifactPath(shot.id)), png); assert.equal((await reopened.issues.read(record.id)).title, draft.title); }
  finally { await reopened.dispose(); }
});

test('website issue and screenshot paths reject unknown IDs, duplicate images and escaping links', async t => {
  const { site, root, dataDir } = await fixture(t); await site.open();
  await assert.rejects(site.capture(Buffer.from('not png'), '', ''));
  await assert.rejects(site.artifactPath('../README.md'));
  await assert.rejects(site.issues.read('../README.md'));
  const id = randomUUID(), draft: HushHourIssueDraft = { title: 'Issue', steps: 'Steps', expected: 'Expected', actual: 'Actual', environment: 'local', siteUrl: '', pageUrl: '', viewport: 'fit', zoom: 1, previewRevision: '', screenshotIds: [id, id], includeLogs: false };
  await assert.rejects(site.issues.save(draft, site.snapshot(), value => site.artifactPath(value)), /重复/);
  await assert.rejects(site.issues.save({ ...draft, screenshotIds: [id] }, site.snapshot(), value => site.artifactPath(value)), /不属于/);
  assert(!(await readdir(await site.issues.folder())).some(name => name.startsWith('.saving-')));
  const shot = await site.capture(Buffer.from('89504e470d0a1a0a00000000', 'hex'), site.snapshot().service.url, '');
  const outside = join(root, 'private'); await mkdir(outside); await writeFile(join(outside, `${shot.id}.png`), 'private');
  await rename(join(dataDir, 'captures'), join(dataDir, 'captures-original'));
  await symlink(outside, join(dataDir, 'captures'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(site.artifactPath(shot.id), /符号链接/);
});

test('the published address persists independently of the local project and rejects unsafe URLs', async t => {
  const { site, root, dataDir } = await fixture(t);
  assert.equal((await site.readState()).online.url, DEFAULT_HUSH_HOUR_ONLINE_URL);
  assert.equal(site.snapshot().service.phase, 'stopped');
  const url = 'https://production.example/site/catalog.html?drink=night#top';
  assert.equal((await site.configureOnline('  ' + url + '  ')).online.url, url);
  const saved = await readFile(join(dataDir, 'settings.json'), 'utf8');
  for (const invalid of ['javascript:alert(1)', 'file:///C:/private', 'https://user:password@example.com/', 'missing-host']) await assert.rejects(site.configureOnline(invalid));
  assert.equal(await readFile(join(dataDir, 'settings.json'), 'utf8'), saved);
  const reopened = new HushHourWorkbench({ root: join(root, 'missing'), dataDir, port: 0 });
  try {
    const current = await reopened.readState(); assert.equal(current.online.url, url); assert.equal(current.service.phase, 'stopped'); assert(current.sourceError);
    assert.equal((await reopened.configureOnline('')).online.url, '');
  } finally { await reopened.dispose(); }
  const cleared = new HushHourWorkbench({ root, dataDir, port: 0 });
  try { assert.equal((await cleared.readState()).online.url, ''); } finally { await cleared.dispose(); }
});

test('formal website evidence stays separate from local builds and rejects screenshots from another environment or address', async t => {
  const { site } = await fixture(t); await site.open(); await site.build();
  const png = Buffer.from('89504e470d0a1a0a00000000', 'hex'), local = await site.capture(png, site.snapshot().service.url, site.snapshot().buildRevision);
  const url = 'https://production.example/site/'; await site.configureOnline(url); await site.stop();
  const online = await site.capture(png, url + 'catalog.html', '', { environment: 'online', siteUrl: url });
  const draft: HushHourIssueDraft = { title: 'Formal catalog', steps: 'Open catalog.', expected: 'Matching cards', actual: 'Wrong card', environment: 'online', siteUrl: url, pageUrl: online.url, viewport: 'fit', zoom: 1, previewRevision: '', screenshotIds: [online.id], includeLogs: false };
  const save = (input: unknown) => site.issues.save(input, site.snapshot(), id => site.artifactPath(id));
  for (const input of [{ ...draft, includeLogs: true }, { ...draft, previewRevision: local.revision }, { ...draft, screenshotIds: [local.id] }, { ...draft, pageUrl: 'https://other.example/' }, { ...draft, environment: 'local' }]) await assert.rejects(save(input));
  const record = await save(draft); assert.equal(record.environment, 'online'); assert.equal(record.buildLog, ''); assert.equal(record.currentBuildRevision, '');
  assert.equal((await site.issues.list())[0].environment, 'online');
  const files = unzipSync(await site.issues.archive(record.id));
  assert.deepEqual(Object.keys(files).map(file => file.slice(record.id.length + 1)).sort(), ['issue.json', 'report.md', 'screenshots/1.png']);
  assert.match(new TextDecoder().decode(files[`${record.id}/report.md`]), /环境：正式网页/);
  await site.configureOnline('https://production.example/new/'); await assert.rejects(save(draft), /地址/);
  await assert.rejects(save({ ...draft, siteUrl: site.snapshot().online.url }), /截图/);
  assert.equal((await site.issues.read(record.id)).siteUrl, url);
});

test('existing local screenshot and issue files reopen with a local environment by default', async t => {
  const { site, dataDir, root } = await fixture(t); const state = await site.open();
  const shot = await site.capture(Buffer.from('89504e470d0a1a0a00000000', 'hex'), state.service.url, state.buildRevision);
  const { environment: _environment, siteUrl: _siteUrl, ...oldShot } = shot;
  await writeFile(join(dataDir, 'captures.json'), JSON.stringify([oldShot]));
  const record = await site.issues.save({ title: 'Legacy issue', steps: 'Steps', expected: 'Expected', actual: 'Actual', pageUrl: state.service.url, viewport: 'fit', zoom: 1, previewRevision: shot.revision, screenshotIds: [shot.id], includeLogs: false }, site.snapshot(), id => site.artifactPath(id));
  const manifest = JSON.parse(await readFile(join(record.directory, 'issue.json'), 'utf8')); delete manifest.environment; delete manifest.siteUrl;
  await writeFile(join(record.directory, 'issue.json'), JSON.stringify(manifest));
  const reopened = new HushHourWorkbench({ root, dataDir, port: 0 });
  try {
    assert.equal((await reopened.readState()).captures[0].environment, 'local');
    assert.equal((await reopened.issues.read(record.id)).environment, 'local');
    assert.deepEqual(await readFile(await reopened.issues.imagePath(record.id, shot.id)), await readFile(await reopened.artifactPath(shot.id)));
  } finally { await reopened.dispose(); }
});
