# VL-03 — Interactive timeline and keyboard navigation

Status: COMPLETE. Base: `9371b33` on `feat/voicing-loop-v2`.

## Result

The V2 path treats a card-body click as seek and a separate ▶ control as preview. The legacy rollback path keeps its prior audition behavior. Ruler and overview clicks map to source beats, and a click in a rest advances to the next chord (or the last chord at the tail). The timeline scale remains 8/12/16 PracticeGroups. Auto-follow holds the current event near the left quarter; manual horizontal scroll switches to MANUAL and F resumes following.

Space toggles Start/Pause/Resume, arrows move by chord, Home/End seek the first/last chord, F resumes follow, M toggles metronome, R toggles reference, and Escape stops. Shortcuts ignore editable inputs, composition, and open dialogs. The visible `supportsSeek` capability keeps the old transport as a true rollback path.

## Visual and gate

A local-only 1440×900 screenshot was checked against page 3 of the supplied PDF: the C v3 vertical order remains toolbar → Current/Next/Then Next → timeline → 88-key keyboard → one-line transport. The workspace has `scrollHeight = clientHeight = 816px` and no horizontal overflow at this size. Focused timeline, transport, and view tests 79/79 and app TypeScript PASS. The PDF and screenshot remain local-only.
