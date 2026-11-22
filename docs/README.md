# 文档入口

先按工作来源找入口。本地开发的产品需求从 `requirements/` 进入，走 GitHub 自动化流程的工单从 `issues/` 进入。目录内的 README 负责本目录的写法、放置规则或查询入口。

| 分类 | 入口 | 内容 |
|---|---|---|
| 规范 | [standards/](standards/README.md) | 产品、视觉、交互与共享数据的唯一规范入口 |
| 本地需求 | [双仓本地需求总表](requirements/README.md) | 需求编号、命名与放置规范、业务正文、各仓进度及任务 |
| GitHub 工单 | [issues/](issues/README.md) | 自动化工单清单、实时查询及本地验收账本入口 |
| 专题设计 | [design/](design/) | 已有跨功能设计和实施资料，按各需求正文的链接定位 |
| 流程与操作 | [operations/](operations/README.md) | 发布、CI、Issue 协作、模板与接受门 |
| 历史记录 | [archive/](archive/README.md) | 交接、审计和已退役试点 |
| 资料逐项映射 | [RESOURCE-INDEX.md](RESOURCE-INDEX.md) | 文档—原型—设计图—截图—原位置及保存方式 |
| 验收历史入口 | [design-qa](../design-qa.md) | 原验收标题保留，完整正文已归入对应需求 |

全局 PRODUCT / DESIGN / UX-CONTRACT 保持仓库根目录的唯一正文。两个固定 CI 原型、历史附件记录、便携版说明和 JEV 默认账本因真实调用保留原路径；从分类目录可直接找到，详见资源索引的例外表。

验收资料统一放入所属需求的 evidence/。本机设计图与证据延续 Git 排除规则；原有 18 张验收图通过显式例外保留提交范围。外部测试证据、Obsidian 库、游戏源码及用户数据保持原位置。

本轮迁移、清理判断与验证见 [整理报告](archive/audits/document-cleanup-2026-10-17.md)。
