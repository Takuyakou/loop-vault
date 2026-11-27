# Archived scripts (P25 / v3.2.0)

The daily commands live in the root `package.json`. The scripts here are the
evaluation, audit and tuning tools that no command, check or test uses any
more. They are kept for reference; nothing in the build, the gates or the app
runs them. Run one directly with `npx tsx` (add the arguments the table shows).

| Old command | How to run it now |
|---|---|
| `npm run diagnose:llm-schema` | `npx tsx scripts/archive/diagnose-llm-schema-compatibility.ts` |
| `npm run eval:advisor` | `npx tsx scripts/archive/evaluate-progression-advisor.ts` |
| `npm run eval:build-review-queue` | `npx tsx scripts/archive/build-midi-review-queue.ts` |
| `npm run eval:degrade` | `npx tsx scripts/archive/generate-degraded-midi.ts --run-cli` |
| `npm run eval:midi` | `npx tsx scripts/archive/evaluate-midi-analysis.ts` |
| `npm run eval:midi:compare` | `npx tsx scripts/archive/evaluate-midi-analysis.ts --compare` |
| `npm run eval:midi:correction-cost` | `npx tsx scripts/evaluate-voice-aware-reranker.ts --run-cli --report docs/archive/artifacts/phase3.6.5-correction-cost` |
| `npm run eval:midi:correction-cost:report` | `npx tsx scripts/evaluate-voice-aware-reranker.ts --run-cli --report docs/archive/artifacts/phase3.6.5-correction-cost --report-only` |
| `npm run eval:midi:datasets` | `npx tsx scripts/archive/evaluate-midi-datasets.ts` |
| `npm run eval:midi:diversity` | `npx tsx scripts/evaluate-voice-aware-reranker.ts --run-cli --report docs/archive/artifacts/phase3.6.5-candidate-diversity` |
| `npm run eval:midi:diversity:report` | `npx tsx scripts/evaluate-voice-aware-reranker.ts --run-cli --report docs/archive/artifacts/phase3.6.5-candidate-diversity --report-only` |
| `npm run eval:midi:inspect` | `npx tsx scripts/archive/inspect-midi-analysis.ts` |
| `npm run eval:midi:label-reachability` | `npx tsx scripts/archive/evaluate-label-reachability.ts` |
| `npm run eval:midi:rerank` | `npx tsx scripts/archive/evaluate-midi-analysis.ts --rerank` |
| `npm run eval:midi:voice-aware` | `npx tsx scripts/evaluate-voice-aware-reranker.ts --run-cli` |
| `npm run eval:p43:ablation` | `npx tsx scripts/archive/evaluate-phase43-voicing.ts --conditions all` |
| `npm run eval:p43:corpus` | `npx tsx scripts/archive/verify-phase43-voicing-corpus.ts` |
| `npm run eval:p43:failures` | `npx tsx scripts/archive/classify-phase43-voicing-failures.ts` |
| `npm run eval:p43:labels` | `npx tsx scripts/archive/audit-phase43-labels.ts` |
| `npm run eval:p43:real-review` | `npx tsx scripts/archive/build-phase43-real-midi-review-pack.ts` |
| `npm run eval:p43:voicing` | `npx tsx scripts/archive/evaluate-phase43-voicing.ts` |
| `npm run eval:p442:baseline` | `npx tsx scripts/archive/evaluate-phase442-baseline.ts` |
| `npm run eval:p442:duration` | `npx tsx scripts/archive/evaluate-phase442-count-duration.ts` |
| `npm run eval:p442:failures` | `npx tsx scripts/archive/evaluate-phase442-failure-matrix.ts` |
| `npm run eval:p442:holdout` | `npx tsx scripts/archive/evaluate-phase442-holdout.ts` |
| `npm run eval:p442:relative` | `npx tsx scripts/archive/evaluate-phase442-relative-support.ts` |
| `npm run eval:p442:select` | `npx tsx scripts/archive/select-phase442-intervention.ts` |
| `npm run eval:p442:validation` | `npx tsx scripts/archive/evaluate-phase442-validation.ts` |
| `npm run eval:p443:a1-prime` | `npx tsx scripts/archive/evaluate-phase443-a1-prime.ts` |
| `npm run eval:p443:classify` | `npx tsx scripts/archive/classify-phase443-holdout.ts` |
| `npm run eval:p443:cv` | `npx tsx scripts/archive/evaluate-phase443-loso-cv.ts` |
| `npm run eval:p44:baseline` | `npx tsx scripts/archive/evaluate-phase44-baseline.ts` |
| `npm run eval:p44:dev` | `npx tsx scripts/archive/tune-phase44-dev.ts` |
| `npm run eval:p44:mechanisms` | `npx tsx scripts/archive/classify-phase44-mechanisms.ts` |
| `npm run eval:p44:oracle` | `npx tsx scripts/archive/evaluate-phase44-oracle-a-plus.ts` |
| `npm run eval:p44:shadow` | `npx tsx scripts/archive/evaluate-phase44-shadow.ts` |
| `npm run eval:p44:validation` | `npx tsx scripts/archive/evaluate-phase44-validation.ts` |
| `npm run eval:p45:d1` | `npx tsx scripts/archive/evaluate-phase45-rank-distribution.ts` |
| `npm run eval:p45:d2` | `npx tsx scripts/archive/evaluate-phase45-candidate-funnel.ts` |
| `npm run eval:p45:d3` | `npx tsx scripts/archive/evaluate-phase45-miss-taxonomy.ts` |
| `npm run eval:p45:d4` | `npx tsx scripts/archive/evaluate-phase45-same-root-oracle.ts` |
| `npm run eval:p45:d5` | `npx tsx scripts/archive/evaluate-phase45-root-confidence.ts` |
| `npm run eval:p45:decision` | `npx tsx scripts/archive/evaluate-phase45-decision-lock.ts` |
| `npm run eval:p46:baseline` | `npx tsx scripts/archive/evaluate-phase46-baseline.ts` |
| `npm run eval:p46:counterfactual` | `npx tsx scripts/archive/evaluate-phase46-counterfactual-risk.ts` |
| `npm run eval:p46:m7-trace` | `npx tsx scripts/archive/evaluate-phase46-basic-m7-trace.ts` |
| `npm run eval:p46:shadow-coverage` | `npx tsx scripts/archive/evaluate-phase46-shadow-coverage.ts` |
| `npm run eval:p46:shadow-generator` | `npx tsx scripts/archive/evaluate-phase46-shadow-generator.ts` |
| `npm run eval:p46:taxonomy` | `npx tsx scripts/archive/evaluate-phase46-missing-taxonomy.ts` |
| `npm run eval:p47:corpus` | `npx tsx scripts/archive/evaluate-phase47-corpus-integrity.ts` |
| `npm run eval:p47:dev` | `npx tsx scripts/archive/evaluate-phase47-gold-split.ts --split dev` |
| `npm run eval:p47:holdout` | `npx tsx scripts/archive/evaluate-phase47-gold-split.ts --split holdout` |
| `npm run eval:p47:invariants` | `npx tsx scripts/archive/evaluate-phase47-invariants.ts` |
| `npm run eval:p47:scope` | `npx tsx scripts/archive/evaluate-phase47-real-scope.ts` |
| `npm run eval:p47:shadow` | `npx tsx scripts/archive/evaluate-phase47-part-a-shadow.ts` |
| `npm run eval:p47:validation` | `npx tsx scripts/archive/evaluate-phase47-gold-split.ts --split validation` |
| `npm run eval:p48:baseline` | `npx tsx scripts/archive/evaluate-phase48-baseline.ts` |
| `npm run eval:p48:dev-selection` | `npx tsx scripts/archive/evaluate-phase48-dev-selection.ts` |
| `npm run eval:p48:shadow` | `npx tsx scripts/archive/evaluate-phase48-shadow-generators.ts` |
| `npm run eval:p48:trace` | `npx tsx scripts/archive/evaluate-phase48-a7b9-trace.ts` |
| `npm run eval:p514:roundtrip` | `npx tsx scripts/archive/evaluate-phase514-round-trip.ts` |
| `npm run eval:p51:input-selection` | `npx tsx scripts/archive/evaluate-phase51-input-selection.ts` |
| `npm run eval:p5:accuracy` | `npx tsx scripts/archive/evaluate-phase5-accuracy-first.ts` |
| `npm run eval:p5:hybrid` | `npx tsx scripts/archive/evaluate-phase5-hybrid-reassessment.ts` |
| `npm run eval:promote-corrections` | `npx tsx scripts/archive/promote-midi-corrections.ts` |
| `npm run eval:real-midi` | `npx tsx scripts/archive/evaluate-real-midi.ts` |
| `npm run eval:review-differences` | `npx tsx scripts/archive/review-midi-differences.ts` |
| `npm run eval:stored-progressions` | `npx tsx scripts/archive/evaluate-stored-progressions.ts` |

The files moved into this folder keep their relative imports to `src/` and to the
scripts that stayed, so they still typecheck and run from here.
