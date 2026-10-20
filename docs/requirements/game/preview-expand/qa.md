# 窗口内展开 · 顶部细栏 · 2026-10-20

范围：将当前游戏展开到工作台主体，保留全局顶栏和一级图标栏；复用真实网页及现有截图、缩放和终端能力。

## 视觉对照

- Source visual truth：[用户选定的顶部细栏稿](design/game-preview-expand-approved.png)，1630×965。
- Implementation screenshot：[实际本地游戏展开](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-preview-expand-2026-10-20/expanded-local.png)，1630×965；原生 Electron 客户区同尺寸，DPR=1，宿主和该截图中游戏缩放均为 100%。
- Full-view comparison：[并排整页对照](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-preview-expand-2026-10-20/comparison-full.png)，3260×997，包含 32px 标签区，两张原图不缩放。
- Focused comparison：[细栏上下对照](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-preview-expand-2026-10-20/comparison-bar.png)。原图细栏裁取 1528×61、实机裁取 1540×59，均保留原像素；两行及标签合成 1540×168。已打开合并整页图和合并细栏图判断，没有仅凭两次分开看图给出结论。

对照状态：本地开发、窗口内展开、雨夜游戏主题、N1 实际现场，背景说明已关闭。实机使用当前游戏副本，地图、笔记和按钮由现有游戏代码响应可用尺寸；不把生成稿中的人物位置、收集进度或旧版笔记强行写进游戏。全局栏保留当前应用的真实日期、空待办和原有尺寸，未按生成稿伪造 0/2 示例数据。

| 必查维度 | 最终结果 |
|---|---|
| 字体与字阶 | 项目名使用 `--type-lead` 18px，模式与环境使用 `--type-control` 13px，操作使用 `--type-body` 14px。保留现有中文字体栈，标题/次要文字层级明确；1024px 客户区下按钮完整可读。 |
| 布局与间距 | 细栏约 58px，图 48×36，约 34px 行动按钮；左侧身份、居中模式提示和右侧操作。二级目录的 240px 网格占位随展开归零，游戏铺到一级图标栏右侧的正文边界；没有全屏到显示器。还原恢复原布局。 |
| 颜色与 token | 复用 `--glass-surface`、`--glass-line`、`--hairline`、`--shadow` 和共享文字色。环境由文字区分，本地用青绿、线上用雾蓝；三个应用主题均验证。 |
| 图像与图标 | 复用 `trail-office.png` 与 Phosphor 的 CornersOut/CornersIn、Camera、ArrowClockwise；游戏来自同一真实 webview。没有用整张生成图、占位画面或手绘 SVG 替代运行界面。 |
| 文案与内容 | 项目名、当前环境、窗口内展开、刷新、截图记录、还原布局与选定稿一致。截图复用本机保存，未把截图按钮解释为自动提交问题；线上测试使用独立回环站点，未声称生产域名已验收。 |

## 对照迭代

1. **[P1，已修复] 二级目录隐藏后仍留 240px 空白。** [首轮实机](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-preview-expand-2026-10-20/iteration-1-gap.png)显示游戏未抵达主体左侧边界。除隐藏目录外，将同一正文 grid 的目录列设为 0；第二轮实机和主体边界断言通过。
2. **[P2，已修复] 细栏身份区字体、缩略图偏小。** [第二轮细栏对照](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-preview-expand-2026-10-20/iteration-2-comparison-bar.png)显示 14px 项目名、40×30 图片的层级偏弱；改为已有 18px 标题字阶、48×36 图、13px 环境文字及紧凑 34px 操作。最终重新构建、重跑同一交互流程并重新捕获两份对照图。
3. **最终复核：** 无待处理 P0/P1/P2。P3/预期差异为生成稿的细微字形、玻璃光泽和示例进度；实际内容沿用当前应用和游戏。

## 实机与交互

