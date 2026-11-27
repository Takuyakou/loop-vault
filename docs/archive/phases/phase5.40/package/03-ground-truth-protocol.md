# Independent Local Ground-Truth Protocol

## Purpose

P5.40-00 must establish the correct local harmonic interpretation for each FC-SAFETY-03 local state **before** any correction is designed.

## Ground truth must be independent

Ground truth must not be generated from:

- current production output;
- Model A output;
- candidate scores;
- expected Family C wins;
- known answer tables;
- desired promotion outcome.

## Review order

For each anonymous local state:

1. Generate an ignored-local **source-only** evidence page.
2. Review source evidence before candidate identities are revealed.
3. Record an interpretation or explicitly record insufficient evidence.
4. Only afterward reveal a separate candidate-comparison page if needed.
5. Keep candidate origin sealed until the review decision is frozen.

## Source-only evidence may include

- a short MIDI excerpt;
- bounded context before/after;
- onset and duration relationships;
- low-note / bass movement;
- pitch-class relations normalized to an anonymous reference;
- sustain / re-strike / common-tone information;
- local time-state boundaries.

## Source-only evidence must not include

- production label;
- Shadow label;
- candidate rank;
- candidate score;
- penalty contribution;
- which candidate is expected to win;
- a Family C/Legacy origin label;
- private filename/path/checksum.

## Allowed classifications

Do not force a binary answer. At minimum allow:

- `CONFIRMED-IDENTITY`
- `TEMPORAL-MIXTURE`
- `MULTIPLE-PLAUSIBLE`
- `INSUFFICIENT-EVIDENCE`
- `NEITHER-PROPOSED`

If exact identity is justified, record the full semantic identity needed for evaluation, including independent bass and explicit omissions/modifiers when relevant.

## Freeze rule

The local classifications must be committed/frozen before any Stage01 correction experiment uses them.
