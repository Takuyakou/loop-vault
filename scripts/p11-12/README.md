# P11-12 diagnostic runner

Audit-only; production ranking, weights, candidates, UI, schema and existing test expectations are unchanged. Public deterministic synthetic data only. No external fingering datasets, private Vault/MIDI, new ergonomic thresholds or target fingering Gold.

Run from the repository root:

```text
node node_modules/vite-node/vite-node.mjs scripts/p11-12/run.ts
node node_modules/vitest/vitest.mjs run scripts/p11-12/diagnostic.test.ts scripts/p11-12/uiAudit.test.tsx
node node_modules/typescript/bin/tsc --project scripts/p11-12/tsconfig.json --pretty false
node node_modules/eslint/bin/eslint.js scripts/p11-12
```

Results are ignored, local-only JSON in `.local-evaluation/fingering-ranker-audit/`. `run.ts` generates the five baseline/candidate/transition/case/integration JSON files. The UI diagnostic writes `ui-observations.json`. All paths recorded inside the baseline manifest are repository-relative. Set TEMP/TMP to a normal D-drive test temporary directory when running tests.

`privateAccess.ts` AST-extracts exact current private function declarations for cost accounting and UI adapter observation. It does not write production files, replace a product function, copy/reimplement the cost formula, or add test exports to the product. Source hashes are recorded. Public ranker output is checked against exhaustive two-event cost minimization; the separate open-chain DP is a hypothetical diagnostic comparison, never a product arm or Gold.

The corpus is a deterministic Cartesian construction: two hands × five note counts × six shapes × twelve chromatic offsets × three IOIs = 2160 four-event progressions (720 base comparison cases; 696 distinct hand+pitch sequences). Semitone offsets deliberately span key colors. Named cases cover varying cardinality, metadata-based inversions, shared notes, whole-hand translation and common upper-note single/chord connections. Timing samples are observation inputs, not fast/slow safety thresholds. Rates explicitly state their denominators and do not rate fingering quality.

The View diagnostic uses the actual resolver, ranker, preferences, React component, card/keyboard and movement labels; only audio transport side effects are replaced. It is not a Windows WebView, geometry, physical comfort or audible-output test. No new product property contract is installed by these diagnostic tests.
