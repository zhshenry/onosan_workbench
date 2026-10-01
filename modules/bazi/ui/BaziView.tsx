import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CaretDown, Pencil, Plus, Sparkle, TrashSimple } from '@phosphor-icons/react';
import { buildChart } from '../compute';
import { buildZiwei, type ZiweiChart } from '../ziwei';
import { buildAstro, type AstroChart } from '../astro';
import {
  findShenSha,
  type BaziChart, type BaziProfile, type BaziStoreData,
} from '../../../shared/bazi-contracts';
import { DatePicker, Modal, Segmented, TimePicker, errorText } from '../../todo/ui/ui';
import { WX_VAR, WUXING_ORDER } from './tokens';
import { BaziPan } from './BaziPan';
import { ZiweiPan } from './ZiweiPan';
import { AstroPan } from './AstroPan';

const wb = window.workbench;
const CUR_KEY = 'wb.bazi.curProfileId';
const BAZI_MIN_YEAR = 1900;
const BAZI_MAX_YEAR = 2100;

type TabKey = 'bazi' | 'ziwei' | 'astro';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'bazi', label: '八字' },
  { key: 'ziwei', label: '紫微斗数' },
  { key: 'astro', label: '占星' },
];

function collectShenSha(chart: BaziChart): { key: string; name: string; pos: string }[] {
  if (chart.pillars.length < 4) return [];
  return findShenSha(chart.dayGan, chart.pillars[0].zhi, chart.pillars[2].zhi)
    .map((h) => {
      const pos = chart.pillars.filter((p) => p.zhi === h.zhi).map((p) => p.label).join('/');
      return { key: `${h.name}-${h.from}-${h.zhi}`, name: h.name, pos };
    })
    .filter((h) => h.pos);
}

function NoteCard({ value, onChange }: {
  value: string;
  onChange(text: string): void;
}) {
  return (
    <div className="panel glass">
      <div className="phead">
        <span className="ptitle">笔记</span>
        <span className="pcount">{value.trim() ? '已自动保存' : '随命例保存'}</span>
      </div>
      <textarea
        className="bazi-noteta"
        value={value}
        placeholder="记下用神取舍、流年应期、大运体会……"
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="bazi-notehint">笔记随命例保存在本机,三张盘共用。</div>
    </div>
  );
}

