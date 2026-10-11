import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const html = readFileSync('design/mockups/issue-13-year-dropdown-v2.html', 'utf8');
// These DOM tests are not a real screenshot or product acceptance.
function fixture(t: any) {
  const errors: string[] = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error: Error) => errors.push(error.message));
  const dom = new JSDOM(html, { runScripts: 'dangerously', virtualConsole });
  t.after(() => dom.window.close());
  const document = dom.window.document;
  const panel = (name = 'calendar') => {
    const root = document.getElementById(`state-${name}`)!;
    const get = (id: string) => root.querySelector<HTMLElement>(`[data-ui="${id}"]`)!;
    const click = (id: string) => get(id).click();
    const key = (value: string, composing = false) => get('year-trigger').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: value, isComposing: composing, bubbles: true, cancelable: true }));
    const openYear = () => { if (get('year-list').hidden) click('year-trigger'); };
    const choose = (year: number) => { openYear(); click(`year-option-${year}`); };
    return { root, get, click, key, openYear, choose };
  };
  return { dom, document, errors, panel };
}

test('v2 board has calendar, direct dropdown and chosen-year states without input or jump controls', t => {
  const f = fixture(t);
  assert.deepEqual(f.errors, []);
  assert.equal(f.document.querySelector('#issue13-review')?.getAttribute('data-ready'), 'true');
  assert.equal(f.document.querySelectorAll('.review-step').length, 3);
  for (const [name, state, year] of [
    ['calendar', 'calendar-2026-10', '2026年'],
    ['years', 'year-dropdown-1990', '2026年'],
    ['jumped', 'calendar-1990-10', '1990年'],
  ]) {
    const p = f.panel(name);
    assert.equal(p.root.getAttribute('data-state'), state);
    assert.equal(p.get('view-year').textContent, year);
    assert.equal(p.get('view-month').textContent, '10月');
    assert.equal(p.get('date-value').textContent, '选择日期');
    assert.equal(p.get('calendar-view').hidden, false);
    assert.equal(p.get('year-list').hidden, name !== 'years');
    assert.equal(p.get('year-trigger').getAttribute('aria-expanded'), String(name === 'years'));
  }
  const p = f.panel('years');
  assert.equal(p.get('year-trigger').getAttribute('aria-activedescendant'), 'state-years-year-option-1990');
  assert.ok(p.get('year-option-1990').classList.contains('is-active'));
  assert.equal(p.get('year-option-1990').getAttribute('aria-selected'), 'false');
  assert.equal(p.get('year-option-2026').getAttribute('aria-selected'), 'true');
  assert.equal(f.document.querySelectorAll('[data-ui="year-input"], [data-ui="jump"], [data-ui="prev-decade"], [data-ui="next-decade"]').length, 0);
  assert.equal(p.get('date-menu').querySelectorAll('input').length, 0);
});

test('dropdown contains every year 1900–2100 once, with no invalid or arbitrary-text option', t => {
  const p = fixture(t).panel(); p.openYear();
  const options = [...p.get('year-list').querySelectorAll<HTMLElement>('[role="option"]')];
  assert.equal(options.length, 201);
  assert.deepEqual(options.map(x => x.textContent), Array.from({ length: 201 }, (_, i) => `${1900 + i}年`));
  assert.equal(options.filter(x => x.getAttribute('aria-selected') === 'true').length, 1);
  assert.equal(p.get('year-trigger').getAttribute('aria-activedescendant'), 'state-calendar-year-option-2026');
  assert.equal(p.get('year-list').scrollTop, (2026 - 1900) * 28 - 84);
});

test('every enabled button has real behavior, and IDs and ARIA/label references resolve uniquely', t => {
  const { document } = fixture(t);
  for (const button of document.querySelectorAll('button')) if (!button.disabled && button.type !== 'submit') assert.equal(typeof button.onclick, 'function', button.outerHTML);
  for (const form of document.querySelectorAll('form')) { assert.ok(form.hasAttribute('novalidate')); assert.equal(typeof form.onsubmit, 'function'); }
  const ids = [...document.querySelectorAll('[id]')].map(el => el.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const attribute of ['for', 'aria-describedby', 'aria-controls', 'aria-labelledby', 'aria-activedescendant']) {
    for (const el of document.querySelectorAll(`[${attribute}]`)) for (const id of el.getAttribute(attribute)!.split(' ')) assert.ok(document.getElementById(id), `${attribute}=${id}`);
  }
});

