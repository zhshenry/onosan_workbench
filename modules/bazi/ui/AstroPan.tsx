import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Question } from '@phosphor-icons/react';
import { ASTRO_HOUSE_LABELS, houseOfLongitude, type AstroChart } from '../astro';
import type { AstroHouseSystem, BaziProfile } from '../../../shared/bazi-contracts';
import { Select } from '../../../src/ui/controls';
import { degreeLabel, PLANETS, SIGN_NAMES, type AstroSelection } from './astro-insights';
import { astroTimeZoneLabel, astroUtcLabel } from '../../../shared/astro-time';
export { AstroDetails, AstroSummary } from './AstroDetails';

const CX = 300;
const SIGN_GLYPHS = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'];
const ELEMENTS = ['fire', 'earth', 'air', 'water'];

/** 相对黄道经度 → 盘面坐标;有出生地时上升点置于 9 点方向。 */
function polar(r: number, lon: number): [number, number] {
  const a = ((180 + lon) * Math.PI) / 180;
  return [CX + r * Math.cos(a), CX - r * Math.sin(a)];
}

/** 只避让发生碰撞的标签;限制在本宫内,拥挤处向内分层,不整体平移孤立星体。 */
function planetLabels(chart: AstroChart) {
  const sorted = [...chart.bodies].sort((a, b) => a.lon - b.lon);
  if (!sorted.length) return [];
  const gaps = sorted.map((body, i) => (sorted[(i + 1) % sorted.length].lon - body.lon + 360) % 360);
  const start = (gaps.indexOf(Math.max(...gaps)) + 1) % sorted.length;
  const ordered = [...sorted.slice(start), ...sorted.slice(0, start)];
  const placed: [number, number][] = [];
  return ordered.map(body => {
    const candidates = [204, 170, 136, 102, 68].flatMap(radius =>
      [0, 2, -2, 4, -4, 6, -6, 8, -8, 10, -10, 12, -12].map(offset => ({
        radius, labelLon: body.lon + offset, cost: 204 - radius + Math.abs(offset) * 4,
      })),
    ).filter(candidate => !chart.houseCusps || houseOfLongitude(candidate.labelLon, chart.houseCusps) === body.house)
      .sort((a, b) => a.cost - b.cost);
    const position = (candidate: typeof candidates[number]) => polar(candidate.radius, candidate.labelLon - (chart.asc ?? 0));
    const selected = candidates.find(candidate => {
      const [x, y] = position(candidate);
      return placed.every(([px, py]) => Math.abs(x - px) >= 50 || Math.abs(y - py) >= 34);
    }) ?? candidates[candidates.length - 1];
    placed.push(position(selected));
    return { body, ...selected };
  });
}

interface WheelInteraction {
  selection?: AstroSelection;
  onSelect?(selection: AstroSelection): void;
  visibleAspects?: number[];
}

