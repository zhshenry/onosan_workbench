# 灵动岛待办助手验收

方案确认：2026-11-08；完成复验：2026-11-09。

final result: passed

## 来源与实现

用户从三种方向中选择[随身对话窗](design/ai-assistant-approved-2026-11-08.png)，授权实施连续对话、独立置顶、移出不收起、修改前确认的方案。此前要求的顶部展开态左下角入口保留。

实际归属为 `IslandAssistant.tsx`、`island-assistant.css` 与 `electron/desktop-island.ts`。使用既有待办 AI 会话、全局模型配置、澄清问题、主进程工具和确认执行链路；共享 `TodoProposalCard` 只增加岛内展示变体，其他使用方默认行为不变。`AiResponse` 仅增加默认开启的工具明细开关，浮窗省去明细行，主窗口仍可查看。控件使用 `src/ui/controls.tsx` 的 authored Select 和 IconButton，吉祥物使用原组件，图标使用现有 Phosphor。

新窗口沿用 preload 隔离、contextIsolation、sandbox，禁止任意导航和新开页面。主进程校验助手及岛的主 frame 身份；助手只能调用明确放行的岛读取、消息操作、助手控制和已有导航，岛设置及文件写入接口继续拒绝。

## 同屏视觉对照

已同屏查看 `island-assistant-comparison.png` 与 `island-assistant-card-comparison.png`，包含用户确认稿及真实 Electron 结果。源图裁出对话窗，源图及实际窗分别等比归一到 400px 宽；没有拉伸成相同高度。实际窗为 400×610 CSS px、DPR 2、100% 应用缩放；原生 capturePage 捕获完整窗口，卡片区域按真实 DOM 边界裁出。另查看了 320×420 和 200% 缩放截图。

| 位置／状态 | 检查与处理 |
| --- | --- |
| 框架 | 深色单层窗口、圆环头像、置顶／关闭、蓝色选中标签、独立滚动及底部固定输入与模型选择符合确认稿。继续使用岛内 canonical token 与共享字阶，没有引入新的全局样式值。 |
| 修改卡 | 使用真实目标标题、琥珀待确认、完整前后值及取消／确认修改；修复原共享样式透出的浅色徽标，压缩字段间距，省去重复说明。确认前无数据写入。 |
| 视口与历史 | 原先被内容增长打断的自动跟随改为布局阶段执行，并断言最新卡片可见。用户滚动阅读历史时仍保持位置。长对话允许较早消息滚出可见区域。 |
| 键盘与缩放 | 修复标签切换后焦点被输入框抢走的问题；标题在窄视口省略，置顶、关闭和发送始终可用。150%／200% 待布局稳定后检查并实际发送，不使用缩放前的旧尺寸作证据。 |
| 真实数据差异 | 预览分别列出「计划日期」和「截止时间」，并保留完整日期，另列优先级；因此比示意图的两行卡片稍高。消息数仅在真实未读时出现，模型显示真实配置名称，空输入下发送禁用。 |
| 主题与表面 | 助手和桌面岛保持固定深色；主应用三主题的其他表面未更改。原生置顶默认开启，因此图钉显示蓝色选中态。主按钮使用现有蓝色与深色文字，保留当前 token 的对比度。 |

## 功能与数据验证

45 项相关测试通过，覆盖新窗口复用、隐藏／销毁、独立置顶、来源及 frame 校验、屏幕边界，以及既有建议卡、事务回执、并发保护和岛状态。新增两个测试位于 `tests/desktop-island.test.ts`，既有建议卡默认行为继续通过原测试。

使用本机 Playwright 库启动真实 Windows Electron，未使用 Browser 插件（当前工具中不可用）。22 条真实流程检查全部通过：

- 点击吉祥物打开独立窗口，失焦保持；关闭重开使用同一渲染器并保留未发送输入，重开回到对话页；标签键盘切换保留焦点。
- 置顶实际修改原生状态且不影响岛固定；助手请求岛设置写入被主进程拒绝。
- 主工作台隐藏后，通过真实 AI 循环及工具查询测试待办；生成建议前后数据库不变；确认恰好更新目标字段并产生真实执行回执。
- 并发手动修改后，旧建议不能覆盖新版本；取消建议不写入；模型选择实际更新共享配置。
- 模型失败保留问题且可再次发送；停止取消正在等待的模型调用，待办不变；中文组词 Enter 不发送，Shift+Enter 换行；澄清选项正确恢复 AI 循环。
- 顶部／左侧／右侧停靠窗口均位于屏幕工作区内。400×610、320×420、150% 和 200% 下无水平根溢出，输入和关键按钮可达，并实际发送成功。
- 关闭应用后重启，历史和已保存草稿恢复，待确认建议标记过期，不能直接确认，也未自动写入。

主验收窗口记录的运行错误和控制台错误／警告均为 0。`npm run verify` 的字阶检查、两套 TypeScript 检查及生产构建通过；`git diff --check` 通过。离线 DESIGN lint 为 0 错误，保留原有「未提供 YAML」提示。

全量测试为 990/992 通过，两项已有失败均为 Windows 创建符号链接时 EPERM：`ono-render-pilot.test.ts` 的 symlinked image/manifest/output，以及 `windows-pilot.test.ts` 的 evidence symlink。未修改与本任务无关的权限或测试。

Premium 严格静态审计报告 14 项：原有 13 项，加 1 项把 JSX 的共享 `<Select>` 误当原生 select 的所有权提示。新增文本框 resize 证据已修正；实际模型选择经 Electron 的 combobox/listbox 交互验证，采用明确的共享 authored owner，并非原生 select。审计没有整体通过，不能用动态检查替代该报告或宣称静态零问题。

## 验证边界与证据

所有待办、对话、配置和日期均为隔离测试数据。模型端是本机合成 SSE 服务；实际执行的是 Electron、preload、AI 循环、工具、SQLite 事务及恢复流程，没有调用真实供应商或使用用户密钥，也没有修改真实待办、安装版或客户端 Hook 配置。首次发送前的草稿仅在本次渲染器运行内保留；已有会话保存过的草稿才跨重启恢复。置顶只保留本次应用运行状态。

本机证据目录：`C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/`。

- `island-assistant-pilot.mjs`、`island-assistant-pilot.json` 与 `.log`：22 条完整交互、合成模型请求及结果。
- `island-assistant-approved-state.png`、`island-assistant-{top,left,right}.png`、`island-assistant-size-*.png`：真实原生窗口截图。
- `island-assistant-comparison.png`、`island-assistant-card-comparison.png` 与 `island-assistant-compare.py`：原稿、结果及可复现的等比对照。
- `island-assistant-tests.log`、`island-assistant-full-tests.log`、`island-assistant-verify.log` 和 `island-assistant-audit.json`：测试、构建和静态审计。

本轮为本地实现，未提交、打包、安装或发布。
