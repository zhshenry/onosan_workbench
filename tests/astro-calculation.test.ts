import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { buildAstro, houseOfLongitude } from '../modules/bazi/astro';
import { AstroPan } from '../modules/bazi/ui/AstroPan';
import { buildBaziContribution } from '../modules/bazi/ai';
import type { BaziProfile } from '../shared/bazi-contracts';
import fixtures from './fixtures/astro-placidus.json';
import { chartDistribution, houseRows } from '../modules/bazi/ui/astro-insights';

const SAMPLE: BaziProfile = {
  id: 'sample', name: '示例命例', gender: 1, createdAt: '2020-01-01T00:00:00Z',
  date: '2020-04-09', time: '11:34', place: '上海市黄浦区', lat: 31.2304, lon: 121.4737,
};
// Swiss Ephemeris 2.10.03 / swetest -b9.4.2020 -ut03:34:00 -house121.4737,31.2304,P -emos
const SWISS_CUSPS = [114.5156343, 136.9337960, 162.8440586, 193.9257913, 228.9339371, 263.4769212,
  294.5156343, 316.9337960, 342.8440586, 13.9257913, 48.9339371, 83.4769212];
const norm = (angle: number) => (angle % 360 + 360) % 360;
const closeAngle = (actual: number, expected: number) => {
  assert.ok(Math.abs(norm(actual - expected + 180) - 180) < 0.002, `${actual} differs from ${expected}`);
};

test('默认 Placidus: 上海示例十二宫头、ASC/MC 及十颗星体匹配独立星历和测测', () => {
  const chart = buildAstro(SAMPLE);
  assert.equal(chart.houseSystem, 'placidus');
  assert.equal(chart.houseCusps?.length, 12);
  chart.houseCusps!.forEach((cusp, index) => closeAngle(cusp, SWISS_CUSPS[index]));
  closeAngle(chart.asc!, SWISS_CUSPS[0]);
  closeAngle(chart.mc!, SWISS_CUSPS[9]);
  assert.deepEqual(chart.bodies.filter(body => body.kind === 'planet').map(body => body.house), [10, 4, 9, 11, 7, 7, 7, 10, 9, 7]);
});

test('整宫制可选: 月亮仍是五宫,但换上升星座的临界时间不再提前一宫', () => {
  const chart = buildAstro({ ...SAMPLE, astroHouseSystem: 'whole-sign' });
  assert.equal(chart.bodies.find(body => body.key === 'Moon')!.house, 5);
  assert.deepEqual(chart.houseCusps, [90, 120, 150, 180, 210, 240, 270, 300, 330, 0, 30, 60]);
  const boundary = buildAstro({ ...SAMPLE, time: '12:00', astroHouseSystem: 'whole-sign' });
  closeAngle(boundary.asc!, 120.0064141);
  assert.equal(boundary.bodies.find(body => body.key === 'Moon')!.house, 4);
});

test('概览十星等权统计,十二宫使用同一宫头和现代守护,不计入 ASC', () => {
  const chart = buildAstro(SAMPLE);
  assert.deepEqual(chartDistribution(chart), { elements: [1, 3, 3, 3], modes: [3, 4, 3], total: 10 });
  const houses = houseRows(chart);
  assert.equal(houses[3].ruler?.key, 'Venus');
  assert.equal(houses[3].ruler?.house, 11);
  assert.deepEqual(houses[3].bodies.map(body => body.key), ['Moon']);
  assert.equal(houses[4].ruler?.key, 'Pluto');
  assert.equal(houses[7].ruler?.key, 'Uranus');
  assert.equal(houses[8].ruler?.key, 'Neptune');
  assert.equal(houses.flatMap(house => house.bodies).filter(body => body.kind === 'planet').length, 10);
  assert.equal(houses.flatMap(house => house.bodies).length, 19);
  const noPlace = buildAstro({ date: SAMPLE.date, time: SAMPLE.time });
  assert.deepEqual(houseRows(noPlace), []);
  assert.deepEqual(chartDistribution(noPlace), chartDistribution(chart));
});

