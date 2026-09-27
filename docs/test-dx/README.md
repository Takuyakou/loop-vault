# Test DX execution levels

This package optimizes the way existing contracts are selected and reported. It does not reduce the final merge gate. The [measured baseline](00-baseline.md) and [product contract matrix](../test-rationalization/01-contract-matrix.md) remain the coverage references.

| Level | Use | Contract |
| --- | --- | --- |
| FAST | After a meaningful source edit | Changed/related Vitest plus a minimal permanent owner smoke test, app TypeScript and source-contract lint. No broad browser run. |
| FEATURE | At an area checkpoint | Dependency-related Vitest and the area's permanent contracts; one representative browser path if the change affects browser presentation. |
| UI | For changed browser behavior | Selected owning Playwright specs; the existing critical UI set when no path is supplied. |
| FULL | Once for a merge candidate | Fresh app/E2E TypeScript, lint, docs/AI/privacy, production build, all Vitest, all Playwright including accessibility; no cached PASS may skip it. |

The selector must explain ownership. Shared/core and unknown source changes expand conservatively. A directly changed test file is always selected. Local logs and PASS cache belong under ignored `.local-evaluation/`; neither enters Git. A failing run prints diagnostics and remains a failing exit status. No skip/fixme/retry or snapshot update is part of these levels.

Current command behavior and proposed improvements are distinguished in the [baseline](00-baseline.md). The command reference will be completed after implementation and verification.
