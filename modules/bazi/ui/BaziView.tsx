import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CaretDown, Pencil, Plus, Sparkle, TrashSimple } from '@phosphor-icons/react';
import { buildChart } from '../compute';
import { buildZiwei, type ZiweiChart } from '../ziwei';
import { buildAstro, type AstroChart } from '../astro';
import {
  findShenSha,
  type AstroHouseSystem, type BaziChart, type BaziProfile, type BaziStoreData,
} from '../../../shared/bazi-contracts';
import { DatePicker, Modal, Segmented, Select, TimePicker, errorText } from '../../../src/ui/controls';
import { WX_VAR, WUXING_ORDER } from './tokens';
import { CHINA_REGIONS, findRegionByCoords, regionLabel, type ChinaRegionNode } from '../../../shared/china-region-geo';
import { BaziPan } from './BaziPan';
import { ZiweiPan } from './ZiweiPan';
import { AstroDetails, AstroPan, AstroSummary } from './AstroPan';
import { DEFAULT_ASPECT_FILTER, matchingAspect, type AstroAspectFilter, type AstroSection, type AstroSelection } from './astro-insights';
import { resolveAstroTime, type AstroTimeChoice } from '../../../shared/astro-time';
import { AstroTimeFields } from './AstroTimeFields';
import { AstroReading, DEFAULT_ASTRO_READING_DRAFT, type AstroReadingDraft } from './AstroReading';
import { ASTRO_READING_TOPICS, type AstroReadingTopic } from '../../../shared/astro-reading';
import type { AiConfig } from '../../../shared/workbench-api';

const wb = window.workbench;
const CUR_KEY = 'wb.bazi.curProfileId';
const BAZI_MIN_YEAR = 1900;
const BAZI_MAX_YEAR = 2100;
const astroReadingDrafts = new Map<string, AstroReadingDraft>();

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

