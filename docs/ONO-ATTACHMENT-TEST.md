# OnO 原生附件隔离试验（待单独批准实测）

本试验只检验 `zhshenry/onosan_workbench`（repository ID `1372377655`）的 GitHub 原生附件路径。新增草稿 PR、单元测试和普通 PR CI **不读取 PAT、不上传附件、不评论 issue，也不代表附件能力已验证**。没有产品 UI 改动；合成测试 PNG 不是高保真设计或应用验收图。生产 `core-v1 POLICY` pin 与执行逻辑不变。

## 准入与边界

- 用户已表示在仓库 Actions secret 中配置 `ONOSAN_GH_TOKEN`；本次不读取、复制、显示或修改其值，不新增 secret、账号、权限、environment 或授权。
- 原账户 `zhshenry` 通过 PAT 发出的评论仅作 `[OnO]` 审计，无法靠同账户作者区分人工和代理。真正方案、合入、发布及本次试验授权只在与 OnO 的主对话确认。评论、review、输入框或 marker 都不是可信的人类批准证明。
- 实测前，主对话必须分别批准此 PR 的准确完整 head SHA 及合入；合入后再核对实际 main SHA、指定现有且仍开放的目标 issue、唯一 `approval_id`、一条 `[OnO]` 测试评论和公开合成 PNG 上传。不得自动创建测试 issue，不能默认为已有旧 issue。
- `approved_sha` 是批准后的准确 main SHA，必须等于 dispatch SHA 和查询时最新 main。合入提交会不同于 PR head，不能直接复用 PR head。任何变更重新核对授权。
- 只允许 `workflow_dispatch`、本仓库、`refs/heads/main`；checkout 固定 dispatch SHA，关闭凭据持久化。无 PR、fork、定时、push 或 `pull_request_target` 上传入口。普通 CI 的 `npm test` 自动发现新增测试，全部模拟调用，不需要 secret。
- 此为可信 main 上的人工门禁，不是恶意仓库写入者的安全沙箱。仓库写入者能改 workflow，输入声明也不能证明主对话授权；不能宣称已经建立平台强制审批/分支保护。

## 运行方式（本 PR 不运行）

1. 先在主对话完成上述批准，确认目标是普通 issue 而非 PR。若需要新 issue，另行明确批准创建。
2. 合入后，在 GitHub Actions 选择 **OnO native attachment test (manual only)**，分支选择 `main`。填写 `target_issue`、完整 `approved_sha`、主对话约定且唯一的 `approval_id`（8–64 位小写字母/数字/连字符）。`post_attachment` 默认 false，保持 false 只执行只读预检。
3. 主对话明确批准实际上传后，才用同样的目标、SHA 和 approval ID 手动运行并勾选 `post_attachment`。将原生附件公开发到该 issue；没有长期授权或日常自动上传能力。
4. 当前 GitHub 连接器没有 `workflow_dispatch` 入口。必要时由用户在 GitHub 网页点击一次 Run workflow，作为这次受控能力初始化测试的手动启动；这不是要求用户以后日常代操作，也不代表日常自动触发已实现。若先做独立预检，再实际上传，则需要分别启动两次，不能把预检成功当上传成功。

工作流从官方 [gh 2.102.0 release](https://github.com/cli/cli/releases/tag/v2.102.0) 下载 Linux amd64 tarball，使用 release API 公布的 SHA256 `bb766f710eef8ede859c18578c72c327597cd4c8a85b06001b1f3843c6019386` 校验后执行，检查版本。GitHub Actions 固定完整 action commit；不运行 npm 安装、产品代码或来自 issue/PR 的脚本。

PAT 只注入最后一个可信步骤，以固定 gh 路径调用；不登录保存、不回退 `GITHUB_TOKEN`、不写入磁盘、不打印原始 CLI 输出/错误，不继承调试、代理、替代 host 或其它 token 环境。安装 gh 和 checkout 步骤没有该 secret。缺 secret 立即失败关闭。

## 实际预检与单次写入

1. 使用该 PAT 查询 GraphQL `viewer.login` 必须为 `zhshenry`；repository `databaseId`/`nameWithOwner` 必须准确，`viewerPermission` 必须为 WRITE/MAINTAIN/ADMIN。还核对 main SHA、未归档仓库、目标 issue 未关闭且未锁定。这里的 permission 是 viewer 对仓库的角色，并不能证明 PAT 的附件上传 scope，真实上传仍待实测。
2. 分页读取目标 issue 评论并查找固定 `<!-- ono-attachment-test:<approval_id> -->`。任何已有匹配均停止，不编辑、不重复发帖。预检失败不会生成或上传图片。
3. 只有明确 `post_attachment=true` 且 run attempt=1，才在临时目录用 Node 标准库生成 16×16 无敏感 RGBA PNG，计算 SHA256。评论固定 `[OnO]` 前缀，记录 run URL、attempt、准确 main SHA、marker 和图片 SHA256。
4. 写入前再次只读核对当前 main/issue 和 marker，然后只调用一次 `gh issue comment --repo zhshenry/onosan_workbench --body-file … --attach …`。参数数组执行，不使用 shell，不把输入文本插入命令。
5. 成功或部分失败后先查询评论。不确定结果、CLI 失败、查询失败、缺附件链接或多匹配均停止，绝不自动重试上传。rerun 只可查询后停止，不能再次写入。若上传已发生但评论失败，可能遗留没有评论的附件；新 run 不能证明它不存在，必须人工核对并在主对话重新批准，不能换 marker 盲试。Actions concurrency 串行化本 workflow，不能代替跨系统事务或持久幂等存储。

## 结果与保留

- 返回匹配的评论 URL 只证明查询到相应评论/附件 URL，不证明用户可打开、图片渲染、内容完整性、持久性或高保真。随后须只读打开实际评论与图片，核对可访问、渲染、PNG SHA256 和身份/目标/run/SHA；未完成时明确标注未验证。
- 真实 PAT 的 fine-grained Issues write + Metadata read 是否足够上传未知。遇到认证/权限错误停止并报告，不自行扩大权限、换 token 或绕过限制。
- PNG 只在运行器临时目录存在，用后清理；不提交图片到仓库、不上传 Actions artifact、不另建备份。仅保存生成代码、测试以及评论里的完整性/运行记录。
- GitHub 原生附件不保证永久存在，也不能保证可删除。删评论不等于删上传资产；本试验不执行任何删除或清理远端附件的操作。批准上传前须接受这项保留风险。

## 检查

`node --test tests/ono-attachment-test.test.ts` 在 Node 24 直接运行，无第三方依赖。常规 `npm test` 在既有 Linux/Windows CI 同样包含这些测试；既有完整构建、安装、UI 验收维持原样。单元测试覆盖输入/secret/身份/权限/目标/主分支变化、默认只读、单次写入、重放、部分失败先查询和无重试、合成图片及 workflow 静态约束；不连接 GitHub，不读取真实 secret，不模拟成功的真实附件权限。
