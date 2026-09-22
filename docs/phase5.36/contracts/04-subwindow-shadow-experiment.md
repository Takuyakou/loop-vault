# Contract 04 — Sub-window / Attack-State Shadow Experiment

## Goal

Determine whether wrong-root candidates are supported by attacks from multiple beat/sub-state regions inside one legacy 2-beat window.

## Compare

```text
W2 = legacy 2-beat aggregate
B1 = two 1-beat evidence buckets
AC = deterministic attack-cluster buckets
```

Use current scorer read-only.

## Required comparison

For target failures report:
- correct candidate support by bucket;
- wrong-root support by bucket;
- defining-tone support by bucket;
- broad-template extra support by bucket;
- structural-bass location;
- root/slash score components;
- candidate rank per bucket and aggregate.

## Supporting causal pattern

```text
W2: wrong-root broad candidate wins
sub-window containing target harmony: correct candidate wins/rank improves
other bucket: supplies extra attacks supporting wrong-root candidate
```

## Rejection pattern

If wrong-root wins in every relevant sub-window with same evidence, wide-window mixing is weakened/rejected.

No score changes.
