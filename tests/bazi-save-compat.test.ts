import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { BaziStore } from '../modules/bazi/store';

test('命例编辑仅提交输入字段，保存并重载保留 id、创建时间、笔记及出生地', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'ono-bazi-compat-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const store = new BaziStore(directory);
  const original = store.saveProfile({ id: 'synthetic-id', name: '测试命例', gender: 1, date: '2000-02-29', time: '09:00', tag: '测试', place: '测试地点', lat: 30, lon: 120 }).profiles[0];
  store.saveNote(original.id, '仅测试使用的笔记');
  assert.throws(() => store.saveProfile({ ...original, date: '2001-02-28' }), /createdAt/, 'Strict schema must continue rejecting metadata');
  assert.equal(store.all().profiles[0].date, original.date);

  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  const globals = ['window', 'document', 'HTMLElement', 'HTMLDialogElement', 'Node', 'navigator', 'localStorage', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'] as const;
  const previous = globals.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  globals.forEach(name => Object.defineProperty(globalThis, name, { configurable: true, value: name === 'window' ? dom.window : dom.window[name] }));
  const previousAct = Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  const inputs: Record<string, unknown>[] = [];
  Object.defineProperty(dom.window, 'workbench', { value: { bazi: {
    list: async () => store.all(),
    saveProfile: async (input: Record<string, unknown>) => { inputs.push(input); return store.saveProfile(input); },
  } } });
  const { createRoot } = await import('react-dom/client');
  const { BaziView } = await import('../modules/bazi/ui/BaziView');
  const root = createRoot(dom.window.document.getElementById('root')!);
  t.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    globals.forEach((name, i) => { if (previous[i]) Object.defineProperty(globalThis, name, previous[i]!); else Reflect.deleteProperty(globalThis, name); });
    if (previousAct) Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', previousAct); else Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });
  const messages: string[] = [];
  await act(async () => root.render(createElement(BaziView, { onPending: message => messages.push(message), onAskAI: () => {}, onCurrentProfile: () => {}, onDayLocated: () => {} })));
  const click = async (selector: string) => {
    const element = dom.window.document.querySelector<HTMLElement>(selector);
    assert.ok(element, selector);
    await act(async () => element.click());
  };
  await click('.bazi-psel-btn');
  await click('[aria-label="编辑 测试命例"]');
  await click('.date-picker > button');
  await click('.date-year-select button');
  const option = [...dom.window.document.querySelectorAll<HTMLElement>('.date-year-menu [role="option"]')].find(element => element.textContent === '2001年');
  assert.ok(option);
  await act(async () => option.click());
  await click('[aria-label="2001-02-28"]');
  const save = [...dom.window.document.querySelectorAll<HTMLButtonElement>('dialog[open] button')].find(button => button.textContent === '保存');
  assert.ok(save);
  await act(async () => save.click());

  assert.equal(inputs.length, 1);
  assert.deepEqual(Object.keys(inputs[0]).sort(), ['date', 'gender', 'id', 'lat', 'lon', 'name', 'place', 'tag', 'time'].sort());
  assert.equal(inputs[0].date, '2001-02-28');
  assert.deepEqual(messages, ['已更新「测试命例」']);
  const reloaded = new BaziStore(directory).all();
  assert.equal(reloaded.profiles.length, 1);
  assert.deepEqual(reloaded.profiles[0], { ...original, date: '2001-02-28' });
  assert.equal(reloaded.notes[original.id], '仅测试使用的笔记');
});

test('命例新建及清除可选字段仍沿用原存储格式和创建时间', t => {
  const directory = mkdtempSync(join(tmpdir(), 'ono-bazi-optional-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const store = new BaziStore(directory);
  const input = { name: '测试新建', gender: 0, date: '1990-10-16', time: '10:30', tag: '标签', place: '测试地点', lat: 30, lon: 120 };
  const original = store.saveProfile(input).profiles[0];
  assert.ok(original.id); assert.ok(Number.isFinite(Date.parse(original.createdAt)));
  store.saveNote(original.id, '保留笔记');
  store.saveProfile({ ...input, id: original.id, tag: undefined, place: undefined, lat: undefined, lon: undefined });
  const loaded = new BaziStore(directory).all();
  assert.equal(loaded.profiles.length, 1);
  assert.deepEqual(loaded.profiles[0], { id: original.id, createdAt: original.createdAt, name: input.name, gender: input.gender, date: input.date, time: input.time });
  assert.deepEqual(loaded.notes, { [original.id]: '保留笔记' });
});
