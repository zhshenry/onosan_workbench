# AI 连续任务状态验收 · 2026-10-17

## 目标与对照

- Source visual truth：`C:/Myself/vibe_coding/onosan_workbench/design/references/ai-fixed-status-line-2026-10-17.png`，1536×1024 的已选设计板。本次实现对象为输入区上方的状态行；既有消息、思考、工具和上下文卡沿用原组件。
- 实机证据：`C:/Myself/vibe_coding/onosan_workbench/test-results/ai-activity-1792211578929/`。`activity-mist-1280.png` 为完整窗口，`activity-mist-1280-panel.png` 为侧栏；`activity-mist-1280-status.png`、`activity-replying-status.png` 为局部状态行，`activity-finished-panel.png` 为整轮结束后状态。
- 目标窗口 1280×820 / 1024×680，Windows 实际 CSS viewport 分别为 1279×820 / 1023×681，deviceScaleFactor=2；完整截图 2558×1640，雾灰侧栏 760×1456。局部截图 756×90 的包围框包含分数坐标向外取整，DOM 实测高度始终为 44 CSS px，不以截图物理像素反推高度。
- Source 与实机完整/局部图片已放在同一比较输入检查。设计板并非 1:1 运行窗口，不将外部注释、演示内容、侧栏宽度或像素密度差异算作实现误差。实机用隔离的浏览器对话，原稿用博客协作对象；本次没有添加原稿中的演示头像或改造既有工具卡。

## 视觉与交互结果

| 检查面 | 结果 |
|---|---|
| 字体与层级 | 主标签使用现有 `--type-control` 13px/600，说明使用 `--type-support` 12px；沿用项目字体回退，说明单行省略且保留完整 title 和可访问文本。 |
| 布局与间距 | 状态行 44px、左右 14px、元素间距 10px，位于滚动区外；模型/工具/授权切换复用同一个 DOM 元素，状态行与输入框矩形保持一致。授权卡及澄清问题位于状态行上方。 |
| 色彩 | 背景 `--acc-soft`、主标签 `--ink`、图标 `--acc-deep`、说明 `--ink-3`；授权图标/标签使用 `--avatar-amber`。三主题共享同一结构和运行时 token。 |
| 图标与素材 | 使用现有 Phosphor 图标，未用图片替代交互组件；等待图标旋转，实际减少动态效果模式关闭动画。状态没有百分比、计时或第二个停止按钮。 |
| 文案与真实状态 | 模型各轮开始回到“等待模型”，实际收到正文切到“整理回复”；浏览器工具执行和站点授权由原任务/工具事件决定。工具前正文仍存在时，也不会将下一轮等待误判为整理回复。 |

对照后修正两处：主标签由雾蓝改回稿中的墨色；“浏览器标签”工具使用“正在处理浏览器标签…”避免不完整动词。早期原生截图曾早于下一次绘制，验收脚本已等待字体及两帧，并核对当前阶段与授权卡收起状态后重新采集；以上证据均来自修正后的最终构建。

`node tooling/ai-activity-pilot.mjs` 最终 6 组检查通过：真实 SSE → IPC → 浏览器工具 → 授权 → guest 导航 → 下一轮模型 → 正文 → 结束；三主题/两档窗口、上滚阅读位置、减少动态效果、可访问状态及结束清理均已检查。结束为 `unverified` 的浏览器任务仍保留真实核验状态，状态行收起不会冒充验证成功。运行错误与控制台 error 为空。

17 项相关单元/组件/真实协议回归通过，覆盖暂停、工具失败后恢复、普通工具、当前/后台对话、澄清、取消、重启、三种模型协议、图片和参数错误回传；`npm run verify`（排版、双 TypeScript 检查和生产构建）通过。

## 静态审计与边界

- Premium 严格静态审计已执行，结果保存在 `test-results/ai-activity-premium-audit.json`；扫描报告现有阅读页、悬浮窗、既有 popover/textarea 及并行游戏改动共 9 项，不涉及新增状态行组件。既有 textarea 在全局 CSS 已设置 resize，popover 按钮使用原生 popoverTarget；本次不扩展修改这些页面或确认机制。
- 官方 DESIGN lint 已尝试离线执行，本机未缓存 `@google/design.md`，返回 ENOTCACHED；未为此添加项目依赖。
- 当前 Browser 技能不提供原生 Electron 控制，验收复用仓库 Playwright Electron 通道，隔离 profile、本机合成模型及网页；没有访问真实账号，不代表外部模型质量、第三方站点兼容、安装包或自动升级验收。

---

# 三主题还原验收 · 2026-09-24

以下先记录默认轻雾修正,再记录本轮冷灰与暖砂修正。

## 对照证据

- source visual truth: `C:/Myself/vibe_coding/onosan_workbench/design/references/theme-mist-2026-09-24.png`。与用户本轮左图内容一致,排除画布外框与水印。
- implementation screenshot: `C:/Users/henry/.codex/visualizations/2026/09/24/01a0d1fb-a8d9-7c00-9094-0e3c5d763756/mist-actual.png`。
- 最终完整对照与局部对照: [mist-comparison-v3.png](C:/Users/henry/.codex/visualizations/2026/09/24/01a0d1fb-a8d9-7c00-9094-0e3c5d763756/mist-comparison-v3.png)。同一张图左侧是参考,右侧是 Electron 实机。
- viewport:默认 1280×820 窗口;实机 capture 2558×1640,deviceScaleFactor=2,对应客户区 1279×820。源图 1567×1004。两者等比归一到约 1280×820 后比较,比例差低于 0.1%。
- 完整对照各占 960×615;局部各按 1280×820 显示,取 x=87/y=150 的概览卡及邻接区域,排除截图像素密度造成的字号错觉。
- state:首页、mist、下午问候、2 条未完成待办、空日程、3 项本周完成、无弹层。资料名与事项来自隔离实例,不把用户实际资料或标签变化当成视觉缺陷。

## 修正历程

