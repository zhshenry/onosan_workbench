import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { PersonalWebsiteContent } from '../electron/personal-website-content';
import { PersonalWebsite } from '../electron/personal-website';
import { WebsiteIdSchema, websitePreviewPath } from '../shared/personal-website-contracts';

async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const directory = await mkdtemp(join(tmpdir(), 'personal-website-')), root = join(directory, 'site');
  for (const path of ['src/content/works', 'src/content/blog', 'src/content/library', 'public/images']) await mkdir(join(root, path), { recursive: true });
  const content = new PersonalWebsiteContent(root);
  const cleanups: (() => Promise<unknown>)[] = [];
  t.after(async () => { for (const cleanup of cleanups) await cleanup(); assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep + 'personal-website-')); await rm(directory, { recursive: true, force: true }); });
  return { directory, root, content, cleanups };
}
const source = '\uFEFF---\r\n# preserve me\r\ntitle: Data Harness # title note\r\ndescription: Original\r\nyear: 2026\r\ncategory: product\r\ncustom:\r\n  nested: [one, two]\r\n---\r\n\r\nOriginal **body**.\r\n';

test('content edits round-trip real YAML metadata, comments, BOM, line endings and body', async t => {
  const { root, content } = await fixture(t), file = join(root, 'src/content/works/data-harness.md');
  await writeFile(file, source);
  const original = await content.read('works/data-harness.md');
  assert.equal(original.fields.title, 'Data Harness');
  const input = { ...original, fields: { ...original.fields, title: 'Changed: title', featured: true }, body: '\nNew body with [link](https://example.org).\n' };
  const request = { id: input.id, version: input.version, fields: input.fields, body: input.body };
  const preview = await content.previewSave(request);
  assert.equal(await readFile(file, 'utf8'), source);
  assert.match(preview.after, /# preserve me/); assert.match(preview.after, /# title note/); assert.match(preview.after, /nested: \[\s*one, two\s*\]/);
  const saved = await content.save(request);
  assert.equal(saved.fields.title, 'Changed: title'); assert.equal(saved.fields.featured, true);
  assert.ok(saved.source.startsWith('\uFEFF---\r\n')); assert.equal(saved.source.replaceAll('\r\n', '').includes('\n'), false);
  assert.equal(await readFile(file, 'utf8'), saved.source); assert.notEqual(saved.version, original.version);
});
test('external changes, stale concurrent saves and new filename collisions never overwrite content', async t => {
  const { root, content } = await fixture(t), file = join(root, 'src/content/works/data-harness.md');
  await writeFile(file, source); const original = await content.read('works/data-harness.md');
  const request = { id: original.id, version: original.version, fields: original.fields, body: 'Updated' };
  await writeFile(file, source + 'External change');
  await assert.rejects(content.save(request), /其他编辑器修改/); assert.match(await readFile(file, 'utf8'), /External change$/);
  assert.match((await content.previewSave(request)).before, /External change$/);
  const fresh = await content.read(original.id);
  const concurrent = await Promise.allSettled([content.save({ ...request, version: fresh.version, body: 'First' }), content.save({ ...request, version: fresh.version, body: 'Second' })]);
  assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1, concurrent.map(result => result.status === 'rejected' ? String(result.reason) : 'saved').join('\n'));
  assert.equal((await content.read(original.id)).body, 'First');
  await assert.rejects(content.save({ ...request, version: '' }), /同名内容/);
});
test('new blog and nested library content are validated and previews do not create directories', async t => {
  const { root, content } = await fixture(t);
  const request = { id: 'library/agent/new-note.md', version: '', fields: { title: '新文库', summary: '摘要', board: 'agent', order: 2 }, body: '# 正文\n' };
  await content.previewSave(request); assert.deepEqual(await readdir(join(root, 'src/content/library')), []);
  await content.save(request); assert.equal((await content.list())[0].title, '新文库');
  await assert.rejects(content.save({ id: 'blog/post.md', version: '', fields: { title: 'Title', summary: 'Summary', date: '2026-02-30' }, body: '' }), /日期格式/);
  await content.save({ id: 'blog/post.md', version: '', fields: { title: 'Title', summary: 'Summary', date: '2026-11-03', tags: ['Astro'] }, body: 'Body' });
  assert.equal((await content.list()).length, 2);
});
test('content scope rejects traversal, Windows alternate streams and linked folders', async t => {
  const { root, content, directory } = await fixture(t);
  for (const id of ['works/../secret.md', 'works/C:secret.md', 'works/foo\\bar.md', 'works//bad.md', 'works/../../package.json']) assert.equal(WebsiteIdSchema.safeParse(id).success, false);
  const outside = join(directory, 'outside'); await mkdir(outside); await writeFile(join(outside, 'secret.md'), source);
  await symlink(outside, join(root, 'src/content/library/linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(content.read('library/linked/secret.md'), /链接|目录/);
  await assert.rejects(content.save({ id: 'library/linked/new.md', version: '', fields: { title: 'x', summary: '' }, body: '' }), /链接|目录/);
  assert.deepEqual(await readdir(outside), ['secret.md']); assert.deepEqual(await content.list(), []);
});
test('invalid individual Markdown files do not hide valid entries; cover reads stay in public', async t => {
  const { root, content } = await fixture(t);
  await writeFile(join(root, 'src/content/works/good.md'), source); await writeFile(join(root, 'src/content/blog/bad.md'), 'not frontmatter');
  const list = await content.list(); assert.equal(list.length, 2); assert.ok(list.find(item => item.id === 'blog/bad.md')?.error);
  await assert.rejects(content.coverPreview('/../src/content/works/good.md'), /路径无效/);
  assert.equal(await content.coverPreview('https://example.org/image.png'), '');
  assert.equal(websitePreviewPath({ collection: 'works' }), '/#works');
});
test('blog preview waits for saved content and matches Astro glob slugs and custom slugs', async t => {
  const { root, content } = await fixture(t);
  assert.equal(websitePreviewPath({ collection: 'blog' }), '/#blog');
  const request = { id: 'blog/Hello 世界!.md', version: '', fields: { title: 'Hello', summary: '', date: '2026-11-03' }, body: '' };
  const saved = await content.save(request);
  assert.equal(websitePreviewPath(saved), '/blog/hello-%E4%B8%96%E7%95%8C/');
  await mkdir(join(root, 'src/content/blog/Nested'));
  await writeFile(join(root, 'src/content/blog/Nested/index.md'), saved.source);
  assert.equal(websitePreviewPath(await content.read('blog/Nested/index.md')), '/blog/nested/');
  await writeFile(join(root, 'src/content/blog/custom.md'), saved.source.replace('---\n', '---\nslug: custom/Route\n'));
  assert.equal(websitePreviewPath(await content.read('blog/custom.md')), '/blog/custom/Route/');
});
test('Astro process lifecycle, build output, cancellation and page checks use actual results', async t => {
  const { root, directory, cleanups } = await fixture(t);
  const astro = join(root, 'node_modules/astro'); await mkdir(astro, { recursive: true });
  await writeFile(join(astro, 'package.json'), '{"type":"module"}');
  await writeFile(join(astro, 'astro.js'), [
    "import { createServer } from 'node:http';",
    "import { readFile } from 'node:fs/promises';",
    "const mode = await readFile('mode.txt', 'utf8').catch(() => 'ok');",
    "if (process.argv[2] === 'dev') { const server = createServer((req,res) => { res.setHeader('Content-Type', 'text/html'); res.statusCode = req.url === '/about/' ? 500 : 200; res.end('<h1>Fixture</h1>'); }); server.listen(0,'127.0.0.1',() => console.log('Local http://127.0.0.1:' + server.address().port + '/')); }",
    "else if (mode === 'slow') { console.log('building'); setInterval(() => {}, 1000); }",
    "else { console.log(mode === 'fail' ? 'fixture failure' : 'fixture built'); process.exit(mode === 'fail' ? 2 : 0); }",
  ].join('\n'));
  const site = new PersonalWebsite({ root, dataDir: join(directory, 'data'), runtime: process.execPath, port: 0 });
  cleanups.push(() => site.dispose());
  assert.equal((await site.start()).service.phase, 'running');
  const original = site.snapshot().service.url; assert.equal((await site.start()).service.url, original);
  const phases: string[] = [], off = site.subscribe(state => phases.push(state.service.phase));
  const first = await site.save({ id: 'blog/first.md', version: '', fields: { title: 'First', summary: '', date: '2026-11-03' }, body: 'First body' });
  assert.ok(phases.includes('stopped') && phases.includes('starting'));
  assert.equal(site.snapshot().service.phase, 'running'); phases.length = 0;
  await site.save({ id: first.id, version: first.version, fields: first.fields, body: 'Updated body' });
  await site.save({ id: 'blog/second.md', version: '', fields: first.fields, body: 'Second body' });
  assert.ok(phases.every(phase => phase === 'running')); off();
  const checks = await site.checkPages(); assert.equal(checks.checks.results.length, 5); assert.equal(checks.checks.phase, 'failed'); assert.equal(checks.checks.results.find(item => item.path === '/about/')?.status, 'failed');
  assert.equal((await site.build()).build.phase, 'passed');
  await writeFile(join(root, 'mode.txt'), 'fail'); assert.equal((await site.build()).build.phase, 'failed'); assert.match(site.snapshot().build.output, /fixture failure/);
  await writeFile(join(root, 'mode.txt'), 'slow'); const building = site.build();
  await new Promise<void>(done => { const off = site.subscribe(state => { if (state.build.output.includes('building')) { off(); done(); } }); });
  await site.cancelBuild(); assert.equal((await building).build.phase, 'cancelled');
  const immediate = site.build(); await site.cancelBuild(); assert.equal((await immediate).build.phase, 'cancelled');
  await writeFile(join(root, 'mode.txt'), 'ok'); const outdated = site.build(); site.invalidate();
  assert.equal((await outdated).build.phase, 'idle'); assert.match(site.snapshot().build.message, /期间内容有更新/);
  const outdatedChecks = site.checkPages(); site.invalidate(); assert.equal((await outdatedChecks).checks.phase, 'idle'); assert.deepEqual(site.snapshot().checks.results, []);
  await site.configureOnline('https://example.org/'); assert.equal((await site.readState()).onlineUrl, 'https://example.org/');
  assert.equal((await site.stop()).service.phase, 'stopped'); await assert.rejects(site.checkPages(), /先启动/);
});
