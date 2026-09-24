# VL-06 — Human Product Acceptance fixes

Status: implementation complete; final Human Product Acceptance pending. Branch `feat/voicing-loop-vl06`; base local master `d6cf4e7`.

## Product changes

- The C v3 order is Current (largest) with Next above Then Next on the right, followed by Timeline, the 88-key keyboard and one-line Transport. Current and Next show FINGER → PITCH → TONE, with the finger value dominant and the recommendation as a small badge. Current shows the saved P8.1 PlaybackChoice in its metadata and marks low-confidence SourceSnapshot separately. Bulk SOURCE remains a secondary, confirmed action using the existing P8.1 path.
- Timeline position is a chord index. Removed the old beat/PracticeGroup progress bars. The 8/12/16 controls are display scales, disabled when a progression is shorter than the selected scale. The lane, ruler and overview share a measured viewport width; card widths remain proportional to source-beat duration. Cards below 60px use compact, single-line names with a full-name title and accessible label; preview is separated from the name and hidden where there is no room.
- In V2, a stopped card click seeks and auditions once, a playing click seeks and continues, and a paused click seeks silently. Preview auditions without moving the transport. The old transport path behind `lv-voicing-loop-v2=off` stays intact. Transport epoch, scheduling and note cleanup remain in the existing implementation.
- Expanded desktop sidebar is the canonical Practice navigation. Collapsed and narrow layouts retain a way to reach each Practice mode. The 900px overflow cutoff was removed; responsive content may scroll when the readable panels and keyboard require more height.

## Selector clipping investigation

The selector itself has no negative margin or transform. Its outer width is constrained by the Practice workspace and shell (`min-w-0`), while the loaded timeline scrolls inside its own viewport. The prior layout exposed duplicate Practice navigation in the sidebar and header/workspace, which could consume horizontal room in the same shell. VL-06 removes that duplication. The reported left-edge clipping was not reproducible in a clean current selector after this change. Browser geometry verifies that the heading begins inside `main`, remains inside the viewport, and does not cause horizontal overflow at 1024, 1280, 1600 and 1920 widths, with expanded/collapsed sidebar and effective 200% scale. The exact earlier scroll/session state that produced the report is unavailable; the regression test guards the reported symptom.

## Long progression intake audit

| Stage | Current limit and unit | Code / behavior | Truncation, rejection or segmentation |
| --- | --- | --- | --- |
| MIDI import | 16 MiB per file, 64 MiB batch, 250k notes, 500k events, 100k beats | `security/intakeBudgets.ts`, `midi/rawSmf.ts` | Explicit intake rejection; no VL-06 change |
| Product analysis | automatic windows of 2/4/8/16 source bars | `midi/analysis.ts`, candidate catalog | Automatic candidates segment; Full Timeline remains available for manual range |
| Capture range | source bar and beat coordinates; range clamped to available source bars | `midi/manualRange.ts`, `CaptureView.tsx:openManualRangeDraft` | No 8/16-bar clamp on manual range; invalid/empty range rejected |
| Candidate / cards | one event per selected timeline chord, exact relative beat/duration | `midi/manualDraftEditing.ts:draftToCandidate` | No first-N slice; source voicing metadata copied |
| Capture save | title plus candidate and analysis | `CaptureView.tsx:saveNew`, `vaultStore.ts:createIdeaFromDraft` | No long-progression segmentation; save result reported |
| Vault v2 DTO | positive integer `lengthBars`, chord array; 16 MiB serialized Vault budget | `schema.ts`, `repository.ts`, `vaultStore.ts:toSavedProgressionBlock` | No 16-bar schema cap; byte budget explicitly rejects oversize write |
| Vault list/read | all valid stored blocks are read; only practice-compatible blocks listed | `progressionVoicingPractice/library.ts` | No first-N slice; resource-budget sources remain visible as disabled with a reason; other invalid sources omitted |
| Voicing Loop handoff | 2400 beats, 600 s, 2400 events, 128 PracticeGroups; constant 1/4–12/4 | `progressionVoicingPractice/snapshot.ts`, `handoff.ts` | Explicit `resource-budget` or meter error; no source bar rewrite |
| Timeline / Transport | 8/12/16 display scale, bounded look-ahead; 128 PracticeGroups | `timelineLayout.ts`, V2 Transport | Full event array retained; horizontal scrolling for long practice |

A public synthetic 64-bar, 64-card, 256-beat manual range passed `createManualDraft → draftToCandidate → createIdeaFromDraft → Vault v2 serialize/parse → list → handoff`. It retained all 64 onset coordinates, four-beat durations, source note-number sets, SOURCE intent, and order. The existing P8.2 boundary test explicitly rejects 513 quarter-note beats as `resource-budget` after 512 beats pass. Vault may retain a progression beyond the Voicing Loop practice budget; this is not a Vault truncation. The handoff rejects it and the selector shows it disabled with a reason. `PracticeGroup` remains a practice capacity, not a source bar or persistence field. Existing short blocks are neither joined nor regenerated.

## Visual and responsive audit

The PDF page 3 C-v3 hierarchy remains the visual reference. The expanded sidebar is 212px, collapsed sidebar 68px, top bar 68px, content max width 1680px; the shell initially collapses at widths of 1100px or less. E2E verifies 1280×720, 1600×900 and 1920×1080, plus 1024 and effective 200% scale. The short progression fills the timeline width without reserving nonexistent groups. Long fixtures exercise all three scales and 128 cards. 1/2/4-beat width ratio is covered by the geometry unit test. The larger keyboard and finger labels remain readable; shorter displays can scroll to Transport rather than clip controls.

**1440×900 fixed dependency: none in VL-06 product layout.** There is no 1440px breakpoint or fixed 900px overflow rule. That size is a sample viewport only.

## Protected contracts and deferred item

Product Analyzer, Extractor, Identity/Decoder, Vault fileVersion 2, P8.1/P8.2 semantics, P8.4–P8.6 and Phase 9 research candidates are unchanged. No Vault migration occurs. The current P8.1/P8.2 default and V2 rollback switch remain available. Context-aware enharmonic spelling (`Ab7`/`G#7`, `E/Ab`/`E/G#`) is a Phase 9 backlog item; this stage does not alter Analyzer, Identity or renderer semantics.

## Automated gate

Final committed HEAD verification is recorded in the completion message. Required: focused VL/P8.1/P8.2 and Vault, full Vitest, app/E2E TypeScript, repository/class/source lint, production build, related Playwright, responsive/accessibility, phase docs and AI handoff validation, privacy/media scan, and `git diff --check`. Screenshots are local-only and are not tracked.

## Final state

`VOICING LOOP V2 = READY_FOR_HUMAN_PRODUCT_ACCEPTANCE (VL-06)` once all final HEAD gates pass. Human product review can assess the C-v3 hierarchy, real playback feel, stopped/playing/paused click behavior, and long progression selection. Merge, push, tag and release are outside VL-06.