1. **[P1,已修复] 背景被简化成均匀灰白渐变。** 用户右图缺少参考的冷暖交错雾团,卡片之外尤其明显。新增独立纯背景 `src/assets/mist-field.png`,背景和界面分别渲染。
2. **[P2,已修复] 面板白色覆盖过强、边缘偏硬。** 调低外层白度,使用更轻的边线和柔散投影;任务实白内层保留清晰度,减淡灰边;更多工作台内层增加白色薄层。
3. **[P2,已修复] 第一轮材质仍有斜向细纹、背景蓝白反差偏强。** [v2 对照](C:/Users/henry/.codex/visualizations/2026/09/24/01a0d1fb-a8d9-7c00-9094-0e3c5d763756/mist-comparison-v2.png)显示问题。面板改为均匀白色 `.56`,背景使用 `saturate(.7) brightness(.975)`;v3 完整与局部对照中细纹已消失,背景层次能透入面板。
4. 换肤回归截图曾捕获进入动画的中间帧。截图脚本现等待字体、有限动画和两帧绘制完成,并移开鼠标;稳定截图重新确认冷灰主题。

## 五项视觉检查

| 维度 | 检查结果 |
|---|---|
| 字体与字阶 | 同倍率局部对照确认标题、说明、数字的层级和换行相符。保留产品的 Bahnschrift/Windows 中文字体与共享字阶,未为匹配低分辨率截图缩小整页。 |
| 布局与间距 | 顶栏、侧栏、左右列、三块主面板、两层待办卡的比例和对齐一致;小窗口外观页卡片完整可见。 |
| 颜色与材质 | 默认背景恢复灰蓝/暖白雾团,半透明外层与实白内层可区分,边缘与阴影已柔化,面板无斜向细纹。 |
| 图像质量 | 新背景没有界面残影、文字、图标或压缩块;仅作为背景铺图,所有真实控件仍由 React 渲染。 |
| 文案与内容 | 保留真实任务、状态、设置选项和个人资料;未将生成图中的文字烧录为界面。 |

## 验证与边界

- `npm run verify` 通过(字阶检查、类型检查、生产构建)。本轮只改视觉、素材与截图等待,未重复运行数据逻辑测试。
- 实际点击“设置 → 外观”的 mist/cool/warm,均返回 3 个选项及正确选中主题;cool/warm 未继承默认主题的新素材或滤镜。
- mist 在 1024×680 检查外观页,无控件裁切。证据:`C:/Users/henry/AppData/Local/Temp/onosan-mist-v3-compact.png`。
- 截图流程未报告 renderer exception;本轮未做完整业务流程回归。
- `DESIGN.md` 已更新材质值、素材来源和同尺寸对照要求。

## 后续细微差异

- [P3] 纯背景根据参考重建,雾团的局部形状与位置并非逐像素复制。
- [P3] 生成图的字形、局部反光与真实 Windows 字体栅格存在细微差异;本次验收不宣称像素级一致。

本轮未发现仍需修复的 P0/P1/P2 差异。

final result: passed

## 冷灰与暖砂补充验收

### 对照输入与状态

- source visual truth: `design/references/theme-cool-2026-09-24.png` 与 `design/references/theme-warm-2026-09-24.png`,均为 1566×1004。
- implementation screenshot: `cool-actual.png` 与 `warm-actual.png`,位于 `C:/Users/henry/.codex/visualizations/2026/09/24/01a0d1fb-a8d9-7c00-9094-0e3c5d763756/`,均为 2558×1640,1279×820 客户区、DPR=2。
- [冷灰最终完整/局部对照](C:/Users/henry/.codex/visualizations/2026/09/24/01a0d1fb-a8d9-7c00-9094-0e3c5d763756/cool-comparison.png) 与 [暖砂最终完整/局部对照](C:/Users/henry/.codex/visualizations/2026/09/24/01a0d1fb-a8d9-7c00-9094-0e3c5d763756/warm-comparison.png):左为已选稿,右为真实 Electron。沿用上面的 960×615 全图和 1280×820 局部归一方法。
- 首页状态与默认主题对照相同:下午问候、两项未完成、空日程、无弹层。检查时鼠标移开,等待字体、背景图解码、进入动画与两帧绘制。

### 修正历程

1. **[P1,已修复] 两款仍使用均匀渐变色场。** 基线证据:[冷灰修正前](C:/Users/henry/.codex/visualizations/2026/09/24/01a0d1fb-a8d9-7c00-9094-0e3c5d763756/cool-comparison-before.png)、[暖砂修正前](C:/Users/henry/.codex/visualizations/2026/09/24/01a0d1fb-a8d9-7c00-9094-0e3c5d763756/warm-comparison-before.png)。分别新增参考重建背景,冷灰保留钢蓝/冰白层次,暖砂保留暖灰/淡蜜桃交错。
2. **[P2,已修复] 面板偏厚,存在斜向细纹,冷灰工作台内卡缺少白色填充。** 主玻璃改均匀半透明色,为 cool/warm 分别设置内卡薄层,减淡待办内层边线与外层投影。
3. **[P2,已修复] 第一轮 18px 模糊与增饱和抹平背景细节。** 通过实机 4px、8px、无额外模糊对照确定预雾化素材仅需 2px 轻模糊,饱和系数 1;冷灰使用中性白 `.48`,暖砂暖白 `.50`,边缘分别 `.55`/`.60`。背景滤镜抑制过强的蓝色和桃色。最终完整与局部对照可见雾团透入概览与工具面板,无斜向细纹。
4. **[P2,已修复] 暖砂选中待办行偏粉。** 改为参考中的中性浅灰 `#f1f0f1`,保持文字与选中层次清楚。

### 五项视觉检查

| 维度 | 冷灰与暖砂检查结果 |
|---|---|
| 字体与字阶 | 同倍率确认问候、区块标题、任务标题、说明与数字的层级及换行;两款共用原有字阶。 |
| 布局与间距 | 顶栏、导航、双列、四个工作台入口和待办两层结构与参考对齐;两款 1024×680 外观页均完整显示三个选项。 |
| 颜色与材质 | 两款分别保留冷蓝灰与暖灰蜜桃雾团;外层可透光,内层任务保持近白;边缘和投影柔化,无斜向细纹。 |
| 图像质量 | 两张纯背景无文字、控件残影、直线卡片轮廓与明显压缩块。局部云团形状与参考略有差异。 |
| 文案与内容 | 任务/设置均由应用渲染,三主题名称、默认选项与旧主题替代关系保持;未将生成图文字作为 UI。 |

