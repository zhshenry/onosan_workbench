import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HushHourPreview } from '../electron/hush-hour';

async function fixture() {
  const project = await mkdtemp(join(tmpdir(), 'hush-hour-'));
  const client = join(project, 'dist', 'client');
  await mkdir(join(client, 'assets'), { recursive: true });
  await writeFile(join(client, 'index.html'), '<h1>Hush-Hour</h1>');
  await writeFile(join(client, 'catalog.html'), '<h1>酒谱</h1>');
  await writeFile(join(client, 'catalog.rsc'), 'catalog component');
  await writeFile(join(client, 'assets', 'app.js'), 'window.hushHour = true;');
  return { project, client };
}

test('Hush-Hour serves the static export and reuses one loopback server', async t => {
  const { project } = await fixture(), preview = new HushHourPreview(project, 0);
  t.after(async () => { await preview.dispose(); await rm(project, { recursive: true, force: true }); });
  const [url, second] = await Promise.all([preview.open(), preview.open()]);
  assert.equal(second, url);
  assert.equal(new URL(url).hostname, '127.0.0.1');
  for (const path of ['', 'catalog', 'catalog.html']) {
    const response = await fetch(new URL(path, url));
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type')!, /text\/html/);
    assert.match(await response.text(), /Hush-Hour|酒谱/);
  }
  const script = await fetch(new URL('assets/app.js', url));
  assert.match(script.headers.get('content-type')!, /javascript/);
  assert.equal(await script.text(), 'window.hushHour = true;');
  const component = await fetch(new URL('catalog.rsc', url));
  assert.equal(component.headers.get('content-type'), 'text/x-component');
  const head = await fetch(url, { method: 'HEAD' });
  assert.equal(head.status, 200); assert.equal(await head.text(), '');
  await preview.dispose();
  await assert.rejects(fetch(url, { signal: AbortSignal.timeout(1000) }));
});

test('Hush-Hour rejects writes, malformed paths and files outside the exported site', async t => {
  const { project, client } = await fixture(), preview = new HushHourPreview(project, 0);
  t.after(async () => { await preview.dispose(); await rm(project, { recursive: true, force: true }); });
  const outside = join(project, 'private');
  await mkdir(outside); await writeFile(join(outside, 'secret.txt'), 'private source');
  await symlink(outside, join(client, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
  const url = await preview.open();
  const write = await fetch(url, { method: 'POST', body: 'do not write' });
  assert.equal(write.status, 405); assert.equal(write.headers.get('allow'), 'GET, HEAD');
  assert.equal((await fetch(`${url}%invalid`)).status, 400);
  assert.equal((await fetch(`${url}missing.html`)).status, 404);
  assert.equal((await fetch(`${url}escape/secret.txt`)).status, 403);
  const traversal = await fetch(`${url}%2e%2e%5cprivate%5csecret.txt`);
  assert.notEqual(traversal.status, 200); assert.doesNotMatch(await traversal.text(), /private source/);
});

test('Hush-Hour can retry after its static build becomes available', async t => {
  const project = await mkdtemp(join(tmpdir(), 'hush-hour-missing-')), preview = new HushHourPreview(project, 0);
  t.after(async () => { await preview.dispose(); await rm(project, { recursive: true, force: true }); });
  await assert.rejects(preview.open(), /npm run build:site/);
  await mkdir(join(project, 'dist', 'client'), { recursive: true });
  await assert.rejects(preview.open(), /构建不完整/);
  await writeFile(join(project, 'dist', 'client', 'index.html'), '<h1>Ready</h1>');
  assert.match(await (await fetch(await preview.open())).text(), /Ready/);
});

test('Hush-Hour reports an occupied port and can retry after it is released', async t => {
  const { project } = await fixture(), first = new HushHourPreview(project, 0);
  const url = await first.open(), second = new HushHourPreview(project, Number(new URL(url).port));
  t.after(async () => { await first.dispose(); await second.dispose(); await rm(project, { recursive: true, force: true }); });
  await assert.rejects(second.open(), /端口.*已被占用/);
  await first.dispose();
  assert.equal(await second.open(), url);
});
