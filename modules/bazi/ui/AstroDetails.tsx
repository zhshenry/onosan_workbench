import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { CaretRight } from '@phosphor-icons/react';
import type { AstroChart } from '../astro';
import { Segmented, Select } from '../../../src/ui/controls';
import {
  ASPECT_MEANINGS, BODY_EXPRESSIONS, BODY_MEANINGS, DEFAULT_ASPECT_FILTER, EXTENDED_BODY_NOTES, HOUSE_TOPICS, PLANETS, SIGN_MEANINGS, SIGN_NAMES, SIGN_STYLES,
  chartDistribution, degreeLabel, houseRows, matchingAspect,
  type AstroAspectFilter, type AstroSection, type AstroSelection,
} from './astro-insights';

export function AstroSummary({ chart }: { chart: AstroChart }) {
  const id = useId(), panel = useRef<HTMLDivElement>(null), button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const distribution = chartDistribution(chart);
  useLayoutEffect(() => {
    if (!open || !panel.current || !button.current) return;
    const popup = panel.current, anchor = button.current.getBoundingClientRect();
    popup.style.width = `${Math.min(320, window.innerWidth - 24)}px`;
    popup.style.left = `${Math.max(12, Math.min(anchor.right - popup.offsetWidth, window.innerWidth - popup.offsetWidth - 12))}px`;
    popup.style.top = `${Math.max(12, Math.min(anchor.bottom + 8, window.innerHeight - popup.offsetHeight - 12))}px`;
    popup.focus({ preventScroll: true });
    const dismiss = () => popup.hidePopover();
    const onScroll = (event: Event) => { if (event.target !== popup) dismiss(); };
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', onScroll, true);
    return () => { window.removeEventListener('resize', dismiss); window.removeEventListener('scroll', onScroll, true); };
  }, [open]);
  return <div className="bazi-as-summary" aria-label="星盘概览">
    {['Sun', 'Moon'].map(key => {
      const body = chart.bodies.find(item => item.key === key)!;
      return <span key={key}><i className="bazi-as-glyph" data-tone={PLANETS[key].tone}>{body.glyph}</i>{body.name}<b>{SIGN_NAMES[Math.floor(body.lon / 30)]}</b></span>;
    })}
    <span><i className="bazi-as-asc-label">ASC</i>上升<b>{chart.asc === undefined ? '待补地点' : SIGN_NAMES[Math.floor(chart.asc / 30)]}</b></span>
    <button ref={button} className="bazi-as-text-button" popoverTarget={id} aria-expanded={open} aria-haspopup="dialog" aria-controls={id}>
      分布概览<CaretRight size={14} aria-hidden="true" />
    </button>
    <div ref={panel} id={id} className="bazi-as-help bazi-as-distribution" popover="auto" role="dialog" tabIndex={-1}
      aria-labelledby={`${id}-title`} onToggle={event => setOpen(event.newState === 'open')}>
      <strong id={`${id}-title`}>元素与模式分布</strong>
      <p>十颗主要星体的星座分布</p>
      <div className="bazi-as-distribution-bars" aria-label="元素分布">
        {['火', '土', '风', '水'].map((label, i) => <div key={label} data-tone={['fire', 'earth', 'air', 'water'][i]}>
          <span>{label}象</span><span className="bazi-as-meter"><i style={{ width: `${distribution.elements[i] / distribution.total * 100}%` }} /></span><b>{distribution.elements[i]}</b>
        </div>)}
      </div>
      <div className="bazi-as-mode-counts" aria-label="模式分布">{['基本', '固定', '变动'].map((label, i) => <span key={label}>{label}<b>{distribution.modes[i]}</b></span>)}</div>
      <p className="bazi-as-help-note">每颗主要星体计 1 次，不含小天体、点位与宫头，不做加权。基本、固定、变动是星座的三种模式；数量不代表好坏。</p>
    </div>
  </div>;
}

