# 双仓本地需求总表

这里登记 ONOSAN 和 CMO 的本地产品需求。每行列出需求编号、完整名称、各仓业务正文路径、当前状态和计划或任务入口。

[文档总入口](../README.md) · [需求文档规范](#需求资料放置规则) · [工作台目录](#工作台目录) · [进度汇总](#进度汇总) · [CMO 本地需求](../../../cmo_workbench/docs/requirements/README.md) · [ONOSAN GitHub 工单](../issues/README.md) · [CMO GitHub 工单](../../../cmo_workbench/docs/issues/README.md)

路径从所标注的仓库根目录开始。两仓同级检出时可直接打开跨仓链接。

## 需求资料放置规则

### 先确定放在哪

| 工作来源 | 入口 | 管理内容 |
| --- | --- | --- |
| 本地开发的产品需求 | `docs/requirements/<范围>/relNNN-<具体功能>/proposal.md` | 业务目标、方案、实施任务、产品进度和验收 |
| 走 GitHub 自动化流程的工单 | [docs/issues/README.md](../issues/README.md) | 按仓库和编号查工单；讨论、实施状态和关闭结论以原 Issue 为准 |

同一个功能关联 GitHub 工单时，在本地需求附上原 Issue 链接，工单的进度在 GitHub 更新。

| 本地需求归属 | 功能目录 |
| --- | --- |
| 属于一个工作台 | `<工作台>/relNNN-<具体功能>/`，例如 `life/rel035-mingli-birth-date-year-jump/` |
| 多个工作台共用 | `shared/relNNN-<具体功能>/`，例如 `shared/rel011-main-window-shell-and-workbench-layout/` |
| 已有多个独立专项的功能组 | 可多一层，例如 `shared/ai-assistant/rel005-bot-long-term-memory-and-user-preferences/`。自定义 Bot 立项后也归 `shared/ai-assistant/` |
| 两仓都有交付 | 共用一个需求编号，在总表同一行登记各仓实际路径和状态。共用方案维护一份，本仓差异在本仓入口说明并链接主方案 |

通常从 `docs/requirements/` 起两层，按既有功能组归档时三层。小改动更新既有功能，可独立讨论和验收的功能另建目录。阶段和版本写在文件里。

### 需求编号与命名

1. 新需求从总表中已分配的最大编号接着取号。正文与总表使用 `REL001` 这样的编号，功能目录使用小写前缀 `rel001-`。编号随需求保留，改名、调整范围位置和归档都沿用原编号。
2. 中文需求名称写明业务对象或使用场景，以及具体操作或交付结果。例如「命例出生日期的年份快速跳转」。英文目录名用小写单词和连字符，写清同一个对象和用途，例如 `rel035-mingli-birth-date-year-jump`。
3. 总表、分类入口和 `proposal.md` 使用相同的编号及中文名称。工作台和功能组目录用于导航，编号分配给可独立跟踪的具体需求。

### 一个功能目录放什么

按 SDD 顺序维护。先在 `proposal.md` 确认业务目标和验收条件。有界面需要评审时补 `design/` 或 `prototype/`。技术规则明确后写 `spec.md`，再按计划或任务实施，最后登记实际验收结果。

| 文件 | 何时使用 | 内容 |
| --- | --- | --- |
| `proposal.md` | 每个具体需求必有 | **业务需求。** 用户场景、目标、范围、流程和验收条件。交付进展与其他资料从这里查 |
| `design/` | UI 需要单独评审时 | 界面稿、交互说明和视觉状态 |
| `prototype/` | 有可运行原型时 | 可交互原型及其依赖、启动说明 |
| `spec.md` | 技术规则需要单列时 | **技术规格。** 将业务要求落实为数据、接口、权限、状态、异常和兼容规则 |
| `plan.md` | 需要单独安排阶段与依赖时 | 实施顺序和各阶段交付物 |
| `tasks.md` | 需要拆任务、分工或交接时 | 可勾选的执行项、完成条件和状态 |
| `qa.md` | 需要专项验收记录时 | 实测环境、操作、结果与证据链接 |
| `evidence/` | 有保留价值的验收证据时 | 截图、测量和报告 |

具体需求以 `proposal.md` 为唯一入口。`README.md` 用于总表、工作台和功能组导航。小需求可以只维护 `proposal.md`，简短实施任务和验收结果也可记在正文。

### 业务正文怎么写

```markdown
# RELNNN · 完整需求名称

适用产品和工作台。有关联需求或 GitHub 工单时附链接。

## 业务目标与范围
用户遇到的问题、本次交付范围和主要使用流程。

## 验收条件
按场景写操作及可观察到的结果。

## 实施资料
链接已有的技术规格、设计、计划、任务或验收结果。
```

### 总表怎么维护

1. 先查总表是否已有同一需求，再按需分配编号。建立功能目录和 `proposal.md`，登记编号、完整需求名称、各仓正文路径、当前状态以及已有的任务或计划。
2. 实施时在原任务清单补交付项及完成条件。简短交付可直接写在 `proposal.md`。保留适用的设计稿、旧方案和验证记录，从正文链接实际路径。
3. 验收后记录实测结果，并同步任务勾选、总表状态和进度汇总。按状态说明更新阶段。验收范围与环境记录在对应正文。

### 状态说明

总表的「状态」列按产品显示图标和短标签。验收范围、完成数和待补的验证写进对应 `proposal.md` 的「交付进展」。

| 状态 | 使用时机 |
| --- | --- |
| 🟣 设计中 | 正在确认需求范围、交互或方案 |
| ⚪ 待开发 | 已列入计划，等待开发 |
| ⏸️ 待定 | 是否实施或实施范围尚待决定，当前未排期 |
| 🟠 开发中 | 已开始实现，仍有开发项 |
| 🔵 测试中 | 正在按测试清单验证和修复 |
| 🟡 待验收 | 已有实现，等待最终核验 |
| 🟢 已完成 | 当前交付范围已通过验收 |
| 🔎 待核对 | 需要核对本仓实现或历史证据 |
| 📦 已归档 | 历史方案或既有资料留存备查 |

## 工作台目录

| 范围 | 仓内目录 | ONOSAN 入口 | CMO 入口 |
| --- | --- | --- | --- |
| 跨工作台能力 | `docs/requirements/shared/` | [浏览目录](shared/README.md) | [浏览目录](../../../cmo_workbench/docs/requirements/shared/README.md) |
| Bot、助手与 AI 工作区 | `docs/requirements/shared/ai-assistant/` | [浏览目录](shared/ai-assistant/README.md) | [浏览目录](../../../cmo_workbench/docs/requirements/shared/ai-assistant/README.md) |
| 工作台外壳和布局 | `docs/requirements/shared/rel011-main-window-shell-and-workbench-layout/` | [浏览目录](shared/rel011-main-window-shell-and-workbench-layout/proposal.md) | [浏览目录](../../../cmo_workbench/docs/requirements/shared/workbench-shell/proposal.md) |
| 首页、日程与待办 | `docs/requirements/home/` | [浏览目录](home/README.md) | [浏览目录](../../../cmo_workbench/docs/requirements/home/README.md) |
| 网页工作台 | `docs/requirements/web/` | [浏览目录](web/README.md) | [浏览目录](../../../cmo_workbench/docs/requirements/web/README.md) |
| 小工具 | `docs/requirements/life/` | [浏览目录](life/README.md) | [浏览目录](../../../cmo_workbench/docs/requirements/life/README.md) |
| 自媒体工作台 | `docs/requirements/media/` | [浏览目录](media/README.md) | — |
| 游戏工作台 | `docs/requirements/game/` | [浏览目录](game/README.md) | — |
| AI 测试工作台 | `docs/requirements/ai-test/` | [浏览目录](ai-test/README.md) | — |
| 设置 | `docs/requirements/settings/` | [浏览目录](settings/README.md) | [浏览目录](../../../cmo_workbench/docs/requirements/settings/README.md) |

总表的需求路径直接打开业务正文。原规格、专题计划和验收记录由正文链接，可继续按各自的实际路径查阅。

[文档与资源逐项索引](../RESOURCE-INDEX.md) · [设计验收历史入口](../../design-qa.md)

## 进度汇总

| 产品 | 需求记录 | 🟣 设计中 | ⚪ 待开发 | ⏸️ 待定 | 🟠 开发中 | 🔵 测试中 | 🟡 待验收 | 🟢 已完成 | 🔎 待核对 | 📦 已归档 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| ONOSAN | 49 | 0 | 0 | 1 | 3 | 0 | 4 | 33 | 6 | 2 |
| CMO | 33 | 0 | 0 | 1 | 7 | 0 | 4 | 5 | 16 | 0 |

总表共 53 个需求或专项。同一需求涉及两仓时，状态在同一列分行显示，并分别计入各仓汇总。

## Bot 与 AI 工作区

| 编号 | 需求名称 | 业务正文路径 | 状态 | 计划或任务 |
| --- | --- | --- | --- | --- |
| REL001 | 常驻 AI 助手的工作台入口、主对话与模型配置 | ONOSAN [docs/requirements/shared/ai-assistant/rel001-resident-ai-assistant-and-workbench-chat/proposal.md](shared/ai-assistant/rel001-resident-ai-assistant-and-workbench-chat/proposal.md)<br>CMO [docs/requirements/shared/ai-assistant/resident-assistant/proposal.md](../../../cmo_workbench/docs/requirements/shared/ai-assistant/resident-assistant/proposal.md) | ONOSAN 🟢 已完成<br>CMO 🟢 已完成 | [ONOSAN 任务](shared/ai-assistant/rel001-resident-ai-assistant-and-workbench-chat/tasks.md#常驻-ai-助手) · [CMO 任务](../../../cmo_workbench/docs/requirements/shared/ai-assistant/resident-assistant/tasks.md#常驻-ai-助手) |
| REL002 | Bot 基础架构、独立工作区与后台任务恢复 | ONOSAN [docs/requirements/shared/ai-assistant/rel002-bot-runtime-architecture-and-workspace-isolation/proposal.md](shared/ai-assistant/rel002-bot-runtime-architecture-and-workspace-isolation/proposal.md)<br>CMO [docs/requirements/shared/ai-assistant/bot-architecture/proposal.md](../../../cmo_workbench/docs/requirements/shared/ai-assistant/bot-architecture/proposal.md) | ONOSAN 🟢 已完成<br>CMO 🟠 开发中 | [ONOSAN 计划](shared/ai-assistant/rel002-bot-runtime-architecture-and-workspace-isolation/spec.md#12-迁移与实施顺序) · [CMO 计划](../design/cmo-bot-workbench-implementation-2026-11-15.md#12-逐文件改造与实施顺序) |
| REL003 | Bot 对话与右侧工作台的固定并排和悬浮布局 | ONOSAN [docs/requirements/shared/ai-assistant/rel003-bot-chat-and-workspace-layout-modes/proposal.md](shared/ai-assistant/rel003-bot-chat-and-workspace-layout-modes/proposal.md)<br>CMO [docs/requirements/shared/ai-assistant/bot-workspace-layout/proposal.md](../../../cmo_workbench/docs/requirements/shared/ai-assistant/bot-workspace-layout/proposal.md) | ONOSAN 🟢 已完成<br>CMO 🟢 已完成 | [ONOSAN 任务](shared/ai-assistant/rel003-bot-chat-and-workspace-layout-modes/tasks.md#bot-对话与右侧工作台布局) · [CMO 任务](../../../cmo_workbench/docs/requirements/shared/ai-assistant/bot-workspace-layout/tasks.md#bot-对话与右侧工作台布局) |
| REL004 | Bot 持续会话、任务委派、原地确认与跨端同步 | ONOSAN [docs/requirements/shared/ai-assistant/rel004-bot-conversation-delegation-and-sync/proposal.md](shared/ai-assistant/rel004-bot-conversation-delegation-and-sync/proposal.md)<br>CMO [docs/requirements/shared/ai-assistant/bot-collaboration/proposal.md](../../../cmo_workbench/docs/requirements/shared/ai-assistant/bot-collaboration/proposal.md) | ONOSAN 🟠 开发中<br>CMO 🟠 开发中 | [ONOSAN 计划](shared/ai-assistant/rel004-bot-conversation-delegation-and-sync/plan.md#13-分阶段实施和交付) · [CMO 计划](../design/cmo-bot-workbench-implementation-2026-11-15.md#12-逐文件改造与实施顺序) |
| REL005 | Bot 长期记忆的协作约定保存、应用与管理 | ONOSAN [docs/requirements/shared/ai-assistant/rel005-bot-long-term-memory-and-user-preferences/proposal.md](shared/ai-assistant/rel005-bot-long-term-memory-and-user-preferences/proposal.md)<br>CMO [docs/requirements/shared/ai-assistant/bot-memory/proposal.md](../../../cmo_workbench/docs/requirements/shared/ai-assistant/bot-memory/proposal.md) | ONOSAN 🟠 开发中<br>CMO 🟠 开发中 | [ONOSAN 任务](shared/ai-assistant/rel005-bot-long-term-memory-and-user-preferences/tasks.md#任务清单) · [CMO 任务](../../../cmo_workbench/docs/requirements/shared/ai-assistant/bot-memory/tasks.md#任务清单) |
| REL006 | AI 原生工作区的人机接续 | ONOSAN [docs/requirements/shared/ai-assistant/rel006-ai-native-workspace-and-human-bot-handoff/proposal.md](shared/ai-assistant/rel006-ai-native-workspace-and-human-bot-handoff/proposal.md)<br>CMO [docs/requirements/shared/ai-assistant/ai-native-workspace/proposal.md](../../../cmo_workbench/docs/requirements/shared/ai-assistant/ai-native-workspace/proposal.md) | ONOSAN 🟠 开发中<br>CMO 🟠 开发中 | [ONOSAN 任务](shared/ai-assistant/rel006-ai-native-workspace-and-human-bot-handoff/plan.md#六待做功能清单) · [CMO 任务](../../../cmo_workbench/docs/requirements/shared/ai-assistant/ai-native-workspace/plan.md#开工任务) |
| REL007 | 总管与用户接续编辑右侧看板卡片 | ONOSAN [docs/requirements/shared/ai-assistant/rel007-coordinator-dashboard-human-bot-editing/proposal.md](shared/ai-assistant/rel007-coordinator-dashboard-human-bot-editing/proposal.md)<br>CMO [docs/requirements/shared/ai-assistant/coordinator-dashboard/proposal.md](../../../cmo_workbench/docs/requirements/shared/ai-assistant/coordinator-dashboard/proposal.md) | ONOSAN 🟢 已完成<br>CMO 🟢 已完成 | [ONOSAN 任务](shared/ai-assistant/rel007-coordinator-dashboard-human-bot-editing/tasks.md#总管操作右侧看板) · [CMO 任务](../../../cmo_workbench/docs/requirements/shared/ai-assistant/coordinator-dashboard/tasks.md#总管操作右侧看板) |
| REL008 | Bot 对话中的操作确认、补充提问与执行结果卡片 | ONOSAN [docs/requirements/shared/ai-assistant/rel008-bot-chat-confirmation-and-operation-cards/proposal.md](shared/ai-assistant/rel008-bot-chat-confirmation-and-operation-cards/proposal.md)<br>CMO [docs/requirements/shared/ai-assistant/bot-operation-cards/proposal.md](../../../cmo_workbench/docs/requirements/shared/ai-assistant/bot-operation-cards/proposal.md) | ONOSAN 🟢 已完成<br>CMO 🟢 已完成 | [ONOSAN 任务](shared/ai-assistant/rel008-bot-chat-confirmation-and-operation-cards/tasks.md#bot-对话操作卡片) · [CMO 任务](../../../cmo_workbench/docs/requirements/shared/ai-assistant/bot-operation-cards/tasks.md#bot-对话操作卡片) |
| REL009 | 办公材料工作台的来源回查、对话接续与转待办 | CMO [docs/requirements/shared/ai-assistant/office-materials/proposal.md](../../../cmo_workbench/docs/requirements/shared/ai-assistant/office-materials/proposal.md) | CMO 🟠 开发中 | [CMO 任务](../../../cmo_workbench/docs/requirements/shared/ai-assistant/ai-native-workspace/plan.md#开工任务) |
| REL010 | 企业助理的会前准备、会中记录与会后行动跟进 | CMO [docs/requirements/shared/ai-assistant/enterprise-assistant/proposal.md](../../../cmo_workbench/docs/requirements/shared/ai-assistant/enterprise-assistant/proposal.md) | CMO 🟠 开发中 | [CMO 任务](../../../cmo_workbench/docs/requirements/shared/ai-assistant/enterprise-assistant/tasks.md#企业助理与会议伴侣) |

## 其他共享能力

| 编号 | 需求名称 | 业务正文路径 | 状态 | 计划或任务 |
| --- | --- | --- | --- | --- |
| REL011 | 主窗口外壳、工作台视图与面板布局 | ONOSAN [docs/requirements/shared/rel011-main-window-shell-and-workbench-layout/proposal.md](shared/rel011-main-window-shell-and-workbench-layout/proposal.md)<br>CMO [docs/requirements/shared/workbench-shell/proposal.md](../../../cmo_workbench/docs/requirements/shared/workbench-shell/proposal.md) | ONOSAN 🔎 待核对<br>CMO 🔎 待核对 | [ONOSAN 任务](shared/rel011-main-window-shell-and-workbench-layout/tasks.md) · [CMO 任务](../../../cmo_workbench/docs/requirements/shared/workbench-shell/tasks.md) |
| REL012 | 工作台导航入口、悬浮目录与选中状态 | ONOSAN [docs/requirements/shared/rel012-workbench-navigation-and-floating-menu/proposal.md](shared/rel012-workbench-navigation-and-floating-menu/proposal.md)<br>CMO [docs/requirements/shared/navigation/proposal.md](../../../cmo_workbench/docs/requirements/shared/navigation/proposal.md) | ONOSAN 🟢 已完成<br>CMO 🔎 待核对 | [ONOSAN 任务](shared/rel012-workbench-navigation-and-floating-menu/tasks.md) · [CMO 任务](../../../cmo_workbench/docs/requirements/shared/navigation/tasks.md) |
| REL013 | 工作台主题切换、玻璃材质与视觉可读性 | ONOSAN [docs/requirements/shared/rel013-appearance-themes-and-glass-materials/proposal.md](shared/rel013-appearance-themes-and-glass-materials/proposal.md)<br>CMO [docs/requirements/shared/themes/proposal.md](../../../cmo_workbench/docs/requirements/shared/themes/proposal.md) | ONOSAN 🟢 已完成<br>CMO 🟡 待验收 | [ONOSAN 任务](shared/rel013-appearance-themes-and-glass-materials/tasks.md) · [CMO 任务](../../../cmo_workbench/docs/requirements/shared/themes/tasks.md) |
| REL014 | AI 对话的协助对象选择、上下文引用与会话回看 | ONOSAN [docs/requirements/shared/rel014-ai-context-selection-and-conversation-history/proposal.md](shared/rel014-ai-context-selection-and-conversation-history/proposal.md)<br>CMO [docs/requirements/shared/ai-context/proposal.md](../../../cmo_workbench/docs/requirements/shared/ai-context/proposal.md) | ONOSAN 🟢 已完成<br>CMO 🟢 已完成 | [ONOSAN 任务](shared/rel014-ai-context-selection-and-conversation-history/tasks.md) · [CMO 任务](../../../cmo_workbench/docs/requirements/shared/ai-context/tasks.md) |
| REL015 | AI 连续任务的进度胶囊、停止与恢复 | ONOSAN [docs/requirements/shared/rel015-ai-task-progress-and-run-controls/proposal.md](shared/rel015-ai-task-progress-and-run-controls/proposal.md)<br>CMO [docs/requirements/shared/ai-activity/proposal.md](../../../cmo_workbench/docs/requirements/shared/ai-activity/proposal.md) | ONOSAN 🟢 已完成<br>CMO 🔎 待核对 | [ONOSAN 任务](shared/rel015-ai-task-progress-and-run-controls/tasks.md) · [CMO 任务](../../../cmo_workbench/docs/requirements/shared/ai-activity/tasks.md) |
| REL016 | 离线语音听写的录音设备选择、识别与文字回填 | ONOSAN [docs/requirements/shared/rel016-offline-voice-dictation-and-text-insertion/proposal.md](shared/rel016-offline-voice-dictation-and-text-insertion/proposal.md)<br>CMO [docs/requirements/shared/voice-input/proposal.md](../../../cmo_workbench/docs/requirements/shared/voice-input/proposal.md) | ONOSAN 🟢 已完成<br>CMO 🔎 待核对 | [ONOSAN 任务](shared/rel016-offline-voice-dictation-and-text-insertion/tasks.md) · [CMO 任务](../../../cmo_workbench/docs/requirements/shared/voice-input/tasks.md) |
| REL017 | 顶栏的日程待办胶囊、快捷面板与常用操作 | ONOSAN [docs/requirements/shared/rel017-topbar-calendar-and-todo-quick-actions/proposal.md](shared/rel017-topbar-calendar-and-todo-quick-actions/proposal.md)<br>CMO [docs/requirements/shared/topbar/proposal.md](../../../cmo_workbench/docs/requirements/shared/topbar/proposal.md) | ONOSAN 🟢 已完成<br>CMO 🔎 待核对 | [ONOSAN 任务](shared/rel017-topbar-calendar-and-todo-quick-actions/tasks.md) · [CMO 任务](../../../cmo_workbench/docs/requirements/shared/topbar/tasks.md) |
| REL018 | 应用版本检查、更新安装与状态反馈 | ONOSAN [docs/requirements/shared/rel018-app-update-check-and-installation/proposal.md](shared/rel018-app-update-check-and-installation/proposal.md)<br>CMO [docs/requirements/shared/app-update/proposal.md](../../../cmo_workbench/docs/requirements/shared/app-update/proposal.md) | ONOSAN 🟡 待验收<br>CMO 🔎 待核对 | [ONOSAN 任务](shared/rel018-app-update-check-and-installation/tasks.md) · [CMO 任务](../../../cmo_workbench/docs/requirements/shared/app-update/tasks.md) |
| REL019 | 桌面灵动岛的 Bot 动态、消息与 AI 用量面板 | ONOSAN [docs/requirements/shared/rel019-desktop-island-bot-activity-and-ai-quota/proposal.md](shared/rel019-desktop-island-bot-activity-and-ai-quota/proposal.md)<br>CMO [docs/requirements/shared/desktop-island/proposal.md](../../../cmo_workbench/docs/requirements/shared/desktop-island/proposal.md) | ONOSAN 🟡 待验收<br>CMO 🟡 待验收 | [ONOSAN 任务](shared/rel019-desktop-island-bot-activity-and-ai-quota/tasks.md) · [CMO 任务](../../../cmo_workbench/docs/requirements/shared/desktop-island/tasks.md) |
| REL020 | 总台每日签到的账号配置、执行与结果查看 | ONOSAN [docs/requirements/shared/rel020-daily-check-in-accounts-and-results/proposal.md](shared/rel020-daily-check-in-accounts-and-results/proposal.md) | ONOSAN 🟡 待验收 | [ONOSAN 任务](shared/rel020-daily-check-in-accounts-and-results/tasks.md) |

## 首页、日程与待办

| 编号 | 需求名称 | 业务正文路径 | 状态 | 计划或任务 |
| --- | --- | --- | --- | --- |
| REL021 | 首页看板卡片的添加、排布、样式与布局保存 | ONOSAN [docs/requirements/home/rel021-home-dashboard-card-layout-and-styles/proposal.md](home/rel021-home-dashboard-card-layout-and-styles/proposal.md) | ONOSAN 🟢 已完成 | [ONOSAN 任务](home/rel021-home-dashboard-card-layout-and-styles/tasks.md) |
| REL022 | 悬浮待办窗口与迷你卡的展开、收起和任务处理 | ONOSAN [docs/requirements/home/rel022-floating-todo-window-and-mini-card/proposal.md](home/rel022-floating-todo-window-and-mini-card/proposal.md)<br>CMO [docs/requirements/home/floating-todo/proposal.md](../../../cmo_workbench/docs/requirements/home/floating-todo/proposal.md) | ONOSAN 🔎 待核对<br>CMO 🔎 待核对 | [ONOSAN 任务](home/rel022-floating-todo-window-and-mini-card/tasks.md) · [CMO 任务](../../../cmo_workbench/docs/requirements/home/floating-todo/tasks.md) |
| REL023 | 跨产品共享的待办组件、数据规则与确认流程 | ONOSAN [docs/requirements/home/rel023-cross-product-todo-kit-and-workflows/proposal.md](home/rel023-cross-product-todo-kit-and-workflows/proposal.md)<br>CMO [docs/requirements/home/todo-shared-kit/proposal.md](../../../cmo_workbench/docs/requirements/home/todo-shared-kit/proposal.md) | ONOSAN ⏸️ 待定<br>CMO ⏸️ 待定 | [ONOSAN 迁移提案](home/rel023-cross-product-todo-kit-and-workflows/plan.md) · [CMO 迁移提案](../../../cmo_workbench/docs/requirements/home/todo-shared-kit/plan.md) |
| REL024 | 日程会议纪要的编辑、回看与行动项转待办 | ONOSAN [docs/requirements/home/rel024-calendar-meeting-minutes-and-follow-ups/proposal.md](home/rel024-calendar-meeting-minutes-and-follow-ups/proposal.md) | ONOSAN 🟢 已完成 | [ONOSAN 计划](../design/schedule-minutes-optimization-2026-11-17.md#建议实施顺序) |
| REL025 | 邮箱日历与 WeLink 会议的双来源同步及状态回查 | CMO [docs/requirements/home/welink-calendar-sync/proposal.md](../../../cmo_workbench/docs/requirements/home/welink-calendar-sync/proposal.md) | CMO 🟡 待验收 | [CMO 任务](../../../cmo_workbench/docs/requirements/home/welink-calendar-sync/tasks.md) |
| REL026 | 双来源会议的日程合并与会后纪要回查 | CMO [docs/requirements/home/meeting-closure/proposal.md](../../../cmo_workbench/docs/requirements/home/meeting-closure/proposal.md) | CMO 🟠 开发中 | [CMO 计划](../../../cmo_workbench/docs/meeting-closure.md#九实施顺序每步独立可验证可回退) |

## 网页工作台

| 编号 | 需求名称 | 业务正文路径 | 状态 | 计划或任务 |
| --- | --- | --- | --- | --- |
| REL027 | 内置浏览器的标签页上下文、AI 操作与用户接手 | ONOSAN [docs/requirements/web/rel027-embedded-browser-ai-actions-and-handoff/proposal.md](web/rel027-embedded-browser-ai-actions-and-handoff/proposal.md)<br>CMO [docs/requirements/web/browser-automation/proposal.md](../../../cmo_workbench/docs/requirements/web/browser-automation/proposal.md) | ONOSAN 🟢 已完成<br>CMO 🟡 待验收 | [ONOSAN 任务](web/rel027-embedded-browser-ai-actions-and-handoff/tasks.md) · [CMO 任务](../../../cmo_workbench/docs/requirements/web/browser-automation/tasks.md) |
| REL028 | 浏览器 AI 任务的执行记录、状态与页面定位 | ONOSAN [docs/requirements/web/rel028-browser-task-history-and-page-location/proposal.md](web/rel028-browser-task-history-and-page-location/proposal.md)<br>CMO [docs/requirements/web/browser-task-record/proposal.md](../../../cmo_workbench/docs/requirements/web/browser-task-record/proposal.md) | ONOSAN 🟢 已完成<br>CMO 🔎 待核对 | [ONOSAN 任务](web/rel028-browser-task-history-and-page-location/qa.md#implementation-checklist) · [CMO 任务](../../../cmo_workbench/docs/requirements/web/browser-task-record/tasks.md) |
| REL029 | 浏览器 AI 访问站点的授权确认与继续操作 | ONOSAN [docs/requirements/web/rel029-browser-site-permission-and-resume/proposal.md](web/rel029-browser-site-permission-and-resume/proposal.md)<br>CMO [docs/requirements/web/site-authorization/proposal.md](../../../cmo_workbench/docs/requirements/web/site-authorization/proposal.md) | ONOSAN 🟢 已完成<br>CMO 🔎 待核对 | [ONOSAN 任务](web/rel029-browser-site-permission-and-resume/tasks.md) · [CMO 任务](../../../cmo_workbench/docs/requirements/web/site-authorization/tasks.md) |
| REL030 | 内置浏览器的网页缩放、恢复与任务接续 | ONOSAN [docs/requirements/web/rel030-browser-page-zoom-and-task-resume/proposal.md](web/rel030-browser-page-zoom-and-task-resume/proposal.md)<br>CMO [docs/requirements/web/page-zoom/proposal.md](../../../cmo_workbench/docs/requirements/web/page-zoom/proposal.md) | ONOSAN 🟢 已完成<br>CMO 🔎 待核对 | [ONOSAN 任务](web/rel030-browser-page-zoom-and-task-resume/tasks.md) · [CMO 任务](../../../cmo_workbench/docs/requirements/web/page-zoom/tasks.md) |
| REL031 | 浏览器 AI 操作的运行、待授权与完成状态动效 | ONOSAN [docs/requirements/web/rel031-browser-ai-activity-state-indicators/proposal.md](web/rel031-browser-ai-activity-state-indicators/proposal.md)<br>CMO [docs/requirements/web/browser-activity/proposal.md](../../../cmo_workbench/docs/requirements/web/browser-activity/proposal.md) | ONOSAN 🟢 已完成<br>CMO 🔎 待核对 | [ONOSAN 任务](web/rel031-browser-ai-activity-state-indicators/tasks.md) · [CMO 任务](../../../cmo_workbench/docs/requirements/web/browser-activity/tasks.md) |
| REL032 | Hush-Hour 正式访问入口与本地开发预览 | ONOSAN [docs/requirements/web/rel032-hush-hour-entry-and-local-preview/proposal.md](web/rel032-hush-hour-entry-and-local-preview/proposal.md) | ONOSAN 🟢 已完成 | [ONOSAN 任务](web/rel032-hush-hour-entry-and-local-preview/tasks.md) |
| REL033 | 个人网站的内容编辑、双端预览与构建检查 | ONOSAN [docs/requirements/web/rel033-personal-website-editor-preview-and-build/proposal.md](web/rel033-personal-website-editor-preview-and-build/proposal.md) | ONOSAN 🟢 已完成 | [ONOSAN 任务](web/rel033-personal-website-editor-preview-and-build/tasks.md) |

## 小工具

| 编号 | 需求名称 | 业务正文路径 | 状态 | 计划或任务 |
| --- | --- | --- | --- | --- |
| REL034 | 命例管理、八字紫微占星排盘与 AI 解读 | ONOSAN [docs/requirements/life/rel034-mingli-profile-charts-and-ai-reading/proposal.md](life/rel034-mingli-profile-charts-and-ai-reading/proposal.md) | ONOSAN 🟢 已完成 | [ONOSAN 任务](life/rel034-mingli-profile-charts-and-ai-reading/tasks.md) |
| REL035 | 命例出生日期的年份快速跳转 | ONOSAN [docs/requirements/life/rel035-mingli-birth-date-year-jump/proposal.md](life/rel035-mingli-birth-date-year-jump/proposal.md) | ONOSAN 🔎 待核对 | [ONOSAN 任务](life/rel035-mingli-birth-date-year-jump/tasks.md) |
| REL036 | 阅读清单的书目管理、阅读信息与 AI 协助 | ONOSAN [docs/requirements/life/rel036-reading-list-management-and-ai-assistance/proposal.md](life/rel036-reading-list-management-and-ai-assistance/proposal.md)<br>CMO [docs/requirements/life/reading/proposal.md](../../../cmo_workbench/docs/requirements/life/reading/proposal.md) | ONOSAN 🔎 待核对<br>CMO 🔎 待核对 | [ONOSAN 任务](life/rel036-reading-list-management-and-ai-assistance/tasks.md) · [CMO 任务](../../../cmo_workbench/docs/requirements/life/reading/tasks.md) |
| REL037 | 阅读库路径配置、书目导入与删除确认 | ONOSAN [docs/requirements/life/rel037-reading-library-setup-import-and-delete/proposal.md](life/rel037-reading-library-setup-import-and-delete/proposal.md)<br>CMO [docs/requirements/life/reading-import-51/proposal.md](../../../cmo_workbench/docs/requirements/life/reading-import-51/proposal.md) | ONOSAN 🟢 已完成<br>CMO 🔎 待核对 | [ONOSAN 任务](life/rel037-reading-library-setup-import-and-delete/tasks.md) · [CMO 任务](../../../cmo_workbench/docs/requirements/life/reading-import-51/tasks.md) |
| REL038 | 阅读列表与详情面板的状态、进度和布局调整 | ONOSAN [docs/requirements/life/rel038-reading-list-detail-status-and-progress/proposal.md](life/rel038-reading-list-detail-status-and-progress/proposal.md)<br>CMO [docs/requirements/life/reading-details-60-67/proposal.md](../../../cmo_workbench/docs/requirements/life/reading-details-60-67/proposal.md) | ONOSAN 🟢 已完成<br>CMO 🔎 待核对 | [ONOSAN 任务](life/rel038-reading-list-detail-status-and-progress/tasks.md) · [CMO 任务](../../../cmo_workbench/docs/requirements/life/reading-details-60-67/tasks.md) |

## 自媒体工作台

| 编号 | 需求名称 | 业务正文路径 | 状态 | 计划或任务 |
| --- | --- | --- | --- | --- |
| REL039 | 自媒体工作台的小红书内容与素材浏览侧栏 | ONOSAN [docs/requirements/media/rel039-creator-content-and-media-browser/proposal.md](media/rel039-creator-content-and-media-browser/proposal.md) | ONOSAN 📦 已归档 | [ONOSAN 任务](media/rel039-creator-content-and-media-browser/tasks.md) |
| REL040 | 博客编辑中的 AI 写作入口与生成结果回看 | ONOSAN [docs/requirements/media/rel040-blog-editor-ai-writing-and-result-review/proposal.md](media/rel040-blog-editor-ai-writing-and-result-review/proposal.md) | ONOSAN 📦 已归档 | [ONOSAN 任务](media/rel040-blog-editor-ai-writing-and-result-review/tasks.md) |

## 游戏工作台

| 编号 | 需求名称 | 业务正文路径 | 状态 | 计划或任务 |
| --- | --- | --- | --- | --- |
| REL041 | 轨迹侦探在游戏工作台的运行、试玩与测试结果 | ONOSAN [docs/requirements/game/rel041-trail-detective-launch-preview-and-tests/proposal.md](game/rel041-trail-detective-launch-preview-and-tests/proposal.md) | ONOSAN 🟢 已完成 | [ONOSAN 任务](game/rel041-trail-detective-launch-preview-and-tests/tasks.md) |
| REL042 | 游戏项目终端的打开、命令运行与项目目录跟随 | ONOSAN [docs/requirements/game/rel042-game-project-terminal-and-command-execution/proposal.md](game/rel042-game-project-terminal-and-command-execution/proposal.md) | ONOSAN 🟢 已完成 | [ONOSAN 任务](game/rel042-game-project-terminal-and-command-execution/tasks.md) |
| REL043 | 游戏工作台项目栏的项目切换、菜单与试玩入口 | ONOSAN [docs/requirements/game/rel043-game-project-switcher-and-preview-entry/proposal.md](game/rel043-game-project-switcher-and-preview-entry/proposal.md) | ONOSAN 🟢 已完成 | [ONOSAN 任务](game/rel043-game-project-switcher-and-preview-entry/tasks.md) |
| REL044 | 游戏测试与通关入口的选择及过期结果提示 | ONOSAN [docs/requirements/game/rel044-game-test-selector-and-stale-results/proposal.md](game/rel044-game-test-selector-and-stale-results/proposal.md) | ONOSAN 🟢 已完成 | [ONOSAN 任务](game/rel044-game-test-selector-and-stale-results/tasks.md) |
| REL045 | 游戏的本地与线上试玩入口、环境状态及侧栏 | ONOSAN [docs/requirements/game/rel045-game-local-and-online-preview-sidebar/proposal.md](game/rel045-game-local-and-online-preview-sidebar/proposal.md) | ONOSAN 🟡 待验收 | [ONOSAN 任务](game/rel045-game-local-and-online-preview-sidebar/tasks.md) |
| REL046 | 游戏项目的运行步骤与关联资源入口 | ONOSAN [docs/requirements/game/rel046-game-run-instructions-and-resource-links/proposal.md](game/rel046-game-run-instructions-and-resource-links/proposal.md) | ONOSAN 🟢 已完成 | [ONOSAN 任务](game/rel046-game-run-instructions-and-resource-links/tasks.md) |
| REL047 | 游戏试玩的代码变更提示与页面刷新 | ONOSAN [docs/requirements/game/rel047-game-preview-code-change-and-reload/proposal.md](game/rel047-game-preview-code-change-and-reload/proposal.md) | ONOSAN 🟢 已完成 | [ONOSAN 任务](game/rel047-game-preview-code-change-and-reload/tasks.md) |
| REL048 | 游戏试玩视图的窗口内展开与原布局恢复 | ONOSAN [docs/requirements/game/rel048-game-preview-expand-and-restore-layout/proposal.md](game/rel048-game-preview-expand-and-restore-layout/proposal.md) | ONOSAN 🟢 已完成 | [ONOSAN 任务](game/rel048-game-preview-expand-and-restore-layout/tasks.md) |
| REL049 | 游戏试玩问题的截图记录与 ZIP 导出 | ONOSAN [docs/requirements/game/rel049-game-playtest-feedback-and-zip-export/proposal.md](game/rel049-game-playtest-feedback-and-zip-export/proposal.md) | ONOSAN 🟢 已完成 | [ONOSAN 任务](game/rel049-game-playtest-feedback-and-zip-export/tasks.md) |
| REL050 | 游戏试玩环境的重置与指定存档保留 | ONOSAN [docs/requirements/game/rel050-game-playtest-reset-and-save-retention/proposal.md](game/rel050-game-playtest-reset-and-save-retention/proposal.md) | ONOSAN 🟢 已完成 | [ONOSAN 任务](game/rel050-game-playtest-reset-and-save-retention/tasks.md) |

## AI 测试工作台

| 编号 | 需求名称 | 业务正文路径 | 状态 | 计划或任务 |
| --- | --- | --- | --- | --- |
| REL051 | AI 模型直出与 Agent 执行对比、运行记录与产物查看 | ONOSAN [docs/requirements/ai-test/rel051-model-agent-comparison-and-test-outputs/proposal.md](ai-test/rel051-model-agent-comparison-and-test-outputs/proposal.md) | ONOSAN 🔎 待核对 | [ONOSAN 任务](ai-test/rel051-model-agent-comparison-and-test-outputs/tasks.md) |

## 设置

| 编号 | 需求名称 | 业务正文路径 | 状态 | 计划或任务 |
| --- | --- | --- | --- | --- |
| REL052 | 工作台通用设置的分类布局、偏好编辑与保存 | ONOSAN [docs/requirements/settings/rel052-workbench-preferences-and-save-feedback/proposal.md](settings/rel052-workbench-preferences-and-save-feedback/proposal.md)<br>CMO [docs/requirements/settings/preferences/proposal.md](../../../cmo_workbench/docs/requirements/settings/preferences/proposal.md) | ONOSAN 🟢 已完成<br>CMO 🔎 待核对 | [ONOSAN 任务](settings/rel052-workbench-preferences-and-save-feedback/tasks.md) · [CMO 任务](../../../cmo_workbench/docs/requirements/settings/preferences/tasks.md) |
| REL053 | 工作台个人资料的统一入口与显示信息编辑 | ONOSAN [docs/requirements/settings/rel053-workbench-profile-editing/proposal.md](settings/rel053-workbench-profile-editing/proposal.md)<br>CMO [docs/requirements/settings/profile/proposal.md](../../../cmo_workbench/docs/requirements/settings/profile/proposal.md) | ONOSAN 🔎 待核对<br>CMO 🔎 待核对 | [ONOSAN 任务](settings/rel053-workbench-profile-editing/tasks.md) · [CMO 任务](../../../cmo_workbench/docs/requirements/settings/profile/tasks.md) |
