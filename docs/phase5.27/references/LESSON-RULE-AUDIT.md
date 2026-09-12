# Lesson Rule Audit — P5.27-00 Locked Table

## Status semantics

- `SUPPORTED`: the exact rule below is approved by an existing Loop Vault rule or the explicit P5.27 Basic 1–7–3/6th-family contract.
- `UNSUPPORTED_RULE`: P5.27 has no approved rule for that cell. Do not generate another family and do not silently fall back.
- `GENERATION_ERROR`: the cell is supported, but deterministic register/span/candidate construction failed for the current settings.

`R` in current code is displayed as degree `1` in this table. `Bass` means the explicit slash bass. Added neutral colors in existing Rootless A/B templates must be disclosed as added colors; they are not source facts.

## Locked family table

| Chord family | Basic Shell | Basic Full | Left-hand | Support status | Evidence/source |
|---|---|---|---|---|---|
| maj7 / maj9 | `1 + 7` | `1 + 7 + 3` | A `3-5-7-9`; B `7-9-3-5` | All supported | P5.27 Basic contract; existing `rootless-ab` maj7/maj9 templates |
| m7 / m9 / m11 | `1 + b7` | `1 + b7 + b3` | A `b3-5-b7-9`; B `b7-9-b3-5` | All supported | P5.27 Basic contract; existing minor `rootless-ab` templates |
| 7 / 9 / 13 | `1 + b7` | `1 + b7 + 3` | A `3-13-b7-9`; B `b7-9-3-13` | All supported | P5.27 Basic contract; existing dominant `rootless-ab` templates |
| 6 / 6/9 | `1 + 6` | `1 + 6 + 3` | — | Basic supported; Left-hand `UNSUPPORTED_RULE` | Explicit P5.27 6th-family contract; current Rootless compatibility rejects sixth families |
| m6 | `1 + 6` | `1 + 6 + b3` | — | Basic supported; Left-hand `UNSUPPORTED_RULE` | Explicit P5.27 m6 contract; current Rootless compatibility rejects min6 |
| m7b5 | `1 + b7 + b5` | `1 + b7 + b3 + b5` | A `b3-b5-b7-9`; B `b7-9-b3-b5` | All supported | Existing `shell-17` policy requires altered fifth; existing min7b5 Rootless templates |
| dim triad | — | — | — | All `UNSUPPORTED_RULE` | No seventh/6th Basic rule; current Rootless compatibility rejects dim |
| dim7 | — | — | — | All `UNSUPPORTED_RULE` | Existing chord facts expose `bb7`, but no approved P5.27 Basic lesson rule; current Rootless compatibility rejects dim7 |
| sus2 / sus4 | — | — | — | All `UNSUPPORTED_RULE` | No third or seventh Basic rule; current broad shell generator alone is not lesson approval |
| 7sus4 | `1 + b7` | `1 + b7 + 4` | — | Basic supported; Left-hand `UNSUPPORTED_RULE` | Existing `dom7sus4` defining-tone/seventh policy; current Rootless compatibility rejects sus |
| altered dominant | `1 + b7` plus required altered identity | `1 + b7 + 3` plus required altered identity | A/B dominant template with explicit alterations | All supported for current dom7/dom9/dom13 qualities | Existing `getStyleTonePolicy` and altered `rootlessTemplates`; exact rules below |
| slash chord | Replace `1` with `Bass` in an otherwise supported Basic rule | Replace `1` with `Bass` in an otherwise supported Basic rule | — | Basic conditional; Left-hand `UNSUPPORTED_RULE` | Existing `shell-17` bass substitution; current Rootless compatibility explicitly rejects slash chords |

## Altered-dominant exactness

For Basic, “required altered identity” is not arbitrary chord completion. It is exactly the existing tone policy:

1. include altered fifth labels (`b5`/`#5`) present in the parsed chord;
2. include the first explicit extension/color in descriptor order;
3. do not add a second alteration unless another approved rule later requires it.

For Left-hand, retain the existing deterministic Rootless A/B templates:

- A: `3, first explicit alteration, b7, second explicit alteration or 13`;
- B: `b7, first explicit alteration, 3, second explicit alteration or 13`.

Supported explicit alterations are the existing set `b9`, `#9`, `#11`, and `b13`. Stage02 must reuse these template facts rather than create a second altered-dominant algorithm.

## Slash-chord exactness

- MY Source/Custom always preserves its exact selected pitches; this Lesson table does not rewrite MY modes.
- Basic uses the explicit bass pitch class as `Bass`, followed by the supported underlying family degrees.
- If the underlying family cell is unsupported, the slash form is also `UNSUPPORTED_RULE`.
- Left-hand remains `UNSUPPORTED_RULE`; it must not drop the slash bass and pretend the unslashed Rootless rule was selected.

## Generation and display invariants

- Supported output is deterministic for the same chord, family, span/register settings, and predecessor context.
- The exact generated MIDI pitch and octave are retained.
- Each displayed degree is derived from the produced pitch class and the canonical chord descriptors.
- A supported rule that cannot fit/build returns `GENERATION_ERROR`; it does not become `UNSUPPORTED_RULE` and does not use generated-close fallback.
- MY Source and MY Custom are resolved outside this table and never fall back to a Lesson family.
- Open/Melody Voicing is deferred from P5.27 v1.

## Stage02 test matrix

Tests must cover every table row, Shell/Full separation, Rootless A/B, altered identities, slash-bass substitution, exact unsupported states, generation failure, degree facts, deterministic output, and absence of silent fallback.
