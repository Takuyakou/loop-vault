<!-- phase-id: 5.40 -->

# Phase 5.40 — Work Instructions

## Goal

Complete only P5.40-00: acquire independent local-state ground truth, reproduce
the frozen 276-candidate ranking with numerical contribution accounting, and
classify the failure mechanism. A diagnosis may be insufficient evidence; do
not invent an exact answer.

## Scope

- Use the checksum-verified [`package/`](package/) as the stage-specific
  research specification, especially its Stage00 document.
- Create ignored-local source-only review packets before exposing local
  candidate identities, scores, or ranks.
- Add evaluation-only score diagnostics and privacy-safe synthetic tests.
- Write one anonymous Stage00 report under [`reports/`](reports/README.md).

## Non-goals

No policy correction, retune, candidate change, Family B or smoothing change,
production integration, parser/schema/fileVersion change, migration, UI work,
or Stage01 execution.

## Contracts

The source-fidelity, ground-truth, score-breakdown, anti-overfit, testing,
privacy, and stop contracts are in [`package/`](package/README.md). The
P5.39 final FAIL is immutable historical evidence.

## Stages

Only P5.40-00 is active. P5.40-01 through 04 remain proposals and cannot be
started without separate authorization.

## Definition of Done

Stage00 requires independently frozen local-state classifications, all current
candidate scores and decomposition, root-cause/generalization analysis,
required focused tests and validators, a privacy-safe report, and a clean
production diff. If independent truth cannot be obtained, record that honestly
and stop without asserting a completed diagnosis.

## Safety

The root `AGENTS.md` is canonical. Preserve private evidence in ignored-local
files only; never merge or push automatically.
