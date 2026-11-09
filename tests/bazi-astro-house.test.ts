import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import type { Root } from 'react-dom/client';
import { BaziStore } from '../modules/bazi/store';
import { buildAstro, type AstroChart } from '../modules/bazi/astro';
import { baziStoreDataSchema, type BaziProfile, type BaziStoreData } from '../shared/bazi-contracts';
import { CHINA_REGIONS } from '../shared/china-region-geo';

const SIGNS = ['白羊', '金牛', '双子', '巨蟹', '狮子', '处女', '天秤', '天蝎', '射手', '摩羯', '水瓶', '双鱼'];
const HOUSE_HINT = '编辑命例选择出生地后可显示宫位。';
const SHANGHAI = { place: '上海', lat: 31.2304, lon: 121.4737 };

function degreeLabel(lon: number): string {
  const deg = Math.floor(lon % 30);
  const min = Math.round((lon % 1) * 60);
  return `${deg}°${String(min).padStart(2, '0')}′`;
}

function ascendantLabel(lon: number): string {
  const norm = ((lon % 360) + 360) % 360;
  return `上升点 ${SIGNS[Math.floor(norm / 30)]} ${degreeLabel(norm)}`;
}

function chartData(extra: Partial<BaziProfile> = {}): BaziStoreData {
  return baziStoreDataSchema.parse({
    profiles: [{
      id: 'lin-chuan',
      name: '林川',
      gender: 1,
      date: '1990-08-16',
      time: '14:30',
      createdAt: '2020-01-01T00:00:00.000Z',
      ...extra,
    }],
    notes: {},
  });
}

type Harness = {
  dom: JSDOM;
  doc: Document;
  messages: string[];
  show(data: BaziStoreData): Promise<void>;
  openAstro(): Promise<HTMLElement>;
  useStore(store: BaziStore): void;
  cleanup(): Promise<void>;
};

async function createHarness(): Promise<Harness> {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  const globals = ['window', 'document', 'HTMLElement', 'HTMLDialogElement', 'Node', 'navigator', 'localStorage', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'] as const;
  const previous = globals.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  globals.forEach(name => Object.defineProperty(globalThis, name, { configurable: true, value: name === 'window' ? dom.window : dom.window[name] }));
  const previousAct = Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true });
  dom.window.HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute('open', ''); };
  dom.window.HTMLDialogElement.prototype.close = function close() { this.removeAttribute('open'); };

  let current: BaziStoreData = { profiles: [], notes: {} };
  let store: BaziStore | null = null;
  const messages: string[] = [];
  Object.defineProperty(dom.window, 'workbench', { value: { ai: { config: async () => ({ aiEnabled: false, hasConnection: false }) }, bazi: {
    list: async () => current,
    saveProfile: async (input: unknown) => {
      if (!store) throw new Error('测试未接入命例库');
      current = store.saveProfile(input);
      return current;
    },
    saveNote: async (_id: string, text: string) => {
      if (!store) throw new Error('测试未接入命例库');
      current = store.saveNote(_id, text);
      return current;
    },
    removeProfile: async (id: string) => {
      if (!store) throw new Error('测试未接入命例库');
      current = store.removeProfile(id);
      return current;
    },
  } } });

  const { createRoot } = await import('react-dom/client');
  const { BaziView } = await import('../modules/bazi/ui/BaziView');
  const doc = dom.window.document;
  let root: Root | null = null;

  return {
    dom,
    doc,
    messages,
    async show(data) {
      current = data;
      messages.length = 0;
      dom.window.localStorage.clear();
      if (root) await act(async () => root!.unmount());
      root = createRoot(doc.getElementById('root')!);
      await act(async () => {
        root!.render(createElement(BaziView, {
          onPending: message => messages.push(message),
          onAskAI: () => {},
          onCurrentProfile: () => {},
          onDayLocated: () => {},
        }));
      });
    },
    async openAstro() {
      const tab = [...doc.querySelectorAll<HTMLElement>('[role="tab"]')].find(element => element.textContent === '占星');
      assert.ok(tab, '占星页签');
      await act(async () => tab.click());
      assert.equal(tab.getAttribute('aria-selected'), 'true');
      const panel = [...doc.querySelectorAll<HTMLElement>('[role="tabpanel"]')].find(element => !element.hasAttribute('hidden'));
      assert.ok(panel, '当前命理页');
      assert.equal(doc.querySelector('.bazi-chart-error'), null);
      assert.equal(doc.body.textContent?.includes('待后续版本'), false);
      return panel;
    },
    useStore(next) { store = next; },
    async cleanup() {
      if (root) await act(async () => root!.unmount());
      dom.window.close();
      globals.forEach((name, index) => {
        if (previous[index]) Object.defineProperty(globalThis, name, previous[index]!);
        else Reflect.deleteProperty(globalThis, name);
      });
      if (previousAct) Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', previousAct);
      else Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
    },
  };
}

