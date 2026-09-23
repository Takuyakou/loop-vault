<!-- phase-id: 7.0 -->

# Phase 7.0 — Core v2 Research

Read root `AGENTS.md` first. This README is the phase entry point; Git and current code outrank documentation.

## Status

- **Status:** in-progress
- **Active stage:** P7.0-02
- **Completed stages:** P7.0-00 (`d9567779e37118899d85fcfcb71abc03903de93c`), P7.0-01 (`afe5647cadb662d4957145c125373c5c6b92bf27`)
- **Base commit:** `362e0df3d0cd21ab7d697f792553974703d44a8b`
- **Branch:** `research/phase7-core-v2`
- **Next action:** define versioned temporal Gold for P7.0-02.

## Required Reading Order

1. Root `AGENTS.md` — common safety rules.
2. [`00-START-HERE.md`](00-START-HERE.md) — supplied research brief.
3. [`01-PHASE7-MASTER-INSTRUCTIONS.md`](01-PHASE7-MASTER-INSTRUCTIONS.md) — scope and research constraints.
4. [`02-PHASE7-STAGES.md`](02-PHASE7-STAGES.md) — stage objectives.
5. [`03-PHASE7-EVALUATION-CONTRACT.md`](03-PHASE7-EVALUATION-CONTRACT.md) — evaluation definitions.
6. [`04-PHASE7-EXPERIMENT-MATRIX.md`](04-PHASE7-EXPERIMENT-MATRIX.md) — required comparisons.
7. [`05-PHASE7-LOCAL-PRIVATE-DATA-POLICY.md`](05-PHASE7-LOCAL-PRIVATE-DATA-POLICY.md) — private data handling.
8. [`work-instructions.md`](work-instructions.md) — repository workflow mapping.
9. [`execution-state.json`](execution-state.json) — resume state; reconcile against Git.
10. [`reports/README.md`](reports/README.md) — stage reports.

## Stages

### P7.0-00 — Repository / Evidence / Contract Audit
Map current behavior, corpus and Gold availability, protected paths, baseline commands, and known failures.

### P7.0-01 — Boundary × Role Oracle Ablation
Measure the four product/Gold boundary and role combinations on clean and melody-containing corpora.

### P7.0-02 — Temporal Ground Truth / Boundary Taxonomy
Separate harmonic boundaries, voicing boundaries, and ornaments.

### P7.0-03 — Tier 1 End-to-End Fidelity Harness
Compare independent Gold notes at extraction, persistence, reload, and playback endpoints.

### P7.0-04 — Harmonic Truth / Equivalence / Rendering Contract
Freeze Tier 2 identity and playback-equivalence definitions.

### P7.0-05 — Failure Decomposition / Correction Cost / Margin
Diagnose current Core by checkpoint and correction action.

### P7.0-06 — Corpus Expansion / Sealed Synthetic Holdout / Baselines
Separate data splits and freeze copy baselines before comparison.

### P7.0-07 — Candidate Representation / Vocabulary Experiments
Compare legacy, bounded expansion, and factorized candidates.

### P7.0-08 — Boundary / Role / Local Scorer Experiments
Compare temporal proposals and role evidence, including short passing chords.

### P7.0-09 — Modular Tournament / Decoder / Copy Baseline Comparison
Run the predeclared interaction matrix within the configuration budget.

### P7.0-10 — External Baseline / Live MIDI / Product Architecture Decisions
Assess BACHI feasibility, live-path sharing, vocabulary, and a shortlist.

### P7.0-11 — Final Sealed Evaluation / Architecture Decision / Phase 8 Handoff
Run one sealed final evaluation and stop after the research handoff.

## Rules recap

Follow root `AGENTS.md`. Keep production behavior and schema unchanged during Phase 7. Do not merge or push automatically.
