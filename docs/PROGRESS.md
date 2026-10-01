# Ono Workbench · 项目进度与交接

更新：2026-10-01 15:58 UTC（北京时间 2026-10-01 23:58）。编写者：ChatGPT/Codex。供 ChatGPT 与 ZCode 共读；保留 2026-09-30 的检查快照，新增安装、更新与正式发布结果。

本文件汇总进度，不替代现有产品、设计和模块规范。**“有实现”不代表测试通过或验收完成。** 标记：**已验证**＝本轮直接检查文件/Git；**历史记录**＝注明日期的既有验收或会话摘要；**推测**＝尚无直接证据；**待确认**＝需要用户或当前开发会话补充。

## 项目与记录位置

- **已验证（2026-09-30）**：准确项目路径为 `C:\Myself\vibe_coding\onosan_workbench`；`package.json` 名为 `onosan-workbench`，产品名 `Ono Workbench`，版本 `0.1.0`。这是当前 Electron/React/TypeScript 项目；`dsh_plugins/Veang-Workbench` 仅在八字方案中作为参考来源。
- 既有权威：[PRODUCT.md](../PRODUCT.md) 管产品范围与决策，[DESIGN.md](../DESIGN.md) 管视觉规范，[shell.css](../src/shell.css) 是运行时主题实现，[UX-CONTRACT.md](../UX-CONTRACT.md) 管可观察行为。
- 既有交接/实施记录：[待办同步台账](../modules/todo/SYNC.md)、[共享包计划](TODOLIST-SHARED-KIT-PLAN.md)、[命理历史方案](BAZI-PLAN.md)、[浏览器计划](MEDIA-BROWSER-PLAN.md)、[AI 助手方案](AI-ASSISTANT-DESIGN.md)、[设计演进](../design/README.md)。验收依据另见 [三主题 QA](../design-qa.md)、[AI 原型 QA](AI-ASSISTANT-PREVIEW-QA.md) 与 `design/mockups/_shots/`。
- 本轮未找到覆盖全项目四类进度的现成台账，因此在既有 `docs/` 中新增本文件。项目及父目录未找到 `AGENTS.md` 或 `.agents/skills/SKILL.md`；当前 Codex 工作区祖先的 `.agents` 中也无 `SKILL.md`。项目 `.claude`/`.zcode` 存在设计与写作 skills，不能据此推断外部会话的当前任务。

## Git 与当前快照

