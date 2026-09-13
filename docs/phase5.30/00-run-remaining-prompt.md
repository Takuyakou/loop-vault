# P5.30 Run Remaining Prompt

Run the remaining P5.30 stages in order, starting from the first stage whose state is not complete.

For each stage:

1. Read the stage contracts and previous report.
2. Re-check clean worktree and protected surfaces.
3. Implement only that stage's scope.
4. Run the stage's automated gates.
5. Update report + `P5.30-execution-state.md`.
6. Stage explicit paths only; no `git add -A` / `git add .`.
7. Commit the stage.
8. Confirm clean status before advancing.

Stop immediately on a blocker, failing gate, unexpected schema change, unexplained timing divergence, private-data risk, or unrelated user modification. Do not reset/stash/discard to get clean.

After P5.30-04, report the product-acceptance candidate and STOP. Do not merge, push, tag, release, or start P5.31.
