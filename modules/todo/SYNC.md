# 待办模块同步台账(SYNC)

工作台的待办内核 = 上游 To-Do-List 的清单化移植。本文件记录"上游文件 ↔ 工作台文件"的映射与基准版本。
**同步纪律**:To-Do-List 每次发版后,对下表逐文件 diff 上游新 tag,搬运改动并更新基准版本;搬运后必须跑 `npm test` + `npm run verify`。

## ⚠ 跨应用共享数据(用户决策 2026-09-23)

工作台**直接读写 To-Do-List 的数据库文件** `%APPDATA%/To-Do-List/tasks.db`(见 `electron/main.ts` 的 `TODO_DB`),两边同库同表、数据互通。由此产生的硬性约束:

1. **上游 schema 变更必须同步**:`PRAGMA user_version` 升级意味着表结构变化,不同步就可能在共享库上写出对方读不懂的数据——共享让"跟随上游升级"从纪律变成硬要求。
2. **工作台不写 `settings` 与 `chats` 表**(它们属于 To-Do-List 的应用壳);工作台自身设置存自己的 userData。
3. WAL + busy_timeout=5000 支持多进程并发,已由 `tests/todo-shared.test.ts`(双连接互见性)覆盖。
4. 对方应用的界面不会实时收到我方写入的通知:工作台侧用轮询 + 聚焦刷新解决(已实现);To-Do-List 侧依赖它自己的读取时机,已知限制。
5. 提醒双弹已用**原子认领**缓解(`store.claimDue()`,工作台侧 15 秒轮询、与上游错峰 7 秒):谁先在事务内抢占 `notifiedFor` 谁弹通知,通知失败自动归还。上游仍为先弹后标记,极小窗口内理论上仍可能双弹;彻底消除需上游也吸收认领模式。托盘"退出(停止提醒)"、powerMonitor resume 补查、点击通知聚焦主窗,均与上游一致。

## 基准版本

| 项 | 值 |
|---|---|
| 上游仓库 | C:\Myself\vibe_coding\To-Do-List(GitHub: zhshenry/To-Do-List) |
| 基准版本 | v0.5.10(上游待办移植基准;与工作台版本无关) |
| 移植日期 | 2026-09-23 |
| 工作台自身版本 | `package.json` 的 `0.1.0` |

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
| `electron/ai.ts`(待办部分) | `modules/todo/ai-tools.ts` | ✅ 已移植 | 七个工具/系统提示词/planFromReply/taskSnapshot 逐行一致 |
| `electron/main.ts` AI 编排段 | `electron/ai-ipc.ts` + `electron/ai-store.ts` | ✅ 已移植 | 上游 ask/pending/chat 流转一致。**存储独立(用户决策 2026-09-23 修订:AI 不复用,仅待办数据共享)**:供应商/模型/Key/启用 → `userData/ai-config.json`(Key 仍 safeStorage/DPAPI 加密);会话 → `userData/chats.db`(结构同上游 chats 表,CRUD/恢复逻辑平移到 AiStore);**共享库 settings/chats 表完全不写**;applyPlan 落共享库但不传 proposalToken(会话状态在工作台库) |
| `src/AssistantApp.tsx`+`AIConversation.tsx`+`AIProposalCards.tsx` | `src/views/AiPanel.tsx` | ✅ 已移植(适配) | 工作台为内嵌右侧面板而非独立气泡窗;流式/工具事件/建议确认/停止生成/会话管理语义一致;**简化**:建议卡为"动词+字段摘要"而非逐字段 diff 视图、`updateProposal`(逐项编辑建议)未移植(待需要时补) |
| `tests/ai.test.ts`、`tests/ui.test.ts` | — | ⏳ 待补 | 依赖 `miniProposalView`(上游 AIConversation 内),随建议卡 diff 视图增强时移植 |
| `src/ui.tsx` | `modules/todo/ui/ui.tsx` | ✅ 已移植 | 仅 import 路径(Select/Segmented/DatePicker/TimePicker/Modal/HelpTip/errorText) |
| `src/TagColorPresets.tsx` | `modules/todo/ui/TagColorPresets.tsx` | ✅ 已移植 | 原样 |
| `src/TaskEditor.tsx` | `modules/todo/ui/TaskEditor.tsx` | ✅ 已移植 | `api: DesktopAPI` 参数化为 `TaskEditorApi`(create/update/remove/createCategory 四方法,行为一致);导出 `TodoState` |
| `src/App.tsx` 的 TodayBoard/PlanRow | `modules/todo/ui/TodayBoard.tsx` | ✅ 已提取 | App 壳部分(窗口/迷你卡/悬浮卡)不移植;`plan-more` 复盘按钮抽为 `TodayToolbar` 的 `onReview` prop;PlanRow 的 api/mutate 收敛到父级闭包 |
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
