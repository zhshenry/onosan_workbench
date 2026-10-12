# OnO 阶段 A：只读采集与检查

这是可手动调用的库，不是接单服务。它不创建凭据、不调度、不评论、不上传、不修改分支、不合入、不关单、不消费审批。既有 core-v1 的 POLICY/pin 未改变；这里只复用 `hash` 纯函数。

## 接口与信任边界

`createGitHubReader(get, { source, clock })` 接受已有连接器的只读 GET 函数。`get(url)` 返回 GitHub JSON 对象；仓库固定为 zhshenry/onosan_workbench，端点受白名单限制。连接器宿主负责认证、错误解包和明确的读取权限；本库不读取 token，也不提供 HTTP 写入方法。`source` 是宿主记录的来源说明，不是身份认证。不可把任意上传 JSON 标为真实读取。

`collect(reader, { issue, pr })` 每次重新读取指定 Issue、评论、可选 PR 及其评论、main、相关 SHA 的 workflow runs、最新 attempt 的 jobs 和 artifact 元数据；评论和运行列表自动翻页，超过上限或读取错误抛错，不返回缓存成功。再次读取目标、评论和运行列表，检测版本变化或新运行。指定 PR 与 Issue 的关联由协调者确认，本库不从正文执行指令或猜测关联。GitHub 多次 GET 不是原子快照，稳定采集也不允许未来直接执行动作。

`evaluate(snapshot, contract, { now, previousReport, verifyHuman })` 返回只读报告。`contract` 必须由可信协调者提供，不能反序列化 Issue 文本成为指令：

- `gate` 为 `plan` 或 `merge`；不提供时仅报告观察状态。
- `ui` 仅明确 false 时跳过 UI 未验证提示；默认保守视作 UI。
- `ownCommentIds` 为可信自发评论日志；缺失阻塞。标识和数字 ID 仅为排除/核对线索。
- `request` 包括原 Issue 的 requestCommentId、requestDigest（请求原始正文 SHA256）、approvalCommentId、planVersion、planDigest；合入另含完整 headSha，可选 closeAfterMain。仅 merge 的批准不等于关单批准；缺少 closeAfterMain=true 只报告关单未授权，不另外否定 merge 的范围。协调者须先确保该请求唯一绑定对应版本、最终方案与图片清单，内容或目标变化创建新请求；本库不从自然语言猜测版本。
- `maxSnapshotAgeMs` 默认 5 分钟、`maxCIAgeMs` 默认 24 小时，是只读提示时效，可由协调者调整；不是仓库审批政策，也不让历史成功因时间流逝变成失败。
- `verifyHuman(record)` 是尚未实现的可信真人来源适配接口，默认 false。测试中的 true 仅证明分支行为，不证明真实用户身份。同账号、无标识、正文 human=true 或不在自发日志中均不能替代此接口。即使接口返回 true，也会因方案内容绑定与 Issue 重开生命周期尚未验证而保持 blocked，不生成授权。

批准记录保留完整原文、ID/链接、作者数字 ID、创建/编辑时间及协调者声明的请求/版本/SHA；requestDigest只核对请求正文未变，不证明真实方案/图片内容与planDigest相符。引用、模板、标识、自发ID、编辑、删除、错误目标等失败关闭。GitHub 的撤回意图可能出现在后续自然语言评论中，本阶段不自动解读撤回；真实方案读取、关闭重开生命周期和真人适配器未实现，分别明确报告阻塞，不能继承旧批准。

普通交付有两个关口，均在原 Issue：方案获批后实现及测试；完成后批准准确 PR head 合入，且只有该批准明确包含“main 验收通过后关单”才能在未来执行阶段关单。PR 评论只做观察，不能替代原 Issue 审批。发版保持独立批准。图片上传、权限或安全风险仍服从其特定授权，两个关口不扩大已有权限。

当前语法检查仅认识严格单行 `APPROVE 方案 v版本` 和 `APPROVE PR #编号 完整headSHA`；这是遗留精确语法的只读探针，不是最新自然语言/短 SHA 协议实现。所有关口都会报告 APPROVAL_PROTOCOL_ADAPTER_NOT_IMPLEMENTED。真实 #13 的“同意合入 PR #19，版本 e74922f”在原 Issue 可被观察，但不会自动消歧或批准；记录语法适配未完成，不误判为审批线程错误。

## 状态与证据

主干 CI 按准确 SHA/event/workflow、最新运行、run attempt/jobs 检查；PR CI 还核对 base，但实际 tested merge SHA/父提交无法从事件元数据可靠得出，明确阻塞。artifact 只读元数据：不证明字节 hash、访问性、图片内容或视觉验收；过期仅影响当前可复核性，报告保留历史 CI conclusion。

已关闭 Issue 一律不推进或自动重开。completed 且关联 PR 已合、当前 main 有历史成功 CI 时输出 closed-completed，否则 closed-paused；这只是现有关闭/技术结果观察，`deliveryCompletionVerified=false`，不证明完整产品范围、历史批准或例外验收。当前证据过期等写入 HISTORICAL_REVIEW 观察，不篡改过去的 CI 结果。

previousReport 仅用于结论摘要差异展示；不会复用它的检查/批准。重启后必须重新 collect。没有云端持久状态、分布式锁或可执行操作日志，不能把报告去重视为执行幂等。

## 使用

宿主可直接导入两个模块，将现有 GitHub fetch 连接器解包为 get。例：

```js
const get = async url => {
  const result = await githubFetch({ url });
  if (result.isError || !result.structuredContent?.content) throw new Error('CONNECTOR_READ_FAILED');
  return JSON.parse(result.structuredContent.content);
};
const reader = createGitHubReader(get, { source: 'live-connector' });
const snapshot = await collect(reader, { issue: 13, pr: 19 });
const report = await evaluate(snapshot);
```

在已有工具编排宿主完成过真实连接器读取演示；未引入新认证。V8 工具宿主没有 Node 模块加载/structuredClone 时，演示使用相同模块函数体并对纯 JSON 响应注入 JSON clone；Node 单测使用原生 structuredClone。保存的读取快照只是当时观察，后续不得重放为新的真实读取。

测试：`node --test tests/ono-read-only.test.ts`；既有 `npm test` 也包含该测试。Fixture 与真实读取分列；测试不伪造真人身份、视觉验证、分布式恢复或调度已上线。
