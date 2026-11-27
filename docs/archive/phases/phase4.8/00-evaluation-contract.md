# Phase 4.8-00 Evaluation Contract

## Canonical 7(b9)

`root + major triad + minor seventh + b9 + bass` is the canonical component form. ASCII aliases `7b9` and `7(b9)`, plus the Gold/UI glyph alias `7♭9`, normalize to one identity. Canonical display is `7(b9)`.

## Core

- Complete: root, M3, P5 and m7.
- P5 omit: root, M3 and m7. Shadow may generate but reports this subgroup independently.
- Missing root, M3 or m7: never generate.

## Evidence variants

- E1 strict-overlap: b9 overlaps the simultaneously sounding core by at least 50% of its sounding duration.
- E2 event-supported: b9 occupies at least 25% of the event, or has at least two onsets; first onset must be within the first 75% of the event.
- E3 role-aware: E2 plus b9 support from harmony, pad, mixed or unknown voice; melody-only support is rejected.

Variants remain independent. No result-dependent mixture is allowed.

## Candidate and ranking

- maximum one `7(b9)` per root and two generated candidates per event
- canonical duplicate zero
- generated candidate keeps source-core score only for counterfactual diagnosis
- incumbent Product candidates remain first in original order
- Product output stays untouched during Shadow evaluation

## Split discipline

Existing Dev selects one variant. New Gold is frozen before precision evaluation. Validation and Holdout are each opened at most once and only after the preceding split passes.
