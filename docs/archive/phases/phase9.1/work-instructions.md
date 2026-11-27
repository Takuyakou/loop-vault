<!-- phase-id: 9.1 -->

# Phase 9.1 — Work instructions

## Goal

Test whether a SourceSnapshot note set can be selected from raw source timing and source-derived voice roles independently of chord identity, and decide whether it clears the frozen P9.0 promotion guardrails.

## Scope

- Build a research-only source selector whose API has no chord identity, Analyzer candidate, score, or rank.
- Compare bounded source-only policies on dev, using identical Gold boundary and identity inputs for Product and research arms.
- Preserve short passing chords, pre-existing sustain, raw MIDI note numbers, and source timing.
- Measure public Tier 1 exact, Gold note recall, missing and extra notes, bass and register proxies, runtime, and correction cost.
- Exercise Vault v2 persistence and Card, Capture, Whole playback through Product functions.
- Freeze one dev-selected policy before one validation evaluation. Reject promotion when frozen guardrails fail.

## Non-goals

No Product src change, Vault migration, P9.1-P integration, P9.2 work, private LF-MIDI-001 tuning, sealed holdout access, or full Tier 2 accepted-equivalence claim.

## Contracts

Use the [Phase 9 architecture freeze](../phase9.0/contracts/PHASE-9-CORE-V2-ARCHITECTURE-FREEZE-v5.md) and [frozen numeric guardrails](../phase9.0/contracts/p9-thresholds-v1.json). Source selection may use raw note times and source-derived roles, never chord identity. An adapter may stamp the selected notes with the matched chord key solely to exercise existing Vault v2 and playback contracts. Comparisons require machine-readable matched provenance. Unavailable defining-tone or ReviewReason metrics must be reported as unavailable, not as passing.

## Stages

P9.1-00: audit Product dependence, build four bounded source-only methods, run public dev, freeze one method, run validation once, document results and fresh gates. This stage remains independent of optional P9.1-P shared Product promotion.

## Definition of Done

Research tests, matched dev and frozen validation, Vault/playback roundtrip, typecheck, phase-doc and AI-handoff validation, privacy/security, no Product src diff, and fresh FULL gate on the research candidate HEAD. Record tested commit and gate results. Promotion may be NO-GO while research is complete.

## Safety

Follow root AGENTS.md. Keep private MIDI, local evaluation, paths, media, and individual failures out of tracked reports. No merge or push in this assignment.
