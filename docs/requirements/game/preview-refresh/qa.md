## 试玩更新提示 · 方案 3 · 2026-10-17

范围：按用户选择，将本地源码更新提示合并进预览工具栏的原刷新按钮，移除项目栏下方单独的通知行。保留已实现的双环境切换、真实网页、原生刷新与右侧测试过期状态。

### 视觉对照

- source visual truth：`docs/requirements/game/preview-refresh/design/game-preview-refresh-option-3-2026-10-17.png`，1718×916，最近一组方案中第三个显示的生成结果。
- implementation screenshot：[最终原生窗口](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-preview-refresh/refresh-final.png)，1718×916 CSS px / PNG，DPR=1。状态为 mist、本地运行、N1现场、1440×1000固定游戏视口、源码已变化、右侧五项待重测；游戏案件背景弹窗已正常关闭。
- [完整组合对照](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-preview-refresh/comparison-full.png)：参考与实机各按0.5等比缩放；[工具栏组合对照](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-preview-refresh/comparison-toolbar.png)与[按钮组合对照](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-preview-refresh/comparison-button.png)分别按1072px工具栏宽和320px按钮宽等比归一，未拉伸。三张组合图已打开核验。
- 首次原生捕捉仍显示游戏默认案件背景弹层，与参考的现场状态不一致，因此先通过游戏自身「开始勘查」操作关闭，再重新捕捉和比较。未为此修改游戏界面或伪造试玩进度。

| 对照面 | 结果与有意保留的差异 |
|---|---|
| 字体与字阶 | 按钮复用13px control，更新标记复用11px caption，中文字体沿用宿主；生成稿文字较大，实际沿用整应用控件密度，未另造字阶。按钮与标记不折行，地址可省略。 |
| 布局与间距 | 原刷新位置改为约161×33px的紧凑按钮，地址栏与预览尺寸继续同排；更新前后工具栏均为60px高，没有全局新增通知行。左预览与右测试顶部对齐。 |
| 颜色与材质 | 浅底、描边、文字及圆点沿用共享amber派生颜色，标记底使用glass-hi。比生成稿更深的文字用于和原测试过期色保持一致；hover/active仍是amber，键盘焦点沿用共享规则。 |
| 图像与图标 | 刷新和圆点均使用现有Phosphor；网页仍由真实游戏渲染。参考带有已取得物证/气泡，隔离试玩保留真实初始进度，不为模拟效果稿灌入案件数据。 |
| 内容与其他区域 | 「刷新试玩」「有更新」一致。参考未画出的已批准双环境切换、一级图标栏与当前顶部组件继续保留；实际目录、测试端口、时间和完整测试列表来自隔离运行，不复制示例结果。此次对照验收范围为刷新按钮与通知行移除。 |

无剩余P0/P1/P2；上述宿主密度、已批准导航和真实数据差异属于明确保留的边界，不宣称全屏逐像素相同。

### 行为与回归

- `npm run verify`通过：字阶、双TypeScript配置及Vite/Electron构建。GuestFrame相关测试2/2通过。
- [原生验收](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-preview-refresh/report.json)6/6通过，console errors/page exceptions为0。使用真实游戏的独立副本，先执行现有五项快速检查，再修改副本中的不可见meta标记触发真实文件监听。
- 验证：未启动/无更新保持普通图标；源码变化只出现按钮内提示且不抢焦点、不自动刷新；Enter刷新实际载入最新meta版本，guest ID、当前URL和存档探针保留；原测试结果对象不变且五项仍待重测。线上不显示本地更新，线上刷新不清除本地提醒；切页返回保留提醒，停止本地后隐藏可更新态。
- 三主题1280×820、窄窗1024×680和最终1718×916均有截图；无窗口横向溢出，更新按钮可见可用。强制颜色及减少动态效果下可见、可聚焦；更新文字提供状态说明。
- 严格静态审计仍有8项其他视图的既有发现，新增游戏代码无发现；官方DESIGN lint为0 errors、1条既有无YAML提示。不宣称全应用静态审计通过。
- Browser plugin not available，沿用已授权的仓库Playwright Electron流程。只修改隔离游戏副本；真实scene.html前后SHA256一致。线上为隔离本机地址，仅验证环境切换语义；未验收公网发布、安装包或升级。

实施检查：按钮状态、真实手动刷新、存档与测试状态保留、双环境隔离、三主题与窄窗均已完成。无需要继续扩展的功能项。

final result: passed
