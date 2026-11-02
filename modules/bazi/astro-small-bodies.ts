import data from './data/small-bodies.json';
import type { AstroBody } from './astro';

const GLYPHS: Record<string, string> = { Chiron: '⚷', Ceres: '⚳', Pallas: '⚴', Juno: '⚵', Vesta: '⚶' };
const norm = (value: number) => (value % 360 + 360) % 360;

/** Eight-point interpolation on the bundled TT grid; unwrap before interpolation. */
export function smallBodyLongitude(key: string, jdTT: number): number {
  const values = data.bodies.find(body => body.key === key)!.longitude;
  const x = (jdTT - data.startJd) / data.stepDays;
  if (!Number.isFinite(x) || x < 0 || x > values.length - 1) throw new Error('小天体星历超出内置范围');
  const start = Math.max(0, Math.min(Math.floor(x) - 3, values.length - 8));
  const anchor = values[start];
  let longitude = 0;
  for (let i = 0; i < 8; i++) {
    let weight = 1;
    for (let j = 0; j < 8; j++) if (j !== i) weight *= (x - start - j) / (i - j);
    longitude += weight * (anchor + norm(values[start + i] - anchor + 180) - 180);
  }
  return norm(longitude);
}

export function smallBodies(ttDays: number): AstroBody[] {
  const jd = ttDays + 2451545;
  return data.bodies.map(({ key, name }) => ({
    key, name, glyph: GLYPHS[key], kind: 'minor',
    lon: smallBodyLongitude(key, jd),
    retro: norm(smallBodyLongitude(key, jd + 0.01) - smallBodyLongitude(key, jd - 0.01) + 180) - 180 < 0,
    basis: 'JPL 地心视位置',
  }));
}
