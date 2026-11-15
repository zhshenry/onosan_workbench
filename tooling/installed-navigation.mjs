// Use the installed app's current settings dialog and integrated rail navigation.
export async function navigateInstalled(page, workbench, label, view) {
  const settings = page.getByRole('dialog', { name: '设置', exact: true });
  if (workbench === 'settings') {
    if (!await settings.isVisible()) await page.locator('.rail [data-workbench="settings"]').click();
    if (label) await settings.locator('.settings-sections').getByRole('button', { name: label, exact: true }).click();
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
      await page.locator('.rail').getByRole('button', { name: label, exact: true }).click();
    }
  }
  if (view) await page.locator(`#view-${view}`).waitFor({ state: 'visible' });
}
