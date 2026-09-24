# VL-05 — Hardening and automated acceptance

Status: AUTOMATED GATES PASS / HUMAN PRODUCT ACCEPTANCE PENDING. Branch `feat/voicing-loop-v2`; verified code commit `14b4dff`; base local master `de298b9`.

## Changes and isolation

VL-05 corrected the old P8.2 test's 600-group expectation to the approved 128-group contract, aligned existing P5.30/P5.32/P5.33 browser assertions with duration-proportional cards and card-seek behavior, and added dedicated V2 product-path tests. A paused count-in seek now remains silent until Resume. The transport tracks WebAudio active note numbers and explicitly releases voices at seek, pause, rest, next attack, stop, and disposal. External MIDI output is absent from this transport; explicit MIDI Note Off, CC64 reset, and CC123 are conditional and not applicable here. The input-monitoring MIDI path is preserved.

The V2 transport is the default in Voicing Loop. Setting localStorage `lv-voicing-loop-v2` to `off` before mounting the view selects the pre-V2 transport without rewriting Vault data. A product-path E2E verifies the OFF behavior. Current Product Analyzer/extractor and Identity/Decoder, Vault v2, and all Phase 8/9 research candidates were untouched.

## Gate on code commit `14b4dff`

| Gate | Result |
| --- | --- |
| Focused Voicing Loop, P8.1 source playback, P8.2 meter | PASS, 151/151 |
| Vault regression | PASS, 53/53 |
| Full Vitest | PASS, 3451/3451 in 428 files, `--testTimeout 60000` |
| App and E2E TypeScript | PASS |
| Repository ESLint, class and source contracts | PASS |
| Phase docs and AI handoff validators | PASS |
| Production web build | PASS |
| Related desktop Playwright | PASS, 18/18 |
| `git diff --check` and changed-path privacy/media scan | PASS, 0 issues |
| Working tree after code commit | clean |

The standard 5-second Vitest timeout was too short for unrelated public synthetic research tests under full-suite load; the complete suite passed at 60 seconds. The public aggregate unit test was inspected to verify it uses generated synthetic fixtures only. No private or sealed holdout evaluation was run.

## Required scenarios

- Fixed-seed mixed transport actions: three seeds × 320 steps; schedule IDs and voice handles remained bounded and cleared at stop.
- Epoch invalidation, WebAudio ledger cleanup, stopped/running/paused/count-in seek, loop count preservation, restart, 128-event/128-group scheduler bound: PASS in instrumented tests.
- SOURCE/GENERATED/CUSTOM, bulk SOURCE confirmation and CUSTOM skip, source meter 1/4–12/4, absolute timing, Vault compatibility: PASS in focused/full regression.
- Card/ruler/overview seek, separate preview, shortcuts, scale 8/12/16, manual follow and F resume, 128-event timeline, rollback OFF: PASS in browser tests.
- 1440×900 visual comparison with the provided PDF page 3: structure matches; workspace measured 816px scrollHeight and clientHeight with no horizontal overflow. 1920×1080, 1280×720, 320px, 200% effective scale, reduced motion, and axe severe/critical violations: PASS.

## Remaining gate

`VOICING LOOP V2 = READY_FOR_HUMAN_PRODUCT_ACCEPTANCE` after final report commit and fresh HEAD verification. Actual hardware/product use still needs the contract's short final check: representative local SOURCE sound, 10–20 playing seeks including short chords, no stuck notes/pedal, useful follow and 8/12/16 scale, long progression, coherent Pause/Resume/Stop, and visual match. No new Human Gold or annotation is needed. Merge, push, tag, and release remain outside this stage.
