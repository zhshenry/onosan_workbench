import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { act, createElement, useState } from 'react';
import { localDay } from '../shared/todo-contracts';

async function fixture(t: test.TestContext, initial = '', withYears = true) {
  const dom = new JSDOM('<div id="root"></div><button id="outside">外部</button>', { url: 'http://localhost', pretendToBeVisual: true });
  const names = ['window', 'document', 'HTMLElement', 'HTMLDialogElement', 'Node', 'navigator', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'] as const;
  const previous = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  names.forEach(name => Object.defineProperty(globalThis, name, { configurable: true, value: name === 'window' ? dom.window : dom.window[name] }));
  const previousAct = Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true });
  const { createRoot } = await import('react-dom/client');
  const { DatePicker } = await import('../modules/todo/ui/ui');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const changes: string[] = [];
  let submits = 0;
  function Harness() {
    const [value, setValue] = useState(initial);
    return createElement('form', { onSubmit: event => { event.preventDefault(); submits++; } },
      createElement(DatePicker, { value, onChange: next => { changes.push(next); setValue(next); }, ...(withYears ? { yearRange: { min: 1900, max: 2100 } } : {}) }),
      createElement('button', { type: 'submit' }, '保存'));
  }
  await act(async () => { root.render(createElement(Harness)); });
  t.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    names.forEach((name, index) => { if (previous[index]) Object.defineProperty(globalThis, name, previous[index]!); else Reflect.deleteProperty(globalThis, name); });
    if (previousAct) Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', previousAct); else Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });
  const doc = dom.window.document;
  const get = (selector: string) => { const el = doc.querySelector<HTMLElement>(selector); assert.ok(el, `Missing ${selector}`); return el; };
  const click = async (selector: string) => { await act(async () => {
    const target = get(selector);
    target.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }));
    target.click();
  }); };
  const key = async (selector: string, key: string, isComposing = false) => { await act(async () => {
    const target = get(selector); target.focus();
    target.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, isComposing, bubbles: true, cancelable: true }));
  }); };
  const pickYear = async (year: number) => {
    await click('.date-year-select button');
    const option = [...doc.querySelectorAll<HTMLElement>('.date-year-menu [role="option"]')].find(item => item.textContent === `${year}年`);
    assert.ok(option);
    await click(`[id="${option.id}"]`);
  };
  return { dom, doc, get, click, key, pickYear, changes, submits: () => submits };
}

test('生日下拉具有含端点的201个年份，选年保月且选日才提交', async t => {
  const f = await fixture(t, '2026-10-12');
  await f.click('.date-picker > button');
  await f.click('.date-year-select button');
  const options = f.doc.querySelectorAll('.date-year-menu [role="option"]');
  assert.equal(options.length, 201);
  assert.equal(options[0].textContent, '1900年'); assert.equal(options[200].textContent, '2100年');
  assert.equal(f.doc.querySelectorAll('.date-menu input').length, 0);
  assert.equal(f.get('.date-menu').contains(f.get('.date-year-menu')), true, 'Nested popup belongs to the calendar outside-click boundary');
  await f.key('.date-year-select button', 'Escape');
  await f.pickYear(1990);
  assert.equal(f.get('.date-month-label').textContent, '1990年10月');
  assert.deepEqual(f.changes, []);
  assert.equal(f.get('.date-picker > button').textContent, '2026年10月12日');
  assert.equal(f.doc.activeElement?.getAttribute('aria-label'), '1990-10-12');
  assert.equal(f.doc.querySelector('.date-year-menu'), null);
  await f.click('[aria-label="1990-10-16"]');
  assert.deepEqual(f.changes, ['1990-10-16']);
  assert.equal(f.doc.querySelector('.date-menu'), null);
  assert.equal(f.doc.activeElement, f.get('.date-picker > button'));
  assert.equal(f.submits(), 0);
});

test('年份方向键/Home/End/Enter只改变浏览，Escape分层取消且重新打开恢复已选生日', async t => {
  const f = await fixture(t, '2000-02-29');
  await f.click('.date-picker > button');
  await f.key('.date-year-select button', 'ArrowDown');
  await f.key('.date-year-select button', 'End');
  await f.key('.date-year-select button', 'Enter');
  assert.equal(f.get('.date-month-label').textContent, '2100年2月');
  assert.equal(f.doc.activeElement?.getAttribute('aria-label'), '2100-02-28');
  assert.deepEqual(f.changes, []);
  await f.key('.date-year-select button', 'Enter');
  await f.key('.date-year-select button', 'Home');
  await f.key('.date-year-select button', 'Enter');
  assert.equal(f.get('.date-month-label').textContent, '1900年2月');
  await f.click('.date-year-select button');
  await f.key('.date-year-select button', 'ArrowDown');
  await f.key('.date-year-select button', 'Escape');
  assert.equal(f.doc.querySelector('.date-year-menu'), null);
  assert.ok(f.doc.querySelector('.date-menu'));
  assert.equal(f.get('.date-month-label').textContent, '1900年2月');
  assert.equal(f.doc.activeElement, f.get('.date-year-select button'));
  await f.key('.date-year-select button', 'Escape');
  assert.equal(f.doc.querySelector('.date-menu'), null);
  await f.click('.date-picker > button');
  assert.equal(f.get('.date-month-label').textContent, '2000年2月');
  assert.equal(f.doc.activeElement?.getAttribute('aria-label'), '2000-02-29');
  assert.deepEqual(f.changes, []); assert.equal(f.submits(), 0);
});

