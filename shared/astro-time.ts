import { Temporal } from '@js-temporal/polyfill';

export type AstroTimeChoice = 'earlier' | 'later';
export interface AstroTimeInput {
  date: string;
  time: string;
  astroTimeZone?: string;
  astroTimeChoice?: AstroTimeChoice;
}
export interface AstroTimeCandidate {
  choice: AstroTimeChoice;
  epochMs: number;
  utc: string;
  offset: string;
}
export interface AstroBirthTime extends Omit<AstroTimeCandidate, 'choice'> {
  timeZone: string;
  legacy: boolean;
  choice?: AstroTimeChoice;
}
export type AstroTimeResolution =
  | { status: 'ready'; value: AstroBirthTime; candidates: AstroTimeCandidate[] }
  | { status: 'ambiguous'; message: string; candidates: AstroTimeCandidate[] }
  | { status: 'invalid'; field: 'date' | 'time' | 'astroTimeZone'; message: string };

export const ASTRO_TIME_ZONES = [
  { value: 'Asia/Shanghai', label: '中国大陆 · 北京时间' },
  { value: 'Asia/Hong_Kong', label: '中国香港' },
  { value: 'Asia/Macau', label: '中国澳门' },
  { value: 'Asia/Taipei', label: '中国台湾' },
  { value: 'Asia/Urumqi', label: '新疆地方时（非北京时间）' },
  { value: 'Asia/Tokyo', label: '日本 · 东京' },
  { value: 'Asia/Seoul', label: '韩国 · 首尔' },
  { value: 'Asia/Singapore', label: '新加坡' },
  { value: 'Asia/Bangkok', label: '泰国 · 曼谷' },
  { value: 'Asia/Kolkata', label: '印度 · 加尔各答' },
  { value: 'Asia/Kathmandu', label: '尼泊尔 · 加德满都' },
  { value: 'Asia/Dubai', label: '阿联酋 · 迪拜' },
  { value: 'Europe/London', label: '英国 · 伦敦' },
  { value: 'Europe/Paris', label: '法国 · 巴黎' },
  { value: 'Europe/Berlin', label: '德国 · 柏林' },
  { value: 'Europe/Moscow', label: '俄罗斯 · 莫斯科' },
  { value: 'America/New_York', label: '美国 · 纽约' },
  { value: 'America/Chicago', label: '美国 · 芝加哥' },
  { value: 'America/Denver', label: '美国 · 丹佛' },
  { value: 'America/Los_Angeles', label: '美国 · 洛杉矶' },
  { value: 'Pacific/Honolulu', label: '美国 · 夏威夷' },
  { value: 'Australia/Sydney', label: '澳大利亚 · 悉尼' },
  { value: 'Australia/Perth', label: '澳大利亚 · 珀斯' },
  { value: 'Pacific/Auckland', label: '新西兰 · 奥克兰' },
  { value: 'UTC', label: '协调世界时 · UTC' },
  { value: '+08:00', label: '固定东八区 · UTC+08:00（不换夏令时）' },
];

export const astroTimeZoneLabel = (zone: string): string => ASTRO_TIME_ZONES.find(item => item.value === zone)?.label ?? zone;
export const astroUtcLabel = (utc: string): string => `${utc.replace('T', ' ').replace('Z', '')} UTC`;

/** 不读取电脑时区；旧命例缺省为固定 UTC+8，地区时区使用运行时的 IANA 历史规则。 */
export function resolveAstroTime(input: AstroTimeInput): AstroTimeResolution {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { status: 'invalid', field: 'date', message: '请填写有效的公历生日。' };
  if (!/^\d{2}:\d{2}$/.test(input.time)) return { status: 'invalid', field: 'time', message: '请填写有效的出生时间。' };
  let local: Temporal.PlainDateTime;
  try {
    Temporal.PlainDate.from(input.date);
  } catch {
    return { status: 'invalid', field: 'date', message: '公历生日不存在，请检查年月日。' };
  }
  try {
    local = Temporal.PlainDateTime.from(`${input.date}T${input.time}`);
  } catch {
    return { status: 'invalid', field: 'time', message: '出生时间需在 00:00 至 23:59 之间。' };
  }
  const timeZone = input.astroTimeZone ?? '+08:00';
  if (!/^(?:[A-Za-z][A-Za-z0-9._+-]*(?:\/[A-Za-z0-9._+-]+)*|[+-]\d{2}:\d{2})$/.test(timeZone)) {
    return { status: 'invalid', field: 'astroTimeZone', message: '请填写地区时区（如 Europe/Paris）或固定时差（如 +08:00）。' };
  }
  let earlier: Temporal.ZonedDateTime, later: Temporal.ZonedDateTime;
  try {
    earlier = local.toZonedDateTime(timeZone, { disambiguation: 'earlier' });
    later = local.toZonedDateTime(timeZone, { disambiguation: 'later' });
  } catch {
    return { status: 'invalid', field: 'astroTimeZone', message: '未识别这个时区，请选择地区或填写有效的 IANA 时区。' };
  }
  if (!earlier.toPlainDateTime().equals(local) || !later.toPlainDateTime().equals(local)) {
    return { status: 'invalid', field: 'time', message: '该地区当天拨快了时钟，这段钟表时间不存在。请核对出生记录的时间或时区。' };
  }
  const candidate = (value: Temporal.ZonedDateTime, choice: AstroTimeChoice): AstroTimeCandidate => ({
    choice, epochMs: value.epochMilliseconds, utc: value.toInstant().toString(), offset: value.offset,
  });
  const candidates = earlier.epochMilliseconds === later.epochMilliseconds ? [] : [candidate(earlier, 'earlier'), candidate(later, 'later')];
  if (candidates.length && !input.astroTimeChoice) {
    return { status: 'ambiguous', candidates, message: '该地区当天拨回了时钟，这个时间出现过两次。请选择出生记录对应的一次。' };
  }
  const selected = candidates.find(item => item.choice === input.astroTimeChoice) ?? candidate(earlier, 'earlier');
  return { status: 'ready', candidates, value: {
    epochMs: selected.epochMs, utc: selected.utc, offset: selected.offset, timeZone,
    legacy: input.astroTimeZone === undefined, choice: candidates.length ? selected.choice : undefined,
  } };
}
