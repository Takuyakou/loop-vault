# Loop Vault v1.1.0 Security Audit

- Audit date: 2026-08-13 (Asia/Tokyo)
- Repository: `Takuyakou/loop-vault` (public)
- Audited release commit: `5b7b3d939b20a3d10283da1ee6d07a6423578a25`
- Audited tag: `v1.1.0` (annotated, unsigned)
- Audit branch: `audit/security-v1.1.0`
- Scope: source, complete reachable Git history, Tauri commands and capabilities,
  frontend injection surfaces, MIDI/Text/Vault inputs, persistence and privacy,
  dependencies, native `unsafe`, release assets, and repository automation
- Method: read-only source/history review plus dependency scanners and test gates

> Git reality note: the request described this as a pre-release audit, but GitHub
> shows that v1.1.0 was already published on 2026-08-12. This report therefore
> treats the work as a post-publication audit of the exact released commit. No
> release, tag, branch, asset, secret, or history was changed by this audit.

## Executive summary

No Critical or High product vulnerability was demonstrated. No private key,
GitHub token, AWS key, npm token, bearer credential, credential-bearing URL, or
generic assigned secret was found in the complete reachable Git history by the
redacted pattern scan. The released runtime dependency sets also had no known
npm production or RustSec vulnerability at audit time.

The audit found five Medium issues and three Low issues. The most important are:

1. the Tauri renderer has no CSP and is granted broader filesystem/opener
   capabilities than its ordinary product paths require;
2. selected MIDI and imported Vault files are read and parsed without a
   pre-read size/event budget, permitting local denial of service;
3. personal absolute paths remain in historical commits and two old tracked
   work reports;
4. published Windows binaries and the release tag are unsigned, while `master`
   has no branch protection or CI security workflow; and
5. the development/build dependency graph contains three npm advisories marked
   High upstream, although none is present in the shipped production graph.

Because the release is already public, the recommended posture is to triage the
Medium items immediately and ship a focused hardening release. There is no
evidence in this audit that v1.1.0 is actively compromised.

## Severity summary

| Severity | Count | IDs |
| --- | ---: | --- |
| Critical | 0 | — |
| High | 0 | — |
| Medium | 5 | SEC-001 through SEC-005 |
| Low | 3 | SEC-006 through SEC-008 |
| Informational | 4 | INFO-001 through INFO-004 |

## Findings

### SEC-001 — Missing CSP and over-broad renderer capabilities

- Severity: Medium
- Category: Tauri/WebView hardening, least privilege
- Evidence:
  - `src-tauri/tauri.conf.json:23` explicitly sets `app.security.csp` to `null`.
  - `src-tauri/capabilities/default.json` applies one capability to both `main`
    and `live-midi` windows.
  - That capability includes `fs:default`, generic read/write/rename/copy/remove,
    `opener:default`, webview-window creation, and scopes for the user's Audio,
    Desktop, Documents, and Downloads trees.
  - `src-tauri/src/media_permission.rs` automatically grants WebView2 microphone
    permission requests of microphone kind.
  - The frontend audit found no production `dangerouslySetInnerHTML`, `innerHTML`,
    `eval`, `new Function`, `srcDoc`, `document.write`, or dynamic script sink.
- Exploit prerequisite: a separate renderer script-injection defect, compromised
  bundled frontend asset, or malicious code executing in a privileged WebView.
  No such injection entry point was found in v1.1.0.
- Impact: a future renderer compromise would have a larger blast radius than
  necessary, including local file access/removal in broadly scoped user folders,
  opening local items, creating windows, and requesting microphone access.
- Reproduction/verification:
  1. inspect `app.security.csp` in `src-tauri/tauri.conf.json`;
  2. inspect the permission list and path scopes in
     `src-tauri/capabilities/default.json`;
  3. enumerate frontend Tauri APIs and production HTML/script sinks.
