# 设计验收索引

## 个人网站内容工作室 · 2026-11-03

按用户选择的方案 2 接入作品、博客、文库编辑与真实 Astro 预览。完成三主题、宽窗与 1024×680 窄短窗口、只读差异、草稿保护、真实构建和五页 HTTP 检查；修正预览视口、未保存博客地址、空栏目首次新增监听、弹框间距、正式地址保存切换和运行状态颜色。[完整验收记录](docs/requirements/web/personal-website/qa.md)。全量 850 项测试中 848 项通过，2 项既有 Windows 符号链接权限失败；定向回归 40/40 通过。实际网站源码副本的首次保存与后续热更新通过；最终 v2.0.0 发行载荷预览和中文终端通过，10 个编译文件与构建哈希一致，五项本地资产检查通过。

final result: passed with the recorded Windows test-environment limitations

## 占星扩展星体与点位 · 2026-11-02

新增四个点位与五个小天体,两组原生复选框统一控制盘面、表格和相位,保留原独立详情卡片与十星统计。[完整验收记录](docs/requirements/life/mingli/qa-astro-extended-2026-11-02.md)。490 项独立 JPL 参考校验、7 组平均点位基准、78 项回归和 `npm run verify` 通过;隔离 Electron 离线实测三主题、双尺寸、200% 缩放、键盘、显示切换及缺少地点,15 张原生截图,没有名称重叠或横向溢出。Python 入口不可运行,premium 静态审计未执行。未发布安装器。

## 占星星体详情 · 独立胶囊卡片 · 2026-11-02

按用户明确范围将行星表格下的选中星体详情拆成独立玻璃卡片,两卡等宽、间隔 12px、详情圆角 36px。既有选择、取消、盘表联动及相位入口保留。

[完整验收记录](docs/requirements/life/mingli/qa-astro-detail-capsule-2026-11-02.md)。13 项既有界面回归、`npm run verify` 与最终构建通过;隔离 Electron 检查三主题、双尺寸、200% 缩放、AI 侧栏、键盘选择与取消,无页面错误。已查看实际截图并核对卡片边界和相位颜色。Python 缺失,premium 静态审计未执行。未打包安装器。

## 占星时间基础 · 第二批第一部分 · 2026-11-02

命例编辑加入地区时区、历史夏令时自动换算、重复时刻选择和不存在时刻校验。旧命例保持固定 UTC+8，八字与紫微继续原口径。共享 Select 与原生单选沿用主题字阶，命例弹框在窄窗内固定标题、独立滚动表单。

[完整验收记录](docs/requirements/life/mingli/qa-astro-time-2026-11-02.md)。59 项命理/时区回归和 8 项 AI 范围回归通过；`npm run verify` 通过，滚动修正后再次构建及原生 QA 通过。隔离 Electron 实测三主题、1488×1056、1024×680、200% 缩放、菜单对齐与 Escape、重复时段键盘选择和重开、前后端空档拒绝。截图检查发现并修复了原透明标题与滚动表单重叠。Python 缺失，premium 静态审计未执行，不计作通过。未发布安装器。

## 星盘探索 · 第一批 · 2026-11-02

按确认高保真实现日月升概览、分布浮层、盘表联动、十二宫与现代守护、组合相位筛选及中文术语说明。右侧四页签共用卡片,桌面与左盘等高,选择不撑高布局。

[完整验收记录](docs/requirements/life/mingli/qa-astro-phase1-2026-11-02.md)。`npm run verify` 与 46 项相关回归通过;真实隔离 Electron 检查三主题、1488×1056/1024×680、200% 缩放、AI 侧栏、键盘操作、分布浮层与焦点恢复、筛选空态、四宫/五宫同步及选中相位语义色,无渲染或控制台错误。源图与同尺寸实机图已同屏复核。未发布或更新安装版。

final result: passed for astrology phase 1

## 命理占星 · 深色圆盘方案 2 · 2026-10-31

按用户选定的方案实现浅色玻璃外壳与深色分层星盘,保留真实黄经、整宫制、ASC/MC 和逆行;右侧复用共享 Segmented 切换行星落座与完整相位列表。文字标签防重叠仅调整显示位置,数据及计算不变。

[完整视觉与交互验收](docs/requirements/life/mingli/qa-astro-dark-2026-10-31.md)记录源图、同尺寸桌面截图、局部对照和修正历史。27 项命理回归、类型检查与构建通过;真实隔离 Electron 核对三主题、三视口、方向键焦点、相位滚动、缺少出生地、逆行、AI 侧栏及历史数据保留,无页面错误。全仓 premium 审计因未安装 Python 未能执行,未计作通过。

