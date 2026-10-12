import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, symlink, mkdir, readFile, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { inspectPilotArtifacts, MAX_ARTIFACT_BYTES } from '../tooling/pilot-artifacts.mjs';
import { assertYearDropdownGeometry, YEAR_DROPDOWN_MATRIX, YEAR_DROPDOWN_SCREENSHOTS } from '../tooling/year-dropdown-pilot.mjs';

async function fixture(t: test.TestContext) {
  const directory = await mkdtemp(path.join(tmpdir(), 'ono-pilot-artifacts-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
test('Windows pilot permits only small synthetic screenshots and reports', async t => {
  const directory = await fixture(t);
  await writeFile(path.join(directory, 'report.json'), '{"status":"passed"}');
  await writeFile(path.join(directory, 'initial.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
  const value = await inspectPilotArtifacts(directory);
  assert.deepEqual(value.files, ['initial.png', 'report.json']);
  assert.equal(value.bytes, 27); assert.equal(value.retentionDays, 3);
  assert.ok(MAX_ARTIFACT_BYTES < value.uploadCeilingBytes);
});
test('Windows pilot refuses installer, database, trace, video and unexpected nested evidence', async t => {
  for (const name of ['installer.exe', 'tasks.db', 'trace.zip', 'recording.webm', 'node_modules']) {
    await t.test(name, async child => {
      const directory = await fixture(child);
      if (name === 'node_modules') await mkdir(path.join(directory, name));
      else await writeFile(path.join(directory, name), 'unapproved');
      await assert.rejects(inspectPilotArtifacts(directory), /Refusing unapproved artifact/);
    });
  }
});
test('Windows pilot refuses oversized or malformed evidence', async t => {
  const directory = await fixture(t);
  await writeFile(path.join(directory, 'report.json'), '{"status":"passed"}');
  await assert.rejects(inspectPilotArtifacts(directory, 1), /exceed/);
  await writeFile(path.join(directory, 'initial.png'), 'not a png');
  await assert.rejects(inspectPilotArtifacts(directory), /Invalid PNG/);
  await rm(path.join(directory, 'initial.png'));
  await writeFile(path.join(directory, 'report.json'), 'not json');
  await assert.rejects(inspectPilotArtifacts(directory), SyntaxError);
});
test('Windows pilot refuses real evidence file symlinks on every platform', async t => {
  const directory = await fixture(t);
  const evidence = path.join(directory, 'evidence');
  const target = path.join(directory, 'outside.json');
  const link = path.join(evidence, 'report.json');
  await mkdir(evidence);
  await writeFile(target, '{"status":"outside evidence"}');
  // A junction cannot stand in for a file symlink. Fail closed if the runner
  // cannot create this actual file link; never skip or change its privileges.
  await symlink(target, link, 'file');
  assert.ok((await lstat(link)).isSymbolicLink(), 'The file fixture must be a real symbolic link');
  await assert.rejects(inspectPilotArtifacts(evidence), /Refusing non-regular artifact: report\.json/);
  t.diagnostic(`Rejected a real evidence file symlink on ${process.platform}`);
});

test('Windows pilot refuses evidence beneath a real linked parent directory', async t => {
  const directory = await fixture(t);
  const target = path.join(directory, 'evidence');
  const link = path.join(directory, 'linked-parent');
  await mkdir(path.join(target, 'nested'), { recursive: true });
  await writeFile(path.join(target, 'nested', 'report.json'), '{}');
  // Windows junctions exercise the native directory-reparse-point path without
  // requiring Developer Mode. File symlinks have their own mandatory test above.
  const linkType = process.platform === 'win32' ? 'junction' : 'dir';
  await symlink(target, link, linkType);
  assert.ok((await lstat(link)).isSymbolicLink(), 'The parent fixture must be a real link');
  await assert.rejects(inspectPilotArtifacts(path.join(link, 'nested')), /must not traverse a link/);
  t.diagnostic(`Rejected a real parent directory ${linkType} on ${process.platform}`);
});

test('Year-dropdown evidence has five fixed screenshot names within the existing run budget', async t => {
  // PNG signatures here are unit fixtures, never app screenshots or acceptance evidence.
  const directory = await fixture(t);
  assert.deepEqual(YEAR_DROPDOWN_SCREENSHOTS, [
    'year-dropdown-mist-1024x680.png', 'year-dropdown-cool-1024x680.png', 'year-dropdown-warm-1024x680.png',
    'year-dropdown-saved.png', 'year-dropdown-relaunched.png',
  ]);
  for (const name of YEAR_DROPDOWN_SCREENSHOTS) await writeFile(path.join(directory, name), Buffer.from('89504e470d0a1a0a', 'hex'));
  const value = await inspectPilotArtifacts(directory);
  assert.equal(value.files.length, 5); assert.equal(value.bytes, 40);
  assert.equal(MAX_ARTIFACT_BYTES, 19_000_000); assert.equal(value.uploadCeilingBytes, 20_000_000); assert.equal(value.retentionDays, 3);
  await assert.rejects(inspectPilotArtifacts(directory, 39), /exceed/);
  await writeFile(path.join(directory, 'year-dropdown-extra.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
  await assert.rejects(inspectPilotArtifacts(directory), /unapproved artifact/);
});

test('Year-dropdown matrix covers every approved theme at both actual app sizes', () => {
  assert.deepEqual(YEAR_DROPDOWN_MATRIX.map(({ theme, width, height }) => `${theme}:${width}x${height}`), [
    'mist:1280x820', 'mist:1024x680', 'cool:1280x820', 'cool:1024x680', 'warm:1280x820', 'warm:1024x680',
  ]);
  assert.ok(Object.isFrozen(YEAR_DROPDOWN_MATRIX));
  assert.ok(YEAR_DROPDOWN_MATRIX.every(Object.isFrozen));
  assert.deepEqual(YEAR_DROPDOWN_MATRIX.filter(({ reducedMotion }) => reducedMotion === 'no-preference').map(({ theme, width, height }) => `${theme}:${width}x${height}`), ['mist:1280x820']);
});

const geometry = () => ({
  viewport: { x: 0, y: 0, width: 1024, height: 680 },
  dialog: { x: 300, y: 40, width: 424, height: 600 },
  calendar: { x: 320, y: 220, width: 240, height: 210 },
  trigger: { x: 375, y: 221, width: 110, height: 24 },
  list: { x: 375, y: 245, width: 110, height: 210 },
  selected: { x: 378, y: 330, width: 104, height: 26 },
  hitSelected: true,
  scrollWidth: 102, clientWidth: 102, yearLabelsComplete: true, triggerLabelComplete: true,
});
test('Year-dropdown geometry asserts real bounds, selected-row scroll visibility and top-layer hit testing', () => {
  assert.doesNotThrow(() => assertYearDropdownGeometry(geometry()));
  for (const key of ['dialog', 'calendar', 'trigger', 'list', 'selected'] as const) {
    const clipped = geometry(); clipped[key].x = 1200;
    assert.throws(() => assertYearDropdownGeometry(clipped), /clipped|outside/);
    const hidden = geometry(); hidden[key].height = 0;
    assert.throws(() => assertYearDropdownGeometry(hidden), /empty bounds/);
    const invalid = geometry(); invalid[key].y = Number.NaN;
    assert.throws(() => assertYearDropdownGeometry(invalid), /invalid bounds/);
  }
  const occluded = geometry(); occluded.hitSelected = false;
  assert.throws(() => assertYearDropdownGeometry(occluded), /paint above/);
  const clippedBelow = geometry(); clippedBelow.selected.y = 450;
  assert.throws(() => assertYearDropdownGeometry(clippedBelow), /scrolled into view/);
});

test('Year-dropdown geometry rejects excess width, horizontal scroll and clipped year labels', () => {
  const tooWide = geometry(); tooWide.trigger.width -= 2;
  assert.throws(() => assertYearDropdownGeometry(tooWide), /match trigger width/);
  const rounded = geometry(); rounded.trigger.width -= 1;
  assert.doesNotThrow(() => assertYearDropdownGeometry(rounded));
  const horizontalScroll = geometry(); horizontalScroll.scrollWidth++;
  assert.throws(() => assertYearDropdownGeometry(horizontalScroll), /not scroll horizontally/);
  const missingWidth = geometry(); missingWidth.clientWidth = Number.NaN;
  assert.throws(() => assertYearDropdownGeometry(missingWidth), /not scroll horizontally/);
  const hiddenText = geometry(); hiddenText.yearLabelsComplete = false;
  assert.throws(() => assertYearDropdownGeometry(hiddenText), /complete, unwrapped text/);
  const ellipsized = geometry(); ellipsized.triggerLabelComplete = false;
  assert.throws(() => assertYearDropdownGeometry(ellipsized), /clipped or ellipsized/);
});

test('Installed-app entrypoint retains original CRUD and runs year acceptance before and after the same-version relaunch', async () => {
  const entry = await readFile(new URL('../tooling/windows-pilot.mjs', import.meta.url), 'utf8');
  const year = await readFile(new URL('../tooling/year-dropdown-pilot.mjs', import.meta.url), 'utf8');
  assert.ok(entry.indexOf("await screenshot('completed.png')") < entry.indexOf('birthdayFixture = await runYearDropdownPilot('));
  assert.ok(entry.indexOf('birthdayFixture = await runYearDropdownPilot(') < entry.indexOf("await check('Choose exit-on-close"));
  assert.ok(entry.indexOf("await screenshot('relaunched.png')") < entry.indexOf('await verifyYearDropdownRelaunch('));
  for (const retained of ['Create one synthetic task through the UI', 'Edit synthetic task title and note through the UI', 'Cancel completion once, then confirm completion through the UI', 'Relaunch same installed executable and verify persisted task and setting']) assert.ok(entry.includes(retained));
  assert.ok(entry.includes('await verifyUnboundedDatePicker(page)'));
  assert.match(entry, /chromiumSandbox: true/);
  assert.doesNotMatch(year, /\.saveProfile\(|\.saveNote\(|\.removeProfile\(|settings\.(?:set|update)\(|localStorage\.setItem|setContent\(|addInitScript\(|setInputFiles\(|--no-sandbox/);
  assert.match(year, /window\.workbench\.bazi\.list\(\)/);
  assert.match(year, /win\.setContentSize/);
  assert.match(year, /document\.elementFromPoint/);
  assert.match(year, /range\.getBoundingClientRect\(\)/);
  assert.match(year, /list\.scrollWidth/);
  assert.match(year, /reducedMotion: fixture\.reducedMotion/);
});

test('Year-dropdown persistence assertion verifies the actual returned date, not an async predicate object', async () => {
  const source = await readFile(new URL('../tooling/year-dropdown-pilot.mjs', import.meta.url), 'utf8');
  assert.match(source, /assert\.equal\(profile\.date, expected/);
  assert.doesNotMatch(source, /waitForFunction\(\(\{ name, expected \}\) => window\.workbench\.bazi\.list/);
});

test('AI-card evidence extends the existing bounded allowlist without loosening its guard', async t => {
  const { AI_CARDS_SCREENSHOTS } = await import('../tooling/ai-cards-pilot.mjs');
  assert.equal(AI_CARDS_SCREENSHOTS.length, 6); assert.ok(Object.isFrozen(AI_CARDS_SCREENSHOTS));
  const directory = await fixture(t);
  for (const name of AI_CARDS_SCREENSHOTS) await writeFile(path.join(directory, name), Buffer.from('89504e470d0a1a0a', 'hex'));
  assert.equal((await inspectPilotArtifacts(directory)).files.length, 6);
  await assert.rejects(inspectPilotArtifacts(directory, 47), /exceed/);
  await writeFile(path.join(directory, 'ai-cards-extra.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
  await assert.rejects(inspectPilotArtifacts(directory), /unapproved artifact/);
});

test('AI-card geometry rejects an emphasized border or overflowing old/new fields', async () => {
  const { assertAiCardGeometry } = await import('../tooling/ai-cards-pilot.mjs');
  const geometry = { width: 310, clientWidth: 308, scrollWidth: 308, borders: ['1px', '1px', '1px', '1px'], fieldsFit: true };
  assertAiCardGeometry(geometry);
  assert.throws(() => assertAiCardGeometry({ ...geometry, borders: ['1px', '1px', '1px', '4px'] }), /equally thin/);
  assert.throws(() => assertAiCardGeometry({ ...geometry, scrollWidth: 600 }), /horizontally/);
  assert.throws(() => assertAiCardGeometry({ ...geometry, fieldsFit: false }), /fit/);
});

test('AI acceptance uses only loopback synthetic responses and normal UI writes before real relaunch', async () => {
  const source = await readFile(new URL('../tooling/ai-cards-pilot.mjs', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../tooling/windows-pilot.mjs', import.meta.url), 'utf8');
  assert.ok(source.includes("server.listen(0, '127.0.0.1'"));
  assert.ok(source.includes('http://127.0.0.1:'));
  assert.doesNotMatch(source, /workbench\.(?:ai\.(?:apply|ask|saveProvider|saveModel)|todo\.(?:create|update|remove))\(/);
  assert.ok(source.includes('assert.deepEqual(await state(page), before)'));
  assert.ok(source.includes('assert.deepEqual((await state(page)).tasks.find(task => task.id === fixture.id), fixture)'));
  assert.ok(entry.indexOf('aiCardsFixture = await runAiCardsPilot(') < entry.indexOf("await check('Choose exit-on-close"));
  assert.ok(entry.indexOf('await verifyAiCardsRelaunch(') > entry.indexOf("await check('Relaunch same installed executable"));
});

test('Zoomed topbar evidence captures the native full surface without resampling or widening budget', async () => {
  const source = await readFile(new URL('../tooling/windows-pilot.mjs', import.meta.url), 'utf8');
  assert.match(source, /name\.startsWith\('topbar-dates-'\) && name\.endsWith\('-zoom125\.png'\)/);
  assert.match(source, /await win\.webContents\.capturePage\(\)/);
  assert.match(source, /image\.toPNG\(\)\.toString\('base64'\)/);
  assert.match(source, /assert\.deepEqual\(\[frame\.imageSize\.width, frame\.imageSize\.height\], frame\.contentSize/);
  assert.match(source, /pngPixels: \{ width: png\.readUInt32BE\(16\), height: png\.readUInt32BE\(20\) \}/);
  assert.doesNotMatch(source, /image\.resize\(|toJPEG\(/);
  assert.equal(MAX_ARTIFACT_BYTES, 19_000_000);
});
