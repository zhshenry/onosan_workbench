# Bot 与 AI 工作区

## 功能目录

[返回本地需求](../../README.md)。每个专项的业务正文链接该项的技术规则、计划或任务。

| 业务正文 |
| --- |
| [REL001 · 常驻 AI 助手的工作台入口、主对话与模型配置](rel001-resident-ai-assistant-and-workbench-chat/proposal.md) |
| [REL002 · Bot 基础架构、独立工作区与后台任务恢复](rel002-bot-runtime-architecture-and-workspace-isolation/proposal.md) |
| [REL003 · Bot 对话与右侧工作台的固定并排和悬浮布局](rel003-bot-chat-and-workspace-layout-modes/proposal.md) |
| [REL004 · Bot 持续会话、任务委派、原地确认与跨端同步](rel004-bot-conversation-delegation-and-sync/proposal.md) |
| [REL005 · Bot 长期记忆的协作约定保存、应用与管理](rel005-bot-long-term-memory-and-user-preferences/proposal.md) |
| [REL006 · AI 原生工作区的人机接续](rel006-ai-native-workspace-and-human-bot-handoff/proposal.md) |
| [REL007 · 总管与用户接续编辑右侧看板卡片](rel007-coordinator-dashboard-human-bot-editing/proposal.md) |
| [REL008 · Bot 对话中的操作确认、补充提问与执行结果卡片](rel008-bot-chat-confirmation-and-operation-cards/proposal.md) |

## 方案与验收文字

- [OnoSan 与 CMO 的 AI 原生工作区方案与并行实施计划](rel006-ai-native-workspace-and-human-bot-handoff/plan.md)（2026-11-22 更新）。记录已验收的看板和聊天、办公接手、分机部署及待定方向。
- [OnO Bot 会话、协作与通信完整改造方案](rel004-bot-conversation-delegation-and-sync/plan.md)（2026-11-22 更新）。第 5.5 节记录消息与界面，第 12.6 节记录性能测量，第 12.7 节记录单主对话、分页和收起历史。
- [Bot 协作与通信首批实施记录（2026-11-17）](rel004-bot-conversation-delegation-and-sync/qa.md)：原地确认/补充、双方记录、持久发送、只读消息和增量保存；81项检查、六项隔离Electron流程及合成性能测量。Pi原生steer与完整恢复/性能矩阵尚未验完，闲置缓存暂不启用。
- [通用个人 Bot 工作台架构方案](rel002-bot-runtime-architecture-and-workspace-isolation/spec.md)（2026-11-22 更新）。包括持续双方消息、原地确认、独立草稿、单主对话的历史显示和模型上下文规则。
- [OnO 实施与验证记录（2026-11-16，历史阶段）](rel002-bot-runtime-architecture-and-workspace-isolation/qa.md)：M0–M5、独立 Host、迁移/回退、真实模型和 Windows 托管实测及环境限制；当时的 CMO 未开发边界不代表当前状态。
- [OnO 接入方案与 CMO 复用映射（2026-11-18 更新）](rel002-bot-runtime-architecture-and-workspace-isolation/plan.md)：OnO 当前八 Bot，命理／阅读独立、签到归总台及设置；原迁移记录保留，后续共用行为统一引用完整方案。
- [CMO Bot 工作台架构优化与实施方案（2026-11-18 更新）](../../../design/cmo-bot-workbench-implementation-2026-11-15.md)：校正已迁移核心与 v7／数据库 6，保留六领域、企业业务边界和独立证据；M9 列出语音居中、长历史分页、收起历史、新对话与历史管理，原生运行控制／缓存／动态 Bot 继续独立列项。本轮仅更新文档。
- [CMO Bot 核心实施记录（2026-11-18，CMO 仓库）](../../../../../cmo_workbench/docs/requirements/shared/ai-assistant/bot-architecture/qa.md)：当前实现、82 项 Bot 检查、14 项隔离 Electron 流程及剩余限制；全量测试仍有既有失败，不以 OnO 证据代替。
- [双方持续对话整窗高保真 v4（已确认）](../../../../design/bot-collaboration-ui-2026-11-17/README.md)：左侧原对话区只读查看，右侧工作区位置和宽度保持，无第三列／对象切换条；返回继续原主对话。对应核心布局已在隔离Electron验证，图内数据仍为示例。
- [Bot 双模式高保真外观修订（2026-11-16 更新）](design/bot-visual-revision-2026-11-15.md)：v3 内容、经典 v2 双长胶囊及悬浮 v1；业务标题卡、状态覆盖与图稿交接清单。
- [Bot 六个主要状态稿（2026-11-16，已确认）](design/bot-state-review-2026-11-16.md)：名片展开、资料编辑、交付件列表、悬浮输入框收起／展开及灵动岛总 Bot 对话的设计基线；实际运行证据另见实施记录和根目录 design-qa.md。
- [Bot 头像系统（2026-11-16，已落地）](design/bot-avatar-system-2026-11-16.md)：头像与颜色分开选；角色（竖眼，默认）与图形（固定浅底）在编辑弹窗切换；默认搭配、旧值迁移与几何数据。头像缓存及后续性能修复见完整方案，保留原悬停外框。
- [spec.md](rel001-resident-ai-assistant-and-workbench-chat/spec.md)
- [preview-qa-2026-09-28.md](rel001-resident-ai-assistant-and-workbench-chat/preview-qa-2026-09-28.md)
- [供应商页内配置与验收（2026-11-05）](rel001-resident-ai-assistant-and-workbench-chat/qa-inline-provider-2026-11-05.md)
- [双栏直编修订稿](design/provider-inline-approved-2026-11-05.png)
- [首次配置引导与验收（2026-11-05）](rel001-resident-ai-assistant-and-workbench-chat/qa-setup-hint-2026-11-05.md)
- [顶栏配置气泡确认稿](design/ai-setup-hint-approved-2026-11-05.png)