final result: passed

## Hush-Hour · 移除独立重启入口 · 2026-10-25

按用户确认移除「重启本地」按钮及组件对应分支，保留「构建并刷新」和随状态切换的「启动本地／停止」。沿用现有按钮、图标与主题样式，并同步行为规范和项目说明。

`npm run verify` 与 17 项既有 Hush-Hour 回归通过。隔离 Electron 中的真实组件通过 6 组验收：入口精简、键盘启停与焦点保留、启动失败恢复、构建成功刷新及失败重试、三主题与 1280×820／1024×680 布局、减少动态效果及零渲染错误。窗口验收使用受控服务／构建 bridge 和预览替身；真实服务与构建流程由既有隔离项目测试覆盖。截图、脚本及记录位于本机 `test-results/hush-hour-controls-20261025/`。

全仓严格静态审计仍有 10 项既有发现，所在源码均与 HEAD 一致；本次 Hush-Hour 组件无发现。未以静态审计代替交互验收。

final result: passed for Hush-Hour project actions

## Hush-Hour · 项目栏构建四态 · 2026-10-22

按用户确认稿将待构建、构建中、已同步和失败集中到项目名旁；失败同行查看日志，主按钮可重新构建。旧启动错误在构建中收起、恢复后清除，独立红色提示行移除。自动检测更新、手动构建及本地／正式预览行为保留。

[完整四态视觉与行为验收](docs/requirements/web/hush-hour/qa-build-status.md)。受控 bridge 下的真实 Electron 组件渲染通过 9 项验收，另有 17 项组件及隔离主进程回归与完整构建通过。已打开并对照确认稿和实际四态合并图；徽标对比度问题修复后重新验收，三主题与窄窗无未解决的 P0/P1/P2 发现。本轮未重新发布安装包。

final result: passed

## AI 测试工作台 · 配置工具栏分组 · 2026-10-22

按用户明确的分类要求，标题行保留任务名、操作状态和保存任务；工具栏分为「输入」（提示词、添加材料）、「模型」（对比模型、模型设置）、「校验」（统一校验配置）。每组提供小标题和可访问分组名称，桌面用细竖线分隔，空间受限时保留标题并省略竖线。按钮保持 32px 轻量描边样式，展开校验编辑独占下方整行。材料标签放在工具栏下方，标题和保存状态沿用原字阶及主题。

Browser plugin not available，使用新的 WORKBENCH_TEST_DATA_DIR 与 WORKBENCH_ISOLATED=1，通过 Playwright Electron 验证 1490×1040 和 1024×680。5 组验收通过，覆盖页面身份、非空内容、三个分组名称与五入口同高顺序、两个弹框及焦点恢复、实际材料导入/只读查看/移除、模型勾选、键盘展开校验编辑、实际保存及窄窗弹层边界。无框架错误层、页面错误或控制台错误；未启动模型测试。npm run verify 及最后 CSS 调整后的构建通过，静态审计仍为 10 项既有提示。

桌面和窄窗截图、脚本、几何记录位于本机 Codex 可视化目录 2026/10/21/01a15c43-42fc-7ad1-8a96-c3e5358f675e/ai-test-grouped-toolbar-qa。

final result: passed for task-card layout and configuration controls

## AI 测试工作台 · 模型设置与代码折叠 · 2026-10-21

温度、单次输出上限、限时及 Agent 工具上限移入「模型设置」共享 Modal，保留应用、取消、未应用关闭确认和执行中只读。错误复用任务字段 schema 校验，关联并聚焦对应输入。「对比模型」仍为模型名、供应商和复选框组成的菜单，数字表示已选数量，最多四个。结果代码默认折叠，保留文件名、查看代码入口及只读标识；每列独立切换，将 112px 高度交给预览。

Browser plugin not available，使用 Playwright Electron、WORKBENCH_TEST_DATA_DIR 与 WORKBENCH_ISOLATED=1，配置本地受控模型。1490×1040 和 1024×680 的 7 组验收通过：页面身份与非空内容、实际模型菜单及四模型上限、参数应用/取消/错误聚焦/放弃确认、保存及直出真实请求中的一致参数、执行中只读、代码独立折叠与 iframe 状态保留、大预览标签、Agent 工具限额、窄窗菜单和弹框边界。无框架错误层、页面错误或控制台警告。模型调用仅来自显式开始测试，折叠和查看不发起调用。

