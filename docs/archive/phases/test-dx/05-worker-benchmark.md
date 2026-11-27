# DX-05 — Bounded worker benchmark

One sequential run per setting on the same code state. These are directional timings, not a statistical latency claim. All inputs were public/versioned tests; no private witness or sealed holdout was run.

## Vitest

Fixed 11-file, 157-test workload: text progression semantics/draft/voicing/downstream, Text Capture status/panel, text transport, Capture view, Voicing Loop, Vault, and the public Phase 7 aggregate contract. Every run used the same 30-second case ceiling.

| `maxWorkers` | Wall time | Result | Raw output |
| ---: | ---: | --- | ---: |
| 2 | 8.4s | 157/157 PASS | 819 B |
| 4 | **5.6s** | 157/157 PASS | 819 B |
| 6 | 5.7s | 157/157 PASS | 819 B |

Keep four workers for FULL. Six did not improve this fixed workload, while higher concurrency raises contention risk for heavyweight evaluation cases. The FULL candidate gate will verify that choice on all 3,751 tests.

## Playwright

Fixed P8.8.4 transport + P8.8.6 Capture browser workload (9 tests), using the canonical fixture-enabled runner. Wall time includes TypeScript, fixture Vite build, browser startup and tests.

| Workers | Wall time | Browser phase | Result |
| ---: | ---: | ---: | --- |
| 1 | 32.2s | 14.2s | 9/9 PASS |
| 2 | **28.7s** | **11.0s** | 9/9 PASS |
| 3 | 29.1s | 11.3s | 9/9 PASS |

Keep the existing two Playwright workers. No retry count or timeout was changed. The UI/FULL wrappers preserve the canonical fixture build, visual state and accessibility coverage. The build overhead dominates this small browser subset; more workers did not help.