### 验证与边界

- `npm run verify` 通过:字阶检查、两个 TypeScript 配置、生产构建。
- 实际点击“设置 → 外观”并分别选择 cool/warm,均返回 `options:3` 与正确选中项,无 renderer exception。
- 小窗口证据:[cool-compact.png](C:/Users/henry/.codex/visualizations/2026/09/24/01a0d1fb-a8d9-7c00-9094-0e3c5d763756/cool-compact.png)、[warm-compact.png](C:/Users/henry/.codex/visualizations/2026/09/24/01a0d1fb-a8d9-7c00-9094-0e3c5d763756/warm-compact.png)。已目视确认标签、三张皮肤卡、顶栏操作完整,无横向裁切。
- mist 的素材、透光率与有效模糊参数保持原值。未修改主题数据结构或业务逻辑,本轮未重复数据逻辑测试。
- `DESIGN.md` 和背景生成记录同步保存真实运行参数与来源。
- [P3] 重建背景的局部雾团、生成稿的光泽和 Windows 字形栅格仍有细微差别;不宣称逐像素一致。

本轮未发现仍需修复的 P0/P1/P2 差异。

final result: passed

## 浏览器确认组合 · 2026-10-16

范围：方案 1 的紧凑双行浏览器，合入方案 3 的逐回复任务记录入口。保留既有 AI 面板头部、消息样式、三主题和小红书单页/站点限制；不增设开发工具或常驻关联提示。

### 视觉与运行证据

- source visual truth：[确认组合稿](C:/Myself/vibe_coding/onosan_workbench/design/references/browser-combined-2026-10-16.png)，1536×1024 设计评审画布。
- implementation screenshot：[菜单与回复入口](C:/Users/henry/.codex/visualizations/2026/10/14/01a13b12-abb2-7811-a837-f485b142a6c3/browser-combined-20261016-t08zc8/browser-combined-menu.png)。Electron 请求客户区 1280×820，实测 CSS 1279×820、DPR=2、PNG 2558×1640。
- [完整与局部对照](C:/Users/henry/.codex/visualizations/2026/10/14/01a13b12-abb2-7811-a837-f485b142a6c3/browser-combined-20261016-t08zc8/browser-comparison.png)：源图剔除评审标题与下方运行态示意，实机取完整客户区；两者等比缩至 660px 列宽，没有拉伸。另并排检查标签/地址栏、菜单、回复页脚。评审稿窗口比例与实际默认窗口不同，不据此声称全窗口逐像素还原。
- state：mist、真实本地合成网页、AI 任务已核验、菜单键盘选中任务记录、助手展开；源图的菜单未选中，实机焦点环属于需要保留的交互状态。测试网页比设计稿多出的控件不属于宿主设计差异。
- [记录弹窗](C:/Users/henry/.codex/visualizations/2026/10/14/01a13b12-abb2-7811-a837-f485b142a6c3/browser-combined-20261016-t08zc8/browser-reply-record.png)、[窄窗运行控制](C:/Users/henry/.codex/visualizations/2026/10/14/01a13b12-abb2-7811-a837-f485b142a6c3/browser-combined-20261016-t08zc8/browser-running-1024.png)。窄窗请求 1024×680，实测 CSS 1023×681、DPR=2；工具栏暂停/停止的中心点命中真实按钮。
- [流程及布局报告](C:/Users/henry/.codex/visualizations/2026/10/14/01a13b12-abb2-7811-a837-f485b142a6c3/browser-combined-20261016-t08zc8/report.json)覆盖 mist/cool/warm × 1280/1024 六种布局及各自菜单展开截图，网页本身滚动，宿主控件没有被助手覆盖。默认浏览与四标签状态的网页顶部均为 y=180 CSS px。

### 修正历程

1. [P1，已修复] 菜单/记录的 Escape 会触发原有 AI 面板全局关闭处理。修正为原生弹窗和展开的 popover 优先；菜单焦点移到输入框后也不能先关闭助手。最终 Electron 验收包含焦点返回和助手仍展开的断言。
2. [P2，已修复] 四个长标签产生额外横向滚动条。标签改为先压缩，保留可访问标题；六种布局均断言四标签没有额外水平滚动，较多标签仍可滚动访问。
3. [证据修正] 首次记录弹窗截图捕获了 180ms 入场动画中的透明帧。采集改为等待有限动画完成；最终截图确认前景不透字。未通过修改业务界面来美化截图。

### 五项对照

| 项目 | 结果 |
|---|---|
| 字体与排版 | 复用现有字体及 type-control/type-support，不新增字体；标题省略、完整提示和键盘焦点可用。 |
| 间距与结构 | 标签与地址栏合为单一浏览器表面，移除通用浏览器大页头及两行常驻工具；原 AI 头部按现有合同保留。 |
| 颜色与 token | 复用 glass/ink/acc/ai-panel/radius；三主题菜单均是不透字的主题前景；失败和未核验不伪装成成功。 |
| 图像与图标 | 使用既有雾面背景与 Phosphor 图标；设计图仅作参考，运行界面由真实控件渲染，未把 UI 截图当成页面。 |
| 文案与内容 | 四个菜单入口及“查看操作记录”一致；记录来自已绑定任务。AI 回复不额外硬编码绿色成功标志，任务成功仍以实际核验状态为准。 |

### 验证与边界

- npm run verify 通过：字阶、两个 TypeScript 配置、生产构建；最终相关组件/AI 导航测试 3/3 通过。
- node tooling/browser-automation-pilot.mjs 最终 24/24 流程通过：真实 guest 点击填写、原生 popover、暂停/继续/停止、助手收起与窗口隐藏时运行、跨站授权、小红书与博客协作、历史清理、逐回复关联和正常重启；renderer error 与 console error 均为 0。
- 记录组件测试覆盖淘汰后不回退到新任务、读取失败重试和实时更新不被迟到快照覆盖；正常重启后逐回复任务标识仍一致。
- npm test 为 626/628 通过；另两项原有符号链接测试因本机 Windows symlink EPERM 失败。没有跳过测试、削弱检查或修改系统权限。
- 全局严格静态审计仍为 9 项既有发现；前后按 file/ruleId/message 比较新增 0。全局审计未通过，不能据此宣称整个应用静态合规。本次变更没有引入对应新问题。
- DESIGN.md 官方 lint 为 0 errors、1 条既有“无 YAML”格式提示。文档继续沿用仓库现有格式。
- 使用隔离数据与本地合成网页/模型，验收的是开发 Electron 构建；未发布安装包，未据此声称真实网站全覆盖或跨版本升级已验收。

