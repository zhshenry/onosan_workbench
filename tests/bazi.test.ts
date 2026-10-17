import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChart } from '../modules/bazi/compute';
import { findShenSha, hourName, shiShen } from '../shared/bazi-contracts';

const LIN_CHUAN = { date: '1990-08-16', time: '14:30', gender: 1 as const };
const SHEN_ZHIWEI = { date: '1993-02-23', time: '06:15', gender: 0 as const };

test('排盘:已知命例 1990-08-16 14:30 男 → 庚午 甲申 癸丑 己未', () => {
  const chart = buildChart(LIN_CHUAN);
  assert.deepEqual(chart.pillars.map((p) => p.ganZhi), ['庚午', '甲申', '癸丑', '己未']);
  assert.equal(chart.lunarText, '一九九〇年六月廿六');
  assert.equal(chart.shengXiao, '马');
  assert.equal(chart.hourText, '未时');
  assert.equal(chart.dayGan, '癸');
  assert.equal(chart.dayWuXing, '水');
});

test('排盘:四柱细节(十神/藏干/纳音/五行计数)', () => {
  const chart = buildChart(LIN_CHUAN);
  const year = chart.pillars[0];
  assert.equal(year.ssGan, '正印');
  assert.deepEqual(year.hideGan, ['丁', '己']);
  assert.deepEqual(year.ssZhi, ['偏财', '七杀']);
  assert.equal(year.naYin, '路旁土');
  assert.equal(year.wuXing, '金火');
  assert.equal(chart.pillars[2].ssGan, '日主'); // 库对日柱天干返回「日主」字面量
  assert.deepEqual(chart.count, { 木: 1, 火: 1, 土: 3, 金: 2, 水: 1 });
});

test('排盘:大运与流年链路', () => {
  const chart = buildChart(LIN_CHUAN);
  assert.ok(chart.yun);
  assert.equal(chart.yun!.startSolar, '1998-03-08');
  assert.equal(chart.yun!.list[0].ganZhi, '乙酉');
  assert.equal(chart.yun!.list[0].startAge, 9);
  const dingHai = chart.yun!.list.find((d) => d.ganZhi === '丁亥');
  assert.ok(dingHai);
  assert.equal(dingHai!.startYear, 2018);
  assert.equal(dingHai!.endYear, 2027);
  assert.equal(dingHai!.liuNian.length, 10);
  assert.deepEqual(
    dingHai!.liuNian.slice(0, 2).map((l) => [l.year, l.ganZhi]),
    [[2018, '戊戌'], [2019, '己亥']],
  );
  assert.ok(dingHai!.liuNian.some((l) => l.year === 2026 && l.ganZhi === '丙午'));
});

test('排盘:1993-02-23 06:15 女 → 癸酉 甲寅 乙亥 己卯,生肖鸡', () => {
  const chart = buildChart(SHEN_ZHIWEI);
  assert.deepEqual(chart.pillars.map((p) => p.ganZhi), ['癸酉', '甲寅', '乙亥', '己卯']);
  assert.equal(chart.shengXiao, '鸡');
});

test('排盘:性别影响起运(同一命例男女起运日不同)', () => {
  const male = buildChart({ ...LIN_CHUAN, gender: 1 });
  const female = buildChart({ ...LIN_CHUAN, gender: 0 });
  assert.ok(male.yun && female.yun);
  assert.notEqual(male.yun.startSolar, female.yun.startSolar);
});

test('排盘:年份越界抛中文错误,非法日期不可排', () => {
  assert.throws(() => buildChart({ date: '1899-12-31', time: '12:00', gender: 1 }), /年份需在 1900 至 2100 之间/);
  assert.throws(() => buildChart({ date: '2101-01-01', time: '12:00', gender: 1 }), /年份需在 1900 至 2100 之间/);
  assert.throws(() => buildChart({ date: '1990-13-40', time: '99:99', gender: 1 }));
});

test('十神:生克与阴阳同异', () => {
  assert.equal(shiShen('癸', '庚'), '正印');
  assert.equal(shiShen('癸', '辛'), '偏印');
  assert.equal(shiShen('癸', '丁'), '偏财');
  assert.equal(shiShen('癸', '丙'), '正财');
  assert.equal(shiShen('癸', '己'), '七杀');
  assert.equal(shiShen('癸', '戊'), '正官');
  assert.equal(shiShen('癸', '壬'), '劫财');
  assert.equal(shiShen('癸', '乙'), '食神');
  assert.equal(shiShen('癸', '甲'), '伤官');
  assert.equal(shiShen('癸', '癸'), '比肩');
  assert.equal(shiShen('甲', '甲'), '比肩');
  assert.equal(shiShen('甲', '乙'), '劫财');
  assert.equal(shiShen('甲', '丙'), '食神');
  assert.equal(shiShen('甲', '己'), '正财');
  assert.equal(shiShen('甲', '辛'), '正官');
  assert.equal(shiShen('甲', '壬'), '偏印');
});