test('闰年跨平年只校正日焦点，输入法Enter不选年、不选日', async t => {
  const f = await fixture(t, '2000-02-29');
  await f.click('.date-picker > button');
  await f.pickYear(2001);
  assert.equal(f.get('.date-month-label').textContent, '2001年2月');
  assert.equal(f.doc.activeElement?.getAttribute('aria-label'), '2001-02-28');
  assert.equal(f.get('.date-picker > button').textContent, '2000年2月29日');
  await f.key('.date-year-select button', 'Enter');
  await f.key('.date-year-select button', 'ArrowUp');
  await f.key('.date-year-select button', 'Enter', true);
  assert.ok(f.doc.querySelector('.date-year-menu')); assert.deepEqual(f.changes, []);
  await f.key('.date-year-select button', 'Enter');
  assert.equal(f.get('.date-month-label').textContent, '2000年2月');
  await f.key('.date-grid .is-active', 'Enter', true);
  assert.deepEqual(f.changes, []);
  await f.key('.date-grid .is-active', 'Enter');
  assert.deepEqual(f.changes, ['2000-02-28']); assert.equal(f.submits(), 0);
});

test('空值、外部点击、日历内点击、关闭重开及今天/清除保持提交边界', async t => {
  const f = await fixture(t);
  await f.click('.date-picker > button');
  const todayLabel = f.get('.date-month-label').textContent;
  await f.pickYear(1990);
  await f.click('#outside');
  assert.equal(f.doc.querySelector('.date-menu'), null); assert.deepEqual(f.changes, []);
  await f.click('.date-picker > button');
  assert.equal(f.get('.date-month-label').textContent, todayLabel);
  await f.click('.date-year-select button');
  await f.click('.date-weekdays');
  assert.equal(f.doc.querySelector('.date-year-menu'), null); assert.ok(f.doc.querySelector('.date-menu'));
  await f.click('.date-menu-actions button:last-child');
  assert.deepEqual(f.changes, [localDay()]);
  await f.click('.date-picker > button');
  await f.click('.date-menu-actions button:first-child');
  assert.deepEqual(f.changes, [localDay(), '']);
  assert.equal(f.get('.date-picker > button').textContent, '选择日期');
});

test('原有月份箭头、日期方向键与PageUp/PageDown在年份直选后保留', async t => {
  const f = await fixture(t, '2000-03-31');
  await f.click('.date-picker > button');
  await f.pickYear(2001);
  await f.click('[aria-label="上个月"]');
  assert.equal(f.get('.date-month-label').textContent, '2001年2月');
  assert.equal(f.doc.activeElement?.getAttribute('aria-label'), '2001-02-28');
  await f.key('.date-grid .is-active', 'PageDown');
  assert.equal(f.doc.activeElement?.getAttribute('aria-label'), '2001-03-28');
  await f.key('.date-grid .is-active', 'PageUp');
  await f.key('.date-grid .is-active', 'ArrowRight');
  assert.equal(f.doc.activeElement?.getAttribute('aria-label'), '2001-03-01');
  await f.key('.date-grid .is-active', 'ArrowLeft');
  assert.equal(f.doc.activeElement?.getAttribute('aria-label'), '2001-02-28');
  assert.deepEqual(f.changes, []);
});

test('其他日期调用默认不显示年份下拉并保留原有日期行为', async t => {
  const f = await fixture(t, '2026-10-12', false);
  await f.click('.date-picker > button');
  assert.equal(f.doc.querySelector('[role="combobox"]'), null);
  assert.equal(f.get('.date-head > span').textContent, '2026年10月');
  await f.click('[aria-label="上个月"]');
  assert.equal(f.get('.date-head > span').textContent, '2026年9月');
  await f.key('.date-grid .is-active', 'ArrowRight');
  await f.key('.date-grid .is-active', 'Enter');
  assert.deepEqual(f.changes, ['2026-09-13']);
  const bazi = readFileSync(new URL('../modules/bazi/ui/BaziView.tsx', import.meta.url), 'utf8');
  assert.match(bazi, /<DatePicker value=\{fDate\} onChange=\{setFDate\} yearRange=\{\{ min: BAZI_MIN_YEAR, max: BAZI_MAX_YEAR \}\}/);
});

// Unlike the key helper above, this deliberately sends the key to the actual focus.
test('年份列表打开时底层日期悬停不抢焦点、不阻断年份键盘选择', async t => {
  const f = await fixture(t, '2000-02-29');
  await f.click('.date-picker > button');
  await f.key('.date-year-select button', 'Enter');
  await act(async () => { f.get('[aria-label="2000-02-01"]').dispatchEvent(new f.dom.window.MouseEvent('mouseover', { bubbles: true })); });
  assert.equal(f.doc.activeElement, f.get('.date-year-select button'));
  await act(async () => { f.doc.activeElement!.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })); });
  const activeId = f.get('.date-year-select button').getAttribute('aria-activedescendant')!;
  assert.equal(f.doc.getElementById(activeId)?.textContent, '2001年');
  assert.deepEqual(f.changes, []);
});

test('收起年份列表时底层日期被动mouseenter不改变闰日校正后的键盘焦点', async t => {
  const f = await fixture(t, '2000-02-29');
  await f.click('.date-picker > button');
  await f.pickYear(2001);
  await act(async () => { f.get('[aria-label="2001-02-21"]').dispatchEvent(new f.dom.window.MouseEvent('mouseover', { bubbles: true })); });
  assert.equal(f.doc.activeElement?.getAttribute('aria-label'), '2001-02-28');
  assert.deepEqual(f.changes, []);
  // Real pointer movement still lets the user move the date cursor deliberately.
  await act(async () => { f.get('[aria-label="2001-02-21"]').dispatchEvent(new f.dom.window.MouseEvent('mousemove', { bubbles: true })); });
  assert.equal(f.doc.activeElement?.getAttribute('aria-label'), '2001-02-21');
  assert.deepEqual(f.changes, []);
});
