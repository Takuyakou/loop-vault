# VL-09 — Layout Stability / Timeline Follow / Card Audition / Practice Hand Assignment

Status: `VOICING LOOP V2 = READY_FOR_HUMAN_PRODUCT_ACCEPTANCE (VL-09)`; merge and local EXE build were separately requested in the enclosing user message. This stage does not change the analyzer, extractor, Vault v2, source evidence, Phase 9 code, or private Vault data.

## 1. Layout movement cause

Chord-dependent content had unrestricted height in the Current/Next area, so long pitch/finger strings and conditional messages displaced Timeline, Keyboard, and Transport. The timeline scrollbar lane also depended on incidental content height. The main regions now use stable outer dimensions; lengthy details scroll within the Current/Next panels. Conditional resolver status appears after the fixed practice regions.

## 2–5. Region size and text

- Current/Next/Then Next outer workspace: `clamp(300px, 36dvh, 380px)` at the desktop breakpoint, and `clamp(560px, 72dvh, 760px)` when stacked. Then Next reserves 72px within the right panel.
- Keyboard region: `clamp(190px, 24dvh, 234px)`; the wide 88-key SVG uses `clamp(160px, 19dvh, 200px)`.
- Timeline: fixed 148px outer height with a 112px horizontally scrollable lane. Scale changes among 8, 12, and 16 groups do not move lower regions.
- Current, Next, and Then Next names stay on one line, truncate, and expose the full text in a title. Finger, pitch, and tone rows reserve stable slots and truncate within each hand. Current remains the largest visual element.

These are responsive ranges, not a required 1440×900 resolution. No 1440×900-specific CSS constraint remains. That viewport is one acceptance sample.

## 6. Card interaction

With the v2 seek transport, stopped or paused Card click seeks directly to the clicked event and auditions its saved playback choice while retaining the transport status. During playback, Card click seeks and playback continues without a second audition. Ruler, overview, and timeline background only seek. Preview auditions without seeking. The clicked event index is passed directly, avoiding a stale Current-state read. Saved `SOURCE`, `CUSTOM`, `GENERATED`, and unspecified automatic intent is resolved for card audition independently of the displayed practice family; exact source/custom pitches are not rewritten. The standalone Current reference button still auditions the currently selected practice plan. Rollback OFF keeps its prior audition-only behavior.

## 7–8. Timeline follow

`pageTurnTarget` uses absolute beat positions and chord duration. It does nothing while the full Current chord is visible; an offscreen chord moves to approximately the left quarter, clamped at the right edge. It does not scroll every beat or use PracticeGroup index. A programmatic scroll stores the exact destination; matching scroll events are distinguished from manual movement without a timer. Manual scrolling turns Follow OFF. `F` forces immediate visibility and resumes follow, even if Follow was already ON.

## 9–11. Hand assignment

The public seven-note F9/A scenario `[57, 65, 72, 75, 77, 79, 84]` now uses left `[57, 65]` and right `[72, 75, 77, 79, 84]`. SOURCE playback notes remain exactly the seven input notes. Practice assignment enumerates contiguous, non-crossing splits of at most five notes per hand, then uses bounded progression-level selection. Local costs consider span, register, saved bass placement, fingering feasibility, and saved personal fingering; adjacent movement contributes to the progression cost. A smaller left hand wins an equal-cost tie. Explicit CUSTOM hand assignments remain unchanged. Fingering is unavailable when a valid at-most-five-per-hand partition cannot be made, or an explicit assignment exceeds the limit, crosses, duplicates, or omits a source pitch. The UI reports that source notes are unchanged.

## 12–14. Transport, safe margin, and work area

Transport has a fixed 92px two-row layout: practice controls above MIDI status/settings. Horizontal overflow remains inside each row. The workspace leaves a 16px bottom safe margin. The app does not force resize or relocate a normally visible main window. At startup, a non-maximized window with less than half its area in any monitor work area is moved into the best monitor work area; an oversized unreachable window is reduced to fit. Maximized windows remain under OS control. Main-window bounds are not separately persisted by this stage; normal OS restoration remains in effect.

## 15. Acceptance evidence

The public synthetic E2E fixture includes variable chord-name lengths, seven-note voicings, and a long timeline. Fixed-region geometry passed at 1920×1080, 1440×900, 1280×800, 1024×768, 900×1200, and effective 125%, 150%, and 200% samples. Across chord changes, measured Y/outer height differences were at most 2px. Follow passed at 8/12/16 scales, including manual scroll and `F` restoration; short 1/4 and 4/4 beat geometry is covered by focused unit tests. The 256-group product-path E2E mounted in 639ms in this run. Acceptance screenshots remain local-only under `.local-evaluation/vl09/`: normal and seven-note chords, medium/maximized layouts, two-row transport, and timeline right edge/page turn.

Fresh candidate gates: full Vitest 432 files / 3515 tests PASS with two workers; app and E2E TypeScript PASS; repository lint, Tailwind class lint, source-contract lint PASS; production Web build PASS; related Playwright, responsive, and accessibility 42/42 PASS, including the updated VL-09 two-row Transport assertion and VL-09 E2E 3/3; phase-doc and AI-handoff validation PASS; `git diff --check` PASS. Privacy scan found no private media, personal absolute path, or local witness content in the tracked source/test/report changes. The first full Vitest run had two 5-second timeouts under concurrent gate load; both passed separately and the serial reduced-worker full run passed. No product default or source playback-data switch was introduced.
