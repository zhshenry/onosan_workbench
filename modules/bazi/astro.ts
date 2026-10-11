/**
 * 西洋占星计算:astronomy-engine 的唯一引用点(纯计算,渲染层直接调用)。
 * 行星黄道经度(回归制)为真算;提供出生地经纬度时计算上升/天顶并按整宫制分配宫位,
 * 否则无宫位数据。时区假设:出生时间为东八区(UTC+8)本地时间。
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
  /** 整宫制宫位(1-12);无出生地时缺省 */
  house?: number;
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
  /** 出生地(行星落宫计算依据) */
  place?: { name?: string; lat: number; lon: number };
  /** 上升点黄道经度(度) */
  asc?: number;
  /** 天顶黄道经度(度) */
  mc?: number;
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

const norm360 = (deg: number): number => ((deg % 360) + 360) % 360;

/** 黄道某经度处黄道点对给定观测者的地平坐标(高度/方位) */
function eclipticPointHorizon(
  lon: number,
  time: Astronomy.AstroTime,
  observer: Astronomy.Observer,
): { altitude: number; azimuth: number } {
  const vecECL = new Astronomy.Vector(
    Math.cos((lon * Math.PI) / 180),
    Math.sin((lon * Math.PI) / 180),
    0,
    time,
  );
  const vecEQJ = Astronomy.RotateVector(Astronomy.Rotation_ECL_EQJ(), vecECL);
  const vecEQD = Astronomy.RotateVector(Astronomy.Rotation_EQJ_EQD(time), vecEQJ);
  const equ = Astronomy.EquatorFromVector(vecEQD);
  return Astronomy.Horizon(time, observer, equ.ra, equ.dec, '');
}

/** 数值求上升点:黄道上高度过零且位于东半天的点(上升),线性内插精化 */
function findAscendant(time: Astronomy.AstroTime, observer: Astronomy.Observer): number {
  const samples: { lon: number; alt: number; az: number }[] = [];
  for (let lon = 0; lon < 360; lon += 1) {
    const { altitude, azimuth } = eclipticPointHorizon(lon, time, observer);
    samples.push({ lon, alt: altitude, az: azimuth });
  }
  const crossings: number[] = [];
  for (let i = 0; i < 360; i++) {
    const a = samples[i];
    const b = samples[(i + 1) % 360];
    if ((a.alt < 0 && b.alt >= 0) || (a.alt > 0 && b.alt <= 0)) {
      const frac = Math.abs(a.alt) / (Math.abs(a.alt) + Math.abs(b.alt) || 1);
      crossings.push({ lon: a.lon + frac, az: a.az + (b.az - a.az) * frac }.lon);
    }
  }
  if (crossings.length !== 2) throw new Error('上升点计算失败(极端纬度)');
  // 上升 = 东侧地平交点(方位 0-180,北 0 东 90)
  const east = crossings.find((lon) => {
    const { azimuth } = eclipticPointHorizon(norm360(lon), time, observer);
    return azimuth > 0 && azimuth < 180;
  });
  if (east === undefined) throw new Error('上升点计算失败(极端纬度)');
  return norm360(east);
}

/** 天顶:本地恒星时(赤经)沿黄道的映射点 */
function findMidheaven(time: Astronomy.AstroTime, lon: number): number {
  const gast = Astronomy.SiderealTime(time); // 格林尼治视恒星时(小时)
  const ramc = norm360((gast + lon / 15) * 15); // 本地恒星时 → 赤经(度)
  const jd = time.ut;
  const centuries = (jd - 2451545.0) / 36525.0;
  const eps = 23.4392911 - 0.0130042 * centuries; // 平黄赤交角(度)
  return norm360(
    (Math.atan2(Math.sin((ramc * Math.PI) / 180), Math.cos((ramc * Math.PI) / 180) * Math.cos((eps * Math.PI) / 180)) * 180) / Math.PI,
  );
}

export function buildAstro(profile: Pick<BaziProfile, 'date' | 'time' | 'place' | 'lat' | 'lon'>): AstroChart {
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
    const lon = norm360(eclipticLon(b.key, time));
    const lonNext = norm360(eclipticLon(b.key, next));
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

  const chart: AstroChart = { bodies, aspects };
  if (profile.lat !== undefined && profile.lon !== undefined) {
    const observer = new Astronomy.Observer(profile.lat, profile.lon, 0);
    const asc = findAscendant(time, observer);
    const mc = findMidheaven(time, profile.lon);
    const ascSign = Math.floor(asc / 30);
    for (const body of bodies) {
      body.house = ((Math.floor(body.lon / 30) - ascSign + 12) % 12) + 1;
    }
    chart.asc = asc;
    chart.mc = mc;
    chart.place = { name: profile.place, lat: profile.lat, lon: profile.lon };
  }
  return chart;
}
