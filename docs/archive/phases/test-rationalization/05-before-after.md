# Before / after measurement (Stage 10)

Source baseline `ba349fb` versus the current test-rationalization candidate content. The P8.8.6 code is the unchanged base for both measurements. Counts come from the machine inventories ([before](00-baseline-inventory.json), [after](05-final-inventory.json)), Vitest collection, Playwright collection, tracked PNGs, and fresh executions. Browser runtime includes the test runner's production web build.

| Measure | Before | After | Interpretation |
| --- | ---: | ---: | --- |
| Vitest files | 455 | 455 | No deletion |
| Vitest cases | 3,751 | 3,751 | All retained |
| Playwright specs | 34 | 34 | All retained |
| Playwright project-expanded cases | 129 | 129 | All retained |
| Visual PNG baselines | 10 | 9 | One obsolete Correction Editor image replaced by explicit readability geometry assertion |
| Test source LOC | 80,686 | 80,685 | Setup deduplicated; explicit assertion added |
| Authored `.skip` / `.fixme` / `.todo` | 0 | 0 | No Gate masking |
| Unrun cases in repository Playwright | 5 | 0 | Removed accidental serial cascade |
| Known stale test expectations | 6 | 0 | Original six have current selectors/semantics or accepted visual baselines |
| Confirmed flaky in sampled 10x runs | 0 | 0 | Three browser cases and one public synthetic Vitest checked |
| Deleted test cases | 0 | 0 | No case deleted merely for speed |
| Consolidated test cases | 0 | 0 | Two duplicated Text Capture route setups moved to one helper; cases unchanged |
| Moved to lower layer | 0 | 0 | Existing domain tests already hold broad semantics |

| Runtime / Gate | Before | After |
| --- | --- | --- |
| FAST | no named entry | 34.7s, PASS, 196 domain files / 1,933 cases plus TypeScript/lint |
| FEATURE example | no named entry | 7.9s, PASS, 12 related files / 119 cases |
| UI entry | no named entry | 57.6s, 34 pass / 1 fail (confirmed product layout defect) |
| Full Vitest | 56.4s, 3,751 pass | 55.54s reported, 3,751 pass |
| Repository-wide Playwright | ~3.0m, 118 pass / 6 fail / 5 unrun | ~2.0m, 128 pass / 1 fail / 0 unrun |
| FULL wall time | ~4.4m estimated, FAIL | 224.2s measured, FAIL on one product layout defect |

The baseline FULL estimate sums measured Vitest, static/build and the prior full Playwright wall time at the same baseline commit. After FULL is one measured invocation of `npm run test:full`; the first attempt ended early because a deleted PNG was not yet staged and the tracked security scanner tried to read it. Staging that exact deletion repaired the scan; the second fresh invocation reached all layers. This is a Git-index bookkeeping issue, not a product or privacy failure.

The after FULL static checks, app/E2E TypeScript, lint, phase-doc validation, AI handoff validation, privacy scan, production build, P8.8.3 frozen semantic corpus, P8.8.4 transport, P8.8.5 global playback/font, and P8.8.6 Capture layout all passed. Accessibility specs ran in the full browser suite. The one failure reports a selected candidate header width of **41.046875px** against a 160px readability floor. Human review rejected this layout as a product defect. The test is intentionally red until a separately scoped product fix lands. Therefore the requested repository-wide PASS and `READY FOR MERGE REVIEW` state are **not achieved**.
