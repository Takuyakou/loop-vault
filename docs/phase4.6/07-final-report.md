# Loop Vault Phase 4.6 Final Report

## Final decision

**C. Generator Bug Phaseへ分岐**

The bounded Shadow experiment passed its Dev coverage, economy, provenance, runtime and counterfactual safety gates. However, P4.6-01 and P4.6-02 established that the missing basic m7 identities are one manifestation of a general generator defect: automatic bass attachment replaces the root-position canonical identity instead of coexisting with it.

Per the preregistered decision rule, Phase 4.6 does not connect Shadow candidates to Product. A dedicated bug-fix phase must be preregistered without simultaneous root, scoring, boundary or Analyzer-mode changes.

## Baseline and trace

- corpus: Dev 40 MIDI / 320 events
- raw / canonical / eligible / same-root recall: 78.75%
- raw missing: 68
- basic m7 trace: Dm7 6 + Em7 2 = 8/8 completed
- first invalidation: T2 core generation / root-position identity
- Gold root hypothesis missing: 0
- min7 core missing: 0
- slash-only generated: 8

The root and min7 core are scored. The selected bass is then attached to every compatible candidate, leaving only identities such as `Dm7/C`, `Dm7/A` or `Em7/G`.

## Missing taxonomy

| Family | Missing / Gold | Missing rate | Primary cause |
|---|---:|---:|---|
| A7b9 | 40 / 40 | 100% | alteration generation missing |
| Am9 | 6 / 40 | 15% | slash-bass generation missing |
| Dm9 | 4 / 40 | 10% | slash-bass generation missing |
| Dm7 | 6 / 40 | 15% | slash-bass generation missing |
| G7sus4 | 6 / 40 | 15% | slash-bass generation missing |
| Cmaj9 | 2 / 40 | 5% | slash-bass generation missing |
| G13 | 2 / 40 | 5% | slash-bass generation missing |
| Em7 | 2 / 40 | 5% | slash-bass generation missing |

All 68 misses were classified: alteration generation 40, slash-bass generation 28, other 0.

## Decision Lock and generator

Selected family: `plain-minor-seventh-root-position-companion-v1`.

```text
existing slash min7 raw candidate
+
complete note-instance evidence for root, m3, P5, m7
=
same root and min7 quality with bass omitted
```

- no Gold label input
- no root, quality, tension or score change
- one generated candidate per source and root
- maximum 4 per event
- complete note-instance provenance required
- deterministic raw-score/canonical ordering
- 12-key synthetic generation and canonical round-trip: 12/12
- Product, UI and Vault connection: none

Altered dominant generation was not mixed into this experiment.

## Shadow coverage

| Metric | Baseline | Shadow union |
|---|---:|---:|
| overall canonical recall | 78.75% | 81.25% |
| target plain m7 recall | 90% | 100% |
| target rescued | - | 8 / 8 |
| still missing | 68 | 60 |

Candidate economy:

- total added: 65
- average added per event: 0.203125
- maximum added per event: 2
- canonical duplicate: 0
- missing provenance: 0
- deterministic output: 100%

Same-process performance:

- baseline median: 154.490 ms
- Shadow median: 160.349 ms
- overhead: 3.793%
- peak heap delta difference: 2,877,416 bytes

Product rank 1, Top-3, all Product candidates and scores, and Analyzer output matched the frozen baseline hashes.

## Counterfactual competition

Shadow candidates were inserted only into an evaluation copy of the deduplicated pre-clamp raw ranking.

- rank 1 changed: 3 / 320 (0.9375%)
- improved / regressed / neutral: 3 / 0 / 0
- tie-break-only: 3
- slash-only change: 3
- root changed: 0
- plain stolen by altered: 0
- Top-3 canonical: 73.125% to 75.000% (+1.875pp)
- Top-3 root: 95.9375%, unchanged
- MRR delta: +0.014566
- changed score margin: exactly 0 for all three changes

The Dev counterfactual is low-risk, but it does not override the Generator Bug branch rule or authorize Product connection.

## Correction Log

The Label Correction Log is implemented independently in PR #275 (`feature/p46-label-correction-log`):

- record only after a successful Vault save/append
- local JSONL with schema version 1
- accepted rank1, selected rank2/rank3, manual, reverted and deleted events
- opt-out, export, clear and deduplication
- explicit stale-edit field
- log failure cannot fail the Vault save
- no MIDI bytes, song title, absolute path, source file name, Idea title, memo or personal identifier
- no external transmission

It is a research-priority signal, not Fixed Gold. Minimum useful volume is 100 saved events and 20 progressions; 200-300 events is preferred.

## Gates and invariants

All G1-G22 gates pass. G7 is not applicable because this family generates no extension. In particular:

- `defaultAnalyzerMode = phase4-v1`
- `fileVersion = 1`
- schema, Timeline, voicing, boundary and Analyzer output unchanged
- Product rank and score unchanged
- Validation and Holdout not run
- no private MIDI added by Phase 4.6
- no Product connection

## Rollback

Remove the evaluation-only Phase 4.6 scripts and reports. No Product rollback, data migration or Vault rewrite is required.

## Next work

1. Preregister a dedicated automatic-bass/root-position generator bug-fix phase.
2. Keep root estimation, primary scoring, boundaries and Analyzer mode fixed.
3. Evaluate with new independent Gold before any Product connection.
4. Accumulate Correction Log volume before using real usage to prioritize the next family.
5. Keep altered-dominant generation paused until the general identity bug is resolved.