浏览器改动范围的视觉与交互验收未发现剩余 P0/P1/P2 问题；全局测试权限及既有审计问题按上文保留。

final result: passed

## 浏览器网页缩放 · 2026-10-16

范围：在现有「⋯」菜单增加减号、当前百分比、加号和独立重置图标。复用共享浏览器、原生 guest 缩放和现有主题；不新增页面开发工具或工作台级缩放。

- source visual truth：[用户提供的 Codex 缩放菜单](C:/Users/henry/AppData/Local/Temp/codex-clipboard-39b252bf-3e30-4a1a-a695-eed5aa90d282.png)。对齐缩放行结构，字体、圆角、颜色及其余菜单项遵循现有 Workbench 系统。
- implementation screenshot：[125% 菜单](C:/Users/henry/.codex/visualizations/2026/10/14/01a13b12-abb2-7811-a837-f485b142a6c3/browser-zoom-20261016-l4E9ma/browser-zoom-menu.png)、[完整窗口](C:/Users/henry/.codex/visualizations/2026/10/14/01a13b12-abb2-7811-a837-f485b142a6c3/browser-zoom-20261016-l4E9ma/browser-zoom-125.png)。来自真实 Electron 控件，非生成效果图；网页比例 125%，宿主工具栏与助手维持原尺寸。
- 字体、间距、色彩、图标、文案分别检查：现有 type-control、原菜单宽度、hairline/glass-hi/acc-soft token、Phosphor 图标，以及“缩放”和真实百分比。减号/数字/加号共用分段边框，重置独立；没有复制参考中的查找、打印或设备工具。菜单不遮住其触发按钮。
- mist/cool/warm × 1280×820/1024×680 共 6 种布局均通过菜单边界检查；已目视检查默认 125% 完整窗口、cool 窄窗和 warm 默认尺寸。原键盘焦点环、Escape 返回、三主题前景和窄窗控件可达性保留。
- npm run verify 通过；GuestFrame、任务记录与 AI 工作台导航相关测试 5/5 通过；Electron 浏览器验收 25/25 通过，53 次本地合成模型请求，renderer/console error 均为 0。[报告](C:/Users/henry/.codex/visualizations/2026/10/14/01a13b12-abb2-7811-a837-f485b142a6c3/browser-zoom-20261016-l4E9ma/report.json)。
- 实测 25%/500% 边界及禁用、恢复 100%、键盘操作、空白标签禁用、不同站点隔离、同源标签共享比例、切回原标签保持页面实例、刷新保持比例，以及小红书 guest 的实际缩放。
- AI 验收通过菜单将真实网页调至 125%，拒绝缩放前的旧截图坐标，再截图后准确点击画布。任务运行时点击缩放先进入暂停，恢复 100% 后继续/停止的原流程通过。
- 严格静态审计仍有 9 项既有发现；按 file/ruleId/message 对比上一轮新增 0，[审计证据](C:/Users/henry/.codex/visualizations/2026/10/14/01a13b12-abb2-7811-a837-f485b142a6c3/browser-zoom-20261016-l4E9ma/static-audit.json)。DESIGN.md lint 为 0 errors、1 条既有无 YAML 提示。本轮未重复全量单元测试，上一轮已记录的 Windows symlink 权限问题保持原状。
- 测试使用隔离本机数据与合成页面/模型，不证明所有真实站点兼容。缩放沿用 Chromium 的站点行为，没有新增跨重启缩放持久化承诺；本次没有打包或发布安装版。

本次缩放范围无剩余 P0/P1/P2 问题。

final result: passed

## 阅读库路径入口修复 · 2026-10-16

范围：修复已保存库路径后「从库导入」直接扫描、无法再输入路径的问题。每次先打开可编辑的路径确认框，再校验、关联和扫描，沿用既有勾选确认面板与单库数据结构；不添加多库或库内写入能力。

- 视觉与行为来源：用户提供的已关联空书单截图、现有阅读页面及共享 `Modal`/`form-body`。移除原路径输入行造成的孤立 CSS；新弹窗仅设置 540px 响应宽度和现有主题前景，不引入字体或颜色 token。
- [默认实机弹窗](C:/Users/henry/.codex/visualizations/2026/10/14/01a13b12-abb2-7811-a837-f485b142a6c3/reading-import-NwhkM9/mist-1280.png)、[窄窗](C:/Users/henry/.codex/visualizations/2026/10/14/01a13b12-abb2-7811-a837-f485b142a6c3/reading-import-NwhkM9/cool-1024.png)：真实 Electron 客户区截图，非效果图。已目视核对字体、间距、主题前景、路径字段、按钮文案和焦点。三主题 × 双尺寸均检查窗口边界、标签激活输入和 Escape；宽窗助手保持展开，窄窗沿用既有覆盖模式，先收起助手再打开导入。
- 先增加组件断言复现原问题，再修复。`npx tsx --test tests/reading.test.ts` 最终 12/12 通过，涵盖已有路径仍弹框、不提前扫描、取消、空值、无效库、配置保存失败保留输入及原勾选导入/删除/进度回归。
- `npm run verify` 通过：字阶、renderer/electron 类型检查及生产构建。实际窗口验收 [报告](C:/Users/henry/.codex/visualizations/2026/10/14/01a13b12-abb2-7811-a837-f485b142a6c3/reading-import-NwhkM9/report.json) 6/6 通过：已配置与未配置入口、错误重试、仅导入所选书目、去重、正常退出重启与三主题双尺寸。renderer/console error 为 0；合成库文件逐个 SHA256 前后一致。
- 实机发现 JSX autoFocus 与共享原生 dialog 打开顺序导致路径未稳定获焦。局部修正为弹窗打开后聚焦输入框，保留触发按钮的焦点恢复；未修改其他弹窗。最终实机验证打开后即可输入，Escape 返回「从库导入」。
- 严格静态审计仍为 9 项既有发现，按 file/ruleId/message 比较新增 0；[证据](C:/Users/henry/.codex/visualizations/2026/10/14/01a13b12-abb2-7811-a837-f485b142a6c3/reading-import-NwhkM9/static-audit.json)。使用本机缓存的官方 design.md CLI 检查 DESIGN.md：0 errors、1 条既有无 YAML 提示。
- 仅使用隔离数据与合成 Obsidian 库，没有读取或改动用户真实笔记；没有打包、发布或替换安装版。本轮未重复全量测试，既有 Windows symlink 权限问题不在本次范围。

