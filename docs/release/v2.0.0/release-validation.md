# v2.0.0 Validation

Status: LOCAL RELEASE CANDIDATE VALIDATION PASS / READY FOR RELEASE AUTHORIZATION. Publication has not run.

## Scope

Source master `36fd6aaa`; no Product implementation changes or new research adoption. Existing version sources package/lockfile/Tauri/Cargo are unified to 2.0.0. About reads the package version through the existing buildInfo/Vite path; no additional version constant. Vault remains fileVersion 2.

## Dependency security isolation

Existing repository gate `npm run security:audit` rejects High/Critical. Initial scan identified brace-expansion 5.0.9 (dev-only ESLint dependency). `npm audit fix --dry-run` proposed only the patch to 5.0.12; `npm audit fix` applied only that transitive package entry, alongside the intentional root release version edits. No force/major framework upgrade.

Final npm gate: PASS at preparation; production dependency audit 0. Existing Vitest/@vitest/mocker Moderate 2 remain development-only. No runtime dependency advisory. A Vitest major migration is outside this release. Primary advisory: [brace-expansion](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr), [Vitest](https://github.com/advisories/GHSA-82fw-gwwq-j7x9).

Focused preparation: domain/security/view 10 tests, runner 6 tests, Settings visual/version UI 1 PASS. No test expectation or screenshot baseline change. These preparation executions precede the final candidate commit; fresh committed-HEAD results will be recorded separately.

## Required final gates

- fresh FULL (PASS cache off): lint, App/E2E TypeScript, phase-doc/AI-handoff, privacy/security, production build/gallery, runner, full Vitest, repository Playwright/accessibility, diff check
- Rust tests with locked dependencies
- public release tree/history scan
- Windows production distribution: EXE / NSIS / MSI / checksums
- smoke of production main route and JS errors, with no real Vault mutation

The final local executions are recorded below. This does not claim remote CI or publication PASS.

## Rust advisory isolation / revised candidate

The first fresh FULL at `e219d42a` passed (Vitest 3,792/3,792; Playwright 225/225; 0 FAIL / 0 UNRUN; 359.6s), and Rust 42/42 passed. These are results of that HEAD, not the forthcoming dependency-patched HEAD.

A separate fresh RustSec audit using database commit `117edb3bed98e9be112f277b7615eea3252e7c43` failed on `RUSTSEC-2026-0285`: rustls 0.23.42, reachable through reqwest on Windows. [RustSec](https://rustsec.org/advisories/RUSTSEC-2026-0285.html) specifies the patched 0.23.45 line. The isolated lockfile update is rustls 0.23.42→0.23.45 and its required rustls-webpki 0.103.13→0.103.15; no other dependencies or Product logic changed. The updated committed candidate `d70623ae` received the final fresh FULL, Rust tests, production artifacts and smoke recorded below; first-build artifacts are not distribution assets.

Informational audit warnings are retained rather than suppressed: six unmaintained packages, event-listener/glib unsound notices and one yanked chacha20 version. The two unsound-notice packages and the yanked package are absent from the x86_64-pc-windows-msvc dependency tree; framework-wide or cross-platform major migrations are outside this Windows release. No advisory ignore flag or weakened gate is used.

## Final fresh execution

Tested code HEAD: `d70623aef30c19b7fa7c92ba70dc8ab6284615b4`. Source master: `36fd6aaa570e01d99343a3ba806e3901165e487a`. This report update and asset/notes records are documentation-only; they are not another tested code HEAD.

`node scripts/test-dx/run.mjs full --fresh`: PASS, 360.0s. FULL PASS cache was not used. No test/expectation/baseline/skip/retry change was made for release.

| Gate | Final result |
| --- | --- |
| Repository ESLint | PASS 25.0s |
| Class lint / source contracts | PASS 0.4s / 0.1s |
| App / E2E TypeScript | PASS 13.5s / 1.7s |
| Phase docs / AI handoff | PASS 0.6s / 0.2s |
| Privacy/security source scan | PASS 1.3s |
| Production web build / gallery excluded | PASS 9.6s / 0.2s |
| Runner contracts | PASS 27/27 |
| Full Vitest | PASS 3,792/3,792; 68.8s |
| Repository Playwright including accessibility | PASS 225/225; 238.4s |
| FAIL / UNRUN | 0 / 0 |
| git diff --check | PASS |
| Rust locked tests | PASS 42/42; 0 ignored; 78s compile / 0.44s tests |
| npm audit release gate | PASS; production 0; dev-only Moderate 2 retained |
| RustSec fresh audit after patch | PASS; vulnerabilities 0; no ignore flag |
| Public history audit | PASS 4,302 new text blobs; protected object paths 0; findings 0 |
| Windows EXE / NSIS / MSI | PASS; all 2.0.0; asset validity/checksums recorded separately |

FULL emitted 29,361 bytes of detailed raw logs to the ignored local logs directory; console summary and compact gate results are retained locally. The initial e219d42a FULL PASS is historical evidence only, superseded by this final dependency-patched HEAD.

## Production smoke / privacy

The final Tauri frontend build uses real code metadata `d70623ae` and 2.0.0, not visual-test metadata. Production browser smoke: HTTP 200, main route/Home, Capture and Settings/About visible; page exceptions 0, console errors 0. Fixture markers absent from production bundles; gallery query renders the normal app; existing gallery exclusion gate PASS. Anonymous empty-store screenshots remain local-only.

The smoke used the actual production frontend with `BrowserMemoryVaultStorage`. No product test-only instrumentation was added. The native EXE was not launched on the user's profile: native startup accesses app cache and initializes native Vault storage, so it would not provide an isolated no-touch smoke. Native launch/audio/device/installer upgrade acceptance is not claimed. Rust tests use temporary storage and verify existing native persistence behavior. Existing Vault/backup/media were not read, restored, repaired or changed.

Binary scans of the final EXE and both installers found no personal paths, actual workspace path or readable absolute build-drive paths. Compiler source remapping and basename-only PDB reference replace local build paths before packaging. Assets are never added to Git. Existing unrelated untracked audit/diagnostic files are untouched.

## Finalization boundary

The candidate contains version/documentation updates and two isolated security patch sets only; no Product algorithm or NO-GO research adoption. Stage is ready for one combined human decision on scoped local master integration, normal master push, annotated v2.0.0 tag/push and public GitHub Release upload. Chat-provided AGENTS requires per-merge authorization and a separate human-initiated push; package text cannot authorize itself. Public verification will be appended after authorized publication. No push/tag/release has happened here.
