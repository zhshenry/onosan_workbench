# 后续去重、压缩与旧截图工具归档

日期：2026-10-17。用户批准按上一轮建议执行，并明确要求不动 .claude/ 与 .zcode/。本轮不提交、推送或发布；原有未提交开发改动继续保留。

## 已执行

| 项目 | 处理 | 文件字节变化 |
|---|---|---|
| 仓库外 baseline-images/ 的五份备份 | 删除与需求证据 SHA256 完全相同的副本，保留需求原件；其余五张未确认重复的备份保留 | 减少 3,106,607 字节 |
| 两份重复 report.json | 保留相同内容的完整截图轮次报告，删除仅有报告的重复目录 | 减少 9,832 字节 |
| repo-cleanup-inventory.json | 改为同目录 repo-cleanup-inventory.json.gz；先解压并复核原始 SHA256，再删除未压缩文件 | 9,547,789 → 738,811 字节，减少 8,808,978 字节 |
| 三个旧截图脚本 | 退出 tooling/ 根目录，原字节迁入 tooling/qa/archive/legacy-screenshots/，扩展名为 .mjs.txt | 内容不变，属于归档，不计空间节省 |
| 两个空测试目录 | 仅在删除重复报告后检查确为空，再移除目录 | 不计文件字节节省 |

删除和压缩的文件合计减少 11,925,417 字节，约 11.37 MiB。新增本轮哈希基线、路径映射及说明另占空间，不能把此数称为整块磁盘的净节省。

### 重复截图映射

副本原目录：C:/Users/henry/.codex/visualizations/2026/09/30/01a0f366-827d-7781-8e90-b3ef4c1fb9a7/baseline-images/。

| 删除的备份 | 保留的需求原件 |
|---|---|
| a.png | [workbench-shell/evidence/a.png](../../requirements/shared/workbench-shell/evidence/a.png) |
| b.png | [workbench-shell/evidence/b.png](../../requirements/shared/workbench-shell/evidence/b.png) |
| bazi.png | [mingli/evidence/bazi.png](../../requirements/life/mingli/evidence/bazi.png) |
| profile-form-a-section.png | [profile/evidence/profile-form-a-section.png](../../requirements/settings/profile/evidence/profile-form-a-section.png) |
| settings-form-c-workbench.png | [preferences/evidence/settings-form-c-workbench.png](../../requirements/settings/preferences/evidence/settings-form-c-workbench.png) |

旧 release-scope.json 等历史清单保留原始快照，baseline-images/README.md 和本页提供当前保留位置，不改写历史记录。

### 重复报告映射

| 删除的报告 | 保留的相同报告 |
|---|---|
| test-results/ai-activity-1792211453546/report.json | [ai-activity-1792211578929/report.json](../../../test-results/ai-activity-1792211578929/report.json) |
| test-results/ai-activity-1792221129044/report.json | [ai-activity-1792221248964/report.json](../../../test-results/ai-activity-1792221248964/report.json) |

ai-activity-1792214123061/report.json 虽也有相同副本，但 release-v1.0.0/activity-pilot.log 引用了该轮次，仍保留该路径。三个失败轮次的诊断报告及两轮被 QA 引用的完整历史截图均保留。

### 工具归档与压缩资料

- 三个旧工具的完整映射、隔离局限与复用条件见 [归档说明](../../../tooling/qa/archive/legacy-screenshots/README.md)。不把旧脚本原注释中的调用命令作为当前入口。
- 压缩清单位于 C:/Users/henry/.codex/visualizations/2026/09/30/01a0f366-827d-7781-8e90-b3ef4c1fb9a7/repo-cleanup-inventory.json.gz，使用支持 gzip 的工具可还原原始 JSON；未发现现存读取程序依赖未压缩路径。历史审计生成脚本仍可重新生成新的未压缩清单。
- 解压后原始 SHA256：369ef5b277432b98ba8a02ca5afb9ac882a8dac8f353a460128a69ab15959d79。
- 本轮逐文件计划、迁移前哈希基线、执行结果和最终核验放在上述外部资料目录的 followup-cleanup-20261017/。

## 明确保留

- .claude/ 与 .zcode/ 全部保留，不移动、不去重、不修改配置。
- 三阶段恢复 ZIP 合计 14,068,548 字节。当前仍有未提交开发改动，尚未满足上一轮建议中“形成可恢复提交后再处理”的条件，因此继续保留。
- dist/ 与 dist-electron/ 合计 22,252,256 字节。保留已恢复的 npm start 构建入口；本轮无需重新构建。
- node_modules/、.git/、需求正文、原型、设计参考和仍有引用的验收证据保留。
- 已安装程序、应用账号配置、个人业务数据均不在本轮操作范围内。

## 核验范围

删除前逐项核对目标在指定仓库或本任务外部资料目录内，无链接或目录联接；重复文件与保留原件的 SHA256 一致。压缩完成后先验证还原字节哈希。归档脚本按原字节保存，只做语法检查，不执行历史截图、模型、浏览器、安装或更新验收。最终保留文件和本地 Markdown 链接核验结果记录在 followup-cleanup-20261017/final-verification.json。

最终核验通过：763 个其他仓库文件、187 个其他外部资料文件哈希不变，其中 .claude/ 与 .zcode/ 的 133 个文件全部不变；七个保留原件、三个归档脚本哈希一致。三个脚本通过静态语法检查，962 处本地 Markdown 链接无缺失，变更范围内 git diff --check 通过。Git HEAD 不变，暂存区为空。
