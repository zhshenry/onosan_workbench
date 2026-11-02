import type { AstroAspect, AstroChart } from '../astro';

export const SIGN_NAMES = ['白羊', '金牛', '双子', '巨蟹', '狮子', '处女', '天秤', '天蝎', '射手', '摩羯', '水瓶', '双鱼'];
export const PLANETS: Record<string, { label: string; tone: string }> = {
  Sun: { label: '日', tone: 'fire' }, Moon: { label: '月', tone: 'water' },
  Mercury: { label: '水', tone: 'air' }, Venus: { label: '金', tone: 'earth' },
  Mars: { label: '火', tone: 'fire' }, Jupiter: { label: '木', tone: 'earth' },
  Saturn: { label: '土', tone: 'earth' }, Uranus: { label: '天', tone: 'air' },
  Neptune: { label: '海', tone: 'water' }, Pluto: { label: '冥', tone: 'water' },
  NorthNode: { label: '北交', tone: 'air' }, SouthNode: { label: '南交', tone: 'air' },
  Lilith: { label: '莉', tone: 'water' }, Fortune: { label: '福', tone: 'earth' },
  Chiron: { label: '凯', tone: 'earth' }, Ceres: { label: '谷', tone: 'earth' },
  Pallas: { label: '智', tone: 'air' }, Juno: { label: '婚', tone: 'water' }, Vesta: { label: '灶', tone: 'fire' },
};

export function degreeLabel(lon: number): string {
  const deg = Math.floor(lon % 30);
  const min = Math.round((lon % 1) * 60);
  return `${deg}°${String(min).padStart(2, '0')}′`;
}

export type AstroSection = 'positions' | 'houses' | 'aspects' | 'reading';
export type AstroSelection = { kind: 'body'; key: string } | { kind: 'house'; number: number } | { kind: 'aspect'; index: number } | null;
export interface AstroAspectFilter { body: string; type: string; orb: string }
export const DEFAULT_ASPECT_FILTER: AstroAspectFilter = { body: 'all', type: 'all', orb: 'all' };

// 采用现代守护口径。参考 Astrodienst: /astrology/in_ruler_e.htm。
// 三王星与传统守护不同:天蝎/冥王、水瓶/天王、双鱼/海王。
const MODERN_RULERS = ['Mars', 'Venus', 'Mercury', 'Moon', 'Sun', 'Mercury', 'Venus', 'Pluto', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];

// 简短术语释义,不是针对命例的预测。按常见西占用语自行概述。
// 参考: astro.com/astrology/in_houses_e.htm、in_planets_e.htm、in_elements_e.htm。
export const HOUSE_TOPICS = [
  '自我呈现、外在表达与开启事情的方式', '个人资源、价值感与物质积累',
  '日常沟通、基础学习与近距离往来', '家庭、根基与私人生活',
  '创作、兴趣与自我表达', '日常事务、工作习惯与生活秩序',
  '一对一关系、合作与约定', '共享资源、深层联结与变化',
  '高等学习、远行与观念探索', '事业方向、社会角色与公共形象',
  '朋友、群体与共同愿景', '独处、内在体验与隐而未见的部分',
];
export const BODY_MEANINGS: Record<string, string> = {
  Sun: '自我认同、意志与表达方向', Moon: '情绪反应、熟悉感与内在需求',
  Mercury: '思考、学习与沟通方式', Venus: '审美、喜好与关系中的价值取向',
  Mars: '行动、争取与表达意愿的方式', Jupiter: '探索、扩展与信念',
  Saturn: '边界、责任与长期建立的结构', Uranus: '独立、突破与改变',
  Neptune: '想象、理想与边界感', Pluto: '深层变化、掌控与重建',
  NorthNode: '探索新的经验与发展方向', SouthNode: '熟悉的经验、习惯与既有模式',
  Lilith: '自主、边界与不易被表达的需求', Fortune: '身心协调与现实生活中的资源体验',
  Chiron: '脆弱经验、理解与修复', Ceres: '照顾、滋养与依恋',
  Pallas: '辨识模式、策略与创造性思考', Juno: '承诺、平等与长期合作', Vesta: '专注、投入与个人界限',
};
export const EXTENDED_BODY_NOTES: Record<string, string> = {
  NorthNode: '月球轨道从南向北穿过黄道的位置。本盘采用平均交点，平滑短周期摆动；与真交点口径可能不同。',
  SouthNode: '月球轨道从北向南穿过黄道的位置。本盘采用平均交点，与北交点相差 180°。',
  Lilith: '采用月球平均远地点，并投影到黄道。它是计算点，不是小行星，也不是另一颗月亮。',
  Fortune: '由日月与上升点计算：昼盘为上升＋月亮－太阳，夜盘为上升＋太阳－月亮。昼夜按出生地太阳中心是否在几何地平线上方判定；不标顺逆行。',
  Chiron: '凯龙星（2060 Chiron）属于半人马小天体，位置来自内置 JPL 星历。',
  Ceres: '谷神星（1 Ceres）是主小行星带的矮行星，位置来自内置 JPL 星历。',
  Pallas: '智神星（2 Pallas）是主小行星带天体，位置来自内置 JPL 星历。',
  Juno: '婚神星（3 Juno）是主小行星带天体，位置来自内置 JPL 星历。',
  Vesta: '灶神星（4 Vesta）是主小行星带天体，位置来自内置 JPL 星历。',
};
export const SIGN_MEANINGS = [
  '主动、直接与开创', '稳定、积累与感官体验', '交流、好奇与多角度思考',
  '照顾、归属与情感联系', '创造、表达与被看见', '分析、细节与完善',
  '协调、平衡与相互关系', '深入、专注与情感强度', '探索、视野与意义',
  '目标、秩序与长期投入', '独立、群体视角与新思路', '感受、想象与共情',
];
export const ASPECT_MEANINGS: Record<string, { angle: number; text: string }> = {
  合: { angle: 0, text: '两个对象的位置接近,相关主题往往交织在一起。具体含义取决于参与的星体或点位。' },
  六分: { angle: 60, text: '常用于讨论两种主题之间可以发展、协调的联系。' },
  三分: { angle: 120, text: '常用于讨论较容易配合、自然流动的联系。' },
  刑: { angle: 90, text: '常用于讨论需要调整、磨合的张力,不直接等同于坏结果。' },
  冲: { angle: 180, text: '常用于讨论两个方向之间的拉力、平衡与相互照见。' },
};

export function matchingAspect(aspect: AstroAspect, filter: AstroAspectFilter): boolean {
  return (filter.body === 'all' || aspect.a === filter.body || aspect.b === filter.body)
    && (filter.type === 'all' || aspect.type === filter.type)
    && (filter.orb === 'all' || aspect.orb <= Number(filter.orb));
}

export function houseRows(chart: AstroChart) {
  return chart.houseCusps?.map((cusp, index) => ({
    number: index + 1, cusp,
    ruler: chart.bodies.find(body => body.key === MODERN_RULERS[Math.floor(cusp / 30)]),
    bodies: chart.bodies.filter(body => body.house === index + 1),
  })) ?? [];
}

/** 十颗主要星体各计一次,不计上升、宫头,不额外加权。 */
export function chartDistribution(chart: AstroChart) {
  const elements = [0, 0, 0, 0], modes = [0, 0, 0];
  const planets = chart.bodies.filter(body => body.kind === 'planet');
  for (const body of planets) {
    const sign = Math.floor(body.lon / 30);
    elements[sign % 4]++;
    modes[sign % 3]++;
  }
  return { elements, modes, total: planets.length };
}
