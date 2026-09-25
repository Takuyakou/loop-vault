# VL-10 — Timeline Follow / Next Move / Next Shape

## Decision

`VOICING LOOP V2 = READY_FOR_HUMAN_PRODUCT_ACCEPTANCE (VL-10)`

This candidate remains on `feat/voicing-loop-vl10`. Human Product Acceptance precedes any merge. Product Analyzer, extractor, identity/decoder, Vault v2, transport scheduler, source playback notes, and source timing are unchanged.

## 1. Follow停止の実原因

VL-09 compared each `scroll` event's `scrollLeft` with the programmatic destination. Fractional positions, browser clamping, and intermediate animation positions could differ from that one value and incorrectly turn Follow OFF. A plain `scroll` event no longer changes Follow state.

## 2. Follow OFFのuser intent

Wheel/trackpad input over the timeline, a pointer press on its scrollable viewport/scrollbar, or Arrow/Page/Home/End while the viewport itself has focus disables Follow. A new user input cancels any active page-turn frame. Development builds log only the reason category (`wheel`, `pointer`, or `keyboard`); production UI has no diagnostic log. Card/ruler/overview seek, Start, Resume, and F restore Follow. Mouse activation of a card avoids the browser's focus scroll.

## 3–6. Page Turn

The calculation uses the current chord's absolute start beat and duration. While fully visible, it does not turn. Otherwise `target = clamp(chordStartBeat * pixelsPerBeat - 12px, 0, contentWidth - viewportWidth)`. The 12px padding places Current near the left edge except where the end clamp applies. A turn lasts 250ms with cubic ease-out; a new target retargets from the current position. Reduced-motion skips animation while retaining Follow. Current receives a quiet accent outline for 350ms. Loop wrap uses the same calculation.

## 7–9. Next Move

Only resolved playback notes, VL-09 practice hand assignments, and the current effective fingering are read. Where both cards have a valid fingering for a hand, equal finger IDs are paired, including ADD and RELEASE. When either fingering is unavailable, an order-preserving minimum-cost alignment matches pitches without crossing, omission, duplication, or changing playback; the UI labels it `推定`. Movement classes are KEEP (0), SMALL (1–2 semitones), MEDIUM (3–5), LARGE (6+), ADD, and RELEASE. Signed semitone changes are retained. The fixed 68px strip shows urgent changes first and gives an accessible full description for overflow. The product currently loops, so Last→First is labeled `ループ先`; the pure model supports a no-next state if looping is later disabled.

## 10–11. Next Shape

The fixed 72px Next-panel strip shows only the next card's resolved notes, the actual practice-hand assignment, and L/R finger labels. It snaps the note range with a small margin to C–B octave boundaries. If the lowest right-hand note is at least 36 semitones above the highest left-hand note, it renders two independent mini-keyboards with an ellipsis. Amber/cyan colors match the main keyboard. An aria label names the chord, each hand's notes, and finger labels.

## 12–14. Cache, layout, performance

Transition and range selection are pure functions. `useMemo` limits transition/range recalculation to card/plan/assignment/fingering changes; memoized preview components avoid rendering their key geometry during unrelated clock updates. No work was added to the transport scheduler or playhead animation loop. Browser geometry assertions across 1920×1080, 1280×800, and 125%/150% scaling kept the Current/Next, Timeline, main Keyboard, and Transport y/height changes within 2px across chord changes. The 128-card and 256-PracticeGroup existing browser paths remain covered. `1440×900` is not a fixed product requirement.

## 15. Fresh Gate and Human Acceptance

- New Follow/transition/shape unit tests: PASS (27 tests).
- Full Vitest: PASS (434 files, 3533 tests) with a 15s per-test timeout. A concurrent run with Playwright hit four unrelated 5s timeouts; the isolated full rerun passed.
- VL-09/VL-10 Playwright: PASS (6 tests).
- Legacy VL UI/accessibility/follow Playwright: PASS after updating assertions to the new explicit-input Follow contract.
- App and E2E TypeScript, repository lint, class/source-contract lint, production build: PASS.
- Phase docs, AI handoff, privacy/media scan, `git diff --check`: final-HEAD checks recorded in the task closeout.

Nine public-fixture screenshots are kept locally under `.local-evaluation/vl10/`: Next Move, KEEP, large movement, normal/split Next Shape, before/after page turn, maximized, and medium window. Generated images are ignored by Git. No private MIDI, audio, or personal path is in this report or the candidate.

Human Product Acceptance should check that Follow stays ON during automatic movement, can be manually paused and resumed, turns near the left edge with legible animation, Next Move matches the intended fingers, Next Shape is readable, major regions do not jump, and SOURCE playback remains unchanged. No merge, push, tag, release, or Phase 9 work was performed.