function assertTable(panel: HTMLElement, chart: AstroChart, withHouses: boolean): void {
  assert.equal(panel.querySelector('.bazi-as-detail-meta'), null);
  const table = panel.querySelector('table.bazi-astab');
  assert.ok(table, '行星落座表');
  assert.deepEqual(
    [...table.querySelectorAll('th')].map(cell => cell.getAttribute('aria-label') || cell.textContent),
    ['符号', '星体／点位', '星座', '度数', '宫位'],
  );
  const rows = [...table.querySelectorAll('tbody tr')];
  assert.equal(rows.length, chart.bodies.length);
  rows.forEach((row, index) => {
    const body = chart.bodies[index];
    const cells = [...row.querySelectorAll('td')].map(cell => cell.textContent ?? '');
    assert.equal(cells[0], body.glyph);
    assert.equal(cells[1], body.name);
    assert.equal(cells[2], SIGNS[Math.floor(body.lon / 30)]);
    assert.equal(cells[3], `${degreeLabel(body.lon)}${body.retro ? '℞' : ''}`);
    assert.equal(cells[4], withHouses ? `${body.house}宫` : '—');
  });
  const hints = [...panel.querySelectorAll('.bazi-notehint')].map(element => element.textContent);
  const metas = [...panel.querySelectorAll('.bazi-pan-meta')].map(element => (element.textContent ?? '').replace(/\s+/g, ' ').trim());
  if (withHouses) {
    assert.ok(chart.asc !== undefined);
    assert.ok(metas.some(text => text.startsWith(ascendantLabel(chart.asc!))));
    assert.equal(hints.includes(HOUSE_HINT), false);
  } else {
    assert.equal(chart.asc, undefined);
    assert.equal(chart.bodies.every(body => body.house === undefined), true);
    assert.equal(metas.some(text => text.startsWith('上升点')), false);
    assert.ok(hints.includes(HOUSE_HINT));
  }
  const svg = panel.querySelector('.bazi-as-wrap svg');
  assert.equal(svg?.getAttribute('aria-label'), '出生星盘(行星落座)');
  const drawn = svg?.textContent ?? '';
  for (const body of chart.bodies) assert.ok(drawn.includes(body.glyph), body.name);
  assert.equal(svg?.querySelectorAll('.bazi-as-house').length, withHouses ? 12 : 0);
  assert.equal(svg?.querySelectorAll('.bazi-as-axis').length, withHouses ? 2 : 0);
}