test('direct click selects a year, retains October, closes only dropdown and commits no birthday', t => {
  const f = fixture(t), p = f.panel(); p.choose(1990);
  assert.equal(p.get('view-year').textContent, '1990年');
  assert.equal(p.get('view-month').textContent, '10月');
  assert.equal(p.get('year-list').hidden, true);
  assert.equal(p.get('date-menu').hidden, false);
  assert.equal(p.get('date-value').textContent, '选择日期');
  assert.equal(f.document.activeElement, p.get('year-trigger'));
  assert.equal(p.get('prototype-notice').hidden, true);
  p.click('day-1990-10-11');
  assert.equal(p.get('date-value').textContent, '1990年10月11日');
  assert.equal(p.get('date-menu').hidden, true);
  assert.equal(f.document.activeElement, p.get('date-trigger'));
  assert.equal(f.panel('years').get('date-value').textContent, '选择日期');
  p.click('date-trigger'); assert.equal(p.get('view-year').textContent, '1990年');
});

for (const year of [1900, 2100]) test(`inclusive dropdown endpoint ${year} is reachable; calendar cannot browse beyond range`, t => {
  const p = fixture(t).panel(); p.choose(year);
  assert.equal(p.get('view-year').textContent, `${year}年`);
  assert.equal(p.get('date-value').textContent, '选择日期');
  const direction = year === 1900 ? 'prev-month' : 'next-month';
  for (let n = 0; n < 15; n++) p.click(direction);
  assert.equal(p.get('view-year').textContent, `${year}年`);
  assert.equal(p.get('view-month').textContent, year === 1900 ? '1月' : '12月');
  assert.equal((p.get(direction) as HTMLButtonElement).disabled, true);
});

test('keyboard arrows, pages, Home/End only highlight; Enter/Space choose without saving', t => {
  const p = fixture(t).panel(); p.key('ArrowDown');
  assert.equal(p.get('year-trigger').getAttribute('aria-activedescendant'), 'state-calendar-year-option-2026');
  p.key('ArrowUp'); p.key('PageUp');
  assert.equal(p.get('year-trigger').getAttribute('aria-activedescendant'), 'state-calendar-year-option-2018');
  assert.equal(p.get('view-year').textContent, '2026年');
  p.key('Home'); p.key('ArrowUp'); p.key('Enter');
  assert.equal(p.get('view-year').textContent, '1900年');
  p.key(' '); p.key('End'); p.key('ArrowDown'); p.key(' ');
  assert.equal(p.get('view-year').textContent, '2100年');
  assert.equal(p.get('date-value').textContent, '选择日期');
  assert.equal(p.get('prototype-notice').hidden, true);
});

test('IME composing Enter and arbitrary typed digits never select or submit', t => {
  const p = fixture(t).panel('years'); p.key('Enter', true); p.key('1'); p.key('9');
  assert.equal(p.get('year-list').hidden, false);
  assert.equal(p.get('view-year').textContent, '2026年');
  assert.equal(p.get('date-value').textContent, '选择日期');
  assert.equal(p.get('prototype-notice').hidden, true);
});

test('Escape dismisses one layer, and repeated trigger or Tab dismisses without choosing', t => {
  const f = fixture(t), p = f.panel('years');
  p.key('Escape'); assert.equal(p.get('year-list').hidden, true); assert.equal(p.get('date-menu').hidden, false);
  assert.equal(f.document.activeElement, p.get('year-trigger'));
  p.click('year-trigger'); p.click('year-trigger'); assert.equal(p.get('year-list').hidden, true);
  p.openYear(); p.key('Tab'); assert.equal(p.get('year-list').hidden, true);
  p.key('Escape'); assert.equal(p.get('date-menu').hidden, true);
  assert.equal(p.get('date-value').textContent, '选择日期');
  assert.equal(f.document.activeElement, p.get('date-trigger'));
});

test('hover previews an option but click is required; reopen returns to current browsing year', t => {
  const f = fixture(t), p = f.panel(); p.openYear();
  p.get('year-option-1990').dispatchEvent(new f.dom.window.MouseEvent('mouseenter'));
  assert.equal(p.get('year-trigger').getAttribute('aria-activedescendant'), 'state-calendar-year-option-1990');
  assert.equal(p.get('view-year').textContent, '2026年');
  p.key('Escape'); p.openYear();
  assert.equal(p.get('year-trigger').getAttribute('aria-activedescendant'), 'state-calendar-year-option-2026');
});

