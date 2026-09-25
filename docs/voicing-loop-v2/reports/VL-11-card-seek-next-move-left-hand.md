# VL-11 — Card Seek / Fixed Next Move / LEFT HAND

## Scope and implementation

VL-11a (`009d643`) separates seek origin into card, ruler, overview, keyboard, and transport. A mouse card activation seeks and auditions without an immediate page turn; the card stays under the pointer. Follow remains enabled. A later offscreen chord or a playhead outside the 12px safety area can turn the page with the existing 250ms ease-out and reduced-motion behavior. Ruler, overview, explicit F, and keyboard navigation retain navigation behavior. Mouse-down prevents browser focus scrolling; keyboard focus scrolls the target card into view. A stopped card selection now remains the Play anchor because the Clock START action otherwise reset it to zero.

VL-11b (`b06bb36`) replaces urgency-sorted chips and overflow with ten stationary finger slots: L5–L1, R1–R5. Formal assignments use their recorded finger IDs; estimated assignments project the existing order-preserving minimum-cost matching into fixed positions and disclose that they are estimated. An insertion/removal at one estimated position remains represented in that slot and its accessible description. The strip remains 68px high. Each hand has a brief summary; majority same-direction movement with median magnitude at least six semitones is summarized as a whole-hand move. Signed semitones remain internal; displayed chromatic distances use arrows and readable interval labels. KEEP, ADD, RELEASE and empty slots stay visible. Each slot has a complete accessible description and a tooltip. Loop-to-start remains labeled.

VL-11c (`4414f69`) strengthens Current LEFT amber background and border, with a softer Next LEFT amber background. LEFT and RIGHT continue to have text labels and amber/cyan families across voicing panels, Next Move, Next Shape, and keyboard. Current LEFT tint (0.17) is stronger than Next LEFT (0.12); text stays amber-200 against the dark surfaces. Current/Next, Timeline, keyboard and Transport outer geometry are unchanged.

No Analyzer, Extractor, Identity/Decoder, Vault schema, SOURCE note/timing, transport scheduling, Next Shape calculation, or MIDI performance scoring was changed. The visual PDF is a reference for hierarchy; no fixed desktop resolution was introduced.

## Verification contract

- Pure Follow and Next Move tests cover origin, safety margin, fixed slots, formal/estimated transitions, interval mapping, and hand summaries.
- Browser regressions cover partially visible mouse card click, stopped audition, Card→Play→offscreen next chord, ruler/overview, keyboard focus, 10-slot bounds and order, hand tint, 1920×1080, 1280×800, and 125%/150% scaling. Existing VL-09/VL-10/V2 and accessibility cases remain in the related Playwright gate.
- Candidate and post-merge gates: full Vitest, app/E2E TypeScript, repository lint, class/source-contract lint, production build, docs/AI-handoff validation, security/privacy scan, and `git diff --check`.
- The two existing public Phase 7 research tests exceed Vitest's default 5s budget in the full suite on this host. They pass in isolation and the entire suite passes with `--testTimeout=30000`; no research code was changed.
- Local-only test screenshots and source reference renders remain ignored. No private input or media is part of this stage.

Local merge and direct Windows EXE metadata are reported in the final task response after post-merge verification.
