import assert from 'node:assert/strict';
import test from 'node:test';
import { act, createElement } from 'react';
import { JSDOM } from 'jsdom';
import { buildAstro } from '../modules/bazi/astro';
import { buildBaziContribution } from '../modules/bazi/ai';
import type { AiConfig } from '../shared/workbench-api';
import type { BaziProfile } from '../shared/bazi-contracts';
import type { AstroReadingTopic } from '../shared/astro-reading';

const profile: BaziProfile = { id: 'reading-profile-a', name: '解读测试甲', gender: 1, date: '2020-04-09', time: '11:34',
  lat: 31.2304, lon: 121.4737, createdAt: '2020-01-01T00:00:00.000Z' };

test('主题只改变分析重点，完整星体、宫头和全部相位始终注入；缺地点仍保留限制', () => {
  const now = new Date('2026-11-08T00:00:00Z'), chart = buildAstro(profile);
  const overview = buildBaziContribution(profile, 'astro', '测试笔记', 'overview');
  const wealth = buildBaziContribution(profile, 'astro', '测试笔记', 'wealth');
  assert.equal(overview.contextText(now), wealth.contextText(now));
  const context = wealth.contextText(now);
  for (const body of chart.bodies) assert.ok(context.includes(body.name), body.name);
  for (const aspect of chart.aspects) assert.ok(context.includes(`${aspect.a}-${aspect.b} ${aspect.type}，实际偏差${aspect.orb}°，上限${aspect.maxOrb}°`));
  for (let house = 1; house <= 12; house++) assert.ok(context.includes(`${house}宫 `));
  assert.match(wealth.systemPrompt(now), /本次解读主题：财运与金钱观/);
  assert.match(wealth.systemPrompt(now), /优先回答用户的具体问题/);
  assert.match(wealth.systemPrompt(now), /没有占星行运、推运计算结果/);
  assert.deepEqual(wealth.buildTools(), []);
  const { lat: _lat, lon: _lon, ...missingPlace } = profile;
  assert.match(buildBaziContribution(missingPlace, 'astro', '', 'wealth').systemPrompt(now), /不能推断宫位与上升点/);
});

