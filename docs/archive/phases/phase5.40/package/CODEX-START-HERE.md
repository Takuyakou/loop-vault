# Codex Start Here — P5.40-00 Only

Continue Loop Vault development with the supplied P5.40 package.

## Read order

1. Repository root `AGENTS.md` and canonical AI handoff documents.
2. P5.39 Closeout and P5.39-03d final evaluation.
3. This package:
   - `00-phase-contract.md`
   - `01-current-state-and-p539-handoff.md`
   - `02-protected-contracts.md`
   - `03-ground-truth-protocol.md`
   - `04-score-breakdown-spec.md`
   - `05-generalization-and-anti-overfit.md`
   - `07-test-strategy.md`
   - `08-privacy-contract.md`
   - `09-stop-boundaries.md`
   - `P5.40-00-audit-ground-truth-ranking-diagnosis.md`

## Execute only P5.40-00

The objective is diagnosis, not repair.

Acquire independent local ground truth for FC-SAFETY-03 local states, instrument the frozen current candidate scorer in evaluation-only code, score all current candidates, and identify numerically why the rejected local identity wins.

### Critical restrictions

Do NOT:

- change weights, thresholds or penalties;
- add/remove candidates;
- change tie-break;
- retune against private results;
- change Family B;
- change smoothing;
- change production `src/**`;
- change parser/schema/fileVersion;
- add special cases for FC-SAFETY-03;
- begin P5.40-01;
- merge/push/tag/release.

Prefer automated diagnostics and tests. Analysis time may increase if it improves correctness.

At the end, create the Stage00 report and STOP.
