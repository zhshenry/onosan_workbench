## 阅读库路径入口修复 · 2026-10-16

范围：修复已保存库路径后「从库导入」直接扫描、无法再输入路径的问题。每次先打开可编辑的路径确认框，再校验、关联和扫描，沿用既有勾选确认面板与单库数据结构；不添加多库或库内写入能力。

- 视觉与行为来源：用户提供的已关联空书单截图、现有阅读页面及共享 `Modal`/`form-body`。移除原路径输入行造成的孤立 CSS；新弹窗仅设置 540px 响应宽度和现有主题前景，不引入字体或颜色 token。
- [默认实机弹窗](C:/Users/henry/.codex/visualizations/2026/10/14/01a13b12-abb2-7811-a837-f485b142a6c3/reading-import-NwhkM9/mist-1280.png)、[窄窗](C:/Users/henry/.codex/visualizations/2026/10/14/01a13b12-abb2-7811-a837-f485b142a6c3/reading-import-NwhkM9/cool-1024.png)：真实 Electron 客户区截图，非效果图。已目视核对字体、间距、主题前景、路径字段、按钮文案和焦点。三主题 × 双尺寸均检查窗口边界、标签激活输入和 Escape；宽窗助手保持展开，窄窗沿用既有覆盖模式，先收起助手再打开导入。
- 先增加组件断言复现原问题，再修复。`npx tsx --test tests/reading.test.ts` 最终 12/12 通过，涵盖已有路径仍弹框、不提前扫描、取消、空值、无效库、配置保存失败保留输入及原勾选导入/删除/进度回归。
- `npm run verify` 通过：字阶、renderer/electron 类型检查及生产构建。实际窗口验收 [报告](C:/Users/henry/.codex/visualizations/2026/10/14/01a13b12-abb2-7811-a837-f485b142a6c3/reading-import-NwhkM9/report.json) 6/6 通过：已配置与未配置入口、错误重试、仅导入所选书目、去重、正常退出重启与三主题双尺寸。renderer/console error 为 0；合成库文件逐个 SHA256 前后一致。
- 实机发现 JSX autoFocus 与共享原生 dialog 打开顺序导致路径未稳定获焦。局部修正为弹窗打开后聚焦输入框，保留触发按钮的焦点恢复；未修改其他弹窗。最终实机验证打开后即可输入，Escape 返回「从库导入」。
- 严格静态审计仍为 9 项既有发现，按 file/ruleId/message 比较新增 0；[证据](C:/Users/henry/.codex/visualizations/2026/10/14/01a13b12-abb2-7811-a837-f485b142a6c3/reading-import-NwhkM9/static-audit.json)。使用本机缓存的官方 design.md CLI 检查 DESIGN.md：0 errors、1 条既有无 YAML 提示。
- 仅使用隔离数据与合成 Obsidian 库，没有读取或改动用户真实笔记；没有打包、发布或替换安装版。本轮未重复全量测试，既有 Windows symlink 权限问题不在本次范围。

本次导入修复范围无剩余 P0/P1/P2 问题。

final result: passed
