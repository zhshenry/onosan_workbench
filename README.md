# Ono Workbench

Windows 个人工作台，使用 Electron、React 和 TypeScript。包含待办/日程、博客编辑与发布准备、内置浏览器、游戏运行与测试工作区、命理和阅读清单。功能范围见 [PRODUCT.md](PRODUCT.md)，版本以 [package.json](package.json) 为准。

## 本地开发

AI 测试入口位于「AI 测试工作台 → 对比测试」。先在 AI 设置中配置并启用模型；可保存同一套提示词、材料与校验，分别比较模型直出和 Agent 执行。当前支持网页 / 浏览器 JavaScript 运行，其他代码保留供查看与导出，详见 [使用及边界](docs/requirements/ai-test/workbench/README.md)。

```powershell
npm ci
npm run dev
```

```powershell
npm test           # 单元、组件与契约测试
npm run verify    # 字阶检查、类型检查与生产构建
npm start         # 启动已构建产物；首次先执行 npm run build
```

Windows 本机可能因缺少创建文件符号链接的权限而使两项安全回归测试报 `EPERM`；保留失败记录，不能据此宣称全套通过。开发验收入口与限制见 [文档索引](docs/README.md)。

`#dev/browser` 与 `#dev/office` 仅在 `npm run dev` 或显式执行 `npm run build:diagnostics` 后可用，调试页按需加载。常规 `build`、`verify` 和发布构建排除这些入口及其专用前端资源；Office 转换内核保留。诊断后执行 `npm run build` 恢复正式构建。

## 目录与维护归属

| 目录 | 用途 |
|---|---|
| `src/` | 应用外壳、导航、跨模块视图；公共控件位于 `src/ui/controls.tsx` |
| `modules/` | 待办、浏览器、博客、命理、阅读、Office、素材采集等领域实现 |
| `electron/` | 主进程、IPC、存储、浏览器与游戏宿主、更新及窗口管理 |
| `shared/` | 主进程与界面共用的契约、校验和纯函数 |
| `tests/` | 回归测试；不是运行产物 |
| `tooling/` | 构建、发布与验收脚本；`tooling/qa/` 是有路径限制的历史脚本 |
| `docs/` | 按规范、需求、流程、历史分层；需求按工作台归类，方案与原型、图片放在一起 |
| `design/` | 设计演进入口与两个固定 CI 原型；其他资料已按需求迁移，见 [资料索引](docs/RESOURCE-INDEX.md) |

共享控件由工作台维护，待办的 `modules/todo/ui/ui.tsx` 保留为上游映射兼容入口。浏览器按 `workspace-pane → pane → automation` 分层，恢复宿主不再与工具栏相互运行时导入。源码审查与设计差距记录见 [本轮清理报告](docs/archive/audits/cleanup-2026-10-17.md)。

## 规范与数据

- [DESIGN.md](DESIGN.md)：视觉意图、组件归属与主题规则；运行时 token 由 `src/shell.css` 维护。
- [UX-CONTRACT.md](UX-CONTRACT.md)：导航、输入、弹层、保存、权限等可观察行为。
- [design-qa.md](design-qa.md)：按日期记录验收结果，历史条目不能代替当前验收。
- [待办同步台账](modules/todo/SYNC.md)：与 To-Do-List 的移植映射和共享数据库边界。

正式运行会读写 `%APPDATA%/To-Do-List/tasks.db`；Ono 设置和对话等存于 `%APPDATA%/OnoWorkbench`。自动化验收须设置 `WORKBENCH_TEST_DATA_DIR` 隔离两处数据，仅设置 `WORKBENCH_ISOLATED=1` 仍会共享真实待办库。不要提交个人数据库、模型密钥配置、登录分区或本机截图。

## 发布

与 To-Do-List 保持同一发布流程，通过 `gh release` 发布，安装版使用 GitHub Releases 自动更新。便携版下载完整 ZIP 手动替换。版本、授权、五项资产及核验步骤统一见 [RELEASE.md](docs/operations/release.md)；日常代码整理不自动触发提交、推送、打包或发布。
