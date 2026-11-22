# 灵动岛与 AI 用量验收记录

## 验证入口

运行 `npm run test:island` 会先构建，再启动隔离 Electron 数据目录，生成截图和 `artifacts/island-qa-*/report.json`；不会使用真实任务库或账户。存储、原生窗口和额度模拟测试分别在 `tests/island-store.test.ts`、`tests/desktop-island.test.ts`、`tests/island-quotas.test.ts`。

本机确认稿位于 `C:/Users/henry/.codex/visualizations/2026/10/17/01a148bd-f549-7572-8f83-877199ff6d5e/ono-island-design-20261104/`；`设计方案.md`、`设计索引.md` 与同目录配图仅作为视觉及交互来源。具体实测、证据和未覆盖项见 [验收记录](qa-2026-11-04.md)。
