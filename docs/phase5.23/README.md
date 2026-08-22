<!-- phase-id: 5.23 -->
# Phase 5.23 — Timeline Candidate Legibility

## Status
`IN PROGRESS — P5.23-01 COMPLETE at exact verified commit ba359e7e03c9631a1ee5350d3f07add6ddc43283; P5.23-02 NOT STARTED`

## Purpose
MIDI解析後のFull Timelineで、重複候補を表示層だけで整理し、初期採集範囲と和声活動の読みやすさを改善する。

## Scope
1. presentation-only candidate grouping / variant access
2. Capture初期選択と安全なsnap初期値
3. 既存`fullTimeline`由来のharmonic activity表示

## Explicitly out of scope
- candidate generation / count / scoring / boundary
- diversification / coverage-aware reranking / section detector / 90% gate
- [P5.18.1 Contract 06 — Chord Context Section-Length Extension](../phase5.18.1/contracts/06-chord-context-section-extension-contract.md)（complete 4/4 sections: 1/2/4/8/12 bars、最大48 beats/events）、`defaultAnalyzerMode`、Vault schema/fileVersion

## P5.23-00 locked decisions
- relation: overlap coefficient ≥ .75 AND min(start/end/center distance) ≤ 2 bars
- anchor: earlier start → later end → stable ID; direct anchor relation only
- representative: longest → score → earlier start/end → stable ID
- selected variant: finite `selectionScore`（non-finite/absentなら`confidence`へfallback）→ higher `confidence` → earlier start → shorter length → earlier end → stable ID
- initial range: 各groupからselected variantを1件ずつ算出し、全group結果をselected comparatorで比較したglobal winner全体; synthetic fixtureは`[initial-a, initial-b-8, initial-c]`から`initial-b-8`; zero件はmanual fallback; automatic snapはbar
- activity: `fullTimeline` beat overlap / meter, clamp [0,1], four deterministic buckets
- focus/highlight is not activation; every candidate ID remains reachable exactly once
- variant visible: JA `<length>小節 · Bar <start>–<end>` / EN `<length> bars · Bars <start>–<end>`; ARIA: JA `候補グループ <g>、バリアント <v>。<length>小節、Bar <start>–<end>` / EN `Candidate group <g>, variant <v>. <length> bars, Bars <start>–<end>`

## Stages
- P5.23-00 Audit / Baseline / Contract Lock — COMPLETE (`3386014627e65b4856b0d5504108e444776f060d`)
- P5.23-01 Candidate Grouping / Variant UI — COMPLETE (`ba359e7e03c9631a1ee5350d3f07add6ddc43283`)
- P5.23-02 Initial Selection / Snap / Harmonic Activity
- P5.23-03 Visual / Interaction Hardening
- P5.23-04 Product Acceptance

## Required Reading Order
1. root [AGENTS.md](../../AGENTS.md)
2. root [CLAUDE.md](../../CLAUDE.md)
3. this README
4. [execution-state.json](execution-state.json)
5. [work-instructions.md](work-instructions.md)
6. [proposal/ORIGINAL-PROPOSAL.md](proposal/ORIGINAL-PROPOSAL.md)
7. [proposal/P5.23-DESIGN-REVIEW.md](proposal/P5.23-DESIGN-REVIEW.md)
8. [Contract 01 — Scope / Legibility](contracts/01-scope-legibility-contract.md)
9. [Contract 02 — Candidate Grouping](contracts/02-candidate-grouping-contract.md)
10. [Contract 03 — Selection Defaults](contracts/03-selection-defaults-contract.md)
11. [Contract 04 — Harmonic Activity](contracts/04-harmonic-activity-contract.md)
12. [Contract 05 — Accessibility / Interaction](contracts/05-accessibility-interaction-contract.md)
13. [Contract 06 — Regression / Safety](contracts/06-regression-safety-contract.md)
14. [active audit](audit/P5.23-00-repository-audit.md)
15. [active report](reports/P5.23-01-candidate-grouping.md)
16. [P5.23.1 deferred backlog](backlog/P5.23.1-CANDIDATE-DIVERSIFICATION.md)

## Next action
STOP。P5.23-02はNOT STARTED。自動進行せず、P5.23-02を開始する別途のhuman requestを待つ。
