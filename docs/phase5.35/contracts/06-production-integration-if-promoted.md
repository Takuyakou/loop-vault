# Contract 06 — Production Integration Only If Promoted

Applies only if P5.35-03 says `PROMOTION = PASS` and P5.35-04 receives explicit authorization.

Constraints:

- minimal seam;
- no candidate vocabulary change;
- no boundary-engine change;
- no meter behavior change;
- no persistence migration;
- no source-note mutation;
- no playback/UI change;
- no default analyzer change.

Initial connection must preserve:

```text
OFF == exact legacy behavior
```

Production adjustment must be the promoted shadow model, not a new simpler complexity penalty.

Prefer one small revertable integration commit.
