# 浏览器任务记录 · 2026-10-17 · 已选方案 2

## 标题栏高度细化（用户后续反馈）

- 用户指出标题栏偏高；实测原高度为 79 CSS px，来自外层上下 padding 与共享标题行 12px 底部留白叠加。本次仅在浏览器任务列表及单条记录的样式变体中取消叠加留白，标题栏变为 56 CSS px，关闭按钮点击区域为 44×44 CSS px；共享 Modal 和其他弹窗未改。
- 最新证据：`C:/Users/henry/.codex/visualizations/2026/10/17/01a148bd-f549-7572-8f83-877199ff6d5e/browser-task-header/`，`comparison-header.png` 将相同任务、相同展开状态的修改前后弹窗按等宽并排核对，`records-final.png` 为最终原生截图裁切。原生截图 2080×1520，CSS 弹窗 1040×760、DPR 2；外框、字体、颜色、图标和文案不变，正文可用高度增加 23px。
- `verify.cjs` / `report.json`：13 组布局检查通过；三主题、100%/125%/150% 窗口缩放、长文本、来源展开、键盘与 Escape、强制对比度和减少动态效果均通过。矩阵中的标题栏高度与关闭按钮点击区有实测断言，无页面或控制台错误。
- `npm run build`、`npm run check:typography` 及变更文件 diff 检查通过。此项为样式修正，没有新增单元测试；下方为原始方案 2 的验收与迭代历史，当前标题栏以本节 56px 细化结果为准。视觉对照无待处理 P0/P1/P2，final result: passed。

## 对照与范围

- Source visual truth：`docs/requirements/web/browser-task-record/design/browser-task-option-2-2026-10-17.png`，对应本轮三张生成结果显示顺序中的第二张，采用左侧最近任务与右侧详情。源 PNG 未提供 CSS 视口或 DPR；对照时取可见弹窗区域 1316×971，按相同宽度缩放，保持纵横比，不将图片像素冒充 CSS 尺寸。
- 实现证据目录：`C:/Users/henry/.codex/visualizations/2026/10/17/01a148bd-f549-7572-8f83-877199ff6d5e/browser-task-record/`。`records-final.png` 为原生 Electron 截图的弹窗裁切，2080×1520；实际 CSS 弹窗为 1040×760，CSS 视口 1279×900、DPR 2（原生窗口请求 1280×900，Windows 舍入）。`comparison.png` 将源弹窗与实际弹窗同时归一为 1000px 宽并排对照，保留各自比例。
- 对照状态：mist、最近三个示例任务、选择 RLCD 查询任务、页面检查页、第二项证据展开、无键盘焦点外框。源稿的百度背景与实机隔离浏览器空白页属于背景上下文差异，不作为弹窗内容保真目标。
- 本轮只调整记录阅读界面及其文字表达。复用共享 Modal、Segmented 和运行时三主题；聊天回复入口仍严格关联本条回复的任务，不扩展到其他历史任务。未更改核验引擎、已有任务记录或用户真实数据。

## Findings 与修复历史

1. 初版 P2：独立的「检查定义与来源」行增加了证据区域高度，使 1280×900 的底部说明需要滚动才能看到。`comparison-before.png` 同时包含源稿和初版，保留该问题证据。修复为来源域名内的展开入口、收紧区域间隔、移除末行多余分隔线；最终 `comparison.png` 与 `records-final.png` 中说明完整可见，13 组几何检查包含该可见性断言。
2. 初版 P2：侧栏长任务名称可占用大量行，影响任务切换。修复为列表最多三行，完整名称在详情正文可读；`records-long-stale.png` 验证长名称、长文字条件与连续长网址在窄窗缩放下不产生水平溢出。
3. 语义修正：检查摘要由真实 condition 生成，保留正反条件、空字段值和数量；AI 登记名称保留在可展开来源中。缺少、失败、无法确认和过期检查不补造通过状态。「已返回」与页面检查的含义分开展示。

## 必需保真表面

- 字体与文字：沿用 `--font` 与 page/section/body/control/support 字阶，中文走现有微软雅黑回退，拉丁与数字沿用 Bahnschrift。源稿无字体元数据，按同一产品字阶与标题层级对照；完整日期、任务标题、证据换行与连续网址可读。
- 布局与间距：固定外框、约 29% / 71% 分栏、独立滚动、固定标题栏、下划线分段切换及展开证据与选稿一致。≤800px CSS 视口将任务列表放在详情上方；实际补测 1024 原生窗口、150% 缩放的上下布局，详情保留可用高度。
- 颜色与材质：使用现有 `--ai-panel-bg`、glass、hairline、ink、acc 与 avatar-teal。选中态为雾蓝，检查通过为青绿配文字；cool、warm 沿用相同结构。没有新建主题或用透明前景透出背景文字。
- 图像与图标：弹窗没有需生成的新位图内容；采用既有 Phosphor FileMagnifyingGlass、ListChecks、CheckCircle 等真实库图标。源稿与实现的具体图标轮廓差异为同库语义适配，不以绘制图形代替素材。
- 内容：不植入生成稿的研究结论。真实条件的摘要比 AI 原名称更窄属于有意修正，域名、完整来源和检查时间来自记录；示例均只存在隔离验收数据中。

## 验证

- `tests/browser-task-record.test.ts` 与 `tests/browser-site-approval-ui.test.ts`：7 项通过，包含历史回复隔离、淘汰、重试、实时更新优先于迟到快照、任务切换、条件真实范围与各检查状态。
- `verify.cjs` / `report.json`：13 组布局检查通过（三主题 × 1280/1024 原生宽度 × 100%/125%，另加 150% 的上下布局），无页面错误或控制台错误。
- 实机交互：任务切换、其他任务更新不改变选择、检查/操作视图切换、证据展开状态保留、方向键/Space/Enter、完整来源键盘展开、过期证据、长文本、强制对比度、减少动态效果、滚动时关闭按钮可见、Escape 与触发按钮焦点返回均通过。
- `npm run check:typography`、`npm run typecheck`、`npm run build` 通过；变更文件 diff 检查通过。既有 `tooling/browser-automation-pilot.mjs` 的记录区断言已更新到新结构；本轮未重新运行完整浏览器后端专项，实际运行的是上述组件测试与隔离记录界面验收。
- 全仓 premium strict 静态审查仍有 8 项范围外问题：ReadingView 原生 select 所有权、AiPanel 动作/textarea、FloatTodo 表单/textarea。详见证据目录 `premium-audit.json`；本次修改的浏览器记录文件无静态审查发现，未扩大范围修改其他功能。

## Implementation checklist

- [x] 已选稿、实际截图与同输入并排对照均存在。
- [x] 两轮 P2 修复后重新捕获并核对；当前范围无待处理 P0/P1/P2。
- [x] 左右分栏、窄视口、证据语义、原始来源和历史任务关联均验证。
- [x] 文档记录视觉所有者、交互边界及全仓检查限制。

final result: passed

---
