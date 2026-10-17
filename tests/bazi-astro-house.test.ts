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
  Object.defineProperty(dom.window, 'workbench', { value: { bazi: {
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
  const head = [...panel.querySelectorAll('.phead')].find(element => element.querySelector('.ptitle')?.textContent === '行星落座');
  assert.equal(head?.querySelector('.pcount')?.textContent, '回归制 · 东八区');
  const table = panel.querySelector('table.bazi-astab');
  assert.ok(table, '行星落座表');
  assert.deepEqual(
    [...table.querySelectorAll('th')].map(cell => cell.getAttribute('aria-label') || cell.textContent),
    ['符号', '行星', '星座', '度数', '宫位'],
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
    for (const body of chart.bodies) {
      assert.equal(body.house, ((Math.floor(body.lon / 30) - Math.floor(chart.asc! / 30) + 12) % 12) + 1);
    }
    assert.ok(metas.includes(ascendantLabel(chart.asc!)));
    assert.equal(hints.includes(HOUSE_HINT), false);
  } else {
    assert.equal(chart.asc, undefined);
    assert.equal(chart.bodies.every(body => body.house === undefined), true);
    assert.equal(metas.some(text => text.startsWith('上升点')), false);
    assert.ok(hints.includes(HOUSE_HINT));
  }
  const svg = panel.querySelector('svg');
  assert.equal(svg?.getAttribute('aria-label'), '出生星盘(行星落座)');
  const drawn = svg?.textContent ?? '';
  for (const body of chart.bodies) assert.ok(drawn.includes(body.glyph), body.name);
  assert.equal(drawn.includes('宫'), false);
}

describe('占星行星落座宫位列', { concurrency: false }, () => {
  let harness: Harness;

  before(async () => {
    harness = await createHarness();
  });

  after(async () => {
    await harness.cleanup();
  });

  test('有出生地经纬度时宫位列与整宫制一致,并在盘面元信息显示上升点', async () => {
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
    assert.equal(harness.doc.body.textContent?.includes('上升点'), false);
    assert.equal(harness.messages.length, 0);
  });

  test('补填经纬度后宫位列与上升点随整宫计算出现', async () => {
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
});
