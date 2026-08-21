# Loop Vault v1.1.0 P1 Security Hardening Report

## Determination

**PASS — repository-side P1 hardening complete**

The five P1 findings from `SECURITY-AUDIT-v1.1.0.md` were addressed on
code candidate `6fa5ec9d8930083738b83954a06338a706b66bb9`.

This is a focused hardening change. It does not start P5.22, change product
features, merge to `master`, publish artifacts, or push a branch.

External repository and release controls that require owner or signing
authority remain explicit follow-up actions. They are not represented as
completed by this report.

## Scope and results

### SEC-001 — CSP and Tauri capability reduction

- Replaced the null CSP with a restrictive application policy.
- Reduced the main-window capability to the operations and application-data
  paths used by the current product.
- Added an isolated Live MIDI window capability without file-system, dialog, or
  opener permissions.
- Verified the exact capability identifiers with focused tests and Tauri
  release compilation.

### SEC-002 — bounded MIDI and Vault intake

- Added pre-read and post-read byte limits for MIDI files and externally
  selected Vault JSON.
- Added aggregate multi-file limits and structural SMF limits for tracks,
  events, notes, metadata, and duration.
- Applied the same fail-closed validation at repository boundaries so alternate
  storage adapters cannot bypass the external-file checks.
- Error messages are generic and do not disclose paths or imported content.

Locked limits:

| Resource | Limit |
| --- | ---: |
| MIDI files per intake | 16 |
| MIDI bytes per file | 16 MiB |
| Total MIDI bytes | 64 MiB |
| Tracks | 256 |
| Events | 500,000 |
| Notes | 250,000 |
| Metadata per event | 16,384 code units |
| Total metadata | 1 MiB |
| Duration | 100,000 beats |
| External Vault JSON | 16 MiB |

### SEC-003 — current-path cleanup and redacting scanner

- Replaced personal absolute paths in the two currently tracked legacy work
  reports with repository-relative references.
- Added a redacting repository scanner for personal path roots and high-signal
  secret patterns.
- Scanner diagnostics expose only file, line, finding kind, and a redacted
  placeholder; matched values are not printed.
- Added scanner tests and a package-script entry suitable for local and CI use.
- Git history was not rewritten. That remains a separate policy decision.

### SEC-004 — repository-side supply-chain controls

- Added a minimal-permission security workflow for pull requests, `master`,
  scheduled runs, and manual runs.
- Pinned third-party GitHub Actions to immutable commit identifiers.
- Added npm and Cargo checks, RustSec scanning, static checks, tests, and build
  verification.
- Added weekly Dependabot configuration for npm, Cargo, and GitHub Actions.

The following owner-operated controls remain pending and were intentionally not
changed here:

- Authenticode signing of Windows artifacts.
- Signed Git tags and/or published checksum signatures.
- GitHub branch protection and required status checks.
- GitHub security-feature toggles that require repository administration.

The new workflow becomes effective only after an authorized merge and push.

### SEC-005 — npm advisory remediation

- Updated only the lockfile through the standard npm audit fix path; no forced
  upgrade was used.
- Product dependency ranges were not changed.
- Resolved lockfile versions include the patched releases of
  `brace-expansion`, `nanoid`, and `postcss`.
- Both full and production-only npm audits report zero known vulnerabilities.

## Verification on the exact code candidate

| Gate | Result |
| --- | --- |
| Dependency restore with `npm ci` | PASS — 328 packages, 0 vulnerabilities |
| Phase documentation validation | PASS — 9 packages |
| Phase validator tests | PASS — 25 tests |
| Security scanner tests | PASS — 3 tests |
| Repository security scan | PASS |
| npm audit / production-only audit | PASS — 0 / 0 |
| Lint | PASS |
| Application TypeScript | PASS |
| E2E TypeScript | PASS |
| Focused security and intake regressions | PASS |
| Full Vitest | PASS — 332 files / 2,475 tests |
| Rust tests | PASS — 41 tests |
| Full Playwright | PASS — 61 tests |
| Web production build | PASS |
| Tauri release build | PASS — direct executable, MSI, and NSIS |
| `git diff --check` | PASS |

The existing non-failing bundle-size advisory remains unchanged.

## Test-output and privacy hygiene

Post-build verification on the code candidate confirmed:

- working tree clean;
- Cargo manifest diff zero;
- visual baseline diff zero;
- P5.22 diff zero;
- tracked MIDI diff zero;
- tracked `.local-evaluation` diff zero;
- no generated test output became tracked;
- no private audio, MIDI, or personal absolute path was added.

## Commits and next action

- Audit source: `dcbf998b683bcbc2256a44fdacc862c6fb523b9f`
- Hardening code: `6fa5ec9d8930083738b83954a06338a706b66bb9`
- Branch: `chore/security-p1-hardening`

Recommended next action: review this independent hardening branch, then
explicitly authorize its merge into `master`. Push and the remaining
owner-operated release controls require separate authorization. P5.22 remains
unstarted.
