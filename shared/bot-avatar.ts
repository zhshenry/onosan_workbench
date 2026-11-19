export const botAvatarCharacters = [
  { id: 'ring', name: '圆环' }, { id: 'orb', name: '团子' }, { id: 'square', name: '方糖' },
  { id: 'drop', name: '水滴' }, { id: 'sail', name: '小帆' }, { id: 'hex', name: '蜂巢' },
  { id: 'cloud', name: '云朵' }, { id: 'flower', name: '花瓣' }, { id: 'ghost', name: '幽灵' },
  { id: 'pill', name: '胶囊' }, { id: 'star', name: '星星' }, { id: 'bear', name: '小熊' },
] as const;
export const botAvatarGraphics = [
  { id: 'orbit', name: '轨道' }, { id: 'grid', name: '方格' }, { id: 'waves', name: '波纹' },
  { id: 'plus', name: '方向键' }, { id: 'sails', name: '双帆' }, { id: 'half', name: '对半' },
  { id: 'gear', name: '齿轮' }, { id: 'hexdot', name: '六角' }, { id: 'moon', name: '新月' },
  { id: 'stack', name: '叠层' }, { id: 'arch', name: '拱门' }, { id: 'diamond', name: '菱形' },
] as const;
export const botAvatarColors = [
  { id: 'blue', name: '晴蓝', hi: '#B6CDFF', base: '#5C8DF6', lo: '#3A63D6', deep: '#172A63', soft: '#E9F0FE' },
  { id: 'cyan', name: '湖青', hi: '#A8E2F8', base: '#3BB5E5', lo: '#1A8BC0', deep: '#0B3B54', soft: '#E3F5FC' },
  { id: 'mint', name: '薄荷', hi: '#9EEBD7', base: '#30C1A1', lo: '#13987C', deep: '#08423A', soft: '#E0F7F1' },
  { id: 'green', name: '草绿', hi: '#BDEBAF', base: '#6BC556', lo: '#47A035', deep: '#1C4813', soft: '#EAF7E5' },
  { id: 'yellow', name: '柠黄', hi: '#FFEAA8', base: '#F6C744', lo: '#DFA21B', deep: '#5B3D00', soft: '#FEF6DC' },
  { id: 'orange', name: '橘橙', hi: '#FFCEA8', base: '#FF944F', lo: '#EA6E22', deep: '#5E2706', soft: '#FFEFE3' },
  { id: 'coral', name: '珊瑚', hi: '#FFBAB4', base: '#F7706B', lo: '#DA4946', deep: '#5F1716', soft: '#FEE8E6' },
  { id: 'pink', name: '桃粉', hi: '#FFC7E2', base: '#F07FB5', lo: '#D6578F', deep: '#5D1A3B', soft: '#FDE9F2' },
  { id: 'violet', name: '堇紫', hi: '#CCBEFF', base: '#8E74F1', lo: '#694DD6', deep: '#261A5F', soft: '#EFEBFE' },
  { id: 'graphite', name: '石墨', hi: '#8F97A7', base: '#4D5462', lo: '#2E343F', deep: '#F4F5F7', soft: '#E9EBEF' },
] as const;
export type BotAvatarFigure = typeof botAvatarCharacters[number]['id'] | typeof botAvatarGraphics[number]['id'];
export type BotAvatarColor = typeof botAvatarColors[number]['id'];
export type BotAvatarKind = 'character' | 'graphic';
export type BotAvatarValue = `${BotAvatarFigure}:${BotAvatarColor}`;
export const botAvatarRecommendations = {
  coordinator: { character: 'ring', graphic: 'orbit' }, schedule: { character: 'square', graphic: 'grid' },
  media: { character: 'drop', graphic: 'waves' }, game: { character: 'ghost', graphic: 'plus' },
  web: { character: 'sail', graphic: 'sails' }, 'ai-test': { character: 'hex', graphic: 'half' },
  utilities: { character: 'flower', graphic: 'gear' },
  reading: { character: 'orb', graphic: 'stack' },
} as const;
const legacyAvatars = {
  blue: 'ring:blue', violet: 'square:violet', sky: 'drop:graphite', green: 'ghost:green',
  orange: 'sail:orange', purple: 'hex:pink', teal: 'flower:mint',
} as const satisfies Record<string, BotAvatarValue>;
const characters = new Set<string>(botAvatarCharacters.map(item => item.id));
const figures = new Set<string>([...botAvatarCharacters, ...botAvatarGraphics].map(item => item.id));
const colors = new Set<string>(botAvatarColors.map(item => item.id));
export function isBotAvatar(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (Object.hasOwn(legacyAvatars, value)) return true;
  const parts = value.split(':');
  return parts.length === 2 && figures.has(parts[0]) && colors.has(parts[1]);
}
export function normalizeBotAvatar(value: unknown): BotAvatarValue {
  if (!isBotAvatar(value)) return 'orb:blue';
  return Object.hasOwn(legacyAvatars, value) ? legacyAvatars[value as keyof typeof legacyAvatars] : value as BotAvatarValue;
}
export function botAvatarChoice(value: unknown): { figure: BotAvatarFigure; color: BotAvatarColor; kind: BotAvatarKind } {
  const [figure, color] = normalizeBotAvatar(value).split(':') as [BotAvatarFigure, BotAvatarColor];
  return { figure, color, kind: characters.has(figure) ? 'character' : 'graphic' };
}
