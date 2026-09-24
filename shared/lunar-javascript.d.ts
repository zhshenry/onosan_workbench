/**
 * lunar-javascript 的最小类型面(库本体无官方类型;仅声明本工作台用到的 API)。
 * 命名与 UMD 导出一致:Solar/Lunar/EightChar/Yun/DaYun/LiuNian。
 */
declare module 'lunar-javascript' {
  export class Solar {
    static fromYmdHms(
      year: number,
      month: number,
      day: number,
      hour: number,
      minute: number,
      second: number,
    ): Solar;
    static fromYmd(year: number, month: number, day: number): Solar;
    getLunar(): Lunar;
    toYmd(): string;
  }
  export class Lunar {
    /** 农历全文,如「一九九〇年六月廿六」 */
    toString(): string;
    getEightChar(): EightChar;
    getYearShengXiao(): string;
  }
  /** 干支对象(toString 得「庚午」形式) */
  export class GanZhi {
    toString(): string;
  }
  export class EightChar {
    getYear(): GanZhi;
    getMonth(): GanZhi;
    getDay(): GanZhi;
    getTime(): GanZhi;
    getYearGan(): string;
    getMonthGan(): string;
    getDayGan(): string;
    getTimeGan(): string;
    getYearZhi(): string;
    getMonthZhi(): string;
    getDayZhi(): string;
    getTimeZhi(): string;
    /** 该柱两字五行,如「金火」 */
    getYearWuXing(): string;
    getMonthWuXing(): string;
    getDayWuXing(): string;
    getTimeWuXing(): string;
    getYearShiShenGan(): string;
    getMonthShiShenGan(): string;
    getDayShiShenGan(): string;
    getTimeShiShenGan(): string;
    /** 地支各藏干的十神(老版本为逗号分隔字符串,新版本为数组) */
    getYearShiShenZhi(): string | string[];
    getMonthShiShenZhi(): string | string[];
    getDayShiShenZhi(): string | string[];
    getTimeShiShenZhi(): string | string[];
    /** 藏干(老版本为逗号分隔字符串,新版本为数组) */
    getYearHideGan(): string | string[];
    getMonthHideGan(): string | string[];
    getDayHideGan(): string | string[];
    getTimeHideGan(): string | string[];
    getYearNaYin(): string;
    getMonthNaYin(): string;
    getDayNaYin(): string;
    getTimeNaYin(): string;
    /** gender:1=男 0=女 */
    getYun(gender: number): Yun;
  }
  export class Yun {
    getStartYear(): number;
    getStartMonth(): number;
    getStartDay(): number;
    getStartSolar(): Solar;
    getDaYun(): DaYun[];
  }
  export class DaYun {
    getStartAge(): number;
    getEndAge(): number;
    getStartYear(): number;
    getEndYear(): number;
    /** 起运前的首步为空串 */
    getGanZhi(): string;
    getLiuNian(): LiuNian[];
  }
  export class LiuNian {
    getYear(): number;
    getAge(): number;
    getGanZhi(): string;
  }
}
