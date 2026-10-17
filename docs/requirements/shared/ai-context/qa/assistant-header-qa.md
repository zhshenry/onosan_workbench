# AI 助手两行头部验证

2026-09-29：按已确认效果图调整头部，保留真实会话标题和现有聊天交互。

- `npm run check:typography`、`npm run typecheck` 通过。构建首次受沙箱 `spawn EPERM` 限制，沙箱外 `npm run build` 通过。
- `npm test`：75/77 通过；`tests/todo-store.test.ts` 第 270、277 行的待办用例缺少日程 `endAt`，触发现有校验，与此次布局修改无关。
- 隔离 Electron 实例验证：mist / cool / warm；窗口 1280×820、1024×680；面板宽 380 / 340 / 480px。会话下拉与触发按钮左侧对齐、间隔 4px，菜单不超出面板。搜索自动聚焦，Escape 关闭并恢复触发按钮焦点，范围图标键盘聚焦显示说明。
- 长标题及长对象名使用临时 DOM 文字检查，不写入真实会话。第二行保持 40px，无重叠、溢出或换行。几何记录见 `../evidence/assistant-header-checks.json`；截图见 `../evidence/assistant-header-*-closed.png`、`../evidence/assistant-header-*-open.png`、`../evidence/assistant-header-*-long-title.png`。
- 静态技能审计仍报告两项既有误报：范围图标无 click handler（产品按约定以 hover/focus 展示 tooltip，运行时已验证）；textarea 未检测到行内 resize-none（`src/shell.css` 的 `.ai-compose textarea` 已有 `resize: none`）。不为静态规则加入无作用回调或重复样式。原始输出见 `../evidence/assistant-header-audit.json`。
- DESIGN.md 的离线格式检查未运行成功：本机没有缓存 `@google/design.md`（ENOTCACHED）。本次仅同步现有中文布局说明，未新增依赖或改动主题 token。

截图为隔离配置中的空会话，不表示生产模型配置或用户会话内容。
