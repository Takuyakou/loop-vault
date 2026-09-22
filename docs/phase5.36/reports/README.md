# P5.36 Reports

Stage and causal-verdict reports for the Current-Attack / Meter Causal Validation
phase.

- `P5.36-00-audit-baseline.md` — audit / seams / baselines / frozen LF-MIDI-001
  target windows / contract lock.
- `P5.36-01-attack-provenance.md` — beat-bucket attack provenance + PC-inflation /
  cross-bucket / bass metrics; `SUPPORTED-HYPOTHESIS` (wrong-root windows merge two
  divergent beat-buckets; density is not the discriminator).
- `P5.36-02-meter-normalized-identity.md` — 1/4 vs 4/4 A/B; Outcome M2 (meter tag
  alone does not change legacy 2-beat identity; wrong-root failure lives in the
  fixed 2-beat aggregation; 1/4 drives downstream 65→17 bar fragmentation).
- `P5.36-03-subwindow-score-decomposition.md` — W2/B0/B1/AC decomposition with a
  parity-guarded scorer replica (98/98); **CONFIRMED** the wrong-root failure is
  fixed-2-beat evidence mixing (union-only winner, root wins neither beat, support
  spans both, Case B slash reinterpretation); naïve 1-beat split rejected by hard
  negatives.
- `P5.36-04-causal-verdict.md` — finalized causal model: Family A (meter →
  fragmentation) + Family B (fixed-2-beat mixing) both CONFIRMED; carryover / bass /
  density / generation / meter-semantic REJECTED; representability kept separate.
- `P5.36-04-p537-proposal.md` — P5.37 target, existing-engine reuse audit
  (PARTIAL-REUSE of the 4/4-gated P5.24/P5.26 local-harmonic-state path), strategy
  comparison, exact seam, stages, promotion gates, rollback, complexity bound.
- `P5.36-05-hardening-closeout.md` — phase closeout; `PASS — CURRENT-ATTACK / METER
  CAUSAL VALIDATION COMPLETE; P5.37 TARGET READY`; frozen causal model, rejected
  causes, P5.37 target/seam/gates/rollback; P5.37 not created.
- `templates/P5.36-attack-provenance-template.md` — per-window attack-provenance
  diagnostic template.
- `templates/P5.36-causal-verdict-template.md` — causal verdict + P5.37 proposal
  template.

Reports carry only privacy-safe aggregates. Never commit the private MIDI
filename, path, checksum/fingerprint, raw notes, audio, or `.local-evaluation`
content. Use the anonymous ID `LF-MIDI-001` only.
