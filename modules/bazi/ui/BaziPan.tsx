import { shiShen, WUXING_OF, type BaziChart, type BaziProfile } from '../../../shared/bazi-contracts';
import { CaretDown } from '@phosphor-icons/react';
import { PAN_WX, WUXING_ORDER } from './tokens';

const nowYear = (): number => new Date().getFullYear();

export function BaziPan({ profile, chart }: {
  profile: BaziProfile;
  chart: BaziChart;
}) {
  const total = WUXING_ORDER.reduce((sum, wx) => sum + chart.count[wx], 0);
  return (
    <section className="bazi-pan" id="bazi-pan-bazi" aria-label="四柱命盘">
      <div className="bazi-pan-head">
        <div className="bazi-chart-heading">
          <h2 className="bazi-card-title">四柱命盘</h2>
          <div className="bazi-pan-who">
            <div className="bazi-pan-meta"><b>{profile.name}</b>{profile.tag && <span className="bazi-ptag">{profile.tag}</span>} · {profile.gender === 1 ? '男' : '女'}</div>
            <div className="bazi-pan-meta">公历 {profile.date} {profile.time} · 钟表时间</div>
            <div className="bazi-pan-meta">农历 {chart.lunarText} {chart.hourText} · 未校正真太阳时{profile.time.startsWith('23:') && ' · 晚子时日柱按当天'}</div>
          </div>
        </div>
        <div className="bazi-element-summary">
          <svg className="bazi-element-ring" viewBox="0 0 80 80" role="img" aria-label={`五行分布：${WUXING_ORDER.map(wx => `${wx} ${chart.count[wx]}`).join('、')}`}>
            {WUXING_ORDER.map((wx, index) => chart.count[wx] > 0 && (
              <circle key={wx} cx="40" cy="40" r="32" fill="none" stroke={PAN_WX[wx]} strokeWidth="10"
                pathLength={total} strokeDasharray={`${chart.count[wx]} ${total - chart.count[wx]}`}
                strokeDashoffset={-WUXING_ORDER.slice(0, index).reduce((sum, value) => sum + chart.count[value], 0)}
                transform="rotate(-90 40 40)" />
            ))}
            <text x="40" y="40" textAnchor="middle" dominantBaseline="central">{total}字</text>
          </svg>
          <div className="bazi-element-legend" aria-hidden="true">
            {WUXING_ORDER.map(wx => <span key={wx}><i style={{ background: PAN_WX[wx] }} />{wx}{chart.count[wx]}</span>)}
          </div>
        </div>
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
            <div className="bazi-pan-pssz">藏干</div>
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
    </section>
  );
}

export function BaziCycles({ chart, openDy, onOpenDy }: {
  chart: BaziChart;
  openDy: number;
  onOpenDy(index: number): void;
}) {
  const year = nowYear();
  const idxNow = chart.yun ? chart.yun.list.findIndex((d) => year >= d.startYear && year <= d.endYear) : -1;
  return (
    <details className="bazi-cycles" open>
      <summary className="bazi-cycles-heading">
        <h2 className="bazi-card-title">大运流年</h2>
        {chart.yun && <span className="bazi-cycles-start">起运 {chart.yun.startYear} 年 {chart.yun.startMonth} 个月</span>}
        <CaretDown size={16} aria-hidden="true" />
      </summary>
      {chart.yun ? (
        <div className="bazi-pan-dy">
          <div className="bazi-dychips">
            {chart.yun.list.map((d, i) => (
              <button
                key={`${d.ganZhi}-${d.startYear}`}
                className={`bazi-dychip${i === openDy ? ' on' : ''}${i === idxNow ? ' now' : ''}`}
                aria-pressed={i === openDy}
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
          <div className="bazi-pan-dyhead">{chart.yun.startSolar} 交入第一步 · 点击大运查看对应流年</div>
        </div>
      ) : (
        <div className="bazi-pan-dy"><div className="bazi-pan-dyhead">起运信息暂无法计算,主盘不受影响。</div></div>
      )}
    </details>
  );
}
