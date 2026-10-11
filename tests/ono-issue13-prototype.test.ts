import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const source = 'design/mockups/issue-13-year-picker-v1.html';
const html = readFileSync(source, 'utf8');
// DOM fixtures are not browser screenshots, Windows acceptance or visual review.
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
    const jump = (year: string) => { (get('year-input') as HTMLInputElement).value = year; click('jump'); };
    const openYear = () => { if (get('year-view').hidden) click('year-trigger'); };
    return { root, get, click, jump, openYear };
  };
  return { dom, document, errors, panel };
}

test('Issue 13 review board deterministically contains all three expected uncommitted states', t => {
  const f = fixture(t);
  assert.deepEqual(f.errors, []);
  assert.equal(f.document.querySelector('#issue13-review')?.getAttribute('data-ready'), 'true');
  assert.equal(f.document.querySelectorAll('.review-step').length, 3);
  for (const [name, state, year] of [
    ['calendar', 'calendar-2026-10', '2026年'],
    ['years', 'year-entry-1990', '2026年'],
    ['jumped', 'calendar-1990-10', '1990年'],
  ]) {
    const p = f.panel(name);
    assert.equal(p.root.getAttribute('data-state'), state);
    assert.equal(p.get('view-year').textContent, year);
    assert.equal(p.get('view-month').textContent, '10月');
    assert.equal(p.get('date-value').textContent, '选择日期');
  }
  assert.equal((f.panel('years').get('year-input') as HTMLInputElement).value, '1990');
  assert.equal(f.panel('years').get('decade-label').textContent, '2020–2029');
  assert.equal(f.panel('years').get('year-view').hidden, false);
  assert.equal(f.panel('jumped').get('year-view').hidden, true);
});

test('every enabled button has a real handler or form submit behavior, without bypassing audit guards', t => {
  const { document } = fixture(t);
  for (const button of document.querySelectorAll('button')) {
    if (!button.disabled && button.type !== 'submit') assert.equal(typeof button.onclick, 'function', button.outerHTML);
  }
  for (const form of document.querySelectorAll('form')) {
    assert.ok(form.hasAttribute('novalidate'));
    assert.equal(typeof form.onsubmit, 'function');
  }
});

test('preview IDs and all explicit label/control references are unique and resolvable', t => {
  const { document } = fixture(t);
  const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const attribute of ['for', 'aria-describedby', 'aria-controls', 'aria-labelledby']) {
    for (const element of document.querySelectorAll(`[${attribute}]`)) {
      for (const id of element.getAttribute(attribute)!.split(' ')) assert.ok(document.getElementById(id), `${attribute}=${id}`);
    }
  }
});

test('year jump keeps October, leaves birthday empty, then explicit day selection fills only that preview', t => {
  const f = fixture(t), p = f.panel();
  p.openYear(); p.jump('1990');
  assert.equal(p.get('view-year').textContent, '1990年');
  assert.equal(p.get('view-month').textContent, '10月');
  assert.equal(p.get('date-value').textContent, '选择日期');
  assert.equal(p.get('date-menu').hidden, false);
  p.click('day-1990-10-11');
  assert.equal(p.get('date-value').textContent, '1990年10月11日');
  assert.equal(p.get('date-menu').hidden, true);
  assert.equal(f.document.activeElement, p.get('date-trigger'));
  assert.equal(f.panel('years').get('date-value').textContent, '选择日期');
  p.click('date-trigger');
  assert.equal(p.get('view-year').textContent, '1990年');
});

for (const input of ['', '19', 'abcd', '1899', '2101']) {
  test(`invalid year ${JSON.stringify(input)} stays editable and does not commit a date`, t => {
    const p = fixture(t).panel(); p.openYear(); p.jump(input);
    assert.equal(p.get('year-view').hidden, false);
    assert.equal(p.get('year-input').getAttribute('aria-invalid'), 'true');
    assert.equal(p.get('year-help').textContent, '请输入 1900–2100 之间的四位年份');
    assert.equal(p.get('date-value').textContent, '选择日期');
  });
}

for (const year of [1900, 2100]) {
  test(`inclusive boundary ${year} is accepted and monthly arrows cannot leave the domain`, t => {
    const p = fixture(t).panel(); p.openYear(); p.jump(String(year));
    assert.equal(p.get('view-year').textContent, `${year}年`);
    assert.equal(p.get('date-value').textContent, '选择日期');
    const direction = year === 1900 ? 'prev-month' : 'next-month';
    for (let n = 0; n < 15; n++) p.click(direction);
    assert.equal(p.get('view-year').textContent, `${year}年`);
    assert.equal(p.get('view-month').textContent, year === 1900 ? '1月' : '12月');
    assert.equal((p.get(direction) as HTMLButtonElement).disabled, true);
  });
}