本次导入修复范围无剩余 P0/P1/P2 问题。

final result: passed

## 浏览器运行胶囊动效 · 2026-10-16

历史记录：本节为首次仅运行态启用的实现与验收；用户随后明确要求暂停等所有可见 AI 状态框持续播放，当前行为以末节「浏览器 AI 状态框持续动效」为准。

范围：仅给实际 running 状态增加流光边框与呼吸底色。保留现有胶囊布局、雾蓝语义和暂停/停止入口，通用浏览器与小红书共用；不增加任务或浏览器控制能力。

- source visual truth：[用户圈定的运行胶囊](C:/Users/henry/AppData/Local/Temp/codex-clipboard-5fc73f80-0432-4e3f-b8e3-1d1c225eb018.png)。字体、图标、圆角和按钮位置沿用现有界面；增加的效果为 1.5px 边缘亮弧和 3.2s 底色呼吸，使用 acc/ink/glass token，无独立颜色或 JS 定时器。
- [实机动图](C:/Users/henry/.codex/visualizations/2026/10/14/01a13b12-abb2-7811-a837-f485b142a6c3/browser-task-effects-20261016-nJD6rK/browser-task-effects.gif)、[完整窗口](C:/Users/henry/.codex/visualizations/2026/10/14/01a13b12-abb2-7811-a837-f485b142a6c3/browser-task-effects-20261016-nJD6rK/browser-task-effects.png)。在真实运行任务下，原生 capturePage 按控件区域采集 16 帧，200ms 间隔，原始 PNG 为 388×108；GIF 只统一调色板并编码，没有重画控件。采集前等待有限过渡动画结束，避免把窗口或对比模式切换中的淡入帧当作呼吸效果。
- 已目视核对浅/深两帧：边缘亮点沿胶囊移动，背景变化而文字和按钮不淡出、不移动；原暂停/继续/停止真实点击通过。文字按原 token 略加深，默认主题原生截图中背景最深采样处对比度约 4.85:1；这是此控件采样结果，不代表全应用对比度审计。
- `npm run verify` 通过；最终 Electron 验收 [报告](C:/Users/henry/.codex/visualizations/2026/10/14/01a13b12-abb2-7811-a837-f485b142a6c3/browser-task-effects-20261016-nJD6rK/report.json) 26/26 通过，53 次本地合成模型请求，renderer/console error 均为 0。原有三主题双尺寸流程通过；动效专项对三主题比较真实计算样式，确认背景与流光角度变化、文字颜色/透明度和点击区域稳定。
- [动效状态证据](C:/Users/henry/.codex/visualizations/2026/10/14/01a13b12-abb2-7811-a837-f485b142a6c3/browser-task-effects-20261016-nJD6rK/browser-task-effects.json)确认装饰层不接收鼠标事件；暂停后 animation 与伪元素移除，停止后移除运行类；减少动态效果关闭呼吸、流光和原转圈图标，强制对比度关闭装饰流光并保留静态系统边框。
- 严格静态审计仍为 9 项既有发现，无新增；DESIGN.md 官方 CLI 为 0 errors、1 条既有无 YAML 提示。沿用隔离合成网页/模型，不接触真实登录或业务记录；没有打包发布，本轮未重复全量单元测试。

本次动效范围无剩余 P0/P1/P2 问题。

final result: passed

## 浏览器 AI 状态框持续动效 · 2026-10-16

范围：按用户纠正，将流光与呼吸从 running 条件移到共享状态框本身。只要框仍显示，运行、暂停、待授权和结束状态均持续播放；结束态仍为紧凑图标入口，各状态原有文案、图标和操作行为保持不变。

- 只调整共享 `automation.tsx` 的条件类与 `pane.css` 的装饰规则，通用浏览器与小红书共用；保留减少动态效果和强制对比度的静态替代。
- [暂停状态实机动图](C:/Users/henry/.codex/visualizations/2026/10/14/01a13b12-abb2-7811-a837-f485b142a6c3/browser-task-persistent-effects-20261016-Yt6BjF/browser-task-paused.gif)、[完整窗口](C:/Users/henry/.codex/visualizations/2026/10/14/01a13b12-abb2-7811-a837-f485b142a6c3/browser-task-persistent-effects-20261016-Yt6BjF/browser-task-paused.png)：原生窗口采集 16 帧，200ms 间隔，GIF 仅编码原始 PNG。目视核对第 0/8 帧，暂停文案和按钮固定，亮弧位置与底色强度变化；暂停文案背景采样对比度约 6.37:1。
- [状态计算样式证据](C:/Users/henry/.codex/visualizations/2026/10/14/01a13b12-abb2-7811-a837-f485b142a6c3/browser-task-persistent-effects-20261016-Yt6BjF/browser-task-persistent-effects.json)确认暂停与停止后仍为 `browser-task-breathe` / `browser-task-flow`，400ms 前后底色和角度变化，文字颜色、透明度、控件边界不变，装饰层不接收鼠标。
- `npm run verify` 通过；[Electron 验收报告](C:/Users/henry/.codex/visualizations/2026/10/14/01a13b12-abb2-7811-a837-f485b142a6c3/browser-task-persistent-effects-20261016-Yt6BjF/report.json) 26/26 通过，53 次合成模型请求，6 个主题/尺寸组合，console 无错误。运行三主题、暂停、停止的动效变化和操作按钮真实点击均通过，待授权和完成状态也检查了呼吸与流光样式；减少动态效果与强制对比度检查通过。
- 官方 DESIGN.md lint 为 0 errors、1 条既有无 YAML 提示；严格静态审计仍为 9 项既有发现，按 file/ruleId/message 比较无新增。只使用隔离测试网页与模型，没有替换安装版或发布版本。