**首版正式发布（2026-10-01）：** 用户授权后，发行源码提交 `ab59dd3fe1fac1c944c8af269a647aeb53b52d93` 与标签 `v0.1.0` 已推送；`npm run release` 实际完成验证、打包、`gh release` 创建与下载核验。[正式 Release](https://github.com/zhshenry/onosan_workbench/releases/tag/v0.1.0) 发布于 15:53:32 UTC，是最新正式版本，非草稿、非预发布，包含完整五项资产；服务器 SHA256 均与本地一致、五个下载地址均为 HTTP 200、远端 `latest.yml` 与本地一致。本次源码树为 165 个正式文件，排除截图、参考 PNG、依赖、构建产物和个人配置，150 张本机截图保留；所选源码及既有基线共 265 个文本快照的凭据扫描通过，历史 10 张截图人工检查为合成演示。最新全套单元测试 105/105 通过。发布结果文档随后单独提交，版本标签保留在发行源码提交；下述 Git 数据是此前历史快照。

**已验证，采样于 2026-09-30 16:50:51 UTC：**

- 分支 `main`；HEAD `a433f03217821e4be1e9b1b3bf7a6449878e8c73`。近期可见提交：`a433f03`，2026-09-24 12:14:28 +08:00，**建立工作台源码基线并修复共享库与 AI 交互**。
- 115 个已跟踪文件；54 个已跟踪修改、1 个已跟踪删除（`src/views/NotificationCenter.tsx`）、244 个未跟踪文件。大量截图、模块实现、测试和方案尚未进入该提交。以上数量是时间点快照，会随其他工具写入变化。
- 远端配置为 `git@github.com:zhshenry/onosan_workbench.git`；本地显示 `[origin/main: gone]`，仅说明本地追踪引用缺失，本轮未联网核实远端。
- 交接以**当前工作区 + 此文档日期**为准，不能只看 HEAD。未提交不等于功能未完成；不能从 diff 判断哪位工具正在负责哪项。后续操作先重读文件与 `git status`，保留现有修改。

## 已完成 / 已具备的实现

以下均为 **2026-09-30 静态代码检查已验证**，本轮未启动应用或执行业务测试。

| 范围 | 当前实现 | 文件依据 |
|---|---|---|
| 工作台外壳与设置 | 两级导航、首页、自媒体、小工具和设置页已接路由；mist/cool/warm 三主题；设置包含个人资料、通用、外观、AI、待办数据、通知、关于 | [导航](../src/nav.ts)、[App](../src/App.tsx)、[SettingsView](../src/views/SettingsView.tsx)、[app-settings](../electron/app-settings.ts) |
| 待办 / 日程 | 首页、编辑器、事项库组件、提醒与共享库逻辑存在；独立悬浮窗及 440×176 迷你态已接入。首页二级“事项库”仍是规划占位，勿与弹窗组件混淆 | [main](../electron/main.ts) 的 `TODO_DB`/`shared-tasks`、[todo 模块](../modules/todo/)、[FloatTodo](../src/views/FloatTodo.tsx)、[float-window](../electron/float-window.ts)、[SYNC](../modules/todo/SYNC.md) |
| 博客与图文发布 | 多笔记编辑、自动保存/失败重试、AI 修改建议及应用流程；复制正文并打开小红书发布页，发布链接由用户手动关联 | [CopyView](../modules/copywriting/ui/CopyView.tsx)、[copy store](../modules/copywriting/store.ts)、[PublishView](../modules/copywriting/ui/PublishView.tsx)（复制/打开外链见约 130 行） |
| 我的小红书 / 找素材 | 整页浏览器，创作者与找素材两模式，独立持久 workspace；浏览采集、截图与采集列表代码存在。页面明确显示“作品同步暂未接入” | [MediaBrowserView](../src/views/MediaBrowserView.tsx)、[BrowserPane](../modules/browser/ui/pane.tsx)、[browser-guests](../electron/browser-guests.ts)、[media-capture](../modules/media-capture/) |
| 命理三盘 | 八字、紫微、占星分别接 lunar-javascript / iztro / astronomy-engine；命例和共用笔记、删除最后一份命例及空态代码存在。占星暂按 UTC+8，宫位/上升因缺出生地不输出 | [compute](../modules/bazi/compute.ts)、[ziwei](../modules/bazi/ziwei.ts)、[astro](../modules/bazi/astro.ts) 文件头、[BaziView](../modules/bazi/ui/BaziView.tsx)、[BaziStore](../modules/bazi/store.ts) 的 `removeProfile` |
| 常驻 AI | 按工作台恢复对话、同工作台对象跟随/固定、逐轮读取主对象、明确选择的同类参考（最多 8 个）与 `read_reference`；通用页面不自动获取业务工具；建议针对主对象确认应用 | [AI 方案](AI-ASSISTANT-DESIGN.md)（2026-09-30 更新）、[AiPanel](../src/views/AiPanel.tsx)、[ai-scope](../shared/ai-scope.ts)、[ai-ipc](../electron/ai-ipc.ts)（约 348–405 行） |

历史记忆校正：2026-09-29 Codex 摘要曾将“占星”显示名改名记为未完成；当前 `BaziView.tsx` 页签已是“占星”，仅计算文件注释仍含“西洋占星”，不再据旧记忆把显示名改名列为未实现。旧 AI 审查的“只读一份命例”描述也不包含 2026-09-30 新增的显式参考读取。

## 进行中 / 待收尾

这里保留历史检查中的未收束状态和明确未接入项；首版源码已提交，下述其他开发事项的当前执行者、预计完成时间仍待确认。

- **2026-09-30 检查快照**：AI 对象跟随/参考读取及悬浮窗交互相关文件当时尚未提交。检查期间 `tooling/screenshot-float.mjs` 的修改时间达到 16:48 UTC；16:59 复查又发现 4 个新悬浮窗截图（如 `_shots/float-ai-orange.png`），工作区仍在变化。当时推测有其他开发会话改动这些区域，具体工具或任务未确认。上述正式实现已随本次 `v0.1.0` 提交，截图仅在本机留存；后续接手仍需核对最新内容。
- **文档明确未完成**：博客编辑内的浏览器侧栏（v1b）；正式接入时与 AI 共用辅助区域的切换方式已在 [AI 方案 §3](AI-ASSISTANT-DESIGN.md) 定义。当前整页形态已实现，侧栏原型不等于实装。依据：[浏览器计划](MEDIA-BROWSER-PLAN.md)、`CopyView.tsx`（2026-09-30 检查）。
- **已验证的同步缺口**：[SYNC](../modules/todo/SYNC.md) 基准仍为 `v0.5.10`；它指向的本地上游 `C:\Myself\vibe_coding\To-Do-List/package.json` 当前版本为 `0.6.1`。尚未逐文件比较，不能断言所有功能已经漂移或已同步。台账还列待移植的 AI/UI 测试与建议卡 diff/编辑能力；`tooling/` 未找到所规划的上游 drift 脚本，工作台 `package.json` 尚无 `ono-todo-kit` 依赖。
- **安装与更新（2026-10-01）**：已接入 electron-builder 的 Windows x64 NSIS 打包、electron-updater 的 GitHub Releases 更新、设置页检查/下载进度/重启安装。发布流程与 To-Do-List 对齐：版本/CHANGELOG → 测试、提交及推送 main/版本标签 → `npm run release` 同时构建五项资产并使用 `gh release` 发布 → 联网核验。首次正式 Release `v0.1.0` 已发布并完成资产及更新元数据核验；跨版本联网升级待验收。发布步骤见 [RELEASE](RELEASE.md)。
- **其他交付缺口（2026-09-30 快照）**：游戏、网页、封面设计、阅读清单等仍标 `pending`。Office/独立浏览器验收代码存在，但当前 `ViewIdSchema` 与主导航无对应产品入口，不能记为已上线文档中心。依据：[PRODUCT](../PRODUCT.md)、[导航](../src/nav.ts)、[路由契约](../shared/contracts.ts)。

## 已确定的决策

| 决策日期 | 约定 | 原始依据 |
|---|---|---|
| 2026-09-23 | 仅待办 tasks/categories 与 To-Do-List 同库；工作台不写共享库 settings/chats。AI 配置、密钥与聊天存工作台自己的 userData；待办新能力先进入上游，再同步 | [PRODUCT](../PRODUCT.md)、[SYNC](../modules/todo/SYNC.md) |
| 2026-09-24 | 方案 A 玻璃外壳；mist 默认，cool/warm 可切换；设置作为第六个大工作台，个人资料采用设置分区方案 A | [PRODUCT](../PRODUCT.md)、[DESIGN](../DESIGN.md)、[设计记录](../design/README.md) |
| 2026-09-28 | 浏览器采用整页 + 博客侧栏两形态；采集先独立存储。当前上线整页，侧栏延后 | [浏览器计划](MEDIA-BROWSER-PLAN.md)、[设计记录](../design/README.md) |
| 2026-09-30 更新 | 会话按工作台延续，业务对象逐轮校验/重读；参考必须显式选择且只读，写入建议只作用于主对象并须确认 | [AI 方案](AI-ASSISTANT-DESIGN.md)、[UX 合同](../UX-CONTRACT.md) |
| 2026-10-01 | 用户要求发布流程与 To-Do-List 一致，并通过 `gh release` 发布；安装版自动更新，便携版下载完整 ZIP 手动替换 | [RELEASE](RELEASE.md)、[CHANGELOG](../CHANGELOG.md) |

## 下一步

以下为本次交接建议顺序，**不是用户已经批准的功能开发排期**。

1. 先确认其他工具当前正在修改的文件与主任务；补上本文件中执行者/下一步，避免同时覆盖 `App.tsx`、`AiPanel.tsx`、`CopyView.tsx` 和悬浮窗相关文件。
2. 在工作区稳定后对当前快照跑 `npm test`、`npm run verify`、隔离数据目录的 Electron smoke/交互检查；分别记录命令、日期、结果及未覆盖项。重点：AI 跨工作台恢复、对象跟随/固定、参考权限、建议目标与冲突；悬浮窗折叠/展开；最后命例删除。`verify` 不包含单元测试，也不能代替 UI 验收。
3. 对照上游 `0.6.1` 核对 SYNC 映射、schema 和待补测试；完成哪些文件同步后再更新基准。共享包计划保持规划状态，不能因上游版本号跨过计划节点就认定抽包已完成。
4. 首次正式发布与远端资产核验已完成，后续按 [RELEASE](RELEASE.md) 进行真实跨版本升级验收；博客浏览器侧栏、Office 产品入口的优先级仍待确认。同步浏览器计划中的旧“素材浏览器”入口名、随机分区“现状”和阶段范围描述。
5. 用户待确认：正式产品名、Office 编辑深度、占星出生地/时区范围，以及本轮最优先的交付目标。依据：[PRODUCT 开放决策](../PRODUCT.md)、[astro 文件头](../modules/bazi/astro.ts)。

## 验证边界与后续更新

下列早期阶段记录保留原采样结论；当前发布状态见顶部“首版正式发布”及本节的“正式发布收尾”。

- **本轮实际完成（2026-09-30）**：项目定位、Git 状态/近期提交、文档与关键源码检查、相关 Codex 记忆校正；未运行单元测试、typecheck、构建或 GUI 验收。
- **本轮新增（2026-10-01）**：用户同意后，仅清理明确可重建的 Chromium/Vite 缓存与无引用临时文件，释放 1,054,444,772 字节；保留个人数据、设计截图、依赖及旧实验安装包。自动更新新增 5 项测试，全部单元测试 84/84 通过，完整构建通过。开发与打包态更新 UI 的三主题、1280×820/1024×680、进度/失败提示与键盘检查通过。去掉未使用的 Node Canvas 后，Word 转 PDF 和浏览器真实 worker/canvas 渲染通过。最终安装器 194.17 MiB，运行内容 728.62 MiB；载荷完整性、包内版本/更新源/主进程与元数据校验通过，验收展开目录已删除。GitHub API 核实源仓库公开且 Release 为空；未发布、未实装升级。提交清单、空间明细与边界见 [REPOSITORY-AUDIT](REPOSITORY-AUDIT.md)。
- **发布流程对齐（2026-10-01）**：补齐 CHANGELOG、便携说明、`dist:win`/`dist:all`/`release` 及本地检查/远端核验命令；发布器校验版本、五项产物、元数据哈希、日志、干净 main 和本地/远端版本标签，再执行 `gh release create --verify-tag --latest`。新增 21 项发布流程测试，最新全套 **105/105** 通过；`npm run dist:installer` 完整验证和实际打包通过，`npm run release:check` 通过。安装器 203,603,296 字节（194.17 MiB），便携 ZIP 290,291,128 字节（276.84 MiB）；两者 3,986 个运行文件的大小/CRC 一致，压缩包完整性、安装更新源、编译代码一致性与便携无更新源检查通过。公开下载检查改用系统 curl，To-Do-List v0.6.1 的下载地址实测 HTTP 200；发布脚本使用 gh 执行创建与元数据核验。收尾删除本轮旧重复产物及验收提取文件 415,235,072 字节，保留新五项资产与旧实验包；工作区约 2.27 GiB。GitHub Release 列表再次只读核实为空；本轮未提交、推送或正式发布。
- **正式发布收尾（2026-10-01）**：`npm run release` 完整通过，GitHub 最新正式版本为 `v0.1.0`。正式安装器 203,603,297 字节，便携 ZIP 290,291,128 字节；本次重建后压缩包完整性、3,986 个运行文件大小/CRC 一致性、编译代码及安装更新源核验通过，未执行安装器或改变注册表。运行内容仍为 764,016,652 字节（728.62 MiB）；本轮新提取的验收文件 211,409,543 字节已清理。23:45 采样的工作区文件逻辑大小约 2.27 GiB；最终哈希及完整清单见 [REPOSITORY-AUDIT](REPOSITORY-AUDIT.md) 和 Release 的 `SHA256SUMS.txt`。尚未验证真实跨版本下载/安装，不将首版发布核验写成实装升级成功。
- **历史记录**：[三主题 QA](../design-qa.md) 记录 2026-09-24 的 `npm run verify` 与实机主题检查；[AI 原型 QA](AI-ASSISTANT-PREVIEW-QA.md) 的 18 组通过仅针对 2026-09-28 静态原型。`BAZI-PLAN.md` 的“56 测试全绿”为旧阶段文字，不能充当当前全套结果。
- **本机历史补充**：`C:\Users\henry\.codex\memories\memory_summary.md` 指向 `rollout_summaries/2026-09-29T07-07-50-zAOJ-onosan_workbench_ui_design_consistency_audit.md`（记载当时 smoke/typecheck/typography 等通过），以及 `2026-09-24T05-55-26-7hQi-copywriting_editor_layout_save_state_fix.md`（记载当时 6 个 copy-store 测试通过）。这是历史摘要，本轮未重现这些结果。
- ChatGPT 与 ZCode 每次接手先读本文件，再读相关权威文档及当前文件；结束时更新日期、四类进度、依据和实际验证结果。若文件已被另一会话修改，先重读再合并，保留对方记录；不另建平行总台账。仅手动随任务更新，不开启长期自动维护。
