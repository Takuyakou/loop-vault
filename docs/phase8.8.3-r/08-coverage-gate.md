# R09 — coverage and safety gate

## Structural validation

`scripts/validate-matrix.cjs` passed its structural checks: four input-partition hashes and the site manifest hash matched; 29,848 planned rows equalled 29,848 emitted rows; row IDs were unique; every emitted row was site-accepted and classified; every row carried site, Product-commit, theory-policy and action provenance; the six direct risk witnesses had no F; and the branch contained only `docs/phase8.8.3-r/**`. Repeated generation yielded identical matrix bytes. The matrix has 114 measured, factorized family IDs and zero F rows.

The following fresh checks passed: frozen PRE fixture manifest (98 cases, unchanged digest), PRE research validation, phase-doc validation, AI-handoff validation, tracked security scan, and `git diff --check master...HEAD`. No `src/**` or production behavior changed. Private witness media remain ignored and untracked.

## Coverage decision

| Gate | Result | Reason |
|---|---|---|
| Frozen current-site asset, grammar and generated row plan | PASS | Deployed bundle/source map and site UI/runtime are pinned; site-only row count was fixed before Product bulk evaluation. |
| Planned rows emitted and classified | PASS | 29,848/29,848; A–E dispositions; F=0. |
| Product Parser, Preview, Vault, Voicing Loop measured | PASS | Isolated `basic-full` Product paths measured for every planned row. |
| Risk representatives and deployed source/UI parity | PASS | Six required synthetic labels directly confirmed; site context check matched deployed chord-local code. |
| Every lexical alias × quality × operator × root/bass interaction proven equivalent to factorized representatives | **NOT PROVEN** | The matrix is a finite quotient, not the literal cross-product. The deployed source supports transposition and fixed operator order, but Product alias/surface interactions are not exhaustively proven equivalent. |
| Real witness classified consistently with the matrix | **NOT PROVEN** | Captured-audio-derived output was rejected by automatic privacy review; no private chart or audio inference entered the tracked evidence. |
| `MATRIX COVERAGE PROVEN` | **FAIL / DO NOT IMPLEMENT** | Both preceding requirements are mandatory, regardless of 100% planned-row coverage. |

The matrix's `100%` family-row column means **row-plan execution only**. It cannot be quoted as complete current-site grammar coverage or Product compatibility. No Phase 8.8.3 implementation or promotion is authorized by this research result.
