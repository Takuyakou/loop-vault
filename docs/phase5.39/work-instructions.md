# P5.39 Work Instructions

## Scope

Execute only the active P5.39 stage. Family C concerns bounded,
root-relative chord-identity representability and its separately measured
notation, generation, and ranking consequences.

## Non-goals

- Do not reopen Family A presentation grouping or Family B union-chimera policy.
- Do not mutate source MIDI, source timing, source voicing, or saved schema.
- Do not add private-fixture or root-specific behavior.
- Do not enter production integration before an explicit Promotion PASS.

## 1. Accuracy and generality first

A slower, well-tested generalized solution is preferable to a fast private-specific patch.

## 2. Git discipline

Before every stage inspect branch/HEAD/status/ancestry.
Never reset/stash/discard user work.
No `git add -A` or `git add .`.
Explicit-path staging only.
No push/merge/tag/release unless explicitly authorized.

## 3. Evidence classes

Use:
- CONFIRMED
- SUPPORTED-HYPOTHESIS
- REJECTED-HYPOTHESIS
- UNRESOLVED
- HISTORICAL
- USER-REPORTED
- CONFLICT

## 4. Root-relative logic only

Production/shadow logic may depend on:
- normalized pitch classes;
- candidate root;
- root-relative intervals;
- structural bass/slash relation;
- bounded family grammar;
- existing ranking evidence.

It must not depend on:
- absolute note names unique to the private fixture;
- a specific root such as G or B;
- private filename/id;
- exact MIDI octave arrangement as the identity key.

## 5. Separate identity / notation / ranking

For every observed failure classify separately:

```text
representability: can the desired identity exist in the model?
notation: can it round-trip canonically?
generation: is the identity generated?
ranking: if generated, does it win?
```

Do not claim vocabulary success when the candidate still cannot be generated, or
ranking success when only notation changed.

## 6. Bounded grammar

Do not generate every powerset of alterations/omissions.
Candidate count must be bounded and measured.
Prefer factorized, observed-evidence-driven modifiers over combinatorial enumeration.

## 7. Canonical explicit notation

Avoid ambiguous canonical `alt` output. Explicitly encode observed alterations
and required omissions in deterministic order, following current repo notation
conventions where possible.

## 8. Simplicity / anti-overlabel guard

Increasing representability must not make ordinary chords explode into verbose
symbols. Hard negatives must protect simple major/minor/7/maj7/m7/sus/slash and
current supported extended chords.

## 9. Private fixture last

Policy/grammar/gates freeze on generated/public-safe corpus before LF-MIDI-001.
No private-driven retuning.

## 10. Family A/B freeze

P5.38 presentation grouping and P5.37 union-chimera behavior are protected.
Any diff requires STOP and investigation.

## 11. Automation first

Generate transposition and voicing metamorphic tests programmatically.
Manual 12-key inspection is not acceptable as the primary test method.

## 12. Stop boundaries

Promotion PASS is required before production integration.
No P5.40 auto-creation.

## Definition of Done

The active stage's report exists, every required gate is recorded as pass on the
current verified diff, privacy checks pass, the stage is committed independently,
and work stops at the stated stage boundary.
