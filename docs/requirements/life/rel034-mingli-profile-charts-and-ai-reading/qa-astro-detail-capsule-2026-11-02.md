# 占星星体详情卡片 · 2026-11-02

## 范围与实现

用户确认的是点击星体后、表格下方出现的详情。仅「行星」页签的星体详情移出表格卡片,成为等宽的独立玻璃卡片;圆角 36px、间距 12px。星体资料、宫位说明、相关相位和取消入口保持原内容与行为,不修改计算、时区、数据或其他页签。

`AstroDetails.tsx` 复用原详情组件及选择状态,`bazi.css` 用右栏容器约束桌面两卡总高度,窄窗取消等高约束并纵向排列。没有增加全局样式或新的视觉颜色。

## 验证与证据

- `npm run verify` 通过:字阶检查、前后端 TypeScript、生产构建。最终间距与圆角调整后再次 `npm run build` 通过。
- `node --import tsx --test tests/bazi-astro-house.test.ts`:13 项既有回归通过。
- 隔离 Electron 使用生产构建、独立 `WORKBENCH_TEST_DATA_DIR` 和 `APPDATA`,真实示例排盘;无用户数据修改或模型请求。`report.json` 为 `passed: true`,页面错误为空。
- 1488×1056 下,右栏与左盘均高 796.23px,两卡均宽 426.53px、间隔 12px。选中月亮与太阳、取消和再次选择均保持星盘高度;月亮详情正确显示天蝎 4°37′、第 4 宫。
- 键盘 Enter 选择、取消收起、盘面高亮、相关相位「查看全部」筛选、解读页签原内联详情均正常。
- mist/cool/warm 三主题保留玻璃表面,刑/冲实测颜色分别为 `#a5413b` / `#9c433e` / `#9b3f38`。已人工查看原生截图。
- 1024×680、200% 缩放和 AI 侧栏下两卡纵向排列,详情完整可达,无页面或卡片横向溢出。

本机证据目录:

`C:/Users/henry/.codex/visualizations/2026/10/17/01a148bd-f549-7572-8f83-877199ff6d5e/astro-detail-capsule-20261102/`

`check.mjs` / `report.json` 为交互脚本与几何记录,`regression.log` 为测试记录;`final.png`、`mist-moon.png`、`cool-moon.png`、`warm-moon.png`、`sun.png`、`narrow.png`、`zoom-200.png`、`ai-sidebar.png` 为实际 Electron 截图。

尝试运行 premium skill 的严格静态审计,环境返回 `No installed Python found!`;该审计未执行,不计作通过。未打包、发布或推送。
