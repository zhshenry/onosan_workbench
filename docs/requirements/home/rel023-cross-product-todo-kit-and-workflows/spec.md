# 跨产品待办共享技术规格

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

## 四、风险与对策

| 风险 | 对策 |
|---|---|
| 重构期破坏已发布功能 | 每阶段独立发版 + 全量测试 + Playwright 冒烟;出问题按 tag 回滚,发布红线(latest.yml 校验、CHANGELOG 提取)照旧执行 |
| kit UI 无法完全适配工作台玻璃风 | 组件只吃 CSS 变量;布局差异(首页网格 vs 悬浮卡)本来就是应用壳的职责,kit 不负责布局 |
| 两边需求分叉(某方要改 kit) | kit 是唯一实现,改动即双方可见;以"先改 kit、各自升版"代替"各自改各自" |
| git 依赖的国内网络问题 | tag 锁定 + 本地 `npm link` 开发模式兜底;必要时换自建 registry |
| Electron/Node 版本差异导致 node:sqlite 行为差异 | 两项目锁同一 Electron 大版本(44),kit 的 CI 矩阵覆盖该版本 |
