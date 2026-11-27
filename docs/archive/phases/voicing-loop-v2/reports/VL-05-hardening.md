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
- The earlier 1440×900 PDF comparison was a sample viewport; it measured 816px scrollHeight and clientHeight before the responsive clarification. 1600×900 is the primary visual comparison size for the current desktop shell. 1280×720, 1920×1080, 320px, effective 200% scale, reduced motion, and axe severe/critical violations are secondary checks. The responsive hierarchy test covers 1280×720, 1600×900, and 1920×1080. At each size Current remains larger than Next, Then Next is present, the region order matches PDF page 3, the Current title is at least 48px, and the 88-key graphic is at least 144px high.

## Fixed-viewport dependency audit

The product shell reserves 212px for an expanded sidebar, 68px when collapsed, and 68px for the top bar; it initially collapses the sidebar at widths of 1100px or less. The app uses the existing `lg` layout breakpoint, and the content has a 1680px maximum width. A 1600×900 visual baseline gives the practice view useful width with the regular sidebar; 1280×720 checks a compact desktop, and 1920×1080 checks a larger display. The 1440×900 mock remains only an optional sample. Windows scaling is covered by the effective 200% browser check.

**1440×900 fixed dependency: none remains in the Voicing Loop product path.** The 900px-height overflow cutoff was removed from both the app main region and the Voicing Loop workspace. The 88-key display now uses a bounded responsive height (`clamp(144px, 17vh, 188px)`) so it can grow on larger screens without being forced into a reference height. Shorter screens can scroll to the transport rather than clipping Current, timeline, keyboard, or text. The unrelated Bass Practice height rule was left untouched. No CSS/layout condition uses 1440px as a Voicing Loop breakpoint.

## Responsive clarification on code commit `6d1db55`

The follow-up removes the fixed 900px overflow cutoff, enlarges the 88-key display within a bounded viewport-relative range, and verifies the page-3 hierarchy across desktop widths. The old P5.27 browser test selectors were aligned with the current sidebar and header. The full Vitest suite passed 3451/3451 in 428 files; app TypeScript and the production build passed; E2E TypeScript, repository lint, phase docs, AI handoff, `git diff --check`, and a changed-path privacy/media scan passed with zero issues. The fixture-backed related Playwright suite passed 20/20. The primary responsive regression viewport is 1600×900, with 1280×720 and 1920×1080 also checked. 1440×900 remains a sample only.

## Remaining gate

`VOICING LOOP V2 = READY_FOR_HUMAN_PRODUCT_ACCEPTANCE` after final report commit and fresh HEAD verification. Actual hardware/product use still needs the contract's short final check: representative local SOURCE sound, 10–20 playing seeks including short chords, no stuck notes/pedal, useful follow and 8/12/16 scale, long progression, coherent Pause/Resume/Stop, and visual match. No new Human Gold or annotation is needed. Merge, push, tag, and release remain outside this stage.
