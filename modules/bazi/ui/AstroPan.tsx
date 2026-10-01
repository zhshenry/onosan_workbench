import type { ReactNode } from 'react';
import type { AstroChart } from '../astro';
import type { BaziProfile } from '../../../shared/bazi-contracts';

const CX = 260;
const SIGN_GLYPHS = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'];

/** 黄道经度 → 盘面坐标(0° 白羊在 9 点方向,逆时针) */
function polar(r: number, lon: number): [number, number] {
  const a = ((180 + lon) * Math.PI) / 180;
  return [CX + r * Math.cos(a), CX - r * Math.sin(a)];
}

function Wheel({ chart }: { chart: AstroChart }) {
  const rings: ReactNode[] = [];
  for (let i = 0; i < 12; i++) {
    const a0 = i * 30;
    const a1 = a0 + 30;
    const [x0, y0] = polar(244, a0);
    const [x1, y1] = polar(244, a1);
    const [x2, y2] = polar(206, a1);
    const [x3, y3] = polar(206, a0);
    rings.push(
      <path
        key={i}
        d={`M${x0} ${y0} A244 244 0 0 0 ${x1} ${y1} L${x2} ${y2} A206 206 0 0 1 ${x3} ${y3} Z`}
        fill={i % 2 ? 'var(--bazi-pan-sector-b)' : 'var(--bazi-pan-sector-a)'}
        stroke="var(--bazi-pan-line)"
        strokeWidth={1}
      />,
    );
    const [gx, gy] = polar(225, a0 + 15);
    rings.push(
      <text key={`g${i}`} x={gx} y={gy + 5} textAnchor="middle" fontSize={15} fill="var(--bazi-pan-ink-2)">
        {SIGN_GLYPHS[i]}
      </text>,
    );
  }
  chart.bodies.forEach((b, i) => {
    const tier = i % 2 === 0 ? 150 : 131;
    const [x, y] = polar(tier, b.lon);
    const deg = Math.floor(b.lon % 30);
    rings.push(
      <text key={`p${b.key}`} x={x} y={y + 6} textAnchor="middle" fontSize={17} fontWeight={600} fill="var(--bazi-pan-ink)">
        {b.glyph}
      </text>,
      <text key={`pd${b.key}`} x={x} y={y + 20} textAnchor="middle" fontSize={10} fill="var(--bazi-pan-ink-3)">
        {deg}°{b.retro ? '℞' : ''}
      </text>,
    );
    const [lx, ly] = polar(120, b.lon);
    const [px, py] = polar(tier - 9, b.lon);
    rings.push(
      <circle key={`c${b.key}`} cx={lx} cy={ly} r={1.6} fill="var(--bazi-pan-marker)" />,
      <line key={`l${b.key}`} x1={lx} y1={ly} x2={px} y2={py} stroke="var(--bazi-pan-line)" />,
    );
  });
  chart.aspects.forEach((a, i) => {
    const ba = chart.bodies.find((b) => b.name === a.a);
    const bb = chart.bodies.find((b) => b.name === a.b);
    if (!ba || !bb) return;
    const [x1, y1] = polar(120, ba.lon);
    const [x2, y2] = polar(120, bb.lon);
    rings.push(
      <line
        key={`a${i}`}
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={a.harmonious ? 'var(--bazi-pan-marker)' : 'var(--bazi-hua-ji)'}
        strokeOpacity={0.55}
        strokeWidth={1.3}
      />,
    );
  });
  rings.push(<circle key="inner" cx={CX} cy={CX} r={120} fill="none" stroke="var(--bazi-pan-line)" />);
  return (
    <div className="bazi-as-wrap">
      <svg width={500} height={500} viewBox="0 0 520 520" role="img" aria-label="出生星盘(行星落座)">
        {rings}
      </svg>
    </div>
  );
}

export function AstroPan({ profile, chart }: { profile: BaziProfile; chart: AstroChart }) {
  return (
    <div className="bazi-pan">
      <span className="bazi-pan-tag">出生星盘</span>
      <div className="bazi-pan-head">
        <div className="bazi-pan-who">
          <b>{profile.name}{profile.tag && <span className="bazi-ptag">{profile.tag}</span>}</b>
          <div className="bazi-pan-meta">
            公历 {profile.date} {profile.time} · {profile.gender === 1 ? '男' : '女'} · 回归制
          </div>
          <div className="bazi-pan-meta">所填出生时间按东八区（UTC+8）换算</div>
        </div>
      </div>
      <Wheel chart={chart} />
      <div className="bazi-as-legend">
        <span><i style={{ background: 'var(--bazi-pan-marker)' }} />合 / 六分 / 三分</span>
        <span><i style={{ background: 'var(--bazi-hua-ji)' }} />刑 / 冲</span>
        <span>℞ 逆行</span>
      </div>
      <div className="bazi-as-phrow">
        {chart.aspects.length ? chart.aspects.map((a, i) => (
          <span key={i} className="bazi-as-phchip">
            <i style={{ background: a.harmonious ? 'var(--bazi-pan-marker)' : 'var(--bazi-hua-ji)' }} />
            {a.a} – {a.b} · {a.type} {a.orb}°
          </span>
        )) : <span className="bazi-as-none">主要相位区间内无显著相位。</span>}
      </div>
    </div>
  );
}
