import assert from 'node:assert/strict';

export const ISLAND_SCREENSHOTS = Object.freeze(['island-empty.png', 'island-shelf-saved.png', 'island-tools.png', 'island-relaunched.png']);
const state = page => page.evaluate(() => window.workbench.island.state());
const navigate = (island, name) => island.getByRole('navigation', { name: '灵动岛页面', exact: true }).getByRole('button', { name, exact: true }).click();

export async function openInstalledIsland({ application, page, report }) {
  if (!(await state(page)).settings.enabled) await page.locator('.topbar').getByRole('button', { name: '打开桌面灵动岛', exact: true }).click();
  let island = application.windows().find(candidate => /[?&]window=float(?:&|$)/.test(candidate.url()));
  if (!island) island = await application.waitForEvent('window', { predicate: candidate => /[?&]window=float(?:&|$)/.test(candidate.url()) });
  island.setDefaultTimeout(15000);
  island.on('pageerror', error => report.errors.push(`island: ${error.message}`));
  await island.locator('.desktop-island').waitFor({ state: 'visible' });
  const native = await application.browserWindow(island);
  assert.equal(await native.evaluate(win => win.isVisible() && win.isAlwaysOnTop()), true);
  return { island, native };
}

export async function hoverExpandInstalledIsland(island) {
  await island.locator('.desktop-island:is(.is-collapsed, .is-expanded)').waitFor();
  // Expansion replaces the summary button while native pointer entry can race a
  // locator's stability check. Move to its measured position without retrying it.
  const point = await island.locator('.desktop-island').evaluate(element => {
    const summary = element.querySelector('.island-summary');
    if (!summary) return null;
    const box = summary.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  });
  if (point) await island.mouse.move(point.x, point.y);
  await island.locator('.desktop-island.is-expanded').waitFor();
  await island.waitForFunction(() => document.querySelector('.desktop-island.is-expanded')?.getAnimations().every(animation => animation.playState !== 'running'));
}

async function expand(island) {
  await hoverExpandInstalledIsland(island);
  const pin = island.getByRole('button', { name: '固定展开', exact: true });
  if (await pin.count()) await pin.click();
}

export async function runIslandEmptyPilot(context) {
  const { page, check, screenshot } = context;
  await check('Desktop island: fresh shelf and disconnected quotas use the real installed surface', async () => {
    const { island } = await openInstalledIsland(context);
    await island.locator('.desktop-island.is-collapsed').waitFor();
    const bounds = await island.locator('.desktop-island').boundingBox();
    assert.deepEqual([bounds.width, bounds.height], [580, 40]);
    assert.match(await island.locator('.island-summary').innerText(), /Cursor/);
    assert.equal((await page.evaluate(() => window.workbench.island.quotas())).every(provider => provider.status === 'disconnected' && provider.windows.length === 0), true);
    await expand(island); await navigate(island, '置物架');
    await island.getByRole('region', { name: '文件', exact: true }).getByText('拖入文件', { exact: true }).waitFor();
    await island.getByRole('region', { name: '便利贴', exact: true }).getByText('将文字保存为便利贴', { exact: true }).waitFor();
    await screenshot('island-empty.png', island);
    await island.getByRole('button', { name: '隐藏桌面灵动岛', exact: true }).click();
  });
}

export async function runIslandPilot(context) {
  const { page, check, screenshot, runId } = context;
  const fixture = { text: `CI synthetic sticky note ${runId}`, draft: `CI unsaved sticky draft ${runId}` };
  const { island } = await openInstalledIsland(context);
  await expand(island);
  await check('Desktop island: four pages, note save/edit and unsaved draft use normal controls', async () => {
    for (const label of ['日程待办', '置物架', 'AI 额度', '小工具']) {
      await navigate(island, label);
      await island.waitForFunction(() => document.querySelector('.island-section-label')?.textContent === document.querySelector('.island-footer [aria-current="page"]')?.textContent);
      const bounds = await island.locator('.desktop-island').boundingBox();
      assert.deepEqual([bounds.width, bounds.height], [580, 270]);
    }
    await navigate(island, '置物架');
    const editor = island.getByRole('textbox', { name: '文字内容', exact: true });
    await editor.fill(fixture.text); await island.getByRole('button', { name: '保存', exact: true }).click();
    await island.getByText(fixture.text, { exact: true }).waitFor();
    await island.getByRole('button', { name: `文字操作：${fixture.text.slice(0, 24)}`, exact: true }).click();
    await island.getByRole('menuitem', { name: '编辑', exact: true }).click();
    assert.equal(await editor.inputValue(), fixture.text);
    fixture.text += ' edited';
    await editor.fill(fixture.text); await island.getByRole('button', { name: '保存', exact: true }).click();
    await island.getByText(fixture.text, { exact: true }).waitFor();
    await editor.fill(fixture.draft); await editor.press('Tab');
    await page.waitForFunction(text => window.workbench.island.state().then(value => value.noteDraft.text === text), fixture.draft);
    fixture.notes = (await state(page)).notes;
    assert.equal(fixture.notes.length, 1); assert.equal(fixture.notes[0].text, fixture.text);
    await screenshot('island-shelf-saved.png', island);
  });
  await check('Desktop island: focus pauses and water records explicit confirmation through the UI', async () => {
    await navigate(island, '小工具');
    await island.getByRole('spinbutton', { name: '自定义专注分钟', exact: true }).fill('25');
    await island.getByRole('button', { name: '开始专注', exact: true }).click();
    await island.getByRole('button', { name: '暂停', exact: true }).click();
    fixture.focus = (await state(page)).focus;
    assert.equal(fixture.focus.endsAt, null); assert.ok(fixture.focus.remainingMs > 0);
    await island.getByRole('button', { name: '开启喝水提醒', exact: true }).click();
    await island.getByRole('button', { name: '已喝水', exact: true }).click();
    await page.waitForFunction(() => window.workbench.island.state().then(value => value.water.count === 1));
    await screenshot('island-tools.png', island);
    await island.getByRole('button', { name: '隐藏桌面灵动岛', exact: true }).click();
  });
  return fixture;
}

export async function verifyIslandRelaunch(context) {
  const { page, check, screenshot, fixture } = context;
  await check('Desktop island: saved note, draft, paused focus and water survive full installed-app relaunch', async () => {
    const restored = await state(page);
    assert.deepEqual(restored.notes, fixture.notes);
    assert.equal(restored.focus.endsAt, null); assert.equal(restored.focus.remainingMs, fixture.focus.remainingMs);
    assert.equal(restored.water.count, 1);
    const { island } = await openInstalledIsland(context);
    await expand(island); await navigate(island, '置物架');
    assert.equal(await island.getByRole('textbox', { name: '文字内容', exact: true }).inputValue(), fixture.draft);
    await island.getByText(fixture.text, { exact: true }).waitFor();
    await screenshot('island-relaunched.png', island);
    await island.getByRole('button', { name: '隐藏桌面灵动岛', exact: true }).click();
  });
}
