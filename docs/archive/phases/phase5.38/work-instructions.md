# P5.38 Work Instructions

## Scope

Fix only Family A: source-meter-derived downstream progression bar, block, text,
and placeholder fragmentation. Stages 00 and 01 are audit/shadow-only; they do
not change production runtime behavior.

## Non-goals

Do not redesign Family B or Family C, rewrite source meter/notes/timing, change
the Vault schema or file version, or expand analyzer vocabulary, playback, or UI.

## 1. Quality priority

Correct downstream representation > speed.

Avoid a fast patch that merely hides dashes or renumbers bars while preserving the wrong underlying grouping.

## 2. Git discipline

Before every stage:
- branch / HEAD / status / ancestry;
- verify prior stage commit;
- confirm no unexpected user changes.

Never:
- reset;
- stash;
- discard user work;
- `git add -A`;
- `git add .`;
- auto-merge;
- push/tag/release without explicit authorization.

Explicit-path staging only.

## 3. Production sequencing

P5.38-00 and P5.38-01: production runtime behavior unchanged.

P5.38-02: Promotion decision only.

P5.38-03: production integration only after `PROMOTION = PASS`.

## 4. Family isolation

Protected Family B:

```text
enableUnionChimeraPartition
unionChimera.ts / equivalent current implementation
```

Its default, policy, trigger and scoring semantics must not change.

Family C representability is out of scope.

## 5. Source-truth invariant

Never mutate source meter to make formatting prettier.

Preserve:
- raw meter metadata;
- PPQ;
- tempo;
- notes;
- source beat positions.

## 6. Terminology discipline

If the fix introduces a non-source grouping unit, do not misleadingly call it a source bar internally.

Prefer concepts such as:
- `sourceBar`;
- `analysisGroup`;
- `presentationGroup`;
- `progressionGroup`;

according to current architecture.

## 7. Avoid fixed-4-beat dogma

The historical diagnostic 4/4 view proved causality, not necessarily the final product rule.

P5.38 must test the intended semantics for:
- 1/4 pathological export;
- normal 4/4;
- genuine 3/4;
- 2/4;
- supported compound/other meter cases where the parser has truthful behavior.

Do not normalize every meter to 4 beats.

## 8. Automation first

Automate:
- source-meter preservation;
- harmonic identity invariance;
- Family B invariance;
- bar/block/text counts;
- placeholder/dash behavior;
- 4/4 parity;
- odd-meter safety;
- determinism;
- privacy;
- official regression.

## 9. Private fixture

Tracked identifier only:

```text
LF-MIDI-001
```

Never commit actual filename/path/MIDI/raw notes/audio/checksum/`.local-evaluation`.

## 10. Stop boundaries

Do not start the next stage automatically unless the phase workflow explicitly authorizes run-remaining behavior.

## Definition of Done

P5.38 is complete only after the selected shadow policy passes frozen gates
A–K, is integrated behind the approved reversible seam, passes hardening and
acceptance, and is recorded in a closeout commit. Each stage stops at its own
boundary and records only gates that were actually run.
