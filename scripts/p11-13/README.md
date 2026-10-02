# P11-13 comparison diagnostics

Run `node node_modules/vite-node/vite-node.mjs scripts/p11-13/comparison.ts` from the repository. Public synthetic fixtures only. Outputs are ignored under `.local-evaluation/p11-13/`. The contract was committed before arm execution. Evaluation is reserved until policy freeze and is not used for tuning. CURRENT includes the 13a anchor/segment foundation; candidate generation is unchanged. Internal movement metrics are not ergonomic Gold. Per-case common-pitch regressions are recorded alongside aggregate counts. No E2/E3 or default switch.

Typecheck: `node node_modules/typescript/bin/tsc -p scripts/p11-13/tsconfig.json`.
Final report: `docs/phase11.0/reports/P11-13b-hand-position-time-comparison.md`.

Lambda follow-up: `node node_modules/vite-node/vite-node.mjs scripts/p11-13/lambdaComparison.ts`. Dev only; verifies original dev aggregates and preserves both original JSON artifacts. Results: `docs/phase11.0/reports/P11-13-lambda-comparison.md`. The original comparator still runs through `comparison.ts`. Shared measurement function bodies are unchanged.

Common Tone follow-up: `node node_modules/vite-node/vite-node.mjs scripts/p11-13/commonToneComparison.ts`. Dev only, lambda2/inverse fixed, four precommitted gamma weights. Uses the existing injected costModel seam; no src changes or UI registration. Shared metrics accept a diagnostic custom model and verify original CURRENT/lambda2 dev aggregates. Contract: `COMMON-TONE-EXPERIMENT-CONTRACT.md`. Results: `docs/phase11.0/reports/P11-13c-common-tone-ablation.md`. Local-only outputs: `.local-evaluation/p11-13/common-tone/comparison.json` and `original-24-cases.json`. No adoption or further components.

Reserved final confirmation is **already consumed**. `reservedEvaluation.ts` is a one-shot entry point with an exclusive started marker; do not remove markers or rerun it. Exactly CURRENT/lambda2/lambda2+gamma1, fixed by `RESERVED-EVALUATION-CONTRACT.md`. Local-only result: `.local-evaluation/p11-13/reserved-final/comparison.json`, full rows in `cases.json`. Read saved results only. Report: `docs/phase11.0/reports/P11-13d-reserved-final-evaluation.md`. Earlier P11-13b reserved exposure is disclosed; no tuning/promotion.
