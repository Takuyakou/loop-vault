# P8.5-PRE-00 — Existing text intake audit

Research baseline: local master `a081968` (2026-09-25). This document describes code behavior, not a proposed production change.

## Current path

`TextProgressionCapturePanel` → `parseTextProgression` / `segmentScoreBar` → compact preview and `textProgressionVoicingNotes` → `createTextProgressionDraft` → Capture editor → `textProgressionDraftSavePayload` → Vault v2 → Voicing Loop handoff. The text declares chord identity and timing; it does not carry MIDI source evidence. The raw input is retained in the transient parse result but the saved payload contains canonical chord events, not the pasted source text.

The parser caps input at 8,192 UTF-16 code units, 32 bars, and 128 tokens. It assumes 4/4; one, two, or four tokens per bar map to four, two, or one beat. BPM is supplied separately; runtime default is 120. Key inference is only a suggestion; degree input needs a confirmed key. Any diagnostic blocks conversion. Parsed tokens carry raw text and UTF-16 ranges, and controls yield explicit events or silence.

## Verified overlap

| Feature | Current standard-v1 behavior | PRE decision |
| --- | --- | --- |
| `|` | Supports framed and unframed bar notation; line handling differs | Share bar model, preserve standard timing rules |
| `%` | Re-attacks preceding chord if one exists | Share control semantics, refine error cases |
| `_` | Silent slot | Share silence event semantics |
| `=` | Extends immediately sounding event | Share continuation semantics |
| `#` at line start | Masked as comment, preserving offsets | Share source span strategy |
| `/` | Slash bass; `6/9` remains quality | Share chord semantic parser |
| Adjacent symbols | Bounded complete segmentation; ambiguous cases diagnosed | Share segmentation core, never guess |
| Root/type whitespace | Some unambiguous pairs normalized | Share lexical rule, keep original spans |
| Unicode accidentals | Current parser expects ASCII root accidentals | Extended normalization must be explicit and reversible |
| Headers / inline metadata | Unsupported diagnostic | Extended structural layer only |
| Meter / BPM / capo | 4/4 and separately supplied BPM; no text metadata | Extended metadata needs a separate contract |

The historical P5.20 grammar contract says `%` is rejected, but current `textProgression.ts` accepts it. Git/code wins. `N.C.` remains rejected while `_` is a supported rest. Empty/whitespace input currently emits `empty-input`; extended-v1 specifies an `EMPTY`/`IDLE` editor state instead. Current score text is not persisted verbatim in Vault v2. Preserve this as an explicit Phase 8.5 design gap, without changing schema in PRE.

## Code anchors

- `src/domain/textProgression.ts`: limits, diagnostics, controls, events, key state.
- `src/domain/textScoreTokenizer.ts`: compact segmentation, normalization, offset-preserving comments.
- `src/domain/chords.ts`: shared chord identity parser.
- `src/domain/textProgressionVoicing.ts`: generated styles and manual snapshot adapter.
- `src/domain/textProgressionDraft.ts`, `src/views/CaptureView.tsx`, `src/store/vaultStore.ts`: Draft, preview, save.
- `src/domain/progressionVoicingPractice/handoff.ts`: saved practice entry.

No production files were changed in this audit.
