# v2.0.0 Validation

Status: preparation in progress. Candidate HEAD will be committed and fixed before fresh FULL. Past test counts are not current results.

## Scope

Source master `36fd6aaa`; no Product implementation changes or new research adoption. Existing version sources package/lockfile/Tauri/Cargo are unified to 2.0.0. About reads the package version through the existing buildInfo/Vite path; no additional version constant. Vault remains fileVersion 2.

## Dependency security isolation

Existing repository gate `npm run security:audit` rejects High/Critical. Initial scan identified brace-expansion 5.0.9 (dev-only ESLint dependency). `npm audit fix --dry-run` proposed only the patch to5.0.12; `npm audit fix` applied only that transitive package entry, alongside the intentional root release version edits. No force/major framework upgrade.

Final npm gate: PASS at preparation; production dependency audit0. Existing Vitest/@vitest/mocker Moderate2 remain development-only. No runtime dependency advisory. A Vitest major migration is outside this release. Primary advisory: [brace-expansion](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr), [Vitest](https://github.com/advisories/GHSA-82fw-gwwq-j7x9).

Focused preparation: domain/security/view10 tests, runner6 tests, Settings visual/version UI1 PASS. No test expectation or screenshot baseline change. These preparation executions precede the final candidate commit; fresh committed-HEAD results will be recorded separately.

## Required final gates

- fresh FULL (PASS cache off): lint, App/E2E TypeScript, phase-doc/AI-handoff, privacy/security, production build/gallery, runner, full Vitest, repository Playwright/accessibility, diff check
- Rust tests with locked dependencies
- public release tree/history scan
- Windows production distribution: EXE / NSIS / MSI / checksums
- smoke of production main route and JS errors, with no real Vault mutation

No final PASS or publication is claimed until executed.