npm run verify 与 11 项相关回归通过。全仓静态审计仍为 10 项既有提示，无新增项。截图和脚本保存在本机 Codex 可视化目录 2026/10/21/01a15c43-42fc-7ad1-8a96-c3e5358f675e/ai-test-compact-qa；预览来自合成模型产物，本轮不评价真实模型能力。

final result: passed for compact settings, model picker and code disclosures

## AI 测试工作台 · 提示词弹框 · 2026-10-21

按用户截图反馈，System/User 从总览任务卡移入共享 Modal，主界面仅保留「提示词」入口。应用更新当前配置，取消丢弃弹框草稿；执行中只读。关闭放弃确认时先关闭子弹框，再恢复入口焦点。其余参数和结果布局沿用现有实现。

Browser plugin not available，使用隔离数据目录与本地合成模型的 Playwright Electron。1490×1040、1024×680 验证 6 组通过，覆盖紧凑总览、弹框初值与应用、取消和 Escape/放弃确认、键盘焦点、长内容、保存、直出及 Agent 实际发送的输入和执行中只读。页面身份、非空内容、无框架错误层、控制台健康与截图均通过；npm run verify 和 11 项相关回归通过。截图、脚本与请求证据位于本机 Codex 可视化目录 2026/10/21/01a15c43-42fc-7ad1-8a96-c3e5358f675e/ai-test-prompt-qa。本轮使用受控夹具验证输入链路，不评估真实模型质量。

全仓静态审计仍报告 10 项既有 Select 识别、textarea 和按钮项，本轮弹框无新增项；不以此声明全仓审计通过。DESIGN.md 官方 lint 的离线包缓存缺失（ENOTCACHED），未为此新增项目依赖。

final result: passed for prompt-dialog interaction and controlled model inputs

## AI 测试工作台 · 方案 1 与最终大预览 · 2026-10-21

[行为边界与已选高保真](docs/requirements/ai-test/workbench/README.md)。保留现有共享导航、三主题和 authored 控件；详情默认大预览，代码及校验过程按需展开。实际模型名称和状态取代设计稿中的示意内容。

使用隔离的 Electron 正式构建和本地 OpenAI 兼容服务验收。Browser plugin not available，使用 Playwright Electron；配置 WORKBENCH_TEST_DATA_DIR 与 WORKBENCH_ISOLATED。页面身份、非空内容、无框架错误层、控制台健康、截图和实际交互均通过。桌面 1490×1040、1280×820，窄窗 1050×800、1024×680；窄窗多标签的宽度挤出已修复，标签条独立滚动，工具栏和大预览保持在内容区内。

完整链路 12 组通过，覆盖并发直出、独立标签与状态保留、原始回复及输入快照、并发断言、真实失败隔离、取消、复跑、Agent 写入和网页操作、JavaScript、发现问题后修复复测、工具及时间上限、导入导出、保存和重启。补验两个独立供应商端点和合成密钥在同名模型下互不串线。示例中的刷新恢复缺陷真实得到 4/5，修复后得到 5/5，未使用预置通过状态。

与设计稿的有意差异：保留当前已发布的共享顶栏与导航；控件使用现有白色选中态，模型使用实际配置名称；不添加未经实现的版本选择或假评分。预览内容来自模型夹具生成的文件，用户代码的布局由产物自身决定。

测试脚本、截图及 JSON 证据保存在本机 Codex 可视化目录 2026/10/21/01a15c43-42fc-7ad1-8a96-c3e5358f675e/ai-test-qa，未写入个人数据或真实密钥。构建与字阶、类型检查通过；新增 11 项回归通过，项目回归 792 通过、2 项既有 Windows 符号链接 EPERM 失败。真实供应商质量、Node/Python 及依赖安装执行不在本轮验证范围。

final result: passed for local implementation and controlled fixtures

## 窗口内展开试玩 · 顶部细栏 · 2026-10-20

[查看高保真对照、实际截图与交互验收](docs/requirements/game/preview-expand/qa.md)

final result: passed

## 游戏终端工具栏 · 方案 3 · 2026-10-19

[查看高保真对照、实机截图与交互验收](docs/requirements/game/terminal/qa.md)

final result: passed

## 游戏测试检查 · 方案三下拉选择 · 2026-10-19

