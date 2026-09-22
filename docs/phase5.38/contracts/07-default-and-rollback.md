# Contract 07 — Default / Rollback

## Shadow stage

No production runtime change.

## Production stage

If Promotion passes, integrate the promoted grouping policy behind a reversible seam where practical.

Prefer:

```text
new grouping ON → promoted Family-A behavior
explicit OFF / legacy mode → previous grouping behavior
```

if the existing architecture supports a low-cost flag.

Do not introduce a permanent flag merely for ceremony if current repo conventions prefer direct replacement and rollback is already simple; document the decision.

## Default

P5.38-04 decides default behavior after hardening.

Accuracy / reduced human correction cost has priority over negligible formatting-time overhead, but correctness on genuine odd meters is a hard requirement.
