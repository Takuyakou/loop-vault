# P5.15-01 — Exact Note Evidence Dedup Report

## Decision

**PASS** — the opt-in analysis-evidence pass collapses only exact identities. The feature flag remains OFF by default. Phase 4.7 fresh Holdout was not opened.

- Correctness adoption: PASS
- Stable eligibility: PASS (separate from Accuracy First adoption)
- Accuracy First eligibility: PASS / ELIGIBLE
- Resource gate: PASS

## Targeted evidence

| Case | Original notes | Effective notes |
|---|---:|---:|
| 02 clean | 33 | 33 |
| 03 exact duplicates | 66 | 33 |
| 12 | 9 | 9 |
| 15 | 8 | 8 |
| 32 | 18 | 18 |
| 02 | 33 | 33 |
| 03 | 66 | 33 |

| Condition | Case 02 effective | Case 03 effective | Normalized deep equal |
|---|---:|---:|---|
| phase4-v1 | 33 | 33 | PASS |
| phase4-v1+R1+E1 | 33 | 33 | PASS |
| phase4-v1+R1+E1+Union | 33 | 33 | PASS |
| phase4-v1+Union-OFF | 33 | 33 | PASS |
| phase4-v1+Union-ON | 33 | 33 | PASS |
| legacy-boundary-rerank+Union-OFF | 33 | 33 | PASS |
| legacy-boundary-rerank+Union-ON | 33 | 33 | PASS |
| hybrid-v1+Union-OFF | 33 | 33 | PASS |
| hybrid-v1+Union-ON | 33 | 33 | PASS |
| voice-aware-rerank-v1+Union-OFF | 33 | 33 | PASS |
| voice-aware-rerank-v1+Union-ON | 33 | 33 | PASS |

- Score / rank / confidence equal: PASS
- Case 03 duplicates removed: 33
- Velocity delta required for dedup: exactly 0; different-velocity layers remain separate

## Frozen safe existing corpora

- Status: COMPLETED
- Frozen safe suites: 10; completed: 10; skipped: 0
- Files evaluated: 317
- Conditions: phase4-v1, phase4-v1+R1+E1, phase4-v1+R1+E1+Union, phase4-v1+Union-OFF, phase4-v1+Union-ON, legacy-boundary-rerank+Union-OFF, legacy-boundary-rerank+Union-ON, hybrid-v1+Union-OFF, hybrid-v1+Union-ON, voice-aware-rerank-v1+Union-OFF, voice-aware-rerank-v1+Union-ON

| Frozen suite | Status | Files | Conditions | Regressions | Reason |
|---|---|---:|---:|---:|---|
| all-instruments | COMPLETED | 1/1 | 11 | 0 | all frozen files evaluated under every required OFF/ON condition |
| chapter3 | COMPLETED | 100/100 | 11 | 0 | all frozen files evaluated under every required OFF/ON condition |
| chord-drip-100 | COMPLETED | 100/100 | 11 | 0 | all frozen files evaluated under every required OFF/ON condition |
| endless | COMPLETED | 1/1 | 11 | 0 | all frozen files evaluated under every required OFF/ON condition |
| phase4.7-development | COMPLETED | 12/12 | 11 | 0 | all frozen files evaluated under every required OFF/ON condition |
| phase4.7-validation | COMPLETED | 12/12 | 11 | 0 | all frozen files evaluated under every required OFF/ON condition |
| suran | COMPLETED | 1/1 | 11 | 0 | all frozen files evaluated under every required OFF/ON condition |
| voicing-gold-40-file-selection | COMPLETED | 40/40 | 11 | 0 | all frozen files evaluated under every required OFF/ON condition |
| voicing-gold-burned-holdout-diagnostic-only | EXCLUDED | 0/10 | 0 | 0 | burned diagnostic-only split is outside the frozen safe suite |
| voicing-gold-development | COMPLETED | 40/40 | 11 | 0 | all frozen files evaluated under every required OFF/ON condition |
| voicing-gold-validation | COMPLETED | 10/10 | 11 | 0 | all frozen files evaluated under every required OFF/ON condition |

`COMPLETED`, `SKIPPED`, and `EXCLUDED` are intentionally distinct. Missing ignored inputs are never reported as a completed PASS. The burned diagnostic-only Voicing Gold holdout is listed but excluded; the fresh Phase 4.7 Holdout is absent from the safe lock and was unopened.

## Stable / Accuracy First runtime contract

- Frozen runtime baseline SHA-256: 38256b5bfac5e244264f497ed7250842c7d33c39973f3e280a486dc6edf0aa46
- Frozen case36 median / p95 / max: 69.4042 / 74.1853 / 74.1853 ms
- Frozen Voicing40 total: 290.8063 ms
- Frozen ordered Voicing40 path/hash/byteLength digest: 4727a3fcfa693814c9191b958aa739e211823d30a7ddbcbefc127f4321e5e9fc
- Protocol: 2 attempts; retain-all-attempts-and-aggregate-all-samples-in-attempt-order; stable-requires-every-attempt; rerun replacement allowed: false

