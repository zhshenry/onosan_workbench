# 接受场景（accept）

这里描述关口②之前的接受场景。场景文件不是批准，也不会把占位产物当成截图或通过。

JEV 的调用方式、枚举和失败关闭见 [JEV 接受门](../docs/operations/issue-workflow/jev-accept-gate.md)。

## YAML 字段

`tooling/accept-float.mjs` 只接受下面这个子集：两空格缩进、映射、列表、标量、整行 `#` 注释。列表项要比它的键更深。不支持 Tab、`|` / `>` 块标量、锚点和行内 `{...}` / `[...]`。不要把嵌套映射写在 `-` 同一行。

| 字段 | 含义 |
|---|---|
| `issue` | 正整数 Issue 编号 |
| `title` | 短标题，便于人读 |
| `mode` | `functional`、`important_ui` 或 `optimize` |
| `gate` | 目前为 `accept` |
| `spec_version` | 已批准方案版本，例如 `v1` |
| `base` | 对照基线的名字，通常是 `main`。真正的 SHA 由命令的 `--head` 和 jev-gate 的 `--base` 决定 |
| `steps` | 非空列表。每项有 `id` 和 `do`，可以有 `during` 描述中间状态 |
| `expect` | 非空列表，写可观察的验收点 |
| `judge.fixed` | 固定命题 id，功能/优化场景为 `A2_matches_spec`、`A5_regression_covered`、`A6_scope_contained` |
| `judge.dynamic` | 可选，1–3 个本单 `noul` 问题。存在时必须有 `id`、`instructions`、`criteria.true`、`criteria.false` |
| `judge.important_ui` | 重要 UI 为 true。此类问题不把 JEV 当最终裁判 |
| `judge.skip_jev_final` | 与策略一致时为 true，表示跳过 JEV 终判 |
| `notes` | 给人看的约束。新 head 必须重跑 |

示例：[examples/86.functional.yaml](examples/86.functional.yaml)（Issue #86 的纯对话回复，功能缺陷，不是重要 UI 终判）。

## 占位命令

```bash
npm run accept:float -- --scenario accept/examples/86.functional.yaml --head <sha>
```

脚本会检查 YAML 存在且能按上述子集解析，用 git 把 `--head` 解析成完整 SHA，然后写入：

- `artifacts/accept/<issue>/state.json`
- 若场景有 `judge.dynamic`，还有 `artifacts/accept/<issue>/dynamic-questions.json`

标准输出是 JSON，其中 `state_path` 就是交给 jev-gate 的状态路径。标准错误打印一行人类可读说明。

`state.json` 的 `placeholder` 为 true，`visual_evidence` 为 false。完整的 Chromium / Electron 悬浮窗自动操作以后再补。这个目录已在 `.gitignore` 里，不要把占位产物当验收截图提交。

`--out-dir` 可改写入目录，测试时用。

## BOT 在关口②之前

1. 先让该 head 的 CI 变绿。功能问题才进入 JEV；重要 UI 只做确定性检查和截图，终判留给关口②。
2. 需要动态命题时，可以用场景里的 `judge.dynamic`，或先跑 `node tooling/jev-dynamic-from-issue.mjs --issue-body <验收说明> --out <file>` 生成草稿，再改成 1–3 个本单问题。
3. 可选：`npm run accept:float -- --scenario <yaml> --head <完整或可解析 SHA>`，把打印的 `state_path` 当作 `--spec`。
4. 绑定该 head 调用 jev-gate。不要在门脚本以外用概率自行改成通过。
5. 用 `--verify` 确认账本最后一条对得上这个 head。新 head、新 base 或策略文件一变，旧记录作废，必须重跑。
6. `AUTO_ACCEPT` 只表示命题过了阈值。它不是合入批准，也不能代替关口②。`PENDING_HUMAN` 表示重要 UI 证据路径已准备好交给人。

`accept:float` 退出码：`0` 写好了占位状态；`1` 是场景、参数或 git 引用错误。
