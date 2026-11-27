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
- `P5.37-02-promotion-evaluation.md` — end-to-end DEFAULT-analyzer promotion
  evaluation (baseline parity test-locked; Gate L confirms the correction survives
  smoothing). `PROMOTION = PASS` (all gates A–M); 4/4 known targets improve E2E;
  whole-file 8/33 (4 confirmed + 4 SUPPORTED, 0 SUSPICIOUS). Includes the P5.37-03
  integration proposal. Production diff = 0.
- `P5.37-03-production-semantic-integration.md` — production wiring of frozen v1 in
  `legacy.ts` behind `enableUnionChimeraPartition` (default OFF) with a shared pure
  trigger `src/domain/midi/unionChimera.ts`. OFF = exact legacy (clean scope 3235
  green, default OFF); ON == promoted shadow byte-for-byte. Production runtime
  default behavior unchanged; rollback = flag OFF.
- `P5.37-05-hardening-acceptance.md` — full regression + private acceptance;
  initial `DEFAULT-ON = NOT APPROVED` (fix ships opt-in). **Superseded on the
  default-on decision by `P5.37-05a` (see below); the regression/acceptance
  evidence in it still stands.**
- `P5.37-05a-default-on-addendum.md` — **one-time re-evaluation → `DEFAULT-ON =
  APPROVED`.** Absolute overhead ~+20 ms (13→33 ms) is imperceptible for one-shot
  import, so performance is informational (not a hard gate); the 4 additional LF
  triggers are all SUPPORTED-LIKELY-CORRECTION (0 SUSPICIOUS). Default is now ON
  (`enableUnionChimeraPartition !== false`); `false` = exact-legacy rollback,
  flag retained and test-locked; full existing suite green with default ON
  (3236 tests). Frozen policy v1 unchanged; perf optimization deferred.
- `P5.37-06-closeout.md` — **phase closeout.** Final status `PASS — PRODUCTION
  UNION-CHIMERA FIX INTEGRATED, HARDENED, AND ENABLED BY DEFAULT`. Records Git
  binding, causal model, production seam, default-ON + rollback, promotion, private
  known result (33 W2 / 8 triggered / 4 CONFIRMED + 4 SUPPORTED / 0 SUSPICIOUS /
  19→25), hard-negative + corpus safety, official regression (395 files / 3279
  tests, 0 failures, default ON), determinism/boundedness/source-fidelity,
  Family A DEFERRED, representability OPEN, future optimization note. No new
  implementation/policy/perf change. No merge/push/tag.
- `templates/` — shadow/promotion/integration report templates.

Reports carry only privacy-safe aggregates. Never commit the private MIDI
filename, path, checksum/fingerprint, raw notes, full progression, audio, or
`.local-evaluation` content. Use the anonymous IDs `LF-MIDI-001` and
`REAL-WR-01..04` only.
