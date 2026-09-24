<!-- phase-id: 7.0 -->

# Phase 7.0 — Core v2 Research

Read root `AGENTS.md` first. This README is the phase entry point; Git and current code outrank documentation.

## Status

- **Status:** in-progress
- **Active stage:** P7.0-11
- **Completed stages:** P7.0-00 (`d9567779e37118899d85fcfcb71abc03903de93c`), P7.0-01 (`afe5647cadb662d4957145c125373c5c6b92bf27`), P7.0-02 (`b935d31cf54660a3cc18d1fffc71bb84f9db0a70`), P7.0-03 (`e88aaf82b6cb1d952f56f84489d5d2ea5472a880`), P7.0-04 (`2014664b27025cf1333c0cdc8e1aa7b0e0cb5d7c`), P7.0-05 (`5dba8601a11829057b1be96b7b25087d7064238d`), P7.0-06 (`e654dc60e2447c1d8af81fa21b5f8ac4e757c753`), P7.0-07 (`75a9b5a3a7d4d7c5eb41d63ea6c3dbda502042db`), P7.0-08 (`89e2e3b787f1fac3d55261ece91b436705ef8402`), P7.0-09 (`71f4efeb778501a48f1b6875f136bf1126b0a7a6`), P7.0-10 (`6ad085f838b4674039e0c14536773adf03fbcd01`)
- **Base commit:** `362e0df3d0cd21ab7d697f792553974703d44a8b`
- **Branch:** `research/phase7-core-v2`
- **Next action:** run one sealed final evaluation, decide architecture, and write Phase 8 handoff. Local human review remains non-blocking.

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