function Wheel({ chart, selection = null, onSelect, visibleAspects }: { chart: AstroChart } & WheelInteraction) {
  const rings: ReactNode[] = [];
  const point = (r: number, lon: number) => polar(r, lon - (chart.asc ?? 0));
  const selectedAspect = selection?.kind === 'aspect' ? chart.aspects[selection.index] : null;
  const relatedBodies = chart.bodies.filter(body => selection?.kind === 'body' ? body.key === selection.key
    : selection?.kind === 'house' ? body.house === selection.number
      : selectedAspect ? selectedAspect.a === body.name || selectedAspect.b === body.name : false).map(body => body.name);
  const activate = (next: NonNullable<AstroSelection>, pressed: boolean, label: string) => ({
    role: 'button', tabIndex: 0, 'aria-label': label, 'aria-pressed': pressed,
    onClick: () => onSelect?.(next),
    onKeyDown: (event: React.KeyboardEvent<SVGGElement>) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect?.(next); }
    },
  });
  rings.push(
    <circle key="surface" cx={CX} cy={CX} r={294} className="bazi-as-surface" />,
    <circle key="houses" cx={CX} cy={CX} r={239} className="bazi-as-house-ring" />,
  );
  for (let i = 0; i < 12; i++) {
    const a0 = i * 30;
    const a1 = a0 + 30;
    const [x0, y0] = point(292, a0);
    const [x1, y1] = point(292, a1);
    const [x2, y2] = point(260, a1);
    const [x3, y3] = point(260, a0);
    rings.push(
      <path
        key={i}
        d={`M${x0} ${y0} A292 292 0 0 0 ${x1} ${y1} L${x2} ${y2} A260 260 0 0 1 ${x3} ${y3} Z`}
        className="bazi-as-sector"
      />,
    );
    const [gx, gy] = point(276, a0 + 15);
    const [sx, sy] = point(260, a0);
    rings.push(
      <line key={`s${i}`} x1={x0} y1={y0} x2={sx} y2={sy} className="bazi-as-grid" />,
      <g key={`g${i}`} data-tone={ELEMENTS[i % 4]} className="bazi-as-sign">
        <text x={gx} y={gy - 3} textAnchor="middle" fontSize={12}>{SIGN_NAMES[i]}</text>
        <text x={gx} y={gy + 13} textAnchor="middle" fontSize={16} className="bazi-as-glyph">{SIGN_GLYPHS[i]}</text>
      </g>,
    );
  }
  for (let degree = 0; degree < 360; degree++) {
    const [x1, y1] = point(259, degree);
    const [x2, y2] = point(degree % 10 === 0 ? 249 : degree % 5 === 0 ? 252 : 255, degree);
    rings.push(<line key={`tick${degree}`} x1={x1} y1={y1} x2={x2} y2={y2} className="bazi-as-tick" />);
  }
  // 宫界、宫序与右侧落宫使用同一组宫头;星座外圈仍为十二个 30° 扇区。
  chart.houseCusps?.forEach((cusp, index, cusps) => {
    const span = (cusps[(index + 1) % 12] - cusp + 360) % 360;
    const [sx, sy] = point(260, cusp);
    const [hx, hy] = point(239, cusp + span / 2);
    const [x0, y0] = point(253, cusp), [x1, y1] = point(253, cusp + span);
    const [x2, y2] = point(225, cusp + span), [x3, y3] = point(225, cusp);
    const selected = selection?.kind === 'house' && selection.number === index + 1;
    rings.push(
      <line key={`house-spoke${index}`} x1={CX} y1={CX} x2={sx} y2={sy} className="bazi-as-house-spoke" />,
      <g key={`h${index}`} className="bazi-as-house-target" data-house={index + 1}
        {...activate({ kind: 'house', number: index + 1 }, selected, `第${index + 1}宫`)}>
        <path d={`M${x0} ${y0} A253 253 0 ${span > 180 ? 1 : 0} 0 ${x1} ${y1} L${x2} ${y2} A225 225 0 ${span > 180 ? 1 : 0} 1 ${x3} ${y3} Z`} />
        <text x={hx} y={hy + 4} textAnchor="middle" fontSize={12} className="bazi-as-house">{index + 1}</text>
      </g>,
    );
  });
  // 相位连线连接真实位置,不跟随防重叠标签偏移。
  chart.aspects.forEach((aspect, i) => {
    if (visibleAspects && !visibleAspects.includes(i)) return;
    const a = chart.bodies.find(body => body.name === aspect.a);
    const b = chart.bodies.find(body => body.name === aspect.b);
    if (!a || !b) return;
    const [x1, y1] = point(172, a.lon);
    const [x2, y2] = point(172, b.lon);
    const selected = selection?.kind === 'aspect' && selection.index === i;
    const related = !selection || selected || (selection.kind !== 'aspect' && (relatedBodies.includes(a.name) || relatedBodies.includes(b.name)));
    rings.push(
      <g key={`aspect${i}`} className={`bazi-as-aspect-target${related ? '' : ' is-dimmed'}`} data-aspect={i}
        {...activate({ kind: 'aspect', index: i }, selected, `${aspect.a}与${aspect.b} ${aspect.type}相 容许度${aspect.orb}度`)}>
        <line x1={x1} y1={y1} x2={x2} y2={y2} className="bazi-as-aspect-hit" />
        <line x1={x1} y1={y1} x2={x2} y2={y2} className={`bazi-as-aspect ${aspect.harmonious ? 'easy' : 'hard'}`} />
      </g>,
    );
  });
  planetLabels(chart).forEach(({ body, labelLon, radius }) => {
    const [x, y] = point(radius, labelLon);
    const [px, py] = point(radius - 14, labelLon);
    const [lx, ly] = point(172, body.lon);
    const selected = selection?.kind === 'body' && selection.key === body.key;
    const related = !selection || relatedBodies.includes(body.name);
    rings.push(
      <g key={body.key} className={`bazi-as-body${related ? '' : ' is-muted'}`} data-body={body.key} data-tone={PLANETS[body.key].tone}
        {...activate({ kind: 'body', key: body.key }, selected, `${body.name} ${SIGN_NAMES[Math.floor(body.lon / 30)]}${body.house ? ` 第${body.house}宫` : ''}`)}>
        <title>{`${body.glyph} ${body.name} · ${SIGN_NAMES[Math.floor(body.lon / 30)]} ${degreeLabel(body.lon)}${body.house ? ` · ${body.house}宫` : ''}${body.retro ? ' · 逆行' : ''}`}</title>
        <line x1={lx} y1={ly} x2={px} y2={py} className="bazi-as-leader" />
        <circle cx={lx} cy={ly} r={2.5} />
        <circle cx={lx} cy={ly} r={11} className="bazi-as-body-halo" />
        <rect x={x - 25} y={y - 19} width={50} height={36} rx={8} className="bazi-as-body-hit" />
        <text x={x} y={y - 3} textAnchor="middle" fontSize={16} fontWeight={600} className="bazi-as-planet-label">
          {PLANETS[body.key].label}
        </text>
        <text x={x} y={y + 12} textAnchor="middle" fontSize={10} className="bazi-as-degree">{degreeLabel(body.lon)}{body.retro ? '℞' : ''}</text>
      </g>,
    );
  });
  if (chart.asc !== undefined && chart.mc !== undefined) {
    for (const [angle, label] of [[chart.asc, 'ASC'], [chart.mc, 'MC']] as const) {
      const [ax1, ay1] = point(260, angle + 180);
      const [ax2, ay2] = point(260, angle);
      const [tx, ty] = point(228, angle);
      rings.push(
        <line key={`ax${label}`} x1={ax1} y1={ay1} x2={ax2} y2={ay2}
          className="bazi-as-axis" />,
        <text key={`axl${label}`} x={tx} y={ty - 3} textAnchor="middle" fontSize={10} fontWeight={700} className="bazi-as-axis-label">{label}</text>,
      );
    }
  }
  return (
    <div className="bazi-as-wrap">
      <svg width={680} height={680} viewBox="0 0 600 600" role="group" aria-label="出生星盘(行星落座)">
        <desc>{`回归黄道星盘。行星连线表示主要相位。${chart.houseWarning ?? (chart.asc === undefined ? '尚未填写出生地，不显示宫位与上升点。' : `宫位采用 ${ASTRO_HOUSE_LABELS[chart.houseSystem]}，ASC 为上升点，MC 为天顶。`)}`}</desc>
        {rings}
      </svg>
    </div>
  );
}

