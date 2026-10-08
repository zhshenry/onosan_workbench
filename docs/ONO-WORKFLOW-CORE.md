# OnO 流程检查核心 core-v1

关联 [issue #3](https://github.com/zhshenry/onosan_workbench/issues/3)；用户在主对话已批准本次无新增服务权限/费用的实现范围，方案已落 issue 的 `[OnO]` comment。该代理评论不是未来运行器可消费的人工批准。规范基线为 [1fbb152 的工作流程](https://github.com/zhshenry/onosan_workbench/blob/1fbb152818b02e6a7163e420dfc7725c955c3339/docs/ONO-ISSUE-WORKFLOW.md)。

## 文档修订与固定规范的边界

当前[人工流程文档](ONO-ISSUE-WORKFLOW.md) 已提出 v1.1 修订：OnO 使用 dot 自带云电脑开发/协调，GitHub Actions Linux/Windows 测试验收；不依赖用户本地，不自行切换保存 Codex 云环境；图片采用 GitHub 原生附件，方案/comment 复用同一 URL，不额外备份。

本次不修改 `core.mjs` 的 `POLICY` commit/hash，也不改生产检查逻辑。core-v1 仍只接受上述固定 v1 内容。测试读取 `tests/fixtures/ono-policy-v1-1fbb152.txt` 的历史字节，保留篡改拒绝并验证当前文档不能冒充旧 pin；该夹具仅用于旧版兼容测试，不是当前工作指令。v1.1 的 runtime pin 迁移、适配器验证与启用尚未完成，须后续单独审阅验证；此 PR 不能宣称自动运行器已就绪。

## 目标、范围和非目标

为未来运行器提供可测试的失败关闭核心：固定规范读取、明确审批绑定、单次消费、状态前置条件、模拟租约与操作恢复，以及设计/验收证据检查。代码位于 [core.mjs](../tooling/ono/core.mjs)、[evidence.mjs](../tooling/ono/evidence.mjs)，回归用例位于 [ono-workflow.test.ts](../tests/ono-workflow.test.ts)。

本次没有产品 UI 改动，不需要产品高保真图。测试生成的 1×1 PNG 与测试视觉证明仅为夹具，不是高保真设计或应用验收截图。

**当前只有库和测试，没有 CLI 接单入口、定时器或真实写入执行器。** 不接新云端服务，不改权限、保护、版本或发布配置，不自动创建任务、合入、发布或清分支。它没有自动作用于现有 issue/PR；既有 CI 通过 npm test 运行这些测试。完整状态机、云端可信数据接入及实际执行仍待后续阶段。

## 核心接口与信任边界

| 接口 | core-v1 行为 | 适配器必须提供的保证 |
|---|---|---|
| `readPolicy(read)` | 每轮/恢复读取固定仓库、完整 commit、路径与 SHA256；缺失、哈希变化、合并冲突、未解决指令冲突均拒绝；仅归一化 CRLF | 返回指定 ref 的真实内容，读取适用 AGENTS/skills 并报告未解决冲突；不能用缓存成功代替当轮读取。核心不做自然语言规范冲突推理 |
| `checkApproval` | 精确单行命令、正确讨论位置及来源 URL、issue/方案版本/方案摘要/PR/SHA/发行集合绑定；排除自身 ID、`[OnO]`、引用、代码、示例、编辑/撤回/未来时间；验证器缺失即拒绝 | `readApproval` 取得最新完整来源；`verifyHuman` 独立验证原文摘要、作者、时间和目标。不能读取评论里的 `human=true`，不能靠用户名、排除已知代理 ID 或“同账户”推断人工来源 |
| `MemoryStore` | 同步原子事务、修订号、单仓库租约/续期/fencing、审批消费与操作日志、全局单开发槽 | 本次仅内存模拟。未来云端存储必须保证事务/CAS、服务端时钟、持久化、并发 fencing；不能以 Actions concurrency 或本机文件锁代替 |
| `WorkflowCore` | 当前仅批准关口：待方案→开发、待合入→合入后验收、待发版→已发布的**模拟**跃迁；准备日志与消费同事务；中断只查询，不自动重试 | 当前任务、方案、PR/SHA、是否关闭及 CI 快照必须来自可信读取。更改这些信息必须递增 revision；同一任务不允许多个 prepared 操作。真实开发/验收/终止流程及 GitHub 写入器未接入 |
| `SimulatedExecutor` | 只向内存写模拟结果；无网络、子进程或产品操作 | 不可换成真实执行器后就宣称可部署。真实写入端需额外实现 fencing 和 SHA 条件写入；核心检查与第三方写入之间不存在分布式原子性保证 |
| `checkTaskEvidence` | 组合方案图检查、提交验收清单及 UI 实现截图/视觉审阅检查 | 使用真实来源调用各 reader/verifier；不能把调用者提供的 `valid: true` 当可信证据 |

测试中采用可控时钟和独立证明表/模拟验证器；这些验证器只用于反例与流程测试，**没有实现人工身份认证**。将任意验证器替换为“总是 true”即破坏信任边界，不属于支持的部署方式。接口不是针对恶意宿主代码的安全沙箱。

`sourceDigest` 绑定来源 ID、URL、作者、创建/编辑时间与正文，可信验证器还收到完整 `targetKey`。三种批准互不通用；消费按来源 ID 持久记录。来源删除/编辑/撤回后，执行后复核及恢复均拒绝推进。示例精确命令由 `approvalCommand(target)` 生成；本版本拒绝裸 `/approve` 和自然语言推测。未来若支持裸命令，必须新增“发言当时唯一待验收 SHA”的可靠绑定与测试，不能动态套用轮询时最新 SHA。

## 模拟运行与恢复语义

`WorkflowCore` 接受 store、executor、固定规范 reader、最新审批 reader、人工来源 verifier、证据 validator 和时钟。`validateEvidence` 推荐调用组合的 `checkTaskEvidence`，不要只运行部分守卫。所有输入是可信适配器的内部数据结构，不是直接反序列化 issue 文本即可使用的命令。

一次调用先重新读取规范，再核对任务 revision/状态、最新审批与证据；原子事务内重新核对租约和 revision、排除自身评论、检查单开发槽，写入 prepared 操作并消费批准。开发槽在等待模拟执行时即预留，避免异步期间放入第二个开发任务。执行后重新核对审批/证据，租约与任务仍有效才完成状态跃迁。

异常、进程中断或失锁会保留 prepared 与已消费批准。新的持锁者调用 `recover` 时先读规范并查询模拟执行结果；只有确切查到相同操作/目标、审批和证据仍有效、任务未改变，才记录完成。查询结果 absent/unknown 不自动重做，不退还批准，保留阻塞供人工核对。此时单开发槽可能持续占用，是有意失败关闭；自动释放/取消及重新批准恢复策略不在本次实现中。

内存快照恢复测试验证序列化后的审计状态能延续，不是云端掉电持久性或跨进程一致性证明。此处的 `released` 等状态均只存在于模拟任务数据，绝不调用 GitHub 合入/发布 API。

## 图片、视觉审阅与验收清单

`checkDesign` 要求方案正文和对应 comment **都实际嵌入同一组图片**。使用已有 marked 解析器，不把引用、围栏/行内代码或 HTML 示例里的图片语法算作有效图；core-v1 仅支持 Markdown 图片（含引用图片），其他嵌入形式保守拒绝。方案正文摘要必须匹配批准目标；清单每张图片绑定方案版本、摘要、状态、固定 HTTPS 地址与内容 SHA256。两处清单不得漏图、重复或额外混入图片。

reader 打开图片并返回完整字节，失败即拒绝；核心核对哈希并完整重建支持的 PNG 像素。v1 限制为 8-bit RGBA、非交错、仅 IHDR/IDAT/IEND，拒绝损坏 CRC、截断、异常压缩流/过滤器及其他格式/块；像素上限 4,000,000、图清单至多 20 张、原始文件合计 20 MB。此限制为解码资源上限，**不是高保真标准**；不支持的合法 PNG/JPEG/WebP 也失败关闭，后续按真实使用需求扩大格式支持。

本次没有 HTTP 下载器或浏览器渲染适配器。测试 reader 使用 fixture 字节，已验证读取失败与损坏解码反例；未来下载器须限制响应体、超时、跳转和目标地址，避免从 issue URL 访问内部服务。真实 GitHub 页面/Camo 图片渲染和用户可访问性仍需真实适配器/视觉审阅验证，不能由 Markdown 解析成功推断。

高保真视觉结论必须有 `approved-high-fidelity`、审阅人、说明、与目标/两处正文/图片清单绑定的摘要，并由独立 `verifyVisual` 证明。核心无法靠分辨率、格式、文件大小或模型评分证明布局/字体/颜色/交互是否符合需求；测试视觉证明不代表完成产品视觉审阅。

`checkAcceptance` 对 trusted `expected` 的当前 head/base/tested SHA、event、run、attempt 核验各检查结果；passed/failed/skipped/uncovered 都可表达，但必需检查只有 passed 才放行，其他状态不偷偷豁免。merge 要求 PR 合成提交上下文，release 要求候选 main push 实际 SHA。这里的“当前”必须由未来 CI reader 获取，核心不能离线发现更新的 run/attempt/base。

证据仅允许 PNG、JSON、Markdown，校验真实读取字节、hash、大小和来源，聚合上限 20,000,000 bytes；关键证据仍需 `verifyPersistence` 可信验证成功，过期短期证据拒绝。UI 交付还必须包含关键实现截图及绑定验收清单的 `approved-implementation` 视觉证明。这里没有上传/保留策略执行器，也没有证明远端存储未来永不删除；3 天 artifact 规则仍由既有 CI 执行，真实附件读取与验证适配器尚未接入。

`verifyPersistence` 接口没有要求第二份副本或指定独立存储。GitHub 原生附件可以作为唯一非临时来源，方案/comment 复用同一 URL；可信适配器须核实附件来源、真实访问权限、内容 SHA256、run/attempt/SHA 绑定及其非 3 天临时 artifact 的生命周期，不能仅凭 URL 域名、`expiresAt: null` 或调用方声明返回 true，也不能承诺附件永不删除。短期 Actions artifact 仍标注到期并按原守卫处理。取消额外备份无需重写此核心或删除完整性检查；原生附件的真实适配与运行时规范迁移仍待验证。`checkAcceptance` 至少要求一项 critical 证据，UI 还要求 critical PNG；验证器缺失或失败仍默认拒绝，不用 `always true` 或新增备份来绕过。

## 验收与剩余事项

通过现有 `npm test` 自动包含 [新测试](../tests/ono-workflow.test.ts)，也可在锁定依赖安装后单独执行：

```sh
node --test tests/ono-workflow.test.ts
```

测试覆盖规范缺失/冲突/ref/hash、三类批准绑定与默认拒绝、来源混淆/自身/引用/示例、换 SHA/版本/集合、单次消费/重放、状态/修订号/关闭、并发重复、单任务槽、租约/续期/失锁、执行后中断/查询恢复，以及缺图/旧图/损坏图/视觉证明缺失、验收 SHA/attempt/base 漂移、失败/跳过/未覆盖、证据过期/类型/hash/聚合预算等。

开发环境完整 npm ci 被既有 SheetJS 下载地址 HTTP 403 阻断；新测试使用单独取得的锁定 marked 18.0.14 验证，未更改 package.json/package-lock。完整 Linux/Windows 结果以 PR 中最终 SHA 的云端 CI 与 `[OnO]` 交付 comment 为准。

下一阶段仍须独立审阅可信人工批准入口、云端持久状态与锁、原生附件访问与来源验证、真实 reader/verifier、完整状态机及外部写入隔离；新增权限/费用另行批准。先验证隔离试点与恢复，单独确认后才能启用小时检查。main 保护、真实合入、发版继续各自审批。本次不引入 Jev。
