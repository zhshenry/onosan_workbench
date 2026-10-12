// Issue #13 acceptance for the actual installed Electron app, never a prototype.
// Every profile/settings write is a UI action. Bridge evaluations are read-only.
import assert from 'node:assert/strict';

export const YEAR_DROPDOWN_SCREENSHOTS = Object.freeze([
  'year-dropdown-mist-1024x680.png',
  'year-dropdown-cool-1024x680.png',
  'year-dropdown-warm-1024x680.png',
  'year-dropdown-saved.png',
  'year-dropdown-relaunched.png',
]);
export const YEAR_DROPDOWN_MATRIX = Object.freeze([
  ['mist', '雾灰 · 轻雾'], ['cool', '冷灰 · 凝霜'], ['warm', '暖砂 · 柔雾'],
].flatMap(([theme, label]) => [[1280, 820], [1024, 680]].map(([width, height]) => Object.freeze({
  theme, label, width, height, reducedMotion: theme === 'mist' && width === 1280 ? 'no-preference' : 'reduce',
}))));

function contained(inner, outer, description) {
  for (const rect of [inner, outer]) {
    assert.ok(rect && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(rect[key])), `${description}: invalid bounds`);
    assert.ok(rect.width > 0 && rect.height > 0, `${description}: empty bounds`);
  }
  const tolerance = 1; // Fractional CSS-pixel rounding at Windows display scales.
  assert.ok(inner.x >= outer.x - tolerance && inner.y >= outer.y - tolerance
    && inner.x + inner.width <= outer.x + outer.width + tolerance
    && inner.y + inner.height <= outer.y + outer.height + tolerance,
  `${description}: clipped or outside boundary (${JSON.stringify({ inner, outer })})`);
}
export function assertYearDropdownGeometry({ viewport, dialog, calendar, trigger, list, selected, hitSelected, scrollWidth, clientWidth, yearLabelsComplete, triggerLabelComplete }) {
  contained(dialog, viewport, 'Profile editor');
  contained(calendar, viewport, 'Date calendar');
  contained(calendar, dialog, 'Date calendar in editor');
  contained(trigger, calendar, 'Year trigger in calendar');
  contained(list, viewport, 'Year dropdown');
  contained(list, dialog, 'Year dropdown in editor');
  contained(selected, list, 'Current year is scrolled into view');
  assert.ok(Math.abs(list.width - trigger.width) <= 1, `Year dropdown must match trigger width (${list.width} vs ${trigger.width})`);
  assert.ok(Number.isFinite(scrollWidth) && Number.isFinite(clientWidth) && clientWidth > 0 && scrollWidth <= clientWidth,
    `Year dropdown must not scroll horizontally (${scrollWidth} vs ${clientWidth})`);
  assert.equal(yearLabelsComplete, true, 'Every year option must show its complete, unwrapped text');
  assert.equal(triggerLabelComplete, true, 'Year trigger text must not be clipped or ellipsized');
  assert.equal(hitSelected, true, 'Year dropdown must paint above the calendar and receive pointer hits');
}

const dateMenu = page => page.getByRole('dialog', { name: '选择日期', exact: true });
const yearTrigger = page => page.getByRole('combobox', { name: '选择年份', exact: true });
const yearMenu = page => page.getByRole('listbox', { name: '选择年份', exact: true });
const birthday = dialog => dialog.locator('.date-picker > button');
const labelForDate = iso => iso ? iso.split('-').map(Number).map((value, index) => `${value}${['年', '月', '日'][index]}`).join('') : '选择日期';
const store = page => page.evaluate(() => window.workbench.bazi.list());