interface DetailProps {
  chart: AstroChart;
  section: AstroSection;
  onSectionChange(section: AstroSection): void;
  selection: AstroSelection;
  onSelect(selection: AstroSelection): void;
  filter: AstroAspectFilter;
  onFilterChange(filter: AstroAspectFilter): void;
  showPoints?: boolean;
  showMinor?: boolean;
  onDisplayChange?(kind: 'point' | 'minor', show: boolean): void;
  reading?: ReactNode;
}

function SelectionDetails({ chart, selection, onSelect, detached = false }: DetailProps & { detached?: boolean }) {
  if (!selection) return null;
  if (selection.kind === 'body') {
    const body = chart.bodies.find(item => item.key === selection.key)!;
    const sign = Math.floor(body.lon / 30);
    return <section className={`bazi-as-selection${detached ? ' panel glass bazi-as-selection-capsule' : ''}`} aria-label={`${body.name}详情`}>
      <div className="bazi-as-selection-title"><h3><i className="bazi-as-glyph" data-tone={PLANETS[body.key].tone}>{body.glyph}</i>{body.name}</h3><button className="bazi-as-text-button" onClick={() => onSelect(null)}>已选中 · 取消</button></div>
      <p className="bazi-as-selection-facts">{SIGN_NAMES[sign]} · {body.house ? `第${body.house}宫` : '宫位待补'}{body.retro !== undefined && ` · ${body.retro ? '逆行' : '顺行'}`}{body.basis && ` · ${body.basis}`}</p>
      {EXTENDED_BODY_NOTES[body.key] && <p className="bazi-as-object-note">{EXTENDED_BODY_NOTES[body.key]}</p>}
      <dl className="bazi-as-meanings">
        <div><dt>{body.kind === 'point' ? '点位' : '星体'}含义 · {body.name}</dt><dd>在占星中，{body.name}常用于讨论{BODY_MEANINGS[body.key]}。</dd></div>
        <div><dt>星座含义 · {SIGN_NAMES[sign]}座</dt><dd>{SIGN_NAMES[sign]}座描述表达风格，常见关键词是{SIGN_MEANINGS[sign]}。</dd></div>
        <div><dt>宫位含义 · {body.house ? `第${body.house}宫` : '暂不可用'}</dt><dd>{body.house ? `第${body.house}宫关注${HOUSE_TOPICS[body.house - 1]}这些生活主题。` : chart.houseWarning ?? '补充出生地点后，可以查看落宫。'}</dd></div>
        <div className="bazi-as-combined"><dt>结合解读</dt><dd>以{SIGN_STYLES[sign]}的方式，{BODY_EXPRESSIONS[body.key]}。{body.house ? `这种表达可放在${HOUSE_TOPICS[body.house - 1]}的情境中理解。` : '宫位尚未确定，暂不延伸到具体生活领域。'}</dd></div>
      </dl>
    </section>;
  }
  if (selection.kind === 'house') {
    const house = houseRows(chart).find(item => item.number === selection.number);
    if (!house) return null;
    return <section className="bazi-as-selection" aria-label={`第${house.number}宫详情`}>
      <div className="bazi-as-selection-title"><h3>第{house.number}宫</h3><button className="bazi-as-text-button" onClick={() => onSelect(null)}>取消选择</button></div>
      <p className="bazi-as-selection-facts">宫头 {SIGN_NAMES[Math.floor(house.cusp / 30)]} {degreeLabel(house.cusp)}</p>
      <p>通常用于讨论{HOUSE_TOPICS[house.number - 1]}。</p>
      <dl className="bazi-as-house-facts"><dt>宫内星体与点位</dt><dd>{house.bodies.length ? house.bodies.map(body => <button key={body.key} className="bazi-as-text-button" onClick={() => onSelect({ kind: 'body', key: body.key })}>{body.name}</button>) : '当前显示范围内无星体或点位'}</dd>
        <dt>现代守护</dt><dd>{house.ruler && <button className="bazi-as-text-button" onClick={() => onSelect({ kind: 'body', key: house.ruler!.key })}>{house.ruler.name} · 第{house.ruler.house}宫</button>}</dd></dl>
      <p className="bazi-as-reading-note">列表跟随显示开关；空宫不代表该主题缺失。</p>
    </section>;
  }
  const aspect = chart.aspects[selection.index];
  if (!aspect) return null;
  const meaning = ASPECT_MEANINGS[aspect.type];
  return <section className="bazi-as-selection" aria-label="相位详情">
    <div className="bazi-as-selection-title"><h3>{aspect.a} — {aspect.b}</h3><button className="bazi-as-text-button" onClick={() => onSelect(null)}>取消选择</button></div>
    <p className="bazi-as-selection-facts">{aspect.type}相 · 标准夹角 {meaning.angle}° · 容许度 {aspect.orb.toFixed(2)}°</p>
    <p>{meaning.text}</p><p className="bazi-as-reading-note">容许度是与标准角度的差距，越小越接近。盘面高亮这两个对象的连线。</p>
  </section>;
}

