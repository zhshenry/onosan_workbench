/**
 * 八字排盘契约:命例档案/笔记的持久化结构(Zod,主进程 Store 校验用)
 * + 排盘纯函数(十神、神煞查表、时辰名)与命盘类型。
 * lunar-javascript 的引用只出现在 modules/bazi/compute.ts,本文件保持纯函数以便测试。
 */
import { z } from 'zod';

/** 命例档案(1=男 0=女;性别影响大运顺逆) */
export const baziProfileInputSchema = z.object({
  name: z.string().trim().min(1, '请填写姓名或备注').max(12, '姓名最多12字'),
  gender: z.union([z.literal(0), z.literal(1)], { error: '请选择性别' }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '请填写有效的公历生日'),
  time: z.string().regex(/^\d{2}:\d{2}$/, '请填写有效的出生时间'),
}).strict();
export type BaziProfileInput = z.infer<typeof baziProfileInputSchema>;
export interface BaziProfile extends BaziProfileInput { id: string; createdAt: string; }

/** 命例库持久化结构(userData/bazi-profiles.json;笔记按命例 id 挂载) */
export const baziStoreDataSchema = z.object({
  profiles: z.array(z.object({
    id: z.string().min(1),
    name: baziProfileInputSchema.shape.name,
    gender: baziProfileInputSchema.shape.gender,
    date: baziProfileInputSchema.shape.date,
    time: baziProfileInputSchema.shape.time,
    createdAt: z.string(),
  })),
  notes: z.record(z.string(), z.string()),
}).strict();
export type BaziStoreData = z.infer<typeof baziStoreDataSchema>;

/* ---------------- 干支/五行常量与纯函数 ---------------- */

export const GAN = '甲乙丙丁戊己庚辛壬癸';
export const ZHI = '子丑寅卯辰巳午未申酉戌亥';

export const WUXING_OF: Record<string, string> = {};
for (const [chars, wx] of [['甲乙', '木'], ['丙丁', '火'], ['戊己', '土'], ['庚辛', '金'], ['壬癸', '水']] as const) {
  for (const c of chars) WUXING_OF[c] = wx;
}
for (const [chars, wx] of [['寅卯', '木'], ['巳午', '火'], ['申酉', '金'], ['亥子', '水'], ['辰戌丑未', '土']] as const) {
  for (const c of chars) WUXING_OF[c] = wx;
}

const YANG_GAN = new Set(['甲', '丙', '戊', '庚', '壬']);
const SHENG: Record<string, string> = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
const KE: Record<string, string> = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };

/** 十神:日主天干相对目标天干的关系 */
export function shiShen(dayGan: string, gan: string): string {
  const a = WUXING_OF[dayGan];
  const b = WUXING_OF[gan];
  if (!a || !b) throw new Error(`无效的天干:${dayGan}/${gan}`);
  const same = YANG_GAN.has(dayGan) === YANG_GAN.has(gan);
  if (a === b) return same ? '比肩' : '劫财';
  if (SHENG[a] === b) return same ? '食神' : '伤官';
  if (KE[a] === b) return same ? '偏财' : '正财';
  if (KE[b] === a) return same ? '七杀' : '正官';
  return same ? '偏印' : '正印';
}

/** 时辰名(23:00–0:59 为子时,每两小时一柱) */
export function hourName(hour: number): string {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error('无效的小时');
  return `${ZHI[Math.floor(((hour + 1) % 24) / 2)]}时`;
}

/* ---------------- 神煞(本地查表;以日干/年支/日支起) ---------------- */

export interface ShenShaHit { name: string; from: '日干' | '年支' | '日支'; zhi: string; }

