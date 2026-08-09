# Playwright visual outputs

## Normal test runs

`npm run test:e2e` never writes tracked visual evidence. Playwright actual images,
diffs, traces, reports, and the Phase 5.13 evidence captured during a run are
written below `test-results/`, which is ignored by Git.

## Tracked visual files

- `e2e/visual.spec.ts-snapshots/` contains assertion baselines used by
  `expect(page).toHaveScreenshot`. These are reviewed source artifacts.
- `artifacts/phase5.13*/before/` and `artifacts/phase5.13*/after/` are frozen
  historical phase evidence. Tests may read them but never write them.

## Updating baselines

Only the explicit `npm run test:e2e:update-baselines` command may update
Playwright screenshot baselines. Review and stage any resulting baseline diff
intentionally. The legacy `npm run test:e2e:update` command delegates to that
explicit baseline-update command for compatibility.