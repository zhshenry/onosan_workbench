import { useEffect, useRef, useState } from 'react';
import { Plus, Sparkle, X } from '@phosphor-icons/react';
import { buildChart } from '../compute';
import {
  findShenSha, shiShen, WUXING_OF,
  type BaziChart, type BaziProfile, type BaziStoreData,
} from '../../../shared/bazi-contracts';
import { DatePicker, Modal, Segmented, TimePicker, errorText } from '../../todo/ui/ui';

const wb = window.workbench;
const CUR_KEY = 'wb.bazi.curProfileId';
const BAZI_MIN_YEAR = 1900;
const BAZI_MAX_YEAR = 2100;

const WX_COLOR: Record<string, string> = {
  木: 'var(--bazi-wx-mu)',
  火: 'var(--bazi-wx-huo)',
  土: 'var(--bazi-wx-tu)',
  金: 'var(--bazi-wx-jin)',
  水: 'var(--bazi-wx-shui)',
};

/** 命盘数据 → 发给 AI 助手的解读提示词(只读分析,不产生任何写入建议) */
export function buildBaziPrompt(profile: BaziProfile, chart: BaziChart): string {
  const pillars = chart.pillars
    .map((p) => `${p.label} ${p.ganZhi}(${p.label === '日柱' ? `日主 ${chart.dayGan}${chart.dayWuXing}` : p.ssGan})`)
    .join(' · ');
  const hide = chart.pillars.map((p) => `${p.label} ${p.hideGan.join('')}`).join(' · ');
  const naYin = chart.pillars.map((p) => p.naYin).join(' / ');
  const wuXing = (['木', '火', '土', '金', '水'] as const).map((w) => `${w}${chart.count[w] ?? 0}`).join(' ');
  const hits = findShenSha(chart.dayGan, chart.pillars[0].zhi, chart.pillars[2].zhi)
    .map((h) => {
      const pos = chart.pillars.filter((p) => p.zhi === h.zhi).map((p) => p.label).join('/');
      return pos ? `${h.name}(${pos})` : '';
    })
    .filter(Boolean)
    .join('、');
  const now = new Date();
  let yunText = '大运信息暂缺';
  let liuNianText = '';
  if (chart.yun) {
    const idxNow = chart.yun.list.findIndex(
      (d) => now.getFullYear() >= d.startYear && now.getFullYear() <= d.endYear,
    );
    yunText = `${chart.yun.startSolar} 起运(出生后 ${chart.yun.startYear} 年 ${chart.yun.startMonth} 个月);`
      + chart.yun.list
        .map((d, i) => `${d.ganZhi} ${d.startAge}-${d.endAge} 岁${i === idxNow ? '(当前)' : ''}`)
        .join('、');
    const current = idxNow >= 0 ? chart.yun.list[idxNow] : null;
    if (current) {
      liuNianText = `\n当前大运(${current.ganZhi})流年:${current.liuNian.map((l) => `${l.year} ${l.ganZhi}`).join('、')}`;
    }
  }
  return [
    '请作为命理助手,基于以下八字命盘给出解读(仅供传统命理兴趣参考,不构成医疗、投资等现实决策建议)。',
    '',
    `命例:${profile.name}(${profile.gender === 1 ? '男' : '女'})· 公历 ${profile.date} ${profile.time} · 农历 ${chart.lunarText} ${chart.hourText} · 生肖 ${chart.shengXiao}`,
    `四柱:${pillars}`,
    `藏干:${hide}`,
    `纳音:${naYin}`,
    `五行(8 字统计):${wuXing}`,
    yunText + liuNianText,
    hits ? `神煞:${hits}` : '',
    '',
    '请从以下角度解读:五行旺衰与喜用神、格局与性格特质、事业与财运倾向、婚姻感情、健康提示、当前大运与近年流年提示。无需生成任何待办建议。',
  ].filter((line) => line !== '').join('\n');
}

interface ShenShaRow { key: string; name: string; pos: string; }

