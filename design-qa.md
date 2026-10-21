# 设计验收索引

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