[查看高保真对照、实机截图与交互验收](docs/requirements/game/test-selector/qa.md)

## 内置离线语音听写 · 方案 2 扁平细化稿 · 2026-10-19

[查看设计、实际截图与功能验收](docs/requirements/shared/voice-input/qa.md)

2026-10-17：完整验收正文已按模块和需求迁入 docs/requirements；本页保留原标题作为历史链接入口。当前效果以 DESIGN / UX-CONTRACT 及对应日期的验收记录为准。此次目录整理未重跑历史实机流程。

[需求总索引](docs/requirements/README.md) · [全部资料与原路径映射](docs/RESOURCE-INDEX.md)

# 代码仓整理与整体设计核对 · 2026-10-17

[查看完整记录](docs/archive/audits/design-sync-2026-10-17.md)

# 试玩保留档重置 · 方案 1 · 2026-10-17

[查看完整记录](docs/requirements/game/trial-reset/qa.md)

# AI 收起时的其他工作台悬浮目录 · 2026-10-17

[查看完整记录](docs/requirements/shared/navigation/qa.md)

# 游戏工作台二级目录恢复 · 2026-10-17

[查看完整记录](docs/requirements/game/trail-detective/qa.md)

# AI 悬浮胶囊 · 2026-10-17 · 内嵌按钮修订

[查看完整记录](docs/requirements/shared/ai-activity/qa.md)

# 浏览器任务记录 · 2026-10-17 · 已选方案 2

[查看完整记录](docs/requirements/web/browser-task-record/qa.md)

# 顶栏日程/待办共享面板 · 2026-10-17 · 已选方案 2

[查看完整记录](docs/requirements/shared/topbar/qa.md)

# 应用更新改为主动安装 · 2026-10-17

[查看完整记录](docs/requirements/shared/app-update/qa.md)

# AI 合并悬浮胶囊 · 2026-10-17 · 已选方案 3（历史阶段，已被内嵌按钮修订替代）

[查看完整记录](docs/requirements/shared/ai-activity/qa.md)

# 顶栏更新气泡紧凑调整 · 2026-10-17

[查看完整记录](docs/requirements/shared/app-update/qa.md)

# 顶栏应用更新验收 · 2026-10-17 · 已选方案 1（初版）

[查看完整记录](docs/requirements/shared/app-update/qa.md)

# AI 连续任务状态验收 · 2026-10-17（历史阶段，44px 固定状态行已被替代）

[查看完整记录](docs/requirements/shared/ai-activity/qa.md)

# 三主题还原验收 · 2026-09-24

[查看完整记录](docs/requirements/shared/themes/qa.md)

## 浏览器确认组合 · 2026-10-16

[查看完整记录](docs/requirements/web/browser-automation/qa.md)

## 浏览器网页缩放 · 2026-10-16

[查看完整记录](docs/requirements/web/page-zoom/qa.md)

## 阅读库路径入口修复 · 2026-10-16

[查看完整记录](docs/requirements/life/reading-import-51/qa.md)

## 浏览器运行胶囊动效 · 2026-10-16

[查看完整记录](docs/requirements/web/browser-activity/qa.md)

## 浏览器 AI 状态框持续动效 · 2026-10-16

[查看完整记录](docs/requirements/web/browser-activity/qa.md)

## 轨迹侦探双区联调 · 2026-10-16

[查看完整记录](docs/requirements/game/trail-detective/qa.md)

## 游戏项目终端 · 方案 2 · 2026-10-16

[查看完整记录](docs/requirements/game/terminal/qa.md)

## 浏览器站点授权 · 方案 3 · 2026-10-17

[查看完整记录](docs/requirements/web/site-authorization/qa.md)

## 游戏项目栏 · 方案 1 · 2026-10-17

[查看完整记录](docs/requirements/game/project-bar/qa.md)

## 双环境试玩与线上侧栏 · 方案 1 细化稿 · 2026-10-17

[查看完整记录](docs/requirements/game/online-preview/qa.md)

## 游戏项目说明 · 内置只读 Markdown 弹窗 · 2026-10-17

[查看完整记录](docs/requirements/game/run-instructions/qa.md)

## 试玩更新提示 · 方案 3 · 2026-10-17

[查看完整记录](docs/requirements/game/preview-refresh/qa.md)

## 2026-10-17 问题反馈方案 2：记录入口、持久保存与 ZIP

[查看完整记录](docs/requirements/game/issue-feedback/qa.md)
