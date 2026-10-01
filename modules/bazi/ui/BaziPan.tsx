import { shiShen, WUXING_OF, type BaziChart, type BaziProfile } from '../../../shared/bazi-contracts';
import { PAN_WX } from './tokens';

const nowYear = (): number => new Date().getFullYear();

/** 五行环(8 字占比圆环) */
function WuxingRing({ count }: { count: Record<string, number> }) {
  const order = ['木', '火', '土', '金', '水'] as const;
  const total = order.reduce((sum, w) => sum + (count[w] ?? 0), 0) || 1;
  const r = 22;
  const c = 29;
  let acc = -90;
  const segs = order.map((w) => {
    const sweep = ((count[w] ?? 0) / total) * 360;
    const a0 = acc;
    const a1 = acc + sweep;
    acc = a1;
    if (sweep <= 0) return null;
    const rad0 = (a0 * Math.PI) / 180;
    const rad1 = (a1 * Math.PI) / 180;
    const large = sweep > 180 ? 1 : 0;
    const d = `M${(c + r * Math.cos(rad0)).toFixed(2)} ${(c + r * Math.sin(rad0)).toFixed(2)} A${r} ${r} 0 ${large} 1 ${(c + r * Math.cos(rad1)).toFixed(2)} ${(c + r * Math.sin(rad1)).toFixed(2)}`;
    return <path key={w} d={d} fill="none" stroke={PAN_WX[w]} strokeWidth={7} />;
  });
  const max = Math.max(...order.map((w) => count[w] ?? 0));
  const most = order.filter((w) => (count[w] ?? 0) === max);
  return (
    <div className="bazi-pan-ringbox">
      <svg width={58} height={58} viewBox="0 0 58 58" aria-hidden="true">
        {segs}
        <text x={29} y={33} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--bazi-pan-ink)">8字</text>
      </svg>
      <div className="bazi-pan-ringtxt">
        {order.map((w) => <span key={w}><i className="bazi-ring-dot" style={{ background: PAN_WX[w] }} />{w}{count[w] ?? 0} </span>)}
        <br /><b>{most.join('、')}数量最多</b>
      </div>
    </div>
  );
}

export function BaziPan({ profile, chart, openDy, onOpenDy }: {
  profile: BaziProfile;
  chart: BaziChart;
  openDy: number;
  onOpenDy(index: number): void;
}) {
  const year = nowYear();
  const idxNow = chart.yun ? chart.yun.list.findIndex((d) => year >= d.startYear && year <= d.endYear) : -1;
  return (
    <div className="bazi-pan" id="bazi-pan-bazi">
      <span className="bazi-pan-tag">四柱命盘</span>
      <div className="bazi-pan-head">
        <div className="bazi-pan-who">
          <b>{profile.name}{profile.tag && <span className="bazi-ptag">{profile.tag}</span>}</b>
          <div className="bazi-pan-meta">
            公历 {profile.date} {profile.time} · {profile.gender === 1 ? '男' : '女'} · 农历 {chart.lunarText} {chart.hourText}
          </div>
          <div className="bazi-pan-meta">钟表时间 · 未校正真太阳时{profile.time.startsWith('23:') && ' · 晚子时日柱按当天'}</div>
        </div>
        <WuxingRing count={chart.count} />
      </div>
      <div className="bazi-pan-div" />
      <div className="bazi-pan-pillars">
        {chart.pillars.map((p, i) => (
          <div key={p.label} className="bazi-pan-pcol">
            <div className="bazi-pan-plabel">
              {p.label}
              {i === 2 && <span className="bazi-pan-mtag">日主</span>}
            </div>
            <div className="bazi-pan-pss">{i === 2 ? '' : p.ssGan}</div>
            <div className="bazi-pan-pgan" style={{ color: PAN_WX[WUXING_OF[p.gan]] }}>{p.gan}</div>
            <div className="bazi-pan-pzhi" style={{ color: PAN_WX[WUXING_OF[p.zhi]] }}>{p.zhi}</div>
            <div className="bazi-pan-pssz">{i === 2 ? '' : p.ssZhi[0] ?? ''}</div>
            <div className="bazi-pan-phide">
              {p.hideGan.map((g, k) => (
                <span key={`${g}-${k}`} className="hi"><b>{g}</b>·{p.ssZhi[k] ?? ''}</span>
              ))}
            </div>
            <div><span className="bazi-pan-nachip">{p.naYin}</span></div>
          </div>
        ))}
      </div>
      <div className="bazi-pan-foot">
        <span>日主 <b style={{ color: PAN_WX[chart.dayWuXing] }}>{chart.dayGan}·{chart.dayWuXing}</b></span>
        <span>生肖 <b>{chart.shengXiao}</b></span>
        <span className="bazi-pan-gz">{chart.pillars.map((p) => p.ganZhi).join(' ')}</span>
      </div>
      {chart.yun ? (
        <div className="bazi-pan-dy">
          <div className="bazi-pan-dyhead">
            出生后 <b>{chart.yun.startYear} 年 {chart.yun.startMonth} 个月</b>起运 · {chart.yun.startSolar} 交入第一步 · 点击大运看流年
          </div>
          <div className="bazi-dychips">
            {chart.yun.list.map((d, i) => (
              <button
                key={`${d.ganZhi}-${d.startYear}`}
                className={`bazi-dychip${i === openDy ? ' on' : ''}${i === idxNow ? ' now' : ''}`}
                onClick={() => onOpenDy(i)}
              >
                <span className="bazi-dz">
                  <span style={{ color: PAN_WX[WUXING_OF[d.ganZhi[0]]] }}>{d.ganZhi[0]}</span>
                  <span style={{ color: PAN_WX[WUXING_OF[d.ganZhi[1]]] }}>{d.ganZhi[1]}</span>
                </span>
                <span className="bazi-dage">{d.startAge}–{d.endAge}岁</span>
                <span className="bazi-dss">{shiShen(chart.dayGan, d.ganZhi[0])}</span>
                <span className="bazi-dnow" />
              </button>
            ))}
          </div>
          {openDy >= 0 && chart.yun.list[openDy] && (
            <div className="bazi-lnwrap open">
              <div className="bazi-lnclip">
                <div className="bazi-lnrow">
                  {chart.yun.list[openDy].liuNian.map((ln) => {
                    const isNow = ln.year === year;
                    return (
                      <span key={ln.year} className={isNow ? 'bazi-lnchip nowln' : 'bazi-lnchip'}>
                        {isNow && <span className="bazi-lnow" />}
                        <span className="bazi-ly">{ln.year}</span>
                        <span className="bazi-lg">
                          <span style={{ color: PAN_WX[WUXING_OF[ln.ganZhi[0]]] }}>{ln.ganZhi[0]}</span>
                          <span style={{ color: PAN_WX[WUXING_OF[ln.ganZhi[1]]] }}>{ln.ganZhi[1]}</span>
                        </span>
                        <span className="bazi-ls">{shiShen(chart.dayGan, ln.ganZhi[0])} · {ln.age}岁</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bazi-pan-dy"><div className="bazi-pan-dyhead">起运信息暂无法计算,主盘不受影响。</div></div>
      )}
    </div>
  );
}
