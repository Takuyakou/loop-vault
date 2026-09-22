# Contract 02 — Source Meter vs Presentation Grouping

## Required separation

P5.38 must model or at least reason explicitly about two concepts:

```text
SOURCE METER / SOURCE BAR
```

and

```text
DOWNSTREAM PROGRESSION / PRESENTATION GROUP
```

They may coincide in ordinary 4/4, but they are not universally identical.

## Source truth

For LF-MIDI-001:

```text
source meter = 1/4
```

must remain true after analysis.

## Presentation semantics

The downstream grouping unit exists to organize harmonic progression output coherently.

It must not imply that the source meter was different.

## Invariants

A grouping fix must not change:
- note timing;
- harmonic timeline identities before downstream grouping;
- Family B union-chimera decisions;
- source-meter metadata.

## Naming

If code introduces a new grouping abstraction, avoid reusing `bar` unless it truly means source bar.
