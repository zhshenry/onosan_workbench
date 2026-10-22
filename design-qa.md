# 设计验收索引

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
