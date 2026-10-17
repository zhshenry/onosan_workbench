# OnO 自动化准备与 #13 复盘（dot 唤醒模式）

状态：2026-10-12 简化候选，主流程见[规范](../../operations/issue-workflow/README.md)，操作见[清单](../../operations/issue-workflow/templates/ONO-EXECUTION-CHECKLIST.md)。此前规范 PR #15 已于 09:01:35 UTC 合入，main 为 `673febb3ba2e24d17772092bc7d8956642574bee`；[main run 38227443016](https://github.com/zhshenry/onosan_workbench/actions/runs/38227443016) 于 09:08:52 UTC 成功。本次新的简化变更尚待准确提交的 PR/CI 验证及合入批准，不能沿用该旧成功。本轮已核实正式定时任务配置启用，#17/#18 已进入设计准备，尚非产品实施，也不代表端到端验收已完成。

## 1. 本轮真正走完了什么

以下为 2026-10-12 08:23 UTC 固定历史快照（不是当前 PR 状态）：当时 main `9e81ca7d01b9f60b2ba853591caed5d5dec55e00`；[PR #15](https://github.com/zhshenry/onosan_workbench/pull/15) 仍为 Draft/head `9fbc9129b907adbc75b2e04dd47a2ac8396140a7`、未合入。#15 正文中 main69c86ee 与“#13仍在方案修订”是旧快照，不能继续作为当前结果。该复盘修订替换了当时的过时叙述；本页保留固定记录，不修改原评论历史。

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

上述历史 main CI 在当时经 API 核实成功；以上具体测试数及逐图审阅引用当次报告，本段复盘未重跑测试/下载图片。临时主干artifact为11734840519，报告记到期2026-10-15 08:06 UTC；过期后标当前不可复核，不倒改历史通过。PNG未入Git、无额外备份。当时本单未发版、未删分支，#15/#16 尚未合入；#15 的后续变化见页首，不从该快照推断 #16 当前状态。

**真实和模拟的边界**：#13 的 GitHub 评论、设计附件、产品代码、Actions 运行、合入与关闭都是真实操作。旧通用核心只使用内存状态/模拟执行器，未成为 dot 工作入口；本次删除其代码、专用测试、policy fixture 和说明，[固定历史版本](https://github.com/zhshenry/onosan_workbench/blob/673febb3ba2e24d17772092bc7d8956642574bee/docs/ONO-WORKFLOW-CORE.md)仍可追溯。不能把“模拟核心”误说成产品流程是模拟的。

## 2. 目标优化：正常两关，异常才加问

1. 方案关：一次确认准确高保真/方案、产品范围和可连续执行的测试/普通回归/技术恢复边界。设计准备按已有任务授权进行，不新增辅助PR先merge门槛。
2. 最终关：一次确认准确head的“合入→实际main验证→满足交付/证据条件后关单”包。明确不包含发版、删分支、扩权限或新任务；失败停在既定边界。

#13 最终方案至关闭实际涉及五类用户表态：方案、保存范围追加、Linux旧问题追加、合入、实图内嵌豁免及关单；其中OK还需一次最小澄清。两个范围追加和证据例外是有意义边界，不能为“减少次数”省略；可以减少的是无图前置工程、跨入口问、重复问已授权步骤，以及最终请求没说清动作导致的往返。

| 发现 | 新规则/优化 | 实际边界 |
|---|---|---|
| 方案在Issue，合入又要求去PR | 全部产品决策留原Issue，PR只指向原始批准；历史无Issue的PR15保留原指定线程 | dot按原始讨论执行；文档不等于部署 |
| 长口令与裸命令矛盾 | 可复制短回复，绑定发言时唯一请求、完整目标；模糊OK不猜 | 人工已实践；dot核对唯一目标，不要求新解析器 |
| 同账号容易自审批 | 中文标识+准确返回ID日志用于排除；仍需独立可信来源，不把无标识当真人 | 来源不明停，不以旧core或自填字段证明真人 |
| 中断后复述旧状态 | 每次恢复fresh read、最后读取时间、先查未知操作回执 | dot每次恢复读取真实状态与回执 |
| 保存数量/toast掩盖失败 | 实际UI→有界读回业务字段/元数据→存储重载→重启 | #13专项已真实验证；不能泛推全产品 |
| 开发中才发现基线红 | 开工查基线；旧/新增失败分列；最小范围追加批准 | 人工核对；只读检查可先实施 |
| 上传盲试、无依据归因 | 本来源全链路预检、错误分类、未知结果先查、确认可恢复后最多补试一次 | 人工协议；通用上传适配未实现 |
| merge后再问是否关单 | 最终请求预列有条件关单，已批准包内直接完成；旧批准不追溯扩大 | dot按已批准包执行；先验证实际main |
| 重叠唤醒/重试可能重复副作用 | 一个协调者、一份简短state，核对revision/预期阶段、活动任务与回执；未知写入先查，不按时长抢锁 | 使用现有任务能力；旧内存模拟已移除，不冒充原子CAS |

## 3. 简化候选的能力清单

| 层次 | 内容 | 证据与边界 |
|---|---|---|
| 当前候选 workflow | Windows 全量 test/verify、真实 NSIS 安装、UI/保存/重启、actionlint；PR opened/reopened/synchronize、main push、手动验收 | [windows-cloud-pilot.yml](../../../.github/workflows/windows-cloud-pilot.yml)；无 issue 接单或 schedule，不等于 main 保护 |
| 移除 Linux 的条件 | 同一准确提交上 Windows 真实文件 symlink 与父目录 junction 反例实际通过 | 不能创建或失败就保留最小 Linux 兜底；不跳过、不减守卫、不改安全设置；精确提交 CI 待核 |
| 证据保护 | 白名单/19 MB 原始预算、每 run 一个上传点、3 天保留；同 run 重跑替换证据 | [pilot-artifacts.mjs](../../../tooling/pilot-artifacts.mjs)；不是任务锁，不能把旧 attempt 证据当新结果 |
| PNG 库 | [evidence.mjs](../../../tooling/ono/evidence.mjs) 仅保留独立 `decodePng` | 供现存 PNG 使用方/回归测试调用，不再含旧核心审批或验收枚举 |
| 已退役试点入口 | 附件/原型两个手动 YAML 删除；脚本及其安全回归保留 | [附件历史说明](attachment-test.md)、[原型历史说明](prototype-render-pilot.md)；不提供日常 dispatch，不渲染任意 PR |
| 已退役模拟核心 | core、专用模拟测试、policy fixture、核心说明删除 | [固定历史源码](https://github.com/zhshenry/onosan_workbench/blob/673febb3ba2e24d17772092bc7d8956642574bee/tooling/ono/core.mjs)；不迁 pin、不保留旧六项检查前置 |
| 实际人工历史 | 原 Issue 短回复/范围批准、来源核对、双平台/视觉判断、合后验证、本单例外 | #13 闭环；不能证明每次来源或未来 CI 都可靠 |

保留脚本 [publish.mjs](../../../tooling/ono/render-pilot/publish.mjs) 与 [attachment-test.mjs](../../../tooling/ono/attachment-test.mjs) 仍输出旧英文 `[OnO]`，只作历史/安全回归代码，不是当前 dot 评论模板或已启用上传器；未来重新接入需明确范围和审阅，不能放松 main/SHA/身份/凭据边界。API 的 base 字段与实际 checkout 父提交可能不同，验收仍须同时保留并核对，不能只凭一个字段声称测试树准确。

## 4. 当前方式：正式定时任务唤醒 dot

只保留一个正式自动任务，职责是按用户已批准的时间/范围唤醒dot；由dot读取规范、原始Issue讨论、PR/CI和唯一简短state，使用现有工具完成已授权工作。不在仓库另造调度器、事件总线或分布式执行服务；启用情况必须以任务工具读回为准。

- 单协调者：有在途任务先继续该任务；重复唤醒只核查/恢复，不再分配第二个写入执行者。候选有多单就排队，不按陈旧锁时间抢占。
- 简短state：只记当前Issue/阶段、revision、有效批准及目标、最后读取时间、下一步、活动执行者和未知操作/结果ID。更新前核对预期revision/阶段，能用已有CAS就用；无原子CAS则单写者串行、写后核查，冲突即停，不宣称自制了分布式保证。
- 每次唤醒：先fresh read，判断来源/批准/版本是否仍有效；已完成closed/completed不重做，用户撤回或提前关单停相应动作。结果未知先查远端回执，不盲重试；无变化不刷消息。
- 正常两关：准确方案批准后连续实施/测试；最终准确head合入收尾包获批后执行。设计、测试、普通修复和恢复是工程步骤，不新增逐模块审批。超范围、新权限/费用/风险、证据例外仍在边界问，来源不明仍停，不把无标识或模型推断当真人证明。
- 真实验收继续使用完整 Windows Actions（条件未满足则保留最小 Linux 兜底）与人工图/实际操作核对；定时唤醒不取代CI，也不自动生成合入/发布授权。无需先补自动审批解析器、迁core pin或部署独立可信适配器，dot仍须通过现有可信工具和上下文核实具体来源。

旧模拟核心已清理，`evidence.mjs` 只保留 PNG 解码器；PR #20 的只读原型与新本地协调器不纳入本次发布/合入，不继续建设第二套执行程序，也不据此声称它们的当前远端状态。未来如明确要求独立程序运行器，需另定范围并审阅；不能把这些研究要求套到当前 dot 流程上。

验收当前方式：确认只有一个正式任务和一个当前协调者；同一对象重复唤醒不重复评论/上传/合入；暂停恢复读最新state和远端结果；准确批准可推进、撤回/版本变化会停止；现有真实CI和最终交付仍完整。涉及未来动作的权限必须在任务/方案中明确覆盖，简化架构不扩大授权。

## 5. 当前决定与仍需确定项

- 当前已明确方向：正常两关、Issue集中沟通，一个正式定时任务唤醒dot按规范完成授权任务；调度本身不代表每单已批准，配置/运行状态以任务工具核实。
- 本轮按已批准范围合并为一条简化 PR；PR #15 已合入的规范作为起点，新的精确 head 须重新审阅/验收，合入仍需批准。
- 原先“先建设四阶段程序系统”的路线收敛为上述dot执行模式；已确认的调度配置不重复询问，不自行创建第二份任务。PR20和新本地协调器不纳入本次合入/发布，也不继续堆代码。
- 每次写入仍须核实用户来源、范围/准确版本、预期state与远端当前结果；真实不确定时停并澄清。这里要求具体事实可靠，不要求先造耐久数据库、分布式fencing或程序审批器。
- 证据预算/3天、不备份与默认真实图要求保持；#13本单例外不变成长期开关。分支删除和发布继续不在默认合入收尾包内。

### 历史只读原型快照（2026-10-12 08:36 UTC）

第一期只读原型已在独立本地分支实现，报告为29项专项测试及真实连接器20次GET快照试跑，能区分#13 completed、#19 merged与main CI成功；独立审阅和完整本地回归仍在核对。此为本地实现进展，尚未发布、未完成该新实现的远端CI验证，未设置排程、未放开外部写入；不能把它追溯记入上述main9e81ca7已有能力。这是当时快照，不代表 PR #20 或本地协调器当前已部署，也不成为本次流程前置。
