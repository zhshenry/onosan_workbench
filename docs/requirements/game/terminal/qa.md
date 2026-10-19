## 终端工具栏 · 方案 3 · 2026-10-19

范围：调整既有终端的操作层级和解释文案；底部布局、PTY、输入、调高和展开动效继续沿用。

### 视觉对照

- source visual truth：[用户选定的工具栏方案 3](design/game-terminal-toolbar-option-3-2026-10-19.png)，1942×809。
- implementation screenshot：[原生终端局部](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-terminal-toolbar-20261019/terminal-toolbar-component.png)，950×340；原生 Electron 客户区 1280×1000、DPR=1、缩放 1，菜单展开在工具栏下方。
- [同图上下对照](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-terminal-toolbar-20261019/comparison.png)：源图裁取终端内容后等比缩至 950px；实机保持原像素。已打开此合并图逐项检查，没有把两次独立看图冒充对照。
- [实际游戏与新工具栏](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-terminal-toolbar-20261019/terminal-toolbar-final-open.png)；[收起菜单](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-terminal-toolbar-20261019/terminal-toolbar-final-closed.png)。

| 必查维度 | 结果 |
|---|---|
| 字体与字阶 | 工具栏、操作和辅助说明沿用现有字阶；终端保留真实等宽输出。主操作有明确文字，三项菜单说明完整可读。 |
| 布局与间距 | 标题、静态 PowerShell、连接状态靠左；停止、更多和收起靠右。菜单宽 320px，原生顶层浮出，不占布局高度；默认 240px 终端放不下时向上展开，340px 对照状态下向下展开。1024×680 全部操作仍可见，无宿主横向溢出。 |
| 颜色与 token | 外壳保留三主题，终端和菜单使用同一 `--game-terminal-*` 深色业务表面，连接指示使用 `--game-terminal-connected`；菜单退出项与普通项分隔，并以文字和图标表达后果。 |
| 图像与图标 | 使用已有 Phosphor 的 StopCircle、Copy、Trash、SignOut、CaretDown；没有以整张稿替代界面，也没有自绘图标。实际游戏来自游戏副本的真实网页。 |
| 文案与内容 | 复制优先选区、清空不停止命令、退出结束 PowerShell；收起的提示说明终端继续运行。源稿中 PowerShell 的无实际选项箭头按既有约束移除。示例输出由真实 `validate-game.cjs` 输出替代。 |

首次视觉对照未发现待修复 P0/P1/P2。P3/预期差异：生成稿的光泽、字形和终端标题图标底色没有单独重制，沿用应用既有材质和图标。实机工具栏保持紧凑高度。用于对照的终端由用户已有拖动功能调到 340px；产品初始高度仍为 240px。QA 会话临时将命令提示符改成真实当前目录的末级名称以便阅读，未改变 cwd、应用默认提示符或用户会话。

### 实机验证

Browser 插件不可用，使用既有 Playwright Electron 流程；独立 Ono 数据目录、PowerShell APPDATA 和游戏副本，不访问真实应用数据、不修改真实游戏或外部服务。

[交互报告与几何记录](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-terminal-toolbar-20261019/report.json)中 8 组通过：

1. 首次展开才启动真实 PowerShell；静态 shell 名称、真实已连接状态和三个常驻操作。
2. 同入口三次开关、菜单说明、无布局推移、Enter/Space/方向键/Home/End/Escape、外部点击和项目/预览菜单互斥。
3. 菜单复制取得真实终端输出；测试截获剪贴板写入，不覆盖用户剪贴板。
4. 「停止命令」终止实际前台 Node 进程，PowerShell PID 和变量保持，随后可继续键入命令。
5. 「清空输出」清除回放缓冲，前台 Node 和 shell 均继续运行；之后仍可停止并继续输入。
6. 收起面板、切换工作台均关闭菜单且保留同一会话，收起后焦点返回项目栏终端按钮。
7. 「退出终端」终止 shell 及前台子进程，退出项变为禁用；重新连接生成新会话并能实际执行命令。
8. mist/cool/warm × 1718×916/1024×680 的菜单边界、控件边界和截图；窗口调整、减少动态效果与高对比度。退出测试应用后拥有的最后 shell PID 已消失。

构建：`npm run verify` 通过（字阶、两套 TypeScript、Vite/Electron 构建）；现有 `tests/game-terminal.test.ts` 4/4 通过。没有改动终端后端。已抽出原有 `GameOptionsMenu` 作为三个游戏菜单的共同所有者，保留 native `popoverTarget`，未重新引入指针按下关闭、click 再打开的旧问题。

严格静态审计返回 8 项：7 项来自既有 ReadingView/SpeechInput/AiPanel/FloatTodo；另 1 项在提取后的 `GameOptionsMenu.tsx`，属于审计器未识别 `popoverTarget` 原生动作的误报。该入口的鼠标、键盘、再次点击和真实菜单结果均已通过上面的实机验证；没有为消除误报添加无意义 click handler。未宣称全应用严格审计通过。官方 `designmd lint DESIGN.md` 为 0 errors、1 条既有的无 YAML 提示。原生验收与截图期间 renderer exception/console error 为 0。