- Recommended remediation:
  - define a restrictive production CSP compatible with Tauri assets;
  - split `main` and `live-midi` into separate least-privilege capabilities;
  - remove `fs:default` and `opener:default`, granting only the exact operations
    and application-data paths required;
  - prefer Rust commands or dialog-scoped tokens for user-selected external
    files instead of durable broad directory scopes;
  - keep microphone permission tied to an explicit, visible recording action.
- Priority: P1, before the next public feature release.
- False-positive considerations: this is defense in depth, not a demonstrated
  XSS-to-filesystem exploit. React escapes all audited user strings by default.

### SEC-002 — Unbounded MIDI and Vault import can exhaust local resources

- Severity: Medium
- Category: CWE-400 / untrusted local file handling
- Evidence:
  - `src/views/CaptureView.tsx` reads every selected path with `readFile` and every
    dropped browser file with `file.arrayBuffer()` before applying an intake
    budget.
  - `src/domain/midi/rawSmf.ts` passes the complete byte array to `midi-file`,
    then materializes and sorts tracks, events, notes, controls, and metadata.
  - no maximum MIDI bytes, track count, event count, note count, metadata length,
    or total tick/duration cap was found at the import boundary;
  - `src/storage/tauriVaultStorage.ts` uses `readTextFile` for external Vault
    imports, and `src/domain/repository.ts` parses the complete JSON string with
    no maximum external file size;
  - Text Progression Entry is not affected: it enforces 4,096 UTF-16 code units,
    12 bars, and 48 chord tokens in `src/domain/textProgression.ts`.
- Exploit prerequisite: the user selects or drops an attacker-crafted oversized
  MIDI/Vault file, or opens one received from an untrusted party.
- Impact: excessive memory/CPU use, UI freeze, or application process crash. No
  code execution or filesystem escape was demonstrated.
- Reproduction/verification: create a disposable, structurally valid MIDI with
  an extreme number of events or a very large Vault JSON and observe that the
  app reads it in full before rejection. This audit did not generate such a file
  to avoid destabilizing the host.
- Recommended remediation:
  - check file metadata before reading and re-check bytes after reading;
  - set explicit maximums for bytes, tracks, events, notes, text metadata,
    duration/ticks, and number of simultaneously selected files;
  - add bounded/streaming Vault import or a strict byte ceiling;
  - add deterministic near-limit and over-limit tests and user-safe errors.
- Priority: P1.
- False-positive considerations: exploitation requires explicit local file
  interaction; normal MIDI fixtures and current regression suites pass.

### SEC-003 — Personal absolute paths are present in public history and old reports

- Severity: Medium
- Category: privacy / information exposure
- Evidence:
  - a redacted scan of all reachable commit patches found 49 Windows personal
    path occurrences across 26 commit/path locations and 17 Unix-style path
    candidates across 16 locations;
  - current v1.1.0 contains actual personal Windows build paths in
    `docs/claude-phase2-work-report.md` and
    `docs/claude-phase2.5-work-report.md`;
  - other current matches are documented placeholders, negative security tests,
    or false positives from ordinary words and are not private paths;
  - the scan found no credential paired with those paths.
- Exploit prerequisite: none; the repository and history are public.
- Impact: disclosure of an OS account name and former local directory layout,
  which can aid profiling or targeted social engineering. No secret or raw
  private media was found in the disclosed lines.
- Reproduction/verification: run a redacting history scanner for Windows user
  roots and Unix home roots; never print the matched username/value in CI logs.
- Recommended remediation:
  - replace current report paths with repository-relative or generic examples;
  - add a redacting personal-path check to CI and release gates;
  - separately assess a coordinated history rewrite only if the privacy owner
    considers the historical username sensitive. Do not rewrite shared history
    casually.
- Priority: P1 for current tracked files; P2 for history-policy decision.
- False-positive considerations: the Unix pattern produced ordinary-word false
  positives; counts above deliberately distinguish candidates from confirmed
  current disclosures.

