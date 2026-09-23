<!-- phase-id: 5.39 -->

# Phase 5.39 — Family C: Vocabulary / Representability Generalization

## Status

- **Status:** in-progress (Stages 00-01 complete; production behavior unchanged)
- **Active stage:** P5.39-02 (generalized candidate Shadow; not started/authorized)
- **Completed stages:** P5.39-00 ([`reports/P5.39-00-audit-baseline-gate-freeze.md`](reports/P5.39-00-audit-baseline-gate-freeze.md)); P5.39-01 ([`reports/P5.39-01-root-relative-identity-grammar.md`](reports/P5.39-01-root-relative-identity-grammar.md))
- **Base:** local `master` at `0eedf26`, containing the P5.38 closeout and the default-on Family A/B fixes
- **Current branch:** `feat/p539-family-c-representability`
- **Stop boundary:** P5.39-01 complete; await explicit review before P5.39-02

## Required Reading Order

1. Root `AGENTS.md` and `CLAUDE.md`
2. [`docs/ai-handoff/README.md`](../ai-handoff/README.md), [`HANDOFF.md`](../ai-handoff/HANDOFF.md), [`DECISIONS.md`](../ai-handoff/DECISIONS.md), and [`KNOWN-FAILURES.md`](../ai-handoff/KNOWN-FAILURES.md)
3. [`00-START-HERE.md`](00-START-HERE.md)
4. [`CODEX-HANDOFF.md`](CODEX-HANDOFF.md)
5. [`work-instructions.md`](work-instructions.md)
6. [`execution-state.json`](execution-state.json)
7. [`contracts/01-scope-and-non-goals.md`](contracts/01-scope-and-non-goals.md) through [`contracts/08-promotion-and-success.md`](contracts/08-promotion-and-success.md)
8. Active stage file, then its report

## Stages

1. `P5.39-00` — audit / baseline / gate freeze
2. `P5.39-01` — root-relative identity grammar + representability oracle (shadow)
3. `P5.39-02` — generalized candidate/notation shadow + metamorphic corpus
4. `P5.39-03` — promotion evaluation
5. `P5.39-04` — production integration only after Promotion PASS
6. `P5.39-05` — hardening / acceptance
7. `P5.39-06` — closeout

## Goal

Increase chord identity representability without turning the analyzer into a
private-fixture recognizer or an over-verbose chord-label generator.

## Core principle

Represent chord identity from **root-relative pitch-class structure**, not
absolute MIDI pitches.

Conceptually:

```text
observed harmonic pitch classes
+ structural bass
→ candidate roots
→ root-relative intervals
→ base quality / extension family
→ explicit alterations
→ explicit omissions when musically/semantically required
→ optional slash bass
→ deterministic canonical symbol
```

The exact production model must be chosen from current Git truth during P5.39-00.
This seed does not authorize a new architecture blindly.

## Generalization requirements

Any added family must pass:
- all 12 roots;
- multiple octaves/registers;
- doublings;
- reordered/closed/open voicings;
- inversion/slash variants;
- parser/formatter round-trip where text notation is supported;
- hard negatives preventing simple chords from becoming unnecessarily rich labels.

## Non-goals

P5.39 does not:
- redesign source voicing persistence;
- change Family A presentation grouping;
- change Family B union-chimera policy;
- build a generic arbitrary-pitch-set-to-symbol language with unbounded modifiers;
- make every possible pitch-class set representable;
- replace harmonic ranking with ML/LLM inference;
- add private-fixture special cases.

## Expected stage flow

1. audit current quality vocabulary and representability limits;
2. build a bounded shadow identity grammar/oracle;
3. prove transposition/voicing invariance and hard-negative safety;
4. evaluate candidate generation/ranking with the new representable identities;
5. promote only after frozen gates pass;
6. integrate minimally;
7. harden and close.
