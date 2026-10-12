# OnO 自动化准备与 #13 复盘（v1.3 文档候选）

状态：2026-10-12 文档修订候选，随 Draft PR #15 审阅、尚未合入、未启动调度；是后续实现的范围与验收建议，不是执行许可。主流程见[规范](ONO-ISSUE-WORKFLOW.md)，操作见[清单](templates/ONO-EXECUTION-CHECKLIST.md)。

## 1. 本轮真正走完了什么

复盘读取基准：2026-10-12 08:23 UTC，main `9e81ca7d01b9f60b2ba853591caed5d5dec55e00`；[PR #15](https://github.com/zhshenry/onosan_workbench/pull/15) 仍为 Draft/head `9fbc9129b907adbc75b2e04dd47a2ac8396140a7`、未合入。#15 正文中 main69c86ee 与“#13仍在方案修订”是旧快照，不能继续作为当前结果。本候选替换这一过时叙述，但不修改原评论历史。

| 阶段 | 可核实记录 | 复盘结论 |
|---|---|---|
| 设计迭代 | [v1反馈](https://github.com/zhshenry/onosan_workbench/issues/13#issuecomment-6110434327)、[v2方案及原生设计图](https://github.com/zhshenry/onosan_workbench/issues/13#issuecomment-6111054194) | 下拉直选替代输入；独立高保真可行，不需要先实现产品或合入设计PR |
| 方案批准 | [原始评论6118993667](https://github.com/zhshenry/onosan_workbench/issues/13#issuecomment-6118993667)，2026-10-12 06:28:40Z，原文 `APPROVE` | 当时唯一待审v2结合人工来源核对；不能据此声称自动短命令/同账号身份适配已存在 |
| 范围外保存修复 | [最小范围请求](https://github.com/zhshenry/onosan_workbench/issues/13#issuecomment-6119459292)、[批准6119530215](https://github.com/zhshenry/onosan_workbench/issues/13#issuecomment-6119530215)，07:13:18Z | 真实编辑保存暴露createdAt输入不兼容；追加批准，不借年份方案扩大存储/schema范围 |
| Linux基线修复 | [修复与双平台报告](https://github.com/zhshenry/onosan_workbench/issues/13#issuecomment-6119970642) | 原有reading路径语义错误另获用户追加范围；原断言保留，最小跨平台修复，不把旧红归咎新功能或忽略 |
| 合入澄清 | [OK 6120069598](https://github.com/zhshenry/onosan_workbench/issues/13#issuecomment-6120069598)、[明确请求6120113150](https://github.com/zhshenry/onosan_workbench/issues/13#issuecomment-6120113150) | 前一报告只请留意见，OK不能直接当合入；最终请求应提前讲清唯一动作，避免来回 |
| 准确合入批准 | [原始6120126123](https://github.com/zhshenry/onosan_workbench/issues/13#issuecomment-6120126123)，07:56:50Z，原文 `同意合入 PR #19，版本 e74922f` | 绑定完整head `e74922fc2aff8b03bacce6efc20f8fba8246ecd7`，未把短SHA动态套新head |
| 合入及主干验收 | [PR19](https://github.com/zhshenry/onosan_workbench/pull/19)、[合后报告](https://github.com/zhshenry/onosan_workbench/issues/13#issuecomment-6120306498)、[run38221151500](https://github.com/zhshenry/onosan_workbench/actions/runs/38221151500) | 合入main9e81ca7；run attempt1 completed/success。报告记录Linux461通过/2既有跳过、Windows462通过/1既有跳过，真实安装与UI/重启25/25 |
| 实图缺口与关单 | [合后报告及临时证据包](https://github.com/zhshenry/onosan_workbench/issues/13#issuecomment-6120306498)、[Issue13 closed/completed](https://github.com/zhshenry/onosan_workbench/issues/13) | 真实图原生内嵌未完成；用户在本次会话08:19:55Z明确本单豁免并要求关闭，08:20:32Z实际关闭。不是GitHub批准评论，不伪造ID，也不成为长期附图豁免 |

main CI本轮API已重新核实成功；以上具体测试数及逐图审阅引用当次报告，本次未重跑测试/下载图片。临时主干artifact为11734840519，报告记到期2026-10-15 08:06 UTC；过期后标当前不可复核，不倒改历史通过。PNG未入Git、无额外备份。本单未发版、未删分支；#15/#16未合入。

**真实和模拟的边界**：#13 的GitHub评论、设计附件、产品代码、Actions运行、合入与关闭都是真实操作。只有 `tooling/ono/core.mjs` 的未来通用调度核心仍以MemoryStore/SimulatedExecutor测试，尚未连接真实审批/持久状态/任务写入器。不能把“模拟核心”误说成这次产品流程是模拟的。

## 2. 目标优化：正常两关，异常才加问

1. 方案关：一次确认准确高保真/方案、产品范围和可连续执行的测试/普通回归/技术恢复边界。设计准备按已有任务授权进行，不新增辅助PR先merge门槛。
2. 最终关：一次确认准确head的“合入→实际main验证→满足交付/证据条件后关单”包。明确不包含发版、删分支、扩权限或新任务；失败停在既定边界。

#13 最终方案至关闭实际涉及五类用户表态：方案、保存范围追加、Linux旧问题追加、合入、实图内嵌豁免及关单；其中OK还需一次最小澄清。两个范围追加和证据例外是有意义边界，不能为“减少次数”省略；可以减少的是无图前置工程、跨入口问、重复问已授权步骤，以及最终请求没说清动作导致的往返。

| 发现 | 新规则/优化 | 是否已自动化 |
|---|---|---|
| 方案在Issue，合入又要求去PR | 全部产品决策留原Issue，PR只指向原始批准；历史无Issue的PR15保留原指定线程 | 人工协议；未实现 |
| 长口令与裸命令矛盾 | 可复制短回复，绑定发言时唯一请求、完整目标；模糊OK不猜 | 人工已实践；新解析器未实现 |
| 同账号容易自审批 | 中文标识+准确返回ID日志用于排除；仍需独立可信来源，不把无标识当真人 | 旧core默认拒绝；真实适配未实现 |
| 中断后复述旧状态 | 每次恢复fresh read、最后读取时间、先查未知操作回执 | 人工要求；core仅模拟恢复 |
| 保存数量/toast掩盖失败 | 实际UI→有界读回业务字段/元数据→存储重载→重启 | #13专项已真实验证；不能泛推全产品 |
| 开发中才发现基线红 | 开工查基线；旧/新增失败分列；最小范围追加批准 | 人工核对；只读检查可先实施 |
| 上传盲试、无依据归因 | 本来源全链路预检、错误分类、未知结果先查、确认可恢复后最多补试一次 | 人工协议；通用上传适配未实现 |
| merge后再问是否关单 | 最终请求预列有条件关单，已批准包内直接完成；旧批准不追溯扩大 | 人工模板；真实自动收尾未实现 |
| 锁过期/重试可能重复副作用 | 一次一单、持久操作日志、CAS/fencing、暂停恢复先查结果，不按时长抢锁 | 内存模拟存在；生产存储/写端未实现 |

## 3. 现有能力清单（固定main9e81ca7）

| 层次 | 已有内容 | 证据与缺口 |
|---|---|---|
| 实际workflow | Linux/Windows测试、verify、真实NSIS安装/专项；PR opened/reopened/synchronize、main push、手动触发 | [windows-cloud-pilot.yml](../.github/workflows/windows-cloud-pilot.yml)；没有issue接单或schedule，不等于main保护 |
| 实际workflow | 证据白名单/19MB原始预算、一个上传点、3天保留；相同run重跑替换证据 | [pilot-artifacts.mjs](../tooling/pilot-artifacts.mjs)及CI；不是任务锁或跨dispatch幂等 |
| 手动图片试点 | main/精确SHA、仓库身份、首attempt、源/图片绑定、隔离渲染与受控发布 | [renderer workflow](../.github/workflows/ono-prototype-render.yml)、[附件workflow](../.github/workflows/ono-attachment-test.yml)；实际手动触发已用过，不能写“触发尚未接通”；不能渲染任意PR |
| 代码但仅库/模拟 | 固定旧pin、旧命令/verifyHuman默认拒绝、证据guard、模拟租约/修订号/消费/恢复/单开发槽 | [core.mjs](../tooling/ono/core.mjs)、[evidence.mjs](../tooling/ono/evidence.mjs)；MemoryStore非耐久存储，SimulatedExecutor不写GitHub |
| 人工实践 | 原Issue短回复/范围批准、来源核对、双平台/视觉判断、合后验证、单次例外 | #13闭环；不等于无人值守作者认证或完整状态机 |
| 尚未实现 | 新协议可信来源、短命令绑定、新标识适配、持久任务状态/锁/操作日志、真实证据reader/visual验证、实际任务写入器、pin迁移 | 当前核心说明明确未接；功能存在须以代码/测试/真实试点分别证明 |

具体兼容债务：
- core `approvalCommand/checkApproval` 仍是旧 `/ono approve …` 和位置约束，显式排旧 `[OnO]`；没有新中文协议、原Issue合入、发言时短命令绑定。严格旧命令与默认 `verifyHuman=false` 仍使缺验证失败关闭，不能因新标识未接就声称已可自审批。
- [publish.mjs](../tooling/ono/render-pilot/publish.mjs) 与 [attachment-test.mjs](../tooling/ono/attachment-test.mjs) 输出英文 `[OnO]`；YAML输入说明还写旧主聊天批准。更新文档不自动修改这些脚本。后续代码修订须同步中文标识、返回ID审计与当前批准语义，不能放松原main/SHA/身份/凭据控制。
- core `checkAcceptance` 依赖可信expected/reader，支持的PNG格式狭窄，真实附件读取/来源/用户可见性/视觉适配未接。人工单次豁免不能伪造passed或always-true适配器。
- API的base字段与实际checkout父提交可能不一致，#15曾出现过；只读报告应同时保留并给出不一致，不能仅靠单字段声称测试树准确。

## 4. 分期自动化：每期先验收再单独启用

### A. 只读巡检（第一期，风险最低）

范围：先以手动调用读取本仓库Issue/PR/comment/CI与版本差异，产出本地报告和当前阻碍；不发评论、不上传、不改标签/分支/PR、不合入/关闭、不消费批准、不设排程。候选批准只能标“待人工来源核验”，不能自动判可执行。

前置：固定读取范围/规范版本、最小只读权限、最后读取时间、分页/错误处理、稳定输出；不存凭据或全量无关内容。完成/提前终止分开，closed/completed闭环为完成；无变化不通知。状态新鲜度、head/base/attempt漂移、自发/引用排除、旧artifact到期须可报告。

验收：fixture正反例＋只读真实快照一致；权限不足/分页不全/来源不明明确unverified；新旧CI/证据不混用；读取不触发任何写API。退出点：给人工可用报告，不自动迈入下一期。调度频率/通知渠道另定，默认手动。

### B. 草案与设计准备

范围：从只读结果生成本地方案/评论草稿、独立高保真准备建议和准确请求包；仍无产品实施/合入。若要自动发Issue评论或公开上传，先限定受众、目的、图片/内容范围和确认方式，不从本地草稿许可推定外发。

工程前置可在此期另批：只读审批/版本/证据检查器、耐久状态原型和反例测试；明确 `verifyHuman` 可信来源如何建立、同账号剩余风险与失败关闭。自发ledger只是排除资料，不是充分认证。来源无法确认时保持只读/草稿阻塞，需先建立可信批准来源或由用户自行执行；OnO改用手动操作也不能绕过来源核验，不为了“自动化”放松安全。

验收：唯一目标冻结/短命令解析、scope包、引用/自身/未标记代理/缺日志/编辑删除/撤回/乱序/多待批目标全拒绝反例；图的来源/可见性与版本一致，文档不声称运行器支持未合入source。新权限/存储/费用单独审阅。

### C. 经审批实施（受控单任务写入）

仅在可信来源、持久状态/CAS、单任务槽、操作日志、写端fencing、幂等与恢复均经批准验证后，接通具体实施执行器。只消费明确当前方案/范围包；新风险停问，授权内连续测试修复。完成后才提交产品PR，不能以调度标签代替批准。

验收：规范读取失败、缺图、源不明、并发、失锁、旧执行者复活、崩溃、未知API结果、取消/重开、重复评论/上传/PR均有失败关闭或查询恢复测试；先隔离试点，不直接全仓接单。core pin迁移和正式启用分别审阅，旧模拟测试不够。

### D. 受控合入收尾（仍由用户最终批准）

加入准确head合入收尾包，重读批准与最新base/测试树、expected-head条件写入、真实main验证、按包内条件关单；不自动批准自己、不自动发版/删分支。base漂移重验并判断范围/风险变化。已关闭completed只读识别完成，不重放关闭。

验收：新head撤销旧批准、base/attempt/证据漂移、发布与合入不混用、主干失败不关单、未授权关单不执行、单次豁免限本单、写入超时查回执、恢复不重复消费。分支保护/required checks若需配置另请批准，不能声称已有。

## 5. 当前决定与仍需确定项

- 当前已明确方向：优化普通任务两关、保持Issue集中沟通，接下来可进入第一期只读实现；这不等于已运行、已定时或已放开写权限。
- 本轮用户已同意更新目标/规范并开始自动化准备；规范沿用现有PR15更新，不再询问是否创建另一条规范PR。新head须重新审阅/验收，旧CI不能沿用；合入仍需批准。
- 第一期开工方案需明确读取对象/输出位置与测试；默认手动、本地报告、零外部写入。是否定时、频率和只报变化的通知范围留到启用时一次确认，不继承“每小时”。
- 未来写入前必须解决可信真人来源、耐久存储/成本/权限、附图交付可靠性与恢复隔离；没解决只停在只读/草稿，不假称无人值守可用。
- 证据预算/3天、不备份与默认真实图要求保持；#13本单例外不变成长期开关。分支删除和发布继续不在默认合入收尾包内。

### 第一期进展注记（2026-10-12 08:36 UTC）

第一期只读原型已在独立本地分支实现，报告为29项专项测试及真实连接器20次GET快照试跑，能区分#13 completed、#19 merged与main CI成功；独立审阅和完整本地回归仍在核对。此为本地实现进展，尚未发布、未完成该新实现的远端CI验证，未设置排程、未放开外部写入；不能把它追溯记入上述main9e81ca7已有能力。最终测试数、版本和发布状态以后续该实现的固定记录为准。
