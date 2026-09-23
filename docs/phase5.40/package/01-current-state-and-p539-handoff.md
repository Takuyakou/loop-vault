# Current State and P5.39 Handoff

## What P5.39 proved

### Confirmed correct Family C behavior

- FC-REAL-01: independently selected exact Family C identity is generated, ranked #1, and retained after Family B and smoothing.
- FC-SAFETY-01: confirmed-correct final changed-beat identity.
- FC-SAFETY-02: confirmed-correct final changed-beat identity.

### Protected temporal behavior

- FC-REAL-02: temporal separation is preserved; it is not a Family C positive and does not justify a single whole-window identity.

### Remaining blocker

FC-SAFETY-03 independent ground truth is `TEMPORAL-MIXTURE`.

Both offered two-beat interpretations were rejected. Model A adds the needed partition and smoothing retains two distinct states, but the resulting local identity sequence is still rejected. One changed-beat winner has:

- one missing expected tone; and
- one conflicting present tone.

The divergence begins in local candidate ranking / harmonic identity selection, is exposed by expanded ranking × Family B, and is preserved through smoothing.

## What must not be re-litigated without new evidence

P5.40 must not start by assuming that:

- temporal partitioning is absent;
- smoothing collapsed the needed boundary;
- all Family C behavior is wrong;
- all Family C behavior is correct;
- the correct answer is already known from the prior two rejected alternatives.

The exact replacement local identities are **not yet independently established**.

## Baseline evidence inherited from P5.39-03d

- focused: 32 files / 283 tests PASS
- full Vitest: 410 files / 3,364 tests PASS
- TypeScript PASS
- E2E TypeScript PASS
- production build PASS
- changed-scope ESLint / class lint / source-contract lint PASS
- new ESLint errors = 0
- deterministic repeats = 3/3
- candidate visits = exactly 276 per evaluated non-empty W2/B0/B1 window
- hard candidate bound = <= 300/window
- exact source fidelity
- P5.39 production `src/**` diff = 0

These are inherited historical facts. A later stage must not mislabel them as freshly rerun evidence unless it reruns them.
