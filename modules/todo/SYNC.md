# 待办模块同步台账(SYNC)

## 当前协议：OnO / CMO 统一事项日期 v4（2026-11-18）

本节优先于下面的历史移植记录。OnO 与 CMO 共用 `%APPDATA%/OnoCmoWorkbench/tasks.db`，与 To-Do-List 的数据库分开。新路径首次初始化时从 `%APPDATA%/To-Do-List/tasks.db` 只读导入事项和标签，在同一个事务内完成 v4 初始化。此后两端的主进程和 Bot 后台都使用工作台库。

- 唯一事项日期为 `dateAt`：`null` 不设日期，`YYYY-MM-DD` 仅日期，带时区 ISO 字符串为具体时刻。日期分组、统计和截止判断从它推导，不再写 `plannedDate` / `dueAt`。
- 普通待办的 `endAt` 可空；日程使用 `dateAt` 开始和 `endAt` 结束。`remindAt` 独立，设置完成期限不自动启用提醒，稍后提醒不改变事项日期。
- 日期、时刻、格式化和迁移共用 `shared/todo-date.ts`；纯日期不经过 UTC 解析，也不伪造午夜时刻。未设日期不判断逾期，日期期限在本地日结束后才逾期。
- 单独导入旧库时保留原文件。有旧 `dueAt` 时优先保留它，否则保留 `plannedDate`。任务身份、状态、提醒、标签、备注、完成记录和来源元数据保留。直接打开既有的 v3 工作台库时，`modules/todo/date-migration.ts` 在写事务内备份原始 payload 到 `todo_date_backup_v3`。
- 新旧格式只在读取旧数据及迁移时转换，持久化和新 API 仅使用新版字段。历史会话原文保留，旧日期格式的待确认建议需重新生成。
- CMO 的 WeLink 映射改为 `event.start -> dateAt`，结束仍用 `endAt`。外部日程身份、账号范围、全天/跨天语义、去重和提醒认领保持；OnO 也按外部只读规则允许完成、禁止改期和删除。
- 两个应用必须使用支持 v4 的代码共同运行；不启动真实用户库的测试迁移。备份表保留用于人工核对，程序版本回退不等于数据版本回退。

回归包括 `tests/todo-date.test.ts`、共享双连接、AI 日期规则、日期导航、会议纪要和顶栏格式化；两仓库实际 Store 的互操作与真实组件 Edge 检查使用独立临时样本。

## 历史移植记录

工作台的待办内核 = 上游 To-Do-List 的清单化移植。本文件记录"上游文件 ↔ 工作台文件"的映射与基准版本。
**同步纪律**:To-Do-List 每次发版后,对下表逐文件 diff 上游新 tag,搬运改动并更新基准版本;搬运后必须跑 `npm test` + `npm run verify`。

### 历史约定：与 To-Do-List 共用数据库（已被当前协议替代）

工作台**直接读写 To-Do-List 的数据库文件** `%APPDATA%/To-Do-List/tasks.db`(见 `electron/main.ts` 的 `TODO_DB`),两边同库同表、数据互通。由此产生的硬性约束:

1. **上游 schema 变更必须同步**:`PRAGMA user_version` 升级意味着表结构变化,不同步就可能在共享库上写出对方读不懂的数据——共享让"跟随上游升级"从纪律变成硬要求。
2. **工作台不写 `settings` 与 `chats` 表**(它们属于 To-Do-List 的应用壳);工作台自身设置存自己的 userData。
3. WAL + busy_timeout=5000 支持多进程并发,已由 `tests/todo-shared.test.ts`(双连接互见性)覆盖。
4. 对方应用的界面不会实时收到我方写入的通知:工作台侧用轮询 + 聚焦刷新解决(已实现);To-Do-List 侧依赖它自己的读取时机,已知限制。
5. 提醒双弹已用**原子认领**缓解(`store.claimDue()`,工作台侧 15 秒轮询、与上游错峰 7 秒):谁先在事务内抢占 `notifiedFor` 谁弹通知,通知失败自动归还。上游仍为先弹后标记,极小窗口内理论上仍可能双弹;彻底消除需上游也吸收认领模式。托盘"退出(停止提醒)"、powerMonitor resume 补查、点击通知聚焦主窗,均与上游一致。

