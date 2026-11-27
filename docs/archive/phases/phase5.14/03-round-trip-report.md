# Phase 5.14 Round-Trip Report

## Method

`npm run eval:p514:roundtrip` builds one deterministic 4/4 clip containing all
21 stored chord qualities, exports it with `p5.14-v1`, and analyzes the
resulting bytes with the unchanged `legacy-v1` analyzer.

## Result

| Classification | Count |
|---|---:|
| exact | 19 |
| same root / different quality | 2 |
| same family | 0 |
| mismatch | 0 |
| missing | 0 |

The full timeline contains 21 items for 21 inputs. There is no boundary loss.

The two non-exact items are:

- `Bbsus2` -> `Bbadd9`
- `Ebsus4` -> `Eb7sus4`

Both preserve the root and played pitch set relationship but expose an
existing Analyzer ambiguity. The exporter and Analyzer were not altered to
force a passing label.

## Interpretation

- Exporter coverage: complete for the current stored vocabulary
- Analyzer recall after export: 21/21
- Exact label round trip: 19/21 (90.48%)
- Phase 5.15 candidates: suspended/add and suspended/dominant label
  disambiguation

The regression is locked by
`src/domain/midiExport/roundTrip.test.ts`. No personal MIDI or holdout corpus
is used.