### SEC-004 — Release provenance and repository controls are not authenticated

- Severity: Medium
- Category: software supply chain
- Evidence:
  - `v1.1.0` is an annotated but unsigned Git tag (`git tag -v` reports no
    signature);
  - the direct EXE, MSI, and NSIS installer produced for v1.1.0 are all reported
    `NotSigned` by Windows Authenticode inspection;
  - GitHub reports `master` as unprotected;
  - `.github/workflows` is absent at the released commit;
  - Secret Scanning is disabled, and Code Scanning/Dependabot alert APIs are not
    enabled or not available for this repository;
  - GitHub does publish SHA-256 digests for all three release assets, and those
    are a useful integrity control, but they are not a publisher signature.
- Exploit prerequisite: compromise of the maintainer account, release workflow,
  local build host, or distribution channel.
- Impact: users cannot cryptographically authenticate the Windows publisher;
  unauthorized changes to `master`, tags, or assets have fewer independent
  preventive/detective controls.
- Reproduction/verification: inspect tag signature, Authenticode status, branch
  protection API, workflow tree, and release asset digests.
- Recommended remediation:
  - Authenticode-sign EXE/MSI/NSIS artifacts and timestamp signatures;
  - sign release tags and publish a signed checksum/provenance manifest;
  - protect `master` with review and required status checks;
  - add pinned-action CI for tests, npm/Rust advisory checks, secret scanning,
    source/path privacy checks, and reproducible artifact checks;
  - enable Dependabot and GitHub security features supported by the repository.
- Priority: P1 before the next release; consider reissuing signed artifacts if
  publisher authentication is required for v1.1.0.
- False-positive considerations: the current GitHub-hosted asset digests matched
  the release API and no tampering was observed.

### SEC-005 — Development/build graph contains known npm advisories

- Severity: Medium
- Category: dependency/build security
- Evidence:
  - `npm audit` reports three High-severity packages in the full dependency
    graph: `brace-expansion`, `nanoid`, and `postcss`;
  - dependency explanation shows all three are dev-only paths through ESLint or
    CSS/build tooling;
  - `npm audit --omit=dev` reports 0 vulnerabilities;
  - affected behaviors require attacker-controlled lint glob/brace input,
    non-secure generator size parameters, or a malicious CSS source-map input;
  - no affected package is part of the shipped application runtime graph.
- Exploit prerequisite: attacker influence over build/lint/CSS inputs or a
  developer executing tooling against malicious repository content.
- Impact: build-host denial of service or, for affected PostCSS source-map
  behavior, disclosure of a readable map file during a compromised build.
- Reproduction/verification: run `npm ci`, `npm audit --json`,
  `npm audit --omit=dev --json`, and `npm explain` for each package.
- Recommended remediation: update the lockfile through normal package tooling
  in a dedicated dependency-security change, review transitive movement, and run
  full tests/build/visual gates before release.
- Priority: P1 for build infrastructure; P2 for product runtime.
- False-positive considerations: upstream severity is High, but the audited
  product severity is reduced because all paths are dev-only and production
  audit is clean.

### SEC-006 — Microphone permission is auto-granted at the WebView layer

- Severity: Low
- Category: privacy / permission UX
- Evidence: `src-tauri/src/media_permission.rs` grants WebView2 microphone
  requests automatically; application code calls `getUserMedia` only after the
  user enables recording, and Windows still controls OS-level privacy access.
- Exploit prerequisite: renderer compromise or an unintended future call to
  `getUserMedia`.
- Impact: bypass of an application/WebView confirmation layer, although the OS
  privacy boundary remains.
- Recommended remediation: bind permission grants to a short-lived explicit
  recording intent or require a visible confirmation state; test denial and
  revoked-permission paths.
- Priority: P2. This primarily amplifies SEC-001.

### SEC-007 — Local diagnostics are enabled by default

