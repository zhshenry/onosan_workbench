// Use the installed app's current settings dialog and integrated rail navigation.
export async function navigateInstalled(page, workbench, label, view) {
  const settings = page.getByRole('dialog', { name: '设置', exact: true });
  const name = ['日程待办', '日程和待办', '待办与日程'].includes(label) ? /^(?:日程待办|日程和待办|待办与日程)$/ : label;
  if (workbench === 'settings') {
    if (!await settings.isVisible()) await page.getByRole('button', { name: '设置', exact: true }).click();
    if (label) await settings.locator('.settings-sections').getByRole('button', { name, exact: true }).click();
  } else {
    if (await settings.isVisible()) {
      await settings.getByRole('button', { name: '关闭', exact: true }).click();
      await settings.waitFor({ state: 'hidden' });
    }
    const trigger = page.locator(`.rail [data-workbench="${workbench}"]`);
    await trigger.click();
    if (label) {
      await page.locator('.topbar .avatar').hover();
      await trigger.hover();
      await page.locator('.rail').getByRole('button', { name, exact: true }).click();
    }
  }
  if (view) await page.locator(`#view-${view}`).waitFor({ state: 'visible' });
}

export async function collapseInstalledAssistant(page) {
  const topbar = page.locator('.topbar');
  await topbar.waitFor();
  if (await page.locator('.bot-shell').count()) {
    await topbar.getByRole('combobox', { name: 'AI 助手', exact: true }).click();
    await page.getByRole('option', { name: '收起助手', exact: true }).click();
    return;
  }
  const collapse = topbar.getByRole('button', { name: '收起 AI 助手', exact: true });
  if (await collapse.isVisible()) {
    await collapse.click();
    await page.locator('#workbench-ai-panel').waitFor({ state: 'hidden' });
  }
}
