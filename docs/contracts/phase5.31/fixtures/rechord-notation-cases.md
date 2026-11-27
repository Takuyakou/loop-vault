# ReChord notation cases

## Official-style score syntax

Should parse:

```text
C|G|A m7|E m7
F|E m7 A m7|D m7|G 7
# chorus memo
F M7|G 7
E 7%_A m7|=G
F C/E|D m7 D m7/G
C add9
```

## Compact adjacency

Should parse only if unique:

```text
C9B7(#9,#5)
Em9Db7(#9)
Am9Am9/C
```

## Must not mis-split

```text
C/E
F#9
BbM7
B7(#9,#5)
C7(b9,#11,b13)
```

## Invalid / fail closed

```text
% Cmaj7      # no previous chord
= Cmaj7      # no previous sounding chord
Cmaj7 _ =    # hold after rest must fail
Cmaj7 Dm7 G7 # 3-cell bar when bars are explicit/normalized
```

Exact surface grammar for invalid examples may be normalized by the Stage00
parser audit; preserve the semantic failure cases.
