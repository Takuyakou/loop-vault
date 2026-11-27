<!-- phase-id: 9.4 -->

# Phase 9.4 — Work instructions

## Goal

Replace the P8.6 root/quality/bass exact diagnostic with a research scorer that reports canonical identity, accepted alternatives, factor/role distinctions, candidate recall and local ranking separately. Candidate playback equivalence requires actual candidate-rendered MIDI notes. Never substitute Gold source notes for rendered notes.

## Scope

Research-only scorer, public authored harmonic Gold, P8.6 candidate re-score, and aggregate reporting.

## Contract

- Primary identity and independently authored acceptable alternatives are semantic Gold. Candidate output cannot create new accepted identities.
- Root, quality, bass, factors and canonical display label have separate diagnostics.
- Pitch-class plus bass, defining-tone loss and optional-tone omission require rendered candidate playback; unavailable results have null values and zero measured coverage, not a failure count.
- UNKNOWN and unresolved ambiguity are explicit outcomes. Unsupported vocabulary is reported separately.
- Top1, Top3, bounded Top-K and full recall have distinct denominators.
- Comparisons require matching corpus/version, split, manifest, boundary source, identity source, snapshot source and metric version except for the deliberately compared policy.
- The six existing public harmonic examples support accepted-identity scoring. Harmony Support's chordSymbol is insufficient for a full accepted-equivalence Gold; its 160/48 structural counts remain a diagnostic, not full Tier 2.

## Stage and gates

P9.4-00 freezes scorer and policy after dev, evaluates public validation once, then reports both cohorts and limitations. Required gates: scorer tests, strict research TypeScript, research lint, frozen validation, provenance, phase-docs, AI-handoff, privacy/security, production diff zero, and fresh FULL at a report-inclusive HEAD. A documentation-only final commit may record the tested HEAD after light checks.

## Definition of Done

Freeze dev policy, run validation once, report availability and limitations, pass required gates, and record tested commit.

## Non-goals

No candidate ranking adjustment, decoder retuning, human Gold request, Product promotion, or P9.5.
