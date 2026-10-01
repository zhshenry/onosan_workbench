# 八字排盘模块 · 设计与实施方案

> 状态:**已并入命理三盘(2026-09-26)**——本方案是八字单模块阶段(2026-09-23 v1)的记录;当前模块已升级为「命理」三系统(八字/紫微/占星),视觉与功能权威见 [../design/mockups/mingli-glass.html](../design/mockups/mingli-glass.html) 与 design/README.md 对应段,现状为 56 测试全绿。本文档保留作为算法契约与功能范围的历史依据。
> 单模块阶段高保真原型:[../design/mockups/bazi-glass.html](../design/mockups/bazi-glass.html)(已被 mingli-glass.html 替代,留作视觉演进记录)
> 参考来源:DSH 插件 `C:\Myself\vibe_coding\dsh_plugins\Veang-Workbench` 的命理工作台(FortunePanel)
> 日期:2026-09-23(三盘升级 2026-09-26)

## 落地记录(与原方案的偏差/补充)

- **AI 解读提前接入 v1**:未等 ai-tools 注册制,渲染层直接把命盘提示词经 `AiPanel` 新增的 `seed` 进线发出(新建会话 + 直接发送,无会话指针竞态);未配置 AI 时按钮提示先去设置。v1.5 的 `bazi_analyze` 只读工具仍保留为增强项。
- **命例删除**:chip 悬停出现 ✕(沿用 AiPanel 会话删除先例),笔记随删;方案原定 v1 不做删除。
- **新模块文件**:`shared/bazi-contracts.ts`(Zod+纯函数+命盘类型)、`shared/lunar-javascript.d.ts`(最小类型面)、`modules/bazi/{compute,store}.ts`、`modules/bazi/ui/{BaziView.tsx,bazi.css}`。
- **踩坑**:npm 版 lunar-javascript(1.7.7)的 `HideGan/ShiShenZhi` 返回**数组**(DSH 内嵌旧版为逗号字符串),`toList` 已做双兼容;`getDayShiShenGan()` 返回「日主」字面量;流年在 `DaYun.getLiuNian()` 上而 `Yun` 没有;八字神煞库内无表,`shared/bazi-contracts.ts` 本地查表实现。
- **计算放渲染层 + 命例库 userData JSON(bazi-profiles.json)**按原方案执行;「小工具」一级与首页「更多工作台」卡片同步去掉了规划中标记。

## 0. 假设声明(评审已逐项确认)

本次评审提问未获回复,以下按推荐档推进,评审时可逐条否决:

1. **功能范围**:对齐 DSH 插件全部已有功能,并补齐主流排盘标配的**流年**与**神煞**;合婚、择日、紫微、星盘不做(DSH 中紫微/星盘也只是占位)。
2. **交付形态**:高保真**可交互原型**(真实算法)+ 本方案文档;评审通过后再写进工作台源码。
3. **命例管理**:需要。本地保存多人档案,随时切换(原型已含此交互)。

## 1. 定位与模式

- 落位:一级工作台「小工具」(life)→ 二级目录「八字排盘」(nav.ts 现有占位项升级为真视图)。
- 模式:**Operate**(自用工具)。信息层级与任务可达性优先;命理语义色(五行)是信息编码,不违反「单一强调色」约定——强调色仍只承担行动/选中。
- 内容主张:排盘一次看全(四柱/五行/大运/流年/神煞),命例沉淀(档案+笔记),AI 解读交给工作台 AI 内核——与 DSH 插件「拼 prompt 发会话」的思路一致,但走本应用已确立的「AI 内核 + 模块工具注册」架构。

## 2. 功能清单(v1)

| 功能 | 说明 | 对应 DSH |
|---|---|---|
| 四柱排盘 | 年/月/日/时四柱:干支、每字五行着色、天干十神、地支藏干及各藏干十神、纳音;日柱标「日主」 | ✅ 已有(DSH 未展示地支十神,本版补上) |
| 五行统计 | 8 字五行计数 + 比例条,自动标注「偏旺/缺」;日主五行小结 | ✅ 已有(DSH 只有计数,本版加可视条) |
| 大运 | 起运年月日 + 起运阳历日期;大运序列(干支/岁段/年份段/天干十神),**当前大运高亮** | ✅ 已有(DSH 无当前标记、无十神) |
| 流年 | 点击任一步大运展开其 10 个流年(年份/干支/十神/虚岁),当前流年高亮 | ➕ 新增(DSH 未做) |
| 神煞 | 天乙贵人、文昌、桃花、驿马、华盖、将星、羊刃、红鸾、天喜(按日干/年支/日支查表,标注落柱) | ➕ 新增(DSH 未做) |
| 农历/生肖 | 农历全串、时辰名、生肖 | ✅ 已有 |
| 命例管理 | 多命例档案(姓名/公历生日/时间/性别),chip 切换、新建;localStorage → 实装为 userData JSON | ➕ 新增(DSH 无持久化) |
| 笔记 | 每命例一篇自由笔记,自动保存 | ➕ 新增(PRODUCT.md 描述「流年与大运笔记」) |
| AI 解读 | 命盘数据(四柱/五行/日主/大运/流年)发送到工作台 AI 面板,按固定维度生成解读;只读分析,不走「建议-确认卡」 | ✅ 已有(改走本应用 AI 架构) |
| 输入与校验 | 公历 date/time 原生控件,1900–2100,性别(影响起运顺逆);改动即自动重排 | ✅ 已有 |