for (const fixture of fixtures.cases) {
  test(`Placidus 独立星历对照: ${fixture.name}`, () => {
    const chart = buildAstro(fixture.input);
    assert.equal(chart.houseCusps?.length, 12);
    chart.houseCusps!.forEach((cusp, index) => closeAngle(cusp, fixture.cusps[index]));
    closeAngle(chart.asc!, fixture.cusps[0]);
    closeAngle(chart.mc!, fixture.cusps[9]);
  });
}

test('宫头前后及跨零黄经归属正确,不靠取整后的显示度数判宫', () => {
  for (let index = 0; index < SWISS_CUSPS.length; index++) {
    const cusp = SWISS_CUSPS[index];
    assert.equal(houseOfLongitude(cusp, SWISS_CUSPS), index + 1);
    assert.equal(houseOfLongitude(cusp + 0.00001, SWISS_CUSPS), index + 1);
    assert.equal(houseOfLongitude(cusp - 0.00001, SWISS_CUSPS), (index + 11) % 12 + 1);
  }
  assert.equal(houseOfLongitude(0, SWISS_CUSPS), 9);
  assert.equal(houseOfLongitude(360, SWISS_CUSPS), 9);
});

test('无出生地不捏造宫位; 极圈内 Placidus 保留星体并明确提示切换', () => {
  const noPlace = buildAstro({ date: SAMPLE.date, time: SAMPLE.time });
  assert.equal(noPlace.houseCusps, undefined);
  assert.ok(noPlace.bodies.every(body => body.house === undefined));
  const polar = buildAstro({ ...SAMPLE, lat: 70, lon: 20 });
  assert.equal(polar.bodies.filter(body => body.kind === 'planet').length, 10);
  assert.equal(polar.houseCusps, undefined);
  assert.ok(polar.bodies.every(body => body.house === undefined));
  assert.match(polar.houseWarning!, /普拉西德制.*整宫制/);
  const whole = buildAstro({ ...SAMPLE, lat: 70, lon: 20, astroHouseSystem: 'whole-sign' });
  assert.equal(whole.houseCusps?.length, 12);
});

test('AI 解读跟随命例宫制,避免界面四宫而上下文五宫', () => {
  const placidus = buildBaziContribution(SAMPLE, 'astro').contextText(new Date());
  assert.match(placidus, /普拉西德制/);
  assert.match(placidus, /月亮 天蝎[^；]*落第4宫/);
  const whole = buildBaziContribution({ ...SAMPLE, astroHouseSystem: 'whole-sign' }, 'astro').contextText(new Date());
  assert.match(whole, /整宫制/);
  assert.match(whole, /月亮 天蝎[^；]*落第5宫/);
});

test('真实黄经锚点与宫界一致,防碰撞文字不跨宫且孤立月亮不被整体平移', () => {
  for (const astroHouseSystem of ['placidus', 'whole-sign'] as const) {
    const chart = buildAstro({ ...SAMPLE, astroHouseSystem });
    const html = renderToStaticMarkup(createElement(AstroPan, { profile: SAMPLE, chart, onHouseSystemChange: () => {} }));
    const dom = new JSDOM(html);
    try {
      const doc = dom.window.document;
      const longitude = (x: number, y: number) => norm(Math.atan2(300 - y, x - 300) * 180 / Math.PI - 180 + chart.asc!);
      for (const body of chart.bodies) {
        const group = doc.querySelector(`[data-body="${body.key}"]`)!;
        const anchor = group.querySelector('circle')!;
        closeAngle(longitude(Number(anchor.getAttribute('cx')), Number(anchor.getAttribute('cy'))), body.lon);
        const label = group.querySelector('.bazi-as-planet-label')!;
        const labelLon = longitude(Number(label.getAttribute('x')), Number(label.getAttribute('y')) + 3);
        const cusp = chart.houseCusps![body.house! - 1];
        const next = chart.houseCusps![body.house! % 12];
        assert.ok(norm(labelLon - cusp) < norm(next - cusp), `${body.key} 标签跨宫`);
        if (body.key === 'Moon') closeAngle(labelLon, body.lon);
      }
      const spokes = [...doc.querySelectorAll('.bazi-as-house-spoke')];
      assert.equal(spokes.length, 12);
      spokes.forEach((line, index) => closeAngle(longitude(Number(line.getAttribute('x2')), Number(line.getAttribute('y2'))), chart.houseCusps![index]));
    } finally { dom.window.close(); }
  }
});
