# Loop Vault — Test Strategy

When to read:
Read before adding or changing tests, or before running a gate.

Do not preload:
Not needed for documentation-only edits.

Only layers that actually exist are listed below.

## Layers

| Layer | Where | Notes |
|---|---|---|
| Unit / domain | `src/**/*.test.ts`, `src/**/*.test.tsx` | Vitest. Pure domain logic is the primary target. |
| Semantic fixtures | `src/domain/voicingRules/goldenCorpus.ts`, `src/domain/textProgression.ts`, `src/domain/sourceBassline/` | Deterministic, privacy-safe. |
| Analyzer corpus / scripts | `scripts/*.ts` (evaluate-*, classify-*, audit-*) | Run via `npm run eval:*`. Most require local MIDI corpora. |
| E2E | `e2e/*.spec.ts` | Playwright, against the built app (`npm run test:e2e`). |
| Visual / accessibility | `e2e/visual.spec.ts`, `e2e/accessibility.spec.ts`, `e2e/responsive.spec.ts`, `e2e/keyboard.spec.ts`, `e2e/reduced-motion.spec.ts` | Snapshot + a11y + viewport checks. |
| E2E fixtures | `src/testing/` | Shared Playwright fixtures. |
| Rust | `src-tauri/src/**/*.rs` (`#[cfg(test)]`) | Run via `cargo test` under `src-tauri/`. |
| Phase-docs validator | `scripts/phase-docs/` + `scripts/phase-docs/validate.test.mjs` | `npm run validate:phase-docs`. |
| Handoff validator | `scripts/ai-handoff/` + `scripts/ai-handoff/validate.test.mjs` | `npm run validate:ai-handoff`. |
| Source contracts | `scripts/lint-source-contracts.mjs` | `npm run lint:source-contracts`. |
| Staged-file privacy guard | `scripts/check-staged-files.mjs` | Pre-commit hook. |
| Diff check | `git diff --check` | Whitespace hygiene before commit. |

## Private MIDI policy

- Real / external / personal MIDI and audio are **never** committed.
- Local, ignored fixtures live under `.local-evaluation/` and `test/private-midi/`.
- Committable fixtures are synthetic and live under `test/fixtures/` (only MIDI allowlist).
- CI and cold-start rely only on privacy-safe synthetic/deterministic fixtures.

## Running

The current FAST / FEATURE / UI / FULL entry points and product-contract ownership are in [`docs/test-rationalization/README.md`](../test-rationalization/README.md). FAST and FEATURE are feedback loops; the FULL gate is required before a merge.

```text
npm test                       # Vitest (incl. validator tests)
npm run validate:phase-docs    # phase-doc consistency + privacy
npm run validate:ai-handoff    # handoff structure + verified-SHA + privacy
npm run test:e2e               # Playwright (builds first)
```
