# Codex Handoff — P5.38

## Why Codex can continue from Git alone

The repository AI handoff should contain the complete causal history. This file adds only the P5.38 execution focus.

## Current product truth to verify in Git

Expected after P5.37:

```text
Family B cause: CONFIRMED
Family B production fix: implemented
union-chimera policy: v1
feature: enableUnionChimeraPartition
expected default: ON
false: exact-legacy rollback
Family A: CONFIRMED / DEFERRED
Family C: OPEN / separate
```

Do not trust these lines over Git; verify them.

## P5.38 target

Fix Family A only:

```text
1/4 source meter
→ 1-beat source bars
→ downstream bar/block/text fragmentation
```

Keep:

```text
source timeSignature = 1/4
```

Do not fake 4/4 metadata.

## Work style

- quality > speed;
- automated tests over manual inspection;
- private fixture remains ignored-local;
- no broad refactors;
- no candidate vocabulary/scorer changes;
- no Family B policy changes;
- no Family C work;
- explicit-path staging only;
- stop at every stage boundary.

## Important historical correction

P5.36 proved that the diagnostic 4/4 view changed downstream bars/blocks/text but **did not change fixed-2-beat harmonic ranking** except for a score-neutral scalar. Therefore a Family A fix should be located downstream of source parsing/harmonic identity whenever possible.