export function BaziView({ onPending, onAskAI, onCurrentProfile, requestedProfileId, requestedDayLocate, onDayLocated }: {
  onPending(message: string): void;
  onAskAI(prompt: string, profileId: string, system: 'bazi' | 'ziwei' | 'astro'): void;
  onCurrentProfile(profile: { id: string; name: string; system: 'bazi' | 'ziwei' | 'astro' } | null): void;
  requestedProfileId?: string | null;
  requestedDayLocate?: { profileId: string; nonce: number } | null;
  onDayLocated(): void;
}) {
  const [storeData, setStoreData] = useState<BaziStoreData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [curId, setCurId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('bazi');
  const [openDy, setOpenDy] = useState(-1);
  const [pselOpen, setPselOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [savingForAI, setSavingForAI] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BaziProfile | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fName, setFName] = useState('');
  const [fGender, setFGender] = useState('1');
  const [fDate, setFDate] = useState('');
  const [fTime, setFTime] = useState('');
  const [fTag, setFTag] = useState('');
  const pselRef = useRef<HTMLDivElement>(null);
  const noteTimer = useRef<number | undefined>(undefined);
  const loadedOnce = useRef(false);
  const handledRequest = useRef<string | null>(null);
  const handledLocate = useRef(0);

  useEffect(() => {
    if (loadedOnce.current) return;
    loadedOnce.current = true;
    void wb.bazi.list().then((raw) => {
      const data = raw as BaziStoreData;
      setStoreData(data);
      const saved = requestedProfileId ?? localStorage.getItem(CUR_KEY);
      setCurId(data.profiles.some((p) => p.id === saved) ? saved : data.profiles[0]?.id ?? null);
    }, (e) => setLoadError(errorText(e)));
  }, []);

  const profile: BaziProfile | null = storeData?.profiles.find((p) => p.id === curId)
    ?? storeData?.profiles[0]
    ?? null;

  useLayoutEffect(() => {
    onCurrentProfile(profile ? { id: profile.id, name: profile.name, system: tab } : null);
  }, [profile?.id, profile?.name, tab, onCurrentProfile]);

  useEffect(() => {
    if (!requestedProfileId || !storeData || handledRequest.current === requestedProfileId || curId === requestedProfileId) return;
    if (!storeData.profiles.some(item => item.id === requestedProfileId)) return;
    handledRequest.current = requestedProfileId;
    setCurId(requestedProfileId);
    localStorage.setItem(CUR_KEY, requestedProfileId);
  }, [requestedProfileId, storeData, curId]);

  useEffect(() => {
    if (!requestedDayLocate || handledLocate.current === requestedDayLocate.nonce || curId !== requestedDayLocate.profileId) return;
    if (tab !== 'bazi') { setTab('bazi'); return; }
    handledLocate.current = requestedDayLocate.nonce;
    requestAnimationFrame(() => {
      const day = document.querySelector<HTMLElement>('#bazi-pan-bazi .bazi-pan-pcol:nth-child(3)');
      day?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      day?.classList.add('ai-located');
      if (day) window.setTimeout(() => day.classList.remove('ai-located'), 2000);
      onDayLocated();
    });
  }, [requestedDayLocate, curId, tab, onDayLocated]);

  const charts = useMemo(() => {
    if (!profile) return null;
    try {
      return {
        bazi: buildChart(profile),
        ziwei: buildZiwei(profile),
        astro: buildAstro(profile),
        error: '',
      };
    } catch (e) {
      return { bazi: null as BaziChart | null, ziwei: null as ZiweiChart | null, astro: null as AstroChart | null, error: errorText(e) };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, profile?.date, profile?.time, profile?.gender]);

  // 切换命例:重置流年展开,并载入该命例笔记
  useEffect(() => {
    setOpenDy(-1);
    setNoteDraft(profile ? (storeData?.notes[profile.id] ?? '') : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  // 命例下拉:点外部关闭
  useEffect(() => {
    if (!pselOpen) return;
    const onPointerDown = (e: PointerEvent): void => {
      if (pselRef.current && !pselRef.current.contains(e.target as Node)) setPselOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if (e.key === 'Escape') setPselOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [pselOpen]);

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
  const removeProfile = (target: BaziProfile): void => {
    if (target.id === profile?.id) window.clearTimeout(noteTimer.current);
    run(wb.bazi.removeProfile(target.id), `已删除「${target.name}」,笔记一并清除`);
    if (target.id === profile?.id) localStorage.removeItem(CUR_KEY);
    setDeleteTarget(null);
  };

  const onNote = (text: string): void => {
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

  const startEdit = (target: BaziProfile | null): void => {
    setEditingId(target ? target.id : null);
    setFName(target ? target.name : '');
    setFGender(target ? String(target.gender) : '1');
    setFDate(target ? target.date : '');
    setFTime(target ? target.time : '');
    setFTag(target ? target.tag ?? '' : '');
    setModalOpen(true);
  };
  const saveModal = (): void => {
    const name = fName.trim();
    const date = fDate;
    const time = fTime;
    const tag = fTag.trim();
    if (!name) { onPending('请填写姓名或备注'); return; }
    if (!date) { onPending('请选择公历生日'); return; }
    const year = Number(date.slice(0, 4));
    if (year < BAZI_MIN_YEAR || year > BAZI_MAX_YEAR) {
      onPending(`年份需在 ${BAZI_MIN_YEAR} 至 ${BAZI_MAX_YEAR} 之间`);
      return;
    }
    if (!time) { onPending('请选择出生时间'); return; }
    if (editingId) {
      const target = profiles.find((p) => p.id === editingId);
      if (!target) { onPending('命例不存在或已删除'); return; }
      run(wb.bazi.saveProfile({ ...target, name, gender: Number(fGender), date, time, tag: tag || undefined }), `已更新「${name}」`);
    } else {
      const id = crypto.randomUUID();
      run(
        wb.bazi.saveProfile({ id, name, gender: Number(fGender), date, time, tag: tag || undefined }),
        `已保存「${name}」并排盘`,
      );
      switchProfile(id);
    }
    setModalOpen(false);
  };

  const askAI = (): void => {
    if (!profile || !charts?.bazi || savingForAI) return;
    const prompt = `请解读当前命例的${TABS.find(item => item.key === tab)!.label}盘面，先概述最重要的特征，再说明依据与资料限制。`;
    if (noteDraft === (storeData?.notes[profile.id] ?? '')) { onAskAI(prompt, profile.id, tab); return; }
    window.clearTimeout(noteTimer.current);
    setSavingForAI(true);
    void wb.bazi.saveNote(profile.id, noteDraft).then(raw => {
      setStoreData(raw as BaziStoreData);
      onAskAI(prompt, profile.id, tab);
    }, error => onPending(errorText(error))).finally(() => setSavingForAI(false));
  };

  if (loadError) {
    return (
      <section className="view on panel glass bazi-workspace" id="view-bazi">
        <div className="bazi-load-error todo-load-error" role="alert">{loadError}</div>
      </section>
    );
  }
  if (!storeData) {
    return (
      <section className="view on panel glass bazi-workspace" id="view-bazi">
        <div className="todo-loading" role="status">正在读取命例库…</div>
      </section>
    );
  }

  const profiles = storeData.profiles;
  const chart = charts?.bazi ?? null;
  const ziwei = charts?.ziwei ?? null;
  const astro = charts?.astro ?? null;
  const soulPalace = ziwei?.palaces.find((p) => p.name === '命宫') ?? null;
  const mutagenList = ziwei
    ? ziwei.palaces.flatMap((p) => [...p.majorStars, ...p.minorStars]
      .filter((s) => s.mutagen).map((s) => ({ star: s, palace: p.name })))
    : [];

  return (
    <section className="view on panel glass bazi-workspace" id="view-bazi">
      <div className="greet">
        <div>
          <h1>命理</h1>
          <div className="gsub">从出生那一刻聊起：填好出生信息，八字、紫微斗数和占星三种命盘就到齐了。边看边记，还能请 AI 一起琢磨。</div>
        </div>
        <div className="gbtns">
          <button className="btn btn-sec" onClick={() => startEdit(null)}><Plus size={15} weight="bold" />新建命例</button>
          <button className="btn btn-pri" disabled={!profile || !chart || savingForAI} onClick={askAI}>
            <Sparkle size={15} weight="fill" />{savingForAI ? '保存笔记…' : 'AI 解读'}
          </button>
        </div>
      </div>

      {profiles.length === 0 ? (
        <div className="bazi-empty glass">
          <b>还没有命例</b>
          <p>新建一个命例(姓名 + 公历生日 + 出生时间 + 性别),即可排出八字、紫微与占星三张盘,并可交给 AI 助手解读。</p>
          <button className="btn btn-pri" onClick={() => startEdit(null)}><Plus size={15} weight="bold" />新建命例</button>
        </div>
      ) : (
        <>
          <div className="bazi-pbar">
            <div className={`bazi-psel${pselOpen ? ' open' : ''}`} ref={pselRef}>
              <button
                className="bazi-psel-btn"
                aria-haspopup="listbox"
                aria-expanded={pselOpen}
                title="切换命例"
                onClick={() => setPselOpen((v) => !v)}
              >
                {profile && (
                  <>
                    <span className="bazi-pav" aria-hidden="true">{profile.name.slice(0, 1)}</span>
                    <span className="bazi-pname">{profile.name}</span>
                    {profile.tag && <span className="bazi-ptag">{profile.tag}</span>}
                    <span className="bazi-pbirth">{profile.date} · {profile.gender === 1 ? '男' : '女'}</span>
                    <CaretDown size={12} weight="bold" className="bazi-psel-caret" />
                  </>
                )}
              </button>
              {pselOpen && (
                <div className="bazi-psel-menu" role="listbox" aria-label="命例列表">
                  {profiles.map((p) => (
                    <button
                      key={p.id}
                      role="option"
                      aria-selected={p.id === profile?.id}
                      className={p.id === profile?.id ? 'bazi-psel-item on' : 'bazi-psel-item'}
                      onClick={() => { switchProfile(p.id); setPselOpen(false); }}
                    >
                      <span className="bazi-pav" aria-hidden="true">{p.name.slice(0, 1)}</span>
                      <span className="bazi-pname">{p.name}</span>
                      {p.tag && <span className="bazi-ptag">{p.tag}</span>}
                      <span className="bazi-pbirth">{p.date} · {p.gender === 1 ? '男' : '女'}</span>
                      <span
                        className="bazi-psel-act edit"
                        role="button"
                        aria-label={`编辑 ${p.name}`}
                        title="编辑命例"
                        onClick={(e) => { e.stopPropagation(); setPselOpen(false); startEdit(p); }}
                      >
                        <Pencil size={11} />
                      </span>
                      <span
                        className="bazi-psel-act del"
                        role="button"
                        tabIndex={0}
                        aria-label={`删除 ${p.name}`}
                        title="删除命例"
                        onClick={(e) => { e.stopPropagation(); setPselOpen(false); setDeleteTarget(p); }}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setPselOpen(false); setDeleteTarget(p); } }}
                      >
                        <TrashSimple size={14} />
                      </span>
                    </button>
                  ))}
                  <button className="bazi-psel-new" onClick={() => { setPselOpen(false); startEdit(null); }}>
                    <Plus size={14} />新建命例
                  </button>
                </div>
              )}
            </div>
          </div>

          {charts?.error && <div className="bazi-chart-error" role="alert">{charts.error}</div>}

          <div className="bazi-syseg" role="tablist" aria-label="命理系统">
            {TABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                className={tab === t.key ? 'on' : ''}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {profile && chart && (
            <div className="bazi-tabview" role="tabpanel" hidden={tab !== 'bazi'}>
              <div className="bazi-cols">
                <div><BaziPan profile={profile} chart={chart} openDy={openDy} onOpenDy={setOpenDy} /></div>
                <div>
                  <div className="panel glass">
                    <div className="phead"><span className="ptitle">五行</span><span className="pcount">八字 8 字统计</span></div>
                    <div>
                      {WUXING_ORDER.map((wx) => {
                        const n = chart.count[wx] ?? 0;
                        const max = Math.max(...WUXING_ORDER.map((w) => chart.count[w] ?? 0));
                        return (
                          <div key={wx} className="bazi-wxrow">
                            <span className="bazi-wxdot" style={{ background: WX_VAR[wx] }} />
                            <span className="bazi-wxname">{wx}</span>
                            <span className="bazi-wxnum">{n}</span>
                            <span className="bazi-wxbar"><i style={{ width: max ? `${(n / max) * 100}%` : '0%', background: WX_VAR[wx] }} /></span>
                            <span className={max > 0 && n === max ? 'bazi-wxflag strong' : 'bazi-wxflag'}>
                              {max > 0 && n === max ? '最多' : n === 0 ? '未见' : ''}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="bazi-wxsum">
                      {(() => {
                        const max = Math.max(...WUXING_ORDER.map((w) => chart.count[w] ?? 0));
                        const most = WUXING_ORDER.filter((w) => (chart.count[w] ?? 0) === max);
                        const missing = WUXING_ORDER.filter((w) => (chart.count[w] ?? 0) === 0);
                        return <><b>{most.join('、')}</b>数量最多 · {missing.length ? <>八字中未见 <b>{missing.join('、')}</b></> : '五行均出现'} · 日主属{chart.dayWuXing}</>;
                      })()}
                    </div>
                  </div>
                  <div className="panel glass">
                    <div className="phead"><span className="ptitle">神煞</span><span className="pcount">{`${collectShenSha(chart).length} 项`}</span></div>
                    <div className="bazi-ssrow">
                      {collectShenSha(chart).length ? collectShenSha(chart).map((h) => (
                        <span key={h.key} className="bazi-sschip">{h.name}<span className="bazi-sspos">{h.pos}</span></span>
                      )) : <div className="bazi-ssempty">本命盘未检出常用神煞。</div>}
                    </div>
                  </div>
                  <NoteCard value={noteDraft} onChange={onNote} />
                </div>
              </div>
            </div>
          )}

          {profile && ziwei && soulPalace && (
            <div className="bazi-tabview" role="tabpanel" hidden={tab !== 'ziwei'}>
              <div className="bazi-cols">
                <div><ZiweiPan profile={profile} chart={ziwei} /></div>
                <div>
                  <div className="panel glass">
                    <div className="phead"><span className="ptitle">命宫</span><span className="pcount">{soulPalace.ganZhi}</span></div>
                    <div className="bazi-hintp">
                      <b>{soulPalace.majorStars.map((s) => `${s.name}${s.brightness ? `(${s.brightness})` : ''}`).join('、') || '空宫'}</b>
                      坐命{soulPalace.isBodyPalace ? ',身宫同宫' : ''};命主 <b>{ziwei.soul}</b> · 身主 <b>{ziwei.body}</b> · {ziwei.fiveElementsClass}。
                    </div>
                  </div>
                  <div className="panel glass">
                    <div className="phead"><span className="ptitle">四化</span><span className="pcount">{`${mutagenList.length} 颗`}</span></div>
                    <div className="bazi-ssrow">
                      {mutagenList.map(({ star, palace }) => (
                        <span key={`${palace}-${star.name}`} className="bazi-sschip">
                          {star.name} 化{star.mutagen}
                          <span className="bazi-sspos">{palace}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                  <NoteCard value={noteDraft} onChange={onNote} />
                </div>
              </div>
            </div>
          )}

          {profile && astro && (
            <div className="bazi-tabview" role="tabpanel" hidden={tab !== 'astro'}>
              <div className="bazi-cols">
                <div><AstroPan profile={profile} chart={astro} /></div>
                <div>
                  <div className="panel glass">
                    <div className="phead"><span className="ptitle">行星落座</span><span className="pcount">回归制 · 东八区</span></div>
                    <table className="bazi-astab">
                      <thead>
                        <tr><th aria-label="符号" /><th>行星</th><th>星座</th><th>度数</th></tr>
                      </thead>
                      <tbody>
                        {astro.bodies.map((b) => {
                          const deg = Math.floor(b.lon % 30);
                          const min = Math.round((b.lon % 1) * 60);
                          const sign = Math.floor(b.lon / 30);
                          const names = ['白羊', '金牛', '双子', '巨蟹', '狮子', '处女', '天秤', '天蝎', '射手', '摩羯', '水瓶', '双鱼'];
                          return (
                            <tr key={b.key}>
                              <td className="glyph">{b.glyph}</td>
                              <td>{b.name}</td>
                              <td>{names[sign]}</td>
                              <td>{deg}°{String(min).padStart(2, '0')}′{b.retro && <span className="bazi-rx">℞</span>}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div className="bazi-notehint">宫位与上升点需要出生地经纬度,待后续版本加入。</div>
                  </div>
                  <NoteCard value={noteDraft} onChange={onNote} />
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {modalOpen && (
        <Modal
          title={editingId ? '编辑命例' : '新建命例'}
          close={() => setModalOpen(false)}
          subhead={<span className="field-help">填好公历生日、出生时间和性别，就能查看三种命盘。</span>}
        >
          <div className="form-body">
            <div className="bazi-form">
              <div className="bazi-form-field">
                <span className="bazi-form-label">姓名 / 备注</span>
                <input aria-label="姓名或备注" placeholder="如:林川" maxLength={12} value={fName} onChange={(e) => setFName(e.target.value)} />
              </div>
              <div className="bazi-form-field">
                <span className="bazi-form-label">性别</span>
                <Segmented
                  aria-label="性别"
                  value={fGender}
                  options={[{ value: '1', label: '男' }, { value: '0', label: '女' }]}
                  onChange={setFGender}
                />
              </div>
              <div className="bazi-form-field">
                <span className="bazi-form-label">公历生日</span>
                <DatePicker value={fDate} onChange={setFDate} />
              </div>
              <div className="bazi-form-field">
                <span className="bazi-form-label">出生时间</span>
                <TimePicker value={fTime} onChange={setFTime} />
                <span className="field-help">按出生时的钟表时间填写；占星暂按东八区换算。</span>
              </div>
              <div className="bazi-form-field">
                <span className="bazi-form-label">标签(可选)</span>
                <input aria-label="标签" placeholder="如:自己 / 家人 / 朋友" maxLength={6} value={fTag} onChange={(e) => setFTag(e.target.value)} />
              </div>
            </div>
            <div className="bazi-form-actions">
              <button className="btn btn-sec" onClick={() => setModalOpen(false)}>取消</button>
              <button className="btn btn-pri" onClick={saveModal}>{editingId ? '保存' : '保存并排盘'}</button>
            </div>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <Modal title="删除命例" close={() => setDeleteTarget(null)}>
          <div className="form-body">
            <p>删除「{deleteTarget.name}」？对应的笔记也会一并删除，且无法恢复。</p>
            <div className="bazi-form-actions">
              <button className="btn btn-sec" onClick={() => setDeleteTarget(null)}>取消</button>
              <button className="btn btn-pri" onClick={() => removeProfile(deleteTarget)}>确认删除</button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
