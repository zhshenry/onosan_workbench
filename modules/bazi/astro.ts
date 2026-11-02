/**
 * 西洋占星计算:astronomy-engine 的唯一引用点(纯计算,渲染层直接调用)。
 * 行星黄道经度(回归制)为真算;提供出生地经纬度时计算上升/天顶,默认 Placidus,可选整宫制,
 * 否则无宫位数据。出生钟表时间按命例时区换算；旧命例保持固定 UTC+8。
 */
import * as Astronomy from 'astronomy-engine';
import type { AstroHouseSystem, BaziProfile } from '../../shared/bazi-contracts';
import { resolveAstroTime, type AstroBirthTime } from '../../shared/astro-time';
import { smallBodies } from './astro-small-bodies';

export const ASTRO_HOUSE_LABELS: Record<AstroHouseSystem, string> = { placidus: '普拉西德制', 'whole-sign': '整宫制' };

export interface AstroBody {
  key: string;
  glyph: string;
  name: string;
  kind: 'planet' | 'minor' | 'point';
  /** 黄道经度(度,0=白羊 0°) */
  lon: number;
  retro?: boolean;
  /** 扩展对象的计算口径;福点不标顺逆行。 */
  basis?: string;
  /** 按所选宫制及黄经所属区间分配(1-12);无可用宫头时缺省 */
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
  birthTime: AstroBirthTime;
  bodies: AstroBody[];
  aspects: AstroAspect[];
  houseSystem: AstroHouseSystem;
  /** 第一宫至第十二宫宫头的回归黄经 */
  houseCusps?: number[];
  houseWarning?: string;
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

/** Meeus, Astronomical Algorithms ch. 47: mean lunar elements, TT centuries. */
function lunarPoints(time: Astronomy.AstroTime): AstroBody[] {
  const t = time.tt / 36525;
  const node = norm360(125.0445479 - 1934.1362891 * t + 0.0020754 * t ** 2 + t ** 3 / 467441 - t ** 4 / 60616000);
  const perigee = norm360(83.3532465 + 4069.0137287 * t - 0.01032 * t ** 2 - t ** 3 / 80053 + t ** 4 / 18999000);
  // Project the mean lunar orbit (inclination 5.1453964°) onto the ecliptic.
  const argument = (perigee + 180 - node) * Math.PI / 180;
  const apogee = node + Math.atan2(Math.sin(argument) * Math.cos(5.1453964 * Math.PI / 180), Math.cos(argument)) * 180 / Math.PI;
  const nutation = Astronomy.e_tilt(time).dpsi / 3600;
  return [
    { key: 'NorthNode', name: '北交点', glyph: '☊', kind: 'point', lon: norm360(node + nutation), retro: true, basis: '平均交点' },
    { key: 'SouthNode', name: '南交点', glyph: '☋', kind: 'point', lon: norm360(node + nutation + 180), retro: true, basis: '平均交点' },
    { key: 'Lilith', name: '莉莉丝', glyph: '⚸', kind: 'point', lon: norm360(apogee + nutation), retro: false, basis: '平均月球远地点' },
  ];
}

function buildAspects(bodies: AstroBody[]): AstroAspect[] {
  const aspects: AstroAspect[] = [];
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i], b = bodies[j];
      if (a.kind === 'point' && b.kind === 'point') continue;
      const diff = Math.abs(norm360(a.lon - b.lon + 180) - 180);
      for (const asp of ASPECTS) {
        const orb = Math.abs(diff - asp.angle);
        const limit = a.kind === 'planet' && b.kind === 'planet' ? asp.orb : Math.min(3, asp.orb);
        if (orb <= limit) {
          aspects.push({ a: a.name, b: b.name, type: asp.type, orb: Math.round(orb * 100) / 100, harmonious: asp.harmonious });
          break;
        }
      }
    }
  }
  return aspects.sort((x, y) => x.orb - y.orb);
}

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
  const vecEQD = Astronomy.RotateVector(Astronomy.Rotation_ECT_EQD(time), vecECL);
  const equ = Astronomy.EquatorFromVector(vecEQD);
  return Astronomy.Horizon(time, observer, equ.ra, equ.dec, '');
}

/** 数值求上升点:日期真黄道上高度过零且位于东半天的点,二分精化。 */
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
      let low = a.lon;
      let high = a.lon + 1;
      for (let step = 0; step < 32; step++) {
        const mid = (low + high) / 2;
        const { altitude } = eclipticPointHorizon(mid, time, observer);
        if ((altitude < 0) === (a.alt < 0)) low = mid;
        else high = mid;
      }
      crossings.push((low + high) / 2);
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
  const eps = Astronomy.e_tilt(time).tobl; // 日期真黄赤交角,与行星/上升点使用同一参考系
  return norm360(
    (Math.atan2(Math.sin((ramc * Math.PI) / 180), Math.cos((ramc * Math.PI) / 180) * Math.cos((eps * Math.PI) / 180)) * 180) / Math.PI,
  );
}

