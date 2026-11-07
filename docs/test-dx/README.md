# Test DX execution levels

This package optimizes the way existing contracts are selected and reported. It does not reduce the final merge gate. The [measured baseline](00-baseline.md) and [product contract matrix](../test-rationalization/01-contract-matrix.md) remain the coverage references.

| Level | Use | Contract |
| --- | --- | --- |
| FAST | After a meaningful source edit | Changed/related Vitest plus a minimal permanent owner smoke test, app TypeScript and source-contract lint. No broad browser run. |
| FEATURE | At an area checkpoint | Dependency-related Vitest and the area's permanent contracts; one representative browser path if the change affects browser presentation. |
| UI | For changed browser behavior | Selected owning Playwright specs; the existing critical UI set when no path is supplied. |
| FULL | Once for a merge candidate | Fresh app/E2E TypeScript, lint, docs/AI/privacy, production build, all Vitest, all Playwright including accessibility; no cached PASS may skip it. |

The selector must explain ownership. Shared/core and unknown source changes expand conservatively. A directly changed test file is always selected. Local logs and PASS cache belong under ignored `.local-evaluation/`; neither enters Git. A failing run prints diagnostics and remains a failing exit status. No skip/fixme/retry or snapshot update is part of these levels.

## Commands

```text
npm run test:fast -- src/components/capture/textCaptureStatus.ts
npm run test:feature -- src/styles/text-intake.css
npm run test:ui -- src/styles/text-intake.css
npm run test:ui                         # existing nine-spec critical UI set
npm run test:full                       # always fresh and repository-wide
```

Pass one or more repository-relative changed paths to FAST, FEATURE or UI. FAST/FEATURE without paths infer the branch delta against local `master` plus tracked/untracked working code changes; prefer explicit paths during a narrow edit. UI without paths retains the existing critical browser set; `npm run test:ui -- --changed` selects from the branch delta. Add `--explain` for all per-file ownership reasons. Add `--fresh` to FAST/FEATURE/UI to bypass the same-state PASS cache. FULL ignores cache by design.

The [selector](../../scripts/test-dx/selection.mjs) maps source files to product owners and their permanent contract tests. Vitest's dependency graph augments those tests. CSS changes select owning tests rather than silently passing with zero tests. Changed test files run directly. Shared/unknown product files broaden to all Vitest and, at UI level, all Playwright; test-runner edits run their Node contracts. Documentation selects phase and AI-handoff validators; security owners also run the tracked privacy scan. The reasons are printed in the command summary.

Each command stores its complete log under ignored `.local-evaluation/test-logs/`. Success output is a short PASS/count/duration summary; failure output includes the failed assertion or spec and the local log path. No retry, skip, snapshot acceptance, or zero-test success is used to make a gate green.

FAST, FEATURE and UI reuse only a previous PASS with the same HEAD, dirty tracked/untracked relevant state, installed/config dependency hash, gate and selected inputs. A failed run is never cached. Editing source, tests, configuration, or selection invalidates the key. The local cache is ignored under `.local-evaluation/gate-cache/`. The final FULL executes every step afresh even if an earlier gate on the same HEAD passed. The production build and fixture-enabled Playwright build remain separate; FULL skips only the Playwright runner's duplicate TypeScript pass after its own app TypeScript check.

Warning budgets: FAST >30s, FEATURE >60s, UI >120s, FULL >240s. They signal an investigation, never automatic coverage reduction. A FEATURE run that changes browser presentation may exceed 60s because it includes a real browser path. The [baseline](00-baseline.md) and [worker benchmark](05-worker-benchmark.md) provide the measured reference. Existing `npm test` and `npm run test:e2e` remain available.

## Explicit browser lists and timing evidence

A list consisting only of `e2e/*.spec.ts` paths is an exact browser request in FAST/FEATURE/UI. Shared or unmapped spec names do not expand that request to the repository. A missing explicit spec fails. Mixing source paths into the request retains conservative owner expansion; this is how shared source changes continue to receive broad coverage. FULL ignores file selection and always runs every configured project/test. UI with a non-browser owner and no selected browser test fails rather than silently running everything or nothing.

```text
npm run test:ui -- e2e/p14-midi-connection.spec.ts --fresh
npm run test:feature -- src/styles/text-intake.css --fresh
```

Each invocation also writes a local `*-metrics.json` beside its logs: execution HEAD, level, cache eligibility, total time, per-step durations, actual cache hits and counts. Browser gates write `*-timing.json` with every discovered test, result, duration, retry, worker and failure artifact references. These reports are evidence, not PASS caches. They never alter scheduling or test outcomes. Existing conditional skips remain visible in counts. Zero passing tests fail the runner. Logs/reports stay Git-ignored; do not commit private inputs or traces.

FEATURE/FAST browser checks reuse only the successful app TypeScript check in that same invocation. They still build the fixture bundle and run the browser tests. UI, which has no preceding app TypeScript step, retains that precheck. Production and fixture builds remain separate.

Local Playwright workers use one quarter of available logical CPUs, bounded to 2–6 (6 on the measured i7-13700F); CI remains 1. `test:e2e -- --workers=2` remains available for constrained environments. Specs remain sequential internally (`fullyParallel=false`); contexts, failure artifacts, retries and timeouts are unchanged. See the root `TEST-PERFORMANCE-OPTIMIZATION.md` for the measurement and stability limits. Automatically inferred `--changed` spec lists retain owner expansion; only manually supplied all-spec lists are exact.