const TIAN_YI: Record<string, string[]> = {
  甲: ['丑', '未'], 乙: ['子', '申'], 丙: ['亥', '酉'], 丁: ['亥', '酉'],
  戊: ['丑', '未'], 己: ['子', '申'], 庚: ['丑', '未'], 辛: ['午', '寅'],
  壬: ['巳', '卯'], 癸: ['巳', '卯'],
};
const WEN_CHANG: Record<string, string> = {
  甲: '巳', 乙: '午', 丙: '申', 丁: '酉', 戊: '申', 己: '酉',
  庚: '亥', 辛: '子', 壬: '寅', 癸: '卯',
};
const YANG_REN: Record<string, string> = { 甲: '卯', 丙: '午', 戊: '午', 庚: '酉', 壬: '子' };
const HONG_LUAN: Record<string, string> = {
  子: '卯', 丑: '寅', 寅: '丑', 卯: '子', 辰: '亥', 巳: '戌',
  午: '酉', 未: '申', 申: '未', 酉: '午', 戌: '巳', 亥: '辰',
};
/** 三合局:申子辰/寅午戌/巳酉丑/亥卯未 → 桃花/驿马/华盖/将星 */
const SAN_HE: [string, string, string, string, string][] = [
  ['申子辰', '酉', '寅', '辰', '子'],
  ['寅午戌', '卯', '申', '戌', '午'],
  ['巳酉丑', '午', '亥', '丑', '酉'],
  ['亥卯未', '子', '巳', '未', '卯'],
];
const HONG_LUAN_ZHI = ZHI;

function sanHeGroup(zhi: string): [string, string, string, string, string] | null {
  return SAN_HE.find((g) => g[0].includes(zhi)) ?? null;
}

/** 常用神煞:按日干/年支/日支查表,返回命中列表(不涉及落柱,落柱由展示层按四柱地支标注) */
export function findShenSha(dayGan: string, yearZhi: string, dayZhi: string): ShenShaHit[] {
  if (!GAN.includes(dayGan) || !ZHI.includes(yearZhi) || !ZHI.includes(dayZhi)) {
    throw new Error('无效的日干或年支/日支');
  }
  const hits: ShenShaHit[] = [];
  const push = (name: string, from: ShenShaHit['from'], zhi: string): void => {
    hits.push({ name, from, zhi });
  };
  for (const zhi of TIAN_YI[dayGan] ?? []) push('天乙贵人', '日干', zhi);
  push('文昌', '日干', WEN_CHANG[dayGan]);
  for (const [from, zhi] of [['年支', yearZhi], ['日支', dayZhi]] as const) {
    const g = sanHeGroup(zhi);
    if (!g) continue;
    push('桃花', from, g[1]);
    push('驿马', from, g[2]);
    push('华盖', from, g[3]);
    push('将星', from, g[4]);
  }
  const yangRen = YANG_REN[dayGan];
  if (yangRen) push('羊刃', '日干', yangRen);
  const hongLuan = HONG_LUAN[yearZhi];
  if (hongLuan) {
    push('红鸾', '年支', hongLuan);
    push('天喜', '年支', HONG_LUAN_ZHI[(HONG_LUAN_ZHI.indexOf(hongLuan) + 6) % 12]);
  }
  return hits;
}

/* ---------------- 命盘类型(compute.ts 产出;不落盘,供视图与 AI 提示词使用) ---------------- */

export type PillarLabel = '年柱' | '月柱' | '日柱' | '时柱';

export interface BaziPillar {
  label: PillarLabel;
  /** 干支,如「庚午」 */
  ganZhi: string;
  gan: string;
  zhi: string;
  /** 天干五行 + 地支五行,如「金火」 */
  wuXing: string;
  /** 天干十神 */
  ssGan: string;
  /** 各藏干的十神(与 hideGan 一一对应) */
  ssZhi: string[];
  hideGan: string[];
  naYin: string;
}

export interface LiuNianItem { year: number; ganZhi: string; age: number; }

export interface DaYunItem {
  startAge: number;
  endAge: number;
  startYear: number;
  endYear: number;
  ganZhi: string;
  liuNian: LiuNianItem[];
}

export interface BaziYun {
  startYear: number;
  startMonth: number;
  startDay: number;
  /** 起运阳历日期,YYYY-MM-DD */
  startSolar: string;
  list: DaYunItem[];
}

export interface BaziChart {
  pillars: BaziPillar[];
  /** 八字 8 字五行计数 */
  count: Record<string, number>;
  /** 农历全文,如「一九九〇年六月廿六」 */
  lunarText: string;
  shengXiao: string;
  hourText: string;
  dayGan: string;
  dayWuXing: string;
  yun: BaziYun | null;
}
