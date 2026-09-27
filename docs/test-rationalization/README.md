# Test execution and ownership

Historical rationalization record. The current command behavior is documented in [Test DX](../test-dx/README.md).

Use product-contract names to select tests; phase numbers on files remain provenance. See the [contract matrix](01-contract-matrix.md) and [per-file tier inventory](00-baseline-inventory.json). Keep existing phase fixture provenance. Test architecture changes must preserve assertions before moving them between layers.

| Entry | Command | Intended use |
| --- | --- | --- |
| FAST | `npm run test:fast` | App TypeScript, repository lint (including class/source contracts), domain Vitest; ordinary implementation loop |
| FEATURE | `npm run test:feature -- src/path/to/changedFile.ts` | Vitest's dependency-based `related` selection; pass one or more changed source paths, then run direct E2E when UI behavior is affected |
| UI | `npm run test:ui` | Critical Capture/Vault/keyboard/accessibility/Text Capture/visual browser paths, built with the existing deterministic Playwright runner |
| FULL | `npm run test:full` | Pre-merge static gates, E2E TypeScript, phase/handoff/privacy validators, production web build, all Vitest, and **repository-wide** Playwright |

FAST and FEATURE are feedback loops; neither substitutes for FULL. UI is a representative product-path set; FULL always runs every Playwright spec. The existing `npm test`, `npm run test:e2e`, and focused phase scripts remain available. No retry, skipped case, or hidden baseline acceptance is part of these entries.

Current ownership: text semantics/domain T1; Text Capture status and transport T2; save/playback browser seam T3; desktop overflow, internal scroll, accessibility, font and visual appearance T4. Voicing Loop, Vault, Practice and security have their own matrix rows. The P8.8.3 frozen semantic corpus is permanent and is included in FULL Vitest.
