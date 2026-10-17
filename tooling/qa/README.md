# 历史验收脚本

2026-10-17 从被 Git 忽略的 test-results/ 逐字迁移，避免清理运行产物时丢失脚本。四个 .mjs 的 SHA256 已与原文件逐一核对；本次不修改验收逻辑，也不自动执行这些脚本。

另有三个旧截图脚本已退出 tooling/ 根目录，原始字节作为 .mjs.txt 保存在 [旧截图工具归档](archive/legacy-screenshots/README.md)。它们保留的是历史源码，不能按原注释直接执行；旧选择器、固定端口和共享待办库隔离问题见归档说明。

| 当前位置 | 原位置 |
|---|---|
| browser-menu-width/check.mjs | test-results/browser-menu-width/check.mjs |
| release-v1.0.0/portable-qa.mjs | test-results/release-v1.0.0/portable-qa.mjs |
| release-v1.0.0/verify-remote.mjs | test-results/release-v1.0.0/verify-remote.mjs |
| typography-visual-check.mjs | test-results/typography-visual-check.mjs |

从仓库根目录运行。这些是保留的历史验收入口，并不自动适配后续版本：便携验收脚本仍要求 test-results/release-v1.0.0/portable/ 中有指定版本；排版脚本仍保留原有本机路径及对 To-Do-List 的 Playwright 路径依赖。再次复用前先检查其路径、端口和数据隔离设置。

现有截图与报告仍留在原来的 test-results/ 目录，本次只清理测试运行生成的隔离 profile/data 和合成游戏夹。正式设计稿、参考图、docs/requirements/ 下的 evidence/ 验收证据不在清理范围内。
