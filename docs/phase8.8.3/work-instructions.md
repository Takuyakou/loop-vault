<!-- phase-id: 8.8.3 -->

# Phase 8.8.3 — Work Instructions

## Goal

For Product-supported text chord labels, preserve written defining tones in semantic identity, Text Preview, saved text-card audition, and text-derived Voicing Loop basic-full.

## Scope

Freeze the 624-row Product-supported subset of P8.8.3-R and eliminate A/B/F under the Product theory contract. Maintain explicit diagnostics for unsupported labels.

## Non-goals

No general external-site compatibility claim, Text Capture layout or transport UX, Product MIDI analyzer/extractor change, SOURCE MIDI behavior change, Vault fileVersion change, push, tag, or release.

## Contracts

Use [the accepted Product contract](contracts/P8.8.3-CONTRACT.md) and [frozen Product-supported fixture](product-supported-matrix.json). R's whole-site coverage remains unproven; this narrower Product-supported implementation does not claim to close it.

## Stages

00: freeze subset and baseline. 01: correct semantic identity. 02: deterministic Text Preview/Vault audition. 03: protect text-derived practice tones. 04: permanent corpus regression. 05: local witness. 06: fresh gates. 07: human-authorized local merge and EXE.

## Definition of Done

Frozen subset A=0, B=0, F=0; direct labels, Preview/Vault parity, text practice, previous PRE, MIDI-derived behavior, typecheck, lint, build, E2E, docs, privacy, and diff gates pass at final candidate HEAD.

## Safety

Follow root AGENTS.md. Private witness stays local and ignored. Each stage is committed separately after its required gates pass. Local master merge waits for explicit human authorization.
