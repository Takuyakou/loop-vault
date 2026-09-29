<!-- phase-id: 9.3 -->

# Phase 9.3 — Work instructions

## Goal

Determine whether source-only evidence and bounded extraction candidates can improve conditional SourceSnapshot fidelity without raising missing support, bass, or defining tones, and retain every excluded note for restoration.

## Scope

- Entry evidence: P9.0 and P9.1 show Harmony dev Product misses 164/752 independent Gold notes despite 752/752 raw presence; P9.1 simultaneous candidate exact ceiling is 64/160. Extraction/candidate selection is a material bottleneck under matched Gold windows.
- Compare at matched Gold boundaries and identities: P7 temporal dev, public Usage v2 dev, Harmony primary dev. Keep identity source explicit in provenance.
- Develop in research-only `scripts/p9/`, preserve raw note-number/ticks and excluded note IDs, and use source-only rules for candidate generation. Product anchor is an explicit ablation.
- Select/freeze from dev only. Run public validation once after freeze. Do not use local real MIDI or sealed holdout for tuning.
- Record exact, missing/extra, raw/candidate/selector recall, source invariance, support and bass, defining-tone availability, scenario breakdown, resource limits, and correction proxies. Unavailable review and factor-Gold metrics stay unavailable.

## Non-goals

No Product `src/**` edits, Vault schema change, production switch, P9.4, or full Core v2 promotion. If dev fails a hard guardrail, retain the failed ablation as research evidence and freeze only a safe comparison; do not tune on validation.

## Contracts

Use the [Phase 9 architecture freeze](../phase9.0/contracts/PHASE-9-CORE-V2-ARCHITECTURE-FREEZE-v5.md) and [frozen guardrails](../phase9.0/contracts/p9-thresholds-v1.json). Support and bass loss increase are hard failures. Defining-tone loss requires independent factor Gold; mark unavailable until P9.4, never infer it from exact chord labels. Extra notes have a separate frozen cap. Short passing chords remain eligible regardless of duration.

## Stages

P9.3-00 comprises entry proof, source evidence/candidate research, matched public dev, policy freeze, one validation pass, aggregate report, and fresh gates. An unsuccessful candidate can complete research with a NO-GO decision.

## Definition of Done

Focused tests, public dev/frozen validation evidence, provenance, source/restoration invariance, scenario and failure breakdown, honest unavailable metrics, no `src/**` diff, TypeScript/lint/build, docs/privacy gates, and fresh FULL at the report-inclusive HEAD. Record the tested commit separately from documentation-only closeout.

## Safety

Follow root AGENTS.md. No merge or push in this assignment.
