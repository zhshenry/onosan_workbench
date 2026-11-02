# 星盘探索 · 第一批 · 2026-11-02

## 确认范围

用户同意按[高保真](design/astro-explore-2026-11-02.png)实现第一批:顶部日月升概览与分布浮层、星体/表格联动、十二宫及现代守护、相位筛选、中文术语说明。保留当前深色星盘、真实宫头/黄经、普拉西德制和整宫制、出生资料及原 AI 入口。

第二批的时区/夏令时、行运和更多星体,第三批的合盘/推运等未纳入本次。用户资料和历史笔记不迁移;只在用户切换宫制时沿用原保存路径。选中状态和筛选仅在当前页面内存中保留。

## 计算口径

- 宫表、盘面扇区和落宫使用同一个 `AstroChart`。宫主星采用现代守护,在表头和页尾明确标识;天蝎/水瓶/双鱼分别使用冥王/天王/海王。
- 星座元素按火、土、风、水循环;模式按基本、固定、变动循环。十颗主要星体各计一次,不含 ASC 或宫头,不赋权。
- 相位的星体、类型、最大容许度可组合筛选;只控制可见表项和连线,原计算阈值不变。
- 上海示例 2020-04-09 11:34、31.2304°N/121.4737°E:月亮天蝎 4°37′,普拉西德制第 4 宫、整宫制第 5 宫。第 4 宫宫头天秤,现代守护星金星在第 11 宫;元素数量 1/3/3/3,模式数量 3/4/3。
- 中文说明为自行概述的常见术语,不是自动生成的个人预测。参考 [Astrodienst 守护星](https://www.astro.com/astrowiki/en/Ruling_Planet)、[宫位](https://www.astro.com/astrowiki/en/Houses)、[元素](https://www.astro.com/astrology/in_elements_e.htm)、[三种模式](https://www.astro.com/astrowiki/en/Quadruplicities)。未复制参考项目的算法或解读文本,未新增依赖。

## 验证记录

使用隔离 `WORKBENCH_TEST_DATA_DIR`、`WORKBENCH_ISOLATED=1` 和示例资料运行正式构建的 Electron。Browser plugin not available,沿用 Playwright Electron 验证;没有访问用户实际数据目录或发起模型请求。

本机证据目录:
`C:/Users/henry/.codex/visualizations/2026/10/17/01a148bd-f549-7572-8f83-877199ff6d5e/astro-phase1-20261102/`

- `check.mjs` / `report.json`:原生窗口交互、尺寸和控制台记录。
- `final.png` / `mist-moon.png` / `cool-moon.png` / `warm-moon.png`:选中月亮及三主题。
- `houses.png` / `aspects.png` / `no-matches.png` / `reading.png` / `distribution.png`:新增信息状态。
- `narrow*.png` / `zoom-200*.png` / `ai-open.png`:1024×680、200% 缩放、AI 侧栏。

同尺寸源图与实际 1488×1056 截图已同屏对照:外壳、暗盘、两列布局、右侧四页签、紧凑表格和下方说明均保留。图中具体星体坐标服从真实计算。修复首轮发现的右卡被详情撑高,两列桌面高度均为约 775.64px,切换选择和页签不改变高度。筛选中的刑/冲保持语义红色,不被整行选中颜色覆盖。

自动回归覆盖星历独立样本、真实坐标与标签不跨宫、宫制持久化和旧笔记保留、星体/宫位/相位的鼠标与键盘联动、三个条件组合和空结果、缺地点和极区不可用状态、切换命例复位、元素/模式与现代守护口径。桌面实机覆盖三主题、分布浮层 Escape 关闭和焦点恢复、窄窗与缩放下滚动可达,并检查页面无横向溢出、无渲染或控制台错误。

`npm run verify` 通过,包括字号规范、前后端 TypeScript 检查、Vite 与 Electron 构建。四个相关测试文件共 46 项通过,记录在 `regression.log`;最终原生交互报告 `passed: true`,无页面/控制台错误。构建保留既有大 chunk 提示。

本轮未打包安装器、发布或更新已安装版本。

final result: passed for astrology phase 1
