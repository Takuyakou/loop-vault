# First-wave Semantic Fixtures

These are minimum semantic contracts; exact octave may be Stage00-approved from
the promoted rule.

## Eadd9/F#

```text
identity: Eadd9/F#
LH degree: 9 (F#)
RH degrees: 1 3 5
coverage: Literal
added: none
omitted: none
```

Must not add maj7.

## Dadd9/E

```text
identity: Dadd9/E
LH: 9
RH: 1 3 5
coverage: Literal
```

Must not add maj7.

## Am9/C

```text
LH: b3
RH covers: 1 9 5 b7
coverage: Literal
```

## Am11/B

```text
LH: 9
RH covers: 1 b3 11 b7
omit: 5
coverage: Performance Reduction
```

## Gmaj9/A — compact

```text
LH: 9
RH: 7 1 3
omit: 5
coverage: Performance Reduction
```

## Gmaj9/A — full

```text
LH: 9
RH: 5 7 1 3
omit: none
coverage: Literal
```

## Bm7b5

b5 must be retained.

## Cdim7

bb7 identity/spelling semantics must not collapse to major 6.

## G7sus4

4 must be retained; 3 must not be forced.
