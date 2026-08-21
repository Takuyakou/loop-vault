# Contract 05 — Practice Source / Levels / Sections

Source Bassline is a Bassline Echo source, not a new Practice mode. It is enabled only for a valid snapshot.

## Captured harmonic authority

A captured harmony span is clipped relative to the authoritative snapshot range and uses exact integer-backed timing. `allowedPitchClasses` is the sorted unique union of the existing `chordPitchClasses(ChordSymbol)` result and an explicit slash-bass pitch class when present. No alternate chord recipe is introduced.

Canonical spans are half-open `[start, end)`, clipped to `0..length`, and ordered as Contract 02 specifies. Exact duplicate spans are deduplicated. A conflicting overlap makes captured harmony unavailable rather than choosing a winner. Gaps are allowed, but an event onset in a gap cannot be simplified. At an exact boundary the ending span is inactive and the next span is active. An event crossing a chord boundary uses the one unambiguous span active at its onset and preserves its cropped duration.

Current-harmony comparison uses the same canonical harmony payload and SHA-256 procedure. Outcomes are `match`, `mismatch`, or `comparison-unavailable`; only `match` uses current progression context. Captured context may still drive disclosed L1/L2/Chord Context when current context mismatches, but if captured context itself is absent/ambiguous those features are unavailable. No float-derived or guessed span is accepted.

## Window first, projection second

Initial windows are 1 or 2 bars, aligned to captured 4/4 boundaries. Crop all source notes exactly to the half-open window first, setting window continuation facts, and only then create a practice projection.

- A note ending at window start or starting at window end is excluded.
- An empty window remains navigable but disables preview, play, record, and review with a localized reason.
- For an odd captured bar count, the final 2-bar step is an explicitly labelled 1-bar final window; it never reads past the snapshot.
- Previous is disabled at the first window. Next is disabled when no later window start exists.
- The explicit current bar range is always visible.

`Transfer` keeps its existing key/variation meaning and is unavailable for Source Bassline v1 with a localized reason; it is never section navigation.

## Level 3

The persisted snapshot remains all-note. The current Bassline target contract is ordered and non-overlapping, so Level3 projects the cropped window deterministically:

1. group notes with the exact same cropped onset;
2. choose lowest pitch, then longer duration, then higher velocity, then canonical order;
3. clip a chosen event at the next chosen onset when they overlap;
4. preserve rests and every remaining exact onset/duration fact.

The label is `元ライン（単音化）` / `Source line (monophonic)`. UI announces omitted simultaneous-note and clipped-overlap counts and never claims the projection is the complete performance.

## Level 1 and Level 2

Both derive from the Level3 window projection plus valid captured harmony and are never persisted.

- `ルート中心の簡略版` / `Root-focused simplification`: preserve projected rhythm; map to nearest playable active captured root in MIDI 28..55; equal-distance ties choose lower.
- `コードトーン簡略版` / `Chord-tone simplification`: preserve projected rhythm; keep an already legal playable note, otherwise map to nearest playable active captured allowed pitch class in MIDI 28..55; equal-distance ties choose lower.

If any projected onset has no single active captured span, the entire derived level is unavailable with a reason. No partial guessing, AI claim, or source-faithful claim is allowed.

## Playback lifecycle and accessibility

Source/window/level/range changes, previous/next navigation, stop, route/tab change, and unmount cancel every target/chord/metronome/preview schedule, stop exclusive target/take playback, release instruments, and leave no stale completion callback. Record & Compare reuses the existing store and no scoring is added.

Source, level, window length, previous/next, and playback controls are keyboard reachable in visual order. The current range and disabled reason use `aria-live="polite"`/`aria-describedby`; errors use `role="alert"`. Focus remains on the invoked navigation control. At 320 CSS px and 200% zoom controls wrap without hiding the current range or causing page-level horizontal scrolling.