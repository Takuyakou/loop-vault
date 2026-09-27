# Test DX — Final report

## Decision

**DX-00–DX-07 complete on candidate branch. READY FOR MERGE REVIEW.** The final repository-wide FULL gate is mandatory and never reads the local PASS cache. This work changes test orchestration, documentation and the internal Playwright runner's duplicate TypeScript check only; no product `src/**` behavior or test expectation was changed.

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

At `45148c2`, fresh FULL passed repository ESLint, class/source lint, E2E/app TypeScript, phase-doc and AI-handoff validation, privacy scan, production build, 18 runner contracts, all 3,751 Vitest, all 129 Playwright, and `git diff --check`. The reported run took 210.4s. A final fresh FULL run on the report-inclusive HEAD is required before merge review completion and will be recorded in the task result.

No production `src/**` file, private input, or generated local log is in the candidate range. The pre-existing unrelated untracked `Claude outputs/` directory was left untouched. No merge, push, tag or release was performed.
