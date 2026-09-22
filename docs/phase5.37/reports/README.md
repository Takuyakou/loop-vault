# P5.37 Reports

Stage and promotion reports for the Production Fix / Integration phase.

- `P5.37-00-audit-gate-freeze.md` — production seam audit, default-path failure
  confirmation, meter-gate location, frozen promotion gates (A–K), frozen
  baselines, Family A decision.
- `P5.37-01-meter-independent-shadow.md` — Option 2 (union-chimera local-evidence
  shadow). P5.26 reuse insufficient via minimal parameterization (Option (b')
  reverted to baseline); a new bounded, oracle-free `scripts/p537/unionChimera.ts`
  detects only the P5.36-confirmed union-chimera signature and partitions those
  windows into coherent local states (reuses the parity-guarded scorer; no
  scorer/vocab change). `PASS — READY FOR PROMOTION`; LF 4/4 targets trigger;
  whole-file trigger 8/33 (bounded); hard negatives + corpus safe.
- `templates/` — shadow/promotion/integration report templates.

Reports carry only privacy-safe aggregates. Never commit the private MIDI
filename, path, checksum/fingerprint, raw notes, full progression, audio, or
`.local-evaluation` content. Use the anonymous IDs `LF-MIDI-001` and
`REAL-WR-01..04` only.
