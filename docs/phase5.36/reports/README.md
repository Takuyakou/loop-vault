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
- `templates/P5.36-attack-provenance-template.md` — per-window attack-provenance
  diagnostic template.
- `templates/P5.36-causal-verdict-template.md` — causal verdict + P5.37 proposal
  template.

Reports carry only privacy-safe aggregates. Never commit the private MIDI
filename, path, checksum/fingerprint, raw notes, audio, or `.local-evaluation`
content. Use the anonymous ID `LF-MIDI-001` only.
