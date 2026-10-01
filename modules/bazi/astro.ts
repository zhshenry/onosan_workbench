/**
 * 西洋占星计算:astronomy-engine 的唯一引用点(纯计算,渲染层直接调用)。
 * 行星黄道经度(回归制)为真算;宫位/上升需要出生地经纬度,暂不输出(产品待定后补)。
 * 时区假设:出生时间为东八区(UTC+8)本地时间——个人应用约定,引入出生地时一并修正。
 */
import * as Astronomy from 'astronomy-engine';
import type { BaziProfile } from '../../shared/bazi-contracts';

export interface AstroBody {
  key: string;
  glyph: string;
  name: string;
  /** 黄道经度(度,0=白羊 0°) */
  lon: number;
  retro: boolean;
}

export interface AstroAspect {
  a: string;
  b: string;
  /** 合 / 六分 / 三分 / 刑 / 冲 */
  type: string;
  /** 出入度数,如 3.4 */
  orb: number;
  harmonious: boolean;
}

export interface AstroChart {
  bodies: AstroBody[];
  aspects: AstroAspect[];
}

const BODIES: { key: string; glyph: string; name: string }[] = [
  { key: 'Sun', glyph: '☉', name: '太阳' },
  { key: 'Moon', glyph: '☽', name: '月亮' },
  { key: 'Mercury', glyph: '☿', name: '水星' },
  { key: 'Venus', glyph: '♀', name: '金星' },
  { key: 'Mars', glyph: '♂', name: '火星' },
  { key: 'Jupiter', glyph: '♃', name: '木星' },
  { key: 'Saturn', glyph: '♄', name: '土星' },
  { key: 'Uranus', glyph: '♅', name: '天王' },
  { key: 'Neptune', glyph: '♆', name: '海王' },
  { key: 'Pluto', glyph: '♇', name: '冥王' },
];

/** 主要相位的容许度 */
const ASPECTS: { type: string; angle: number; orb: number; harmonious: boolean }[] = [
  { type: '合', angle: 0, orb: 8, harmonious: true },
  { type: '六分', angle: 60, orb: 5, harmonious: true },
  { type: '三分', angle: 120, orb: 7, harmonious: true },
  { type: '刑', angle: 90, orb: 6, harmonious: false },
  { type: '冲', angle: 180, orb: 8, harmonious: false },
];

function eclipticLon(key: string, time: Astronomy.AstroTime): number {
  const vec = key === 'Moon'
    ? Astronomy.GeoMoon(time)
    : Astronomy.GeoVector(Astronomy.Body[key as Astronomy.Body], time, true);
  return Astronomy.Ecliptic(vec).elon;
}

export function buildAstro(profile: Pick<BaziProfile, 'date' | 'time'>): AstroChart {
  const [year, month, day] = profile.date.split('-').map(Number);
  const [hour, minute] = profile.time.split(':').map(Number);
  if (!Number.isInteger(year) || year < 1700 || year > 2200) {
    throw new Error('年份超出星历可算范围');
  }
  // 东八区本地时间 → UTC
  const utc = Date.UTC(year, month - 1, day, hour - 8, minute);
  if (!Number.isFinite(utc)) throw new Error('生日或时间格式无效');
  const time = Astronomy.MakeTime(new Date(utc));
  const next = Astronomy.MakeTime(new Date(utc + 86400000));

  const bodies: AstroBody[] = BODIES.map((b) => {
    const lon = ((eclipticLon(b.key, time) % 360) + 360) % 360;
    const lonNext = ((eclipticLon(b.key, next) % 360) + 360) % 360;
    let delta = lonNext - lon;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    return { ...b, lon, retro: delta < 0 };
  });

  const aspects: AstroAspect[] = [];
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      let diff = Math.abs(bodies[i].lon - bodies[j].lon);
      if (diff > 180) diff = 360 - diff;
      for (const asp of ASPECTS) {
        const orb = Math.abs(diff - asp.angle);
        if (orb <= asp.orb) {
          aspects.push({ a: bodies[i].name, b: bodies[j].name, type: asp.type, orb: Math.round(orb * 100) / 100, harmonious: asp.harmonious });
          break;
        }
      }
    }
  }
  aspects.sort((x, y) => x.orb - y.orb);
  return { bodies, aspects };
}
