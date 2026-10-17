## 游戏项目说明 · 内置只读 Markdown 弹窗 · 2026-10-17

范围：用户批准将「查看项目运行说明」改为 Ono 内只读弹窗，补齐本地读取、相对文档链接与返回导航。使用现有共享 Modal 和 Markdown 排版；项目菜单增加运行时也可访问的说明入口。

### 渲染与视觉核验

- 视觉所有者：`modules/todo/ui/ui.tsx` 的 Modal、`src/shell.css` 的三主题和 Markdown 排版；业务尺寸与字阶变体位于 `src/views/game.css`。此次复用已存在的阅读/弹窗体系，没有新生成效果稿或改动全局 token。
- [实际 README 弹窗](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-document/document-final.png)，1600×1000，mist，DPR=1；[试玩中打开说明](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-document/document-running.png)确认原生 dialog 正确覆盖真实游戏 guest。
- [项目内文档](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-document/document-linked.png)与[1024×680 窄窗](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-document/document-narrow-1024.png)已打开核验；顶部导航与关闭入口固定，正文内部滚动，代码/表格沿用共享横向溢出策略。
- 首轮发现共享 Markdown 选择器覆盖文档主标题/章节字阶，已在业务变体提高选择器优先级。最终使用 page/lead/body/support 层级；三主题保留原有材质、颜色、字距及 Phosphor 图标，无剩余 P0/P1/P2 视觉问题。

### 行为与边界验证

- `npm run verify` 通过；字阶修正后 `npm run build` 再次通过。相关 Markdown 渲染、链接解析及游戏服务测试 16/16 通过，包含 UTF-8/BOM、文件不被修改、大小限制、非法协议、路径穿越、符号链接逃逸及原 AI Markdown 链接策略不变。
- [原生验收记录](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-document/report.json)9/9 通过，renderer console errors/page exceptions 为0：真实 README 和表格/代码、相对文档与上一篇/运行说明、HTTP 打开调用、Escape 回焦、运行中打开保留 guest ID/网址/存档、中文文件名与章节、越界拒绝、安全清理、缺失文件返回与写入隔离夹具后重试成功。被读取的三个真实游戏文档前后 SHA256 相同。
- mist/cool/warm 的1280×820和窄窗1024×680均有原生截图；弹窗处于窗口内，阅读区独立滚动，Tab 焦点保留在共享 dialog 内。
- [严格静态审计](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-document/ui-audit.json)仍为8项其他视图的既有发现，新游戏说明代码无发现；官方 DESIGN lint 为0 errors、1条既有无YAML提示。不宣称全应用审计通过。
- Browser plugin not available，使用仓库 Playwright Electron 通道、隔离 appData 与独立文档夹具。HTTP 打开在主进程截获，确认实际传入地址，未操纵用户外部浏览器。当前只读正文支持文本、标题、代码、表格和文档链接；不载入嵌入图片或脚本。未修改真实游戏源码、安装版或用户档案，未打包发布。

final result: passed