## 工作台专属会议纪要（2026-11-17）

`shared/meeting-notes.ts`、`modules/todo/meeting-notes-store.ts`、`src/meeting-notes.ts` 与 `src/views/MeetingMinutes.tsx` 属于工作台扩展。纪要写入工作台 userData 的 `meeting-notes.db`，以共享日程 ID 关联，不新增或修改 `tasks.db` 的表、列和 user_version，也不改原日程 `note` 的会前说明含义。纪要独立版本、自动保存及本地草稿恢复，不触发共享任务的每字更新。

`TodayBoard/WeekSchedule` 仅在 workspace 变体启用紧凑日期工具栏、已完成会议回查、纪要状态、进入详情及来源回跳；其他紧凑宿主保持原筛选。`TaskEditor` 增加可选 `lockKind` 和来源会议入口，普通新建／编辑及完成确认仍走原逻辑。后续行动转待办调用原 Store.create，只在纪要库记录 taskId；相同行动幂等重试，关联落库失败回滚本次待办创建。以后同步上游时须保留这些可选扩展，不能把工作台纪要表合入共享库。

## 基准版本

| 项 | 值 |
|---|---|
| 上游仓库 | C:\Myself\vibe_coding\To-Do-List(GitHub: zhshenry/To-Do-List) |
| 基准版本 | v0.5.10(上游待办移植基准;与工作台版本无关) |
| 移植日期 | 2026-09-23 |
| 工作台自身版本 | 以根目录 `package.json` 为准；2026-10-17 为 `1.1.0` |

从 v0.5.9 到 v0.5.10,上游映射文件的变更为 `shared/contracts.ts` 的 `insightTarget`、对应 `tests/store.test.ts` 测试及主窗 `src/styles.css` 的 55:45 固定双区布局。前两项已移植到工作台;固定双区属于上游 440px 窄窗布局,工作台首页继续使用自身宽屏双列布局,不移植该 CSS。

## 文件映射

