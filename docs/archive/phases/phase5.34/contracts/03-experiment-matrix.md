# Contract 03 — Experiment Matrix / Synthetic Fixtures

## A/B invariants
A and B must have identical musical note events. Only the diagnostic meter view differs.

## D sweep
Use PPQ-normalized `0, P/96, P/48, P/24, P/16, P/8`, rounded/deduplicated deterministically.
Never promote a threshold in P5.34.

## Semantic fixtures
### S01 Abmaj9
`Ab C Eb G Bb` → Abmaj9 family.

### S02 altered G dominant
`G B Bb Eb F` → `G7(#9,b13,no5)` family or current-vocabulary canonical equivalent.
`Fm11/G` is not canonically equivalent if it fails to explain B natural / invents incompatible essentials.

### S03 Bm7
`B D F# A` → Bm7. Hard negative: unrelated `Am11/B`.

### S04 B11(no5)-family
`B D# A C# E` → B11(no5)-family/current-vocabulary equivalent.
Hard negative: Bm11 because D# is major 3rd.

### S05 genuine inversion/slash
Simple `C/E` with E as structural bass. Must not be erased by restrike suppression.

### S06 sus
`G C D F` → G7sus4-family. Do not force B.

### S07 m7b5
`B D F A` → Bm7b5. Preserve b5.

## Timing fixtures
- T01 all simultaneous
- T02 bass leads slightly
- T03 bass leads more
- T04 distributed micro-jitter
- T05 full chord → bass re-strike → same full chord; expected one harmony absent contrary evidence
- T06 genuine two-chord boundary; must not merge
- T07 arpeggio hard negative; do not blindly verticalize
- T08 genuine structural slash-bass change; do not erase

## Meter fixtures
Same musical topology under 4/4, 1/4, and absent/unknown if parser supports it.
Meter may affect display/sectioning only where product contract says so; chord identity itself must not become a different harmony solely because meter metadata changed.