export function AstroPan({ profile, chart, onHouseSystemChange, houseSystemSaving = false, ...interaction }: {
  profile: BaziProfile; chart: AstroChart;
  onHouseSystemChange(system: AstroHouseSystem): void;
  houseSystemSaving?: boolean;
} & WheelInteraction) {
  const helpId = useId();
  const help = useRef<HTMLDivElement>(null), helpButton = useRef<HTMLButtonElement>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  useLayoutEffect(() => {
    if (!helpOpen || !help.current || !helpButton.current) return;
    const panel = help.current, button = helpButton.current;
    const anchor = button.getBoundingClientRect();
    const card = button.closest('.bazi-as-pan')!.getBoundingClientRect();
    panel.style.width = `${Math.min(340, card.width - 32, window.innerWidth - 24)}px`;
    panel.style.left = `${Math.max(12, card.left + 16, anchor.right - panel.offsetWidth)}px`;
    const below = anchor.bottom + 8;
    const top = below + panel.offsetHeight <= window.innerHeight - 12 ? below : anchor.top - panel.offsetHeight - 8;
    panel.style.top = `${Math.max(12, top)}px`;
    panel.focus({ preventScroll: true });
    const dismiss = () => panel.hidePopover();
    const onScroll = (event: Event) => { if (event.target !== panel) dismiss(); };
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [helpOpen]);
  return (
    <div className="bazi-pan bazi-as-pan">
      <div className="bazi-pan-head">
        <div className="bazi-pan-who">
          <b>{profile.name}{profile.tag && <span className="bazi-ptag">{profile.tag}</span>}</b>
          <div className="bazi-pan-meta">
            公历 {profile.date} {profile.time} · {profile.gender === 1 ? '男' : '女'}{profile.place && ` · ${profile.place}`}（UTC{chart.birthTime.offset}）
          </div>
          <div className="bazi-pan-meta" title={astroUtcLabel(chart.birthTime.utc)}>
            {astroTimeZoneLabel(chart.birthTime.timeZone)}{chart.birthTime.legacy ? ' · 旧命例沿用' : ''}
            {chart.birthTime.choice ? ` · ${chart.birthTime.choice === 'earlier' ? '第一次' : '第二次'}出现` : ''}
          </div>
          {chart.asc === undefined && <div className="bazi-pan-meta">{chart.houseWarning ?? '未填出生地,宫位暂缺'}</div>}
        </div>
        <div className="bazi-as-head-tools">
          <div className="bazi-as-controls">
            <span className="bazi-pan-tag">回归制</span>
            <Select aria-label="占星宫制" value={chart.houseSystem} disabled={houseSystemSaving}
              onChange={value => onHouseSystemChange(value as AstroHouseSystem)}
              options={Object.entries(ASTRO_HOUSE_LABELS).map(([value, label]) => ({ value, label }))} />
            <button ref={helpButton} type="button" className="bazi-as-help-button" aria-label="宫制说明"
              aria-haspopup="dialog" aria-expanded={helpOpen} aria-controls={helpId} popoverTarget={helpId}>
              <Question size={18} aria-hidden="true" />
            </button>
            <div ref={help} id={helpId} className="bazi-as-help" popover="auto" role="dialog" tabIndex={-1}
              aria-labelledby={`${helpId}-title`} onToggle={event => setHelpOpen(event.newState === 'open')}>
              <strong id={`${helpId}-title`}>宫制是什么？</strong>
              <p>把星盘划分为 12 个宫位的方法。</p>
              <dl>
                <dt>普拉西德制（Placidus）<span>默认</span></dt>
                <dd>根据出生时间和地点划分宫位，各宫大小通常不同。</dd>
                <dt>整宫制</dt>
                <dd>上升星座所在的整个星座为第 1 宫，之后一个星座对应一宫，每宫 30°。</dd>
              </dl>
              <p className="bazi-as-help-note">切换宫制会改变宫位边界，因此同一颗行星可能落在不同宫位；它的星座和实际位置不会改变。</p>
            </div>
          </div>
          <div className="bazi-as-interaction-hint">点击星体或宫位查看详情 · 再次点击取消选择</div>
        </div>
      </div>
      {chart.houseWarning && <div className="bazi-as-warning" role="status">{chart.houseWarning}</div>}
      <Wheel chart={chart} {...interaction} />
      <div className="bazi-as-legend">
        <span><i className="easy" />合 / 六分 / 三分</span>
        <span><i className="hard" />刑 / 冲</span>
        <span>℞ 逆行</span>
      </div>
    </div>
  );
}
