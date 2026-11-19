import { memo, useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { botAvatarChoice, botAvatarColors, normalizeBotAvatar } from '../../shared/bot-avatar';
import type { BotActivity } from '../../shared/bot-contracts';
import { useBotAvatarMotion } from '../bot-avatar-motion';
import { characterArt, graphicArt, graphicPlate, type CharacterPrimitive, type GraphicPart } from './bot-avatar-art';

function bodyPart(part: CharacterPrimitive, key: number, paint?: string) {
  if (part[0] === 'circle') return <circle key={key} cx={part[1]} cy={part[2]} r={part[3]} />;
  if (part[0] === 'rect') return <rect key={key} x={part[1]} y={part[2]} width={part[3]} height={part[4]} rx={part[5]} />;
  if (part[0] === 'path') return <path key={key} d={part[1]} />;
  return <polygon key={key} points={part[1]} stroke={paint} strokeWidth={paint ? part[2] : undefined} strokeLinejoin="round" />;
}
function graphicPart(part: GraphicPart, key: number, ink: Record<'a' | 'b' | 'bg', string>) {
  if (part[0] === 'circle') return <circle key={key} cx={part[1]} cy={part[2]} r={part[3]} fill={ink[part[4]]} />;
  if (part[0] === 'ring') return <circle key={key} cx={part[1]} cy={part[2]} r={part[3]} strokeWidth={part[4]} stroke={ink[part[5]]} fill="none" />;
  if (part[0] === 'rect') {
    const [, x, y, width, height, radius, color, gap] = part;
    return <g key={key}>{gap && <rect x={x - gap.gap} y={y - gap.gap} width={width + gap.gap * 2} height={height + gap.gap * 2} rx={radius + gap.gap} fill={ink.bg} />}<rect x={x} y={y} width={width} height={height} rx={radius} fill={ink[color]} /></g>;
  }
  if (part[0] === 'path') return <path key={key} d={part[1]} fill={ink[part[2]]} />;
  if (part[0] === 'line') return <path key={key} d={part[1]} strokeWidth={part[2]} stroke={ink[part[3]]} fill="none" strokeLinecap="round" strokeLinejoin="round" />;
  return <polygon key={key} points={part[1]} strokeWidth={part[2]} stroke={ink[part[3]]} fill={ink[part[3]]} strokeLinejoin="round" />;
}

export const BotAvatar = memo(function BotAvatar({ avatar, small = false, activity, motionId = '', completion }: { avatar: string; small?: boolean; activity?: BotActivity; motionId?: string; completion?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const previousCompletion = useRef(completion), [done, setDone] = useState(false);
  const live = activity !== undefined;
  const looping = !!activity && ['thinking', 'searching', 'working', 'sending', 'replying', 'waiting_bot'].includes(activity);
  useBotAvatarMotion(ref, live);
  useEffect(() => {
    const changed = previousCompletion.current !== completion;
    previousCompletion.current = completion;
    if (!changed || !completion || activity !== 'idle') { setDone(false); return; }
    setDone(true);
    const timer = window.setTimeout(() => setDone(false), 1100);
    return () => window.clearTimeout(timer);
  }, [completion, activity]);
  const rhythm = [...motionId].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 0);
  const id = useId(), choice = botAvatarChoice(avatar), color = botAvatarColors.find(item => item.id === choice.color)!;
  const shape = choice.kind === 'character' ? characterArt.find(item => item.id === choice.figure)! : undefined;
  const mark = choice.kind === 'graphic' ? graphicArt.find(item => item.id === choice.figure)! : undefined;
  const eye = shape?.eye[0] === 'small' ? { gap: 18, width: 9, height: 18 } : { gap: 22, width: 10.5, height: 21 };
  const paint = `url(#${id}-paint)`;
  return <span ref={ref} className={`bot-avatar${small ? ' is-small' : ''}`} data-avatar={normalizeBotAvatar(avatar)} data-kind={choice.kind} data-figure={choice.figure} data-live={live} data-state={done && activity === 'idle' ? 'done' : activity} data-loop={looping} data-running={looping && activity !== 'waiting_bot'} style={live ? { '--bot-blink-delay': `${-(rhythm % 4700)}ms`, '--bot-work-delay': `${-(rhythm % 700)}ms` } as CSSProperties : undefined} aria-hidden="true">
    <svg viewBox="0 0 100 100" focusable="false">
      <g className="bot-avatar-interaction"><g className="bot-avatar-body">
      {shape && <>
        <defs>
          <radialGradient id={`${id}-paint`} gradientUnits="userSpaceOnUse" cx="40" cy="34" r="66" fx="33" fy="25"><stop offset="0" stopColor={color.hi} /><stop offset="0.48" stopColor={color.base} /><stop offset="1" stopColor={color.lo} /></radialGradient>
          <clipPath id={`${id}-clip`}>{shape.prims.map((part, index) => bodyPart(part, index))}</clipPath>
        </defs>
        <g fill={paint}>{shape.prims.map((part, index) => bodyPart(part, index, paint))}</g>
        {shape.core && <circle cx={shape.core[0]} cy={shape.core[1]} r={shape.core[2]} fill={color.id === 'graphite' ? '#15181D' : color.soft} stroke={color.lo} strokeOpacity="0.22" strokeWidth="1.5" />}
        <g clipPath={`url(#${id}-clip)`}><ellipse cx={shape.hl[0]} cy={shape.hl[1]} rx={shape.hl[2]} ry={shape.hl[3]} transform={`rotate(${shape.hl[4]} ${shape.hl[0]} ${shape.hl[1]})`} fill="#FFFFFF" opacity="0.42" /></g>
        <g className="bot-avatar-eyes" fill={color.deep}>{[-1, 1].map(side => {
          const x = 50 + side * eye.gap / 2 - eye.width / 2, y = shape.eye[1] - eye.height / 2;
          return <g key={side} className="bot-avatar-eye"><rect x={x} y={y} width={eye.width} height={eye.height} rx={eye.width / 2} />{color.id !== 'graphite' && <circle className="bot-avatar-eye-glint" cx={x + eye.width * .66} cy={y + 4.2} r="1.8" fill="#FFFFFF" opacity="0.85" />}</g>;
        })}</g>
      </>}
      {mark && <>
        <path d={graphicPlate} fill={color.soft} stroke={color.lo} strokeOpacity="0.16" strokeWidth="2" />
        <g transform={mark.offsetX ? `translate(${mark.offsetX} 0)` : undefined}>{mark.parts.map((part, index) => graphicPart(part, index, { a: color.lo, b: color.id === 'graphite' ? color.hi : color.base, bg: color.soft }))}</g>
      </>}
      </g></g>
    </svg>
  </span>;
});
