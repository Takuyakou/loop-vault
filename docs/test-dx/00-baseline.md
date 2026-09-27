# DX-00 — Test execution and output baseline

Baseline Git HEAD: `1d2c43d` (P8.8.6 already merged). Measurements use the unchanged local master code. Full logs are ignored under `.local-evaluation/`; only aggregate measurements appear here. The previously completed passing FULL run on this exact HEAD was reused read-only rather than rerun for baseline.

| Gate | Wall time | Raw output | Lines | Executed / result |
| --- | ---: | ---: | ---: | --- |
| FAST (`npm run test:fast`) | 36.4s | 4,591 B | 28 | 196 Vitest files / 1,933 tests PASS, plus app TypeScript and full lint |
| FEATURE (Text Capture status source) | 9.0s | 2,475 B | 59 | 12 files / 119 tests PASS |
| UI (`npm run test:ui`) | 61.8s | 10,586 B | 112 | 35 Playwright tests PASS |
| FULL (`npm run test:full`) | 225.2s | 43,877 B | 512 | 455 Vitest files / 3,751 tests and 129 Playwright tests PASS |
| Repository lint | 9.5s | 338 B | 14 | PASS |
| Production web build | 17.0s | 3,994 B | 58 | PASS |
| Full Vitest portion of FULL | 57.72s reported | 10,471 B | 108 | 455 files / 3,751 tests PASS |
| Full Playwright portion of FULL | about 2.0m reported | 26,758 B | 221 | 129 tests PASS |

On successful runs the useful decision was PASS and the counts; per-test success output provided no additional action. The current FULL command emits 43,877 B to the agent-facing terminal when it is not redirected. FULL runs a production build, then the Playwright wrapper runs TypeScript and a second fixture-enabled Vite build. The two web builds serve different artifact contracts, but the second TypeScript pass is duplicate work in this orchestrated context. UI also builds its fixture-enabled browser app.

## Representative changed-file behavior before DX work

| Change example | Current command behavior | Result |
| --- | --- | --- |
| Text Capture status TypeScript | FEATURE `vitest related --run` | 12 files / 119 tests, 9.0s, PASS |
| Capture CSS (`src/styles/text-intake.css`) | FEATURE `vitest related --run` | **0 tests with exit 0**, 3.4s; no CSS ownership contracts selected |
| Text parser (`src/domain/textProgression.ts`) | FEATURE `vitest related --run` | 66 files / 893 tests in 12.6s; one public Phase 7 aggregate case timed out at the default 5s under co-load, 892 passed |

FAST always runs all 1,933 domain tests and repository lint even for one changed source file. FEATURE uses only dependency relationships, so CSS can silently return success with no test. UI always runs the same 35 browser cases, regardless of changed area. Current commands do not cache successful same-HEAD results or condense successful output. These are the measured opportunities for DX improvement; no product contract or test will be removed merely to lower the count.