final result: passed

## 轨迹侦探双区联调 · 2026-10-16

范围：用户选定的方案 2。代码留在现有开发工具中修改，Ono 提供本地运行、真实网页试玩、项目现有测试、截图与问题报告。游戏本身没有改动。

### 对照输入与状态

- source visual truth：[已选失败细化稿](C:/Myself/vibe_coding/onosan_workbench/design/references/game-trail-option-2-2026-10-16.png)，1586×992。
- implementation screenshot：[最终失败详情](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-workbench/game-failure-final.png)，真实 Electron 客户区及 PNG 均为 1600×1000，DPR=1、页面缩放 1。
- [同图完整/局部对照](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-workbench/game-comparison.png)：两张全图等比缩至 800px 列宽，未拉伸；下方分别裁取测试栏，保留原像素，检查字号、错误、行动按钮和输出层次。
- state：mist、N1 现场、五项快速检查通过、完整流程失败、原始输出展开。失败在隔离项目副本中合成，以验证界面；真实项目独立 Edge 通关已经通过。源稿中的示例错误与生成式游戏画面是评审内容，实机展示固定脚本的原始错误和真实游戏，不把它们当作相同游戏 UI。
- 项目路径、随机本地端口、时间和截图附件数来自隔离运行。生产代码默认使用用户指定游戏目录与 8765 端口，没有写入演示失败数据。

### 修正与复验

1. **[P1，已修复] 隐藏二级目录后仍留下 240px 空列。** 游戏工作区专属覆盖宿主网格列宽，其他工作台沿用原布局。[问题复现截图](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-workbench/game-grid-before-reproduced.png)在隔离实例临时恢复原网格，以保留该问题证据；[修复后](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-workbench/game-1600-mist.png)及最终完整对照确认预览已使用该空间。
2. **[P2，已修复] 设置表单贴边，保存按钮悬停被通用 hover 淡化，错误文字被说明文字颜色覆盖。** [修正前](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-workbench/game-settings-validation.png)。项目设置复用 Modal，局部声明 560px 最大宽度及 16px 内容边距、深色保存行动和 danger 错误；选择器包含 `.modal.game-settings`，防止共享最大宽度覆盖。[修正后](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-workbench/game-settings-validation-final.png)在同一 1600×1000 视口复验：端口 17 的错误显示在弹窗内，保存按钮悬停仍清晰，取消可返回。
3. 截图采集曾在渲染层调用 webview API 时使目标异常退出；改由主进程在游戏租约内 capturePage，实机截图写入隔离附件目录通过。后续截图等待对话框关闭及有限导航动画结束，避免把中间帧当作最终布局。

### 五项视觉检查

| 维度 | 结果与实现边界 |
|---|---|
| 字体与字阶 | 使用宿主 Windows 中文字体与 Bahnschrift 回退，标题、任务、说明、时间分别使用共享 type token；通过全图和测试栏局部确认换行、路径截断和错误折行。保留现有应用的紧凑密度，不逐字复刻生成稿较大的字形。 |
| 布局与间距 | 项目栏、左侧预览和右侧检查构成单一项目工作区；默认左右约 65/35，面板内独立滚动。1024×680 自动收起检查，可重新展开；顶栏、项目操作和预览控件可用，无宿主横向溢出。 |
| 颜色与材质 | 复用 mist/cool/warm 的玻璃、背景、边线和圆角 token。范围选中为雾蓝，主行动为近黑，失败为 danger，通过为青绿，并保留文字状态。 |
| 图像与图标 | 标题缩略图和停止态插图来自实际游戏雨窗素材，运行区为真实 webview；没有将生成式游戏界面烧成背景。图标来自现有 Phosphor。生成稿游戏画面与真实 N1 地图的布局差异是产品边界。 |
| 文案与内容 | 六个固定任务、脚本路径、退出状态、原始输出和截图来自实际运行。保留通关独立 Edge 与试玩隔离说明；失败说明不猜测脚本未提供的业务原因。生成稿“模拟失败场景”等评审标签不进入产品。 |

### 交互与回归证据

- [实机验收记录](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-workbench/evidence.json)：11 项通过，主页面 JavaScript exception 为 0。启动真实游戏、五项快速检查、截图、跨工作台保留同一 guest、刷新保留存档、新档隔离与返回原档均通过。
- 真实游戏完整通关通过，实际脚本验证三案收集、读档、视线工具、错误/证据不足/正确指认、解锁、结局、重玩隔离和桌面/窄屏。测试使用独立 Edge，生成检查点图片写到本次运行目录。
- 固定窄屏通过读取真实 `innerWidth/innerHeight` 验证为 390×844；补验通过真实鼠标点击缩放后的游戏色调按钮，确认输入落到实际 webview。[窄屏截图](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-workbench/game-narrow-viewport.png)。
- 三主题完整窗口和 [1024×680 最终窄窗](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-workbench/game-1024-warm-final.png)目视通过；尺寸选择器可键盘 Escape 关闭。原始输出展开、失败报告复制、实际附件保存和源码变化后“待重测”通过。
- `npm run verify` 通过；最后弹窗 CSS 修正后重新检查字阶并构建通过。游戏/AI 作用域/guest 相关回归 15/15 通过，含长输出报告仍保留附件引用。
- [全量回归日志](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-workbench/unit-tests.log)：647/649 通过；原有 `ono-render-pilot.test.ts` 与 `windows-pilot.test.ts` 各一项在创建符号链接时遇到 Windows EPERM，未改这些测试。没有宣称全量通过。
- [严格静态审计](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-workbench/ui-audit.json)保留 9 项既有发现，均在 ReadingView/AiPanel/FloatTodo；新增游戏视图没有该审计发现。此结论不代表全应用静态审计通过。
- 验收数据、失败副本和 appData 全部隔离。没有改游戏源码、用户现有 Ono 数据或外部浏览器玩家档案；没有打包发布或替换安装版。

本次工作台范围无剩余 P0/P1/P2 问题。P3：生成稿的字形、光泽与宿主共享组件密度存在细微差异，不宣称逐像素一致。

