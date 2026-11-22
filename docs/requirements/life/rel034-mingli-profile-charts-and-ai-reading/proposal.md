# REL034 · 命例管理、八字紫微占星排盘与 AI 解读

适用产品为 ONOSAN，归属小工具。[本项进度与任务](../../README.md#小工具)

## 业务目标

用户能管理命例、查看排盘，并在相应助手对话中读取当前命例。

## 验收条件

- 选择或添加命例，查看该命例的排盘，再从当前命例发起解读。

## 交付进展

命例、排盘及隔离解读流程 · 2/2 项

## 实施资料

- [验收记录](qa.md)
- [八字历史方案](bazi-history.md)
- [占星解读](astro-reading.md)
- [任务](tasks.md)

## 使用与范围

既有资料范围为当前命理与历史算法/设计依据。


2026-11-14 已按用户最新选定的[方案一参考](../../../design/mingli-v1-2026-11-14/selected-reference.png)改为左侧命盘与大运主卡、右侧五行和神煞双卡；构建、回归及视觉检查见[当前验收记录](../../../../design-qa.md)。

2026-11-15 页头按后续确认稿改为左侧标题、竖线及三系统切换，右侧依次为命例选择、编辑、新建命例和 AI 解读；不足宽度时换行，长命例名称省略。盘面布局和命例业务保持原样，详见[视觉规范](../../../../DESIGN.md)及[验收记录](../../../../design-qa.md)。

## 方案与验收文字

- [bazi-history.md](bazi-history.md)
- [占星主题解读与右侧助手](astro-reading.md)
- [主题解读验收（2026-11-08）](qa-astro-reading-2026-11-08.md)

## 原型与依赖

- [bazi-glass.html](prototype/bazi-glass.html)
- [mingli-glass.html](prototype/mingli-glass.html)
- [LUNAR-JAVASCRIPT-LICENSE](prototype/vendor/LUNAR-JAVASCRIPT-LICENSE)
- [lunar.js](prototype/vendor/lunar.js)

## 设计参考与来源

- [mingli-workspace-card-2026-09-28.png](design/mingli-workspace-card-2026-09-28.png)
