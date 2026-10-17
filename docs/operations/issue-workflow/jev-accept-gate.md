# JEV 接受门

JEV（System1 / `typesafe/jev`）是 OpenRouter Decisions HTTP API，不是 Cursor CloudAgent 模型，也不是聊天补全。

接受门只在关口②之前给 BOT 一个枚举。它不合并、不关单、不发版，也不能代替关口②里的人。

## 架构

1. 确定性预检先做。预检失败就不请求 JEV。
2. 问题 = 策略里的固定 `noul` 命题，加上本次 `--dynamic` 文件里的 1–3 个本单命题。
3. `POST {base}/api/alpha/decisions`，模型 `typesafe/jev-1.14`。
4. 只在 `tooling/jev-gate.mjs` 里用阈值把 `answers.<id>.noul` 收成枚举。
5. 向 `docs/issues/jev-ledger.jsonl` 追加一行，并把 JSON 摘要打到标准输出。

BOT 和人只消费枚举和退出码。不要在门脚本外面看着原始概率改判成通过。

## 环境变量

| 变量 | 作用 |
|---|---|
| `OPENROUTER_API_KEY` | `Authorization: Bearer`。优先使用 |
| `SYSTEM1_API_KEY` | 上面没有时的备用密钥 |
| `SYSTEM1_API_BASE_URL` | 可选源站根，例如 `https://openrouter.ai`。不要自带 `/api/alpha/decisions`；脚本会再拼这段路径。若末尾已经带了这段后缀，会先去掉再拼，避免打出两次路径的 404 |
| `OPENROUTER_API_BASE_URL` | 上一项没有时的备用源站根，规则相同 |
| `JEV_LEDGER_PATH` | 可选账本路径。默认 `docs/issues/jev-ledger.jsonl`。相对路径相对当前工作目录 |

都没设源站时用策略里的 `default_base_url`（`https://openrouter.ai`）。这两个变量都要写成源站根，不要写成完整的 Decisions 地址。源站必须是 `https`，只有 `127.0.0.1` / `localhost` 允许 `http`。密钥不会写入账本或摘要。完整 40 位 SHA 直接作为 head/base 使用，不再向 git 解析祖先，因此浅克隆也能校验一个不在本地的 head。

状态文本会离开本机。不要把密钥、令牌或私人数据放进 `--spec`、Issue 正文或 diff。

## 阈值和命题

策略文件是 `tooling/jev-policy.json`。`policy_version` 目前是 `jev-accept-1`。`policy_hash` 是该文件原始字节的 SHA-256。改文件就会变哈希；改含义时同时改 `policy_version`。

| 命题 | 何时询问 |
|---|---|
| `A2_matches_spec` | `functional` 和 `optimize`。实现是否符合已批准规格 |
| `A5_regression_covered` | 同上。相关回归是否覆盖，且记录的测试没有新的范围内失败 |
| `A6_scope_contained` | 同上。改动是否停在批准范围内，没有无关产品 UI |
| `A8_evidence_sufficient` | 仅 `optimize`。优化是否有足够证据证明行为保持或改进成立 |

固定命题的 `instructions` 是英文。动态命题由每次运行的 JSON 提供，和固定命题合并后一次 POST。id 不能冲突。id 匹配 `^[A-Za-z][A-Za-z0-9_-]{0,63}$`。类型必须是 `noul`。

阈值：`approve_min` 0.9，`reject_max` 0.1。比较就是 `>=` 和 `<=`，不另加容差，也不把字符串概率转成数字。

- 每题 `noul >= 0.9` → `AUTO_ACCEPT`
- 任一题 `noul <= 0.1` → `RETRY`（即使其他题已经超过 0.9）
- 落在两者之间 → `HUMAN_REVIEW`
- 缺答案、非数字、越界 → `HUMAN_REVIEW`

## 枚举和退出码

| 退出码 | 枚举 | 含义 |
|---|---|---|
| 0 | `AUTO_ACCEPT` | 功能或优化命题全部过线。不是合入批准 |
| 0 | `PENDING_HUMAN` | 重要 UI 预检通过，已跳过 JEV。人还要做关口② |
| 0 | `DRY_RUN` | 有密钥的预演。没有 POST，没有账本，不是接受 |
| 2 | `RETRY` | 命题落到拒绝线，或 `npm test` 失败/超时。修好后用新 head 重跑 |
| 3 | `HUMAN_REVIEW` | 中间分、没密钥、网络失败、非 2xx、坏 JSON、模型不符、缺答案。故障绝不自动通过 |
| 1 | 无枚举 | 参数、策略、git、动态文件或账本写入失败。不是接受 |

标准输出是一份 JSON。标准错误是一行说明。摘要里的 `merge_authorized` 恒为 false。`scores` 只是审计，路由已经在脚本内完成。

`--dry-run` 不写账本。没有密钥时预演仍是 `HUMAN_REVIEW` / 退出码 3，但会带上将要发送的 `request`。有密钥时预演是 `DRY_RUN` / 退出码 0，并且不会连接网络。

## 重要 UI

`important_ui.skip_jev_final` 为 true。

`mode=important_ui` 时：