export function BaziView({ onPending, onAskAI, onCurrentProfile, requestedProfileId, requestedDayLocate, onDayLocated, aiBusy = false, onViewAI, onOpenAISettings }: {
  onPending(message: string): void;
  onAskAI(prompt: string, profileId: string, system: 'bazi' | 'ziwei' | 'astro', topic?: AstroReadingTopic): void | Promise<void>;
  onCurrentProfile(profile: { id: string; name: string; system: 'bazi' | 'ziwei' | 'astro' } | null): void;
  requestedProfileId?: string | null;
  requestedDayLocate?: { profileId: string; nonce: number } | null;
  onDayLocated(): void;
  aiBusy?: boolean;
  onViewAI?(): void;
  onOpenAISettings?(): void;
}) {
  const [storeData, setStoreData] = useState<BaziStoreData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [curId, setCurId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('bazi');
  const [houseSystemSaving, setHouseSystemSaving] = useState(false);
  const [astroSection, setAstroSection] = useState<AstroSection>('positions');
  const [astroSelection, setAstroSelection] = useState<AstroSelection>(null);
  const [astroFilter, setAstroFilter] = useState<AstroAspectFilter>(DEFAULT_ASPECT_FILTER);
  const [astroShowPoints, setAstroShowPoints] = useState(true);
  const [astroShowMinor, setAstroShowMinor] = useState(true);
  const [readingInput, setReadingInput] = useState<{ profileId: string; draft: AstroReadingDraft } | null>(null);
  const [readingConfig, setReadingConfig] = useState<AiConfig | null>(null);
  const [readingConfigError, setReadingConfigError] = useState('');
  const [readingConfigReload, setReadingConfigReload] = useState(0);
  const [readingStarting, setReadingStarting] = useState(false);
  const readingStartingRef = useRef(false);
  const [openDy, setOpenDy] = useState(-1);
  const [pselOpen, setPselOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BaziProfile | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fName, setFName] = useState('');
  const [fGender, setFGender] = useState('1');
  const [fDate, setFDate] = useState('');
  const [fTime, setFTime] = useState('');
  const [fTimeZone, setFTimeZone] = useState<string | undefined>();
  const [fTimeChoice, setFTimeChoice] = useState<AstroTimeChoice | undefined>();
  const [profileSaving, setProfileSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const saveErrorRef = useRef<HTMLDivElement>(null);
  const [fTag, setFTag] = useState('');
  const [fProv, setFProv] = useState('none');
  const [fCity, setFCity] = useState('');
  const [fDist, setFDist] = useState('');
  const [fPlace, setFPlace] = useState('');
  const [fLat, setFLat] = useState('');
  const [fLon, setFLon] = useState('');
  const pselRef = useRef<HTMLDivElement>(null);
  const loadedOnce = useRef(false);
  const handledRequest = useRef<string | null>(null);
  const handledLocate = useRef(0);
  const formTime = useMemo(() => fDate && fTime
    ? resolveAstroTime({ date: fDate, time: fTime, astroTimeZone: fTimeZone, astroTimeChoice: fTimeChoice }) : null,
  [fDate, fTime, fTimeZone, fTimeChoice]);
  useEffect(() => { if (saveError) saveErrorRef.current?.focus(); }, [saveError]);

  useEffect(() => {
    if (loadedOnce.current) return;
    loadedOnce.current = true;
    void wb.bazi.list().then((data) => {
      setStoreData(data);
      const saved = requestedProfileId ?? localStorage.getItem(CUR_KEY);
      setCurId(data.profiles.some((p) => p.id === saved) ? saved : data.profiles[0]?.id ?? null);
    }, (e) => setLoadError(errorText(e)));
  }, []);

  const profile: BaziProfile | null = storeData?.profiles.find((p) => p.id === curId)
    ?? storeData?.profiles[0]
    ?? null;
  const readingDraft = (readingInput?.profileId === profile?.id ? readingInput?.draft : profile && astroReadingDrafts.get(profile.id)) ?? DEFAULT_ASTRO_READING_DRAFT;
  const readingConfigured = !!readingConfig?.aiEnabled && readingConfig.hasConnection;
  const changeReadingDraft = (draft: AstroReadingDraft): void => {
    if (!profile) return;
    astroReadingDrafts.set(profile.id, draft);
    setReadingInput({ profileId: profile.id, draft });
  };
  useEffect(() => {
    if (tab !== 'astro') return;
    let live = true, updated = false;
    setReadingConfig(null); setReadingConfigError('');
    const unsubscribe = wb.ai.onConfigChanged?.(config => {
      if (live) { updated = true; setReadingConfig(config); setReadingConfigError(''); }
    });
    void wb.ai.config().then(config => {
      if (live && !updated) setReadingConfig(config);
    }, error => { if (live && !updated) setReadingConfigError(`AI 配置读取失败：${errorText(error)}`); });
    return () => { live = false; unsubscribe?.(); };
  }, [tab, readingConfigReload]);

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
      let astro: AstroChart | null = null;
      let astroError = '';
      try { astro = buildAstro(profile); } catch (e) { astroError = errorText(e); }
      return {
        bazi: buildChart(profile),
        ziwei: buildZiwei(profile),
        astro, astroError,
        error: '',
      };
    } catch (e) {
      return { bazi: null as BaziChart | null, ziwei: null as ZiweiChart | null, astro: null as AstroChart | null, astroError: '', error: errorText(e) };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, profile?.date, profile?.time, profile?.gender, profile?.lat, profile?.lon, profile?.astroHouseSystem, profile?.astroTimeZone, profile?.astroTimeChoice]);

  const visibleAstro = useMemo(() => {
    if (!charts?.astro) return null;
    const bodies = charts.astro.bodies.filter(body => body.kind === 'planet' || (body.kind === 'point' ? astroShowPoints : astroShowMinor));
    const names = new Set(bodies.map(body => body.name));
    return { ...charts.astro, bodies, aspects: charts.astro.aspects.filter(aspect => names.has(aspect.a) && names.has(aspect.b)) };
  }, [charts?.astro, astroShowPoints, astroShowMinor]);

  const changeAstroDisplay = (kind: 'point' | 'minor', show: boolean): void => {
    if (kind === 'point') setAstroShowPoints(show); else setAstroShowMinor(show);
    setAstroSelection(null);
    setAstroFilter(DEFAULT_ASPECT_FILTER);
  };

  // 切换命例:重置流年展开
  useEffect(() => {
    setOpenDy(-1);
  }, [profile?.id]);

  useEffect(() => {
    setAstroSelection(null);
    setAstroSection('positions');
    setAstroFilter(DEFAULT_ASPECT_FILTER);
  }, [profile?.id, profile?.date, profile?.time, profile?.lat, profile?.lon, profile?.astroTimeZone, profile?.astroTimeChoice]);

  useEffect(() => {
    if (astroSelection?.kind === 'house' && !charts?.astro?.houseCusps) setAstroSelection(null);
  }, [charts?.astro?.houseCusps, astroSelection]);

  const selectAstro = (next: AstroSelection): void => {
    const same = (next?.kind === 'body' && astroSelection?.kind === 'body' && next.key === astroSelection.key)
      || (next?.kind === 'house' && astroSelection?.kind === 'house' && next.number === astroSelection.number)
      || (next?.kind === 'aspect' && astroSelection?.kind === 'aspect' && next.index === astroSelection.index);
    setAstroSelection(same ? null : next);
    if (next && astroSection !== 'reading') setAstroSection(next.kind === 'body' ? 'positions' : next.kind === 'house' ? 'houses' : 'aspects');
    if (next?.kind === 'body') setAstroFilter(DEFAULT_ASPECT_FILTER);
  };
  const filterAstro = (filter: AstroAspectFilter): void => {
    setAstroFilter(filter);
    if (astroSelection?.kind !== 'aspect' || !visibleAstro || !matchingAspect(visibleAstro.aspects[astroSelection.index], filter)) setAstroSelection(null);
  };

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

  const apply = (raw: BaziStoreData, okMsg?: string): void => {
    setStoreData(raw);
    if (okMsg) onPending(okMsg);
  };
  const run = (action: Promise<BaziStoreData>, okMsg?: string): void => {
    void action.then((raw) => apply(raw, okMsg), (e) => onPending(errorText(e)));
  };

  const changeHouseSystem = async (astroHouseSystem: AstroHouseSystem): Promise<void> => {
    if (!profile || houseSystemSaving) return;
    const { createdAt: _createdAt, ...input } = profile;
    setHouseSystemSaving(true);
    try {
      apply(await wb.bazi.saveProfile({ ...input, astroHouseSystem }));
    } catch (error) {
      onPending(errorText(error));
    } finally {
      setHouseSystemSaving(false);
    }
  };

  const switchProfile = (id: string): void => {
    setCurId(id);
    localStorage.setItem(CUR_KEY, id);
  };
  const removeProfile = (target: BaziProfile): void => {
    run(wb.bazi.removeProfile(target.id), `已删除「${target.name}」`);
    if (target.id === profile?.id) localStorage.removeItem(CUR_KEY);
    setDeleteTarget(null);
  };

  const startEdit = (target: BaziProfile | null): void => {
    setEditingId(target ? target.id : null);
    setFName(target ? target.name : '');
    setFGender(target ? String(target.gender) : '1');
    setFDate(target ? target.date : '');
    setFTime(target ? target.time : '');
    setFTimeZone(target ? target.astroTimeZone : 'Asia/Shanghai');
    setFTimeChoice(target?.astroTimeChoice);
    setSaveError('');
    setFTag(target ? target.tag ?? '' : '');
    setFPlace(target ? target.place ?? '' : '');
    const region = target && target.lat !== undefined && target.lon !== undefined
      ? findRegionByCoords(target.lat, target.lon)
      : null;
    if (region) {
      const provinceNode = CHINA_REGIONS.find((p) => p.name === region.province);
      // 直辖市/港澳:反查把区县记在 city 位(市=省),归位:市级=省名,区县=原 city
      const direct = Boolean(provinceNode?.children?.length) && (provinceNode?.children ?? []).every((c) => (c.children?.length ?? 0) === 0);
      setFProv(region.province);
      setFCity(direct ? region.province : region.city ?? '');
      setFDist(direct ? region.city ?? region.district ?? '' : region.district ?? '');
    } else {
      setFProv(target?.lat !== undefined && target?.lon !== undefined ? 'custom' : 'none');
      setFCity(''); setFDist('');
    }
    setFLat(target && target.lat !== undefined ? String(target.lat) : '');
    setFLon(target && target.lon !== undefined ? String(target.lon) : '');
    setModalOpen(true);
  };
  // 出生地三级联动:省 → 市 → 区/县;直辖市的区县直接挂在省级(无市级);台湾省仅省级
  const provNode: ChinaRegionNode | null = fProv !== 'none' && fProv !== 'custom'
    ? CHINA_REGIONS.find((p) => p.name === fProv) ?? null
    : null;
  // 直辖市/港澳:区县直接挂省级 → 合成与省同名的市级节点,保证省/市/区三级恒在
  const isDirect = Boolean(provNode?.children?.length) && (provNode?.children ?? []).every((c) => (c.children?.length ?? 0) === 0);
  const cityOptions: ChinaRegionNode[] = provNode
    ? isDirect
      ? [{ name: provNode.name, lat: provNode.lat, lon: provNode.lon, children: provNode.children ?? [] }]
      : provNode.children ?? []
    : [];
  const applyRegion = (province: ChinaRegionNode | null, cityName: string | null, districtName: string | null): void => {
    const city = province?.children?.find((c) => c.name === cityName) ?? null;
    const district = (city?.children ?? province?.children ?? []).find((d) => d.name === districtName) ?? null;
    const leaf = district ?? city ?? province;
    if (!leaf) return;
    setFPlace(regionLabel(province?.name ?? '', cityName, districtName));
    setFLat(String(leaf.lat));
    setFLon(String(leaf.lon));
  };

  const saveModal = async (): Promise<void> => {
    if (profileSaving) return;
    setSaveError('');
    const name = fName.trim();
    const date = fDate;
    const time = fTime;
    const tag = fTag.trim();
    const place = fPlace.trim();
    const lat = fLat.trim() === '' ? undefined : Number(fLat);
    const lon = fLon.trim() === '' ? undefined : Number(fLon);
    if ((lat !== undefined) !== (lon !== undefined)) { onPending('经纬度需成对填写'); return; }
    if (lat !== undefined && (Number.isNaN(lat) || lat < -90 || lat > 90)) { onPending('纬度需在 -90 至 90 之间'); return; }
    if (lon !== undefined && (Number.isNaN(lon) || lon < -180 || lon > 180)) { onPending('经度需在 -180 至 180 之间'); return; }
    const birth = { place: place || undefined, lat, lon };
    if (!name) { onPending('请填写姓名或备注'); return; }
    if (!date) { onPending('请选择公历生日'); return; }
    const year = Number(date.slice(0, 4));
    if (year < BAZI_MIN_YEAR || year > BAZI_MAX_YEAR) {
      onPending(`年份需在 ${BAZI_MIN_YEAR} 至 ${BAZI_MAX_YEAR} 之间`);
      return;
    }
    if (!time) { onPending('请选择出生时间'); return; }
    if (formTime?.status !== 'ready') { setSaveError(formTime?.message ?? '请检查出生日期和时间。'); return; }
    if (editingId && !profiles.some(p => p.id === editingId)) { setSaveError('命例不存在或已删除'); return; }
    const id = editingId ?? crypto.randomUUID();
    const target = profiles.find(p => p.id === editingId);
    // 未改时区的旧档案不新增字段；已保存过时区时，显式清除过期的重复时间选择。
    const timeFields = fTimeZone !== undefined || target?.astroTimeZone !== undefined
      ? { astroTimeZone: fTimeZone, astroTimeChoice: formTime.value.choice } : {};
    setProfileSaving(true);
    try {
      apply(await wb.bazi.saveProfile({ id, name, gender: Number(fGender), date, time, tag: tag || undefined, ...birth, ...timeFields }),
        editingId ? `已更新「${name}」` : `已保存「${name}」并排盘`);
      if (!editingId) switchProfile(id);
      setModalOpen(false);
    } catch (error) {
      setSaveError(`保存失败：${errorText(error)}。填写的内容已保留，请重试。`);
    } finally {
      setProfileSaving(false);
    }
  };

  const askAI = (): void => {
    if (!profile || !charts?.bazi || (tab === 'astro' && !charts.astro)) return;
    if (tab === 'astro') {
      setAstroSection('reading');
      if (aiBusy || readingStartingRef.current) { onViewAI?.(); return; }
      if (!readingConfig || readingConfigError) return;
      if (!readingConfigured) { onOpenAISettings?.(); return; }
      readingStartingRef.current = true; setReadingStarting(true);
      const prompt = readingDraft.question.trim() || `请结合我的完整星盘，围绕“${ASTRO_READING_TOPICS[readingDraft.topic].label}”做整体分析，并说明盘面依据。`;
      void Promise.resolve(onAskAI(prompt, profile.id, 'astro', readingDraft.topic))
        .catch(error => onPending(errorText(error)))
        .finally(() => { readingStartingRef.current = false; setReadingStarting(false); });
      return;
    }
    const prompt = `请解读当前命例的${TABS.find(item => item.key === tab)!.label}盘面，先概述最重要的特征，再说明依据与资料限制。`;
    onAskAI(prompt, profile.id, tab);
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
  const astro = visibleAstro;
  const soulPalace = ziwei?.palaces.find((p) => p.name === '命宫') ?? null;
  const mutagenList = ziwei
    ? ziwei.palaces.flatMap((p) => [...p.majorStars, ...p.minorStars]
      .filter((s) => s.mutagen).map((s) => ({ star: s, palace: p.name })))
    : [];

  const hasProfiles = profiles.length > 0;

  return (
    <section className="view on panel glass bazi-workspace" id="view-bazi">
      <div className="bazi-top">
        <div className="bazi-top-lead">
          <div className="greet">
            <div>
              <h1>命理</h1>
              <div className="gsub">从出生那一刻聊起：填好出生信息，八字、紫微斗数和占星三种命盘就到齐了。还能请 AI 一起琢磨。</div>
            </div>
          </div>
          {hasProfiles && (
            <div className="bazi-top-switches">
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
              {tab === 'astro' && astro && <AstroSummary chart={astro} />}
            </div>
          )}
        </div>
        <div className="bazi-top-side">
          <div className="gbtns">
            <button className="btn btn-sec" onClick={() => startEdit(null)}><Plus size={15} weight="bold" />新建命例</button>
            <button className="btn btn-pri" disabled={!profile || !chart || (tab === 'astro' && (!astro || (!aiBusy && !readingStarting && (!readingConfig || !!readingConfigError))))} onClick={askAI}>
              <Sparkle size={15} weight="fill" />{tab === 'astro' && (aiBusy || readingStarting) ? '查看解读' : tab === 'astro' && readingConfig && !readingConfigured ? '去配置 AI' : 'AI 解读'}
            </button>
          </div>
          {hasProfiles && (
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
          )}
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
          {charts?.error && <div className="bazi-chart-error" role="alert">{charts.error}</div>}
          {tab === 'astro' && charts?.astroError && <div className="bazi-chart-error" role="alert">
            <p>{charts.astroError}</p><button className="btn btn-sec" onClick={() => startEdit(profile)}>修改出生时间与时区</button>
          </div>}

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
                </div>
              </div>
            </div>
          )}

          {profile && astro && (
            <div className="bazi-tabview bazi-astro-view" role="tabpanel" hidden={tab !== 'astro'}>
              <div className="bazi-cols bazi-as-cols">
                <div><AstroPan profile={profile} chart={astro} onHouseSystemChange={changeHouseSystem} houseSystemSaving={houseSystemSaving}
                  selection={astroSelection} onSelect={selectAstro}
                  visibleAspects={astroSection === 'aspects' ? astro.aspects.flatMap((aspect, index) => matchingAspect(aspect, astroFilter) ? [index] : []) : undefined} /></div>
                <AstroDetails chart={astro} section={astroSection} onSectionChange={setAstroSection}
                  selection={astroSelection} onSelect={selectAstro} filter={astroFilter} onFilterChange={filterAstro}
                  reading={<AstroReading draft={readingDraft} onChange={changeReadingDraft} busy={aiBusy || readingStarting}
                    checking={!readingConfig && !readingConfigError} configured={readingConfigured} configError={readingConfigError}
                    onRetryConfig={() => setReadingConfigReload(value => value + 1)} onStart={askAI} />}
                  showPoints={astroShowPoints} showMinor={astroShowMinor} onDisplayChange={changeAstroDisplay} />
              </div>
            </div>
          )}
        </>
      )}

      {modalOpen && (
        <Modal
          title={editingId ? '编辑命例' : '新建命例'}
          className="bazi-profile-modal"
          busy={profileSaving}
          close={() => { if (!profileSaving) setModalOpen(false); }}
          subhead={<span className="field-help">填好公历生日、出生时间和性别，就能查看三种命盘。</span>}
        >
          <div className="form-body">
            <fieldset className="bazi-form" disabled={profileSaving}>
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
                <DatePicker value={fDate} onChange={value => { setFDate(value); setFTimeChoice(undefined); setSaveError(''); }} yearRange={{ min: BAZI_MIN_YEAR, max: BAZI_MAX_YEAR }} />
              </div>
              <div className="bazi-form-field">
                <span className="bazi-form-label">出生时间</span>
                <TimePicker value={fTime} onChange={value => { setFTime(value); setFTimeChoice(undefined); setSaveError(''); }} />
                <span className="field-help">按出生记录上的当地钟表时间填写。</span>
              </div>
              <div className="bazi-form-field">
                <span className="bazi-form-label">标签(可选)</span>
                <input aria-label="标签" placeholder="如:自己 / 家人 / 朋友" maxLength={6} value={fTag} onChange={(e) => setFTag(e.target.value)} />
              </div>
              <div className="bazi-form-field bazi-form-wide">
                <span className="bazi-form-label">出生地(可选,用于占星宫位与上升点)</span>
                <div className="bazi-region-row">
                <Select
                  aria-label="出生省份"
                  value={fProv}
                  options={[
                    { value: 'none', label: '未填写' },
                    ...CHINA_REGIONS.map((p) => ({ value: p.name, label: p.name })),
                    { value: 'custom', label: '自定义坐标…' },
                  ]}
                  onChange={(value) => {
                    setFProv(value); setFCity(''); setFDist('');
                    setFPlace(''); setFLat(''); setFLon('');
                    if (value === 'none' || value === 'custom') return;
                    const province = CHINA_REGIONS.find((p) => p.name === value);
                    if (!province) return;
                    const children = province.children ?? [];
                    const direct = children.length > 0 && children.every((c) => (c.children?.length ?? 0) === 0);
                    if (direct) {
                      setFCity(province.name);
                      const first = children[0];
                      setFDist(first.name);
                      applyRegion(province, '', first.name);
                    } else {
                      const firstCity = children[0];
                      if (firstCity) {
                        setFCity(firstCity.name);
                        const firstDistrict = firstCity.children?.[0];
                        if (firstDistrict) setFDist(firstDistrict.name);
                        applyRegion(province, firstCity.name, firstDistrict?.name ?? null);
                      } else {
                        applyRegion(province, null, null);
                      }
                    }
                  }}
                />
                {(provNode?.children?.length ?? 0) > 0 && (
                <Select
                  aria-label="出生城市"
                  value={fCity}
                  options={cityOptions.map((c) => ({ value: c.name, label: c.name }))}
                  onChange={(value) => {
                    setFCity(value); setFDist('');
                    const province = CHINA_REGIONS.find((p) => p.name === fProv);
                    const direct = (province?.children ?? []).length > 0 && (province?.children ?? []).every((c) => (c.children?.length ?? 0) === 0);
                    const city = direct
                      ? { name: province!.name, children: province!.children ?? [] }
                      : province?.children?.find((c) => c.name === value);
                    const firstDistrict = city?.children?.[0];
                    if (firstDistrict) setFDist(firstDistrict.name);
                    applyRegion(province ?? null, direct ? '' : value, firstDistrict?.name ?? null);
                  }}
                />
                )}
                {(cityOptions.find((c) => c.name === fCity)?.children?.length ?? 0) > 0 && (
                <Select
                  aria-label="出生区县"
                  value={fDist}
                  options={(cityOptions.find((c) => c.name === fCity)?.children ?? []).map((d) => ({ value: d.name, label: d.name }))}
                  onChange={(value) => {
                    setFDist(value);
                    const province = CHINA_REGIONS.find((p) => p.name === fProv);
                    applyRegion(province ?? null, isDirect ? '' : fCity || null, value);
                  }}
                />
                )}
                </div>
              </div>
              {fProv === 'custom' && (
                <>
                  <div className="bazi-form-field bazi-form-wide">
                    <span className="bazi-form-label">地点名称</span>
                    <input aria-label="地点名称" placeholder="如:国外城市或自定义地点" maxLength={30} value={fPlace} onChange={(e) => setFPlace(e.target.value)} />
                  </div>
                  <div className="bazi-form-field">
                    <span className="bazi-form-label">纬度</span>
                    <input aria-label="纬度" placeholder="如:31.2304" inputMode="decimal" value={fLat} onChange={(e) => setFLat(e.target.value)} />
                  </div>
                  <div className="bazi-form-field">
                    <span className="bazi-form-label">经度</span>
                    <input aria-label="经度" placeholder="如:121.4737" inputMode="decimal" value={fLon} onChange={(e) => setFLon(e.target.value)} />
                  </div>
                </>
              )}
              <AstroTimeFields zone={fTimeZone} choice={fTimeChoice} resolution={formTime} disabled={profileSaving}
                onZoneChange={value => { setFTimeZone(value); setFTimeChoice(undefined); setSaveError(''); }}
                onChoiceChange={value => { setFTimeChoice(value); setSaveError(''); }} />
            </fieldset>
            {saveError && <div ref={saveErrorRef} className="bazi-save-error" role="alert" tabIndex={-1}>{saveError}</div>}
            <div className="bazi-form-actions">
              <button className="btn btn-sec" disabled={profileSaving} onClick={() => setModalOpen(false)}>取消</button>
              <button className="btn btn-pri" disabled={profileSaving} onClick={() => void saveModal()}>{profileSaving ? '正在保存…' : editingId ? '保存' : '保存并排盘'}</button>
            </div>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <Modal title="删除命例" close={() => setDeleteTarget(null)}>
          <div className="form-body">
            <p>删除「{deleteTarget.name}」？此操作无法恢复。{storeData.notes[deleteTarget.id] ? '该命例的历史笔记也会一并删除。' : ''}</p>
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
