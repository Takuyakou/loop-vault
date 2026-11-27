# Test DX — Final report

## Decision

**TEST DX / TOKEN EFFICIENCY = COMPLETE / RELEASE COVERAGE PRESERVED / FINAL FRESH FULL PASS / READY FOR MERGE REVIEW.** The final repository-wide FULL gate is mandatory and never reads the local PASS cache. This work changes test orchestration, documentation and the internal Playwright runner's duplicate TypeScript check only; no product `src/**` behavior or test expectation was changed.

Baseline was local `master` at `1d2c43d`; the implementation gate below ran at `45148c2`. Measurements are single local runs, so timing differences are directional. Complete logs are ignored under `.local-evaluation/`.

## Before / after

| Gate / scenario | Baseline | Candidate | Result |
| --- | ---: | ---: | --- |
| FAST, Text Capture status edit | 36.4s, 4,591 B terminal output, 1,933 tests | 20.8s, 460 B terminal output, 119/119 tests | Owner smoke, related tests, TypeScript and source contracts retained; 43% faster for this edit |
| FEATURE, same edit after FAST | 9.0s, 2,475 B, 119 tests | 9.6s, 546 B, 119/119 tests | Same-state PASS reuse for already completed steps; 78% less terminal output |
| Cached FAST, unchanged state | No cache | 0.6s, 556 B, no test process | Only a previous PASS at the identical fingerprint is reused |
| UI, default critical set | 61.8s, 10,586 B, 35 tests | 57.1s, 267 B, 35/35 tests | Same nine critical specs; 97% less terminal output |
| FULL, repository-wide | 225.2s, 43,877 B, 3,751 Vitest + 129 Playwright | 210.4s, 614 B, 3,751/3,751 Vitest + 129/129 Playwright + 18/18 runner contracts | Fresh all-suite run; 7% faster and 99% less terminal output |

Candidate FULL raw local logs totaled 23,941 B; 614 B reached the terminal. Baseline's 43,877 B raw terminal output included per-test success noise. The candidate's smaller raw log also reflects compact Vitest and Playwright reporters; full diagnostics remain in local logs. No test was deleted, skipped, marked fixme, retried into PASS or snapshot-forced. Baseline test inventory remained 455 Vitest files / 3,751 tests and 34 Playwright specs / 129 tests; the added runner contracts are separate Node tests.

## Selection and failure behavior

The selector combines the changed file's product owner, a permanent contract set and Vitest dependency-related tests. It covers Text Capture, transport, harmony/parser, Vault, Voicing Loop, practice, settings, home, shared UI, persistence, privacy/security and test infrastructure. Directly changed tests run. Shared or unknown product source expands conservatively; UI without paths keeps the existing critical browser set. `--explain` prints ownership, and local full logs preserve diagnostics.

A CSS-only Text Capture edit previously returned exit 0 after **zero tests**. The new FAST selection runs 4/4 Vitest in 21.6s; FEATURE runs 24/24 Vitest and 5/5 Playwright in 62.8s. A parser edit selected 896/896 tests in 28.9s; the public aggregate case that previously timed out at the default five-second ceiling passed with the bounded 30-second ceiling used for related heavyweight cases. A failed command stays failed and prints its spec, assertion, source location and trace path; a focused Node contract checks that the concise output does not replace these diagnostics with success noise.

The 60-second FEATURE warning budget is exceeded by the CSS/browser example by 2.8s. This is recorded as a latency limit, not a reason to omit the browser contract. The FAST/FEATURE same-area tests may execute again when their gate keys differ; safe cross-level reuse was not assumed.

## Cache and worker decisions

FAST, FEATURE and UI reuse **PASS only** when HEAD, tracked diff, relevant untracked source/test contents, installed dependencies/config, gate and selected inputs match. Changes invalidate the key; failures and corrupt cache entries are ignored. `--fresh` bypasses the cache. FULL has no cache read/write path. Local cache and logs are Git-ignored. Unit tests cover key invalidation and the FULL exclusion.

The bounded public 11-file/157-test Vitest benchmark was 8.4s at 2 workers, 5.6s at 4 and 5.7s at 6; four remain selected. The nine-test browser benchmark was 32.2s at 1 worker, 28.7s at 2 and 29.1s at 3; two remain selected. See [worker benchmark](05-worker-benchmark.md). FULL preserves the separate production and fixture-enabled browser builds, while avoiding only the duplicate TypeScript pass inside the browser wrapper after app TypeScript has passed.

## Gates and scope

At `45148c2`, fresh FULL passed repository ESLint, class/source lint, E2E/app TypeScript, phase-doc and AI-handoff validation, privacy scan, production build, 18 runner contracts, all 3,751 Vitest, all 129 Playwright, and `git diff --check`. The reported run took 210.4s. That historical run preceded the local master integration. The final report-inclusive integration HEAD was tested separately below.

No production `src/**` file, private input, or generated local log is in the Test DX candidate range against current local `master`. The product Voicing Loop fix entered through the explicit local-master integration described below. The pre-existing unrelated untracked `Claude outputs/` directory was left untouched. At the time of the final candidate Gate, no merge into local `master`, push, tag or release had been performed.

## Final integration and fresh FULL gate

- Final tested HEAD: `238de2149f5982fc834e195f7cbc03af0408640c` on `chore/test-dx-token-efficiency`.
- Latest local `master` (`9f1c791`, containing Voicing Loop restart fix `049e256`) was merged into the Test DX branch as `238de21`. The Test DX changes and product fix were both retained without conflict. Local `master` was not changed by this integration.
- Focused smoke after integration: 18/18 runner contracts, including changed-file selection, PASS cache invalidation and FULL cache bypass; the 320px Voicing Loop restart Playwright path passed 1/1.
- A single fresh `npm run test:full` ran at the final tested HEAD. FULL sets `cacheEnabled("full")` to false, so no PASS cache was read or written for this gate. No test was skipped, marked fixme, retried into PASS, or left unrun.

| Final fresh FULL component | Result |
| --- | --- |
| Repository ESLint; class/source-contract lint | PASS |
| App and E2E TypeScript | PASS |
| Phase-doc and AI-handoff validation | PASS |
| Privacy/security scan; production build | PASS |
| Runner contracts | 18/18 PASS |
| Full Vitest | 3,752/3,752 PASS |
| Repository-wide Playwright | 129/129 PASS |
| `git diff --check` | PASS |
| FAIL / unrun | 0 / 0 |

FULL wall time was **211.4s**. Its raw local step logs totaled **23,944 B**. The captured terminal output for `npm run test:full` was **596 B** when UTF-8 encoded with LF-normalized line endings, including the npm banner and final summary. Complete logs are local and ignored under `.local-evaluation/test-logs/`.

This documentation-only report commit records the tested integration HEAD without changing product, test, runner or configuration files. The one required FULL run remains attached to the tested code HEAD `238de21`; no repository-wide FULL rerun is claimed for the report-only commit. Push, tag and release remain outside this stage.
