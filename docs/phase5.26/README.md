<!-- phase-id: 5.26 -->
# Phase 5.26 — Local Harmonic Rhythm / Structural Bass Evidence / Spelling / Altered Tensions

## Status
`IN PROGRESS — P5.26-00 COMPLETE; P5.26-01 AWAITING HUMAN AUTHORIZATION`

## Purpose
演奏MIDIの誤りを、境界、Structural Bass、surface spelling、altered tensionの独立軸で改善する。
Synthetic 8-bar truthは `1,1,2,2,1,1,2,2` statesで、Bar 2は1 state。

## Required Reading Order
1. [root AGENTS.md](../../AGENTS.md)
2. [root CLAUDE.md](../../CLAUDE.md)
3. [execution-state.json](execution-state.json)
4. [work-instructions.md](work-instructions.md)
5. [original proposal](proposal/ORIGINAL-PROPOSAL.md)
6. [integrated design review](proposal/P5.26-DESIGN-REVIEW-INTEGRATED.md)
7. [scope / architecture contract](contracts/01-scope-architecture-contract.md)
8. [local harmonic rhythm contract](contracts/02-local-harmonic-rhythm-contract.md)
9. [structural bass consolidation contract](contracts/03-structural-bass-consolidation-contract.md)
10. [spelling contract](contracts/04-spelling-contract.md)
11. [altered tensions shadow contract](contracts/05-altered-tensions-shadow-contract.md)
12. [evaluation / promotion contract](contracts/06-evaluation-promotion-contract.md)
13. [flags / regression contract](contracts/07-flags-regression-contract.md)
14. [privacy / performance contract](contracts/08-privacy-performance-contract.md)
15. [active audit](audit/P5.26-00-repository-audit.md)
16. [active report](reports/P5.26-00-audit-baseline.md)
17. [slash-bass naming backlog](backlog/SLASH-BASS-UPPER-STRUCTURE-SEMANTICS.md)

## Tracks
- A: Local Harmonic Rhythm + Structural Bass evidence fusion
- B: Key-aware surface spelling
- C: Altered-tension generation/ranking shadow

## Stages
### P5.26-00 Audit / Fixture / Metrics / Baseline
Complete at tested implementation commit `e1861dcbb17027b992c809012819c6ba7a0563b3`; no production behavior change.

### P5.26-01 Key-aware Spelling
Pending explicit human authorization; do not start automatically.

### P5.26-02 Local HR / Structural Bass Shadow
Pending.

### P5.26-03 Feature-flagged Integration
Pending.

### P5.26-04 Altered Tensions Shadow
Pending.

### P5.26-05 Product Acceptance
Pending.

## Non-goals
Global HR deletion, MIDI/timing or Voice Role changes, persistence migration, broad scoring retune,
mandatory `Amaj9/B` normalization, merge, push, P5.27。

## Next Action
停止。明示的なhuman authorizationがある場合のみP5.26-01を開始する。merge、push、P5.27は禁止。
