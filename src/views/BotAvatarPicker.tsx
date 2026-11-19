import { useState, type KeyboardEvent } from 'react';
import { botAvatarCharacters, botAvatarChoice, botAvatarColors, botAvatarGraphics, botAvatarRecommendations, type BotAvatarFigure, type BotAvatarKind } from '../../shared/bot-avatar';
import { botSeeds, type BotSeedKey } from '../../shared/bot-contracts';
import { Segmented } from '../ui/controls';
import { BotAvatar } from './BotAvatar';

function radioKey<T extends string>(event: KeyboardEvent<HTMLElement>, values: readonly T[], current: T, select: (value: T) => void) {
  const index = values.indexOf(current), delta = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? values.length - 1 : delta ? (index + delta + values.length) % values.length : -1;
  if (next < 0) return;
  event.preventDefault(); select(values[next]);
  event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next].focus();
}

export function BotAvatarPicker({ value, seedKey, onChange, disabled }: { value: string; seedKey: BotSeedKey; onChange(value: string): void; disabled: boolean }) {
  const choice = botAvatarChoice(value);
  const [remembered, setRemembered] = useState<Record<BotAvatarKind, BotAvatarFigure>>(() => ({ ...botAvatarRecommendations[seedKey], [choice.kind]: choice.figure }));
  const figures = choice.kind === 'character' ? botAvatarCharacters : botAvatarGraphics;
  const kindName = choice.kind === 'character' ? '角色' : '图形';
  const restoreDefault = () => {
    setRemembered(botAvatarRecommendations[seedKey]);
    onChange(botSeeds.find(bot => bot.seedKey === seedKey)!.avatar);
  };
  const selectFigure = (figure: BotAvatarFigure) => { setRemembered(previous => ({ ...previous, [choice.kind]: figure })); onChange(`${figure}:${choice.color}`); };
  return <fieldset className="bot-avatar-picker" aria-label="头像设置" disabled={disabled}>
    <div className="bot-avatar-picker-heading">
      <Segmented aria-label="头像类别" value={choice.kind} options={[{ value: 'character', label: '角色' }, { value: 'graphic', label: '图形' }]} onChange={kind => onChange(`${remembered[kind as BotAvatarKind]}:${choice.color}`)} />
      <button type="button" className="bot-avatar-reset" title="恢复此 Bot 的默认头像和颜色" onClick={restoreDefault}>重置</button>
    </div>
    <div className="bot-avatar-choices" role="radiogroup" aria-label={`${kindName}头像`} onKeyDown={event => radioKey(event, figures.map(item => item.id), choice.figure, selectFigure)}>
      {figures.map(item => <button key={item.id} type="button" role="radio" aria-label={`${kindName}：${item.name}`} title={item.name} aria-checked={choice.figure === item.id} tabIndex={choice.figure === item.id ? 0 : -1} onClick={() => selectFigure(item.id)}><BotAvatar avatar={`${item.id}:${choice.color}`} /></button>)}
    </div>
    <div className="bot-avatar-colors" role="radiogroup" aria-label="头像颜色" onKeyDown={event => radioKey(event, botAvatarColors.map(item => item.id), choice.color, next => onChange(`${choice.figure}:${next}`))}>
      {botAvatarColors.map(item => <button key={item.id} type="button" role="radio" aria-label={`颜色：${item.name}`} title={item.name} aria-checked={choice.color === item.id} tabIndex={choice.color === item.id ? 0 : -1} onClick={() => onChange(`${choice.figure}:${item.id}`)}><span className="bot-avatar-swatch" style={{ background: item.base }} /></button>)}
    </div>
  </fieldset>;
}
