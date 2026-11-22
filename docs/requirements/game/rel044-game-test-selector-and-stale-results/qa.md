# 游戏检查下拉选择 · 验收 · 2026-10-19

final result: passed

本结论覆盖方案三的布局、真实状态、选择与执行交互，以及原问题反馈流程；不表示新增了游戏测试覆盖或完成线上游戏验收。

## 视觉依据与实机

- 源图：[用户选定的方案三](design/game-check-select-option-3-2026-10-19.png)。原始 PNG 1024×1536，按 2× 设计密度归一为 512×768 画布，其中包含外部留白。
- 实现：[完整窗口，菜单展开](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-check-select-20261019/final-open.png)、[完整窗口，菜单关闭](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-check-select-20261019/final-closed.png)。原生内容区 1793×945，1× PNG。
- 侧栏：[展开状态](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-check-select-20261019/final-open-panel.png)、[关闭状态](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-check-select-20261019/final-closed-panel.png)。实际 CSS 框约 512.05×767.52，原生截图 512×768；未拉伸实机截图。
- 同一输入中的对照：[完整侧栏对照，左设计右实机](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-check-select-20261019/comparison.png)、[标题与选择器局部对照](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-check-select-20261019/comparison-focus.png)。源图仅按密度缩小；实机来自 Electron `capturePage`。
- 状态一致：mist、选择案件规则、五项均待重测、上次实际快速检查通过、菜单分别展开/关闭。时间来自各自记录，未伪造源图中的历史时间。

## 功能验证

Browser plugin not available。沿用项目已有 Playwright Electron 验收路径，使用独立 appData 与真实游戏副本。运行完关闭隔离窗口；未修改真实游戏源码或用户实际数据。

| 项目 | 结果 |
|---|---|
| 页面标识、正常内容与无框架错误层 | 通过 |
| 首次五项未运行，各项名称、脚本和说明正确切换 | 通过 |
| 方向键、Home/End、Enter/Space、Escape、外部点击与焦点返回 | 通过 |
| 弹层等宽、避让、展开不推移正文 | 通过；九组尺寸/主题下宽差均小于 1px |
| 实际五项快速检查、真实通过状态、单项重跑只更新所选记录 | 通过 |
| 副本代码变化后的五项待重测、数量及旧结果说明 | 通过 |
| 副本脚本真实失败、输出默认展开、修复重跑、运行中与取消 | 通过 |
| 三主题 × 1718×916 / 1280×820 / 1024×680 | 通过；没有横向溢出 |
| 固定运行按钮、详情滚动、减少动态效果 | 通过；运行按钮约 34.14px 高 |
| 完整通关范围、记录问题入口、收起与重新打开侧栏 | 通过 |
| 控制台与渲染异常 | 0 条相关错误 |

[七组桌面交互报告](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-check-select-20261019/report.json)记录窗口、弹层和按钮实测数据。截图和临时脚本留在仓库外。

问题反馈再跑既有 `tooling/game-issues-pilot.mjs`：八组通过，包括真实试玩截图、验证与草稿保护、双击只保存一次、路径/原图/ZIP、三主题两尺寸、应用重启回读、浏览记录保留草稿和线上证据隔离。[回归报告](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-check-select-20261019/issue-regression/report.json)。旧列表定位已改成检查下拉菜单中的五个状态；窗口初始动效结束后再测量原有按钮位置。

## 对照结论与修复记录

- 字体与层级：沿用项目 `--type-*`、系统中文字体及 Phosphor 图标，名称、检查什么、怎么检查、上次结果的层级清楚。使用现有紧凑标题/按钮，不将概念图整体当作大字号新主题。
- 布局与滚动：列表收进单个选择器，正文连续阅读；操作栏固定。真实弹层覆盖正文而不推移正文，遵守共享 Select 的行为，关闭后可完整阅读说明。窄窗允许正文纵向滚动。
- 颜色与状态：复用雾蓝、青绿、danger 和琥珀 token。旧记录始终显示待重测，选中项仍保留琥珀状态；选中背景表示选择，不表示本次通过。没有新增图片资产或替代游戏画面。
- 文案与证据：说明明确区分模拟页面检查和真实 Edge 操作；上次结果显示真实状态、时间、输出，未补造逐条成功项。保留附件、问题反馈及运行日志。
- 第一轮发现：失败时原摘要可能只有报错代码片段，缺少明确的状态文字；切换前滚动到原始输出后，新详情应从顶部开始。已补真实状态标题、独立错误摘要与切换归顶，第二轮实机验证通过。
- 最终视觉对照没有未解决的 P0/P1/P2。P3 差异：源图周围留白、生成稿的图标细节、历史时间与脚本范围文案由现有产品组件和实际数据替代，不宣称逐像素一致。

## 工程验证与边界

- `npm run verify` 通过：字阶检查、两个 TypeScript 项目、Vite 与 Electron 构建。首次沙箱构建被 Windows `spawn EPERM` 拦截，允许子进程后重跑通过。
- `node --import tsx --test tests/game-workbench.test.ts tests/game-issues.test.ts tests/game-trial-reset.test.ts`：23/23 通过。
- 全仓 premium 静态审计仍有 7 条既有发现，位于 ReadingView、SpeechInput、AiPanel、FloatTodo；本次 GameView/game.css 没有发现。[完整输出](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-check-select-20261019/static-audit.json)。未借此次修改重写其他页面。
- 未重新执行实际 Edge 完整三案通关、发布打包或线上服务验收；本次未改变那些脚本与执行协议。

## 后续密度调整：结果两行展示

用户要求上次结果区域压成两行。标题、状态、月/日时分和耗时共用首行，待重测说明为次行；完整时间仍可悬停查看。失败原因保持可读，不截断报错。

`npm run verify` 通过。隔离 Electron 验证三主题 × 1793×945 / 1280×820 / 1024×680 共九组，正常待重测结果均为两行、高约 46.88px，标题/状态/时间无重叠、没有横向溢出；首次未运行状态、完整时间提示及范围切换也通过。[实机局部截图](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-check-select-20261019/two-line-result.png) · [完整侧栏](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-check-select-20261019/two-line-panel.png) · [几何与交互报告](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-check-select-20261019/two-line-report.json)。
