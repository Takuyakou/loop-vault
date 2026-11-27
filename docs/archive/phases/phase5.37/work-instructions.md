# P5.37 Work Instructions

## Scope

Convert the P5.36 confirmed Family B cause (fixed-2-beat evidence mixing →
wrong-root/broad-slash identity) into a bounded, reversible production fix by
generalizing the existing P5.24/P5.26 local-harmonic-state path off its 4/4-only
gate — shadow first, then promotion, then production integration only on
`PROMOTION = PASS`. Reuse the existing scorer / vocabulary / bass extraction
unchanged where possible. Detailed rules below.

## Non-goals

Vocabulary/representability redesign (S02/S04), 1/4→4/4 source rewrite, global
1-beat windows, broad-chord penalty, fewer-notes scoring, force bass=root, label
rewrite, P5.35 carryover promotion, private-fixture-specific exceptions,
sourcePerformance/Vault/Simple-Text/UI redesign. No merge/push/tag/release. No
P5.38.

## Definition of Done

Either `PASS — PRODUCTION SEMANTIC FIX INTEGRATED AND HARDENED` (Promotion PASS +
minimal reversible production integration + OFF=exact-legacy retained + private
targets improved + whole-file regression acceptable + all hard-negative / corpus /
analyzer / determinism / boundedness / privacy gates pass) or, if promotion fails,
`PASS — SHADOW IMPLEMENTED; PROMOTION FAILED; PRODUCTION UNCHANGED` (P5.37-03
skipped), or `BLOCKED — <reason>`. Source meter facts and source notes remain
intact throughout.

## 1. Accuracy > speed

This is the production-fix phase. Do not trade causal correctness for quick integration. Small/moderate analysis-time increases are acceptable if they materially improve harmonic-state reconstruction and remain bounded.

## 2. Git safety

Before each stage inspect branch/HEAD/status/ancestry/prior commit.
Never reset/stash/discard user work; never use `git add -A` or `git add .`; never auto-merge/push/tag/release. Explicit-path staging only.

## 3. Evidence classes
Use `CONFIRMED`, `SUPPORTED-HYPOTHESIS`, `REJECTED-HYPOTHESIS`, `UNRESOLVED`, `HISTORICAL`, `USER-REPORTED`, `CONFLICT`.

## 4. Private fixture discipline
Tracked name only: `LF-MIDI-001`.
Never commit actual filename/path/raw MIDI/full note sequence/audio/checksum/fingerprint/`.local-evaluation`.

## 5. Semantic target discipline
Fix the confirmed Family B mechanism. Do not silently expand into vocabulary redesign, source-truth persistence redesign, Simple Text redesign, Source Performance persistence, UI redesign, or Vault schema migration.

## 6. Source meter fact
A 1/4 time signature is a source fact. Do not rewrite the source to 4/4 as a semantic shortcut.

## 7. Shadow first
P5.37-01 is non-production and must demonstrate non-4/4 local-state operation, OFF legacy parity, private target improvement, hard-negative safety, deterministic/bounded behavior.

## 8. Promotion is a hard gate
P5.37-02 must output exactly `PROMOTION = PASS` or `PROMOTION = FAIL`.
If FAIL, do not start P5.37-03.

## 9. Production integration minimality
If Promotion passes, make the smallest change required to generalize the unsupported-meter restriction, route eligible analysis through the proven local-state path, and preserve OFF exact legacy.

## 10. Family A independence
If P5.37-04 is authorized, treat downstream fragmentation as a separate workstream with separate gates and no source-meter rewrite. Otherwise mark it SKIPPED/DEFERRED.

## 11. Test scope
Use the current official clean repository test scope and record exact commands/scope.

## 12. No future phase creation
Do not create P5.38 automatically.
