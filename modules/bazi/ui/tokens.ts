/** 命理视图共享的颜色映射(引用 bazi.css 的语义 token) */

/** 盘面与右侧统计共用五行语义色 */
export const WX_VAR: Record<string, string> = {
  木: 'var(--bazi-wx-mu)',
  火: 'var(--bazi-wx-huo)',
  土: 'var(--bazi-wx-tu)',
  金: 'var(--bazi-wx-jin)',
  水: 'var(--bazi-wx-shui)',
};

export const PAN_WX = WX_VAR;

/** 四化颜色(盘面) */
export const HUA_CLASS: Record<string, string> = {
  禄: 'lu',
  权: 'quan',
  科: 'ke',
  忌: 'ji',
};

export const WUXING_ORDER = ['木', '火', '土', '金', '水'] as const;
