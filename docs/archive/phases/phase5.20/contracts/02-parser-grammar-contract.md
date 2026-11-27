<!-- phase-id: 5.20 -->
# Contract 02 — Parser / Grammar

## Grammar v1

- **Bar notation:** `| Dm7 G7 | Cmaj9 | Am7 |`. Every non-empty bar must have
  exactly 1, 2, or 4 chord tokens in 4/4. Their durations are exactly 4, 2, or
  1 beats respectively.
- **Simple notation:** `Dm7 G7 Cmaj9 Am7`. Each whitespace-delimited token is
  one 4/4 bar of four beats.
- **Chord tokens:** absolute labels go through existing `parseChordLabel()` and
  are shown canonically with `labelFromSymbol()`. Slash chords remain one token:
  `C/E`, `G7/B`, and `C6/9` are not split on `/`.
- **Roman/numeric tokens:** use existing `parseFastChordEntry()` only when a
  user has explicitly confirmed a valid key. An inferred candidate is never
  enough to resolve Roman or numeric input.

## Diagnostics and determinism

The transient parse result retains raw token, canonical token when valid,
UTF-16 source range, bar, exact timing, and a diagnostic for every invalid or
unsupported token. Valid tokens may be rendered beside invalid tokens, but any
unresolved diagnostic prevents conversion. There is no silent replacement,
approximation, or partial save.

## Explicitly rejected in v1

`N.C.` / `NC` / `no chord` / `-`, empty bars, 3-chord bars, `%`, `x4`, comments,
section headers, `:2`, lyric-mixed text, arbitrary repeat grammar, unsupported
meter, malformed slash labels, and tokens over the bounded-input limit are
diagnostics. `N.C.` is excluded because the current chord preview path does not
yet prove silent playback for text-derived rests.

## Key state

Key state is transient `unknown`, `inferred`, or `confirmed`. Absolute input
may remain unknown and is saveable. Inferred candidates are explicitly labelled
as suggestions only. Only a confirmed key may be persisted as `detectedKey` or
used for Roman parsing and degree display.
