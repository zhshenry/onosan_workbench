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