test('selected leap-day birthday stays unchanged while browsing a non-leap year', t => {
  const p = fixture(t).panel(); p.choose(2000);
  for (let n = 0; n < 8; n++) p.click('prev-month');
  p.click('day-2000-02-29'); p.click('date-trigger'); p.choose(2001);
  assert.equal(p.get('view-month').textContent, '2月');
  assert.equal(p.get('date-value').textContent, '2000年2月29日');
  assert.equal(p.get('day-2001-02-28').tabIndex, 0);
  p.key('Escape'); p.click('date-trigger');
  assert.equal(p.get('view-year').textContent, '2000年');
});

test('calendar navigation, today and clear retain their explicit commit semantics', t => {
  const f = fixture(t), p = f.panel();
  const key = (value: string) => p.get('date-grid').dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
  key('ArrowRight'); assert.equal(f.document.activeElement, p.get('day-2026-10-12'));
  key('PageUp'); assert.equal(p.get('view-month').textContent, '9月');
  key('PageDown'); assert.equal(p.get('view-month').textContent, '10月');
  assert.equal(p.get('date-value').textContent, '选择日期');
  p.click('today'); assert.equal(p.get('date-value').textContent, '2026年10月11日');
  p.click('date-trigger'); p.click('clear'); assert.equal(p.get('date-value').textContent, '选择日期');
});

test('outside click and resize close the dropdown honestly without persisting browsing state', t => {
  const f = fixture(t), p = f.panel('years');
  p.get('name').dispatchEvent(new f.dom.window.Event('pointerdown', { bubbles: true }));
  assert.equal(p.get('year-list').hidden, true); assert.equal(p.get('date-menu').hidden, true);
  p.click('date-trigger'); p.openYear(); f.dom.window.dispatchEvent(new f.dom.window.Event('resize'));
  assert.equal(p.get('year-list').hidden, true); assert.equal(p.get('date-menu').hidden, false);
  assert.equal(p.get('view-year').textContent, '2026年');
});

test('dropdown geometry is anchored to its year trigger and has bounded scrolling', t => {
  const p = fixture(t).panel();
  p.get('year-trigger').getBoundingClientRect = () => ({ left: 40, top: 30, right: 118, bottom: 54, width: 78, height: 24, x: 40, y: 30, toJSON() {} });
  p.get('date-menu').getBoundingClientRect = () => ({ left: 10, top: 20, right: 250, bottom: 260, width: 240, height: 240, x: 10, y: 20, toJSON() {} });
  p.openYear();
  assert.equal(p.get('year-list').style.width, '78px');
  assert.equal(p.get('year-list').style.left, '29px');
  assert.equal(p.get('year-list').style.top, '37px');
  assert.match(html, /max-height:220px;overflow-y:auto/);
  assert.match(html, /scrollbar-gutter:stable/);
});

test('close/reopen and save remain explicit local-only prototype behavior', t => {
  const f = fixture(t), p = f.panel(); p.click('cancel');
  assert.equal((p.root.querySelector('.preview-modal') as HTMLElement).hidden, true);
  (p.root.querySelector('.reopen') as HTMLButtonElement).click();
  assert.equal((p.root.querySelector('.preview-modal') as HTMLElement).hidden, false);
  p.root.querySelector('form')!.dispatchEvent(new f.dom.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(p.get('prototype-notice').textContent, '仅方案预览，不会保存命例或执行排盘。');
});

test('v2 source is deterministic and inline-only, and does not delete the historical v1 source', () => {
  assert.match(html, /TODAY='2026-10-11'/);
  assert.doesNotMatch(html, /<iframe|<img|<script[^>]+src=|<link[^>]+href=|\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB|data:image|base64/i);
  assert.doesNotMatch(html, /year-input|data-ui="jump"|prev-decade|next-decade/);
  assert.match(html, /prefers-reduced-motion/);
  assert.match(html, /width:240px/);
  assert.ok(readFileSync('design/mockups/issue-13-year-picker-v1.html', 'utf8').includes('year-input'));
});