test('时辰名:23 点与 0 点均为子时', () => {
  assert.equal(hourName(23), '子时');
  assert.equal(hourName(0), '子时');
  assert.equal(hourName(1), '丑时');
  assert.equal(hourName(12), '午时');
  assert.equal(hourName(13), '未时');
  assert.equal(hourName(22), '亥时');
});

test('神煞:年支/日支三合局与日干查表', () => {
  const hits = findShenSha('癸', '午', '丑');
  const has = (name: string, from: string, zhi: string) =>
    hits.some((h) => h.name === name && h.from === from && h.zhi === zhi);
  // 年支午(寅午戌):驿马申、将星午;日支丑(巳酉丑):桃花午、华盖丑
  assert.ok(has('驿马', '年支', '申'));
  assert.ok(has('将星', '年支', '午'));
  assert.ok(has('桃花', '日支', '午'));
  assert.ok(has('华盖', '日支', '丑'));
  // 癸的天乙贵人在巳/卯(查表返回,落柱由展示层过滤)
  assert.ok(has('天乙贵人', '日干', '巳'));
  assert.ok(has('天乙贵人', '日干', '卯'));
  // 阴干不取羊刃;癸年支午的红鸾为酉
  assert.ok(!hits.some((h) => h.name === '羊刃'));
  assert.ok(has('红鸾', '年支', '酉'));
  assert.ok(has('天喜', '年支', '卯'));
  assert.throws(() => findShenSha('X', '午', '丑'));
});

/* ---- 紫微(iztro 真算) ---- */
import { buildZiwei, ziweiTimeIndex } from '../modules/bazi/ziwei';
import { buildAstro } from '../modules/bazi/astro';
import { baziProfileInputSchema } from '../shared/bazi-contracts';

test('紫微:林川 命宫在子,命主贪狼/身主火星', () => {
  const z = buildZiwei(LIN_CHUAN);
  assert.equal(z.soul, '贪狼');
  assert.equal(z.body, '火星');
  assert.ok(z.fiveElementsClass.endsWith('局'), `五行局:${z.fiveElementsClass}`);
  assert.equal(z.palaces.length, 12);
  const ming = z.palaces.find((p) => p.name === '命宫');
  assert.ok(ming);
  assert.equal(ming!.ganZhi.slice(1), '子');
  assert.ok(ming!.decadal[0] >= 2 && ming!.decadal[0] <= 8, `大限起始:${ming!.decadal[0]}`);
  const shen = z.palaces.find((p) => p.isBodyPalace);
  assert.ok(shen);
});

test('紫微:庚年四化 日禄/武权/阴科/同忌 齐备', () => {
  const z = buildZiwei(LIN_CHUAN);
  const muts = z.palaces.flatMap((p) => p.majorStars.filter((s) => s.mutagen).map((s) => `${s.name}${s.mutagen}`));
  for (const m of ['太阳禄', '武曲权', '太阴科', '天同忌']) {
    assert.ok(muts.includes(m), `缺少 ${m},实际:${muts.join('、')}`);
  }
});

test('紫微:时辰序号 23 点为晚子时', () => {
  assert.equal(ziweiTimeIndex(23), 12);
  assert.equal(ziweiTimeIndex(0), 0);
  assert.equal(ziweiTimeIndex(14), 7);
});

test('占星:林川 太阳约狮子 23°(黄经 143°),土星逆行', () => {
  const a = buildAstro(LIN_CHUAN);
  assert.equal(a.bodies.length, 10);
  const sun = a.bodies.find((b) => b.key === 'Sun')!;
  assert.ok(Math.abs(sun.lon - 143.15) < 1, `太阳黄经 ${sun.lon}`);
  const saturn = a.bodies.find((b) => b.key === 'Saturn')!;
  assert.ok(saturn.retro, '1990-08 土星应逆行');
});

test('占星:相位非空且类型合法', () => {
  const a = buildAstro(LIN_CHUAN);
  assert.ok(a.aspects.length > 0);
  for (const asp of a.aspects) {
    assert.ok(['合', '六分', '三分', '刑', '冲'].includes(asp.type));
    assert.ok(asp.orb >= 0 && asp.orb <= 8);
  }
});

test('命例契约:tag 可选且最长 6 字', () => {
  const base = { name: '测试', gender: 1, date: '1990-08-16', time: '12:00' };
  assert.ok(baziProfileInputSchema.safeParse(base).success);
  assert.ok(baziProfileInputSchema.safeParse({ ...base, tag: '家人' }).success);
  assert.ok(!baziProfileInputSchema.safeParse({ ...base, tag: '七个字的标签呀' }).success);
});