describe('占星行星落座宫位列', { concurrency: false }, () => {
  let harness: Harness;

  before(async () => {
    harness = await createHarness();
  });

  after(async () => {
    await harness.cleanup();
  });

  test('有出生地经纬度时宫位列与默认 Placidus 一致,并在盘面元信息显示上升点', async () => {
    const data = chartData(SHANGHAI);
    const chart = buildAstro(data.profiles[0]);
    await harness.show(data);
    const panel = await harness.openAstro();
    assertTable(panel, chart, true);
    assert.equal(harness.messages.length, 0);
  });

  test('无出生地经纬度时宫位为破折号并提示填写,盘面与行星落座不报错', async () => {
    const data = chartData();
    const chart = buildAstro(data.profiles[0]);
    await harness.show(data);
    const panel = await harness.openAstro();
    assertTable(panel, chart, false);
    assert.equal(harness.messages.length, 0);
  });

  test('右侧切换完整相位列表并支持方向键返回落座,盘面与数据不变', async () => {
    const data = chartData(SHANGHAI);
    const original = structuredClone(data);
    const chart = buildAstro(data.profiles[0]);
    await harness.show(data);
    const panel = await harness.openAstro();
    const wheel = panel.querySelector('.bazi-as-wrap svg')!.outerHTML;
    const buttons = [...panel.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    assert.deepEqual(buttons.map(button => button.textContent), ['星体', '宫位', '相位', '解读']);
    await act(async () => buttons[2].click());
    const rows = [...panel.querySelectorAll('.bazi-as-aspect-table tbody tr')];
    assert.deepEqual(rows.map(row => [...row.querySelectorAll('td')].map(cell => cell.textContent)), chart.aspects.map(aspect => [
      `${aspect.a} — ${aspect.b}`, aspect.type, `${aspect.orb}°`,
    ]));
    assert.equal(buttons[2].getAttribute('aria-checked'), 'true');
    assert.equal(panel.querySelector('.bazi-as-wrap svg')!.outerHTML, wheel);
    await act(async () => buttons[2].dispatchEvent(new harness.dom.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })));
    await act(async () => buttons[1].dispatchEvent(new harness.dom.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })));
    assert.equal(buttons[0].getAttribute('aria-checked'), 'true');
    assert.equal(harness.doc.activeElement, buttons[0]);
    assertTable(panel, chart, true);
    assert.deepEqual(data, original);
    assert.deepEqual(harness.messages, []);
  });

  test('补填经纬度后宫位列与上升点随 Placidus 计算出现', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'ono-bazi-house-'));
    try {
      const store = new BaziStore(directory);
      store.saveProfile({ id: 'lin-chuan', name: '林川', gender: 1, date: '1990-08-16', time: '14:30' });
      harness.useStore(store);
      await harness.show(store.all());
      let panel = await harness.openAstro();
      assertTable(panel, buildAstro(store.all().profiles[0]), false);

      const click = async (selector: string) => {
        const element = harness.doc.querySelector<HTMLElement>(selector);
        assert.ok(element, selector);
        await act(async () => element.click());
      };
      await click('.bazi-psel-btn');
      await click('[aria-label="编辑 林川"]');
      await click('[aria-label="出生省份"]');
      const shanghai = [...harness.doc.querySelectorAll('.select-option')].find(option => option.textContent === '上海市');
      assert.ok(shanghai, '省级选项上海市');
      await act(async () => shanghai.click());
      await click('[aria-label="出生区县"]');
      const huangpu = [...harness.doc.querySelectorAll('.select-option')].find(option => option.textContent === '黄浦区');
      assert.ok(huangpu, '上海区县选项黄浦区');
      await act(async () => huangpu.click());
      const save = [...harness.doc.querySelectorAll<HTMLButtonElement>('dialog[open] button')].find(button => button.textContent === '保存');
      assert.ok(save);
      await act(async () => save.click());

      const saved = store.all().profiles[0];
      const huangpuNode = (CHINA_REGIONS.find((p) => p.name === '上海市')?.children ?? []).find((d) => d.name === '黄浦区');
      assert.ok(huangpuNode, '数据中的黄浦区');
      assert.equal(saved.lat, huangpuNode!.lat);
      assert.equal(saved.lon, huangpuNode!.lon);
      assert.deepEqual(harness.messages, ['已更新「林川」']);
      panel = await harness.openAstro();
      assertTable(panel, buildAstro(saved), true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test('宫制切换更新圆盘和宫位表,随命例持久保存并保留历史笔记', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'ono-house-choice-'));
    try {
      const store = new BaziStore(directory);
      store.saveProfile({ id: 'house-choice', name: '宫制示例', gender: 1, date: '2020-04-09', time: '11:34', ...SHANGHAI });
      store.saveNote('house-choice', '历史笔记保持原样');
      harness.useStore(store);
      await harness.show(store.all());
      const panel = await harness.openAstro();
      const moonHouse = () => [...panel.querySelectorAll('.bazi-astab tbody tr')].find(row => row.children[1].textContent === '月亮')!.lastElementChild!.textContent;
      assert.equal(moonHouse(), '4宫');
      await act(async () => panel.querySelector<HTMLButtonElement>('[aria-label="查看月亮"]')!.click());
      assert.match(panel.querySelector('[aria-label="月亮详情"]')!.textContent!, /第4宫/);
      const before = panel.querySelector('.bazi-as-wrap svg')!.outerHTML;
      const select = panel.querySelector<HTMLButtonElement>('[aria-label="占星宫制"]')!;
      await act(async () => select.click());
      const whole = [...harness.doc.querySelectorAll<HTMLElement>('.select-option')].find(option => option.textContent === '整宫制')!;
      await act(async () => whole.click());
      assert.equal(moonHouse(), '5宫');
      assert.match(panel.querySelector('[aria-label="月亮详情"]')!.textContent!, /第5宫/);
      assert.equal(panel.querySelector('[data-body="Moon"]')!.getAttribute('aria-pressed'), 'true');
      assert.notEqual(panel.querySelector('.bazi-as-wrap svg')!.outerHTML, before);
      assert.equal(select.textContent, '整宫制');
      assert.equal(harness.doc.activeElement, select);
      let reloaded = new BaziStore(directory).all();
      assert.equal(reloaded.profiles[0].astroHouseSystem, 'whole-sign');
      assert.equal(reloaded.notes['house-choice'], '历史笔记保持原样');
      await harness.show(reloaded);
      assertTable(await harness.openAstro(), buildAstro(reloaded.profiles[0]), true);
      // 编辑其他出生字段不会悄悄重置已选择的宫制。
      store.saveProfile({ id: 'house-choice', name: '新名称', gender: 1, date: '2020-04-09', time: '11:34', ...SHANGHAI });
      reloaded = new BaziStore(directory).all();
      assert.equal(reloaded.profiles[0].astroHouseSystem, 'whole-sign');
      assert.deepEqual(harness.messages, []);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  test('星体、宫位和表格共享选择;键盘可取消,解读页独立提供提问入口', async () => {
    const data = chartData({ ...SHANGHAI, date: '2020-04-09', time: '11:34' });
    await harness.show(data);
    const panel = await harness.openAstro();
    const moon = panel.querySelector('[data-body="Moon"]')!;
    const moonButton = () => panel.querySelector<HTMLButtonElement>('[aria-label="查看月亮"]')!;
    await act(async () => moonButton().click());
    assert.equal(moon.getAttribute('aria-pressed'), 'true');
    assert.equal(moonButton().closest('tr')!.getAttribute('data-selected'), 'true');
    const detail = panel.querySelector('[aria-label="月亮详情"]')!;
    assert.equal(detail.querySelector('.bazi-as-selection-facts')!.textContent, '天蝎 · 第4宫 · 顺行');
    assert.match(detail.textContent!, /家庭、根基与私人生活/);
    assert.equal(detail.querySelectorAll('.bazi-as-meanings dt').length, 4);
    assert.doesNotMatch(detail.textContent!, /相关相位/);
    assert.equal(panel.querySelectorAll('.bazi-as-aspect-target:not(.is-dimmed)').length, 5);
    await act(async () => moon.dispatchEvent(new harness.dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    assert.equal(moon.getAttribute('aria-pressed'), 'false');
    assert.equal(panel.querySelector('.bazi-as-selection'), null);
    await act(async () => panel.querySelector('[data-house="4"]')!.dispatchEvent(new harness.dom.window.KeyboardEvent('keydown', { key: ' ', bubbles: true })));
    assert.equal(panel.querySelector('[role="radio"][aria-checked="true"]')!.textContent, '宫位');
    assert.equal(panel.querySelectorAll('[aria-label="十二宫位"] tbody tr').length, 12);
    assert.match(panel.querySelector('[aria-label="第4宫详情"]')!.textContent!, /金星 · 第11宫/);
    assert.match(panel.querySelector('[aria-label="第4宫详情"]')!.textContent!, /月亮/);
    const houseMoon = [...panel.querySelectorAll<HTMLButtonElement>('[aria-label="第4宫详情"] button')].find(button => button.textContent === '月亮')!;
    await act(async () => houseMoon.click());
    const reading = [...panel.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find(button => button.textContent === '解读')!;
    await act(async () => reading.click());
    assert.equal(panel.querySelector('[aria-label="月亮详情"]'), null);
    assert.match(panel.querySelector('.bazi-as-reading')!.textContent!, /想了解星盘的哪一面/);
    assert.equal(panel.querySelector('.bazi-as-object-options'), null);
    assert.deepEqual(harness.messages, []);
  });

  test('星体详情提供四项含义,组合随星体和宫位变化,扩展对象也不显示相关相位', async () => {
    const data = chartData({ ...SHANGHAI, date: '2020-04-09', time: '11:34' });
    const original = structuredClone(data), chart = buildAstro(data.profiles[0]);
    await harness.show(data);
    const panel = await harness.openAstro();
    for (const body of chart.bodies) {
      await act(async () => panel.querySelector<HTMLButtonElement>(`[aria-label="查看${body.name}"]`)!.click());
      const detail = panel.querySelector(`[aria-label="${body.name}详情"]`)!;
      const terms = [...detail.querySelectorAll('dt')].map(term => term.textContent);
      assert.equal(terms.length, 4);
      assert.match(terms[0]!, /星体含义|点位含义/);
      assert.match(terms[1]!, new RegExp(`星座含义.*${SIGNS[Math.floor(body.lon / 30)]}座`));
      assert.match(terms[2]!, new RegExp(`宫位含义.*第${body.house}宫`));
      assert.equal(terms[3], '结合解读');
      assert.doesNotMatch(detail.textContent!, /相关相位|查看全部|undefined/);
      if (body.key === 'Sun') assert.match(detail.querySelector('.bazi-as-combined')!.textContent!, /建立自我认同、表达个人意志/);
      if (body.key === 'Moon') assert.match(detail.querySelector('.bazi-as-combined')!.textContent!, /照顾情绪需求、寻找内在安全感/);
    }
    assert.deepEqual(data, original);
  });

  test('相位按星体、类型和容许度组合筛选,连线同步,空结果可恢复且不改命例', async () => {
    const data = chartData({ ...SHANGHAI, date: '2020-04-09', time: '11:34' });
    const original = structuredClone(data), chart = buildAstro(data.profiles[0]);
    await harness.show(data);
    const panel = await harness.openAstro();
    await act(async () => panel.querySelector<HTMLButtonElement>('[aria-label="查看月亮"]')!.click());
    const aspects = [...panel.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find(button => button.textContent === '相位')!;
    await act(async () => aspects.click());
    const choose = async (name: string, text: string) => {
      await act(async () => panel.querySelector<HTMLButtonElement>(`[aria-label="${name}"]`)!.click());
      const option = [...harness.doc.querySelectorAll<HTMLElement>('.select-option')].find(item => item.textContent === text)!;
      assert.ok(option, text);
      await act(async () => option.click());
    };
    await choose('相位星体', '月亮');
    assert.equal(panel.querySelectorAll('.bazi-as-aspect-table tbody tr').length, 5);
    assert.equal(panel.querySelectorAll('.bazi-as-aspect-target').length, 5);
    await choose('相位类型', '冲相');
    await choose('最大容许度', '≤ 1°');
    const rows = panel.querySelectorAll('.bazi-as-aspect-table tbody tr');
    assert.equal(rows.length, 1);
    assert.match(rows[0].textContent!, /月亮 — 天王冲1°/);
    assert.equal(panel.querySelectorAll('.bazi-as-aspect-target').length, 1);
    await act(async () => rows[0].querySelector('button')!.click());
    assert.equal(panel.querySelectorAll('.bazi-as-aspect-target[aria-pressed="true"]').length, 1);
    assert.match(panel.querySelector('[aria-label="相位详情"]')!.textContent!, /标准夹角 180°/);
    await choose('相位类型', '三分相');
    assert.equal(panel.querySelector('[aria-label="相位详情"]'), null);
    assert.equal(panel.querySelectorAll('.bazi-as-aspect-target').length, 0);
    assert.match(panel.textContent!, /没有符合筛选条件/);
    const clear = [...panel.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === '清除筛选')!;
    await act(async () => clear.click());
    assert.equal(panel.querySelectorAll('.bazi-as-aspect-target').length, chart.aspects.length);
    assert.equal(panel.querySelectorAll('.bazi-as-aspect-table tbody tr').length, chart.aspects.length);
    assert.deepEqual(data, original);
  });

  test('缺地点或极区宫制不可用时不生成宫表,中文说明仍可查看', async () => {
    for (const input of [{}, { lat: 70, lon: 20 }]) {
      await harness.show(chartData(input));
      const panel = await harness.openAstro();
      const houses = [...panel.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find(button => button.textContent === '宫位')!;
      await act(async () => houses.click());
      assert.equal(panel.querySelector('[aria-label="十二宫位"]'), null);
      assert.equal(panel.querySelectorAll('[data-house]').length, 0);
      assert.ok(panel.querySelector('.bazi-notehint')!.textContent!.length > 0);
      await act(async () => panel.querySelector('[data-body="Moon"]')!.dispatchEvent(new harness.dom.window.MouseEvent('click', { bubbles: true })));
      assert.match(panel.querySelector('[aria-label="月亮详情"]')!.textContent!, /宫位待补/);
      const combined = panel.querySelector('.bazi-as-combined')!;
      assert.match(combined.textContent!, /宫位尚未确定/);
      assert.doesNotMatch(combined.textContent!, /第\d+宫/);
    }
  });

  test('切换命例清除之前的星体选择和相位筛选', async () => {
    const data = chartData({ ...SHANGHAI, date: '2020-04-09', time: '11:34' });
    data.profiles.push({ ...data.profiles[0], id: 'another', name: '另一命例', date: '1990-08-16' });
    await harness.show(data);
    const panel = await harness.openAstro();
    await act(async () => panel.querySelector<HTMLButtonElement>('[aria-label="查看月亮"]')!.click());
    const aspects = [...panel.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find(button => button.textContent === '相位')!;
    await act(async () => aspects.click());
    await act(async () => panel.querySelector<HTMLButtonElement>('[aria-label="相位星体"]')!.click());
    const moonOption = [...harness.doc.querySelectorAll<HTMLElement>('.select-option')].find(option => option.textContent === '月亮')!;
    await act(async () => moonOption.click());
    await act(async () => harness.doc.querySelector<HTMLButtonElement>('.bazi-psel-btn')!.click());
    const another = [...harness.doc.querySelectorAll<HTMLButtonElement>('.bazi-psel-menu [role="option"]')].find(button => button.textContent?.includes('另一命例'))!;
    await act(async () => another.click());
    assert.equal(panel.querySelector('.bazi-as-selection'), null);
    assert.equal(panel.querySelector('[role="radio"][aria-checked="true"]')!.textContent, '星体');
    assert.equal(panel.querySelectorAll('.bazi-as-aspect-target').length, buildAstro(data.profiles[1]).aspects.length);
  });

  test('扩展对象可联动选中,隐藏后清除详情与筛选,不影响十星分布或命例', async () => {
    const data = chartData({ ...SHANGHAI, date: '2020-04-09', time: '11:34' });
    const original = structuredClone(data);
    await harness.show(data);
    const panel = await harness.openAstro();
    assert.equal(panel.querySelectorAll('.bazi-astab tbody tr').length, 19);
    assert.equal(panel.querySelectorAll('[data-body]').length, 19);
    await act(async () => panel.querySelector<HTMLButtonElement>('[aria-label="查看婚神星"]')!.click());
    assert.equal(panel.querySelector('[data-body="Juno"]')!.getAttribute('aria-pressed'), 'true');
    assert.match(panel.querySelector('.bazi-as-selection-capsule')!.textContent!, /婚神星.*逆行.*JPL/s);
    assert.match(panel.querySelector('.bazi-as-selection-capsule')!.textContent!, /结合解读/);
    assert.doesNotMatch(panel.querySelector('.bazi-as-selection-capsule')!.textContent!, /相关相位/);
    const toggles = panel.querySelectorAll<HTMLInputElement>('.bazi-as-object-options input');
    await act(async () => toggles[1].click());
    assert.equal(panel.querySelector('[data-body="Juno"]'), null);
    assert.equal(panel.querySelector('.bazi-as-selection-capsule'), null);
    assert.equal(panel.querySelectorAll('.bazi-astab tbody tr').length, 14);
    await act(async () => panel.querySelector<HTMLButtonElement>('[aria-label="查看福点"]')!.click());
    assert.match(panel.querySelector('.bazi-as-selection-capsule')!.textContent!, /昼盘公式/);
    assert.doesNotMatch(panel.querySelector('.bazi-as-selection-facts')!.textContent!, /顺行|逆行/);
    await act(async () => toggles[0].click());
    assert.equal(panel.querySelectorAll('[data-body]').length, 10);
    assert.equal(panel.querySelectorAll('.bazi-as-aspect-target').length, 17);
    assert.equal(panel.querySelector('.bazi-as-selection-capsule'), null);
    await act(async () => { toggles[0].click(); toggles[1].click(); });
    assert.equal(panel.querySelectorAll('[data-body]').length, 19);
    assert.deepEqual(data, original);
  });

  test('极区从整宫制切换到不可用的普拉西德制时清除宫位选择,保留可读星体', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'ono-polar-selection-'));
    try {
      const store = new BaziStore(directory);
      store.saveProfile({ id: 'polar', name: '极区示例', gender: 1, date: '2020-04-09', time: '11:34', lat: 70, lon: 20, astroHouseSystem: 'whole-sign' });
      harness.useStore(store);
      await harness.show(store.all());
      const panel = await harness.openAstro();
      await act(async () => panel.querySelector('[data-house="4"]')!.dispatchEvent(new harness.dom.window.MouseEvent('click', { bubbles: true })));
      assert.ok(panel.querySelector('[aria-label="第4宫详情"]'));
      await act(async () => panel.querySelector<HTMLButtonElement>('[aria-label="占星宫制"]')!.click());
      const option = [...harness.doc.querySelectorAll<HTMLElement>('.select-option')].find(item => item.textContent === '普拉西德制')!;
      await act(async () => option.click());
      assert.equal(panel.querySelector('.bazi-as-selection'), null);
      assert.equal(panel.querySelectorAll('.bazi-as-body.is-muted').length, 0);
      assert.match(panel.querySelector('.bazi-notehint')!.textContent!, /整宫制/);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  const clickTimeControl = async (selector: string) => {
    const control = harness.doc.querySelector<HTMLElement>(selector);
    assert.ok(control, selector);
    await act(async () => control.click());
  };
  const editTime = async () => {
    await clickTimeControl('.bazi-psel-btn');
    await clickTimeControl('[aria-label="编辑 林川"]');
  };
  const chooseShanghaiTime = async () => {
    await clickTimeControl('[aria-label="占星出生时区"]');
    const option = [...harness.doc.querySelectorAll<HTMLElement>('.select-option')].find(item => item.textContent === '中国大陆 · 北京时间')!;
    await act(async () => option.click());
  };

  test('新建默认地区规则；旧命例保持固定时差，改时区失败保留输入并可重试', async t => {
    const directory = mkdtempSync(join(tmpdir(), 'ono-time-ui-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const store = new BaziStore(directory);
    const input = chartData(SHANGHAI).profiles[0];
    const { createdAt: _createdAt, ...fields } = input;
    store.saveProfile(fields);
    harness.useStore(store);
    await harness.show(store.all());
    const create = [...harness.doc.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === '新建命例')!;
    await act(async () => create.click());
    assert.match(harness.doc.querySelector('[aria-label="占星出生时区"]')!.textContent!, /中国大陆/);
    const cancel = [...harness.doc.querySelectorAll<HTMLButtonElement>('dialog[open] button')].find(button => button.textContent === '取消')!;
    await act(async () => cancel.click());
    const panel = await harness.openAstro();
    await clickTimeControl('[aria-label="查看月亮"]');
    await editTime();
    assert.match(harness.doc.querySelector('.bazi-time-fields')!.textContent!, /旧命例沿用固定 UTC\+8/);
    await chooseShanghaiTime();
    assert.match(harness.doc.querySelector('.bazi-time-preview')!.textContent!, /UTC\+09:00.*1990-08-16 05:30:00 UTC/);
    const originalSave = store.saveProfile.bind(store);
    store.saveProfile = () => { throw new Error('模拟磁盘暂不可写'); };
    await clickTimeControl('.bazi-form-actions .btn-pri');
    assert.ok(harness.doc.querySelector('dialog[open]'));
    assert.equal(harness.doc.activeElement, harness.doc.querySelector('.bazi-save-error'));
    assert.match(harness.doc.querySelector('.bazi-save-error')!.textContent!, /填写的内容已保留/);
    assert.match(harness.doc.querySelector('.bazi-time-preview')!.textContent!, /UTC\+09:00/);
    store.saveProfile = originalSave;
    await clickTimeControl('.bazi-form-actions .btn-pri');
    assert.equal(harness.doc.querySelector('dialog[open]'), null);
    assert.equal(new BaziStore(directory).all().profiles[0].astroTimeZone, 'Asia/Shanghai');
    assert.match(panel.querySelector('.bazi-as-pan')!.textContent!, /UTC\+09:00/);
    assert.equal(panel.querySelector('.bazi-as-selection'), null, '改变时间依据后不沿用旧选择');
  });

  test('重复时段不预选，明确第二次后持久化，修改日期会清除旧选择', async t => {
    const directory = mkdtempSync(join(tmpdir(), 'ono-time-fold-ui-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const store = new BaziStore(directory);
    store.saveProfile({ id: 'fold', name: '林川', gender: 1, date: '1990-09-16', time: '01:30' });
    harness.useStore(store);
    await harness.show(store.all());
    await editTime();
    await chooseShanghaiTime();
    assert.equal(harness.doc.querySelectorAll('.bazi-time-choices input').length, 2);
    assert.equal(harness.doc.querySelector('.bazi-time-choices input:checked'), null);
    await clickTimeControl('.bazi-form-actions .btn-pri');
    assert.match(harness.doc.querySelector('.bazi-save-error')!.textContent!, /出现过两次/);
    assert.equal(store.all().profiles[0].astroTimeZone, undefined);
    await clickTimeControl('input[value="later"]');
    assert.match(harness.doc.querySelector('.bazi-time-preview')!.textContent!, /17:30:00 UTC.*第二次/);
    await clickTimeControl('.bazi-form-actions .btn-pri');
    assert.equal(new BaziStore(directory).all().profiles[0].astroTimeChoice, 'later');
    await editTime();
    assert.equal(harness.doc.querySelector<HTMLInputElement>('input[value="later"]')!.checked, true);
    await clickTimeControl('.date-picker > button');
    await clickTimeControl('[aria-label="1990-09-17"]');
    assert.equal(harness.doc.querySelector('.bazi-time-choices'), null);
    await clickTimeControl('.bazi-form-actions .btn-pri');
    assert.equal(new BaziStore(directory).all().profiles[0].astroTimeChoice, undefined);
  });

  test('不存在的钟表时间禁止保存；失效时区仅阻止占星且可从页面修正', async () => {
    await harness.show(chartData({ date: '1990-04-15', time: '02:30' }));
    await editTime();
    await chooseShanghaiTime();
    assert.match(harness.doc.querySelector('.bazi-time-preview')!.textContent!, /时间不存在/);
    await clickTimeControl('.bazi-form-actions .btn-pri');
    assert.match(harness.doc.querySelector('.bazi-save-error')!.textContent!, /时间不存在/);
    await harness.show(chartData({ astroTimeZone: 'Old/Unknown' }));
    assert.ok(harness.doc.querySelector('#bazi-pan-bazi'));
    const tab = [...harness.doc.querySelectorAll<HTMLElement>('[role="tab"]')].find(item => item.textContent === '占星')!;
    await act(async () => tab.click());
    assert.match(harness.doc.querySelector('.bazi-chart-error')!.textContent!, /未识别这个时区/);
    assert.equal(harness.doc.querySelector<HTMLButtonElement>('.bazi-top .btn-pri')!.disabled, true);
    await clickTimeControl('.bazi-chart-error button');
    assert.equal(harness.doc.querySelector<HTMLInputElement>('[aria-label="其他地区时区"]')!.value, 'Old/Unknown');
    await chooseShanghaiTime();
    assert.match(harness.doc.querySelector('.bazi-time-preview')!.textContent!, /UTC\+09:00/);
  });
});
