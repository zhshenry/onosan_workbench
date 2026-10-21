import type { ViewId, WorkbenchId } from '../shared/contracts';

export type { WorkbenchId };

export interface NavSub {
  label: string;
  /** 已上线且有界面的子页 */
  view?: ViewId;
  /** 规划中(仅占位) */
  pending?: boolean;
}

export interface WorkbenchDef {
  id: WorkbenchId;
  title: string;
  pending?: boolean;
  subs: NavSub[];
}

export const NAV: WorkbenchDef[] = [
  {
    id: 'home',
    title: '首页',
    subs: [
      { label: '今日概览', view: 'home' },
      { label: '事项库', pending: true },
      { label: '本周回顾', pending: true },
    ],
  },
  {
    id: 'media',
    title: '自媒体工作台',
    subs: [
      { label: '博客编辑', view: 'copy' },
      { label: '图文发布', view: 'copy-publish' },
      { label: '我的小红书', view: 'media-browser' },
      { label: '封面设计', pending: true },
    ],
  },
  {
    id: 'game',
    title: '游戏工作台',
    subs: [
      { label: '轨迹侦探', view: 'game' },
    ],
  },
  {
    id: 'web',
    title: '网页工作台',
    subs: [
      { label: '浏览器', view: 'browser' },
      { label: 'Hush-Hour', view: 'hush-hour' },
      { label: '站点搭建', pending: true },
      { label: '页面设计', pending: true },
      { label: '发布管理', pending: true },
    ],
  },
  {
    id: 'life',
    title: '小工具',
    subs: [
      { label: '命理', view: 'bazi' },
      { label: '阅读清单', view: 'reading' },
    ],
  },
  {
    // 2026-09-24 定稿方案 C:设置作为第六个大工作台,复用「图标栏 + 二级目录」导航
    id: 'settings',
    title: '设置',
    subs: [
      { label: '个人资料', view: 'settings-profile' },
      { label: '通用', view: 'settings-general' },
      { label: '外观', view: 'settings-appearance' },
      { label: 'AI 助手', view: 'settings-ai' },
      { label: '待办与数据', view: 'settings-data' },
      { label: '关于', view: 'settings-about' },
    ],
  },
];

export const workbenchById = (id: WorkbenchId): WorkbenchDef => {
  const wb = NAV.find((w) => w.id === id);
  if (!wb) throw new Error(`unknown workbench: ${id}`);
  return wb;
};

/** 页面归属的大工作台(用于从内容区链接跳转时联动一级导航) */
export const ownerOfWorkbench = (view: ViewId): WorkbenchId | undefined =>
  NAV.find((w) => w.subs.some((s) => s.view === view))?.id;

/** 工作台的默认路由(第一个已上线子页;全未上线时由内容区显示规划占位页) */
export const defaultViewOfWorkbench = (id: WorkbenchId): ViewId =>
  NAV.find((w) => w.id === id)?.subs.find((s) => s.view)?.view ?? 'home';

/**
 * 工作台范围的助手上下文。主标签是当前大工作台名，对象行是当前子页名。
 * `workspace:` 没有对应子页，对象行沿用工作台名，避免套到某个具体子页上。
 */
export function workbenchAiContext(viewId: string): { label: string; object: string } {
  if (viewId.startsWith('workspace:')) {
    const workbench = NAV.find((item) => item.id === viewId.slice('workspace:'.length));
    const title = workbench?.title ?? '当前工作台';
    return { label: title, object: title };
  }
  const workbench = NAV.find((item) => item.subs.some((sub) => sub.view === viewId));
  const sub = workbench?.subs.find((item) => item.view === viewId);
  return { label: workbench?.title ?? '当前工作台', object: sub?.label ?? viewId };
}
