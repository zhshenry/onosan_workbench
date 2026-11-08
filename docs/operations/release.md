# Windows 发布、安装与更新

Ono Workbench 的发布顺序为：**同步版本与 CHANGELOG → 测试、推送 main 和版本标签 → 构建一次 → 草稿上传 → 完整下载校验 → 下载包装机验收 → 正式发布 → 公开下载与真实跨版本更新验收**。安装验收和发布必须使用同一份构建产物。

## OnO 审批边界（规范草稿）

[OnO 工作流程](issue-workflow/README.md) 与 [发布 issue 模板](issue-workflow/templates/ONO-COMMENTS.md) 提议将方案、合入、发版设为三个独立关口。下列命令是已有发布操作参考，不构成执行授权；OnO 任务应通过独立 PR 合入，不能据此直接修改/推送 main。版本及 CHANGELOG 变更也须进入候选改动集合，待候选 SHA 的 main 验收及明确版本/SHA 发版批准后才创建/推送对应标签并发布。新增提交或集合变化使旧批准失效。该门禁尚待实现，本次不改变发布脚本、不合入、不发布。

## 固定发布步骤

1. 同步 `package.json`、`package-lock.json` 根版本与 `packages[""].version`，在 `CHANGELOG.md` 顶部按 Keep a Changelog 格式补齐 `## [版本] - 日期` 和变更条目。可用 `npm version 新版本 --no-git-tag-version` 更新两个版本文件。首版为 `0.1.0`，实际发布状态以 [GitHub Releases](https://github.com/zhshenry/onosan_workbench/releases) 为准。
2. 运行 `npm test`、`npm run verify`，并按 [提交清单](../archive/audits/repository-audit-2026-10-01.md) 选择源码、测试、脚本与规范文档，确认公开素材已经脱敏。将本次发行范围提交到 `main`，创建对应的 `v版本` 标签，推送 `main` 和**本次标签**。例如首版在所选文件已暂存后：

   ```powershell
   git commit -m "release: v0.1.0"
   git tag v0.1.0
   git push origin main v0.1.0
   ```

3. 在 Windows x64 上安装并登录 GitHub CLI（`gh auth login`），完整运行一次 `npm run dist:installer`。后续上传、重试和校验不再重新构建。使用以下独立阶段：

   ```text
   npm run release:upload
   npm run release:verify-draft
   # 用下载的同一安装包完成 Windows 装机验收后：
   npm run release:publish
   npm run release:verify
   ```

   发布前检查工作区已提交、分支为 `main`、本地及远端标签均指向当前提交；`--verify-tag` 要求 GitHub 上标签已存在。缺失产物、版本漂移、错误文件名/大小/SHA512、SHA256 不匹配，以及缺失或空的 CHANGELOG 条目均会阻止发布。发布说明从当前版本条目生成。
4. 创建/恢复草稿时从有权限的发行版列表取得数字 ID，后续查询和发布使用该 ID；不通过仅支持已发布版本的 `releases/tags/{tag}` 查询草稿。脚本要求恰好五个预期资产，完整下载每个文件，逐个计算 SHA256，与 GitHub digest 及本地构建比较，再核对安装器 SHA512、大小、版本和 `SHA256SUMS.txt`。草稿和公开下载分别保存在 `release/downloads/v版本-draft` 与 `v版本-published`，结果写入各目录的 `verification.json`。失败后重跑对应阶段；已下载文件只有重新计算哈希通过才复用，已发布资产不会重新上传或覆盖。

5. 真实跨版本更新由 GitHub 托管的全新 Windows runner 验收：安装指定旧版本，经 UI 创建合成待办并保存设置，通过正常更新入口读取公开 GitHub 更新源、下载、点击“重启并安装”，完成原有 NSIS 向导，观察自动重启，再启动更新后的程序检查版本、任务 ID 和设置保留。下载缓存内的安装器必须与已完整下载校验的公开安装器具有相同 SHA256。普通 `WORKBENCH_TEST_DATA_DIR` 测试模式会禁用自动更新，不能代替此项；升级脚本拒绝在开发者机器运行。

## 云端发布与补验

在 `Windows cloud acceptance pilot` 的手动运行入口选择：

- `acceptance`：原有全新安装和同版本持久化验收；PR/main push 仍只运行这一项。
- `publish`：指定 `release_tag` 和更早的 `upgrade_from`；从版本标签构建一次，分步上传/下载校验草稿，安装下载包并通过 UI 验收后按 ID 正式发布，再在独立 Windows job 完成公开文件和真实升级验收。标签需指向远端 main；只用于包含本流程的新候选版本。
- `verify`：对已公开版本只读补验，不重建或修改 Release。指定 `release_tag=v2.1.2`、`upgrade_from=v2.1.1` 即可独立补验现有版本。文件下载和升级测试为独立步骤，失败可重跑，不产生新的版本分支或发行版。

仅在完整下载和跨版本更新均通过后，才报告“发布验收完成”。云端保留有大小限制的合成截图和 JSON 报告三天，不上传安装器、缓存或真实用户数据。

## 预发布（Pre-release）

明确要求预发布时，包版本和标签仍使用指定版本（例如 `1.2.1` / `v1.2.1`），同步版本与 CHANGELOG、测试、提交、推送 main 和本次标签，然后执行：

```powershell
npm run dist:installer
npm run release:check -- --prerelease
node tooling/publish.mjs --prerelease
npm run release:verify -- --prerelease
```

预发布沿用同一次构建的五项资产，先建草稿再按 ID 发布，并明确设置 `prerelease=true`、`make_latest=false`，不会替换已有正式 Latest。校验同时要求远端为对应的 Pre-release 且非 Draft；正式版校验继续拒绝预发布。测试者手动下载安装包或完整便携 ZIP；正式安装版默认不接收预发布，因此正常公开源升级验收只用于正式通道。

## 本地命令与五项发布资产

`npm ci` 安装开发依赖。打包命令使用 `--publish never`；实际上传只发生在发布脚本的上传阶段。

| 命令 | 行为 |
|---|---|
| `npm run dist:installer` / `npm run dist:all` | 完整验证并生成安装包与便携 ZIP，同时生成元数据及校验清单；仅本地构建 |
| `npm run dist:portable` / `npm run dist:win` | 验证并生成完整便携 ZIP，更新本地 SHA256 清单；单独执行不能代替完整发行构建 |
| `npm run release:check` | 只读检查本地五项资产及 CHANGELOG，显示待执行的发布命令和说明；不要求工作区已提交，不联网或上传 |
| `npm run release` | 使用已有构建，上传/恢复草稿、完整下载校验后正式发布，再校验公开下载；不重新构建，不代替云端装机/升级验收 |
| `npm run release:upload` / `release:verify-draft` / `release:publish` | 独立执行草稿上传、完整下载校验及正式发布，可从失败阶段继续 |
| `npm run release:verify` | 只读完整下载并校验当前版本的五个公开文件；追加 `-- --remote-only` 可不依赖本地构建，云端通过 `WORKBENCH_RELEASE_TAG` 指定历史版本 |

以 `0.1.0` 为例，每次 Release 必须同时包含以下五项；构建结束后不额外保留约 729 MiB 的展开程序目录。

| 本地文件 | GitHub 资产名 |
|---|---|
| `release/installer/Ono-Workbench-Setup-0.1.0-x64.exe` | `Ono-Workbench-Setup-0.1.0-x64.exe` |
| `release/installer/Ono-Workbench-Setup-0.1.0-x64.exe.blockmap` | `Ono-Workbench-Setup-0.1.0-x64.exe.blockmap` |
| `release/metadata/latest.yml` | `latest.yml` |
| `release/portable/Ono-Workbench-0.1.0-Windows-x64-Portable.zip` | `Ono-Workbench-0.1.0-Windows-x64-Portable.zip` |
| `release/SHA256SUMS.txt` | `SHA256SUMS.txt` |

文件名统一使用连字符，保持本地名称、`latest.yml` 和 GitHub 资产名相同。通过完整重建修复元数据；保留生成的资产名称，五项资产来自同一次发行构建。打包脚本将旧版本安装器和便携 ZIP 移到 `release/archive/版本/`，发布时只选当前版本。确认历史资产已在 GitHub 留存后可另行清理本地归档。`release/` 全部由 Git 忽略。

## 更新与数据边界

安装版从 GitHub Releases 检查更新，启动 30 秒后检查，此后每 4 小时检查；也可在“设置 → 关于”手动检查。后台下载后须主动点击“重启并安装”，普通退出不会安装更新。首次正式 Release 发布前，更新检查可能提示没有可用版本。开发和自动化测试模式不访问更新源。

便携包沿用 To-Do-List 约定，打包时去掉 `resources/app-update.yml`，不启用自动更新；更新时下载完整 ZIP、退出应用后解压替换。包内 `README.txt` 说明启动、更新和数据位置。

发布源须允许使用者读取安装器和元数据。发布凭据只放在本机 GitHub CLI 登录存储或 CI 环境变量中，不写入源码和安装包。当前未配置代码签名；Windows 可能显示未知发布者提示。

安装包仅包含运行产物、更新器、Office 转换运行时和必要 PDF 资源，不包含开发依赖、设计记录、测试、个人配置或数据库。运行文件放在普通目录中，不使用 ASAR：Office 转换库需要按真实磁盘路径启动原生程序和 worker；NSIS 仍会压缩整个安装包。

项目终端使用锁定 `node-pty` 随包提供的 Windows x64 Node-API 原生模块，`build.npmRebuild=false` 保留这些产物，避免构建器强制改用本机 C++ 编译。发行验收须在锁定 Electron 与实际便携载荷中启动 PowerShell、核对中文输出；以后增加其他原生依赖时需重新核对其 ABI 和重建要求。

升级保留 `%APPDATA%/OnoWorkbench` 的设置、密钥配置、对话、命例和草稿；待办仍使用 `%APPDATA%/To-Do-List/tasks.db`。卸载不删除应用数据。`WORKBENCH_TEST_DATA_DIR` 仅供自动化验收隔离这两处数据，设置后禁用联网更新及开机自启注册。
