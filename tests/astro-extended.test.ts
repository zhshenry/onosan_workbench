import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAstro } from '../modules/bazi/astro';
import { smallBodyLongitude } from '../modules/bazi/astro-small-bodies';
import { chartDistribution } from '../modules/bazi/ui/astro-insights';
import { buildBaziContribution } from '../modules/bazi/ai';
import lunar from './fixtures/astro-lunar-points.json';
import references from './fixtures/astro-small-bodies.json';
import data from '../modules/bazi/data/small-bodies.json';

const sample = { date: '2020-04-09', time: '11:34', lat: 31.2304, lon: 121.4737 };
const angleError = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

for (const reference of references.fixtures) {
  test(`${reference.key}: 98 个独立 JPL 日期,覆盖 1700–2200 年,插值误差小于 0.1 角秒`, () => {
    assert.equal(reference.values.length, 98);
    for (const value of reference.values) {
      assert.ok(angleError(smallBodyLongitude(reference.key, value.jd), value.lon) * 3600 < 0.1, `${reference.key} JD ${value.jd}`);
    }
  });
}

test('小天体跨白羊零点插值连续,顺逆行方向与离线采样一致', () => {
  for (const body of data.bodies) {
    const crossing = body.longitude.findIndex((lon, i) => i > 0 && Math.abs(lon - body.longitude[i - 1]) > 350);
    assert.ok(crossing > 0);
    const midpoint = data.startJd + (crossing - 0.5) * data.stepDays;
    assert.ok(angleError(smallBodyLongitude(body.key, midpoint), 0) < 4, body.key);
    const before = smallBodyLongitude(body.key, midpoint - 0.00001);
    const after = smallBodyLongitude(body.key, midpoint + 0.00001);
    assert.ok(angleError(before, after) < 0.0001);
  }
  assert.throws(() => smallBodyLongitude('Chiron', data.startJd - 1), /超出内置范围/);
  const chart = buildAstro(sample);
  assert.equal(chart.bodies.find(body => body.key === 'Juno')!.retro, true);
  assert.equal(chart.bodies.find(body => body.key === 'Chiron')!.retro, false);
});

test('平均交点与投影后的平均莉莉丝匹配独立 Swiss 星历,南北交相差 180°', () => {
  for (const input of lunar.cases) {
    const chart = buildAstro(input);
    const north = chart.bodies.find(body => body.key === 'NorthNode')!;
    const south = chart.bodies.find(body => body.key === 'SouthNode')!;
    const lilith = chart.bodies.find(body => body.key === 'Lilith')!;
    assert.ok(angleError(north.lon, input.northNode) * 3600 < 1, input.date);
    assert.ok(angleError(lilith.lon, input.lilith) * 3600 < 3, input.date);
    assert.ok(angleError(north.lon + 180, south.lon) < 1e-10);
    assert.equal(north.basis, '平均交点');
    assert.equal(lilith.basis, '平均月球远地点');
    assert.equal(north.retro, true);
  }
});

test('福点按出生地昼夜分式,无地点或极点不捏造,不依赖所选宫制', () => {
  for (const [time, day] of [['11:34', true], ['23:34', false]] as const) {
    const chart = buildAstro({ ...sample, time });
    const sun = chart.bodies.find(body => body.key === 'Sun')!;
    const moon = chart.bodies.find(body => body.key === 'Moon')!;
    const fortune = chart.bodies.find(body => body.key === 'Fortune')!;
    const expected = chart.asc! + (day ? moon.lon - sun.lon : sun.lon - moon.lon);
    assert.ok(angleError(fortune.lon, (expected % 360 + 360) % 360) < 1e-9);
    assert.equal(fortune.basis, day ? '昼盘公式' : '夜盘公式');
    assert.equal(fortune.retro, undefined);
    const whole = buildAstro({ ...sample, time, astroHouseSystem: 'whole-sign' });
    assert.equal(whole.bodies.find(body => body.key === 'Fortune')!.lon, fortune.lon);
  }
  for (const input of [{ date: sample.date, time: sample.time }, { ...sample, lat: 90 }]) {
    assert.equal(buildAstro(input).bodies.some(body => body.key === 'Fortune'), false);
  }
});

test('新增九个对象保留真实落宫,已核实对象采用新相位规则,十星分布不变', () => {
  const chart = buildAstro(sample);
  assert.equal(chart.bodies.length, 19);
  assert.equal(chart.bodies.filter(body => body.kind === 'minor').length, 5);
  assert.equal(chart.bodies.filter(body => body.kind === 'point').length, 4);
  assert.ok(chart.bodies.every(body => Number.isFinite(body.lon) && body.house! >= 1 && body.house! <= 12));
  assert.deepEqual(chartDistribution(chart), { elements: [1, 3, 3, 3], modes: [3, 4, 3], total: 10 });
  const kinds = new Map(chart.bodies.map(body => [body.name, body.kind]));
  for (const aspect of chart.aspects) {
    assert.equal(kinds.get(aspect.a) === 'point' && kinds.get(aspect.b) === 'point', false);
    assert.ok(aspect.orb <= aspect.maxOrb);
    if (kinds.get(aspect.a) === 'point' || kinds.get(aspect.b) === 'point') assert.equal(aspect.maxOrb, aspect.type === '六分' ? 3 : 5);
  }
  assert.equal(chart.aspects.filter(aspect => kinds.get(aspect.a) === 'planet' && kinds.get(aspect.b) === 'planet').length, 23);
});

test('同一真实时刻的小天体结果一致,AI 上下文包括扩展名称及算法口径', () => {
  const a = buildAstro({ ...sample, astroTimeZone: 'Asia/Shanghai' });
  const b = buildAstro({ ...sample, time: '03:34', astroTimeZone: '+00:00' });
  assert.deepEqual(a.bodies, b.bodies);
  const text = buildBaziContribution({ ...sample, id: 'test', name: '测试', gender: 1, createdAt: '2020-01-01T00:00:00Z' }, 'astro').contextText(new Date());
  for (const term of ['凯龙星', '婚神星', '谷神星', '智神星', '灶神星', '平均交点', '平均月球远地点', '昼盘公式', '主要星体相位', '扩展对象相位']) assert.ok(text.includes(term), term);
});