export function BaziView({ onPending, onAskAI }: {
  onPending(message: string): void;
  onAskAI(prompt: string): void;
}) {
  const [storeData, setStoreData] = useState<BaziStoreData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [curId, setCurId] = useState<string | null>(null);
  const [openDy, setOpenDy] = useState(-1);
  const [noteDraft, setNoteDraft] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newGender, setNewGender] = useState('1');
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('12:00');
  const noteTimer = useRef<number | undefined>(undefined);
  const loadedOnce = useRef(false);

  useEffect(() => {
    if (loadedOnce.current) return;
    loadedOnce.current = true;
    void wb.bazi.list().then((raw) => {
      const data = raw as BaziStoreData;
      setStoreData(data);
      const saved = localStorage.getItem(CUR_KEY);
      setCurId(data.profiles.some((p) => p.id === saved) ? saved : data.profiles[0]?.id ?? null);
    }, (e) => setLoadError(errorText(e)));
  }, []);

  const profile: BaziProfile | null = storeData?.profiles.find((p) => p.id === curId)
    ?? storeData?.profiles[0]
    ?? null;

  let chart: BaziChart | null = null;
  let chartError = '';
  if (profile) {
    try {
      chart = buildChart(profile);
    } catch (e) {
      chartError = errorText(e);
    }
  }

  // 切换命例:重置流年展开到当前大运,并载入该命例笔记
  useEffect(() => {
    if (!chart?.yun) { setOpenDy(-1); return; }
    const nowYear = new Date().getFullYear();
    const idx = chart.yun.list.findIndex((d) => nowYear >= d.startYear && nowYear <= d.endYear);
    setOpenDy(Math.max(idx, 0));
    setNoteDraft(profile ? (storeData?.notes[profile.id] ?? '') : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const apply = (raw: unknown, okMsg?: string): void => {
    setStoreData(raw as BaziStoreData);
    if (okMsg) onPending(okMsg);
  };
  const run = (action: Promise<unknown>, okMsg?: string): void => {
    void action.then((raw) => apply(raw, okMsg), (e) => onPending(errorText(e)));
  };

  const switchProfile = (id: string): void => {
    setCurId(id);
    setNoteDraft(storeData?.notes[id] ?? '');
    localStorage.setItem(CUR_KEY, id);
  };
  const patchProfile = (patch: Partial<Pick<BaziProfile, 'date' | 'time' | 'gender'>>): void => {
    if (!profile) return;
    run(wb.bazi.saveProfile({ ...profile, ...patch }));
  };
  const removeProfile = (target: BaziProfile): void => {
    run(wb.bazi.removeProfile(target.id), `已删除「${target.name}」`);
    if (target.id === profile?.id) localStorage.removeItem(CUR_KEY);
  };

  // 笔记:500ms 防抖保存
  const onNoteChange = (text: string): void => {
    setNoteDraft(text);
    if (!profile) return;
    window.clearTimeout(noteTimer.current);
    const id = profile.id;
    noteTimer.current = window.setTimeout(() => {
      void wb.bazi.saveNote(id, text).then(
        (raw) => setStoreData(raw as BaziStoreData),
        (e) => onPending(errorText(e)),
      );
    }, 500);
  };

  const openNew = (): void => {
    setNewName('');
    setNewGender('1');
    setNewDate('');
    setNewTime('12:00');
    setNewOpen(true);
  };
  const saveNew = (): void => {
    const name = newName.trim();
    if (!name) { onPending('请填写姓名或备注'); return; }
    if (!newDate) { onPending('请选择公历生日'); return; }
    const year = Number(newDate.slice(0, 4));
    if (year < BAZI_MIN_YEAR || year > BAZI_MAX_YEAR) {
      onPending(`年份需在 ${BAZI_MIN_YEAR} 至 ${BAZI_MAX_YEAR} 之间`);
      return;
    }
    if (!newTime) { onPending('请选择出生时间'); return; }
    const id = crypto.randomUUID();
    setNewOpen(false);
    run(
      wb.bazi.saveProfile({ id, name, gender: Number(newGender), date: newDate, time: newTime }),
      `已保存「${name}」并排盘`,
    );
    switchProfile(id);
  };

  const askAI = (): void => {
    if (!profile || !chart) return;
    onAskAI(buildBaziPrompt(profile, chart));
  };

  if (loadError) {
    return (
      <section className="view on" id="view-bazi">
        <div className="bazi-load-error todo-load-error" role="alert">{loadError}</div>
      </section>
    );
  }
  if (!storeData) {
    return (
      <section className="view on" id="view-bazi">
        <div className="todo-loading" role="status">正在读取命例库…</div>
      </section>
    );
  }

  const profiles = storeData.profiles;
  const nowYear = new Date().getFullYear();

  return (
    <section className="view on" id="view-bazi">
      <div className="greet">
        <div>
          <h1>八字排盘</h1>
          <div className="gsub">本地排盘 · 命例与笔记保存在本机 · 解读可交给 AI 助手</div>
        </div>
        <div className="gbtns">
          <button className="btn btn-sec" onClick={openNew}><Plus size={15} weight="bold" />新建命例</button>
          <button className="btn btn-pri" disabled={!profile || !chart} onClick={askAI}>
            <Sparkle size={15} weight="fill" />AI 解读
          </button>
        </div>
      </div>

      {profiles.length === 0 ? (
        <div className="bazi-empty glass">
          <b>还没有命例</b>
          <p>新建一个命例(姓名 + 公历生日 + 出生时间 + 性别),即可排出四柱、五行、大运与流年,并可交给 AI 助手解读。</p>
          <button className="btn btn-pri" onClick={openNew}><Plus size={15} weight="bold" />新建命例</button>
        </div>
      ) : (
        <>
          <div className="bazi-pbar">
            <div className="bazi-pfchips">
              {profiles.map((p) => (
                <div
                  key={p.id}
                  className={p.id === profile?.id ? 'bazi-pfchip on' : 'bazi-pfchip'}
                  role="button"
                  tabIndex={0}
                  onClick={() => switchProfile(p.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); switchProfile(p.id); } }}
                >
                  <span className="bazi-pav" aria-hidden="true">{p.name.slice(0, 1)}</span>
                  <span className="bazi-pname">{p.name}</span>
                  <span className="bazi-pbirth">{p.date} · {p.gender === 1 ? '男' : '女'}</span>
                  {profiles.length > 1 && (
                    <span
                      className="bazi-pfx"
                      role="button"
                      aria-label={`删除命例 ${p.name}`}
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); removeProfile(p); }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); removeProfile(p); } }}
                    >
                      <X size={11} weight="bold" />
                    </span>
                  )}
                </div>
              ))}
              <button className="bazi-pfadd" onClick={openNew} aria-label="新建命例"><Plus size={14} weight="bold" /></button>
            </div>
            <div className="bazi-inputs">
              {profile && (
                <>
                  <DatePicker value={profile.date} onChange={(v) => { if (v) patchProfile({ date: v }); }} />
                  <TimePicker value={profile.time} onChange={(v) => { if (v) patchProfile({ time: v }); }} />
                  <Segmented
                    aria-label="性别"
                    value={String(profile.gender)}
                    options={[{ value: '1', label: '男' }, { value: '0', label: '女' }]}
                    onChange={(v) => patchProfile({ gender: v === '0' ? (0 as const) : (1 as const) })}
                  />
                </>
              )}
            </div>
          </div>

          {chartError && <div className="bazi-chart-error" role="alert">{chartError}</div>}

          {chart && profile && (
            <div className="bazi-cols">
              {/* 左列:命盘 + 大运 */}
              <div>
                <div className="panel glass">
                  <div className="phead">
                    <span className="ptitle">命盘</span>
                    <span className="pcount">公历 {profile.date} {profile.time} · 农历 {chart.lunarText} {chart.hourText}</span>
                  </div>
                  <div className="bazi-pillars">
                    {chart.pillars.map((p, i) => (
                      <div key={p.label} className="bazi-pcol">
                        <div className="bazi-plabel">
                          {p.label}
                          {i === 2 && <span className="bazi-mtag">日主</span>}
                        </div>
                        <div className="bazi-pss">{p.ssGan}</div>
                        <div className="bazi-pgan" style={{ color: WX_COLOR[WUXING_OF[p.gan]] }}>{p.gan}</div>
                        <div className="bazi-pzhi" style={{ color: WX_COLOR[WUXING_OF[p.zhi]] }}>{p.zhi}</div>
                        <div className="bazi-pssz">{p.ssZhi[0] ?? ''}</div>
                        <div className="bazi-phide">
                          {p.hideGan.map((g, k) => (
                            <span key={`${g}-${k}`} className="hi"><b>{g}</b>·{p.ssZhi[k] ?? ''}</span>
                          ))}
                        </div>
                        <div><span className="bazi-nachip">{p.naYin}</span></div>
                      </div>
                    ))}
                  </div>
                  <div className="bazi-cfoot">
                    <span>日主 <b style={{ color: WX_COLOR[chart.dayWuXing] }}>{chart.dayGan}·{chart.dayWuXing}</b></span>
                    <span>生肖 <b>{chart.shengXiao}</b></span>
                    <span className="bazi-gz">{chart.pillars.map((p) => p.ganZhi).join(' ')}</span>
                  </div>
                </div>

                <div className="panel glass">
                  <div className="phead">
                    <span className="ptitle">大运</span>
                    <span className="pcount">{chart.yun ? `${chart.yun.list.length} 步大运` : ''}</span>
                  </div>
                  {chart.yun ? (
                    <>
                      <div className="bazi-yunstart">
                        出生后 <b>{chart.yun.startYear} 年 {chart.yun.startMonth} 个月 {chart.yun.startDay} 天</b>起运 · {chart.yun.startSolar} 交入第一步
                      </div>
                      <div className="bazi-dychips">
                        {chart.yun.list.map((d, i) => {
                          const idxNow = chart.yun?.list.findIndex((x) => nowYear >= x.startYear && nowYear <= x.endYear) ?? -1;
                          return (
                            <button
                              key={`${d.ganZhi}-${d.startYear}`}
                              className={`bazi-dychip${i === openDy ? ' on' : ''}${i === idxNow ? ' now' : ''}`}
                              onClick={() => setOpenDy(i)}
                            >
                              <span className="bazi-dz">
                                <span style={{ color: WX_COLOR[WUXING_OF[d.ganZhi[0]]] }}>{d.ganZhi[0]}</span>
                                <span style={{ color: WX_COLOR[WUXING_OF[d.ganZhi[1]]] }}>{d.ganZhi[1]}</span>
                              </span>
                              <span className="bazi-dage">{d.startAge}–{d.endAge}岁 · {d.startYear}–{d.endYear}</span>
                              <span className="bazi-dss">{shiShen(chart.dayGan, d.ganZhi[0])}</span>
                              <span className="bazi-dnow" />
                            </button>
                          );
                        })}
                      </div>
                      {openDy >= 0 && chart.yun.list[openDy] && (
                        <div className="bazi-lnwrap open">
                          <div className="bazi-lnclip">
                            <div className="bazi-lnrow">
                              {chart.yun.list[openDy].liuNian.map((ln) => {
                                const isNow = ln.year === nowYear;
                                return (
                                  <span key={ln.year} className={isNow ? 'bazi-lnchip nowln' : 'bazi-lnchip'}>
                                    {isNow && <span className="bazi-lnow" />}
                                    <span className="bazi-ly">{ln.year}</span>
                                    <span className="bazi-lg">
                                      <span style={{ color: WX_COLOR[WUXING_OF[ln.ganZhi[0]]] }}>{ln.ganZhi[0]}</span>
                                      <span style={{ color: WX_COLOR[WUXING_OF[ln.ganZhi[1]]] }}>{ln.ganZhi[1]}</span>
                                    </span>
                                    <span className="bazi-ls">{shiShen(chart.dayGan, ln.ganZhi[0])} · {ln.age}岁</span>
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="bazi-ssempty">起运信息暂无法计算(超出可算范围),主盘不受影响。</div>
                  )}
                </div>
              </div>

              {/* 右列:五行 + 神煞 + 笔记 */}
              <div>
                <div className="panel glass">
                  <div className="phead">
                    <span className="ptitle">五行</span>
                    <span className="pcount">八字 8 字统计</span>
                  </div>
                  <div>
                    {(['木', '火', '土', '金', '水'] as const).map((wx) => {
                      const n = chart.count[wx] ?? 0;
                      const max = Math.max(...(['木', '火', '土', '金', '水'] as const).map((w) => chart.count[w] ?? 0));
                      return (
                        <div key={wx} className="bazi-wxrow">
                          <span className="bazi-wxdot" style={{ background: WX_COLOR[wx] }} />
                          <span className="bazi-wxname">{wx}</span>
                          <span className="bazi-wxnum">{n}</span>
                          <span className="bazi-wxbar"><i style={{ width: max ? `${(n / max) * 100}%` : '0%', background: WX_COLOR[wx] }} /></span>
                          <span className={max > 0 && n === max ? 'bazi-wxflag strong' : 'bazi-wxflag'}>
                            {max > 0 && n === max ? '偏旺' : n === 0 ? '缺' : ''}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="bazi-wxsum">
                    {(() => {
                      const order = (['木', '火', '土', '金', '水'] as const);
                      const max = Math.max(...order.map((w) => chart.count[w] ?? 0));
                      const strongest = order.find((w) => (chart.count[w] ?? 0) === max);
                      const missing = order.filter((w) => (chart.count[w] ?? 0) === 0);
                      return <><b>{strongest}</b> 偏旺 · {missing.length ? <>缺 <b>{missing.join('、')}</b></> : '五行不缺'} · 日主属{chart.dayWuXing}</>;
                    })()}
                  </div>
                </div>

                <div className="panel glass">
                  <div className="phead">
                    <span className="ptitle">神煞</span>
                    <span className="pcount">{(() => {
                      const hits = collectShenSha(chart);
                      return `${hits.length} 项`;
                    })()}</span>
                  </div>
                  <div className="bazi-ssrow">
                    {(() => {
                      const hits = collectShenSha(chart);
                      if (!hits.length) return <div className="bazi-ssempty">本命盘未检出常用神煞。</div>;
                      return hits.map((h) => (
                        <span key={h.key} className="bazi-sschip">
                          {h.name}
                          <span className="bazi-sspos">{h.pos}</span>
                        </span>
                      ));
                    })()}
                  </div>
                </div>

                <div className="panel glass">
                  <div className="phead">
                    <span className="ptitle">笔记</span>
                    <span className="pcount">{noteDraft.trim() ? '已自动保存' : '随命例保存'}</span>
                  </div>
                  <textarea
                    className="bazi-noteta"
                    value={noteDraft}
                    placeholder="记下用神取舍、流年应期、大运体会……"
                    onChange={(e) => onNoteChange(e.target.value)}
                  />
                  <div className="bazi-notehint">笔记随命例保存在本机,修改后自动保存。</div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {newOpen && (
        <Modal title="新建命例" close={() => setNewOpen(false)} subhead={<span className="field-help">公历生日 + 出生时间,保存后随时切换查看</span>}>
          <div className="form-body">
            <div className="bazi-form">
              <div className="bazi-form-field">
                <span className="bazi-form-label">姓名 / 备注</span>
                <input
                  aria-label="姓名或备注"
                  placeholder="如:林川"
                  maxLength={12}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div className="bazi-form-field">
                <span className="bazi-form-label">性别</span>
                <Segmented
                  aria-label="性别"
                  value={newGender}
                  options={[{ value: '1', label: '男' }, { value: '0', label: '女' }]}
                  onChange={setNewGender}
                />
              </div>
              <div className="bazi-form-field">
                <span className="bazi-form-label">公历生日</span>
                <DatePicker value={newDate} onChange={setNewDate} />
              </div>
              <div className="bazi-form-field">
                <span className="bazi-form-label">出生时间</span>
                <TimePicker value={newTime} onChange={setNewTime} />
              </div>
            </div>
            <div className="bazi-form-actions">
              <button className="btn btn-sec" onClick={() => setNewOpen(false)}>取消</button>
              <button className="btn btn-pri" onClick={saveNew}>保存并排盘</button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}

/** 神煞列表(带落柱标注);key 供渲染去重 */
function collectShenSha(chart: BaziChart): ShenShaRow[] {
  if (chart.pillars.length < 4) return [];
  return findShenSha(chart.dayGan, chart.pillars[0].zhi, chart.pillars[2].zhi)
    .map((h) => {
      const pos = chart.pillars.filter((p) => p.zhi === h.zhi).map((p) => p.label).join('/');
      return { key: `${h.name}-${h.from}-${h.zhi}`, name: h.name, pos };
    })
    .filter((h) => h.pos);
}
