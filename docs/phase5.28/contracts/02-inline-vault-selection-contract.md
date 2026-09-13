<!-- phase-id: 5.28 -->

# P5.28 Inline Vault Selection Contract

## Product shape

The source-less Voicing Loop renders one compact selection surface in this order:

1. `Voicing Loop` heading and existing description
2. `練習する進行` / `Progression to practice`
3. labeled search input
4. recent progressions, or newest eligible saved progressions when no recent item exists
5. an in-place `すべての進行を見る` expansion
6. secondary Text Progression action

Each progression is one native whole-row button. It exposes title, effective key,
safe chord-label preview, and BPM when present. It never shows memo, Idea metadata,
asset name, source filename, source path, or private analysis data. Frequent list and
keyboard interactions add no entrance, stagger, or positional animation.

## Eligibility and search

- The existing `buildProgressionVoicingPracticeHandoffFromVault` result is the
  eligibility authority. A row exists only when the current Vault source can build
  a valid detached P5.27 handoff.
- Search uses the repository's existing normalized harmonic-query semantics and is
  limited to title, chord labels, and effective key.
- Search always covers all eligible candidates, independent of collapsed/all state.
- `すべての進行を見る` expands the same list region; it does not open a modal.
- The existing Bass Practice picker remains unchanged because its 4/4 Chord Context
  candidate contract is not equivalent to Voicing Loop eligibility.

## Recent source storage

- Storage is a separate versioned local preference, never Vault data:
  `loop-vault:voicing-loop-recents:v1`.
- The payload contains only `{ ideaId, blockId }` references, no title, chords,
  filenames, paths, voicing, or session data.
- It is a deterministic LRU capped at five unique references.
- A successful selection moves its reference to the front. Invalid, deleted,
  malformed, duplicated, and no-longer-eligible references are excluded and pruned.
- No Vault schema, `fileVersion`, or Practice History data changes.

## Transaction and lifecycle

- A row click synchronously re-reads the current visible Vault through the existing
  P5.27 handoff builder. Only `ok` installs detached snapshots and records recent use.
- Missing, deleted, or invalid sources fail closed with existing localized feedback.
- The detached snapshot remains session-owned after selection.
- Direct sidebar re-entry clears the old handoff. The existing view key/unmount and
  transport cleanup stop old audio before a new source is installed.
- No async source request is introduced, so an older async result cannot overwrite a
  newer source. Existing runtime request invalidation remains unchanged.

## Scope boundary

Source MIDI, Custom, Basic Shell, Basic Full, Left-hand, clock, playback, keyboard,
count-in, metronome, loop, Learn/Recall, and no-scoring behavior remain P5.27-owned.
The optional previous-session resume card is omitted because reconstructing mutable
BPM/session state would expand persistence beyond this selection UX.