final result: passed

## 游戏项目终端 · 方案 2 · 2026-10-16

范围：在预览与测试两栏共同下方增加可收起、可调高的真实 PowerShell，保留现有游戏运行和测试行为。

### 对照证据

- source visual truth：[用户选定的终端方案 2](design/game-terminal-option-2-2026-10-16.png)，1586×992。
- implementation screenshot：[真实终端与实际游戏](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-terminal/terminal-final.png)，原生 Electron 客户区及 PNG 均为 1600×1000，DPR=1、页面缩放 1。
- [同图完整与局部对照](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-terminal/terminal-comparison.png)：完整窗口各等比缩至 800px 列宽；终端左侧及工具栏另按原像素裁取，检查命令文字、内边距、主次操作和状态，没有拉伸图像。
- state：mist、N1、五项快速检查通过、终端展开、PowerShell 在游戏目录中实际执行 `node cases/validate-game.cjs` 后等待输入。源图是示例输出，实机保留脚本真实输出与 PowerShell 高亮，不伪造源图中的五项命令结果。

### 检查结果与迭代

| 维度 | 结果 |
|---|---|
| 字体与字阶 | 终端字号读取共享 `--type-body`，等宽字体使用 Cascadia Mono/Consolas/微软雅黑；宿主控件沿用原字阶。局部对照确认提示符、路径、命令与输出可读，没有将整张设计稿作为界面。 |
| 布局与间距 | 终端横跨左右两栏，初始展开高 240px，分隔线清楚；预览与测试共同缩短，右栏仍有独立滚动。1600×1000、1024×680 均保留操作入口，无宿主横向溢出。 |
| 颜色与材质 | 保留外壳三主题；终端是固定深色业务表面，背景/工具栏/前景/选中/焦点由 `--game-terminal-*` 映射。原生程序 ANSI 输出继续保留其颜色语义，主行动和提示不混用。 |
| 图像与图标 | 游戏来自现有 webview，插图和 Phosphor 图标复用，没有新增模拟游戏画面或手画资产。 |
| 文案与内容 | 真实 shell、目录、命令和状态。移除设计评审的“示例会话”字样，首版 PowerShell 为静态 shell 标签；新增中断与结束会话区分 Ctrl+C 和进程清理。 |

- Windows 原生后端清屏与 xterm 清屏需要同步，否则调整尺寸后可能重绘旧内容。现已同时清理，单元与实际清屏/调整尺寸/复制流程通过。
- 输入验收使用真实键盘事件和系统粘贴。自动化的直接文本注入不能代表终端键盘；Ctrl+C 后等待 PowerShell 提示符恢复，再继续命令。实测能够停止前台 Node 并继续使用原 shell。
- 原游戏在较低的“跟随窗口”视口中会压缩地图，这是被测网页自己的高度响应式表现。本次不改游戏 CSS；[桌面固定视口示例](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-terminal/terminal-fixed-viewport.png)确认可用现有 1440×1000 预设保留完整画面，也可收起终端恢复高度。该差异不冒充宿主已重做游戏界面。
- 宿主全宽底部布局未发现剩余 P0/P1/P2 差异。P3：生成稿字形、光泽、示例会话和真实 PowerShell 输出密度存在差异；首版没有展示不存在的其他 shell 选项。

### 行为验证与边界

- [最终实机记录](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-terminal/evidence.json)14 项通过：懒启动、正确目录、中文粘贴与输出、五项快速检查、全宽几何、收起/切页保留 PID 和变量、鼠标/键盘调高、复制、Ctrl+C、中断后的继续输入、进程树结束、重新连接、清屏、命令错误恢复、普通粘贴、目录归属保护、三主题、窄窗和减少动态效果。其他窗口调用终端 IPC 被拒绝。
- 终端保持连接时，独立 Edge 完整三案通关通过；应用退出后检查最后 PowerShell PID 已消失。真实游戏源码指纹与接入终端之前一致。
- [控制台记录](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-terminal/capture-evidence.json)：终端初始化、命令与预览过程中 main renderer console error 和 page exception 均为 0。
- 项目路径失效场景通过：终端错误保留在面板内，可修正项目设置后重新连接真实 shell；原生模块/目录失败与旧会话 ID、尺寸、缓冲边界另有单元覆盖。
- `npm run verify` 通过；游戏终端/游戏服务/AI 作用域/guest 相关回归 19/19 通过。[全量回归](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-terminal/unit-tests.log)661/663 通过，仍是两项原有 Windows symlink EPERM，未修改这些测试。
- [严格静态审计](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-terminal/ui-audit-final.json)有 9 项既有发现，新增终端没有发现；[官方 DESIGN.md lint](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-terminal/design-lint.json)为 0 errors、1 条既有无 YAML 提示。不宣称全应用审计或全量测试通过。
- 最终原生验收使用隔离 Ono appData 和 PowerShell APPDATA。Ono 的终端回放缓冲仅在内存中保留；用户正常使用的 PowerShell 命令历史仍由系统管理。没有修改真实游戏源码、替换安装版或发布版本；安装包内的原生依赖尚未进行安装升级验收。

final result: passed