- Severity: Low
- Category: privacy transparency
- Evidence:
  - `src/storage/analysisFeedbackStorage.ts` enables analysis feedback unless the
    local flag is explicitly `false` and appends JSONL under AppData;
  - correction schemas and privacy tests prevent raw MIDI, audio, filenames,
    private URLs, and absolute paths from entering the exported evaluation data;
  - Settings provides export/delete controls and the data is not networked.
- Exploit prerequisite: local account or malware access to the user's AppData.
- Impact: locally retained musical correction metadata may surprise users even
  though raw source material is not stored.
- Recommended remediation: disclose the default prominently, consider opt-in or
  first-use consent, document retention, and preserve one-click deletion.
- Priority: P2.

### SEC-008 — Device preference metadata is retained in WebView storage

- Severity: Low
- Category: local privacy
- Evidence:
  - `src/liveMidi/preferences.ts` stores preferred MIDI backend ID, display name,
    previous index, and mini-window bounds in `localStorage`;
  - retained recording metadata stores an input device display name, but not raw
    audio in Practice/Vault JSON;
  - no telemetry or network transmission path for these values was found.
- Exploit prerequisite: local account, WebView profile, or renderer compromise.
- Impact: local disclosure of connected-device names and user preferences.
- Recommended remediation: document the storage, minimize backend identifiers,
  add a clear-local-device-data control, and avoid including these values in
  exported diagnostics.
- Priority: P3.

## Informational observations

### INFO-001 — Secret and private media scan

- Complete reachable Git patch scan: 0 private keys, GitHub tokens, AWS access
  keys, npm tokens, bearer credentials, credential URLs, or generic assigned
  secrets.
- Current tracked MIDI: 0 files.
- Historical unique MIDI paths: 260. These are evaluation/history artifacts;
  their contents and names were not reproduced in this report.
- Current tracked audio: 33 files, all under the bundled Salamander piano or
  registered FreePats bass asset trees.
- `.local-evaluation` appears frequently as an ignored-path contract/reference;
  no tracked local evaluation input was found at the released commit.
- The repository contains unreachable Git objects. They were counted but not
  treated as part of the published reachable history; no destructive cleanup
  was performed.

### INFO-002 — Network and secret storage

- OpenAI requests go only to fixed `https://api.openai.com` endpoints, use the
  OS keyring, set `store: false`, enforce response-size/timeout/retry bounds, and
  expose safe error enums rather than provider bodies.
- Local LLM URLs are normalized to `localhost`, `127.0.0.1`, or `::1` and to the
  root path before requests. Arbitrary remote SSRF targets are rejected.
- Advisor requests can contain the current progression, optional instruction,
  tags, and up to three structured references. The UI identifies the selected
  provider and confirms paid OpenAI requests by default.
- No analytics/telemetry SDK or background network upload was found.

### INFO-003 — Storage integrity and recording lifecycle

- Practice storage is restricted to AppData, capped at 16 MiB, validates the
  envelope/version/revision, uses compare-and-swap tokens, bounded backups,
  cross-process locking, atomic replacement, and safe relative backup names.
- Vault storage uses a strict versioned Zod schema, atomic temp/rename, bounded
  backup count, quarantine, and user-confirmed import modes. External import
  size remains covered by SEC-002.
- Retained recordings are kept separately in IndexedDB, capped at 60 seconds per
  take and 200 MiB total, use opaque IDs, and have delete/orphan-cleanup paths.
- API keys are not stored in Vault, Practice JSON, localStorage, or reports.

### INFO-004 — Rust and native code

- RustSec database audit: 0 vulnerabilities in 510 locked dependencies.
- Informational unmaintained GTK3-family crates are present for non-Windows
  transitive platform support; the released target is Windows.
- Audited `unsafe` blocks are confined to Windows WebView permission handling,
  atomic rename APIs, and OLE drag-and-drop COM implementation. No shell/process
  execution command was found.
- Tauri commands generally return generic errors and validate path tokens,
  backup names, drag tokens, MIDI export names, and loopback LLM URLs.

