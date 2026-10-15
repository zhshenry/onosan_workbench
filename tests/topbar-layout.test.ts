import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { topbarCapsulePlacement } from '../src/topbar-layout';

const place = (patch: Partial<Parameters<typeof topbarCapsulePlacement>[0]> = {}) => topbarCapsulePlacement({
  barWidth: 1190, padLeft: 14, rightInset: 292, naturalWidth: 365, readableWidth: 365, ...patch,
});

test('empty and badged capsule groups stay on the topbar center', () => {
  const empty = place();
  const badged = place({ naturalWidth: 420, readableWidth: 420 });
  assert.equal(empty.nudge, 0);
  assert.equal(badged.nudge, 0);
  assert.equal(empty.width, 365);
  assert.equal(badged.width, 420);
});

test('one schedule chip keeps the center while its title can shrink', () => {
  const placed = place({ naturalWidth: 715, readableWidth: 480 });
  const centeredSpan = 1190 - 2 * (292 + 12);
  assert.equal(placed.width, centeredSpan);
  assert.equal(placed.nudge, 0);
  assert.ok(placed.width >= 480);
});

test('one schedule chip shifts left only enough to keep its date when the centered band is tight', () => {
  const placed = place({ barWidth: 1190, rightInset: 390, naturalWidth: 715, readableWidth: 480 });
  assert.equal(placed.width, 480);
  assert.ok(placed.nudge > 0);
  const side = 390 + 12;
  const centeredMax = 1190 - 2 * side;
  assert.ok(Math.abs(placed.nudge - (placed.width - centeredMax) / 2) < 0.01);
  const rightEdge = 1190 / 2 + placed.width / 2 - placed.nudge;
  assert.ok(Math.abs(rightEdge - (1190 - side)) < 0.01);
});

test('several schedule chips stay inside the centered band and scroll', () => {
  const placed = place({ naturalWidth: 980, readableWidth: 0 });
  assert.equal(placed.nudge, 0);
  assert.equal(placed.width, 1190 - 2 * (292 + 12));
});

test('a crowded narrow bar keeps the compact pair visible beside the right controls', () => {
  const placed = place({ barWidth: 729, padLeft: 14, rightInset: 372, naturalWidth: 246, readableWidth: 246 });
  assert.equal(placed.width, 246);
  assert.ok(placed.nudge > 0);
  const side = 372 + 12;
  const rightEdge = 729 / 2 + placed.width / 2 - placed.nudge;
  assert.ok(rightEdge <= 729 - side + 0.01);
  assert.ok(729 / 2 - placed.width / 2 - placed.nudge >= 14 - 0.01);
});

test('placement refuses a zero-width collapse when the centered band is gone', () => {
  const placed = place({ barWidth: 729, rightInset: 400, naturalWidth: 246, readableWidth: 246 });
  assert.ok(placed.width >= 200);
});

test('a hidden schedule track does not keep the inline cap that zeroes it when it returns', () => {
  const source = readFileSync(new URL('../src/topbar-layout.ts', import.meta.url), 'utf8');
  assert.match(source, /const trackShown = !track \|\| getComputedStyle\(track\)\.display !== 'none'/);
  assert.match(source, /setProperty\('--tb-middle-cap', `\$\{placement\.width\}px`\)/);
  assert.match(source, /maxWidth = trackShown \? `\$\{placement\.width\}px` : ''/);
});

test('app reapplies capsule placement when the right cluster changes', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /ResizeObserver\(place\)/);
  assert.match(app, /observer\.observe\(right\)/);
  assert.match(app, /aiJob \? `\$\{aiJob\.chatId\}:\$\{aiJob\.status\}:\$\{aiJob\.title\}`/);
});
