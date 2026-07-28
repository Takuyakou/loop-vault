# Phase 4.6-03 Target Family Decision Lock

Status: **LOCKED**. The Shadow generator may now be implemented only within this contract.

## Selected family

`plain-minor-seventh-root-position-companion-v1`

Given an already generated `min7` candidate with a non-root slash bass, generate the same root and `min7` quality once without the slash bass. This is an evaluation-only Shadow candidate.

P4.6-01 found the same first invalidation stage in all eight basic m7 misses: the root hypothesis and min7 core exist, but automatic bass attachment suppresses the root-position canonical identity. P4.6-02 then separated all 68 misses into 28 slash-bass generation misses and 40 altered-dominant vocabulary misses. The preregistered rule gives the general basic-m7 generator bug priority.

## Grammar

```text
source:
  ChordSymbol(root, quality=min7, tensions=[], bass!=root)

required:
  source exists in raw phase4-v1 candidates
  root + minor third + fifth + minor seventh have note-instance support
  root-position canonical identity does not already exist

output:
  ChordSymbol(same root, quality=min7, tensions=[], bass omitted)
```

The grammar never reads the Gold label, never changes root or quality, never adds an extension, and never recursively consumes a Shadow candidate.

## Compatibility matrix

| Source | Core evidence | Existing root-position identity | Result |
|---|---|---|---|
| slash `min7` | complete | absent | generate one companion |
| root-position `min7` | complete | present | reject as duplicate |
| slash `min7` | incomplete | any | reject: provenance insufficient |
| any non-`min7` quality | any | any | reject: outside family |

## Candidate budget

- per source: 1
- per root: 1
- per event: 4
- hard plan ceiling: 12 per event
- average gate: at most 4 per event
- source order: raw score descending, then canonical identity ascending
- deduplication: canonical identity

The first experiment intentionally excludes min9, maj9, dom13, suspended dominant and altered dominant. A broadly applied “remove every slash bass” rule would span multiple families and make the first causal result ambiguous.

## Provenance

Every generated candidate must retain:

- source candidate canonical identity and raw score
- source note-instance IDs supporting the four min7 core pitch classes
- supporting pitch classes
- grammar ID

Missing note-instance provenance means no generation. Aggregate pitch-set evidence alone is not enough.

## Runtime and determinism

Generation is one bounded pass over a pre-sorted raw pool. Same-process runtime overhead must remain within 20% of baseline. Sorting, budget application and provenance ordering must be deterministic.

## Counterfactual risk

The root-position companion keeps the source raw score. No bonus is invented, so it can tie with the slash source. P4.6-06 must distinguish tie-break-only and slash-only changes from root, quality or correctness changes. Any Product regression blocks connection.

## Rollback

The implementation is evaluation-only. Rollback removes the Shadow generator and reports; Product code, Vault data, schema and migrations remain untouched.

## Invariants

- `defaultAnalyzerMode = phase4-v1`
- `fileVersion = 1`
- Product rank 1 / Top-3 / candidate score / Analyzer / Timeline unchanged
- Validation and Holdout remain unrun
