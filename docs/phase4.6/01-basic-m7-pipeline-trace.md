# Phase 4.6-01 Basic m7 Pipeline Trace

Targets: Dm7 6 + Em7 2 = 8.

## Result

All 8 events are `slash-only-generated`. The Gold root is present in all 12-root hypotheses and the minor-seventh core is scored, but `scoreTemplates()` attaches the selected bass pitch class to every compatible candidate. The root-position canonical identity is therefore never enumerated.

- first invalidation stage: T2 Core Generation
- root hypothesis missing: 0
- core not generated: 0
- canonical parser/serializer loss: 0
- clamp/budget loss: 0
- slash-only generated: 8
- Product fix: not applied

## Generator bug decision

This is a general generation bug, not an altered-tension vocabulary gap: inversion evidence suppresses the root-position identity instead of coexisting with it. Per the preregistered branch rule, the first Shadow target must be a bounded root-position companion for slash-only cores. Altered b9 generation is deferred.

## Event summary

| File / Event | Gold | Variant | Root rank | Generated m7 | Selected bass | Evidence supports Gold | Classification |
|---|---|---|---:|---|---:|---|---|
| V02_clean/e07 | Dm7 | clean | 2 | Dm7/C | 0 | true | slash-only-generated |
| V02_stress/e07 | Dm7 | stress | 2 | Dm7/C | 0 | true | slash-only-generated |
| V08_clean/e05 | Em7 | clean | 2 | Em7/G | 7 | true | slash-only-generated |
| V08_clean/e07 | Dm7 | clean | 1 | Dm7/A | 9 | true | slash-only-generated |
| V08_stress/e05 | Em7 | stress | 2 | Em7/G | 7 | true | slash-only-generated |
| V08_stress/e07 | Dm7 | stress | 1 | Dm7/A | 9 | true | slash-only-generated |
| V09_clean/e07 | Dm7 | clean | 1 | Dm7/C | 0 | true | slash-only-generated |
| V09_stress/e07 | Dm7 | stress | 2 | Dm7/C | 0 | true | slash-only-generated |

The JSON artifact contains T0-T5 signals, note-instance IDs, pitch sets, histograms, raw scores and canonical identities for all eight events.
