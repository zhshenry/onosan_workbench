import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { artifactPathSchema, DEFAULT_TEST_TASK, testTaskSchema, testPrompts, type TestRun } from '../shared/ai-test-contracts';
import { extractTestFiles, scopedFile, writeTestFile, readTestFiles, entryFile, ARTIFACT_CSP } from '../electron/ai-test-artifacts';
import { AiTestStore } from '../electron/ai-test-store';

const fence = String.fromCharCode(96).repeat(3);
const block = (header: string, content: string) => fence + header + '\n' + content + '\n' + fence;
const task = () => ({ ...structuredClone(DEFAULT_TEST_TASK), modelIds: [randomUUID()] });
const fixtureRun = (): TestRun => ({
  id: randomUUID(), task: task(), input: testPrompts(task()), createdAt: new Date().toISOString(),
  lanes: ['one', 'two'].map(name => ({
    id: randomUUID(), model: { id: randomUUID(), name, providerName: 'fixture', protocol: 'openai-chat', endpoint: 'http://127.0.0.1/v1' },
    status: 'complete', reply: 'synthetic', files: [{ path: 'index.html', content: '<h1>' + name + '</h1>' }],
    steps: [], elapsedMs: 100, tokens: 20, toolCalls: 0, checks: [],
  })),
});
test('artifact paths reject traversal, absolute paths, ADS and Windows aliases', () => {
  for (const path of ['../secret', '/etc/passwd', 'C:/secret.txt', 'a/../secret', 'a\\file.txt', 'x.js:stream', 'a//b', '.', 'con.txt', 'a/NUL', 'COM1.js', 'bad.html.', 'bad ', 'a\u0000b']) {
    assert.equal(artifactPathSchema.safeParse(path).success, false, path);
  }
  assert.equal(artifactPathSchema.safeParse('src/组件 app.js').success, true);
});
test('task snapshots enforce equal budgets, bounded material inputs and unique identities', () => {
  assert.equal(testTaskSchema.safeParse(task()).success, true);
  for (const patch of [{ modelIds: [] }, { modelIds: ['a', 'a'] }, { modelIds: ['a', 'b', 'c', 'd', 'e'] }, { temperature: 3 }, { maxTokens: 100 }, { maxToolCalls: 0 }, { timeoutSeconds: 601 }, { prompt: ' ' }]) {
    assert.equal(testTaskSchema.safeParse({ ...task(), ...patch }).success, false);
  }
  assert.equal(testTaskSchema.safeParse({ ...task(), materials: [{ path: 'X.js', content: '' }, { path: 'x.js', content: '' }] }).success, false);
  assert.equal(testTaskSchema.safeParse({ ...task(), checks: [DEFAULT_TEST_TASK.checks[0], DEFAULT_TEST_TASK.checks[0]] }).success, false);
});
test('direct output extracts multiple named files without executing or modifying raw reply', () => {
  const reply = '交付说明\n' + block('html:index.html', '<script src="src/app.js"></script>') + '\n' + block('javascript filename="src/app.js"', 'document.body.textContent = "ok";');
  const files = extractTestFiles(reply);
  assert.deepEqual(files.map(file => file.path), ['index.html', 'src/app.js']);
  assert.equal(files[1].content, 'document.body.textContent = "ok";');
  assert.ok(reply.startsWith('交付说明'));
  assert.equal(entryFile(files), 'index.html');
});
test('code and plain replies remain useful without claiming a browser runtime', () => {
  assert.deepEqual(extractTestFiles('只是文字输出'), []);
  assert.equal(extractTestFiles(block('python', 'print(42)'))[0].path, 'output.py');
  assert.equal(entryFile(extractTestFiles(block('python', 'print(42)'))), undefined);
  assert.equal(extractTestFiles('<!doctype html><html><body>hi</body></html>')[0].path, 'index.html');
  assert.equal(extractTestFiles(block('html', '<h1>hi</h1>'))[0].path, 'index.html');
});
test('generated names cannot write outside the lane project', () => {
  assert.throws(() => extractTestFiles(block('html:../escape.html', '<h1>bad</h1>')));
  const root = mkdtempSync(join(tmpdir(), 'ono-ai-files-'));
  try {
    assert.throws(() => writeTestFile(root, { path: '../escape.html', content: 'bad' }));
    assert.throws(() => scopedFile(root, 'C:/outside.txt'));
    writeTestFile(root, { path: 'src/main.js', content: 'export default 42;' });
    assert.deepEqual(readTestFiles(root), [{ path: 'src/main.js', content: 'export default 42;' }]);
    assert.equal(readFileSync(join(root, 'src/main.js'), 'utf8'), 'export default 42;');
    assert.throws(() => writeTestFile(root, { path: 'large.txt', content: 'x'.repeat(1000001) }), /1 MB/);
    assert.equal(existsSync(join(root, 'large.txt')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('duplicate file paths cannot silently overwrite a model artifact on Windows', () => {
  assert.throws(() => extractTestFiles(block('html:index.html', 'one') + '\n' + block('html:INDEX.HTML', 'two')), /重复路径/);
});
test('effective prompts are deterministic and include the same materials and mode limits', () => {
  const input = { ...task(), materials: [{ path: 'source.js', content: 'const x = 42;' }], mode: 'agent' as const, maxToolCalls: 7 };
  assert.deepEqual(testPrompts(input), testPrompts(structuredClone(input)));
  assert.match(testPrompts(input).system, /7 次工具调用/);
  assert.match(testPrompts(input).user, /source.js\nconst x = 42;/);
  assert.doesNotMatch(testPrompts(input).system, /Current working directory|AppData/);
});
test('preview policy allows local scripts but blocks external connections and privileged embeds', () => {
  assert.match(ARTIFACT_CSP, /connect-src 'self'/);
  assert.match(ARTIFACT_CSP, /frame-src 'none'/);
  assert.match(ARTIFACT_CSP, /object-src 'none'/);
  assert.match(ARTIFACT_CSP, /form-action 'none'/);
});
test('saved tasks and reruns retain original inputs and model results across restart', () => {
  const root = mkdtempSync(join(tmpdir(), 'ono-ai-records-'));
  let store = new AiTestStore(root);
  try {
    const input = task(), saved = store.saveTask(input), first = fixtureRun(), original = structuredClone(first);
    store.saveRun(first);
    input.prompt = '编辑后的下一次任务'; first.lanes[0].files[0].content = 'changed in memory';
    assert.notEqual(store.tasks()[0].prompt, input.prompt);
    assert.deepEqual(store.run(original.id), original);
    store.saveTask({ ...saved, title: '新标题' });
    assert.equal(store.tasks().length, 1);
    const rerun = { ...original, id: randomUUID() };
    store.saveRun(rerun); store.close(); store = new AiTestStore(root);
    assert.equal(store.runs().length, 2);
    assert.deepEqual(store.run(original.id), original);
    assert.deepEqual(store.run(rerun.id).task, original.task);
    assert.equal(store.run(original.id).lanes[1].files[0].content, '<h1>two</h1>');
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});
test('interrupted generation and validation recover explicitly, preserving completed peers', () => {
  const root = mkdtempSync(join(tmpdir(), 'ono-ai-recovery-'));
  let store = new AiTestStore(root);
  try {
    const run = fixtureRun();
    run.lanes[0].status = 'running'; run.lanes[0].checking = true;
    run.lanes[0].steps.push({ id: 'step', name: 'write_file', status: 'running', output: '', at: run.createdAt });
    store.saveRun(run); store.close(); store = new AiTestStore(root);
    const recovered = store.run(run.id);
    assert.equal(recovered.lanes[0].status, 'error');
    assert.match(recovered.lanes[0].error!, /中断/);
    assert.equal(recovered.lanes[0].checking, false);
    assert.equal(recovered.lanes[0].steps[0].status, 'error');
    assert.equal(recovered.lanes[1].status, 'complete');
    assert.deepEqual(recovered.lanes[1].files, run.lanes[1].files);
    assert.equal(store.runs()[0].running, false);
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});
