# 自媒体工作台 · 内嵌浏览器方案

> 状态:**v1a + v1.5 已实装(2026-09-28),v1b 博客编辑侧栏待接入**——分区持久化、整页多标签浏览器、AI 看这页(正文提取→AI 面板)、采集备注/搜索、右键存图(主进程受控抓取,不放宽下载禁令)。**未做**:编辑器侧栏、与选题库/素材库打通(两模块尚不存在,上线后迁移)、起始页 chips 自定义(当前固定五个)。
> 日期:2026-09-28

## 0. 已确认决策

1. **落位:C 整页 + 侧栏**——同一浏览器组件两种形态:二级目录「素材浏览器」整页沉浸 + 博客编辑内侧栏对照;共享登录态与采集列表。
2. **v1 范围:浏览 + 采集**——玻璃外壳(地址栏/导航/快捷平台/起始页)+ workspace 登录态持久 + 一键采集(链接/标题/整页截图);AI 看这页、多标签放 v1.5。
3. **采集存储:独立先行**——userData 下独立 JSON + 截图文件;选题库/素材库上线后迁移打通。

## 1. 场景与目标

创作者流程:**平台游逛 → 采集灵感 → 写稿 → 发布**。内嵌浏览器要交付的是:①少切窗口(应用内逛小红书/B站/知乎);②**登录态记住**(平台一次登录长期有效);③**看到即存下**(采集 = 链接+标题+整页截图,写作时对照)。底座(GuestFrame 控制器 + BrowserGuests 租约/安全层)已按 DSH 移植并验收,本方案只做产品壳与采集,不动安全模型。

## 2. 底座必改点:登录态持久化

现状:`browser-guests.ts` 分区名 = `workbench-browser-<randomUUID>`,进程级复用——**应用重启后登录态丢失**(代码注释「进程生命周期内复用」即此意)。
改法:分区名确定性 + Electron 持久分区前缀:`persist:wb-browser-<workspace>`(可对 workspace 做简单规范化)。cookie/存储落盘 userData,重启保留;同 workspace 仍共享、跨 workspace 仍隔离;权限/下载/凭据封锁逻辑不动。**这是全部方案里唯一动底座的点,一行级改动。**

## 3. 功能与界面(v1)

### 3.1 整页「素材浏览器」
- 入口:media 二级目录新条目「素材浏览器」(view `media-browser`),排在「图文发布」之后。
- 布局:顶部玻璃 chrome 条(后退/前进/刷新 + 地址胶囊 + 「采集到素材」主按钮),下方 guest 全幅;未加载时显示**起始页**——快捷平台 chips(小红书 / B 站 / 知乎 / 微博 / 抖音创作,localStorage 可增删)+ 最近采集缩略图行。
- 交互沿用 design-a-glass.html 已定稿的浏览器 chrome 视觉(地址胶囊/标签造型),无新视觉语言。
- 错误态/加载态:GuestFrame 自带状态 + 中文文案;弹窗请求转交为 toast + 询问是否在 guest 内打开(主进程已实现转交通道)。

### 3.2 编辑器侧栏
- 落点:博客编辑(CopyView)右侧 380–420px 可折叠浏览器侧栏,默认**收起**;展开状态记忆于 localStorage。
- 侧栏 = 精简 chrome(一行:导航钮 + 地址 + 采集钮)+ guest + 已采集列表抽屉;与整页同 workspace(`media`),登录态、历史连续。
- 窄窗(<1180px)侧栏自动收起为图标按钮。

### 3.3 采集
- 动作:点「采集」→ `webview.capturePage()` 整页截图(PNG)+ 当前 URL/标题/时间 → IPC 存盘。
- 存储:`userData/media-captures/`(截图 PNG 文件)+ `userData/media-captures.json`(索引:id/url/title/文件名/创建时间/来源工作台),Zod 契约照 bazi 模式放 `shared/media-capture-contracts.ts`,IPC `media-capture:list/save/remove`。
- 展示:整页起始页与侧栏抽屉里的「已采集」列表(缩略图 + 标题 + 打开链接 + 复制链接 + 删除);不做编辑器。
- 安全边界**不放宽**:下载仍禁、权限仍全拒;整页截图是 `capturePage` 通道,与下载无关。

## 4. 架构落位

```
shared/media-capture-contracts.ts      Zod 契约 + 类型
modules/browser/ui/pane.tsx            通用浏览器外壳(chrome + GuestFrame + 起始页,可配置 chips)
modules/media-capture/store.ts         索引 JSON 读写(主进程,Zod 校验)
modules/media-capture/ui/CaptureStrip.tsx   已采集列表(整页/侧栏共用)
src/views/MediaBrowserView.tsx         整页视图(chrome + pane + 采集列表)
modules/copywriting/ui/CopyView.tsx    侧栏挂载点(折叠布局,见 §6 时序)
electron/main.ts                       media-capture:* IPC + 分区名持久化改造
shared/contracts.ts                    ViewIdSchema + 'media-browser'
src/nav.ts                             media.subs 增加「素材浏览器」
```

GuestFrame/WebviewPresentation/BrowserGuests 的租约与安全逻辑零改动(除 §2 分区名)。BrowserPane 与 DevBrowserView 的差异 = 产品壳 chrome + 起始页 + 采集钮;DevBrowserView 保留为验收入口。

## 5. 分期

- **v1a(先行)**:分区持久化改造 → 整页素材浏览器(外壳/起始页/快捷平台)→ 采集与存储 → 采集列表。
- **v1b(跟进)**:CopyView 侧栏。**时序依赖**:CopyView 正被并行会话高频改动(近期仍有类型错误),侧栏挂载等其稳定后接入,避免撞车;整页形态不依赖它,先行交付价值。
- **v1.5**:AI 看这页(正文/摘要发 AI 面板,走 aiSeed 进线);采集加备注;多标签(多 GuestFrame 实例,组件天然支持)。
- **v2**:逐张原图保存(受控下载或 blob 抓取的安全取舍);与选题库/素材库数据打通;全局浏览器工作台与 media workspace 的关系再评估。

## 6. 风险与验收

| 风险 | 对策 |
|---|---|
| `capturePage` 对部分站点(强 CSP/DRM)截出黑屏 | 采集时校验非空图,黑屏给中文提示;截图时机等 loading 结束 |
| persist 分区落盘 cookie 的安全面扩大 | 仅 http(s) 白名单/凭据封锁/权限全拒逻辑原样保留;分区按 workspace 命名空间隔离 |
| CopyView 并行改动撞车 | 侧栏(v1b)延后接入;整页(v1a)完全独立 |
| 多平台登录态互相污染 | 按 workspace 单一分区,与独立浏览器同策略 |

验收清单:登录小红书 → 重启应用 → 仍登录;采集一页 → 起始页列表见缩略图、可打开/复制/删除;侧栏展开/收起记忆;`npm run verify` + 冒烟绿;采集中文错误文案齐全。

## 7. 明确不做(v1)

多标签、AI 总结、下载/存原图、采集内容编辑、无痕模式、历史记录页——均见分期或 v2。
