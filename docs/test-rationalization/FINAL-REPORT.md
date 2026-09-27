# Test Suite Rationalization — candidate report

## Decision

**TEST SUITE RATIONALIZATION = CANDIDATE COMPLETE / FINAL GATE BLOCKED BY CONFIRMED PRODUCT DEFECT.** The repository-wide suite now executes every case and the six inherited failures have been removed or updated without weakening current contracts. It is **not** `READY FOR MERGE REVIEW`: one new explicit Correction Editor readability check correctly fails on the unchanged product. Human review classified the 41px-wide selected-candidate header as a defect. This task does not change production behavior, so no local master merge, EXE, push, tag, release, or next phase was performed.

## Changes and coverage

- Classified all 489 test files (455 Vitest + 34 Playwright) into T0–T4 in the [baseline](00-baseline.md) and [final inventory](05-final-inventory.json). The [contract matrix](01-contract-matrix.md) maps P8.8.3–P8.8.6, Vault, Dojo, Voicing Loop and privacy to strong retained checks. Phase tokens remain provenance; ownership follows product areas.
- Updated two retired Chord Dojo tab selectors to the shipped sidebar button; retained keyboard activation, `aria-current`, bottom reachability and queue wheel chaining. Updated one old 38px Transport assertion to its accepted 36px shared CSS minimum, and one local metronome text assertion to observe the global button after the `m` shortcut. All four formerly failing focused cases passed.
- Removed the serial coupling of the Phase 5.13 visual suite so six cases execute independently. Fixed its clock for stable persisted dates. Compared each of nine retained PNGs to current accepted shell/navigation/control states and updated those images individually. The former Correction Editor PNG was intentionally not accepted: it was replaced by a browser geometry assertion that preserves the unique readability contract and fails on the current product. One visual baseline was therefore removed with an explicit stronger replacement; no test case was deleted.
- Consolidated duplicated Text Capture browser route setup into a small existing helper. P8.8.4 and P8.8.6 E2E stayed distinct and passed together (9/9). No domain semantic row, long-chart/overflow assertion, privacy test, or accessibility check was removed.
- Added [FAST / FEATURE / UI / FULL](README.md) entries using the existing Vitest and Playwright runners. FEATURE uses dependency-based related selection; FULL always runs every Playwright spec. No retries or skips were introduced.

## Verification

FAST: PASS in 34.7s. FEATURE example: PASS in 7.9s. Repeated suspected cases: 30/30 browser and 10/10 public synthetic aggregate Vitest PASS; no confirmed flaky case. Fresh FULL: lint, app/E2E TypeScript, phase-doc/AI validation, privacy scan, production build and full Vitest **PASS** (455 files, 3,751 cases). Full Playwright: **128 PASS / 1 FAIL / 0 unrun** in about 2.0 minutes. UI subset: **34 PASS / 1 FAIL**. The sole failure is the deliberately retained readability assertion: selected candidate header 41.046875px, required at least 160px. The unchanged product source produces this width. Full wall time was 224.2s versus approximately 4.4 minutes for the prior failing baseline. See the [measurements](05-before-after.md) and [failure audit](03-playwright-audit.md).

## Limits and next action

The source product's selected candidate header needs a separate, scoped layout correction and browser recheck. After that correction, rerun the full Gate at final HEAD before any merge decision. The nine updated images must continue to represent the accepted current UI; do not turn the Correction Editor check green by lowering its width threshold, skipping it, or accepting the narrow screenshot. Test counts did not shrink because other apparent overlaps have different product seams or diagnostic value. The [duplicate review](02-duplicate-analysis.md) records why they remain. This candidate is based on the unmerged P8.8.6 branch, while local master remains separate; Git reality takes precedence over older handoff text.

All newly generated logs and comparison images are ignored local artifacts. No private MIDI, audio, personal path, or local evaluation data was added to Git. The D-drive development directory was used for source builds.
