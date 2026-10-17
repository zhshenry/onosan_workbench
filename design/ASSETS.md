# 设计资料入口

2026-10-17：设计资料按工作台和需求归入 docs/requirements，与方案正文同目录。

- [逐项文档、原型、图片及原路径映射](../docs/RESOURCE-INDEX.md)
- [按工作台查找需求](../docs/requirements/README.md)
- [设计演进原文](README.md)
- [验收历史入口](../design-qa.md)

19 张参考 PNG、47 张有用途的历史截图及配套测量/QA 均已迁入所属需求。原 docs/acceptance 的 19 张图中，一张经完整哈希及目视复核为同组重复，两个需求条目共用保留图，其余 18 张保持原字节。两个固定 CI HTML 保留在 design/mockups/，其他 14 个 HTML 及依赖随需求归类。

验收截图及测量统一归入所属需求的 evidence/；本机设计 PNG 和原本机证据继续由 Git 忽略，原有验收图通过显式规则保留提交范围。当前整理没有把本机图片自动公开，也未复制外部测试 profile 或业务资料。完整迁移/恢复记录保存在仓库外 docs-reorganization-20261017 目录。

此前清理删除 93 张过程/调试/重复截图及 3 份旧 JSON，共 45,169,597 字节，属于更早一轮；详见[原清理报告](../docs/archive/audits/cleanup-2026-10-17.md)，不计入本次节省。