export function AstroDetails(props: DetailProps) {
  const { chart, section, onSectionChange, selection, onSelect, filter, onFilterChange } = props;
  const houses = houseRows(chart);
  const missingHouses = chart.houseWarning ?? '编辑命例选择出生地后可显示宫位。';
  const aspects = chart.aspects.map((aspect, index) => ({ ...aspect, index })).filter(aspect => matchingAspect(aspect, filter));
  const bodyRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = 0; }, [section]);
  const selected = (kind: NonNullable<AstroSelection>['kind'], value: string | number) =>
    selection?.kind === kind && (selection.kind === 'body' ? selection.key : selection.kind === 'house' ? selection.number : selection.index) === value;
  const detached = section === 'positions' && selection?.kind === 'body';
  return <div className="bazi-as-sidebar" data-section={section}>
    <div className="panel glass bazi-as-details">
    <Segmented value={section} onChange={value => onSectionChange(value as AstroSection)} aria-label="星盘信息" options={[
      { value: 'positions', label: '星体' }, { value: 'houses', label: '宫位' }, { value: 'aspects', label: '相位' }, { value: 'reading', label: '解读' },
    ]} />
    {section !== 'reading' && props.onDisplayChange && <div className="bazi-as-object-options" role="group" aria-label="扩展星体显示">
      <span>扩展显示</span>
      <label><input type="checkbox" checked={props.showPoints} onChange={event => props.onDisplayChange?.('point', event.target.checked)} />常用点位</label>
      <label><input type="checkbox" checked={props.showMinor} onChange={event => props.onDisplayChange?.('minor', event.target.checked)} />小天体</label>
    </div>}
    <div ref={bodyRef} className="bazi-as-detail-body">
      {section === 'positions' && <>
        <table className="bazi-astab bazi-as-position-table" aria-label="星体与点位落座">
          <colgroup><col /><col /><col /><col /><col /></colgroup>
          <thead><tr><th aria-label="符号" /><th>星体／点位</th><th>星座</th><th>度数</th><th>宫位</th></tr></thead>
          <tbody>{chart.bodies.map(body => <tr key={body.key} data-selected={selected('body', body.key)} onClick={() => onSelect({ kind: 'body', key: body.key })}>
            <td className="glyph bazi-as-glyph" data-tone={PLANETS[body.key].tone}>{body.glyph}</td>
            <td><button className="bazi-as-row-button" title={body.basis} aria-label={`查看${body.name}`} aria-pressed={selected('body', body.key)} onClick={event => { event.stopPropagation(); onSelect({ kind: 'body', key: body.key }); }}>{body.name}</button></td>
            <td>{SIGN_NAMES[Math.floor(body.lon / 30)]}</td><td>{degreeLabel(body.lon)}{body.retro && <span className="bazi-rx">℞</span>}</td><td>{body.house !== undefined ? `${body.house}宫` : '—'}</td>
          </tr>)}</tbody>
        </table>
        {!chart.houseCusps && <div className="bazi-notehint">{missingHouses}</div>}
        {props.showPoints && chart.asc === undefined && <p className="bazi-as-reading-note">福点需要出生地点与有效上升点，补充后自动显示。</p>}
        {!detached && <SelectionDetails {...props} />}
        {!selection && <p className="bazi-as-empty-selection">点击星体，查看星体、星座、宫位及组合含义。</p>}
      </>}
      {section === 'houses' && <>
        <SelectionDetails {...props} />
        {houses.length ? <>
          <table className="bazi-astab bazi-as-house-table" aria-label="十二宫位">
            <thead><tr><th>宫位</th><th>宫头</th><th>现代守护 · 落宫</th></tr></thead>
            <tbody>{houses.map(house => <tr key={house.number} data-selected={selected('house', house.number)} onClick={() => onSelect({ kind: 'house', number: house.number })}>
              <td><button className="bazi-as-row-button" aria-label={`查看第${house.number}宫`} aria-pressed={selected('house', house.number)} onClick={event => { event.stopPropagation(); onSelect({ kind: 'house', number: house.number }); }}>{house.number}宫</button></td>
              <td>{SIGN_NAMES[Math.floor(house.cusp / 30)]} {degreeLabel(house.cusp)}</td><td>{house.ruler ? `${house.ruler.name} · ${house.ruler.house}宫` : '—'}</td>
            </tr>)}</tbody>
          </table><p className="bazi-as-reading-note">宫头是该宫开始的黄道位置。守护星采用现代口径：天蝎—冥王、水瓶—天王、双鱼—海王。点击宫位查看宫内星体。</p>
        </> : <p className="bazi-notehint">{missingHouses}</p>}
      </>}
      {section === 'aspects' && <>
        {selection?.kind === 'aspect' && <SelectionDetails {...props} />}
        <div className="bazi-as-filters">
          <Select aria-label="相位星体" value={filter.body} onChange={body => onFilterChange({ ...filter, body })} options={[{ value: 'all', label: '全部星体' }, ...chart.bodies.map(body => ({ value: body.name, label: body.name }))]} />
          <Select aria-label="相位类型" value={filter.type} onChange={type => onFilterChange({ ...filter, type })} options={[{ value: 'all', label: '全部相位' }, ...Object.keys(ASPECT_MEANINGS).map(type => ({ value: type, label: `${type}相` }))]} />
          <Select aria-label="最大容许度" value={filter.orb} onChange={orb => onFilterChange({ ...filter, orb })} options={[{ value: 'all', label: '全部容许度' }, ...[1, 3, 5].map(orb => ({ value: String(orb), label: `≤ ${orb}°` }))]} />
        </div>
        <div className="bazi-as-filter-summary"><span role="status">显示 {aspects.length} / {chart.aspects.length} 条</span><button className="bazi-as-text-button" disabled={Object.values(filter).every(value => value === 'all')} onClick={() => onFilterChange(DEFAULT_ASPECT_FILTER)}>清除筛选</button></div>
        {aspects.length ? <table className="bazi-astab bazi-as-aspect-table" aria-label="主要相位">
          <thead><tr><th>星体／点位关系</th><th>相位</th><th>容许度</th></tr></thead>
          <tbody>{aspects.map(aspect => <tr key={aspect.index} data-selected={selected('aspect', aspect.index)} onClick={() => onSelect({ kind: 'aspect', index: aspect.index })}>
            <td><button className="bazi-as-row-button" aria-pressed={selected('aspect', aspect.index)} onClick={event => { event.stopPropagation(); onSelect({ kind: 'aspect', index: aspect.index }); }}>{aspect.a} — {aspect.b}</button></td>
            <td className={aspect.harmonious ? 'easy' : 'hard'}>{aspect.type}</td><td>{aspect.orb}°</td>
          </tr>)}</tbody>
        </table> : <p className="bazi-as-none">{chart.aspects.length ? '没有符合筛选条件的相位。可放宽条件或清除筛选。' : '主要相位区间内无显著相位。'}</p>}
        <p className="bazi-as-reading-note">容许度越小，越接近标准相位角度。涉及小天体或点位时最多 3°，点位之间不计相位；主要星体沿用原规则。筛选同步作用于盘面连线。</p>
      </>}
      {section === 'reading' && props.reading}
    </div>
    </div>
    {detached && <SelectionDetails {...props} detached />}
  </div>;
}
