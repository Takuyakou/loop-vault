# P5.35 Reports

Stage and promotion reports for the Context-Aware Harmonic Evidence /
Carryover-Resistant Ranking phase.

- `P5.35-00-audit-baseline.md` — audit / insertion seam / protected surfaces /
  frozen promotion thresholds / baselines.
- `P5.35-01-shadow-temporal-evidence.md` — shadow temporal-evidence classifier
  (orthogonal temporalRole + structuralBass/shortTransient flags) + hardening.
- `P5.35-02-shadow-carryover-resistant-ranking.md` — shadow re-ranking on a
  carryover-attenuated histogram (same candidate set / same scorer; anti-oracle).
- `P5.35-03-promotion-evaluation.md` — Contract-04 gate A–J evaluation;
  `PROMOTION = FAIL` (Gate A: LF-MIDI-001 failure is meter-fragmentation, not
  carryover); production integration NOT authorized.
- `templates/P5.35-shadow-window-template.md` — shadow window diagnostic template.
- `templates/P5.35-promotion-report-template.md` — promotion decision template.

Reports carry only privacy-safe aggregates. Never commit private MIDI filename,
path, checksum, raw notes, audio, or `.local-evaluation` content.
