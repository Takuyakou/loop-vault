<!-- phase-id: 9.2 -->

# Phase 9.2 — Work instructions

## Goal

Determine whether source-only temporal evidence can propose and select separate harmonic, voicing, and note-event boundaries with useful recall and bounded over-segmentation across scenario-diverse public Gold.

## Scope

- Read retained P8.5 research from its branch and port only necessary research logic.
- Keep raw source meter, PPQ, onset, offset, sustain, and re-strike facts unchanged.
- Use a high-recall lattice as a proposal ceiling; compare bounded selectors and Product, with no minimum chord duration filter.
- Separate Harmonic Boundary, Voicing Boundary, and Ornament/Note Event Gold metrics.
- Use P7 authored temporal dev, expanded authored scenario-diverse dev, and Harmony primary public dev for method choice. This public Harmony corpus has no diagnostic-only dev files; its diagnostic-only files are in validation and are evaluated once after freeze.
- Measure hit/false proposals, passing-chord preservation, re-strike, card inflation, correction cost, ReviewReason proxies where supported, and runtime.
- Record unavailable metrics explicitly. Research failure is a NO-GO, not a reason to open private witness or holdout.

## Non-goals

No changes to Product src, current analyzer/extractor/Identity/Decoder, Vault schema, or default temporal behavior. No private LF-MIDI-001 threshold selection, no sealed holdout, no P9.3.

## Contracts

Use the [Phase 9 architecture freeze](../phase9.0/contracts/PHASE-9-CORE-V2-ARCHITECTURE-FREEZE-v5.md) and [frozen guardrails](../phase9.0/contracts/p9-thresholds-v1.json). An authored Gold event start is not automatically a harmonic boundary: derive harmonic changes from accepted Gold identity, voicing changes from Gold note-number sets, and note-event labels only from independently authored event labels. If public Harmony diagnostic roles or event semantics are insufficient, classify the metric as unavailable rather than invent labels.

## Stages

P9.2-00 encompasses baseline audit, public dev experiments, frozen candidate, one validation evaluation, aggregate report, and fresh research gates. Keep experimental failure visible.

## Definition of Done

Source-only temporal tests, provenance checks, public dev and frozen validation aggregates, scenario/category breakdown, source-byte/timing invariance, no Product src diff, phase-doc and AI-handoff validation, privacy/security, TypeScript/lint/build, and fresh FULL on the candidate HEAD. Record tested commits accurately; do not claim Product promotion from research-only evidence.

## Safety

Follow root AGENTS.md. No merge or push in this assignment.
