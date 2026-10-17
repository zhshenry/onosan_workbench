# AI 对象跟随与只读参考验收

日期：2026-09-30。实现已接入正式代码。

## 行为

- 同工作台切换博文或命例保留对话和未发送输入；下一轮默认跟随编辑对象，输入区明确显示对象及盘型。
- 可固定对象，固定状态在本次应用运行中按对话保留；取消后恢复跟随。
- 添加参考使用现有 Modal 与原生复选框，最多选择 8 个同类对象，主对象不重复作为参考。发送记录保存参考列表，打开对话恢复最近一轮选择。
- `read_reference` 只读取本轮所选参考的最新内容。参考博文提供前 10000 字，参考命例按自身 ID 取对应盘型与笔记。未选对象与其他工作台的对象不能读取。
- 改写工具和应用操作仍只写主博文；不同博文的待确认建议分别保留，应用按钮标明目标。生成过程中导航不会改变正在执行请求的对象。
- 命理解读按钮发送短问题；后端补齐盘面及最新笔记，按钮先保存尚未落库的笔记。
- 空编辑页不继续读取上一对象或提供上一对象的工具。

## 验证

- `npm run check:typography`、`npm run typecheck`、`npm run build` 通过。
- `node --import tsx --test tests/ai-workbench-navigation.test.ts tests/ai-scope.test.ts tests/bazi.test.ts`：23 / 23 通过。
- 隔离 Electron 使用临时数据目录和本地模拟 OpenAI SSE 模型，走真实 IPC、Pi Agent、读取工具及应用链路。最终运行 16 次模型 HTTP 请求，renderer exception 为 0。
- 真实链路验证：A / B 沿用同一对话；固定与取消固定；生成中切页；同时保留两篇建议；读取参考 A 后只写 B；拒绝读取未选真实命例和跨工作台对象；参考移除后撤下读取工具；命例笔记保存与按 ID 隔离；盘型一致；AI 快捷指令携带参考。
- 博客、命理分别验证 mist / cool / warm 与 1280×820 / 1024×680，共 12 种页面布局：无横向溢出，对象提示完整可见，输入区保留。
- 1024×680 参考弹窗复选框约 16px，名称和出生信息完整，列表无横向溢出；Escape 只关闭弹窗，助手保持展开。
- 截图检查发现通用表单样式使复选框撑满整行，已通过弹窗局部样式修正并重新截图确认。

## 证据

- [博客与参考对象](../evidence/ai-follow-blog-mist-1280.png)
- [命理窄窗](../evidence/ai-follow-bazi-warm-1024.png)
- [参考选择弹窗](../evidence/ai-follow-reference-dialog-1024.png)
- [最终链路与布局测量](../evidence/ai-follow-reference-checks.json)
- [静态检查原始结果](../evidence/ai-follow-audit.json)

静态检查仍报两项原有检测限制：范围信息按钮由 CSS 的 hover / focus-visible 显示 tooltip，检查器未识别为动作；输入框的 `resize: none` 由共享 CSS 提供，检查器未解析该规则。实际 Electron 已验证键盘焦点会显示 tooltip，12 种页面布局的输入框计算样式均为 `resize: none`。没有将静态检查描述为零项通过。