final result: passed

## 游戏项目终端 · 方案 2 · 2026-10-16

范围：在预览与测试两栏共同下方增加可收起、可调高的真实 PowerShell，保留现有游戏运行和测试行为。

### 对照证据

- source visual truth：[用户选定的终端方案 2](C:/Myself/vibe_coding/onosan_workbench/design/references/game-terminal-option-2-2026-10-16.png)，1586×992。
- implementation screenshot：[真实终端与实际游戏](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-terminal/terminal-final.png)，原生 Electron 客户区及 PNG 均为 1600×1000，DPR=1、页面缩放 1。
- [同图完整与局部对照](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-terminal/terminal-comparison.png)：完整窗口各等比缩至 800px 列宽；终端左侧及工具栏另按原像素裁取，检查命令文字、内边距、主次操作和状态，没有拉伸图像。
- state：mist、N1、五项快速检查通过、终端展开、PowerShell 在游戏目录中实际执行 `node cases/validate-game.cjs` 后等待输入。源图是示例输出，实机保留脚本真实输出与 PowerShell 高亮，不伪造源图中的五项命令结果。

### 检查结果与迭代

| 维度 | 结果 |
|---|---|
| 字体与字阶 | 终端字号读取共享 `--type-body`，等宽字体使用 Cascadia Mono/Consolas/微软雅黑；宿主控件沿用原字阶。局部对照确认提示符、路径、命令与输出可读，没有将整张设计稿作为界面。 |
| 布局与间距 | 终端横跨左右两栏，初始展开高 240px，分隔线清楚；预览与测试共同缩短，右栏仍有独立滚动。1600×1000、1024×680 均保留操作入口，无宿主横向溢出。 |
| 颜色与材质 | 保留外壳三主题；终端是固定深色业务表面，背景/工具栏/前景/选中/焦点由 `--game-terminal-*` 映射。原生程序 ANSI 输出继续保留其颜色语义，主行动和提示不混用。 |
| 图像与图标 | 游戏来自现有 webview，插图和 Phosphor 图标复用，没有新增模拟游戏画面或手画资产。 |
| 文案与内容 | 真实 shell、目录、命令和状态。移除设计评审的“示例会话”字样，首版 PowerShell 为静态 shell 标签；新增中断与结束会话区分 Ctrl+C 和进程清理。 |

- Windows 原生后端清屏与 xterm 清屏需要同步，否则调整尺寸后可能重绘旧内容。现已同时清理，单元与实际清屏/调整尺寸/复制流程通过。
- 输入验收使用真实键盘事件和系统粘贴。自动化的直接文本注入不能代表终端键盘；Ctrl+C 后等待 PowerShell 提示符恢复，再继续命令。实测能够停止前台 Node 并继续使用原 shell。
- 原游戏在较低的“跟随窗口”视口中会压缩地图，这是被测网页自己的高度响应式表现。本次不改游戏 CSS；[桌面固定视口示例](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-terminal/terminal-fixed-viewport.png)确认可用现有 1440×1000 预设保留完整画面，也可收起终端恢复高度。该差异不冒充宿主已重做游戏界面。
- 宿主全宽底部布局未发现剩余 P0/P1/P2 差异。P3：生成稿字形、光泽、示例会话和真实 PowerShell 输出密度存在差异；首版没有展示不存在的其他 shell 选项。

### 行为验证与边界

- [最终实机记录](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-terminal/evidence.json)14 项通过：懒启动、正确目录、中文粘贴与输出、五项快速检查、全宽几何、收起/切页保留 PID 和变量、鼠标/键盘调高、复制、Ctrl+C、中断后的继续输入、进程树结束、重新连接、清屏、命令错误恢复、普通粘贴、目录归属保护、三主题、窄窗和减少动态效果。其他窗口调用终端 IPC 被拒绝。
- 终端保持连接时，独立 Edge 完整三案通关通过；应用退出后检查最后 PowerShell PID 已消失。真实游戏源码指纹与接入终端之前一致。
- [控制台记录](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-terminal/capture-evidence.json)：终端初始化、命令与预览过程中 main renderer console error 和 page exception 均为 0。
- 项目路径失效场景通过：终端错误保留在面板内，可修正项目设置后重新连接真实 shell；原生模块/目录失败与旧会话 ID、尺寸、缓冲边界另有单元覆盖。
- `npm run verify` 通过；游戏终端/游戏服务/AI 作用域/guest 相关回归 19/19 通过。[全量回归](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-terminal/unit-tests.log)661/663 通过，仍是两项原有 Windows symlink EPERM，未修改这些测试。
- [严格静态审计](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-terminal/ui-audit-final.json)有 9 项既有发现，新增终端没有发现；[官方 DESIGN.md lint](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-terminal/design-lint.json)为 0 errors、1 条既有无 YAML 提示。不宣称全应用审计或全量测试通过。
- 最终原生验收使用隔离 Ono appData 和 PowerShell APPDATA。Ono 的终端回放缓冲仅在内存中保留；用户正常使用的 PowerShell 命令历史仍由系统管理。没有修改真实游戏源码、替换安装版或发布版本；安装包内的原生依赖尚未进行安装升级验收。

final result: passed

## 浏览器站点授权 · 方案 3 · 2026-10-17

- source visual truth: `design/references/browser-site-approval-dock-2026-10-17.png`（1629×965）；用户选择第三张「底部待处理卡」。
- 首轮 Electron 原始截图：`C:/Users/henry/AppData/Local/Temp/ono-browser-pilot-ySd20L/site-approval-mist-1440.png`（2878×1704，CSS 客户区约 1439×852，devicePixelRatio=2）。归一到参考尺寸后比较。
- 首轮完整/局部组合对照：`C:/Users/henry/.codex/visualizations/2026/10/14/01a13aca-ea82-79d3-bbf1-1509791d9e94/browser-site-approval-20261017/comparison-initial.png`、`comparison-initial-card.png`。左侧参考，右侧实现。
- [P2] 首轮卡片的站点行多出整块浅蓝内衬，卡片比参考约高 26 CSS px，挤占聊天空间；已去除该行额外背景和内距，收紧正文行距。待重新截图比对。
- 首轮实际允许和拒绝均写入正确结果；拒绝后没有创建标签。验收脚本错误地要求空标签任务结束后仍有工具栏状态按钮，已改为核验取消状态、拒绝回执与标签数。

