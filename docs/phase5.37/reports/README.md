# P5.37 Reports

Stage and promotion reports for the Production Fix / Integration phase.

- `P5.37-00-audit-gate-freeze.md` — production seam audit, default-path failure
  confirmation, meter-gate location, frozen promotion gates (A–K), frozen
  baselines, Family A decision.
- `P5.37-01-meter-independent-shadow.md` — 4/4-assumption classification (A/B/C/D);
  `BLOCKED` — a reuse-based shadow needs an authorized minimal production
  parameterization (or a discouraged 410-line private-internals fork); shadow
  policy designed but not yet demonstrated.
- `templates/` — shadow/promotion/integration report templates.

Reports carry only privacy-safe aggregates. Never commit the private MIDI
filename, path, checksum/fingerprint, raw notes, full progression, audio, or
`.local-evaluation` content. Use the anonymous IDs `LF-MIDI-001` and
`REAL-WR-01..04` only.