async function assertBirthday(dialog, iso) {
  assert.equal((await birthday(dialog).textContent()).trim(), labelForDate(iso));
}
async function assertView(page, year, month) {
  assert.equal((await yearTrigger(page).textContent()).trim(), `${year}年`);
  assert.equal((await dateMenu(page).locator('.date-month-label > span').textContent()).trim(), `${month}月`);
}
async function assertCursor(page, iso) {
  assert.equal(await dateMenu(page).locator('.date-grid .is-active').getAttribute('aria-label'), iso);
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), iso);
}
async function assertActiveYear(page, year) {
  const active = await yearTrigger(page).getAttribute('aria-activedescendant');
  assert.ok(active, 'Open year combobox must expose its active descendant');
  const label = await page.evaluate(id => document.getElementById(id)?.textContent?.trim(), active);
  assert.equal(label, `${year}年`);
}
async function chooseYear(page, year) {
  await yearTrigger(page).click();
  await yearMenu(page).getByRole('option', { name: `${year}年`, exact: true }).click();
  await yearMenu(page).waitFor({ state: 'hidden' });
  await dateMenu(page).waitFor({ state: 'visible' });
}
async function viewMonth(page, month) {
  // Keep the requested year. Never shortcut the UI with DOM or bridge writes.
  for (let steps = 0; steps < 12; steps++) {
    const current = Number((await dateMenu(page).locator('.date-month-label > span').textContent()).replace('月', ''));
    if (current === month) return;
    await dateMenu(page).getByRole('button', { name: current < month ? '下个月' : '上个月', exact: true }).click();
  }
  assert.fail(`Could not navigate to month ${month}`);
}
async function openBazi(page) {
  await page.locator('.rail [data-workbench="life"]').click();
  await page.locator('.tree').getByRole('button', { name: '命理', exact: true }).click();
  await page.locator('#view-bazi .greet').waitFor({ state: 'visible' });
}
async function createEditor(page) {
  await page.locator('#view-bazi .gbtns').getByRole('button', { name: '新建命例', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '新建命例', exact: true });
  await dialog.waitFor({ state: 'visible' });
  return dialog;
}
async function editProfile(page, name) {
  await page.locator('#view-bazi .bazi-psel-btn').click();
  await page.getByRole('button', { name: `编辑 ${name}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '编辑命例', exact: true });
  await dialog.waitFor({ state: 'visible' });
  return dialog;
}
async function cancelEditor(dialog) {
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
}
async function resize(application, page, width, height) {
  const window = await application.browserWindow(page);
  await window.evaluate((win, size) => win.setContentSize(size.width, size.height), { width, height });
  await page.waitForFunction(size => innerWidth === size.width && innerHeight === size.height, { width, height });
}
async function profileDate(page, name, expected) {
  // Await the bridge read itself; a Promise is not evidence of a matching value.
  const deadline = Date.now() + 15000;
  let data = await store(page);
  while (!data.profiles.some(profile => profile.name === name && profile.date === expected) && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 100));
    data = await store(page);
  }
  assert.equal(data.profiles.length, 1, 'Synthetic fixture must never duplicate profiles');
  const profile = data.profiles[0];
  assert.equal(profile.name, name);
  assert.equal(profile.date, expected, 'Read-back must match the saved birthday, not just profile count');
  return profile;
}
async function inspectGeometry(page, dialog) {
  // Let normal CSS animations finish naturally. Measuring the resulting position
  // still catches coordinates incorrectly cached from a scaled animation origin.
  await page.waitForFunction(() => !document.querySelector('.date-year-menu')?.closest('dialog')?.getAnimations({ subtree: true }).some(animation => animation.playState === 'running'));
  const geometry = await page.evaluate(() => {
    const rect = element => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    };
    const list = document.querySelector('.date-year-menu');
    const trigger = document.querySelector('.date-year-select [role="combobox"]');
    const completeText = element => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const text = range.getBoundingClientRect();
      const bounds = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return element.scrollWidth <= element.clientWidth && text.width > 0 && range.getClientRects().length === 1
        && text.left >= bounds.left + Number.parseFloat(style.paddingLeft) - 1
        && text.right <= bounds.right - Number.parseFloat(style.paddingRight) + 1;
    };
    const options = [...list.querySelectorAll('[role="option"]')];
    const selected = list.querySelector('[aria-selected="true"]');
    const selectedRect = selected.getBoundingClientRect();
    const hit = document.elementFromPoint(selectedRect.x + selectedRect.width / 2, selectedRect.y + selectedRect.height / 2);
    return {
      viewport: { x: 0, y: 0, width: innerWidth, height: innerHeight },
      dialog: rect(list.closest('dialog')), calendar: rect(document.querySelector('.date-menu')),
      trigger: rect(trigger), list: rect(list), selected: rect(selected), hitSelected: hit === selected || selected.contains(hit),
      scrollWidth: list.scrollWidth, clientWidth: list.clientWidth,
      yearLabelsComplete: options.length === 201 && options.every((option, index) => option.textContent.trim() === `${1900 + index}年` && completeText(option)),
      triggerLabelComplete: completeText(trigger.querySelector('span')),
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      animationName: getComputedStyle(list).animationName,
      animationDuration: getComputedStyle(list).animationDuration,
    };
  });
  assert.equal(await dialog.locator('.date-year-menu').count(), 1, 'Year portal must remain in the native modal top layer');
  assertYearDropdownGeometry(geometry);
  return geometry;
}

// Called while the original synthetic task edit is already open. Its values are
// left intact so the pre-existing CRUD/persistence pilot remains authoritative.
export async function verifyUnboundedDatePicker(page) {
  await page.locator('#task-date').click();
  const calendar = dateMenu(page);
  assert.equal(await yearTrigger(page).count(), 0, 'Unbounded task dates retain their original header');
  const original = await calendar.locator('.date-head > span').textContent();
  await calendar.getByRole('button', { name: '下个月', exact: true }).click();
  assert.notEqual(await calendar.locator('.date-head > span').textContent(), original);
  await calendar.getByRole('button', { name: '上个月', exact: true }).click();
  assert.equal(await calendar.locator('.date-head > span').textContent(), original);
  await page.keyboard.press('Escape');
  await calendar.waitFor({ state: 'hidden' });
}

export async function runYearDropdownPilot({ application, page, check, screenshot, runId, report }) {
  const name = `CI闰年${String(runId).slice(-6)}`; // Synthetic and within the 12-character UI limit.
  let id, createdAt;
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await resize(application, page, 1280, 820);
  await openBazi(page);
  await check('Year picker: new profile, current year, keyboard range and layered Escape without writes', async () => {
    assert.equal((await store(page)).profiles.length, 0);
    const dialog = await createEditor(page);
    await birthday(dialog).click();
    const initialYear = Number((await yearTrigger(page).textContent()).replace('年', ''));
    const initialMonth = Number((await dateMenu(page).locator('.date-month-label > span').textContent()).replace('月', ''));
    await yearTrigger(page).focus();
    await page.keyboard.press('ArrowDown');
    assert.equal(await yearMenu(page).getByRole('option').count(), 201);
    assert.deepEqual(await yearMenu(page).getByRole('option').allTextContents(), Array.from({ length: 201 }, (_, i) => `${1900 + i}年`));
    await assertActiveYear(page, initialYear);
    await page.keyboard.press('Home'); await assertActiveYear(page, 1900);
    await page.keyboard.press('ArrowUp'); await assertActiveYear(page, 1900);
    await page.keyboard.press('End'); await assertActiveYear(page, 2100);
    await page.keyboard.press('ArrowDown'); await assertActiveYear(page, 2100);
    await page.keyboard.press('ArrowUp'); await assertActiveYear(page, 2099);
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    await yearMenu(page).waitFor({ state: 'hidden' });
    await assertView(page, 2100, initialMonth);
    await assertBirthday(dialog, '');
    await yearTrigger(page).click();
    await page.keyboard.press('Escape');
    await yearMenu(page).waitFor({ state: 'hidden' });
    assert.equal(await dateMenu(page).isVisible(), true);
    assert.equal(await yearTrigger(page).evaluate(element => element === document.activeElement), true);
    await page.keyboard.press('Escape');
    await dateMenu(page).waitFor({ state: 'hidden' });
    assert.equal(await dialog.isVisible(), true);
    assert.equal(await birthday(dialog).evaluate(element => element === document.activeElement), true);
    await birthday(dialog).click();
    await assertView(page, initialYear, initialMonth);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    assert.equal((await store(page)).profiles.length, 0);
  });
  await check('Year picker: create and save synthetic leap-day profile through UI', async () => {
    const dialog = await createEditor(page);
    await dialog.getByRole('textbox', { name: '姓名或备注', exact: true }).fill(name);
    await birthday(dialog).click();
    await chooseYear(page, 2000); await viewMonth(page, 2);
    await assertBirthday(dialog, '');
    await dateMenu(page).getByRole('gridcell', { name: '2000-02-29', exact: true }).click();
    await assertBirthday(dialog, '2000-02-29');
    await dialog.locator('.time-picker > button').click();
    await page.getByRole('option', { name: '09时', exact: true }).click();
    await page.getByRole('option', { name: '00分', exact: true }).click();
    await dialog.getByRole('button', { name: '保存并排盘', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    const created = await profileDate(page, name, '2000-02-29');
    id = created.id; createdAt = created.createdAt;
    assert.ok(Number.isFinite(Date.parse(createdAt)), 'New profile must have a valid creation time');
  });
  await check('Year picker: 2000-02-29 to 2001 corrects focus only; cancel, reopen and outside click preserve birthday', async () => {
    let dialog = await editProfile(page, name);
    await birthday(dialog).click(); await chooseYear(page, 2001);
    await assertView(page, 2001, 2); await assertCursor(page, '2001-02-28');
    await assertBirthday(dialog, '2000-02-29');
    assert.equal((await profileDate(page, name, '2000-02-29')).id, id);
    await yearTrigger(page).click();
    await dialog.getByRole('textbox', { name: '姓名或备注', exact: true }).click();
    await yearMenu(page).waitFor({ state: 'hidden' });
    await dateMenu(page).waitFor({ state: 'hidden' });
    await assertBirthday(dialog, '2000-02-29');
    await birthday(dialog).click(); await assertView(page, 2000, 2);
    await chooseYear(page, 2001); await page.keyboard.press('Escape');
    await cancelEditor(dialog);
    dialog = await editProfile(page, name);
    await assertBirthday(dialog, '2000-02-29');
    await birthday(dialog).click(); await assertView(page, 2000, 2);
    await page.keyboard.press('Escape'); await cancelEditor(dialog);
  });
  await check('Year picker: original month buttons and date-grid Arrow/Page/Enter navigation', async () => {
    const dialog = await editProfile(page, name);
    await birthday(dialog).click();
    for (const [key, expected] of [['ArrowRight', '2000-03-01'], ['ArrowLeft', '2000-02-29'], ['ArrowUp', '2000-02-22'], ['ArrowDown', '2000-02-29'], ['PageUp', '2000-01-29'], ['PageDown', '2000-02-29']]) {
      await page.keyboard.press(key); await assertCursor(page, expected);
      await assertBirthday(dialog, '2000-02-29');
    }
    await dateMenu(page).getByRole('button', { name: '下个月', exact: true }).click(); await assertView(page, 2000, 3);
    await dateMenu(page).getByRole('button', { name: '上个月', exact: true }).click(); await assertView(page, 2000, 2);
    await assertCursor(page, '2000-02-29');
    await page.keyboard.press('Enter'); await dateMenu(page).waitFor({ state: 'hidden' });
    await assertBirthday(dialog, '2000-02-29'); await cancelEditor(dialog);
  });
  await check('Year picker: inclusive 1900/2100 choices preserve month and only selecting a day changes the draft', async () => {
    const dialog = await editProfile(page, name);
    for (const year of [1900, 2100]) {
      await birthday(dialog).click(); await chooseYear(page, year);
      await assertView(page, year, 2); await assertCursor(page, `${year}-02-28`);
      await assertBirthday(dialog, year === 1900 ? '2000-02-29' : '1900-02-28');
      await dateMenu(page).getByRole('gridcell', { name: `${year}-02-28`, exact: true }).click();
      await assertBirthday(dialog, `${year}-02-28`);
      await profileDate(page, name, '2000-02-29');
    }
    await cancelEditor(dialog);
  });
  await check('Year picker: Today and Clear retain their original draft-only semantics', async () => {
    const dialog = await editProfile(page, name);
    await birthday(dialog).click();
    const todayCell = dateMenu(page).locator('.date-grid .is-today');
    const today = await todayCell.count() ? await todayCell.getAttribute('aria-label') : null;
    // February 2000 normally does not contain today; read the app machine clock.
    const expected = today ?? await page.evaluate(() => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; });
    await dateMenu(page).getByRole('button', { name: '今天', exact: true }).click();
    await assertBirthday(dialog, expected); await dateMenu(page).waitFor({ state: 'hidden' });
    await birthday(dialog).click(); await dateMenu(page).getByRole('button', { name: '清除', exact: true }).click();
    await assertBirthday(dialog, ''); await dateMenu(page).waitFor({ state: 'hidden' });
    await profileDate(page, name, '2000-02-29'); await cancelEditor(dialog);
  });
  report.yearDropdown = { synthetic: true, profileName: name, profileId: id, matrix: [] };
  for (const fixture of YEAR_DROPDOWN_MATRIX) {
    await check(`Year picker: ${fixture.theme} ${fixture.width}x${fixture.height} actual app, scroll visibility and overlay boundaries`, async () => {
      await page.emulateMedia({ reducedMotion: fixture.reducedMotion });
      await page.locator('.rail [data-workbench="settings"]').click();
      await page.locator('.tree').getByRole('button', { name: '外观', exact: true }).click();
      await page.getByRole('radio', { name: fixture.label, exact: true }).click();
      await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, fixture.theme);
      assert.equal((await page.evaluate(() => window.workbench.settings.get())).uiTheme, fixture.theme);
      await resize(application, page, fixture.width, fixture.height);
      await openBazi(page);
      const dialog = await editProfile(page, name);
      await birthday(dialog).click(); await chooseYear(page, 2001);
      await yearTrigger(page).click();
      await assertActiveYear(page, 2001);
      assert.equal(await dialog.locator('input[type="date"], input[type="number"]').count(), 0, 'No native date/year inputs');
      assert.equal(await yearMenu(page).getByRole('textbox').count(), 0, 'The dropdown remains a simple list');
      const geometry = await inspectGeometry(page, dialog);
      assert.equal(geometry.reducedMotion, fixture.reducedMotion === 'reduce');
      if (fixture.reducedMotion === 'no-preference') {
        assert.notEqual(geometry.animationName, 'none', 'At least one matrix case must exercise normal CSS animation');
        assert.ok(Number.parseFloat(geometry.animationDuration) > 0, 'Normal-animation geometry must not disable duration');
      }
      report.yearDropdown.matrix.push({ ...fixture, geometry });
      if (fixture.width === 1024) await screenshot(`year-dropdown-${fixture.theme}-1024x680.png`);
      await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
      await cancelEditor(dialog); await profileDate(page, name, '2000-02-29');
    });
  }
  await check('Year picker: native window resize dismisses both popovers without changing the profile', async () => {
    const dialog = await editProfile(page, name);
    await birthday(dialog).click(); await yearTrigger(page).click();
    await resize(application, page, 1280, 820);
    await yearMenu(page).waitFor({ state: 'hidden' }); await dateMenu(page).waitFor({ state: 'hidden' });
    await assertBirthday(dialog, '2000-02-29'); await cancelEditor(dialog);
  });
  await check('Year picker: commit corrected leap-day with day selection and save edited profile', async () => {
    const dialog = await editProfile(page, name);
    await birthday(dialog).click(); await chooseYear(page, 2001);
    await assertBirthday(dialog, '2000-02-29'); await assertCursor(page, '2001-02-28');
    await page.keyboard.press('Enter');
    await dateMenu(page).waitFor({ state: 'hidden' }); await assertBirthday(dialog, '2001-02-28');
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    const saved = await profileDate(page, name, '2001-02-28');
    assert.equal(saved.id, id); assert.equal(saved.time, '09:00');
    assert.equal(saved.createdAt, createdAt, 'Editing must preserve the original creation time');
    await screenshot('year-dropdown-saved.png');
  });
  return { id, name, date: '2001-02-28', time: '09:00', createdAt };
}

export async function verifyYearDropdownRelaunch({ page, check, screenshot, fixture }) {
  await check('Year picker: same installed version relaunch retains saved birthday and opens at saved year/month/day', async () => {
    const saved = await profileDate(page, fixture.name, fixture.date);
    assert.equal(saved.id, fixture.id); assert.equal(saved.time, fixture.time);
    assert.equal(saved.createdAt, fixture.createdAt, 'Relaunch must retain the original creation time');
    await openBazi(page);
    const dialog = await editProfile(page, fixture.name);
    await assertBirthday(dialog, fixture.date); await birthday(dialog).click();
    await assertView(page, 2001, 2); await assertCursor(page, fixture.date);
    await yearTrigger(page).click(); await assertActiveYear(page, 2001);
    assert.equal(await yearMenu(page).getByRole('option', { name: '2001年', exact: true }).getAttribute('aria-selected'), 'true');
    await screenshot('year-dropdown-relaunched.png');
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await cancelEditor(dialog);
  });
}
