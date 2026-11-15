# 本地分支与工作树整理记录

日期：2026-11-15。整理基线：`ae67acc`（v2.2.0）。范围为本机分支、已注册工作树、未提交文件和历史 stash；没有推送远程或发布安装包。

## 整理结果

本地仅保留 `main`，唯一注册工作树为 `C:\Myself\vibe_coding\onosan_workbench`。外观功能已提交为 `5878d36`（`feat: add configurable workbench appearance`）。在这个目录完整重启 `npm run dev`，通过「设置 → 通用与外观」切换导航、玻璃、主题与窗影时段。

| 整理对象 | 核对结果 | 处理 |
| --- | --- | --- |
| `codex/ono-appearance-system` / `.tmp/ono-appearance-system` | 分支头与原 main 相同；23 个未提交文件中 22 个与主目录逐字节一致，实施记录在主目录有更新 | 采用主目录的新实施记录；全部外观源码、素材、测试与记录提交 main；验收资料保留后移除工作树与分支 |
| `codex/browser-automation` | `814e172` 已为 main 的祖先；main 领先 69 个提交，该分支独有提交为 0 | 删除已合并的本地分支 |
| 旧 `codex-cli-install-fix/source` 工作树 | detached HEAD 为 `ec63ece`，main 领先 21 个提交；没有未提交或未跟踪文件 | 历史构建、安装包、便携包另存；移除该工作树，其父目录未删除 |
| 主目录的设计资料 | 两套可切换 HTML 原型、背景素材、已选高保真与既有页面视觉参考尚未入库 | 纳入 main，保留原文件内容与日期，供后续设计追溯 |
| 主目录的方案与验收文档 | 外观通用方案、CMO 实施方案、命理参考、Bot 架构与视觉修订、TRAE 登录验收记录尚未入库 | 纳入 main；Bot 文档仍是未实施方案，不代表本次新增了 Bot 运行能力 |
| `.tmp/`、两套原型的批量截图目录 | 本地 QA 脚本、缓存及重复生成截图 | 在原处保留，补充精确忽略规则；未作为产品代码提交 |
| `origin/ono-pipeline-state` | 相对共同祖先的独有文件只有 `state.json`，属于历史自动化协调状态 | 不合并至产品源码，远程分支与跟踪引用保持原样 |

原有 `docs/requirements/**/design/*.png` 和私有验收证据的忽略规则保持不变。这些既有本地图片仍在原处；新增入库的 Bot 文档可能引用它们，其他机器使用时需另行携带对应图片。外观方案的两张确认图与两套 HTML 原型则随 main 一起保存。

## 历史 stash 的取舍

逐项比较了 8 份 stash 的跟踪文件、第三父提交中的未跟踪文件和 main 历史。能够匹配的版本已在 main 历史中；其余差异进一步比较了当前实现和后续文档，没有发现需要把旧快照重新套回 main 的业务功能。

| stash（整理时编号） | 剩余差异及结论 |
| --- | --- |
| 0 / `e667af1` | 个人网站紧凑布局已被吸收，间距、预览比例及容器表面在后续版本继续调整；采用当前页面 |
| 1 / `13b7f27` | 离线语音依赖、收起图标及游戏问题面板样式均已存在；语音 QA 的“验证中”草稿已被正式验收记录取代 |
| 2 / `74eed4a`、3 / `fd946da` | AI 过程反馈已存在，当前另有滚动定位参数；版本记录已有后续发布历史。两份快照的基线不同，不是丢失验收门禁实现 |
| 4 / `19ab549` | 浮窗会话定向取消、浏览器授权样式、测试桩与断言均已存在；旧类型断言和交互文案由当前实现替代 |
| 5 / `9ecdb95`、6 / `fd1ead3` | AI Escape 处理、浏览器记录入口、阅读导入规则已存在；授权入口后来完善为固定授权卡 |
| 7 / `5195924` | 多标签 guest 参数及浏览器测试入口已存在；QA 已迁入 `docs/requirements/web/browser-automation/qa-2026-10-15.md`，pilot 已适配后续控件与授权流程 |

8 份 stash 全部保留在活动仓库，并纳入完整备份；未执行 pop、apply 或 clear。stash 是恢复记录，不是仍在使用的本地分支。

## 备份与恢复

本机备份位置：`artifacts/main-consolidation-2026-11-15/`（Git 忽略目录）。

- `before-consolidation.bundle` 已通过 `git bundle verify`，包含完整历史及全部 8 份 stash 的可恢复引用。
- `file-backup-manifest.json` 记录 843 个文件的源路径、备份路径与 SHA-256；内容约 1001.7 MiB，另有约 150.7 MiB 的 Git bundle。
- UI 与旧 CLI 工作树中即将移除的 693 个备份文件再次逐文件核对通过。两个 node_modules 都是指向主目录的 junction，先验证目标并仅移除链接，再删除工作树；主目录依赖保留。
- 两份 vendor/speech 的 24 个文件与主目录逐文件一致，采用主目录副本。
- UI 完整测试资料在 `appearance-test-results/`，23 个常用验收文件另复制到主目录 `test-results/appearance/`；旧 CLI 安装包与便携包在 `legacy-cli-generated/release/`。

具体恢复说明见备份目录的 `README.md`。临时备份引用只保留在 bundle 中，已从活动仓库移除。

## 验证及限制

- 主目录外观源码与已经验收的 UI 工作树一致；同步后的 `npm run verify`（字阶、TypeScript、Vite、Electron）和 10 项外观/设置回归通过，日志位于 `test-results/appearance-sync/`。本轮整理没有再次改动运行时代码。
- 已保留的 Electron 验收记录为 9 组通过、40 种外观组合、17 张截图、0 渲染错误，详见 [外观实施与验收记录](design/appearance-system-implementation-2026-11-15.md)。
- 原全量测试为 1096 项中 1094 项通过，2 项因 Windows 文件符号链接权限报 `EPERM`；本轮没有将它们改写为通过，也没有重复全量运行。
- 新纳入的 6 个原型 JavaScript 文件语法检查通过；提交前执行 `git diff --cached --check`。目录清理后复核 Git 工作树、分支与主目录依赖。
- `origin/main` 和自动化状态远程引用未修改；没有生成或发布新安装包。
