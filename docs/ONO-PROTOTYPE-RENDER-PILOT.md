# Historical prototype render/attachment pilot (draft, not activated)

This is a separate, manual-only preparation for the next attachment experiment.
It does not change the production policy pin or enable an issue listener, approval
adapter, development runner, merge, release, or acceptance gate.

## Exact candidate, not a new design

- Existing source: `design/mockups/design-a-glass.html`.
- State: `historical-design-a-home`, initial home view, three sidebar items.
- Output: 1440 × 1024 at deviceScaleFactor 1 (1,474,560 pixels).
- This is the historical Design A prototype, not the current product design.
  Its old dates/text are intentionally preserved. Ubuntu font fallback differs
  from Windows; this is not a claim of current product visual acceptance.
- The source is normal reviewable design code, not an encoded image or backup.

**This changes the generation chain:** dot prepares/reviews source; Actions
renders the final PNG. It does not transfer an ImageGen bitmap from dot to
Actions. This alternative and the exact page/state must be accepted in the main
conversation before publishing it.

## What has and has not been exercised

The draft adds a manual workflow, bounded PNG adapter, render/upload separation
and mock regression tests. It has not been dispatched on Actions, has not
rendered this real prototype, and has not uploaded or visually reviewed its
result. Ordinary PR CI runs unit/build/Windows checks, not this manual workflow.
Opening this PR does not render or publish the candidate prototype image. The
existing ordinary CI retains its established acceptance screenshots/reports; this
pilot does not add an image artifact, base64 payload, cache upload, service or secret.

## Security and retention

The workflow accepts only this repository, owner actor (including numeric actor
ID), owner triggering actor, main ref, and the exact reviewed main SHA. Checkout
credentials are not persisted. The default `post_attachment=false` installs a
small isolated lockfile and renders/checks only; no PAT is injected and no issue
comment is written. Both publication inputs have no default target.

Install Playwright 1.63.0 from the committed integrity-locked package tree before
rendering. Chromium runs as the runner user with its sandbox explicitly enabled,
inside a kernel network namespace with no external interfaces. Namespace or
sandbox failures stop the run; there is no permissive fallback. The inline-only
candidate is loaded with setContent, restrictive CSP, offline context, service
workers blocked, all requests/WebSockets denied, downloads disabled and no
permissions. There is no repository HTTP server or arbitrary URL/path parameter.

Install and render steps receive no PAT. The browser is closed before the
separate dependency-free publisher step receives ONOSAN_GH_TOKEN. This remains
one job because image transfer through Actions artifacts would create another
image copy. **Step-scoped credentials are temporal separation, not a sandbox
against malicious same-job source/dependencies.** Only explicitly reviewed,
trusted main source is supported; never run a PR head or arbitrary source with
this workflow. The network namespace does not make the checkout filesystem
read-only. Stronger hostile-code isolation is outside this pilot.

PNG bytes exist only in runner memory and a private temporary directory, removed
by an always cleanup step. There are no image artifacts, cache actions, repository
images or base64 logs. Normal npm download caches/browser downloads are temporary
runner files, never uploaded. Only the explicitly approved native GitHub
attachment persists after publication. Logs may retain its public URL, source
identity and hashes, not image bytes. GitHub's native attachment is not a promise
of immutable or permanent storage.

## PNG and evidence boundary

The adapter accepts bounded 8-bit noninterlaced RGB/RGBA PNGs, validates CRC,
chunk order, filters and exact inflation length, expands RGB alpha to 255 and
preserves pixels. It rejects unsupported/colour-affecting chunks rather than
silently changing appearance. The canonical PNG is RGBA8 with only
IHDR/IDAT/IEND and stays within the unchanged 4-million-pixel/20-MB limits.
Regression tests compare normalized pixels with the existing production decoder.
The manifest binds source/file digests, SHA, run/attempt, viewport, actual browser
version, original screenshot hash, canonical PNG hash and pixel digest.

The uploader revalidates the bounded regular output and exact manifest before
one attachment call. Readability, hash correctness or size is not a high-fidelity
review. The production `checkDesign` policy and its verifier remain unchanged;
no verifier is replaced with `true`.

## Publication and same-URL plan flow

1. Review and merge the preparation only if explicitly authorized. Merging this
   PR is not authorized by its creation. Record the resulting main SHA.
2. Main conversation approval must specify that SHA, candidate/page/state,
   exact target issue, a unique approval marker and public upload of this one
   image. Source publication and image/plan/development approvals are distinct.
   Inputs are audit bindings, not cryptographic proof of a human approval.
3. Dispatch manually on approved main. The existing connector does not provide
   dispatch; use only a separately available and authorized triggering route.
4. Before upload verify current main, PAT viewer zhshenry, repository ID/write
   access, open/unlocked issue, first attempt and absence of the approval marker.
   Recheck immediately before the sole gh 2.102.0 `--attach` call.
5. Read the resulting issue comment. Require the expected author, body and one
   exact Markdown native-attachment URL. URL recovery is not yet image-access or
   visual verification. Open the actual attachment and compare its bytes/hash.
6. dot uses its existing authorized text-file connector to insert **that same
   URL** into the explicitly selected plan, with a source/version-bound edit or
   reviewable PR. No second image upload and no expansion of the runtime PAT's
   Issues-write/Metadata-read scopes are needed. Plan writing is outside this
   workflow. After final URL insertion calculate the final plan digest and
   obtain the separate main-chat plan approval before development.
7. Confirm actual embedding and accessibility in both plan and comment, then
   perform visual review. Do not claim this pilot completes the production
   trusted approval/persistence/visual adapters.

If the upload call fails or times out, query for the marker but never retry the
write automatically. A matching comment can aid recovery; zero matching comments
cannot prove no orphan asset exists. Do not rerun or create a fresh dispatch after
uncertainty until reconciliation and renewed main-conversation authorization.
The shared concurrency group prevents simultaneous pilot upload runs; it is not
a persistent exactly-once transaction service.

No token is read locally, copied, exposed, expanded or changed by this PR.

## Definition-validation correction

The first merged preparation (`57ab8d0`) was rejected by GitHub before any job ran:
line 44 referenced `runner.temp` in job-level `env`, where that context is not
available. The corrected definition gives the identical browser path to the
install and render steps separately; no authority or publication scope changes.

Ordinary Linux PR/main CI now runs `tooling/check-workflows.mjs` before installing
application dependencies. It downloads official actionlint **1.7.12**, validates
the archive against the pinned SHA256
`8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8`
(from upstream `actionlint_1.7.12_checksums.txt`), then checks all workflow files,
including manual-only workflows. The same executable must reject a reconstruction
of the historical error with an expression diagnostic specifically naming the
forbidden `runner` context. Missing binary, wrong version, validation errors or a
non-reproduced regression fail CI. No workflow command is executed by this lint.
Optional external shellcheck/pyflakes integrations are disabled to keep this
check focused on Actions semantics; no Actions expression check is ignored.

This addresses the previous gap: generic YAML parsing and string tests did not
validate expression-context availability. Passing actionlint still does not
prove a real runner can launch Chromium, render the prototype, or publish it.
The manual render/upload remains unexecuted and separately authorized.
