# 常驻 AI 助手

所属：跨工作台能力。资料状态：正式方案与历史原型。

当前规范：[视觉](../../../../DESIGN.md) · [行为](../../../../UX-CONTRACT.md)。需求方案、历史原型和旧截图均按其日期解读；整理目录不代表新增实施或重新验收。

2026-11-17：命理与阅读清单已拆为两个工作台和两条 Bot 主对话；旧工具助理身份继续用于命理，阅读使用新身份。签到归总台，连接与自动配置迁入设置，不新增签到 Bot。旧数据迁移保留混合主对话、草稿和任务，书目专属历史转交阅读。该次拆分使用v4；后续头像活动升级到v6，本轮协作与通信升级到v7、数据库6，仍保留旧任务执行中的升级保护。详见当前行为合同、[本轮实施记录](bot-collaboration-implementation-2026-11-17.md)与[签到说明](../checkin/README.md)。

## 方案与验收文字

- [OnoSan 与 CMO 的 AI 原生工作区方案与并行实施计划](ai-native-workspace-parallel-plan-2026-11-20.md)（2026-11-20，方案稿）。两仓从第一阶段同时实施总管看板、办公事项转待办两个试点，并联合验收操作回执和人机接续。
- [OnO Bot 会话、协作与通信完整改造方案（2026-11-18 更新，实施中）](bot-collaboration-and-sync-plan-2026-11-17.md)：P0–P6 路线，含 DS-Bot 对照、持续双方记录、原地确认、可靠接纳和增量同步；第 5.5 节归并近期消息／界面调整，第 12.6 节记录性能修复及测量局限，第 12.7 节为待实施的收起历史、新对话、历史管理与分页渲染。
- [Bot 协作与通信首批实施记录（2026-11-17）](bot-collaboration-implementation-2026-11-17.md)：原地确认/补充、双方记录、持久发送、只读消息和增量保存；81项检查、六项隔离Electron流程及合成性能测量。Pi原生steer与完整恢复/性能矩阵尚未验完，闲置缓存暂不启用。
- [通用个人 Bot 工作台架构方案](bot-workbench-architecture.md)：2026-11-18 同步持续双方消息、原地确认、独立草稿、只影响对话卡片的子视图，以及显示历史／模型上下文／主对话切换三层约束；各产品独立实施与验收。
- [OnO 实施与验证记录（2026-11-16，历史阶段）](bot-implementation-validation-2026-11-16.md)：M0–M5、独立 Host、迁移/回退、真实模型和 Windows 托管实测及环境限制；当时的 CMO 未开发边界不代表当前状态。
- [OnO 接入方案与 CMO 复用映射（2026-11-18 更新）](bot-architecture-proposal-2026-11-13.md)：OnO 当前八 Bot，命理／阅读独立、签到归总台及设置；原迁移记录保留，后续共用行为统一引用完整方案。
- [CMO Bot 工作台架构优化与实施方案（2026-11-18 更新）](../../../design/cmo-bot-workbench-implementation-2026-11-15.md)：校正已迁移核心与 v7／数据库 6，保留六领域、企业业务边界和独立证据；M9 列出语音居中、长历史分页、收起历史、新对话与历史管理，原生运行控制／缓存／动态 Bot 继续独立列项。本轮仅更新文档。
- [CMO Bot 核心实施记录（2026-11-18，CMO 仓库）](C:/Myself/vibe_coding/cmo_workbench/docs/requirements/shared/ai-assistant/bot-workbench-implementation-2026-11-18.md)：当前实现、82 项 Bot 检查、14 项隔离 Electron 流程及剩余限制；全量测试仍有既有失败，不以 OnO 证据代替。
- [双方持续对话整窗高保真 v4（已确认）](../../../../design/bot-collaboration-ui-2026-11-17/README.md)：左侧原对话区只读查看，右侧工作区位置和宽度保持，无第三列／对象切换条；返回继续原主对话。对应核心布局已在隔离Electron验证，图内数据仍为示例。
- [Bot 双模式高保真外观修订（2026-11-16 更新）](design/bot-visual-revision-2026-11-15.md)：v3 内容、经典 v2 双长胶囊及悬浮 v1；业务标题卡、状态覆盖与图稿交接清单。
- [Bot 六个主要状态稿（2026-11-16，已确认）](design/bot-state-review-2026-11-16.md)：名片展开、资料编辑、交付件列表、悬浮输入框收起／展开及灵动岛总 Bot 对话的设计基线；实际运行证据另见实施记录和根目录 design-qa.md。
- [Bot 头像系统（2026-11-16，已落地）](design/bot-avatar-system-2026-11-16.md)：头像与颜色分开选；角色（竖眼，默认）与图形（固定浅底）在编辑弹窗切换；默认搭配、旧值迁移与几何数据。头像缓存及后续性能修复见完整方案，保留原悬停外框。
- [spec.md](spec.md)
- [preview-qa-2026-09-28.md](preview-qa-2026-09-28.md)
- [供应商页内配置与验收（2026-11-05）](qa-inline-provider-2026-11-05.md)
- [双栏直编修订稿](design/provider-inline-approved-2026-11-05.png)
- [首次配置引导与验收（2026-11-05）](qa-setup-hint-2026-11-05.md)
- [顶栏配置气泡确认稿](design/ai-setup-hint-approved-2026-11-05.png)

## 原型与依赖

- [assistant-workspace.html](prototype/assistant-workspace.html)
- [assistant-workspace.css](prototype/assistant-workspace.css)
- [assistant-workspace.js](prototype/assistant-workspace.js)
- [assistant-icons.js](prototype/assistant-icons.js)

## 验收证据

- [68-ai-model-long-ellipsis-1280.png](evidence/68-ai-model-long-ellipsis-1280.png)（保留原有提交范围）
- [68-ai-model-menu-open-1280.png](evidence/68-ai-model-menu-open-1280.png)（保留原有提交范围）
- [assistant-bazi-cool.jpg](evidence/assistant-bazi-cool.jpg)（仅本机，Git 忽略）
- [assistant-blog-mist.jpg](evidence/assistant-blog-mist.jpg)（仅本机，Git 忽略）
- [assistant-home-warm.jpg](evidence/assistant-home-warm.jpg)（仅本机，Git 忽略）
- [assistant-layout-checks.json](evidence/assistant-layout-checks.json)（仅本机，Git 忽略）
- [assistant-narrow-overlay.jpg](evidence/assistant-narrow-overlay.jpg)（仅本机，Git 忽略）
- [assistant-project-audit.json](evidence/assistant-project-audit.json)（仅本机，Git 忽略）

## 仓库外资料位置

原始测试证据和业务来源保持原位置，不重复拷贝整套临时数据；以下记录实测存在性，远端链接未联网重验。

| 地址 | 当前状态 |
|---|---|
| [远端资料](https://fluent2.microsoft.design/components/web/react/core/drawer/usage) | 远端引用，未联网复验 |

验收截图、测量和报告统一存放在 evidence/；本机资料继续由 Git 忽略，原有验收图的提交范围通过显式规则保留。设计稿保留在 design/，临时调试输出放 test-results/。