/** Placidus: 按黄道点的昼/夜半弧三等分求宫头,再利用对宫相差 180°。 */
function placidusCusps(time: Astronomy.AstroTime, lat: number, lon: number, asc: number, mc: number): number[] {
  const rad = Math.PI / 180;
  const eps = Astronomy.e_tilt(time).tobl * rad;
  const ramc = norm360(Astronomy.SiderealTime(time) * 15 + lon);
  const cusp = (base: number, fraction: number): number => {
    let low = mc;
    let high = mc + 180;
    for (let step = 0; step < 48; step++) {
      const longitude = (low + high) / 2;
      const ra = norm360(Math.atan2(Math.sin(longitude * rad) * Math.cos(eps), Math.cos(longitude * rad)) / rad);
      const dec = Math.asin(Math.sin(longitude * rad) * Math.sin(eps));
      const semiDay = Math.acos(-Math.tan(lat * rad) * Math.tan(dec)) / rad;
      if (norm360(ra - ramc) > base + fraction * semiDay) high = longitude;
      else low = longitude;
    }
    return norm360((low + high) / 2);
  };
  const h11 = cusp(0, 1 / 3);
  const h12 = cusp(0, 2 / 3);
  const h2 = cusp(60, 2 / 3);
  const h3 = cusp(120, 1 / 3);
  return [asc, h2, h3, norm360(mc + 180), norm360(h11 + 180), norm360(h12 + 180),
    norm360(asc + 180), norm360(h2 + 180), norm360(h3 + 180), mc, h11, h12];
}

/** 按黄道投影判定宫位;宫头本身属于新的一宫,含跨 0° 区间。 */
export function houseOfLongitude(lon: number, cusps: number[]): number {
  const offset = norm360(lon - cusps[0]);
  for (let index = 11; index > 0; index--) {
    if (offset >= norm360(cusps[index] - cusps[0])) return index + 1;
  }
  return 1;
}

export function buildAstro(profile: Pick<BaziProfile, 'date' | 'time' | 'place' | 'lat' | 'lon' | 'astroHouseSystem' | 'astroTimeZone' | 'astroTimeChoice'>): AstroChart {
  const year = Number(profile.date.slice(0, 4));
  if (!Number.isInteger(year) || year < 1700 || year > 2200) {
    throw new Error('年份超出星历可算范围');
  }
  const resolved = resolveAstroTime(profile);
  if (resolved.status !== 'ready') throw new Error(resolved.message);
  const utc = resolved.value.epochMs;
  const time = Astronomy.MakeTime(new Date(utc));
  const next = Astronomy.MakeTime(new Date(utc + 86400000));

  const bodies: AstroBody[] = BODIES.map((b) => {
    const lon = norm360(eclipticLon(b.key, time));
    const lonNext = norm360(eclipticLon(b.key, next));
    let delta = lonNext - lon;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    return { ...b, kind: 'planet', lon, retro: delta < 0 };
  });
  bodies.push(...lunarPoints(time), ...smallBodies(time.tt));

  const houseSystem = profile.astroHouseSystem ?? 'placidus';
  const chart: AstroChart = { birthTime: resolved.value, bodies, aspects: buildAspects(bodies), houseSystem };
  if (profile.lat !== undefined && profile.lon !== undefined) {
    chart.place = { name: profile.place, lat: profile.lat, lon: profile.lon };
    if (Math.abs(profile.lat) === 90) {
      chart.houseWarning = '出生地位于极点,无法确定上升点与宫位。';
      return chart;
    }
    const observer = new Astronomy.Observer(profile.lat, profile.lon, 0);
    const asc = findAscendant(time, observer);
    const mc = findMidheaven(time, profile.lon);
    chart.asc = asc;
    chart.mc = mc;
    const sun = Astronomy.Equator(Astronomy.Body.Sun, time, observer, true, true);
    const day = Astronomy.Horizon(time, observer, sun.ra, sun.dec, '').altitude >= 0;
    const sunLon = bodies.find(body => body.key === 'Sun')!.lon;
    const moonLon = bodies.find(body => body.key === 'Moon')!.lon;
    bodies.push({ key: 'Fortune', name: '福点', glyph: '⊗', kind: 'point',
      lon: norm360(asc + (day ? moonLon - sunLon : sunLon - moonLon)), basis: day ? '昼盘公式' : '夜盘公式' });
    chart.aspects = buildAspects(bodies);
    if (houseSystem === 'placidus' && Math.abs(profile.lat) >= 90 - Astronomy.e_tilt(time).tobl) {
      chart.houseWarning = '该纬度无法使用普拉西德制分宫,可切换为整宫制。';
      return chart;
    }
    chart.houseCusps = houseSystem === 'whole-sign'
      ? Array.from({ length: 12 }, (_, index) => norm360(Math.floor(asc / 30) * 30 + index * 30))
      : placidusCusps(time, profile.lat, profile.lon, asc, mc);
    for (const body of bodies) body.house = houseOfLongitude(body.lon, chart.houseCusps);
  }
  return chart;
}
