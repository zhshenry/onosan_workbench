# Windows 发布、安装与更新

Ono Workbench 与 To-Do-List 采用相同发布顺序：**同步版本与 CHANGELOG → 测试、提交及推送 main 和版本标签 → `npm run release` → 核验正式 Release 与下载资产**。统一通过 GitHub CLI 的 `gh release` 发布到 `zhshenry/onosan_workbench`。

## 固定发布步骤

1. 同步 `package.json`、`package-lock.json` 根版本与 `packages[""].version`，在 `CHANGELOG.md` 顶部按 Keep a Changelog 格式补齐 `## [版本] - 日期` 和变更条目。可用 `npm version 新版本 --no-git-tag-version` 更新两个版本文件。首版为 `0.1.0`，实际发布状态以 [GitHub Releases](https://github.com/zhshenry/onosan_workbench/releases) 为准。
2. 运行 `npm test`、`npm run verify`，并按 [提交清单](REPOSITORY-AUDIT.md) 选择源码、测试、脚本与规范文档，确认公开素材已经脱敏。将本次发行范围提交到 `main`，创建对应的 `v版本` 标签，推送 `main` 和**本次标签**。例如首版在所选文件已暂存后：

   ```powershell
   git commit -m "release: v0.1.0"
   git tag v0.1.0
   git push origin main v0.1.0
   ```

3. 在 Windows x64 上安装并登录 GitHub CLI（`gh auth login`），运行 `npm run release`。它先完整验证和打包，再用以下形式创建 Release：

   ```text
   gh release create v版本 --repo zhshenry/onosan_workbench --verify-tag --latest <五项资产> --title "Ono Workbench 版本" --notes-file release/metadata/release-notes.md
   ```

   发布前检查工作区已提交、分支为 `main`、本地及远端标签均指向当前提交；`--verify-tag` 要求 GitHub 上标签已存在。缺失产物、版本漂移、错误文件名/大小/SHA512、SHA256 不匹配，以及缺失或空的 CHANGELOG 条目均会阻止发布。发布说明从当前版本条目生成。
4. 脚本通过 `gh release view/download` 核验对应 Release 为正式版本（非 Draft、非 Pre-release）、五项资产名称和大小与本地一致，以及下载的 `latest.yml` 与本地完全一致；公开下载地址使用 Windows 自带的 `curl.exe` 检查 HTTP 200。若上传成功但联网核验失败，运行 `npm run release:verify` 重试只读核验；先核对已有 Release，再决定是否重新发布。

## 本地命令与五项发布资产

`npm ci` 安装开发依赖。打包命令使用 `--publish never`；实际上传只发生在发布脚本调用 `gh release create` 时。

| 命令 | 行为 |
|---|---|
| `npm run dist:installer` / `npm run dist:all` | 完整验证并生成安装包与便携 ZIP，同时生成元数据及校验清单；仅本地构建 |
| `npm run dist:portable` / `npm run dist:win` | 验证并生成完整便携 ZIP，更新本地 SHA256 清单；单独执行不能代替完整发行构建 |
| `npm run release:check` | 只读检查本地五项资产及 CHANGELOG，显示待执行的发布命令和说明；不要求工作区已提交，不联网或上传 |
| `npm run release` | 完整构建 → 发布前检查 → `gh release create` → 联网核验 |
| `npm run release:verify` | 只读核验当前版本在 GitHub 上的正式 Release 和下载资产 |

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

安装版从 GitHub Releases 检查更新，启动 30 秒后检查，此后每 4 小时检查；也可在“设置 → 关于”手动检查。后台下载后可点击“重启并安装”，退出应用时也会安装。首次正式 Release 发布前，更新检查可能提示没有可用版本。开发和自动化测试模式不访问更新源。

便携包沿用 To-Do-List 约定，打包时去掉 `resources/app-update.yml`，不启用自动更新；更新时下载完整 ZIP、退出应用后解压替换。包内 `README.txt` 说明启动、更新和数据位置。

发布源须允许使用者读取安装器和元数据。发布凭据只放在本机 GitHub CLI 登录存储或 CI 环境变量中，不写入源码和安装包。当前未配置代码签名；Windows 可能显示未知发布者提示。

安装包仅包含运行产物、更新器、Office 转换运行时和必要 PDF 资源，不包含开发依赖、设计记录、测试、个人配置或数据库。运行文件放在普通目录中，不使用 ASAR：Office 转换库需要按真实磁盘路径启动原生程序和 worker；NSIS 仍会压缩整个安装包。

升级保留 `%APPDATA%/OnoWorkbench` 的设置、密钥配置、对话、命例和草稿；待办仍使用 `%APPDATA%/To-Do-List/tasks.db`。卸载不删除应用数据。`WORKBENCH_TEST_DATA_DIR` 仅供自动化验收隔离这两处数据，设置后禁用联网更新及开机自启注册。
