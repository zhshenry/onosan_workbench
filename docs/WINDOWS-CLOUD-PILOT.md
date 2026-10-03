# Windows cloud acceptance pilot

The workflow runs Linux baseline checks and Windows installed-app acceptance for PRs targeting `main`, pushes to `main`, and manual dispatch. It does not merge main, publish a release, register a self-hosted runner or involve a personal computer. It uses standard `ubuntu-24.04` / `windows-2022` GitHub-hosted runners with read-only repository permissions, concurrency cancellation and 15 / 25 minute job timeouts. No Actions cache is uploaded.

## Trigger and trust boundaries

- `pull_request` to `main`: `opened`, `reopened`, and `synchronize` (new head commits). Draft PRs are included. PR title/body edits, reviews, labels and ready-for-review transitions do not rerun the same commit. Retargeting an existing PR to main alone does not trigger a run; push a new head commit or reopen it before acceptance.
- `push` to `main`: check the exact new main commit, including a merge performed separately by an authorized maintainer. Feature/pilot branch pushes have no second push run; their open PR supplies the check. A feature branch without a PR does not trigger this workflow.
- `workflow_dispatch`: manual checks use the selected ref. GitHub requires the workflow on the default branch for the manual entry point. While this change remains only in Draft PR #1, dispatch and post-merge main-push behavior are configured but have not been exercised; do not merge just to test these routes.
- No path filters: all PRs to main and main pushes are checked, including documentation-only updates. This also covers build configuration, assets and tests without maintaining an incomplete source-path allowlist. Each qualifying event has two jobs in one run. A newer run cancels an older run for the same PR or same event/ref; manual, PR and main-push routes have separate concurrency groups.
- Same-repository and fork PRs use the ordinary `pull_request` event, never `pull_request_target`. They test GitHub's proposed merge with main using default checkout behavior. Evidence records the tested merge SHA plus separate head/base SHAs and event. Merge conflicts prevent GitHub from starting PR checks and must be resolved before acceptance.
- Both jobs request only `contents: read`; checkout does not persist credentials. No repository secrets are referenced or injected into test/package/app processes. The workflow cannot publish a release, comment on a PR or write repository contents. Fork/Dependabot runs remain subject to GitHub's existing maintainer-approval policy; this change does not bypass approval or alter Actions/security settings. Do not add privileged triggers, secrets, self-hosted runners or downstream execution of PR artifacts.

Event behavior and fork restrictions follow [GitHub's event documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows). Source-contract regression tests check this configuration, but do not simulate event delivery. A successful `pull_request` run is the live proof for that route; configured main push and dispatch remain distinct untested routes until separately observed after an authorized merge.

## Tested sequence

1. Linux: fresh `npm ci`, unit tests, typography check, TypeScript checks and production build.
2. Windows: fresh locked dependencies, explicit locked Electron runtime install (Electron 44 no longer has an npm postinstall hook), unit tests (including Windows packaging fixtures), full verify, authentic unsigned NSIS build via electron-builder with `--publish never`.
3. Silent `/S /currentuser` installation to a disposable directory under `RUNNER_TEMP`. Verify installer exit code, installed executable/uninstaller, package version and exact main-bundle hash.
4. Playwright launches the **installed executable**, with no checkout entry script. Assert `app.isPackaged`, installed `process.execPath`, installed app location, isolated data paths and disabled updater.
5. Real UI actions: collapse the default AI panel using its toolbar control (it overlays content below the 1160 CSS-pixel breakpoint); cancel empty creation; create a synthetic task; edit title/note; cancel completion once; confirm completion; view the completed library; choose exit-on-close; close using the window's close button.
6. Relaunch the same installed executable with the same synthetic directory. Verify the exact task ID, edited title/note, completed status and saved close setting; show the task in the completed library.

Only reads/assertions use the existing preload API. No task creation/edit/completion is replaced by direct database access or mocked IPC. Playwright's Electron support is experimental: actual packaged-app launch must pass before a flow can be claimed.

## Evidence and spending boundaries

A single evidence directory may contain only six named PNG screenshots and three named JSON/Markdown reports. A guard rejects unexpected names, directories, symlinks, files without the eight-byte PNG signature, malformed JSON or a combined size over 19,000,000 bytes, leaving headroom within the approved 20,000,000-byte ZIP target. The PNG guard does not perform a full image decode; screenshots must also be visually reviewed.

The **entire workflow run**, across both jobs, has exactly one artifact upload, in the Windows job; Linux uploads nothing. That step runs only after the guard passes and retains evidence for 3 days. The artifact is named by run ID without attempt number and uses `overwrite: true`, so a rerun with safe new evidence replaces that run's existing evidence rather than accumulating another artifact. If a rerun fails before producing safe evidence, the prior artifact can remain; it is not evidence of the new attempt. Reports include `runAttempt`, and acceptance must match the latest successful attempt plus tested/head/base SHAs. Workflow regression tests enforce this single-upload configuration. Adding another upload/job requires revisiting the aggregate run budget, not assigning another 20 MB allowance. Separate runs have separate budgets and still count toward the account-wide storage allowance.

No installers, portable ZIPs, videos, traces, databases or real user data are uploaded. Large installer/Office native runtime files stay on the disposable runner; the full portable-release repack step is intentionally omitted.

Standard hosted runner compute is free for public repositories according to [GitHub billing documentation](https://docs.github.com/en/billing/concepts/product-billing/github-actions). Account-wide artifact allowance and enabled-Action settings still need to permit the run/upload; this workflow does not change billing, storage quotas or security settings. A quota/admission error is a blocker, not permission to enable paid capacity.

## Limits

This is silent NSIS install and same-version persistence coverage. It does not assess the native wizard, UAC, SmartScreen, publisher trust/code signing, real automatic updates, cross-version upgrades, Office conversion, AI provider calls, login-at-start or another application's actual shared database. `WORKBENCH_TEST_DATA_DIR` isolates both `OnoWorkbench` and `To-Do-List`; it intentionally disables automatic updates and launch-at-login registration.

Production release commands and version/tag procedures remain in [RELEASE.md](RELEASE.md). CI does not increment versions, create tags or release anything. A green check does not authorize a merge or release. The current product version is `0.1.0`; this is same-version relaunch coverage, not true upgrade acceptance.