Browser 插件未列出；沿用项目已有 Playwright Electron 库进行原生应用/webview 验收。使用独立 Ono 数据目录、独立 PowerShell APPDATA 和游戏副本；原游戏 `scene.html` 前后 SHA-256 一致。没有访问真实应用数据或玩家存档。

主流程：启动本地 → 进入 N1 → 设置桌面视口、110% 缩放、检查宽度并打开真实 PowerShell → 窗口内展开 → 截图 → 还原 → 切工作台 → 线上独立展开 → 多主题/尺寸验证。

| 检查 | 证据与结果 |
|---|---|
| 页面身份、有效画面和错误覆盖层 | 原生工作台与真实 N1 地图/笔记正常呈现，非空壳，无框架错误遮罩。 |
| 外壳边界 | 展开前后一级栏和全局顶栏 bounding box 完全一致；二级目录、项目、测试、终端与预览工具栏不可见；BrowserWindow 未进入全屏。 |
| 同一页面及缩放 | 展开/还原前后 webContents ID、仅存于内存的随机 token、110% 原生缩放相同；并非仅靠 localStorage 恢复页面。 |
| 布局与终端还原 | 原桌面 1440×1000 选项与检查宽度恢复，终端恢复可见；同一 PowerShell session ID 和已赋值变量继续可用。这里只验证会话保留，不替代完整终端键盘验收。 |
| 截图与主动刷新 | 截图数增长并读取真实 PNG；截图不重载页面。明确点击刷新后内存 token 才消失，保留试玩档中的存储证明仍在。 |
| 切换工作台 | 切走显示正常首页；返回保持展开状态、同一页面与内存 token。 |
| 线上隔离 | 独立站点与 webContents、独立存储；退出恢复线上原 390×844 选项。本地停止后线上展开仍可操作。 |
| 响应式与可访问性 | 1630×965 主对照；1280×820、1024×680 下三主题均保持还原按钮在客户区内，细栏无横向溢出。展开聚焦还原，还原聚焦展开入口；减少动态效果与强制颜色下入口可用。 |
| 控制台 | 宿主 `pageerror` 和 `console error` 均为空。 |

7 组 Electron 交互验收通过，完整断言及截图清单见 [report.json](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-preview-expand-2026-10-20/report.json)。[线上实机](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-preview-expand-2026-10-20/expanded-online.png) · [1024px 暖砂主题](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-preview-expand-2026-10-20/expanded-warm-1024.png) · [还原后](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-preview-expand-2026-10-20/normal-restored.png)。

验证命令：`npm run check:typography`、`npm run typecheck`、`npm run build`；游戏工作台、试玩重置、终端、问题保存、GuestFrame 和顶栏布局共 37 项回归通过。最初构建/测试子进程遇到沙箱 `spawn EPERM`，允许本地构建与隔离验收后重试通过。

边界：以上源码验收未重跑三个案件的完整通关；线上使用独立回环测试站点，未验证生产域名的网络/嵌入策略。

## v1.2.2 发行构建复验

完整 `dist:installer` 验证、NSIS 安装器和便携 ZIP 构建、本地五项资产及更新元数据校验通过。从该 ZIP 中解压并启动的程序确认 `app.isPackaged=true`、版本为 `1.2.2`，打包目录的 `dist` 与 `dist-electron` 逐文件 SHA-256 与本次构建一致；便携包不包含自动更新源，原生终端/识别模块与模型、词表、VAD 资源完整。

该实际程序以独立数据和游戏副本重新完成上述流程，并额外核验包内资源和离线中文识别，共 9 组通过；完整报告在本机 `test-results/release-v1.2.2/report.json`，截图在同目录。全量测试 769 项中 767 项通过，另 2 项因 Windows 创建文件符号链接返回 `EPERM` 失败，与 v1.2.1 同样；对应测试源码未修改。没有把这两项计为通过，也未进行跨版本自动安装升级验收。

实施清单：已接入展开入口和顶部细栏；已保留 guest、原尺寸及面板状态；已修复两轮对照问题并重验；无剩余阻塞项。

final result: passed
