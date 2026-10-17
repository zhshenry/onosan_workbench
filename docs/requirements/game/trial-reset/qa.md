# 试玩保留档重置 · 方案 1 · 2026-10-17

## 范围与证据

- 用户选定的第 1 张高保真稿：`docs/requirements/game/trial-reset/design/game-trial-reset-option-1-2026-10-17.png`。仅新增原预览菜单入口、共享 Modal 确认与本地存储清理；不扩展到存档槽、备份或服务端重置。
- 实机证据目录：`C:/Users/henry/.codex/visualizations/2026/10/17/01a148bd-f549-7572-8f83-877199ff6d5e/game-trial-reset/`。`verify.cjs` 为隔离 Electron 验收脚本，`compare.py` 生成同输入对照，`report.json` 保存操作及布局结果。
- Browser 插件没有原生 Electron 表面，复用项目的 Playwright Electron 路径；使用独立 appData、合成游戏及本机 HTTP 测试站点，不读取或重置真实试玩存档。
- 参考图 1491×1055，实机最终帧 1440×1024、DPR 1；确认框为 600 CSS px。`comparison-full-final.png` 对照整窗，`comparison-final.png` 将参考与实机确认框各归一到 800px 宽核对，`dialog-detail.png` 为实机局部。原有外壳密度与导航沿用当前产品，不按生成稿重做。

## 迭代与验证

- [P2，已修复] 初次打开默认焦点落在关闭按钮。显式将确认框初始焦点放到取消，菜单关闭时恢复入口；实机验证取消与 Escape 均返回原入口且不清理数据。
- [P2，已修复] 关闭目标被通用按钮样式覆盖为 30px。提高业务变体选择器优先级，实机测量恢复为 44×44px。
- [P2，已修复] 初轮对照的前景过灰、说明及摘要文字偏小，摘要底色在白色前景上缺少区分。复用既有浅色前景与字阶，摘要底色由 field token 派生；确认按钮按参考比取消更宽。前后对照分别保留为 `comparison-before.png` 与最终图。
- 行为：取消/关闭/处理中禁用、失败保留错误并可重试、关闭旧页面避免旧内存写回、localStorage 和 IndexedDB 清空、另一环境/旧 origin/临时档/通用浏览器/Cookie 保留、停止状态重置、重启后数据仍为空。Cookie 重启验收使用明确有效期的测试 Cookie，避免将正常的会话 Cookie 退出清除误判为缺陷。
- 字体：共享字体，24px 标题、16px 摘要与主说明、14px 范围说明、12px origin；行长及正文换行在实机核对。颜色：既有 danger/acc/ink/field token，警示有文字和图标。图片：复用当前侦探事务所图片和 Phosphor 图标，无新增生成运行素材。内容：明确环境与站点，说明进度及网页设置的真实清理范围；菜单在确认框打开后收起，属于真实交互对生成稿的合理校正。
- 相关 25 项测试、前后端类型检查、构建与字阶检查通过。最终实机报告为 passed，包含 10 组行为检查、三主题 × 1280/1024 × 100%/125% 共 12 个布局组合及额外 150% 检查；重启后保留档的 localStorage/IndexedDB 仍为空，持久 Cookie 与旧站点数据正常。整窗和局部最终对照均已复核，无待修复的 P0/P1/P2。
- 全项目 premium 静态审计仍有 8 项本次范围外的既有问题（ReadingView 原生 select 所有权、AiPanel 按钮/textarea、FloatTodo 表单/textarea）；本次修改文件无新增审计问题。

final result: passed — 用户选定方案 1 的入口、确认与真实存储重置均已验证。
