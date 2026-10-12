// Real installed app, normal UI writes and loopback-only synthetic model responses.
// This covers proposal/IPC/database/rendering, not an external model's quality.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

export const AI_CARDS_SCREENSHOTS = Object.freeze(['ai-cards-pending.png', 'ai-cards-applied.png', 'ai-cards-partial.png', 'ai-cards-failed.png', 'ai-cards-narrow.png', 'ai-cards-relaunched.png']);
const state = page => page.evaluate(() => window.workbench.todo.state());
const panel = page => page.locator('#workbench-ai-panel');
const lastCard = page => panel(page).locator('.todo-proposal-card').last();
async function home(page) { await page.locator('.rail [data-workbench="home"]').click(); await page.locator('#view-home').waitFor({ state: 'visible' }); }
async function openPanel(page) {
  if (await panel(page).getAttribute('aria-hidden') !== 'false') await page.locator('.topbar').getByRole('button', { name: '展开 AI 助手', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#workbench-ai-panel')?.getAttribute('aria-hidden') === 'false');
  await panel(page).waitFor({ state: 'visible' });
}
async function closePanel(page) {
  if (await panel(page).getAttribute('aria-hidden') === 'false') await page.locator('.topbar').getByRole('button', { name: '收起 AI 助手', exact: true }).click();
  await panel(page).waitFor({ state: 'hidden' });
}
async function ask(page, text) {
  const before = await panel(page).locator('.todo-proposal-card').count();
  await panel(page).getByRole('textbox', { name: '发送给当前对话的 AI 助手', exact: true }).fill(text);
  await panel(page).getByRole('button', { name: '发送', exact: true }).click();
  await page.waitForFunction(count => document.querySelectorAll('#workbench-ai-panel .todo-proposal-card').length > count, before);
  await lastCard(page).getByRole('button', { name: '应用所选', exact: true }).waitFor({ state: 'visible' });
  await lastCard(page).scrollIntoViewIfNeeded();
}
async function readApplied(page, count) {
  await lastCard(page).locator('.todo-proposal-badge.applied').waitFor({ state: 'visible' });
  assert.match(await lastCard(page).innerText(), new RegExp(`已应用 ${count} 项`));
  assert.equal(await lastCard(page).locator('input, button').count(), 0);
  assert.equal((await lastCard(page).innerText()).includes('待确认'), false);
}
export function assertAiCardGeometry(value) {
  assert.ok(value.width > 0 && value.clientWidth > 0);
  assert.ok(value.scrollWidth <= value.clientWidth, 'AI card must not scroll horizontally');
  assert.deepEqual(value.borders, ['1px', '1px', '1px', '1px'], 'All four borders must be equally thin');
  assert.ok(value.fieldsFit, 'Old/new values must fit within the card');
}

export async function runAiCardsPilot({ application, page, check, screenshot, runId, report }) {
  const title = `CI AI 建议卡 ${runId}`;
  let fixture; let responsePlan = { message: '', actions: [] };
  const server = createServer(async (request, response) => {
    for await (const _chunk of request) { /* Synthetic prompt consumed; never logged. */ }
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const chunk = (delta, finish_reason = null) => response.write(`data: ${JSON.stringify({ id: 'ai-card-pilot', object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
    chunk({ role: 'assistant' }); chunk({ content: JSON.stringify(responsePlan) }); chunk({}, 'stop'); response.end('data: [DONE]\n\n');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    await check('AI cards: configure loopback synthetic provider through normal UI without credentials', async () => {
      await closePanel(page);
      await page.locator('.rail [data-workbench="settings"]').click();
      await page.locator('.tree').getByRole('button', { name: 'AI 助手', exact: true }).click();
      await page.getByRole('button', { name: '添加供应商', exact: true }).first().click();
      const dialog = page.getByRole('dialog', { name: '添加供应商', exact: true });
      await dialog.getByRole('combobox', { name: '供应商类型', exact: true }).click();
      await page.getByRole('option', { name: '自定义', exact: true }).click();
      await dialog.getByRole('textbox', { name: '供应商名称', exact: true }).fill('本机合成验收');
      await dialog.getByRole('textbox', { name: '服务地址', exact: true }).fill(`http://127.0.0.1:${server.address().port}/v1`);
      await dialog.getByRole('button', { name: '保存供应商', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: '添加模型', exact: true }).click();
      const model = page.getByRole('dialog').filter({ has: page.locator('#ai-model-name') });
      await model.getByRole('textbox', { name: '模型名称 / ID', exact: true }).fill('synthetic-card-acceptance');
      await model.getByRole('button', { name: '添加模型', exact: true }).click(); await model.waitFor({ state: 'hidden' });
      const enabled = page.getByRole('switch', { name: '启用 AI', exact: true });
      if (await enabled.getAttribute('aria-checked') !== 'true') await enabled.click();
      await home(page);
      await page.locator('#view-home').getByRole('button', { name: '新增', exact: true }).click();
      const editor = page.getByRole('dialog', { name: '新增事项', exact: true });
      await editor.getByRole('textbox', { name: '待办名称', exact: true }).fill(title);
      await editor.getByRole('button', { name: '更多设置：未设置', exact: true }).click();
      await editor.getByRole('textbox', { name: '备注 / 进展', exact: true }).fill('真实旧备注');
      await editor.getByRole('button', { name: '创建', exact: true }).click(); await editor.waitFor({ state: 'hidden' });
      fixture = (await state(page)).tasks.find(task => task.title === title); assert.ok(fixture);
      await openPanel(page);
    });
    await check('AI cards: proposal snapshot, keyboard/no-selection/cancel and no pre-confirmation writes', async () => {
      responsePlan = { message: '合成模型响应，实际卡片和写入链路。', actions: [{ type: 'update', id: fixture.id, patch: { note: '取消的内容' } }] };
      await ask(page, '生成取消验收建议');
      const card = lastCard(page); assert.match(await card.innerText(), /真实旧备注/);
      const checkbox = card.getByRole('checkbox'); await checkbox.focus(); await page.keyboard.press('Space');
      assert.equal(await card.getByRole('button', { name: '应用所选', exact: true }).isDisabled(), true);
      assert.equal((await state(page)).tasks.find(task => task.id === fixture.id).note, '真实旧备注');
      await card.getByRole('button', { name: '保留原内容', exact: true }).click();
      await card.locator('.todo-proposal-badge.discarded').waitFor({ state: 'visible' });
      assert.equal((await state(page)).tasks.find(task => task.id === fixture.id).note, '真实旧备注');
    });
    await check('AI cards: full apply retains the original card, snapshot, result count and readonly controls', async () => {
      responsePlan = { message: '更新备注，其他字段不变。', actions: [{ type: 'update', id: fixture.id, patch: { note: '已应用的备注' } }] };
      await ask(page, '生成完整应用验收建议');
      await screenshot('ai-cards-pending.png');
      const beforeCount = await panel(page).locator('.todo-proposal-card').count();
      await lastCard(page).getByRole('button', { name: '应用所选', exact: true }).click(); await readApplied(page, 1);
      assert.equal(await panel(page).locator('.todo-proposal-card').count(), beforeCount);
      assert.match(await lastCard(page).innerText(), /真实旧备注/); assert.match(await lastCard(page).innerText(), /已应用的备注/);
      const saved = (await state(page)).tasks.find(task => task.id === fixture.id);
      assert.equal(saved.note, '已应用的备注'); assert.equal(saved.id, fixture.id); assert.equal(saved.createdAt, fixture.createdAt); assert.equal(saved.title, title); assert.equal(saved.status, fixture.status);
      await screenshot('ai-cards-applied.png');
      await closePanel(page); await openPanel(page); await readApplied(page, 1);
    });
    await check('AI cards: partial apply marks unselected rows and consumes the entire token', async () => {
      responsePlan = { message: '部分选择验收。', actions: [{ type: 'update', id: fixture.id, patch: { priority: 'high' } }, { type: 'create_category', category: { id: randomUUID(), name: '不得创建的标签', color: '#123456' } }] };
      await ask(page, '生成部分选择验收建议'); await lastCard(page).getByRole('checkbox').nth(1).uncheck();
      await lastCard(page).getByRole('button', { name: '应用所选', exact: true }).click(); await readApplied(page, 1);
      assert.match(await lastCard(page).innerText(), /未选择（本轮未应用）/);
      assert.equal((await state(page)).categories.some(category => category.name === '不得创建的标签'), false);
      assert.equal((await state(page)).tasks.find(task => task.id === fixture.id).priority, 'high');
      await screenshot('ai-cards-partial.png');
    });
    await check('AI cards: failed selected dependency rolls back earlier writes, retains detail and shows no success', async () => {
      const categoryId = randomUUID(); const plannedDate = fixture.plannedDate;
      responsePlan = { message: '选择依赖失败验收。', actions: [
        { type: 'update', id: fixture.id, patch: { note: '失败不应留下' } },
        { type: 'create_category', category: { id: categoryId, name: '依赖标签', color: '#345678' } },
        { type: 'create', task: { title: '失败不应创建', kind: 'task', status: 'todo', priority: 'medium', plannedDate, dueAt: null, endAt: null, remindAt: null, categoryId, progress: null, note: '' } },
      ] };
      await ask(page, '生成失败回滚验收建议'); await lastCard(page).getByRole('checkbox').nth(1).uncheck();
      const before = await state(page);
      await lastCard(page).getByRole('button', { name: '应用所选', exact: true }).click();
      await lastCard(page).getByRole('alert').waitFor({ state: 'visible' });
      assert.match(await lastCard(page).innerText(), /本次未应用/); assert.equal(await lastCard(page).locator('.todo-proposal-badge.applied').count(), 0);
      assert.deepEqual(await state(page), before);
      await lastCard(page).getByRole('alert').scrollIntoViewIfNeeded(); await screenshot('ai-cards-failed.png');
      await lastCard(page).getByRole('button', { name: '保留原内容', exact: true }).click();
    });
    await check('AI cards: long values, uniform border, narrow panel and all existing themes', async () => {
      const longNote = '长备注完整可读，不截断关键内容。'.repeat(30);
      responsePlan = { message: '长内容和窄面板验收。', actions: [{ type: 'update', id: fixture.id, patch: { title: '长标题'.repeat(45), note: longNote, dueAt: null } }] };
      await ask(page, '生成长内容验收建议');
      const separator = panel(page).getByRole('separator', { name: '调整助手宽度', exact: true });
      await separator.focus(); for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
      for (const [theme, label] of [['mist', '雾灰 · 轻雾'], ['cool', '冷灰 · 凝霜'], ['warm', '暖砂 · 柔雾']]) {
        await closePanel(page); await page.locator('.rail [data-workbench="settings"]').click();
        await page.locator('.tree').getByRole('button', { name: '外观', exact: true }).click(); await page.getByRole('radio', { name: label, exact: true }).click();
        await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, theme);
        const win = await application.browserWindow(page); await win.evaluate(win => win.setContentSize(1024, 680));
        await home(page); await openPanel(page);
        const card = lastCard(page);
        assert.match(await card.innerText(), /长标题/); assert.ok((await card.innerText()).includes(longNote));
        const geometry = await card.evaluate(element => {
          const style = getComputedStyle(element); const bounds = element.getBoundingClientRect();
          return { width: bounds.width, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
            borders: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth],
            fieldsFit: [...element.querySelectorAll('.todo-proposal-before, .todo-proposal-after')].every(field => field.scrollWidth <= field.clientWidth) };
        });
        assertAiCardGeometry(geometry);
      }
      await lastCard(page).locator('.todo-proposal-header').scrollIntoViewIfNeeded(); await screenshot('ai-cards-narrow.png');
      await lastCard(page).getByRole('button', { name: '保留原内容', exact: true }).click();
      await lastCard(page).locator('.todo-proposal-badge.discarded').waitFor({ state: 'visible' });
      await closePanel(page);
    });
    fixture = (await state(page)).tasks.find(task => task.id === fixture.id);
    report.aiCards = { synthetic: true, model: 'loopback synthetic SSE; no external model or credentials', task: { id: fixture.id, title: fixture.title, note: fixture.note, priority: fixture.priority, createdAt: fixture.createdAt, updatedAt: fixture.updatedAt }, crossRestartCardDetails: 'Not persisted by design; existing terminal chat states remain readonly.' };
    return fixture;
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

export async function verifyAiCardsRelaunch({ page, check, screenshot, fixture }) {
  await check('AI cards: real same-version restart preserves exact business data and readonly old tokens', async () => {
    assert.deepEqual((await state(page)).tasks.find(task => task.id === fixture.id), fixture);
    await home(page); await openPanel(page);
    const cards = panel(page).locator('.todo-proposal-card'); assert.ok(await cards.count() >= 5);
    assert.equal(await cards.locator('button, input').count(), 0);
    assert.match(await cards.first().innerText(), /原始快照不可用/);
    assert.equal(await cards.locator('.todo-proposal-badge.pending').count(), 0);
    await cards.last().scrollIntoViewIfNeeded(); await screenshot('ai-cards-relaunched.png'); await closePanel(page);
  });
}
