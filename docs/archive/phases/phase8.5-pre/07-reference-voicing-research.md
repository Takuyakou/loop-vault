# P8.5-PRE-06 — Reference voicing investigation

The current public reference code converts a chord label to notes using a fixed base register, expands shorter chords to a bounded upper count, and adds an alternate bass below the first note when requested. The conversion function has no previous/next chord argument and its caller uses a fixed base key. This supports **SIMPLE_CHORD_LOCAL** for the inspected public source: the same label in the same transposition setting produces the same concrete note set regardless of surrounding chords. A live deployment/version check remains a Phase 8.5 acceptance test; this document does not claim direct observation of every deployed sample.

## Early complexity gate

| Probe | Result |
| --- | --- |
| Same chord, same context | Deterministic by pure conversion path; repeated synthetic evaluation identical. |
| Same chord, different context | No neighboring chord enters the inspected conversion path; no context-aware voice-leading found there. |
| Slash bass | Adds an alternate low note when bass differs from root; exact octave depends on its fixed base register and first generated note. |
| Extended/altered | Translation changes chord tones before register expansion; unsupported combinations fail rather than producing verified notes. |
| Register | Fixed base register, then octave duplication to fill short voicings; not a MIDI source performance. |

## Representative synthetic comparison

Thirty authored labels covered major, minor, dominant, major/minor seventh, sixth, 6/9, ninth, 11th, 13th, suspension, add, omit, diminished, augmented, altered dominant, and slash bass. The reference returned notes for 29; current Product parsed 26; both returned notes for 25. Among those 25, root/bass pitch class agreed in 25, pitch-class sets in 22, note cardinality in 7, and exact MIDI note sets in **0**. Median lowest note was MIDI 54 for the reconstructed reference path and MIDI 47 for Product generated-close. Reference cardinality was five notes in 20/25 cases, six in 3, seven in 2; Product close was four in 16, five in 7, six in 2. Thus most exact differences are register/doubling, while three sampled cases also differ semantically.

| Existing Product profile | Available on the 25 shared labels | Exact note-set match | Pitch-class-set match |
| --- | ---: | ---: | ---: |
| generated-close | 25 | 0 | 22 |
| shell-17 | 25 | 0 | 20 |
| open-17 | 25 | 0 | 21 |
| rootless-ab | 14 | 0 | 0 |

These are synthetic labels, reconstructed from the published conversion dependency and caller, not copied song examples or direct live audio capture. The single reference failure among the 30 was 6/9; its visual/lexical acceptance must not be mistaken for successful playback. A dedicated reference policy is **worth prototyping** in Phase 8.5 because the inspected rule is simple and current profiles do not reproduce its exact notes. Promotion requires a live same-label/context check, semantic compatibility, listening comparison, and resource/rollback tests. If the benefit is not audible or useful, retain existing Generated profiles rather than shipping a redundant policy.

## Data model and playback boundary

Text-derived concrete notes are not original MIDI SOURCE. A future snapshot should carry `TEXT_REFERENCE` or equivalent provenance, the raw normalized chord identity, policy/version, concrete MIDI note numbers, and explicit user override status. Vault v2 currently has no agreed field for that provenance; do not masquerade as `sourceVoicing` or `manual` and do not bump the schema in PRE. Phase 8.5 must choose a safe persistence route or defer exact reference playback. If persisted, card, capture, Vault reload, and Voicing Loop must play those concrete notes rather than regenerate from the label; changing the written identity must invalidate or explicitly re-evaluate the snapshot.

## Remaining limits

The inspected repository branch and package may not exactly match deployed assets. Same-context and different-context results are source-path proofs plus local synthetic execution, not observed live MIDI captures. Chord quality discrepancies (11, 13, combined alterations), 6/9 translation failure, and soundfont/timbre differences mean exact note sets alone do not establish perceptual equivalence. No threshold or voicing policy was tuned on private MIDI or user recordings.
