// Issue #26: real installed renderer, IPC resolution and persistence with isolated
// synthetic records and a loopback SSE responder. No renderer/store mocks, real
// model calls, vault imports, browser pages, credentials or proposal application.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

export const CONTEXT_PICKER_SCREENSHOTS = Object.freeze([
  'context-picker-mist-1024x680.png', 'context-picker-cool-1024x680.png',
  'context-picker-warm-1024x680.png', 'context-picker-saved.png',
  'context-picker-relaunched.png',
]);
export const CONTEXT_PICKER_MATRIX = Object.freeze([
  ['mist', '雾灰 · 轻雾'], ['cool', '冷灰 · 凝霜'], ['warm', '暖砂 · 柔雾'],
].flatMap(([theme, label]) => [[1280, 820, 'light'], [1024, 680, 'dark']].map(([width, height, colorScheme]) => Object.freeze({ theme, label, width, height, colorScheme }))));

const panel = page => page.locator('#workbench-ai-panel');
const picker = page => page.locator('.ai-reference-dialog');
const add = page => panel(page).locator('.ai-add-reference');
const chips = page => panel(page).locator('.ai-reference-chip');
const model = page => panel(page).getByRole('combobox', { name: '选择大模型', exact: true });
const input = page => panel(page).getByRole('textbox', { name: '发送给当前对话的 AI 助手', exact: true });
const taskState = page => page.evaluate(() => window.workbench.todo.state());

