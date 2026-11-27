# Contract 03 — Meter-Normalized Identity Experiment

## Objective

Measure whether chord identity/ranking changes when only the diagnostic meter/grid view changes.

### A
Original metadata/current behavior.

### B
Same source notes/options, diagnostic meter view normalized to 4/4.

No source mutation.

## Outputs

Per comparable region/window:

```text
surface label
canonical identity
top-N candidate identities
intended/equivalent rank where oracle exists
structural bass
root
slash bass
score components
attack-provenance summary
```

## Interpretation

- A wrong, B correct → meter/grid topology materially affects semantic identity.
- A wrong, B wrong same ranking → meter normalization insufficient.
- candidate set same but ranks differ → evidence/ranking changes through grid representation.
- candidate sets differ → generation/input-state difference must be separated.

Even if B corrects the private failure, P5.36 does not authorize production 4/4 rewrite.