/* ---- 紫微流运(horoscope) ---- */
import { ziweiHoroscopeText } from '../modules/bazi/ai';
import { buildZiweiHoroscope } from '../modules/bazi/ziwei';
import { buildAstro as buildAstroFull } from '../modules/bazi/astro';

test('紫微流运:林川 2026-10-01 → 流年丙午,三层同构', () => {
  const horo = buildZiweiHoroscope(LIN_CHUAN, '2026-10-01');
  assert.equal(horo.yearly.stem, '丙');
  assert.equal(horo.yearly.branch, '午');
  assert.equal(horo.yearly.palaceNames.length, 12);
  assert.equal(horo.yearly.palaceNames[horo.yearly.index], '命宫');
  assert.equal(horo.yearly.mutagen.length, 4);
  assert.ok(horo.monthly && horo.daily, '流月流日层应存在');
  assert.notDeepEqual([horo.yearly.index, horo.monthly.index, horo.daily.index], [0, 0, 0]);
  const text = ziweiHoroscopeText(LIN_CHUAN, '2026-10-01');
  assert.match(text, /流年\(丙午\)/);
  assert.match(text, /流四化：天同化禄/);
  assert.match(text, /流命宫落本命/);
});

test('紫微流运:非法日期被拒', () => {
  assert.throws(() => buildZiweiHoroscope(LIN_CHUAN, '2026-13-01'), /日期无效/);
  assert.throws(() => buildZiweiHoroscope(LIN_CHUAN, '1800-01-01'), /1900 至 2100/);
});

/* ---- 占星宫位(整宫制,出生地) ---- */
const SHANGHAI = { place: '上海', lat: 31.2304, lon: 121.4737 };

test('占星:上海命例获得上升/天顶与整宫制宫位', () => {
  const chart = buildAstroFull({ ...LIN_CHUAN, ...SHANGHAI });
  assert.ok(chart.asc !== undefined && chart.mc !== undefined);
  assert.ok(chart.asc! >= 0 && chart.asc! < 360);
  for (const body of chart.bodies) {
    assert.ok(body.house !== undefined && body.house >= 1 && body.house <= 12, `${body.name} 宫位缺失`);
  }
  // 整宫制:每颗行星的宫位 = 所在星座相对上升星座的序号(上升星座为第 1 宫)
  const ascSign = Math.floor(chart.asc! / 30);
  for (const body of chart.bodies) {
    assert.equal(body.house, ((Math.floor(body.lon / 30) - ascSign + 12) % 12) + 1);
  }
});

test('占星:无出生地则无宫位数据(向后兼容)', () => {
  const chart = buildAstro({ ...LIN_CHUAN });
  assert.equal(chart.asc, undefined);
  assert.equal(chart.mc, undefined);
  assert.equal(chart.place, undefined);
  assert.ok(chart.bodies.length > 0);
  for (const body of chart.bodies) assert.equal(body.house, undefined, `${body.name} 不应有宫位`);
});

test('命例契约:出生地经纬度成对校验', () => {
  const base = { name: '测试', gender: 1, date: '1990-08-16', time: '12:00' };
  assert.ok(baziProfileInputSchema.safeParse({ ...base, place: '上海', lat: 31.23, lon: 121.47 }).success);
  assert.ok(!baziProfileInputSchema.safeParse({ ...base, lat: 31.23 }).success);
  assert.ok(!baziProfileInputSchema.safeParse({ ...base, lon: 121.47 }).success);
  assert.ok(!baziProfileInputSchema.safeParse({ ...base, lat: 95, lon: 121 }).success);
});

test('中国行政区:34 省级、坐标齐全、反查路径正确', async () => {
  const { CHINA_REGIONS, findRegionByCoords } = await import('../shared/china-region-geo');
  assert.equal(CHINA_REGIONS.length, 34);
  const walk = (nodes: { lat: number; lon: number; children?: unknown[] }[]): number => {
    let count = 0;
    for (const node of nodes) {
      count += 1;
      assert.ok(Number.isFinite(node.lat) && Number.isFinite(node.lon), '坐标缺失');
      if (node.children) count += walk(node.children as typeof nodes);
    }
    return count;
  };
  assert.ok(walk(CHINA_REGIONS) > 3000, '应覆盖三千余行政区');
  // 市府精确坐标 → 直辖市辖区(黄浦区节点最近)
  const huangpu = findRegionByCoords(31.232, 121.485);
  assert.equal(huangpu?.label, '上海市 黄浦区');
  // 广州市中心 → 省/市/区三级(同坐标平局取最深层级)
  const guangzhou = findRegionByCoords(23.129, 113.264);
  assert.equal(guangzhou?.province, '广东省');
  assert.equal(guangzhou?.city, '广州市');
  assert.ok(guangzhou?.district, '应命中区级');
  // 国外坐标 → null(自定义)
  assert.equal(findRegionByCoords(48.5, 9.1), null);
});