/**
 * 紫微斗数计算:iztro 的唯一引用点(纯计算,渲染层直接调用)。
 * 输入命例档案 → 十二宫(宫名/宫干支/主星亮度四化/辅星/大限/身宫)。
 */
import { astro } from 'iztro';
import type { BaziProfile } from '../../shared/bazi-contracts';

export interface ZiweiStar {
  name: string;
  /** 庙旺得利平不陷,空串表示未标 */
  brightness: string;
  /** 禄权科忌,空串表示无 */
  mutagen: string;
}

export interface ZiweiPalace {
  /** 宫名:命宫/兄弟宫/… */
  name: string;
  /** 宫干支,如「戊子」 */
  ganZhi: string;
  isBodyPalace: boolean;
  majorStars: ZiweiStar[];
  minorStars: ZiweiStar[];
  adjectiveStars: string[];
  /** 大限岁段 */
  decadal: [number, number];
}

export interface ZiweiChart {
  fiveElementsClass: string;
  soul: string;
  body: string;
  chineseDate: string;
  lunarText: string;
  zodiac: string;
  /** 十二宫,固定宫序(寅起);UI 按宫的地支入格 */
  palaces: ZiweiPalace[];
  /** 命宫地支 */
  soulBranch: string;
}

const BRANCH_ORDER = ['寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑'];

/** iztro 时辰序:0=早子,1=丑,…,12=晚子(23 点) */
export function ziweiTimeIndex(hour: number): number {
  if (hour === 23) return 12;
  return Math.floor(((hour + 1) % 24) / 2);
}

export function buildZiwei(profile: Pick<BaziProfile, 'date' | 'time' | 'gender'>): ZiweiChart {
  const [year, month, day] = profile.date.split('-').map(Number);
  const [hour] = profile.time.split(':').map(Number);
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    throw new Error('年份需在 1900 至 2100 之间');
  }
  const astrolabe = astro.bySolar(
    `${year}-${month}-${day}`,
    ziweiTimeIndex(hour),
    profile.gender === 1 ? '男' : '女',
  );
  const palaces: ZiweiPalace[] = astrolabe.palaces.map((p) => ({
    name: String(p.name),
    ganZhi: `${p.heavenlyStem}${p.earthlyBranch}`,
    isBodyPalace: Boolean(p.isBodyPalace),
    majorStars: p.majorStars.map((s) => ({
      name: String(s.name), brightness: String(s.brightness ?? ''), mutagen: String(s.mutagen ?? ''),
    })),
    minorStars: p.minorStars.map((s) => ({
      name: String(s.name), brightness: String(s.brightness ?? ''), mutagen: String(s.mutagen ?? ''),
    })),
    adjectiveStars: p.adjectiveStars.map((s) => String(s.name)),
    decadal: [p.decadal.range[0], p.decadal.range[1]],
  }));
  palaces.sort((a, b) => {
    const ai = BRANCH_ORDER.indexOf(a.ganZhi.slice(1));
    const bi = BRANCH_ORDER.indexOf(b.ganZhi.slice(1));
    return ai - bi;
  });
  return {
    fiveElementsClass: String(astrolabe.fiveElementsClass),
    soul: String(astrolabe.soul),
    body: String(astrolabe.body),
    chineseDate: String(astrolabe.chineseDate),
    lunarText: String(astrolabe.lunarDate),
    zodiac: String(astrolabe.zodiac),
    palaces,
    soulBranch: String(astrolabe.earthlyBranchOfSoulPalace),
  };
}
