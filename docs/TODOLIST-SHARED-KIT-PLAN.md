# To-Do-List 升级方案:抽取共享待办包 `ono-todo-kit`

> 目的:把待办核心从 To-Do-List 中抽成独立共享包,让 **To-Do-List 与个人工作台共同依赖同一份代码**,从根上替代"清单化移植 + 发版同步"的过渡方案。
> 铁律:**To-Do-List 是已发布、带自动更新的应用,每个阶段结束它都必须可正常构建、通过全部测试、可发版**。小步走,每个阶段对应一个正式版本,禁止大爆炸重写。

## 一、抽取边界(什么进包,什么留下)

### 进共享包 `ono-todo-kit`(纯逻辑 + 主题化 UI,不含任何 Electron 壳)

| 层 | 来源(To-Do-List) | 内容 |
|---|---|---|
| 契约层 | `shared/contracts.ts`、`shared/format.ts` | Zod schema、类型、业务纯函数(activeToday、insightTarget、逾期/分组计算等) |
| 数据层 | `electron/store.ts` | SQLite 数据层(4 张 payload 表、WAL、乐观锁、事务、`applyPlan` AI 计划事务应用);**改造点:db 路径由调用方注入**,去掉 `app.getPath` 耦合(node:sqlite 两边都可用) |
| 领域逻辑 | `electron/main.ts` 中的纯计算部分 | 提醒到期计算、今日复盘摘要生成、事项分组排序(通知/轮询的"外壳"留在应用侧) |
| AI 任务工具 | `electron/ai.ts` 中的待办部分 | 待办工具定义、建议计划 schema、`applyPlan` 对接;AI 内核本身(供应商适配/循环/会话)留在各应用 |
| UI 层 | `src/ui.tsx`、`TaskEditor.tsx`、`TaskLibrary.tsx`、`TagColorPresets.tsx`、任务列表/磁贴组件 | 手写基础组件、编辑器、事项库、选择器;**样式全部走 CSS 变量(--paper/--accent/--radius 等),组件不带具体配色** |

### 留在 To-Do-List(应用壳)

窗口体系(主窗/迷你卡/悬浮卡/AI 窗)、托盘、系统通知管道、提醒轮询循环、登录自启、更新器、设置界面、纸感主题(`styles.css` 的 token 值)、`ai.ts` 的内核部分(供应商适配、Pi 循环、多会话)。

### 留在工作台(应用壳)

外壳/导航/浏览器/文档中心、玻璃蓝主题(同一批 CSS 变量给不同的值)、多模块 AI 内核(kit 只向它注册待办工具)、未来各工作台模块。

> **主题共生原理**:kit 的 UI 组件消费 CSS 变量而不是写死颜色。To-Do-List 的 `styles.css` 继续定义米白/砖红;工作台定义浅蓝/玻璃。同一棵组件树,两套皮肤——这正是两个项目"功能一模一样、外观各自成立"的技术落点。

## 二、发包形态

- 独立仓库 `ono-todo-kit`(npm 包,ESM + 类型),**不走公共 registry**:两个项目都用 npm git 依赖按 tag 锁定(`"ono-todo-kit": "github:OnOSaN/ono-todo-kit#v0.3.0"` 形式或私有 git URL)。
- 版本纪律:0.x 阶段严格锁 tag,升级 = 显式 bump + 跑双方测试;kit 的 CHANGELOG 与 breaking change 单独记录。
- kit 仓库内自带从 To-Do-List 移植的全部测试(store/contracts 单测),CI 跑通才能打 tag。

## 三、分阶段迁移(每阶段 = To-Do-List 一次正式发版)

### 阶段 0:准备(不发版)
- 建 kit 仓库骨架(tsconfig/vitest/tsup 打包);把 To-Do-List 挂为 kit 的对照上游。
- 在 To-Do-List 补齐关键路径的回归测试(如有缺口),确保后续每一步都有红灯保护。

### 阶段 1:抽契约层 → To-Do-List v0.6.0
- `shared/contracts.ts`、`format.ts` 移入 kit;To-Do-List 改为从 kit import,其余不动。
- 风险最低(纯类型与纯函数),用来打通"git 依赖 + 构建 + 测试"全链路。
- 工作台侧:删除移植副本中的 contracts,改用 kit(工作台同步跟进一次)。

### 阶段 2:抽数据层 → v0.7.0
- `store.ts` 进 kit,签名改为 `createStore({ dbPath })`;To-Do-List 主进程传入 `%APPDATA%/To-Do-List/tasks.db`,行为零变化。
- store 单测移入 kit;To-Do-List 保留冒烟测试引用 kit。
- **数据零迁移**:schema 不动,老库直接可用;PRAGMA/user_version 逻辑原样带走。

### 阶段 3:抽领域逻辑 + AI 待办工具 → v0.8.0
- 提醒到期计算、复盘摘要、分组排序等纯函数进 kit;`ai.ts` 的待办工具定义与 applyPlan 进 kit。
- To-Do-List 的 AI 内核改为"内核(应用)+ 待办工具(kit)"组合;工作台 AI 内核同样从 kit 注册待办工具。
- 此阶段完成后,**工作台的"发版同步"流程只剩 AI 内核与壳层**,待办逻辑差异在包层面自然归零。

### 阶段 4:抽 UI 组件 → v0.9.0
- `ui.tsx`、TaskEditor、TaskLibrary、选择器、任务列表组件进 kit,样式全部收口到 CSS 变量。
- To-Do-List 保留自己的 token 值与布局壳(迷你卡、AI 窗等专属表面不动);Playwright 桌面冒烟全绿后发版。
- 这是最重的一步(估 2~3 个工作日 + 回归),前面三阶段都是为它降险。

### 阶段 5:工作台切换到 kit → 收官
- 工作台删除 `modules/todo` 移植副本,直接依赖 kit + 主题覆盖。
- 下线"清单化移植 + drift 检查"流程;设置页版本标记改为"待办内核 ono-todo-kit vX.Y.Z"。
- 此后任何待办新功能:一律先在 kit(或经 To-Do-List)实现,双方升 tag 即得——**不再存在同步问题,只存在正常的依赖升级**。

## 四、风险与对策

| 风险 | 对策 |
|---|---|
| 重构期破坏已发布功能 | 每阶段独立发版 + 全量测试 + Playwright 冒烟;出问题按 tag 回滚,发布红线(latest.yml 校验、CHANGELOG 提取)照旧执行 |
| kit UI 无法完全适配工作台玻璃风 | 组件只吃 CSS 变量;布局差异(首页网格 vs 悬浮卡)本来就是应用壳的职责,kit 不负责布局 |
| 两边需求分叉(某方要改 kit) | kit 是唯一实现,改动即双方可见;以"先改 kit、各自升版"代替"各自改各自" |
| git 依赖的国内网络问题 | tag 锁定 + 本地 `npm link` 开发模式兜底;必要时换自建 registry |
| Electron/Node 版本差异导致 node:sqlite 行为差异 | 两项目锁同一 Electron 大版本(44),kit 的 CI 矩阵覆盖该版本 |

## 五、工作量粗估与排期建议

- 阶段 1:约 0.5 天;阶段 2:约 1 天;阶段 3:约 1 天;阶段 4:约 2~3 天(含回归);阶段 5:约 0.5 天。
- 建议节奏:**工作台先行**(骨架 + 壳 + 待办移植副本照旧开工,不等 kit);To-Do-List 的 kit 化按阶段穿插进行;阶段 4 完成后工作台一次切换收官。
- 前期"清单化移植"并不浪费:移植副本的目录就是按 kit 边界切的,阶段 5 的切换接近纯替换。
