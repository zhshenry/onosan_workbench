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

## Safe render-stage diagnostics

The first real manual run at `b204258`
([37794111646](https://github.com/zhshenry/onosan_workbench/actions/runs/37794111646))
installed the renderer, entered its Node program and stopped before publication.
Its generic catch suppressed the underlying error. That run does **not** establish
whether browser launch, page readiness or PNG handling caused the failure.

The diagnostic-only update logs finite start/passed stage markers for preflight,
import, environment, browser_launch, page_load, assets, screenshot, png, output
and cleanup. Failures report only an allowlisted stage and error code. Known
system/timeout errors and a small set of explicit browser-launch diagnostics are
mapped to fixed codes; unmatched errors remain OPERATION_FAILED. Raw messages,
stacks, environment values, paths, HTML, page-console output and arbitrary
exception properties are never serialized. Known browser text is inspected only
to select a fixed code; it is not printed. Existing successful image hashes remain
part of normal provenance output.

Browser close is attempted after any post-launch failure. If it also fails, its
safe cleanup code is reported while the primary failure is preserved. Cleanup
failure after an otherwise successful capture still fails the process, so the
publication step cannot proceed. Existing always-run temporary-file cleanup is
unchanged. The in-process dependency adapters are for mock unit tests only; they
cannot be selected through workflow inputs.

Tests simulate each phase and hostile exception values. This update does not
weaken the Chromium sandbox, network namespace, CSP, no-secret rendering, source
binding or upload controls. It does not apply a guessed root-cause fix. A real
manual diagnostic run with `post_attachment=false` requires separate approval of
the new main SHA after merge; it has not been performed as part of this update.

## Guarded system Chrome candidate

The no-upload diagnostic [run 37869159636](https://github.com/zhshenry/onosan_workbench/actions/runs/37869159636)
reached browser_launch and returned BROWSER_SANDBOX_UNAVAILABLE. Preflight,
module import and filesystem setup passed. It never loaded the prototype or
published anything. The code combines more than one sandbox error signature;
that result alone does not prove AppArmor or a particular kernel setting caused
it.

The candidate change adds a read-only system_chrome gate before launching any
browser. It requires a nonroot effective renderer account, a fixed root-owned
system Chrome executable and wrapper, exact authenticated-source payload bytes, ownership by the installed
`google-chrome-stable` package, an exact package version plus verified official executable bytes, and the
known existing AppArmor Chrome profile/configuration plus loaded-profile state.
Missing, unreadable or unfamiliar evidence fails closed with a finite code.
It does not create, load or edit a profile, alter sysctl/sudoers/permissions,
install a setuid helper, start a root browser, or fall back to no-sandbox.

The accepted Chrome version is pinned to **154.0.8037.97**, listed in the exact
[runner image 20261004.327.1 manifest](https://github.com/actions/runner-images/blob/ubuntu24/20261004.327/images/ubuntu/Ubuntu2404-Readme.md)
used by that diagnostic. A later hosted-image/browser update is not silently
accepted. Package metadata alone is not source-content attestation. The runtime payload
now also requires exact SHA256/type/size/tree matching to the fixed manifest
derived from Google's exact official HTTPS package, as documented below. GitHub's [image installer](https://github.com/actions/runner-images/blob/ubuntu24/20261004.327/images/ubuntu/scripts/build/install-google-chrome.sh)
uses Google's official stable package source.

The kernel's loaded AppArmor profile list may not be readable by the ordinary
runner user. Only a fixed existing-sudo read of that one profile-list file is
permitted; raw contents stay in memory and are not logged. No new privilege grant
is configured. If that read is unavailable, the gate reports insufficient
verification rather than inferring that an on-disk profile is loaded.

Only after the gate passes does Playwright use the fixed system executable with
`channel: chrome` and `chromiumSandbox: true`. The browser's reported version must
also match before page creation. Network namespace, offline context, CSP, request
blocking, no-PAT rendering, publication gates and PNG guards remain unchanged.
The temporary manifest records the verified system-browser source/version/path,
nonroot UID and profile name. The existing pinned Playwright installation is
retained; downloaded bundled Chromium is not a fallback.

[Chromium's official explanation](https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md)
describes the distinction between downloaded builds and the system Chrome path
with an existing Ubuntu profile. That makes this a candidate compatibility fix,
not proof of the original AppArmor subcause or future runtime success.

Unit tests use mocked filesystem/process/command evidence and never read local
security configuration or start a browser. Ordinary Linux PR CI additionally runs
only the read-only system-browser eligibility gate against its actual runner:
account/path/package/profile checks and complete payload hashing, with no Chrome
process, Playwright launch, page, renderer, image, upload or PAT. A failed
precondition fails that check with a finite safe code; it is never relaxed to
make CI pass. This probe does not enter the main-only manual prototype workflow
or prove the browser can render under its network namespace. A real
post_attachment=false render requires separately approved post-merge main SHA;
no upload or main-branch runtime success is claimed by this PR.


### Correcting the hosted /opt assumption without changing its permissions

The first PR eligibility probes failed before any Chrome command because the
Chrome directory was writable. The exact image's official
[configure-system.sh](https://github.com/actions/runner-images/blob/ubuntu24/20261004.327/images/ubuntu/scripts/build/configure-system.sh)
recursively applies mode 777 to /opt. Non-writable Chrome ancestry was a new
conservative check in this PR, not a pre-existing user security requirement; it
was not a usable source-integrity proof for this hosted image.

The corrected gate does not chmod/chown anything or silently ignore content
integrity. Instead, it requires an exact offline match of the complete Chrome
runtime tree to `chrome-154.0.8037.97-manifest.json`: all expected files and
directories, file types, sizes and SHA256 hashes. Unexpected/missing entries or
symlink replacements fail before Chrome is executed. Root ownership, canonical
paths and executable/privileged-bit checks remain; only the known /opt writable
mode assumption is replaced by payload verification. Existing /etc AppArmor and
/usr tool protections remain unchanged.

The manifest source is this exact Google HTTPS URL:
https://dl.google.com/linux/chrome/deb/pool/main/g/google-chrome-stable/google-chrome-stable_154.0.8037.97-1_amd64.deb

- Package SHA256: `a4edbe95e9b01db6c9b97d7a1323121eda18362b5620df06abac1b59bee80053`
- Manifest SHA256: `f9dd5a61fcfd187eac5beecf9fa0e81c2b43751ad24779dea67af2fcc2bc9d9e`
- Runtime: 255 files and 8 directories, 456,937,066 bytes; no package symlinks in this subtree

Authentication is Google's official HTTPS origin with normal TLS certificate
verification, followed by reviewed digest pinning. It is **not** an APT signature
chain: the current signed package index no longer lists this older exact version.
No third-party mirror, installed runner files or runtime self-generated checksum
is used as the expected source. The `.deb` was inspected without installation or
execution; package bytes do not enter Git.

To reproduce, download that exact URL to a temporary file with verified HTTPS,
then run `python3 tooling/ono/render-pilot/make-chrome-manifest.py PATH_TO_DEB`.
The script first verifies the pinned archive SHA256 and package/version/amd64
control metadata, then streams archive contents with GNU ar and Python tarfile.
It never extracts or runs package scripts. Its JSON stdout must byte-match the
committed manifest. Reproduction was performed twice with the same manifest hash.

This remains a trusted single-job design: reviewed source/dependencies and no
hostile concurrent local process. Whole-payload hashing establishes bytes at
verification time, not an immutable mount or race-free future path execution.
GitHub-hosted runner jobs already have passwordless sudo; these checks are not
hostile-code isolation. A stronger adversarial-local-process requirement would
need a separately approved execution design rather than pretending repeated
hashing removes every TOCTOU race. Browser sandbox/network restrictions remain
mandatory and unchanged.


### Pure-read eligibility and actual runtime version

The eligibility gate does not execute Chrome, including a --product-version
query. The official full-byte manifest plus the exact installed package-version
pin establish its version/source input; a pin mismatch has its own
SYSTEM_CHROME_PACKAGE_VERSION_MISMATCH code and is never waived. The previous
combined VERSION_UNVERIFIED result does not establish whether the package pin or
CLI query caused it, so no unsupported root-cause claim is made.

Actual browser.version() remains mandatory immediately after the later authorized
sandboxed launch and before creating a page. This separates pure-read eligibility
from real browser execution rather than hiding a version mismatch. The only
external commands in eligibility are fixed dpkg-query reads and the fixed existing
sudo/cat profile-list read; there is no Chrome executable invocation or fallback.