/** A chat title or an assistant echo must never satisfy the restored user-message check. */
export function referencePromptBubble(page, prompt) {
  const exactText = new RegExp(`^${prompt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
  return panel(page).locator('.ai-messages .ai-msg.user > .ai-bubble').filter({ hasText: exactText });
}

async function eventually(read, predicate, message) {
  const deadline = Date.now() + 15000;
  let value;
  do {
    value = await read();
    if (predicate(value)) return value;
    await new Promise(resolve => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  assert.fail(message);
}
async function openPanel(page) {
  if (await panel(page).getAttribute('aria-hidden') !== 'false') await page.locator('.topbar').getByRole('button', { name: '展开 AI 助手', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#workbench-ai-panel')?.getAttribute('aria-hidden') === 'false');
}
async function closePanel(page) {
  if (await panel(page).getAttribute('aria-hidden') === 'false') await page.locator('.topbar').getByRole('button', { name: '收起 AI 助手', exact: true }).click();
  await panel(page).waitFor({ state: 'hidden' });
}
async function navigate(page, workspace, label, view) {
  await closePanel(page);
  await page.locator(`.rail [data-workbench="${workspace}"]`).click();
  if (label) await page.locator('.tree').getByRole('button', { name: label, exact: true }).click();
  if (view) await page.locator(`#view-${view}`).waitFor({ state: 'visible' });
}
async function resize(application, page, width, height) {
  const window = await application.browserWindow(page);
  await window.evaluate((win, size) => win.setContentSize(size.width, size.height), { width, height });
  await page.waitForFunction(size => innerWidth === size.width && innerHeight === size.height, { width, height });
}
async function dismiss(page) {
  await page.keyboard.press('Escape');
  await picker(page).waitFor({ state: 'hidden' });
}
async function selectReference(page, name, multiple = false) {
  await add(page).click();
  await picker(page).waitFor({ state: 'visible' });
  await picker(page).locator('.ai-reference-search input').fill(name);
  const option = picker(page).locator('.ai-reference-option').filter({ hasText: name });
  await option.waitFor({ state: 'visible' });
  assert.equal(await option.count(), 1, 'Reference fixture must resolve to one actual option');
  await option.locator('input').check();
  if (multiple) await picker(page).locator('.primary').click();
  else await dismiss(page);
  assert.equal(await chips(page).count(), 1);
  assert.ok((await chips(page).innerText()).includes(name));
}
async function openChat(page, title) {
  await panel(page).locator('.ai-context-select > .select-trigger').click();
  const menu = page.getByRole('dialog', { name: '切换对话', exact: true });
  await menu.getByRole('textbox', { name: '搜索对话标题或关联对象', exact: true }).fill(title);
  const option = menu.locator('[data-chat-main]').filter({ hasText: title });
  assert.equal(await option.count(), 1, 'History fixture title must identify exactly one chat');
  await option.click();
  await menu.waitFor({ state: 'hidden' });
  await eventually(() => panel(page).locator('.ai-context-header-label strong').textContent(), value => value === title, 'Requested saved chat did not open');
}
async function newChat(page) {
  await panel(page).locator('.ai-ctx-new').click();
  await panel(page).locator('.ai-empty').waitFor({ state: 'visible' });
  await eventually(() => chips(page).count(), count => count === 0, 'New chat must start without references');
}

// ai.chatOpen mutates active-chat state and timestamps. Read persisted JSON via a
// separate readonly SQLite connection instead; never open an unisolated database.
async function persistedChats(application) {
  return application.evaluate(({ app }) => {
    const { DatabaseSync } = process.getBuiltinModule('node:sqlite');
    const { join, relative, isAbsolute, sep } = process.getBuiltinModule('node:path');
    const root = process.env.WORKBENCH_TEST_DATA_DIR;
    if (!root || !app.isPackaged) throw new Error('Installed isolated pilot required');
    const userData = app.getPath('userData');
    const rel = relative(root, userData);
    if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('Refusing unisolated chat database');
    const db = new DatabaseSync(join(userData, 'chats.db'), { readOnly: true });
    try { return db.prepare('SELECT payload FROM chats').all().map(row => JSON.parse(row.payload)); }
    finally { db.close(); }
  });
}

export function assertReferenceTurn(chat, prompt, expectedReference, contentNeedle) {
  const index = chat.entries.findIndex(entry => entry.role === 'user' && entry.content === prompt);
  assert.ok(index >= 0, 'Sent prompt must be persisted');
  const user = chat.entries[index];
  const assistant = chat.entries[index + 1];
  assert.equal(assistant?.role, 'assistant');
  assert.equal(Boolean(assistant.streaming), false, 'Await actual backend completion');
  assert.equal(Boolean(assistant.error), false, 'Backend response must not hide a failure');
  assert.deepEqual(user.references, [expectedReference]);
  assert.equal(user.referenceSnapshots?.length, 1);
  const snapshot = user.referenceSnapshots[0];
  assert.deepEqual(snapshot.reference, expectedReference);
  assert.ok(Number.isFinite(Date.parse(snapshot.capturedAt)));
  assert.ok(snapshot.content.includes(contentNeedle), 'Captured snapshot must contain actual saved source content');
  assert.deepEqual(assistant.referenceSnapshots, user.referenceSnapshots, 'Both entries must retain the same send-time snapshot');
  assert.deepEqual(assistant.contextScope, user.contextScope, 'Reply must retain the send-time primary target');
  return { chatId: chat.id, title: chat.title, prompt, userId: user.id, assistantId: assistant.id, contextScope: user.contextScope, pageScope: user.pageScope, references: user.references, snapshots: user.referenceSnapshots };
}
export function assertSavedReferenceTurn(chats, turn) {
  const chat = chats.find(item => item.id === turn.chatId);
  assert.ok(chat, 'Reference chat must survive restart');
  for (const id of [turn.userId, turn.assistantId]) {
    const entry = chat.entries.find(item => item.id === id);
    assert.ok(entry, 'Exact saved message ID must survive restart');
    assert.deepEqual(entry.referenceSnapshots, turn.snapshots, 'Source edits/restart must not rewrite historical snapshots');
    assert.deepEqual(entry.contextScope, turn.contextScope);
    assert.deepEqual(entry.pageScope, turn.pageScope);
  }
  assert.deepEqual(chat.entries.find(entry => entry.id === turn.userId).references, turn.references);
}
export function assertTransmittedReferenceSnapshots(messages, snapshots) {
  const marker = '本轮明确选择的只读参考资料（发送时冻结快照）：\n';
  const parts = messages.map(message => typeof message.content === 'string' ? message.content : JSON.stringify(message.content));
  const contributions = parts.filter(text => text.includes(marker));
  assert.equal(contributions.length, 1, 'One selected-reference contribution must reach the actual transport');
  const text = contributions[0];
  const line = text.slice(text.indexOf(marker) + marker.length).split('\n')[0];
  assert.deepEqual(JSON.parse(line), snapshots, 'Transport reference lane must exactly equal saved snapshots, with no extra unselected reference');
  // This intentionally makes no claim about the separate latest-120 todo base context.
}
function contained(inner, outer, label) {
  assert.ok(inner && outer && [inner, outer].every(rect => ['x', 'y', 'width', 'height'].every(key => Number.isFinite(rect[key])) && rect.width > 0 && rect.height > 0), `${label}: invalid bounds`);
  assert.ok(inner.x >= outer.x - 1 && inner.y >= outer.y - 1 && inner.x + inner.width <= outer.x + outer.width + 1 && inner.y + inner.height <= outer.y + outer.height + 1, `${label}: clipped or outside boundary`);
}
export function assertContextPickerGeometry(value) {
  for (const [key, label] of [['panel', 'AI panel'], ['picker', 'Reference popover'], ['trigger', 'Reference button'], ['model', 'Model control'], ['send', 'Send control']]) contained(value[key], value.viewport, label);
  for (const key of ['trigger', 'model', 'send']) contained(value[key], value.panel, key);
  assert.ok(value.trigger.x + value.trigger.width <= value.model.x + 1, 'Reference button stays left of the model control');
  assert.ok(value.model.x + value.model.width <= value.send.x + 1, 'Model stays left of send');
  assert.ok(value.picker.y + value.picker.height <= value.trigger.y + 1, 'Reference popover must open above the composer control');
  assert.ok(value.pickerClientWidth > 0 && value.pickerScrollWidth <= value.pickerClientWidth, 'Reference picker must not scroll horizontally');
  assert.equal(value.chipsFit, true, 'Long reference chip must stay inside the panel');
  assert.equal(value.hitOption, true, 'Reference options must receive pointer hits');
  assert.ok(value.modelShift <= 1 && value.sendShift <= 1, 'Opening the popover must not move model/send controls');
}
async function geometry(page, baseline) {
  return page.evaluate(baseline => {
    const rect = element => { const { x, y, width, height } = element.getBoundingClientRect(); return { x, y, width, height }; };
    const panel = document.querySelector('#workbench-ai-panel');
    const picker = document.querySelector('.ai-reference-dialog');
    const model = panel.querySelector('.ai-model-select .select-trigger');
    const send = panel.querySelector('.ai-send');
    const option = picker.querySelector('.ai-reference-option');
    const optionRect = option.getBoundingClientRect();
    const hit = document.elementFromPoint(optionRect.x + optionRect.width / 2, optionRect.y + optionRect.height / 2);
    const move = (current, before) => Math.max(Math.abs(current.x - before.x), Math.abs(current.y - before.y), Math.abs(current.width - before.width), Math.abs(current.height - before.height));
    return { viewport: { x: 0, y: 0, width: innerWidth, height: innerHeight }, panel: rect(panel), picker: rect(picker), trigger: rect(panel.querySelector('.ai-add-reference')), model: rect(model), send: rect(send),
      pickerClientWidth: picker.clientWidth, pickerScrollWidth: picker.scrollWidth,
      chipsFit: [...panel.querySelectorAll('.ai-reference-chip')].every(chip => chip.scrollWidth <= chip.clientWidth && chip.getBoundingClientRect().right <= panel.getBoundingClientRect().right + 1),
      hitOption: hit === option || option.contains(hit), modelShift: move(rect(model), baseline.model), sendShift: move(rect(send), baseline.send), colorScheme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light' };
  }, baseline);
}
async function controlBounds(page) {
  return { model: await model(page).boundingBox(), send: await panel(page).locator('.ai-send').boundingBox() };
}

export async function runContextPickerPilot({ application, page, check, screenshot, runId, report, birthdayFixture }) {
  const marker = String(runId).slice(-10);
  const longTitle = `CI参考${marker} ` + '长标题键盘与窄面板验收'.repeat(8);
  const originalNote = `合成事项原备注 ${marker}`;
  const editedNote = `合成事项已编辑 ${marker}`;
  const turns = [];
  const requests = [];
  const serverErrors = [];
  let todo, copy, reading, primaryProfile;
  const originalChats = await persistedChats(application);
  const cardsChat = originalChats.find(chat => chat.entries.some(entry => entry.proposal));
  assert.ok(cardsChat, 'Run the existing AI-card pilot first');
  const server = createServer(async (request, response) => {
    try {
      let body = ''; for await (const chunk of request) { body += chunk.toString('utf8'); if (body.length > 2_000_000) throw new Error('Oversized synthetic request'); }
      assert.equal(request.method, 'POST'); assert.equal(request.url, '/v1/chat/completions');
      requests.push(JSON.parse(body));
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const chunk = (delta, finish_reason = null) => response.write(`data: ${JSON.stringify({ id: 'context-picker-pilot', object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
      chunk({ role: 'assistant' }); chunk({ content: JSON.stringify({ message: '合成回包：参考链路已验收，没有执行任何修改。', actions: [] }) }); chunk({}, 'stop'); response.end('data: [DONE]\n\n');
    } catch (error) { serverErrors.push(String(error)); response.writeHead(500); response.end('synthetic fixture failure'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  async function send(prompt, reference, contentNeedle, trigger) {
    const requestIndex = requests.length;
    if (trigger) await trigger();
    else { await input(page).fill(prompt); await panel(page).getByRole('button', { name: '发送', exact: true }).click(); }
    const chats = await eventually(() => persistedChats(application), chats => chats.some(chat => {
      const i = chat.entries.findIndex(entry => entry.role === 'user' && entry.content === prompt);
      return i >= 0 && chat.entries[i + 1]?.role === 'assistant' && !chat.entries[i + 1].streaming;
    }), 'Actual reference request did not finish');
    const chat = chats.find(chat => chat.entries.some(entry => entry.role === 'user' && entry.content === prompt));
    const turn = assertReferenceTurn(chat, prompt, reference, contentNeedle);
    assert.equal(requests.length, requestIndex + 1, 'Exactly one local synthetic provider request per send');
    assertTransmittedReferenceSnapshots(requests[requestIndex].messages, turn.snapshots);
    turns.push(turn);
    await panel(page).getByRole('button', { name: '发送', exact: true }).waitFor({ state: 'visible' });
    return turn;
  }
  try {
    await check('Context picker: explicit isolated loopback provider, no external model or credentials', async () => {
      await navigate(page, 'settings', 'AI 助手');
      await page.getByRole('button', { name: '编辑供应商 本机合成验收', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: '编辑供应商', exact: true });
      await dialog.getByRole('textbox', { name: '服务地址', exact: true }).fill(`http://127.0.0.1:${server.address().port}/v1`);
      await dialog.getByRole('button', { name: '保存供应商', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
      const config = await page.evaluate(() => window.workbench.ai.config());
      const selected = config.models.find(item => item.id === config.activeModelId);
      const provider = config.providers.find(item => item.id === selected?.providerId);
      assert.equal(provider.endpoint, `http://127.0.0.1:${server.address().port}/v1`); assert.equal(provider.hasKey, false);
    });
    await check('Context picker: real UI creates long todo fixture and keyboard/change/remove/cancel stay read-only', async () => {
      await navigate(page, 'home', null, 'home');
      await page.locator('#view-home').getByRole('button', { name: '新增', exact: true }).click();
      const editor = page.getByRole('dialog', { name: '新增事项', exact: true });
      await editor.getByRole('textbox', { name: '待办名称', exact: true }).fill(longTitle);
      await editor.getByRole('button', { name: '更多设置：未设置', exact: true }).click();
      await editor.getByRole('textbox', { name: '备注 / 进展', exact: true }).fill(originalNote);
      await editor.getByRole('button', { name: '创建', exact: true }).click(); await editor.waitFor({ state: 'hidden' });
      todo = (await eventually(() => taskState(page), state => state.tasks.some(task => task.title === longTitle), 'Todo fixture did not save')).tasks.find(task => task.title === longTitle);
      await openPanel(page); await newChat(page);
      const before = await taskState(page);
      await add(page).focus(); await page.keyboard.press('Enter');
      await picker(page).locator('.ai-reference-search input').fill(longTitle);
      await picker(page).locator('.ai-reference-option').waitFor({ state: 'visible' });
      await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
      assert.equal(await chips(page).count(), 1); assert.ok((await chips(page).innerText()).includes(longTitle));
      await dismiss(page); assert.equal(await add(page).evaluate(element => element === document.activeElement), true);
      await chips(page).getByRole('button').click(); assert.equal(await chips(page).count(), 0);
      const alternate = before.tasks.find(task => task.id !== todo.id && task.status === 'todo'); assert.ok(alternate);
      await selectReference(page, alternate.title); await selectReference(page, longTitle);
      assert.equal(await chips(page).count(), 1, 'Changing todo replaces, never appends');
      await add(page).click(); await picker(page).locator('.ai-reference-search input').fill(longTitle);
      await picker(page).getByRole('combobox', { name: '筛选事项状态', exact: true }).click();
      await picker(page).getByRole('option', { name: '已完成', exact: true }).click();
      assert.equal(await picker(page).locator('.ai-reference-option').count(), 0);
      await picker(page).getByRole('combobox', { name: '筛选事项状态', exact: true }).click();
      await picker(page).getByRole('option', { name: '全部状态', exact: true }).click();
      await picker(page).getByRole('combobox', { name: '筛选事项类型', exact: true }).click();
      await picker(page).getByRole('option', { name: '日程', exact: true }).click();
      assert.equal(await picker(page).locator('.ai-reference-option').count(), 0);
      await picker(page).getByRole('combobox', { name: '筛选事项类型', exact: true }).click();
      await picker(page).getByRole('option', { name: '全部类型', exact: true }).click();
      assert.equal(await picker(page).locator('.ai-reference-option').count(), 1); await dismiss(page);
      await add(page).click(); await picker(page).locator('.ai-reference-search input').fill(`NO_MATCH_${marker}`);
      assert.equal(await picker(page).locator('.ai-reference-option').count(), 0);
      await dismiss(page); assert.equal(await chips(page).count(), 1);
      await add(page).click(); await input(page).click(); await picker(page).waitFor({ state: 'hidden' });
      await add(page).click();
      const size = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
      await resize(application, page, size.width === 1280 && size.height === 820 ? 1024 : 1280, size.width === 1280 && size.height === 820 ? 680 : 820);
      await picker(page).waitFor({ state: 'hidden' });
      assert.deepEqual(await taskState(page), before, 'Reference controls must not mutate business data');
      assert.equal(requests.length, 0, 'Selecting references must not contact a model');
    });
    await check('Context picker: real todo send snapshots content; later UI edit never changes history', async () => {
      const turn = await send(`CI待办参考${marker}`, { module: 'todo', taskId: todo.id }, originalNote);
      assert.deepEqual(turn.contextScope, { module: 'todo' });
      await closePanel(page);
      await page.locator('#view-home').getByRole('button', { name: `编辑 ${longTitle}`, exact: true }).click();
      const editor = page.getByRole('dialog', { name: '编辑事项', exact: true });
      await editor.getByRole('textbox', { name: '备注 / 进展', exact: true }).fill(editedNote);
      await editor.getByRole('button', { name: '保存待办', exact: true }).click(); await editor.waitFor({ state: 'hidden' });
      await eventually(() => taskState(page), state => state.tasks.find(task => task.id === todo.id)?.note === editedNote, 'Todo source edit did not save');
      assertSavedReferenceTurn(await persistedChats(application), turn);
      await openPanel(page); await chips(page).getByRole('button').click(); await selectReference(page, longTitle);
      const next = await send(`CI待办新快照${marker}`, { module: 'todo', taskId: todo.id }, editedNote);
      assert.notDeepEqual(next.snapshots, turn.snapshots);
      await screenshot('context-picker-saved.png');
    });
    await check('Context picker: real blog reference and quick-action send preserve the primary write target', async () => {
      await navigate(page, 'media', '博客编辑');
      async function createBlog(title, body) {
        const previousIds = (await page.evaluate(() => window.workbench.copy.list())).drafts.map(draft => draft.id);
        await page.locator('.copy-new').click();
        await eventually(() => page.evaluate(() => window.workbench.copy.list()), data => data.drafts.some(draft => !previousIds.includes(draft.id)), 'New blog did not reach the store');
        await page.locator('#copy-title').waitFor({ state: 'visible' });
        await eventually(async () => [await page.locator('#copy-title').inputValue(), await page.locator('#copy-body').inputValue()], values => values.every(value => value === ''), 'New blog editor did not finish opening');
        await page.locator('#copy-title').fill(title); await page.locator('#copy-body').fill(body);
        const data = await eventually(() => page.evaluate(() => window.workbench.copy.list()), data => data.drafts.some(draft => draft.title === title && draft.body === body), 'Blog fixture did not autosave');
        return data.drafts.find(draft => draft.title === title);
      }
      copy = await createBlog(`CI参考博客${marker}`, `合成博客正文 ${marker}`);
      const primary = await createBlog(`CI主博客${marker}`, `主对象正文 ${marker}`);
      // The empty workspace action is the normal UI route to a generic chat;
      // the reference itself must not grant that chat any blog write tools.
      await navigate(page, 'media', '图文发布'); await openPanel(page);
      await panel(page).locator('.ai-context-select > .select-trigger').click();
      const history = page.getByRole('dialog', { name: '切换对话', exact: true });
      await history.getByRole('combobox', { name: '选择工作区', exact: true }).click();
      await page.getByRole('option', { name: '自媒体工作台', exact: true }).click();
      await history.getByRole('button', { name: '此工作台暂无对话 · 点击开始', exact: true }).click();
      await history.waitFor({ state: 'hidden' }); await panel(page).locator('.ai-empty').waitFor({ state: 'visible' });
      await selectReference(page, copy.title, true);
      const generic = await send(`CI通用博文参考${marker}`, { module: 'copy', draftId: copy.id }, copy.body);
      assert.deepEqual(generic.contextScope, { module: 'workbench', viewId: 'copy-publish' });
      const toolNames = (requests.at(-1).tools ?? []).map(tool => tool.function?.name ?? tool.name).sort();
      assert.deepEqual(toolNames, ['read_reference'], 'A generic media reference must only add the readonly reference tool');
      await navigate(page, 'media', '博客编辑');
      await openPanel(page); assert.equal(await chips(page).count(), 0);
      await selectReference(page, copy.title, true);
      await send(`CI博客参考${marker}`, { module: 'copy', draftId: copy.id }, copy.body);
      const quick = panel(page).locator('.ai-copy-action').first(); const prompt = await quick.getAttribute('title');
      assert.ok(prompt); const turn = await send(prompt, { module: 'copy', draftId: copy.id }, copy.body, () => quick.click());
      assert.deepEqual(turn.contextScope, { module: 'copy', draftId: primary.id });
      assert.deepEqual((await page.evaluate(() => window.workbench.copy.list())).drafts.find(draft => draft.id === primary.id), primary);
      await navigate(page, 'media', '图文发布'); await openPanel(page); assert.equal(await chips(page).count(), 0);
      await selectReference(page, copy.title, true);
      await navigate(page, 'home', null, 'home'); await openPanel(page); assert.equal(await chips(page).count(), 0);
      await openChat(page, turns[0].title); assert.equal(await chips(page).count(), 0, 'Reopening a chat does not silently attach past references');
      await selectReference(page, longTitle); await newChat(page); assert.equal(await chips(page).count(), 0, 'New chat cannot inherit references');
    });
    await check('Context picker: recorded book references use reading data and stay separate from bazi', async () => {
      await navigate(page, 'life', '阅读清单', 'reading');
      async function createBook(title) {
        await page.locator('#view-reading').getByRole('button', { name: '添加书目', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: '添加书目', exact: true });
        await dialog.getByRole('textbox', { name: '书名', exact: true }).fill(title);
        await dialog.getByRole('textbox', { name: '作者', exact: true }).fill(`合成作者${marker}`);
        await dialog.getByRole('textbox', { name: '标签', exact: true }).fill('验收');
        await dialog.getByRole('button', { name: '添加', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
        const data = await eventually(() => page.evaluate(() => window.workbench.reading.list()), data => data.books.some(book => book.title === title), 'Book fixture did not save');
        return data.books.find(book => book.title === title);
      }
      reading = await createBook(`CI参考书目${marker}`); await createBook(`CI主书目${marker}`);
      await openPanel(page); assert.equal(await chips(page).count(), 0);
      await selectReference(page, reading.title);
      await send(`CI书目参考${marker}`, { module: 'reading', profileId: reading.id }, reading.author);
      await navigate(page, 'life', '命理', 'bazi'); await openPanel(page); assert.equal(await chips(page).count(), 0);
      await add(page).click(); await picker(page).locator('.ai-reference-search input').fill(reading.title);
      assert.equal(await picker(page).locator('.ai-reference-option').count(), 0); await dismiss(page);
    });
    await check('Context picker: real bazi selection uses send-time chart system and preserves existing profile', async () => {
      await closePanel(page);
      const before = await page.evaluate(() => window.workbench.bazi.list());
      await page.locator('#view-bazi .gbtns').getByRole('button', { name: '新建命例', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: '新建命例', exact: true });
      const name = `CI参考主${marker.slice(-6)}`;
      await dialog.getByRole('textbox', { name: '姓名或备注', exact: true }).fill(name);
      await dialog.locator('.date-picker > button').click(); await page.getByRole('dialog', { name: '选择日期', exact: true }).getByRole('button', { name: '今天', exact: true }).click();
      await dialog.locator('.time-picker > button').click(); await page.getByRole('dialog', { name: '选择时间', exact: true }).getByRole('button', { name: '现在', exact: true }).click();
      await dialog.getByRole('button', { name: '保存并排盘', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
      const data = await eventually(() => page.evaluate(() => window.workbench.bazi.list()), data => data.profiles.some(profile => profile.name === name), 'Bazi fixture did not save');
      primaryProfile = data.profiles.find(profile => profile.name === name);
      assert.deepEqual(data.profiles.find(profile => profile.id === birthdayFixture.id), before.profiles.find(profile => profile.id === birthdayFixture.id));
      await openPanel(page); await selectReference(page, birthdayFixture.name, true);
      const turn = await send(`CI命例参考${marker}`, { module: 'bazi', profileId: birthdayFixture.id }, birthdayFixture.name);
      assert.deepEqual(turn.contextScope, { module: 'bazi', profileId: primaryProfile.id }); assert.equal(turn.snapshots[0].baziSystem, 'bazi');
      await navigate(page, 'life', '阅读清单', 'reading'); await openPanel(page); assert.equal(await chips(page).count(), 0);
      await add(page).click(); await picker(page).locator('.ai-reference-search input').fill(birthdayFixture.name);
      assert.equal(await picker(page).locator('.ai-reference-option').count(), 0); await dismiss(page);
    });
    await check('Context picker: settings and planned workbenches show explanations without stale chips', async () => {
      for (const workspace of ['settings', 'game', 'web']) {
        await navigate(page, workspace, workspace === 'settings' ? '通用' : null);
        await openPanel(page); assert.equal(await chips(page).count(), 0);
        await add(page).click(); await picker(page).waitFor({ state: 'visible' });
        assert.equal(await picker(page).locator('.ai-reference-option').count(), 0);
        assert.match(await picker(page).innerText(), workspace === 'settings' ? /设置|无需|不支持|当前没有可关联内容/ : /规划中|尚未开放/);
        await dismiss(page);
      }
    });
    report.contextPicker = { synthetic: true, model: 'Loopback synthetic SSE only; actual installed renderer, IPC, source resolution and SQLite persistence. No external model/provider verification.', privacyBoundary: 'Only the added reference lane is selection-bounded. The existing latest-120 todo/category context remains unchanged.', themeBoundary: 'mist/cool/warm are app themes; OS light/dark preference is emulated separately and does not claim a new dark app theme.', matrix: [], providerRequests: 0, savedTurns: [] };
    for (const fixture of CONTEXT_PICKER_MATRIX) {
      await check(`Context picker: ${fixture.theme} ${fixture.width}x${fixture.height} OS ${fixture.colorScheme}, long title and stable model/send controls`, async () => {
        await navigate(page, 'settings', '外观'); await page.getByRole('radio', { name: fixture.label, exact: true }).click();
        await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, fixture.theme);
        await page.emulateMedia({ colorScheme: fixture.colorScheme, reducedMotion: 'reduce' });
        await resize(application, page, fixture.width, fixture.height);
        await navigate(page, 'home', null, 'home'); await openPanel(page);
        // The narrow-window overlay intentionally hides its resize handle.
        // Every theme first sets 340px with the visible wide-window control.
        if (fixture.width >= 1160) {
          const separator = panel(page).getByRole('separator', { name: '调整助手宽度', exact: true });
          await separator.focus(); for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
        }
        assert.equal(await panel(page).locator('.ai-resizer').getAttribute('aria-valuenow'), '340');
        await selectReference(page, longTitle);
        const baseline = await controlBounds(page);
        await add(page).click(); await picker(page).locator('.ai-reference-search input').fill(longTitle);
        await picker(page).locator('.ai-reference-option').waitFor({ state: 'visible' });
        const measured = await geometry(page, baseline); assertContextPickerGeometry(measured); assert.equal(measured.colorScheme, fixture.colorScheme);
        report.contextPicker.matrix.push({ ...fixture, geometry: measured });
        if (fixture.width === 1024) await screenshot(`context-picker-${fixture.theme}-1024x680.png`);
        await dismiss(page);
      });
    }
    await check('Context picker: all historical snapshots remain exact and original card chat is restored', async () => {
      const chats = await persistedChats(application); for (const turn of turns) assertSavedReferenceTurn(chats, turn);
      assert.deepEqual(serverErrors, []);
      assert.equal(requests.length, turns.length);
      report.contextPicker.providerRequests = requests.length;
      report.contextPicker.savedTurns = turns.map(turn => ({ chatId: turn.chatId, userId: turn.userId, assistantId: turn.assistantId, referenceKeys: turn.snapshots.map(snapshot => snapshot.key), snapshotCount: turn.snapshots.length }));
      await openChat(page, cardsChat.title); await closePanel(page);
    });
    return { turns, todoId: todo.id, editedNote, copyId: copy.id, readingId: reading.id, primaryProfileId: primaryProfile.id };
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

export async function verifyContextPickerRelaunch({ application, page, check, screenshot, fixture }) {
  await check('Context picker: real same-version restart preserves exact sent references, source edits and snapshots', async () => {
    const chats = await persistedChats(application);
    for (const turn of fixture.turns) assertSavedReferenceTurn(chats, turn);
    assert.equal((await taskState(page)).tasks.find(task => task.id === fixture.todoId)?.note, fixture.editedNote);
    assert.ok((await page.evaluate(() => window.workbench.copy.list())).drafts.some(draft => draft.id === fixture.copyId));
    assert.ok((await page.evaluate(() => window.workbench.reading.list())).books.some(book => book.id === fixture.readingId));
    assert.ok((await page.evaluate(() => window.workbench.bazi.list())).profiles.some(profile => profile.id === fixture.primaryProfileId));
    await navigate(page, 'home', null, 'home'); await openPanel(page); await openChat(page, fixture.turns[0].title);
    await referencePromptBubble(page, fixture.turns[0].prompt).waitFor({ state: 'visible' });
    await screenshot('context-picker-relaunched.png'); await closePanel(page);
  });
}