test('last decade remains useful at 2100 and includes the endpoint', t => {
  const p = fixture(t).panel(); p.openYear(); p.jump('2100'); p.openYear();
  assert.equal(p.get('decade-label').textContent, '2090–2100');
  assert.equal((p.get('next-decade') as HTMLButtonElement).disabled, true);
  const endpoint = [...p.get('year-grid').querySelectorAll('button')].find(button => button.textContent === '2100');
  assert.ok(endpoint && !endpoint.disabled); endpoint.click();
  assert.equal(p.get('view-year').textContent, '2100年');
});

test('leap-day editing clamps browsing focus only until the user explicitly picks another day', t => {
  const f = fixture(t), p = f.panel(); p.openYear(); p.jump('2000');
  for (let n = 0; n < 8; n++) p.click('prev-month');
  p.click('day-2000-02-29'); p.click('date-trigger'); p.openYear(); p.jump('2001');
  assert.equal(p.get('view-month').textContent, '2月');
  assert.equal(p.get('date-value').textContent, '2000年2月29日');
  assert.equal(f.document.activeElement, p.get('day-2001-02-28'));
});

test('Escape backs out one layer at a time without committing input', t => {
  const f = fixture(t), p = f.panel('years');
  const escape = () => p.get('year-input').dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  escape(); assert.equal(p.get('year-view').hidden, true); assert.equal(p.get('date-menu').hidden, false);
  escape(); assert.equal(p.get('date-menu').hidden, true); assert.equal(f.document.activeElement, p.get('date-trigger'));
  assert.equal(p.get('date-value').textContent, '选择日期');
});

test('Enter jumps without form submission and IME composition does not jump', t => {
  const f = fixture(t), p = f.panel('years');
  p.get('year-input').dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  assert.equal(p.get('view-year').textContent, '1990年');
  assert.equal(p.get('prototype-notice').hidden, true);
  p.openYear(); (p.get('year-input') as HTMLInputElement).value = '1992';
  p.get('year-input').dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }));
  assert.equal(p.get('year-view').hidden, false);
  assert.equal(p.get('view-year').textContent, '1990年');
});

test('calendar arrows and PageUp/PageDown preserve valid browsing and explicit commitment', t => {
  const f = fixture(t), p = f.panel();
  const key = (value: string) => p.get('date-grid').dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
  key('ArrowRight'); assert.equal(f.document.activeElement, p.get('day-2026-10-12'));
  key('ArrowUp'); assert.equal(f.document.activeElement, p.get('day-2026-10-05'));
  key('PageUp'); assert.equal(p.get('view-month').textContent, '9月');
  key('PageDown'); assert.equal(p.get('view-month').textContent, '10月');
  assert.equal(p.get('date-value').textContent, '选择日期');
});

test('outside click dismisses only the relevant panel without committing a year draft', t => {
  const f = fixture(t), p = f.panel('years');
  p.get('name').dispatchEvent(new f.dom.window.Event('pointerdown', { bubbles: true }));
  assert.equal(p.get('date-menu').hidden, true);
  assert.equal(p.get('date-value').textContent, '选择日期');
  assert.equal(f.panel().get('date-menu').hidden, false);
  p.click('date-trigger'); assert.equal(p.get('view-year').textContent, '2026年');
});

test('today, clear, close/reopen and safe save notice have honest local-only effects', t => {
  const f = fixture(t), p = f.panel();
  p.click('today'); assert.equal(p.get('date-value').textContent, '2026年10月11日');
  p.click('date-trigger'); p.click('clear'); assert.equal(p.get('date-value').textContent, '选择日期');
  p.click('cancel'); assert.equal((p.root.querySelector('.preview-modal') as HTMLElement).hidden, true);
  (p.root.querySelector('.reopen') as HTMLButtonElement).click(); assert.equal((p.root.querySelector('.preview-modal') as HTMLElement).hidden, false);
  p.root.querySelector('form')!.dispatchEvent(new f.dom.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(p.get('prototype-notice').textContent, '仅方案预览，不会保存命例或执行排盘。');
});

test('candidate stays inline-only, date-frozen, authored and free of image/network/persistence payloads', () => {
  assert.ok(html.includes('<head>'));
  assert.match(html, /TODAY='2026-10-11'/);
  assert.doesNotMatch(html, /<iframe|<img|<script[^>]+src=|<link[^>]+href=|\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB|data:image|base64/i);
  assert.doesNotMatch(html, /type=["'](?:date|datetime-local|month|week)["']/i);
  assert.match(html, /prefers-reduced-motion/);
  assert.match(html, /width:240px/);
  assert.match(html, /--todo-acc:var\(--acc-deep\)/);
});
