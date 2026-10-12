# Fixed prototype render/attachment pilot (retired entrypoint)

Status, 2026-10-12: this simplification candidate removes
`.github/workflows/ono-prototype-render.yml`. Source scripts, the fixed candidate
registry and their security regression tests remain for history and review;
there is no active pilot dispatch entrypoint in this candidate. Verify the exact
remote commit before describing the retirement as merged. This document does not
authorize execution, restoration, a new trigger or additional credentials.

The [fixed historical document](https://github.com/zhshenry/onosan_workbench/blob/673febb3ba2e24d17772092bc7d8956642574bee/docs/ONO-PROTOTYPE-RENDER-PILOT.md)
and [historical YAML](https://github.com/zhshenry/onosan_workbench/blob/673febb3ba2e24d17772092bc7d8956642574bee/.github/workflows/ono-prototype-render.yml)
retain the complete preparation, dispatch, diagnosis and security history.
Historical connector limitations and proposed future connection steps are not
current setup instructions. Daily work follows the [Issue workflow](ONO-ISSUE-WORKFLOW.md):
one formal task wakes dot, with one coordinator and normal approval boundaries.

## Verified historical outcome (2026-10-09)

The separately approved [run 37881203730](https://github.com/zhshenry/onosan_workbench/actions/runs/37881203730)
completed at main `7313fddf62f69561c492d553ca02548b7b704126`, attempt 1,
and published one image in [comment 6073909178](https://github.com/zhshenry/onosan_workbench/issues/7#issuecomment-6073909178).
The [historical Design A record v1](ONO-HISTORICAL-DESIGN-A-RECORD.md)
contains that same native-attachment URL and its source/state/run/hash.
The original comment left visual review pending. This historical run does not
prove current attachment availability, current CI, or product visual acceptance;
this cleanup does not regenerate, download, upload or back up its PNG.

The retained registry also contains `issue-13-year-picker-v1`, one fixed
1440×1024 three-state board, in addition to the default
`historical-design-a-home`. The [Issue 13 preparation record](https://github.com/zhshenry/onosan_workbench/blob/673febb3ba2e24d17772092bc7d8956642574bee/docs/ONO-ISSUE-13-DESIGN-RENDER.md)
is a historical preparation-stage snapshot, not the final implemented proposal.
Later #13 implementation and closeout evidence is dated separately in the
[retrospective](ONO-AUTOMATION-READINESS.md).

## Retained security regression boundaries

- Source/state, path, hash, viewport and publication target are code-owned. No
  arbitrary PR source, URL, selector or dimensions become an approved input.
  Historical execution was restricted to the repository owner (including numeric
  actor and triggering-actor checks), main and an exact reviewed main SHA.
- Rendering was isolated from the PAT: nonroot sandboxed Chrome, network namespace,
  offline context, strict CSP, blocked requests/WebSockets/downloads/service
  workers and no permissive fallback. Trusted main source was required;
  step-scoped credentials never claimed hostile-source isolation.
- The retained system-Chrome gate still checks the exact official payload manifest,
  package version, ownership and existing profile evidence. Its read-only checks
  do not install profiles, alter permissions/sysctl/sudoers or disable the sandbox.
  The retired Linux probe is no longer a daily CI requirement. Mock regression
  tests remain; neither they nor old runs prove current Chrome runtime eligibility.
- The publisher retains identity/main/issue/marker rechecks and one first-attempt
  attachment call. A marker is audit data, not human approval. An uncertain write
  requires readback; zero comments cannot exclude an orphan asset. No blind retry
  or new marker is allowed to evade that uncertainty.
- The parameter helper remains text-only: no network, credentials, child process,
  image or GitHub write. Its output targets the retired workflow and is historical
  data, not a usable dispatch route. Do not pipe it to an API or request new access
  merely to revive the pilot.

## PNG, evidence and retention

`render-pilot/png.mjs` retains bounded RGB/RGBA normalization and malformed-PNG
regressions. `tooling/ono/evidence.mjs` now contains only the standalone narrow
RGBA PNG decoder used by these checks; the old core approval/acceptance APIs,
policy pin and dedicated simulation fixtures/tests are removed. PNG parsing and
hash agreement are not visual review or trusted approval.

The retained manifest binds source/file digests, full SHA, run/attempt, viewport,
browser version and PNG/pixel digests. Historical output existed only in memory
and private temporary files before the single authorized native attachment.
PNG must not enter Git, image artifacts, caches, base64 logs or extra backups.
Native attachment durability is not guaranteed. Plans and comments reuse the
same authorized URL and verify actual accessibility and visual content separately.

## Workflow-semantic regression retained on Windows

The historical job-level `runner.temp` error prevented jobs from starting.
`tooling/check-workflows.mjs` keeps a small standalone invalid definition and
requires actionlint to reject that exact forbidden-context expression. It does
not restore either retired YAML or execute workflow commands.

The [Windows acceptance workflow](WINDOWS-CLOUD-PILOT.md) now carries official
actionlint 1.7.12 with the Windows archive checksum pinned. All active workflow
files still receive schema/expression validation; the historical negative case
must also fail as expected. Real Windows file-symlink and parent-junction rejection
checks are a separate requirement before accepting Linux removal. Full tests,
verify, installed-app UI/restart and evidence safeguards remain. Exact candidate
CI must be observed; this document does not claim it already passed.
