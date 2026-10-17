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