| 上游文件 | 工作台文件 | 状态 | 移植偏差 |
|---|---|---|---|
| `shared/contracts.ts` | `shared/todo-contracts.ts` | ✅ 已移植 | 仅移除 `DesktopAPI` 接口(To-Do-List 应用壳的渲染层 API,工作台自建);文件头有注释标记 |
| — | `tests/todo-shared.test.ts` | ✅ 工作台新增 | 双连接共享库互见性测试(跨应用共享的回归保护,上游无此文件) |
| `shared/format.ts` | `shared/todo-format.ts` | ✅ 已移植 | 无(仅 import 场景不同) |
| `electron/store.ts` | `modules/todo/store.ts` | ✅ 已移植 | ①删除一个未使用的 `CategoryInput` 类型导入;②新增 `claimDue()`/`unclaim()`(跨应用提醒原子认领);③工作台以 `shared-tasks` 模式打开,已有库只校验 v3 结构并设置连接参数,不恢复/写入上游 chats/settings,也不覆盖未来版本号;全新空库只建 tasks/categories 与 v3 标记 |
| `tests/store.test.ts` | `tests/todo-store.test.ts` | ✅ 已移植 | 仅 import 路径 |
| `tests/ai.test.ts` | — | ⏳ 待补 | 随 `electron/ai.ts` 对照(其断言的工具校验逻辑已在 ai-tools.ts 内一致移植,测试随后补) |
| `tests/ui.test.ts` | — | ⏳ 待补 | 依赖 `src/AIConversation.tsx` 的 `miniProposalView`,随建议卡 diff 视图移植 |
| `electron/ai.ts`(内核部分) | `electron/ai-core.ts` | ✅ 已移植 | 拆分:通用循环/供应商适配/错误映射进内核;`runAgentLoop` 接收 `AiModuleContribution`(工具注册制,模块注入)替代上游内嵌待办工具 |
| `electron/ai.ts`(待办部分) | `modules/todo/ai-tools.ts` | ✅ 已移植 | 工具/planFromReply/taskSnapshot 沿用上游；2026-11-17 补充工作台时间语义与参数说明：待办的 endAt 可空，仅日程要求起止时间；总 Bot 与领域 Bot 共用规则，查询中的可选改进不转成必要追问 |
| `electron/main.ts` AI 编排段 | `electron/ai-ipc.ts` + `electron/ai-store.ts` | ✅ 已移植 | 上游 ask/pending/chat 流转一致。**存储独立(用户决策 2026-09-23 修订:AI 不复用,仅待办数据共享)**:供应商/模型/Key/启用 → `userData/ai-config.json`(Key 仍 safeStorage/DPAPI 加密);会话 → `userData/chats.db`(结构同上游 chats 表,CRUD/恢复逻辑平移到 AiStore);**共享库 settings/chats 表完全不写**;applyPlan 落共享库但不传 proposalToken(会话状态在工作台库) |
| `src/AssistantApp.tsx`+`AIConversation.tsx`+`AIProposalCards.tsx` | `src/views/AiPanel.tsx` | ✅ 已移植(适配) | 工作台为内嵌右侧面板而非独立气泡窗;流式/工具事件/建议确认/停止生成/会话管理语义一致;**简化**:建议卡为"动词+字段摘要"而非逐字段 diff 视图、`updateProposal`(逐项编辑建议)未移植(待需要时补) |
| `tests/ai.test.ts`、`tests/ui.test.ts` | — | ⏳ 待补 | 依赖 `miniProposalView`(上游 AIConversation 内),随建议卡 diff 视图增强时移植 |
| `src/ui.tsx` | `modules/todo/ui/ui.tsx` → `src/ui/controls.tsx` | ✅ 已移植 | 2026-10-17 将跨模块控件集中到工作台公共 UI；原路径保留兼容再导出与待办格式函数。移除全仓无调用的 HelpTip 与 BrandMark（现用 LogoMark 在 src/icons.tsx），上游同步仍从此映射逐项比较，避免覆盖其他模块共用的实现。样式继续由 todo.css 桥接 |
| `src/TagColorPresets.tsx` | `modules/todo/ui/TagColorPresets.tsx` | ✅ 已移植 | 原样 |
| `src/TaskEditor.tsx` | `modules/todo/ui/TaskEditor.tsx` | ✅ 已移植 | `api: DesktopAPI` 参数化为 `TaskEditorApi`(create/update/remove/createCategory 四方法,行为一致);`TodoState` 从 shared/workbench-api 兼容再导出 |
| `src/App.tsx` 的 TodayBoard/PlanRow | `modules/todo/ui/TodayBoard.tsx` | ✅ 已提取 | App 壳部分(窗口/迷你卡/悬浮卡)不移植;2026-10-17 移除无调用的 TodayToolbar 及专属样式，复盘入口由 HomeView/FloatTodo 各自提供;PlanRow 的 api/mutate 收敛到父级闭包 |
| `src/styles.css`(plan/modal/form/select 等段) | `modules/todo/ui/todo.css` | ✅ 已移植 | token 改名桥接:上游 `--paper/--ink/--accent/...` → `--todo-*`,值为工作台玻璃蓝;字号映射到外壳 `--type-*`;类名与结构保持一致,硬编码暖色换冷色;widget/dock/mini/assistant/settings 段不移植 |
| `src/TaskLibrary.tsx`(事项库) | `modules/todo/ui/TaskLibrary.tsx` | ✅ 已移植 | `api: DesktopAPI` 参数化为 `TaskLibraryApi`(update/restore);样式段进 todo.css(library-*) |
| `src/SettingsPanel.tsx` | — | ⏳ 后续 | 工作台将来自建设置页,待办相关项(提醒/自启)届时并入 |
| — | `src/views/HomeView.tsx` + `App.tsx` 顶栏 | ✅ 工作台侧 | 数据消费方:轮询(5s)+ 聚焦刷新 + 本进程 `todo:changed` 广播;跨应用写入靠轮询兜底 |

## 校验

```bash
npm test          # 移植的 store/contracts 测试(与上游同一套)
npm run verify    # 类型检查 + 构建
npm run smoke     # Electron 启动冒烟
```
