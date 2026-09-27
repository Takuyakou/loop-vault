# Test suite rationalization — baseline (Stage 00)

Baseline commit: `ba349fb` on the P8.8.6 candidate. The separate local `master` was `0ac2fd1`; P8.8.6 is not on master. This task branch starts at the candidate so its Capture contract can be gated without changing product code. The machine-readable [file inventory](00-baseline-inventory.json) assigns every collected Vitest and Playwright file to T0–T4, with per-file case count, lines, area and historical phase token. Phase tokens are provenance only; `cross-phase` includes files without a phase number in the path.

| Measure before edits | Value | Method |
| --- | ---: | --- |
| Vitest files / cases | 455 / 3,751 | `vitest list --json`; full run confirms counts |
| Playwright specs / project-expanded cases | 34 / 129 | `playwright test --list --reporter=json`, recursive suite walk |
| Tracked visual PNG baselines | 10 | `git ls-files` under `e2e/` |
| Test source lines | 80,686 | UTF-8 line count in 489 collected files |
| Shared helper files / lines | 3 / 499 | tracked `e2e/helpers/`, `src/testing/` |
| Files whose tracked name contains `fixture` | 44 | approximate; excludes test/spec files |
| Authored `.skip` / `.fixme` / `.todo` markers | 0 | collected test files |
| Repository Playwright skipped after serial failure | 5 | actual run; not authored skips |

| Tier | Files | Cases | Test LOC |
| --- | ---: | ---: | ---: |
| T0 static validator tests | 2 | 43 | 395 |
| T1 unit/domain/parser/harmony | 365 | 3,057 | 50,739 |
| T2 component/integration/persistence | 88 | 651 | 24,976 |
| T3 product-path browser | 28 | 109 | 4,086 |
| T4 visual/responsive/accessibility | 6 | 20 | 490 |

Phase provenance is available per file in the inventory. The largest explicit families are P5.39 (58 cases), P5.37 (41), P5.40 (40), P5.35 (39), P5.24 (37), P5.26 (34), and P8.8.3 (24). The `cross-phase` bucket contains 3,326 cases because the paths primarily name product areas rather than phases. The classifier uses paths, so individual T1/T2 borderline cases require review before moving tests.

## Baseline run and runtime

The full Vitest run at `ba349fb`, four workers and a 30-second per-case ceiling, passed 455 files and 3,751 cases in 56.4 seconds wall time. App TypeScript and production web build passed in 17.1 seconds; repository lint 9.4; E2E TypeScript 1.2; phase-doc validation 0.6; AI handoff validation 0.4; privacy scan 1.1. These sequential static/build checks total 29.8 seconds. Repository-wide Playwright at the same commit took 3.0 minutes and ended with 118 pass, six fail, five unrun. Approximate complete baseline wall time is 4.4 minutes plus process startup; the failed run is not a passing Gate.

The six failures reproduce on unchanged base master as documented in the P8.8.6 gate report. Fresh candidate execution showed the same groups: two tests still search for a retired Chord Dojo tab; one Voicing Loop button-height expectation is 38px while shared Transport CSS specifies 36px; one Voicing Loop test expects local metronome text although the accepted control is global; Home and Settings PNGs are from the Phase 5.13 visual state. The `describe.serial` around five visual tests prevents four later cases from running after Home fails. In the full run five tests were unrun in total, including the serial visual chain; the exact skipped set must be resolved by independent execution.

Potential instability: the historical P8.8.6 report recorded one Phase 7 aggregate Vitest timeout at the default five-second budget under parallel load; it passed alone and the full bounded run passed. This is a suspected scheduling sensitivity, not yet classified flaky. The Dojo timeouts above are deterministic missing selectors; screenshot differences and fixed-size assertions are deterministic contract drift. No retry or skip is used to hide them.

## Initial duplicate hotspots

- Text parser semantics are covered in domain unit tests and selected browser paths. Preserve the corpus at T1 and keep representative editor-to-save paths at T3.
- Text Capture status and geometry are covered by P8.8.5/P8.8.6 component and browser tests. Audit overlap before any removal; page overflow and long internal scroll remain T4.
- Old Phase 5.13 screenshots overlap later product-path, accessibility and responsive tests but may still protect unique states. Review each snapshot against accepted UI rather than bulk update.
- Voicing Loop historical E2E overlaps later VL-09–VL-12 behavior; keep unique keyboard and rollback assertions and align retired presentation expectations.

No test or baseline was deleted in Stage 00.
