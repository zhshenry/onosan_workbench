import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAspects, buildAstro, type AstroBody } from '../modules/bazi/astro';
import { buildBaziContribution } from '../modules/bazi/ai';

const body = (key: string, lon: number, kind: AstroBody['kind'] = 'planet'): AstroBody => ({ key, name: key, glyph: '', lon, kind });

test('Astrodienst 2.GW 五大相位按公开上限判定，不沿用原来的自定义值', () => {
  for (const [type, lon, maxOrb] of [['合', 9.75, 10], ['六分', 65.75, 6], ['刑', 99.75, 10], ['三分', 129.75, 10], ['冲', 170.25, 10]] as const) {
    const result = buildAspects([body('Sun', 0), body('Moon', lon)]);
    assert.equal(result.length, 1);
    assert.equal(result[0].type, type);
    assert.equal(result[0].maxOrb, maxOrb);
  }
});

test('相位在边界上成立、边界外不成立；先判定再舍入，跨零点仍正确', () => {
  for (const [inside, outside] of [[10, 10.00001], [66, 66.00001], [100, 100.00001], [130, 130.00001], [170, 169.99999]]) {
    assert.equal(buildAspects([body('Sun', 0), body('Moon', inside)]).length, 1, String(inside));
    assert.equal(buildAspects([body('Sun', 0), body('Moon', outside)]).length, 0, String(outside));
  }
  assert.equal(buildAspects([body('Sun', 0), body('Moon', 350)])[0].orb, 10);
  assert.equal(buildAspects([body('Sun', 359), body('Moon', 1)])[0].orb, 2);
});

test('凯龙采用公布的行星上限，数学点与行星或凯龙取双方上限的平均值', () => {
  assert.equal(buildAspects([body('Sun', 0), body('Chiron', 9.75, 'minor')])[0].maxOrb, 10);
  for (const point of ['NorthNode', 'SouthNode', 'Lilith', 'Fortune']) {
    assert.equal(buildAspects([body('Sun', 0), body(point, 5, 'point')])[0].maxOrb, 5);
    assert.equal(buildAspects([body('Sun', 0), body(point, 5.00001, 'point')]).length, 0);
    assert.equal(buildAspects([body('Chiron', 0, 'minor'), body(point, 63, 'point')])[0].maxOrb, 3);
    assert.equal(buildAspects([body('Chiron', 0, 'minor'), body(point, 63.00001, 'point')]).length, 0);
  }
  assert.deepEqual(buildAspects([body('NorthNode', 0, 'point'), body('SouthNode', 180, 'point'), body('Fortune', 60, 'point')]), []);
});

test('没有官方相位依据的四颗小行星保留位置，不能混入任意对象的相位', () => {
  for (const key of ['Ceres', 'Pallas', 'Juno', 'Vesta']) {
    assert.deepEqual(buildAspects([body('Sun', 0), body(key, 0, 'minor')]), []);
    assert.deepEqual(buildAspects([body('Chiron', 0, 'minor'), body(key, 0, 'minor')]), []);
  }
  const chart = buildAstro({ date: '2020-04-09', time: '11:34', lat: 31.23, lon: 121.45 });
  assert.equal(chart.bodies.length, 19);
  const positionOnly = chart.bodies.filter(item => ['Ceres', 'Pallas', 'Juno', 'Vesta'].includes(item.key));
  assert.equal(positionOnly.length, 4);
  for (const item of positionOnly) {
    assert.ok(Number.isFinite(item.lon) && item.house !== undefined && item.retro !== undefined);
    assert.ok(chart.aspects.every(aspect => aspect.a !== item.name && aspect.b !== item.name));
  }
  assert.equal(new Set(chart.aspects.map(item => [item.a, item.b].sort().join('|'))).size, chart.aspects.length);
});

test('AI 上下文同步相位来源、实际偏差和上限，位置对象不被误读成已计算相位', () => {
  const context = buildBaziContribution({ id: 'aspect-policy', name: '规则验收', date: '2020-04-09', time: '11:34', gender: 1, lat: 31.23, lon: 121.45, createdAt: '2020-01-01T00:00:00Z' }, 'astro').contextText(new Date());
  assert.match(context, /Astrodienst 2.GW/);
  assert.match(context, /实际偏差[\d.]+°，上限(?:3|5|6|10)°/);
  assert.match(context, /谷神星.*智神星.*婚神星.*灶神星仅有位置数据/);
  assert.doesNotMatch(context, /容许度最多3°/);
  assert.doesNotMatch(context.split('主要星体相位：')[1], /谷神星|智神星|婚神星|灶神星/);
});