- 仍要求 `--head` 和 `--spec`，并收集相对 base 的 diff。
- 除非 `--skip-tests`，否则先跑 `npm test`。测试失败则 `RETRY`，原因 `tests_failed` 或 `tests_timeout`，不叫 JEV。
- 预检通过则枚举 `PENDING_HUMAN`，原因 `skip_jev_final`，退出码 0。不 POST。
- 不接受 `--dynamic`。截图和最终判断进入关口②。
- 不要把 `PENDING_HUMAN` 当成 `AUTO_ACCEPT`。退出码 0 只表示证据路径可以交给人。

功能问题在 CI 变绿之后才跑 JEV。`--skip-tests` 把 `test_result.status` 记为 `skipped`，它本身不证明 CI 是绿的。只有该 head 的 CI 已经变绿时才跳过测试。

## 状态对象

发给 Decisions API 的 `state`：

```json
{
  "issue": { "number": "86" },
  "spec": "规格或场景文本",
  "evidence": {
    "head": "<完整 SHA>",
    "base": "<完整 SHA>",
    "diffstat": "git diff --stat",
    "changed_files": ["相对路径"],
    "test_result": { "status": "passed" },
    "artifacts_note": "是否有 accept-float 占位状态"
  }
}
```

`--issue-body` 指向文件时，JSON 对象会并入 `issue`，普通文本则放进 `issue.body`。过长的规格、diff 和正文会截断并在 `evidence.truncated_fields` 标明。

`git diff` 先用 `base...head`，没有合并基线时用 `base..head`。默认 base 是本地 `main`。BOT 应传入该 PR 的 base SHA，这样本地 `main` 滞后时不会把无关提交算进 diff，校验也会绑在同一次 base 上。

## 动态命题文件

```json
{
  "questions": [
    {
      "id": "issue86_chat_reply_visible",
      "type": "noul",
      "instructions": "Does the evidence show a visible assistant reply?",
      "criteria": { "true": "The reply is visible.", "false": "The reply is missing." }
    }
  ]
}
```

也可以是 `{ "questions": { "<id>": { "type": "noul", "instructions": "...", "criteria": { "true": "...", "false": "..." } } } }`。多余字段（例如草稿里的 `needs_review`）不会发给 API。

`node tooling/jev-dynamic-from-issue.mjs --issue-body <file> --out <file>` 只从验收条目里抽 1–3 条草稿。BOT 应改写后再交给 `--dynamic`。

## BOT 集成（关口②之前）

功能或优化 Issue，在实现 PR 的 CI 对该 head 变绿之后：

```bash
npm run accept:float -- --scenario accept/examples/86.functional.yaml --head <head>
npm run jev:accept -- \
  --issue 86 \
  --head <head> \
  --base <base> \
  --mode functional \
  --spec artifacts/accept/86/state.json \
  --dynamic artifacts/accept/86/dynamic-questions.json
node tooling/jev-gate.mjs --verify --issue 86 --head <head> --base <base> \
  --dynamic artifacts/accept/86/dynamic-questions.json
```

`npm run jev:accept` 只相当于 `node tooling/jev-gate.mjs --gate accept`。其余参数跟在 `--` 后面。

重要 UI：

```bash
npm run jev:accept -- --issue <n> --head <head> --mode important_ui --spec <规格或场景> 
```

预检通过时期望 `PENDING_HUMAN`。然后用该 head 的真实截图做关口②，不要再请 JEV 做终判。

读取规则：

- 退出码 0 且枚举 `AUTO_ACCEPT`：可以把该 head 的结果写进关口②请求。仍然要人批准合入。
- 退出码 0 且枚举 `PENDING_HUMAN`：去关口②，不要写成模型已通过。
- 退出码 2：修复并产生新 head，然后整段重跑。不要沿用旧账本。
- 退出码 3：停下来给人看。不要因为某一题概率不低就改成通过。
- 退出码 1：门没有完成。不要接受。
- `ledger_written` 不是 true 的实跑结果不能当作已记录的接受。`--verify` 读的是账本，不是上一次的标准输出。

`--verify` 只看该 Issue 最后一条 `gate=accept` 记录，并核对 head、base、`policy_hash`、`questions_hash`。记录用过动态命题时，校验必须再带同一个 `--dynamic` 文件。对不上就退出码 1，原因会是 `head_mismatch`、`base_mismatch`、`policy_hash_mismatch`、`questions_hash_mismatch` 或 `no_ledger_entry`。更早的 `AUTO_ACCEPT` 行不算数。

## 新 head 必须重跑

账本按 head 绑定。新的提交、变了的 base，或策略文件字节一变，旧的通过记录就不能用。失败或 `RETRY` 之后也一样：下一个 head 要一次新的接受运行。`--verify` 不会替你重算概率，也没有“沿用上次高分”的入口。

从 `npm test` 里面再跑不带 `--skip-tests` 的门会被拒绝，以免测试递归调用自己。正常的 `npm run jev:accept` 不受影响。

## 账本

`docs/issues/jev-ledger.jsonl` 以 `#` 注释行开头。注释不是决定。每一行 JSON 至少包含：`timestamp`、`issue`、`gate`、`enum`、`scores`、`head_sha`、`base_sha`、`policy_hash`、`latency_ms`，有费用时还有 `cost`。另外会记下 `policy_version`、`questions_hash`、`mode`、`reason`、`dynamic_count`，以便校验。

这个文件会随实跑变长。占位浮窗产物在 `artifacts/`，已忽略，不要提交。
