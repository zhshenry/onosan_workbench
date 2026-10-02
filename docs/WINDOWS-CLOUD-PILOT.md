# Windows cloud acceptance pilot

The pilot lives only on `pilot/windows-cloud-acceptance-20261002` and runs on push. It does not merge main, publish a release, register a self-hosted runner or involve a personal computer. It uses standard `ubuntu-24.04` / `windows-2022` GitHub-hosted runners with read-only repository permissions, concurrency cancellation and timeouts. No Actions cache is uploaded.

## Tested sequence

1. Linux: fresh `npm ci`, unit tests, typography check, TypeScript checks and production build.
2. Windows: fresh locked dependencies, explicit locked Electron runtime install (Electron 44 no longer has an npm postinstall hook), unit tests (including Windows packaging fixtures), full verify, authentic unsigned NSIS build via electron-builder with `--publish never`.
3. Silent `/S /currentuser` installation to a disposable directory under `RUNNER_TEMP`. Verify installer exit code, installed executable/uninstaller, package version and exact main-bundle hash.
4. Playwright launches the **installed executable**, with no checkout entry script. Assert `app.isPackaged`, installed `process.execPath`, installed app location, isolated data paths and disabled updater.
5. Real UI actions: cancel empty creation; create a synthetic task; edit title/note; cancel completion once; confirm completion; view the completed library; choose exit-on-close; close using the window's close button.
6. Relaunch the same installed executable with the same synthetic directory. Verify the exact task ID, edited title/note, completed status and saved close setting; show the task in the completed library.

Only reads/assertions use the existing preload API. No task creation/edit/completion is replaced by direct database access or mocked IPC. Playwright's Electron support is experimental: actual packaged-app launch must pass before a flow can be claimed.

## Evidence and spending boundaries

A single evidence directory may contain only six named PNG screenshots and three named JSON/Markdown reports. A guard rejects unexpected names, directories, symlinks, invalid PNG/JSON or a combined size over 19,000,000 bytes, leaving headroom within the approved 20,000,000-byte ZIP target. The only artifact upload step runs after that guard passes and retains evidence for 3 days. No installers, portable ZIPs, videos, traces, databases or real user data are uploaded. Large installer/Office native runtime files stay on the disposable runner; the full portable-release repack step is intentionally omitted.

Standard hosted runner compute is free for public repositories according to [GitHub billing documentation](https://docs.github.com/en/billing/concepts/product-billing/github-actions). Account-wide artifact allowance and enabled-Action settings still need to permit the run/upload; this workflow does not change billing, storage quotas or security settings. A quota/admission error is a blocker, not permission to enable paid capacity.

## Limits

This is silent NSIS install and same-version persistence coverage. It does not assess the native wizard, UAC, SmartScreen, publisher trust/code signing, real automatic updates, cross-version upgrades, Office conversion, AI provider calls, login-at-start or another application's actual shared database. `WORKBENCH_TEST_DATA_DIR` isolates both `OnoWorkbench` and `To-Do-List`; it intentionally disables automatic updates and launch-at-login registration.

Production release commands and version/tag procedures remain in [RELEASE.md](RELEASE.md). No version increment or release is required for this branch-only pilot.
