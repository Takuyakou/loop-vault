# P5.37 Reports

Stage and promotion reports for the Production Fix / Integration phase.

- `P5.37-00-audit-gate-freeze.md` — production seam audit, default-path failure
  confirmation, meter-gate location, frozen promotion gates (A–K), frozen
  baselines, Family A decision.
- `P5.37-01-meter-independent-shadow.md` — Option (b') implemented (behavior-preserving
  `beatsPerBar` parameterization + test/shadow-only seam; 4/4 parity exact; runtime
  diff 0); FINDING: the existing engine falls back on non-4/4 at its 4/4-shaped
  bar-period + per-cell evidence layers → REUSE INSUFFICIENT VIA MINIMAL
  PARAMETERIZATION; re-scope decision requested.
- `templates/` — shadow/promotion/integration report templates.

Reports carry only privacy-safe aggregates. Never commit the private MIDI
filename, path, checksum/fingerprint, raw notes, full progression, audio, or
`.local-evaluation` content. Use the anonymous IDs `LF-MIDI-001` and
`REAL-WR-01..04` only.