test('真实解读表单：选题填入不请求，显式发送去重，草稿按命例保留并可从配置失败恢复', async t => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  const names = ['window', 'document', 'HTMLElement', 'HTMLDialogElement', 'Node', 'navigator', 'localStorage', 'requestAnimationFrame', 'cancelAnimationFrame', 'IS_REACT_ACT_ENVIRONMENT'] as const;
  const previous = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  names.forEach(name => Object.defineProperty(globalThis, name, { configurable: true,
    value: name === 'window' ? dom.window : name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name] }));
  const configured: AiConfig = { aiEnabled: true, hasConnection: true, providers: [], models: [], activeModelId: '', rlcdProviders: [], rlcdModels: [], activeRlcdModelId: '' };
  let read = () => Promise.resolve(configured), listener: ((config: AiConfig) => void) | undefined;
  const requests: { prompt: string; profileId: string; system: string; topic?: AstroReadingTopic }[] = [];
  let release: (() => void) | undefined, viewCount = 0, settingsCount = 0;
  Object.assign(dom.window, { workbench: { bazi: { list: async () => ({ profiles: [profile, { ...profile, id: 'reading-profile-b', name: '解读测试乙' }], notes: {} }) }, ai: {
    config: () => read(), onConfigChanged: (callback: typeof listener) => { listener = callback; return () => { listener = undefined; }; },
  } } });
  const { createRoot } = await import('react-dom/client');
  const { BaziView } = await import('../modules/bazi/ui/BaziView');
  const doc = dom.window.document;
  let root = createRoot(doc.getElementById('root')!);
  const render = (requestedProfileId?: string, aiBusy = false) => act(async () => root.render(createElement(BaziView, {
    onPending: message => assert.fail(message), onCurrentProfile: () => {}, onDayLocated: () => {}, requestedProfileId, aiBusy,
    onViewAI: () => { viewCount++; }, onOpenAISettings: () => { settingsCount++; },
    onAskAI: (prompt, profileId, system, topic) => { requests.push({ prompt, profileId, system, topic }); return new Promise<void>(resolve => { release = resolve; }); },
  })));
  const click = (element: HTMLElement | null) => { assert.ok(element); return act(async () => element.click()); };
  const button = (text: string) => [...doc.querySelectorAll<HTMLButtonElement>('button')].find(element => element.textContent === text)!;
  const openReading = async () => {
    await click(button('占星')); await click(button('解读'));
  };
  t.after(async () => {
    await act(async () => { release?.(); root.unmount(); }); dom.window.close();
    names.forEach((name, index) => previous[index] ? Object.defineProperty(globalThis, name, previous[index]!) : Reflect.deleteProperty(globalThis, name));
  });
  await render(); await openReading();
  await t.test('八个主题可选，问题只填入，实际发送保留原句和主题', async () => {
    await click(doc.querySelector<HTMLButtonElement>('[aria-label="解读主题"]'));
    const options = [...doc.querySelectorAll<HTMLElement>('[role="option"]')];
    assert.equal(options.length, 8);
    await click(options.find(element => element.textContent === '财运与金钱观')!);
    const question = '我在积累资源方面有哪些倾向？';
    await click(button(question));
    assert.equal(doc.querySelector<HTMLTextAreaElement>('.bazi-as-reading textarea')!.value, question);
    assert.equal(requests.length, 0);
    assert.equal(button(question).getAttribute('aria-pressed'), 'true');
    assert.equal(doc.querySelector('.bazi-as-object-options'), null);
    await click(doc.querySelector('.bazi-as-reading footer button'));
    assert.deepEqual(requests, [{ prompt: question, profileId: profile.id, system: 'astro', topic: 'wealth' }]);
    await click(doc.querySelector('.bazi-as-reading footer button'));
    assert.equal(requests.length, 1); assert.equal(viewCount, 1);
    await render(undefined, true); await act(async () => release!());
    assert.equal(doc.querySelector('.bazi-as-reading footer button')!.textContent, '查看解读');
    await click(doc.querySelector('.bazi-as-reading footer button'));
    assert.equal(requests.length, 1);
    await render();
  });
  await t.test('切换主题保留手写问题，切换命例互不串草稿', async () => {
    await click(doc.querySelector('[aria-label="解读主题"]'));
    await click([...doc.querySelectorAll<HTMLElement>('[role="option"]')].find(element => element.textContent === '事业与发展')!);
    assert.equal(doc.querySelector<HTMLTextAreaElement>('.bazi-as-reading textarea')!.value, requests[0].prompt);
    await render('reading-profile-b'); await click(button('解读'));
    assert.equal(doc.querySelector<HTMLTextAreaElement>('.bazi-as-reading textarea')!.value, '');
    assert.equal(doc.querySelector('[aria-label="解读主题"]')!.textContent, '综合解读');
    await render(profile.id); await click(button('解读'));
    assert.equal(doc.querySelector<HTMLTextAreaElement>('.bazi-as-reading textarea')!.value, requests[0].prompt);
    assert.equal(doc.querySelector('[aria-label="解读主题"]')!.textContent, '事业与发展');
  });
  await t.test('未配置只导航；离开再挂载后保留本次运行的主题和问题', async () => {
    await act(async () => listener!({ ...configured, aiEnabled: false, hasConnection: false }));
    await click(doc.querySelector('.bazi-as-reading footer button'));
    assert.equal(settingsCount, 1); assert.equal(requests.length, 1);
    await act(async () => root.unmount()); root = createRoot(doc.getElementById('root')!);
    await render(profile.id); await openReading();
    assert.equal(doc.querySelector('[aria-label="解读主题"]')!.textContent, '事业与发展');
    assert.equal(doc.querySelector<HTMLTextAreaElement>('.bazi-as-reading textarea')!.value, requests[0].prompt);
  });
  await t.test('配置读取失败禁发且可重试，迟到旧读取不覆盖新配置通知', async () => {
    read = () => Promise.reject(new Error('合成读取失败'));
    await click(button('八字')); await click(button('占星'));
    assert.match(doc.querySelector('[role="alert"]')!.textContent!, /合成读取失败/);
    assert.equal(doc.querySelector<HTMLButtonElement>('.bazi-as-reading footer button')!.disabled, true);
    let resolve!: (config: AiConfig) => void;
    read = () => new Promise(done => { resolve = done; });
    await click(button('重新读取'));
    await act(async () => listener!(configured));
    await act(async () => resolve({ ...configured, aiEnabled: false, hasConnection: false }));
    assert.equal(doc.querySelector('.bazi-as-reading footer button')!.textContent, '开始解读');
    assert.equal(doc.querySelector('[role="alert"]'), null);
  });
});