## Tauri command and capability audit

The registered command surface is:

- application exit;
- MIDI export preparation/save/cleanup and native drag;
- Live MIDI input list/open/close;
- Progression Advisor local/OpenAI health, model list, request/cancel;
- OpenAI key status/set/delete via OS keyring; and
- Practice load/save/quarantine/backup list/read/restore.

No arbitrary shell command, process spawn, unrestricted Rust-side file read, or
arbitrary remote URL command was found. MIDI export accepts a dialog-selected
path and validates extension/header, but its renderer command is still powerful
if renderer integrity fails. Practice commands derive their paths internally.
The capability findings and recommended reductions are recorded in SEC-001.

## Frontend injection review

- No production direct-HTML or dynamic-code sink was found.
- User MIDI track names, progression titles, tags, memos, correction text, and
  Text Progression tokens are rendered as React text and therefore escaped.
- Saved reference URLs are displayed as text, not inserted as clickable `href`.
- Text Progression Entry is bounded, produces diagnostics instead of partial
  conversion, and revalidates its exact 4/4/1-2-4-token structure at the store
  boundary.
- The absence of CSP remains a future-risk multiplier, not evidence of a current
  injection vulnerability.

## Dependency and repository security posture

| Check | Result |
| --- | --- |
| `npm audit` | 3 dev-only advisory packages |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `cargo audit` | 0 vulnerabilities; informational unmaintained platform crates |
| GitHub Secret Scanning | disabled |
| GitHub Code Scanning API | not enabled/available |
| GitHub Dependabot alerts API | not enabled/available |
| `.github/workflows` | absent |
| `master` branch protection | absent |
| Tag signature | absent |
| Windows Authenticode | absent on EXE/MSI/NSIS |
| Updater | no auto-updater configured |

## Test and gate evidence

All commands below ran on the exact released commit before this report was
added. No baseline update or product change was made.

| Gate | Result |
| --- | --- |
| `npm ci` | PASS; lockfile unchanged |
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm run typecheck:e2e` | PASS |
| Security-focused Vitest | PASS, 5 files / 59 tests |
| `npm test` | PASS, 326 files / 2,455 tests |
| `cargo test` | PASS, 41 tests |
| `npm run build` | PASS; existing large-chunk advisory only |
| `npm run test:e2e` | PASS, 61 tests; visual baselines unchanged |
| `npm audit --omit=dev` | PASS, 0 vulnerabilities |
| `cargo audit` | PASS, 0 vulnerabilities |
| `git diff --check` | PASS before report generation |
| Test-output hygiene | PASS; no tracked generated output |
| Cargo.toml EOL check | PASS; no diff |
| Visual baseline check | PASS; no diff |

## Remediation priority

### P1 — immediate hardening

1. SEC-001: add CSP and reduce/split Tauri capabilities.
2. SEC-002: enforce bounded MIDI/Vault import budgets.
3. SEC-003: remove current public personal paths and add a redacting CI gate.
4. SEC-004: establish signed artifacts/tags, branch protection, and CI scanning.
5. SEC-005: update the dev dependency lockfile with full regression gates.

### P2 — next privacy/security iteration

1. SEC-006: tie microphone grant to explicit short-lived intent.
2. SEC-007: improve local analysis-feedback consent/retention disclosure.
3. Enable supported GitHub security alerts and scheduled dependency review.

### P3 — routine hardening

1. SEC-008: minimize and clear retained device metadata.
2. Add fuzz/property tests for raw SMF parsing and imported Vault JSON.
3. Add a SECURITY.md with private vulnerability-reporting instructions.

## Final decision

**ACTION REQUIRED — v1.1.0 is already public; no Critical/High compromise was
demonstrated, but the Medium findings should be triaged before the next release
and the highest-priority hardening should be delivered as a focused update.**

No secret rotation, release deletion, history rewrite, package update, tag,
push, asset upload, or source fix was performed as part of this audit.
