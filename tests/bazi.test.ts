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
