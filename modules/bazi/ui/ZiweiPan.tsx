import type { ZiweiChart } from '../ziwei';
import type { BaziProfile } from '../../../shared/bazi-contracts';
import { HUA_CLASS } from './tokens';

/** 十二宫 → 4×4 盘格(中宫跨 2×2) */
const CELL_AREA: Record<string, string> = {
  巳: '1 / 1', 午: '1 / 2', 未: '1 / 3', 申: '1 / 4',
  辰: '2 / 1', 酉: '2 / 4',
  卯: '3 / 1', 戌: '3 / 4',
  寅: '4 / 1', 丑: '4 / 2', 子: '4 / 3', 亥: '4 / 4',
};

function StarTag({ name, brightness, mutagen }: { name: string; brightness: string; mutagen: string }) {
  return (
    <span className="bazi-zw-star">
      {name}
      {brightness && <span className="bazi-zw-bright">{brightness}</span>}
      {mutagen && <span className={`bazi-hua ${HUA_CLASS[mutagen] ?? ''}`}>{mutagen}</span>}
    </span>
  );
}

export function ZiweiPan({ profile, chart }: { profile: BaziProfile; chart: ZiweiChart }) {
  return (
    <div className="bazi-pan">
      <span className="bazi-pan-tag">十二宫命盘</span>
      <div className="bazi-pan-head">
        <div className="bazi-pan-who">
          <b>{profile.name}{profile.tag && <span className="bazi-ptag">{profile.tag}</span>}</b>
          <div className="bazi-pan-meta">
            公历 {profile.date} {profile.time} · {profile.gender === 1 ? '男' : '女'} · {chart.chineseDate}
          </div>
          <div className="bazi-pan-meta">钟表时间 · 未校正真太阳时{profile.time.startsWith('23:') && ' · 晚子时按次日'}</div>
        </div>
      </div>
      <div className="bazi-zw-grid">
        {chart.palaces.map((p) => {
          const branch = p.ganZhi.slice(1);
          return (
            <div key={branch} className="bazi-zw-cell" style={{ gridArea: CELL_AREA[branch] }}>
              <div className="bazi-zw-top">
                <span className="bazi-zw-palace">{p.name}</span>
                {p.isBodyPalace && <span className="bazi-zw-body">身宫</span>}
                <span className="bazi-zw-gz">{p.ganZhi} · {p.decadal[0]}–{p.decadal[1]}</span>
              </div>
              {p.majorStars.length > 0 ? (
                <div className="bazi-zw-stars">
                  {p.majorStars.map((s) => <StarTag key={s.name} {...s} />)}
                </div>
              ) : (
                <div className="bazi-zw-empty">空宫</div>
              )}
              {p.minorStars.length > 0 && (
                <div className="bazi-zw-fu">
                  {p.minorStars.map((s) => <StarTag key={s.name} {...s} />)}
                </div>
              )}
            </div>
          );
        })}
        <div className="bazi-zw-center">
          <div className="bazi-zc-name">{profile.name}</div>
          <div className="bazi-zc-meta">
            公历 {profile.date} {profile.time}
            <br />农历 {chart.lunarText} · 生肖{chart.zodiac}
            <br />{chart.chineseDate}年生
          </div>
          <div className="bazi-zc-ju">
            <span>{chart.fiveElementsClass}</span>
            <span>命主 {chart.soul}</span>
            <span>身主 {chart.body}</span>
          </div>
        </div>
        <div className="bazi-zw-center" style={{ gridArea: '2 / 2 / 4 / 4' }}>
          <div className="bazi-zc-name">{profile.name}{profile.tag && <span className="bazi-ptag">{profile.tag}</span>}</div>
          <div className="bazi-zc-meta">
            公历 {profile.date} {profile.time}
            <br />农历 {chart.lunarText} · 生肖{chart.zodiac}
            <br />{chart.chineseDate}年生
          </div>
          <div className="bazi-zc-ju">
            <span>{chart.fiveElementsClass}</span>
            <span>命主 {chart.soul}</span>
            <span>身主 {chart.body}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
