import { useId, useState } from 'react';
import { ASTRO_TIME_ZONES, astroUtcLabel, type AstroTimeChoice, type AstroTimeResolution } from '../../../shared/astro-time';
import { Select } from '../../../src/ui/controls';

export function AstroTimeFields({ zone, choice, resolution, disabled, onZoneChange, onChoiceChange }: {
  zone?: string;
  choice?: AstroTimeChoice;
  resolution: AstroTimeResolution | null;
  disabled: boolean;
  onZoneChange(zone: string): void;
  onChoiceChange(choice: AstroTimeChoice): void;
}) {
  const id = useId();
  const [custom, setCustom] = useState(zone !== undefined && !ASTRO_TIME_ZONES.some(item => item.value === zone));
  const invalid = resolution?.status === 'invalid';
  const candidates = resolution && resolution.status !== 'invalid' ? resolution.candidates : [];
  return <div className="bazi-form-field bazi-form-wide bazi-time-fields">
    <label className="bazi-form-label" htmlFor={`${id}-zone`}>占星出生时区</label>
    <Select id={`${id}-zone`} aria-label="占星出生时区" aria-describedby={`${id}-help`} disabled={disabled}
      value={custom ? 'custom' : zone ?? '+08:00'} options={[...ASTRO_TIME_ZONES, { value: 'custom', label: '其他地区…' }]}
      onChange={value => { setCustom(value === 'custom'); onZoneChange(value === 'custom' ? '' : value); }} />
    {custom && <>
      <input aria-label="其他地区时区" placeholder="如 America/Toronto" value={zone ?? ''} disabled={disabled}
        aria-invalid={invalid && resolution.field === 'astroTimeZone'} aria-describedby={`${id}-help ${id}-result`}
        autoComplete="off" spellCheck={false} onChange={event => onZoneChange(event.target.value.trim())} />
      <span className="field-help">填写 IANA 地区时区，例如 America/Toronto（多伦多）。</span>
    </>}
    <span id={`${id}-help`} className="field-help">
      {zone === undefined ? '旧命例沿用固定 UTC+8；选择地区后，才会按历史规则重新计算占星。'
        : /^[+-]/.test(zone) || zone === 'UTC' ? '固定时差，不自动调整夏令时。'
          : '按出生日期自动处理该地区的历史时差与夏令时，请勿手动减去一小时。'}
      {' '}此设置仅用于占星，八字和紫微斗数仍按填写的钟表时间排盘。
    </span>
    <div id={`${id}-result`} className={`bazi-time-preview${invalid ? ' is-error' : ''}`} role="status">
      {!resolution ? '填好出生日期和时间后，将在这里显示换算结果。'
        : resolution.status === 'ready' ? <>
          <b>实际采用 UTC{resolution.value.offset}</b>
          <span>{astroUtcLabel(resolution.value.utc)}{resolution.value.choice ? ` · ${resolution.value.choice === 'earlier' ? '第一次' : '第二次'}出现` : ''}</span>
        </> : resolution.message}
    </div>
    {candidates.length > 0 && <fieldset className="bazi-time-choices" disabled={disabled}>
      <legend>出生记录对应哪一次？</legend>
      {candidates.map(candidate => <label key={candidate.choice}>
        <input type="radio" name={`${id}-choice`} value={candidate.choice} checked={choice === candidate.choice}
          onChange={() => onChoiceChange(candidate.choice)} />
        <span><b>{candidate.choice === 'earlier' ? '第一次（拨回前）' : '第二次（拨回后）'} · UTC{candidate.offset}</b>
          <small>{astroUtcLabel(candidate.utc)}</small></span>
      </label>)}
    </fieldset>}
  </div>;
}