### 修正后复验

- 最终原始实机截图：`C:/Users/henry/.codex/visualizations/2026/10/14/01a13aca-ea82-79d3-bbf1-1509791d9e94/browser-site-approval-20261017/site-approval-selected.png`，2878×1704；参考 1629×965。实机客户区约 1439×852、devicePixelRatio=2；以同一待授权状态、mist 主题，将实机归一到参考尺寸。两者纵横比差低于 0.1%。
- 完整组合对照：同目录 `comparison-final.png`；局部组合对照：`comparison-final-card.png`。均左侧参考、右侧真实 Electron。卡片高度、站点行、按钮和输入框间距已接近选定稿，首轮 P2 已消除；没有未解决的 P0/P1/P2。
- 固定卡置于聊天滚动区外，正文可滚动，按钮不重叠输入框；三主题、1280×820 和 1024×680 的边界及命中检查全部通过，1440×852 用于与选定稿对照。定位入口将键盘焦点移回卡片。
- 内容差异：实际站点标题显示完整主机名 www.baidu.com，参考为“百度”；使用当前配置的合成模型名称，未替换用户模型设置。思考文本只在模型实际返回时显示；历史测试标签保留。这些是数据与既有行为，不伪造模型回复来匹配示例。
- 42 项相关回归通过；覆盖失败重试、提交去重、当前对话与分区隔离、过期请求不可操作、旧读取与旧 IPC 返回不能覆盖更新的授权、冷启动保留结果且使待授权失效。
- `npm run verify` 通过。隔离 Electron 32/32 实机检查通过，63 次本机合成模型请求；包含允许后实际导航、拒绝不创建标签、旧菜单入口、后台任务、主题布局、历史与正常重启。原始报告复制在同目录 `report.json`；console 无错误。
- Browser skill 未提供，使用仓库 Playwright Electron 通道。仅使用临时 appData、本机合成网页及模型；百度对照场景在授权前取消，没有访问真实百度页面。未验证真实外部模型输出质量、安装包或跨版本升级。
- Follow-up polish：无阻塞项；不在此次修改中调整已有浏览器标签和模型配置。

final result: passed

## 游戏项目栏 · 方案 1 · 2026-10-17

范围：按用户选择整理游戏项目顶栏。紧凑单行保留项目、服务状态、启动和面板开关，项目目录与设置收入项目「⋯」；游戏预览菜单、终端会话和原有服务操作继续沿用。

### 视觉对照

- source visual truth：`design/references/game-project-option-1-2026-10-17.png`，1981×793，用户选定的第一张「轻量单行」。
- implementation screenshot：[最终原生窗口](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-project-header/header-final.png)，1600×1000；[参考宽度窗口](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-project-header/header-reference-width.png)，1052×720。均为 mist、服务停止、检查展开、项目菜单展开，原生客户区 DPR=1。
- [完整目标组件组合对照](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-project-header/comparison-header.png)与[操作区局部组合对照](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-project-header/comparison-actions.png)：左为选定稿，右为实机；按项目栏等比归一至 962px 宽，未拉伸。比较范围为本次修改的项目栏及菜单。

| 维度 | 检查结果 |
|---|---|
| 字体与字阶 | 沿用宿主中文字体和共享字阶；项目名突出，目录与服务状态次要，按钮文字保持可读。没有为效果稿另造一套字体。 |
| 布局与间距 | 64×48 原有缩略图、项目名/目录靠左，状态在标题旁；启动、分隔线、终端、检查和更多按选定顺序排列。选中检查与更多清楚，小窗口允许分组换行。 |
| 颜色与材质 | 主行动近黑，展开面板与更多为雾蓝选中态，服务运行使用现有青绿。边线、圆角、背景全部复用宿主 mist/cool/warm token。 |
| 图像与图标 | 缩略图复用游戏雨窗素材，图标沿用 Phosphor，没有用生成图代替真实控件或游戏预览。 |
| 文案与内容 | 面板按钮固定为「终端」「检查」，以选中态表示展开；菜单显示「打开项目目录」「项目设置」。实际路径、服务错误和外部服务状态来自运行结果。 |

可接受的差异：实机菜单沿用现有浏览器菜单的 240px 宽度、40px 最小行高和共享字号，比等比归一后的生成稿菜单更宽，保持可读与点击区域一致；键盘焦点环是实际可访问状态。生成稿在未运行时仍展示示例游戏画面，实机保留真实停止态插图，本次不修改下方游戏内容来模拟效果稿。没有宣称逐像素一致，项目栏内无剩余 P0/P1/P2 差异。

### 行为与回归验证

- `npm run verify` 通过；最后响应式 CSS 修正后 `npm run build` 通过。游戏服务、终端与 GuestFrame 相关单元回归 11/11 通过。
- [项目栏原生验收](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-project-header/report.json)10/10 通过：菜单键盘与 Escape 回焦、目录原生调用边界、共享设置弹窗、面板切换保留终端 PID、真实服务启动/重启/停止、运行时设置禁用、端口冲突错误、外部服务断开不停止其进程。
- [预览菜单回归](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-preview-menu/report.json)9/9 通过：真实 guest 缩放与重置、实际截图、外部打开调用边界、独立试玩分区、菜单互斥及导航/切页关闭，同一 guest 不重建。两份原生验收报告 errors 均为空。
- 三主题 1280×820、窄窗 1024×680、1280 宽 AI 停靠及参考宽度窗口均无项目控件重叠或菜单越界；减少动态效果和强制颜色偏好检查通过。1024 下原有 AI 面板为覆盖式，其自身布局不在本次修改范围内。
- 严格静态审计仍有 8 项其他视图的既有发现，GameView/game.css 无发现；官方 DESIGN lint 为 0 errors、1 条既有无 YAML 提示。不宣称全应用审计通过。
- Browser skill 未提供，使用仓库 Playwright Electron 通道与隔离 appData；外部打开由测试截获以验证调用，没有操纵用户浏览器。真实游戏源码、安装版与用户档案未修改；未打包发布。

final result: passed