| Benchmark | Profile | Attempt | Raw samples (ms) | median / p95 / max | max / Stage00 | CPU user / system (us) | contention telemetry / reason |
|---|---|---:|---|---|---:|---|---|
| case36 | Stable | 1 | 73.6986, 72.0036, 85.4905, 78.7945, 79.5363, 77.8947, 82.2172 | 78.7945 / 85.4905 / 85.4905 | 1.152391x | 125000 / 0 | observed; case36 fixed bytes/config; external CPU contention was explicitly observed; unrelated processes were not terminated |
| case36 | Stable | 2 | 86.4795, 73.8165, 81.5652, 72.6471, 70.7006, 73.0075, 70.5899 | 73.0075 / 86.4795 / 86.4795 | 1.165723x | 16000 / 110000 | observed; case36 fixed bytes/config; external CPU contention was explicitly observed; unrelated processes were not terminated |
| case36 | Accuracy First | 1 | 75.3357, 72.6166, 79.9971, 78.4087, 79.9066, 77.0159, 92.2423 | 78.4087 / 92.2423 / 92.2423 | 1.243404x | 125000 / 0 | observed; case36 fixed bytes/config; external CPU contention was explicitly observed; unrelated processes were not terminated |
| case36 | Accuracy First | 2 | 84.6728, 73.3367, 85.5621, 85.8696, 74.4193, 74.9897, 70.8588 | 74.9897 / 85.8696 / 85.8696 | 1.157502x | 16000 / 110000 | observed; case36 fixed bytes/config; external CPU contention was explicitly observed; unrelated processes were not terminated |

| Benchmark | Stable OFF median / p95 / max (ms) | Accuracy First ON median / p95 / max (ms) | ON / Stage00 median / p95 / max | Timeouts | Correctness improvement |
|---|---:|---:|---:|---:|---|
| case36-three-minute | 73.8165 / 86.4795 / 86.4795 | 77.0159 / 92.2423 / 92.2423 | 1.109672 / 1.243404 / 1.243404x | 0 | case 03 exact evidence 66 -> 33; case 02/03 normalized deep equal |
| voicing-gold-development-40 | 206.8214 / 267.3927 / 267.3927 | 209.4271 / 215.6124 / 215.6124 | 0.72016 / 0.74143 / 0.74143x | 0 | case 03 exact evidence 66 -> 33; case 02/03 normalized deep equal |

- Stable case 36 median / p95 / max: 73.8165 / 86.4795 / 86.4795 ms; 10-second and 1.25x Stage00 gates: PASS
- Accuracy First case 36 median / p95 / max: 77.0159 / 92.2423 / 92.2423 ms; tier: UNDER_60_SECONDS; eligibility: ELIGIBLE
- Product-connection basis max: 215.6124 ms; inputs over 300 seconds: none; timeouts: 0
- Accuracy First runtime reason: The measured delta is reported alongside correctness; exact-evidence canonicalization is an additional deterministic offline analysis pass.
- UI contract: application contract preserved; no new Stage 01 UI; basis max 215.6124 ms; non-blocking NOT_REQUIRED_UNDER_ONE_SECOND; progress NOT_REQUIRED_UNDER_ONE_SECOND; cancellation NOT_REQUIRED_UNDER_ONE_SECOND

The 10-second and 1.25x gates apply only to Stable/default-OFF. Accuracy First adoption does not fail solely because runtime increased. Live MIDI and Chord Dojo remain construction invariants because exact-note dedup is confined to offline MIDI analysis.

- Memory process model: isolated-child
- Alternating child order: OFF->ON, ON->OFF, OFF->ON
- Peak-delta ratio median (diagnostic only for near-zero denominators): 0.656609x
- Accuracy First peak RSS: 817287168 bytes
- Resource policy: off peak delta below 4 MiB uses absolute retained-growth/slope plus 64 MiB transient allowance; significant deltas retain 1.25x ratio
- P5.15-00 absolute RSS: 642822144 bytes (reference only; not the denominator)
- Child contract valid: PASS; child output privacy-safe: PASS
- Temporary artifact deltas: child 0; parent residual 0

| Pair | Comparison | OFF / ON peak delta RSS | OFF retained RSS / heap / external | ON retained RSS / heap / external | OFF slope RSS / heap / external | ON slope RSS / heap / external | Gate |
|---:|---|---:|---:|---:|---:|---:|---|
| 1 | ABSOLUTE_RETAINED_SLOPE_NEAR_ZERO | 1974272 / 2969600 | 241664 / -103120 / 0 | 53248 / -145568 / 0 | 8104 / -1508 / 0 | 1301 / -476 / 0 | PASS |
| 2 | ABSOLUTE_RETAINED_SLOPE_NEAR_ZERO | 2850816 / 1871872 | 196608 / -145880 / 0 | 57344 / -99256 / 0 | 2656 / -491 / 0 | 1809 / -1442 / 0 | PASS |
| 3 | ABSOLUTE_RETAINED_SLOPE_NEAR_ZERO | 2273280 / 1228800 | 348160 / -101696 / 0 | 53248 / -100080 / 0 | 15256 / -90 / 0 | 1969 / -230 / 0 | PASS |

- Resource safety: PASS

## Protected contracts

- Raw MIDI bytes, Piano Roll source notes, save/export data: unchanged
- Vault schema and fileVersion: unchanged
- Diagnostics expose deterministic ordinal evidence IDs and counts only; source/voice identifiers and paths are not emitted
- Rollback: set `enableExactNoteEvidenceDedup` OFF (the default)

## Issues

- None
