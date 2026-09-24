# Ono Workbench · Windows 交互合同

本合同记录用户能观察到的流程与状态,参照 To-Do-List 的交互合同写法,但以工作台的宽屏双主题外壳为准。视觉 token 见 `DESIGN.md` / `src/shell.css`;待办字段与写入规则见 `shared/todo-contracts.ts`、`modules/todo/SYNC.md`;产品范围见 `PRODUCT.md`。

## 基础流程

| 场景 | 应有行为 | 当前所有者 |
|---|---|---|
| 工作台导航 | 一级图标栏切大工作台,二级目录切当前工作台页面;首页省略二级目录。当前项有文字、颜色与标记;键盘可进入和操作 | `src/App.tsx` |
| 待办读取与写入 | 首页从 To-Do-List 共用 tasks/categories 读取;创建、修改、完成、软删除后刷新。版本冲突保留当前输入并提示重开/重试,不静默覆盖 | `modules/todo/ui/*`、`modules/todo/store.ts` |
| 新增与编辑 | 主行动打开对应表单;无效字段就地提示,保存中避免重复提交;成功后关闭并更新列表,失败保留输入 | `modules/todo/ui/TaskEditor.tsx` |
| AI 对话 | 主动发送才访问所选模型;历史不重复包含本轮输入。运行中可停止,取消后保留输入;工具只生成建议,逐项确认后才写待办 | `src/views/AiPanel.tsx`、`electron/ai-ipc.ts` |
| AI 建议 | 应用失败保留待确认建议与选择,成功后才标记已应用;放弃不改待办;过期建议不能再应用 | `electron/ai-ipc.ts`、`electron/ai-store.ts` |
| 通知中心 | 角标 = 当前逾期事项 + AI 待确认建议,关闭弹层时也更新;打开可查看来源与进入处理页;无内容时显示明确空状态 | `src/views/NotificationCenter.tsx` |
| 设置 | 分区行即时保存并反映状态;写入失败提示并回退可见状态。与 To-Do-List 共用库的信息只读展示 | `src/views/SettingsView.tsx`、`electron/app-settings.ts` |
| 规划中的入口 | 在点击前标明“规划中”;不能以与已上线主行动相同的强调方式承诺未提供的功能 | `src/App.tsx`、首页快捷工具 |

## Canonical UI Map

| 能力 | 共用所有者 | 变体与验证 |
|---|---|---|
| 导航 | `src/App.tsx` 的工作台/二级目录 | 当前项、收起、最小窗口和键盘行为 |
| Select/Listbox | `modules/todo/ui/ui.tsx` 的 `Select` | 已有待办表单为 authored;设置页枚举控件应复用或明确记录 Windows 原生变体,检查打开态 |
| 日期与时间 | `modules/todo/ui/ui.tsx` 的 DatePicker / TimePicker | 新建与编辑共享,键盘和弹层边界检查 |
| 表单 | `TaskEditor`、`SettingsView` 对应分区 | 待办 schema、设置字段逐项校验;错误与重试 |
| 弹窗与前景层 | `Modal`、`AiPanel`、`NotificationBell` | 层级、Escape、焦点返回和后景可读性 |
| Toast 与错误 | App toast、模块内错误区 | 短暂成功提示;错误持续到处理,不要只靠颜色 |
| 滚动条 | `src/shell.css` | 内容区与长列表各有明确滚动归属,不裁掉底部操作 |
| 待办 CRUD | `modules/todo/store.ts` 与待办 UI | 创建/编辑/完成/软删除/恢复及跨应用刷新 |

## Windows 与可访问性

- 默认窗口 1280×820、最小 1024×680;在两个尺寸下检查内容、侧栏、设置和弹层。无边框顶栏只有非交互区域可拖动;窗口控制均为真实按钮。
- 只用 `button` 执行动作、带 `href` 的链接执行导航;图标按钮有可访问名称。焦点可见,Enter/Space 可触发,中文输入法组合期间 Enter 不误发 AI 消息。
- 减少动态效果、高对比度模式与两套主题共享同一信息结构。标题、错误、待确认和完成态都用文字说明。
- 现阶段只支持简体中文 Windows 桌面;不由此推断其他地区市场规则。独立浏览器网页与文档内容不继承工作台的页面 token。

## 验收样例

至少核对:首次空数据、存在逾期与待确认、待办乐观锁冲突、AI 取消/应用失败、设置保存失败、无可用模型、二级导航收起、1024×680 窗口、通知与 AI 弹层打开、mist/sunny、键盘焦点与减少动态效果。`npm test` 与 `npm run verify` 只覆盖数据和构建,实际视觉与交互仍以隔离 Electron 窗口验证。
