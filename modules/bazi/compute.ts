/**
 * 排盘计算:lunar-javascript 的唯一引用点。
 * 纯计算、无 Node 依赖,渲染层(BaziView)与主进程(未来的 AI 工具)均可直接调用。
 */
import { Solar } from 'lunar-javascript';
import {
  hourName, WUXING_OF,
  type BaziChart, type BaziPillar, type BaziProfile, type BaziYun, type PillarLabel,
} from '../../shared/bazi-contracts';

/** lunar-javascript 的可靠计算范围,与输入控件 min/max 一致 */
export const BAZI_MIN_YEAR = 1900;
export const BAZI_MAX_YEAR = 2100;

const PILLAR_KEYS = ['Year', 'Month', 'Day', 'Time'] as const;
const PILLAR_LABELS: PillarLabel[] = ['年柱', '月柱', '日柱', '时柱'];

/** 库返回逗号分隔字符串或数组(版本差异),统一为数组 */
function toList(value: string | string[]): string[] {
  if (Array.isArray(value)) return value;
  return value.split(',').filter(Boolean);
}

export function buildChart(profile: Pick<BaziProfile, 'date' | 'time' | 'gender'>): BaziChart {
  const [year, month, day] = profile.date.split('-').map(Number);
  const [hour, minute] = profile.time.split(':').map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)
    || !Number.isInteger(hour) || !Number.isInteger(minute)) {
    throw new Error('生日或时间格式无效');
  }
  if (year < BAZI_MIN_YEAR || year > BAZI_MAX_YEAR) {
    throw new Error(`年份需在 ${BAZI_MIN_YEAR} 至 ${BAZI_MAX_YEAR} 之间`);
  }
  const solar = Solar.fromYmdHms(year, month, day, hour, minute, 0);
  const lunar = solar.getLunar();
  const ec = lunar.getEightChar();

  const pillars: BaziPillar[] = PILLAR_KEYS.map((key, index) => {
    const gz = ec[`get${key}`]();
    return {
      label: PILLAR_LABELS[index],
      ganZhi: gz.toString(),
      gan: ec[`get${key}Gan`](),
      zhi: ec[`get${key}Zhi`](),
      wuXing: ec[`get${key}WuXing`](),
      ssGan: ec[`get${key}ShiShenGan`](),
      ssZhi: toList(ec[`get${key}ShiShenZhi`]()),
      hideGan: toList(ec[`get${key}HideGan`]()),
      naYin: ec[`get${key}NaYin`](),
    };
  });

  const count: Record<string, number> = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
  for (const pillar of pillars) {
    count[WUXING_OF[pillar.gan]] += 1;
    count[WUXING_OF[pillar.zhi]] += 1;
  }

  let yun: BaziYun | null = null;
  try {
    const y = ec.getYun(profile.gender);
    yun = {
      startYear: y.getStartYear(),
      startMonth: y.getStartMonth(),
      startDay: y.getStartDay(),
      startSolar: y.getStartSolar().toYmd(),
      list: y
        .getDaYun()
        .filter((step) => step.getGanZhi())
        .map((step) => ({
          startAge: step.getStartAge(),
          endAge: step.getEndAge(),
          startYear: step.getStartYear(),
          endYear: step.getEndYear(),
          ganZhi: step.getGanZhi(),
          liuNian: step.getLiuNian().map((ln) => ({
            year: ln.getYear(),
            ganZhi: ln.getGanZhi(),
            age: ln.getAge(),
          })),
        })),
    };
  } catch {
    // 起运不可算(极端日期)时不阻塞主盘,大运区显示降级文案
    yun = null;
  }

  return {
    pillars,
    count,
    lunarText: lunar.toString(),
    shengXiao: lunar.getYearShengXiao(),
    hourText: hourName(hour),
    dayGan: ec.getDayGan(),
    dayWuXing: WUXING_OF[ec.getDayGan()] ?? '',
    yun,
  };
}
