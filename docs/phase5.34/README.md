<!-- phase-id: 5.34 -->

# Phase 5.34 — MIDI Import Failure Isolation

## Status

- **Status:** in-progress
- **Active stage:** P5.34-00 (audit / baseline / contract lock)
- **Completed stages:** none
- **Known failure:** LF-MIDI-001
- **Cold-start handoff:** ACCEPTED

## Required Reading Order

1. Root `AGENTS.md` — common safety rules
2. [`work-instructions.md`](work-instructions.md) — full spec
3. [`execution-state.json`](execution-state.json) — machine-readable resume state
4. [`contracts/01-scope-and-stop-boundary.md`](contracts/01-scope-and-stop-boundary.md)
5. [`contracts/02-evidence-classification.md`](contracts/02-evidence-classification.md)
6. [`contracts/03-experiment-matrix.md`](contracts/03-experiment-matrix.md)
7. [`contracts/04-source-truth-protection.md`](contracts/04-source-truth-protection.md)
8. [`contracts/05-privacy-and-fixtures.md`](contracts/05-privacy-and-fixtures.md)

## Goal

Separate the causes of `LF-MIDI-001` before any production fix.

### CONFIRMED repository facts

- per-chord `sourceVoicing` exists;
- Source Bassline exists for a selected bass voice;
- Analyzer/harmonic interpretation and practice voicing generation are distinct building blocks;
- the repository-wide `Source Truth → Harmony Interpretation → Practice Rendering` contract remains PROPOSED.

### USER-REPORTED / prior-analysis evidence

A local private failure fixture has been observed with roughly:

- structured single-track chord material;
- PPQ around 96;
- meter metadata `1/4`;
- about 65 quarter-note beats;
- imported output fragmented into about the same number of cells with many empties;
- small bass/upper onset offsets;
- some chord labels that explain the pitch collection poorly.

These observations do not establish a root cause.

## Authorized scope

- phase documentation
- diagnostic scripts
- test/shadow-only pure helpers
- deterministic synthetic fixtures
- ignored local private-MIDI evaluation
- reports

## Forbidden scope

- production MIDI import/analyzer behavior changes
- default analyzer changes
- Vault schema/fileVersion changes
- playback/UI changes
- production onset threshold promotion
- automatic meter correction
- Preserve-first/sourcePerformance implementation
- merge/push/tag/release

## Questions

1. How much fragmentation is meter-driven?
2. Does meter currently act as harmony-boundary authority?
3. Does meter-independent segmentation reduce fragmentation safely?
4. How much does small onset jitter matter?
5. Are bass re-strikes treated as harmony changes?
6. Which label errors remain after segmentation is controlled?
7. Are remaining errors generation/ranking/representation problems?
8. Do P5.24/P5.26 paths actually fire on this topology?
9. What is the minimum next implementation?

## Experiment matrix

| Variant | Meter | Segmentation | Onset |
|---|---|---|---|
| A | original | current | current |
| B | diagnostic 4/4 metadata view only | current | current |
| C | original retained | meter-independent diagnostic shadow | current |
| D | original retained | meter-independent diagnostic shadow | bounded PPQ-normalized sweep |

These are diagnostics, not product modes.

## Stages

- P5.34-00 audit/baseline/contracts
- P5.34-01 isolation harness
- P5.34-02 A/B/C/D experiment
- P5.34-03 synthetic regression corpus
- P5.34-04 causal report/next plan
- P5.34-05 hardening/closeout

No production implementation starts in P5.34.

## Stop boundary

P5.34 stops after causal isolation + next-plan creation. No fix phase starts
automatically. After P5.34-05, STOP.