**不做(v1)**:时辰未知模式(默认 12:00,列为 v2)、真太阳时/经度校正(v2)、合婚/择日、紫微/星盘。

## 3. 数据模型(`shared/bazi-contracts.ts`,Zod)

沿用 DSH `buildBaziChart` 的返回结构(已验证可用),扩展流年/神煞/命例:

```ts
BaziPillar  = { label: '年柱'|'月柱'|'日柱'|'时柱', ganZhi, gan, zhi, wuXing,   // 干支与五行(库直出)
                ssGan, ssZhi: string[], hideGan: string[], naYin }
BaziChart   = { pillars: BaziPillar[4], count: {木火土金水},
                lunarText, shengXiao, hourName, dayGan, dayWX,
                yun: null | { startYear, startMonth, startDay, startSolar,
                              list: { startAge, endAge, startYear, endYear, ganZhi,
                                      liuNian: { year, ganZhi, age }[] }[] } }
ShenSha     = { name, from: '日干'|'年支'|'日支', zhi, pos }   // 本地查表,不进库
BaziProfile = { id, name, gender: 0|1, date: 'YYYY-MM-DD', time: 'HH:mm', note? }
```

## 4. 架构落位(照 todo 模块模式)

```
shared/bazi-contracts.ts      Zod schema + 类型 + 纯函数(shiShen/神煞查表/hourName)
modules/bazi/
  compute.ts                  排盘纯函数:buildChart(profile) → BaziChart(lunar-javascript 封装)
  store.ts                    命例库:userData/bazi-profiles.json(经 IPC 读写;先例 ai-config.json,轻量无需 SQLite)
  ai-tools.ts                 AiModuleContribution:bazi_analyze 只读工具 + 系统提示词
  ui/
    BaziView.tsx              视图(命例条/命盘/大运流年/五行/神煞/笔记)
    bazi.css                  模块样式(--bazi-* token 桥,同 todo.css 约定)
design/mockups/bazi-glass.html  高保真原型(视觉权威)
design/mockups/vendor/lunar.js  库本体(实现时改 npm 依赖 lunar-javascript ^1.7.7)
```

**计算放渲染层**:lunar-javascript 是纯 JS 无 Node 依赖,排盘是无状态纯计算,直接打包进 renderer,无需 IPC 往返(DSH 放服务端是其 C/S 架构所限)。命例/笔记的持久化走 IPC → 主进程 JSON 文件。

**挂载步骤**(最小路径,全部是既有点位的填充):

1. `shared/contracts.ts`:`ViewIdSchema` 加 `'bazi'`(工作台复用已有 `'life'`,无需动 WorkbenchIdSchema)。
2. `src/nav.ts`:`{ label: '八字排盘', pending: true }` → `{ label: '八字排盘', view: 'bazi' }`;「小工具」工作台去掉 pending。
3. `src/App.tsx`:内容区按 `curView` 条件渲染 `<BaziView>`(现状硬编码 HomeView,顺势引入 view 分发表);首页「更多工作台」八字卡片改跳 `'bazi'` 视图。
4. `electron/main.ts`:注册 `bazi:*` IPC(profiles/note 读写)。
5. `src/main.tsx`:import `bazi.css`。

## 5. 视觉规范(既定 Sky Glass 内的模块扩展)

- **全部组件语法继承外壳**:panel/phead/pseg/btn/chip/胶囊/focus 环/滚动条/动效 160–240ms,原型即权威。
- **五行语义色(新增 `--bazi-*` token,需 DESIGN.md 备案)**:木 `#3d8b5f` 松绿 / 火 `#bd5b2e` 陶红 / 土 `#9c7a26` 赭金 / 金 `#71808f` 银灰 / 水 `#2470b8` 晴蓝(与强调色同值——「水=蓝」是命理共识,且字符不可点,不与行动语义冲突)。仅用于干支字符、五行条与色点,大字号下均 ≥3:1;十神/纳音等辅助文字一律 ink-2/ink-3,不做彩色发散。
- **干支大字用楷体**(`KaiTi/STKaiti` 回退雅黑,40px):命书气质;属内容字形决策,UI 文字仍走系统栈。原型中已生效,评审时可否决改雅黑。
- **当前大运/流年高亮**沿用顶栏日程胶囊的 `.now` 语言(acc-soft 底 + live 点),不引入新状态色。
- 无新面板型态、无嵌套卡片;神煞/命例 chips 复用外壳 chip 语言。

## 6. 分期

- **v1(本方案)**:§2 全部功能。工作台首个 home 之外的真实视图,含 view 分发表重构。
- **v1.5**:AI 解读接入 `ai-tools.ts`(原型中为 modal 示意,实装后由 AI 面板承接);笔记支持流年定位(某年下挂条目)。
- **v2**:时辰未知模式、真太阳时校正、十神强弱提示、导出命盘图片;紫微/星盘如做,另立方案。

## 7. 验收与质量门槛

- `npm run verify`(双 tsconfig strict)+ `npm test`(为 buildChart/shiShen/神煞查表补单测:已知生日断言干支/十神/大运边界,含 1900/2100 边界与起运失败降级)。
- impeccable 检测器 0 anti-patterns;对比度、焦点环、reduced-motion 沿外壳既有标准。
- 原型交互验收清单:改生日/时间/性别即重排 ✓、命例切换/新建 ✓、大运点击展开流年 ✓、当前大运流年自动识别 ✓、笔记自动保存 ✓。
