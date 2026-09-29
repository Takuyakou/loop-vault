# Phase 9 — Final Closeout

## Final decision

**PHASE 9 = CLOSED — CORE C RETAINED / CORE V2 NOT PROMOTED.**

The research branch `research/phase9-core-v2` closes after P9.MID. Current Product Core C, the Product analyzer/extractor, Identity/Decoder, source-first playback, and Vault v2 remain the production and rollback baseline. Phase 9 did not make a Product default change or Vault migration. The branch is a retained research record; closure does not imply merge, push, tag, release, or an EXE build.

P9.MID recommends **`CORE_C_PLUS_CORRECTION_UX`** as a future investment direction, subject to a separate task and measured user correction effort. It is not a completed feature or an approved Product promotion. [P9.MID's analysis](P9.MID-oracle-and-strategy.md) separates conditional Gold-identity extraction evidence from operational Product evidence and records unmeasured full end-to-end Tier 2 comparisons as `NOT_MEASURED`.

## Stage disposition

| Stage | Closeout state | Evidence / reason |
| --- | --- | --- |
| P9.0 | COMPLETE — evaluation, corpus, provenance, Core Result and holdout seal foundation | [P9.0 report](P9.0-final-report.md) |
| P9.1 | RESEARCH COMPLETE — source-independent candidate NO-GO | [P9.1 report](../phase9.1/reports/P9.1-source-independence-research.md) |
| P9.1-P | NOT RUN — P9.1 promotion gate not met | P9.1 was research-only and no shared Product promotion followed. |
| P9.2 | RESEARCH COMPLETE — Temporal v2 NO-GO | [P9.2 report](../phase9.2/reports/P9.2-temporal-v2-research.md) |
| P9.3 | RESEARCH COMPLETE — Source Extraction v2 NO-GO | [P9.3 report](../phase9.3/reports/P9.3-source-extraction-v2-research.md) |
| P9.4 | RESEARCH COMPLETE — full Tier 2 accepted-equivalence scoring contract retained; no Product promotion | [P9.4 report](../phase9.4/reports/P9.4-tier2-scoring-contract.md) |
| P9.5 | RESEARCH COMPLETE — Ranking v2 NO-GO | [P9.5 report](../phase9.5/reports/P9.5-candidate-ranking-v2-research.md) |
| P9.MID | COMPLETE — oracle bottleneck and strategic checkpoint | [P9.MID decision](P9.MID-oracle-and-strategy.md) |
| P9.6 | **NOT RUN — PREREQUISITE NOT MET** | [P9.6 status](P9.6-status.json). Ranking did not improve; Decoder has no NO-GO verdict and its formal one-shot comparison remains unused. |
| P9.7 | NOT RUN — no qualified combined Core v2 candidate or Decoder decision | No tournament and no recorded sealed-holdout opening. Do not treat the unused holdout as validation evidence. |
| P9.8 | NOT RUN — no Core v2 Product integration or persistence decision | Vault v2 stays in place; post-save excluded-note restoration remains unsolved. |

## Evidence behind closure

- With **Gold boundary and Gold identity**, current Product extraction was exact on 31/160 public Harmony dev events and 16/48 validation events. This isolates source-note selection; it is not operational end-to-end accuracy. P9.3's richer source-snapshot pool contained an exact candidate in 64/160 dev and 48/48 validation events, but the frozen Product-guarded selector did not improve final exactness.
- P9.2's bounded Temporal v2 kept the authored one-beat and half-beat passing examples, but on Harmony missed 58/140 dev and 19/42 validation Harmonic Gold boundaries and exceeded the frozen card-inflation limit. This is not a safe Product boundary replacement.
- P9.5's research OLD and reranked arms tied on **accepted full Tier 2 Top1**: 11/18 dev and 7/9 validation; the correction-event proxy stayed 7/18 and 2/9. Harmony root/quality/bass numbers are structural diagnostics, not accepted-alternate Gold. Candidate misses remain 3/18 dev and 1/9 validation on the authored set.
- P9.MID found significant theoretical headroom in source-note representation and a separate boundary oversegmentation cost, but no tested safe runtime trigger for a selective research component. Gold-note substitution is an oracle ceiling, not a model result. Actual human correction-time reduction is `NOT_MEASURED`.

The Architecture Freeze's [21 Product success conditions](../phase9.0/contracts/PHASE-9-CORE-V2-ARCHITECTURE-FREEZE-v5.md) were **not** collectively met. In particular, the 9.7 tournament/one-shot holdout, 9.8 post-save reversibility, full Product accepted Tier 2, review precision/recall, and measured human correction-cost reduction are unavailable. Closing Phase 9 is a decision to stop this research programme without promotion, not a claim that these gates passed.

## Retained knowledge and next boundary

Keep the public scenario-diverse corpora, provenance comparator, full Tier 2 scoring contract, separate Harmonic/Voicing/Note Event research heads, reversible *in-memory* note evidence, and factorized candidate generator as research assets. Current Core C remains the comparison and rollback baseline. A future correction-UX task must first define event-level A/B audition, reversible excluded-note editing, boundary corrections, Top-K selection, ReviewReason and the needed Result/persistence plumbing; the present Product does not offer the entire package. If post-save restoration is required, decide its Vault contract separately. The unused Decoder comparison and sealed holdout may only be considered under a **new** authorization and a frozen, qualified promotion contract; Phase 9 closure does not license their use.

## Closeout integrity

At the closeout base HEAD `4ce81e7ca30fa0b8213f7656a0404ec0a899991a`, Git showed no `src/**` or `src-tauri/**` difference from local `master` on this research branch. No source files, production defaults, or Vault schema are changed by this documentation closeout. Existing unrelated untracked work is left untouched. The historical stages retain their recorded tested commits and gates; no prior HEAD's FULL result is asserted for this closeout commit.
