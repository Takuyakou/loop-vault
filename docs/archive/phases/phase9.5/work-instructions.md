<!-- phase-id: 9.5 -->

# Phase 9.5 — Work instructions

## Goal

Evaluate whether factorized local ranking improves accepted identity Top1 after candidate recall is separated. Do not infer accepted alternatives from Harmony `chordSymbol` or promote a structural proxy as full Tier 2.

## Scope

Use the fixed P8.6 shortcut-factorized candidate generator on source-only public windows. Compare OLD overlap order, pitch+bass, factorized without context and factorized with bounded local context. All arms must receive the same candidates. Features are pitch overlap, observed bass, track-role proxy, note duration, onset boundary evidence, defining-degree presence, short non-chord-tone penalty, vocabulary prior and prior source-only local candidate. Context is not a decoder and must not erase a half-beat passing chord. UNKNOWN is an explicit sparse-evidence review decision with retained Top-K.

Use P9.4's accepted-equivalence scorer on public authored Gold. Add diverse authored dev/validation scenarios. Use Harmony Support only for structural root/quality/bass proxy because it lacks independently adjudicated acceptable alternatives. Report full/bounded candidate recall, Top3/Top1, rankable misses, score margin, UNKNOWN calibration, correction-event proxy, review-flag proxy, category breakdown, and resource cost. Human review precision/recall remain unavailable.

## Stages

P9.5-00: implement research-only ranker, evaluate public dev, freeze one comparison policy, run validation once, then report with fresh gates. No candidate generator tuning or decoder comparison. A NO-GO outcome can complete research.

## Definition of Done

Focused tests, strict research TypeScript/lint, matched dev and frozen validation aggregates, provenance, source-only feature checks, resource benchmark, phase docs, AI handoff, privacy, zero Product diff, and fresh FULL at report-inclusive HEAD. Record the tested commit separately from documentation-only closeout.

## Non-goals

No Product integration, persistence change, private tuning, sealed holdout use, P9.6 decoder decision or P9.7 tournament. Review metrics here are proxies, not measured human review outcomes.
