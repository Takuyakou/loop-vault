<!-- phase-id: 5.24 -->
# Phase 5.24 — Harmonic Rhythm & Performance Fragment Consolidation

## Status
`IN PROGRESS — P5.24-01 Harmonic Rhythm + Bass Lane shadow`

## Purpose
演奏キャプチャ由来MIDIで、演奏上の再打鍵・部分Voicing・Bass/上物の交互発音を
「コードチェンジ」と誤認する問題を改善する。

目標:
**演奏イベントと和声イベントを分離し、本当に変わった場所だけをharmonic changeとして残す。**

## Required Reading Order
1. Root `AGENTS.md` — common safety rules (repo root; intentionally unlinked)
2. Root `CLAUDE.md` — repository workflow (repo root; intentionally unlinked)
3. [`README.md`](README.md) — phase entry point
4. [`execution-state.json`](execution-state.json) — machine-readable resume state
5. [`work-instructions.md`](work-instructions.md) — complete execution contract
6. [`proposal/ORIGINAL-PROPOSAL.md`](proposal/ORIGINAL-PROPOSAL.md)
7. [`proposal/P5.24-DESIGN-REVIEW.md`](proposal/P5.24-DESIGN-REVIEW.md)
8. Contracts in order: [`01`](contracts/01-scope-architecture-contract.md), [`02`](contracts/02-harmonic-rhythm-contract.md), [`03`](contracts/03-bass-lane-contract.md), [`04`](contracts/04-fragment-consolidation-contract.md), [`05`](contracts/05-evaluation-promotion-contract.md), [`06`](contracts/06-flag-integration-regression-contract.md), [`07`](contracts/07-privacy-performance-contract.md)
9. Active evidence: [`audit`](audit/P5.24-00-repository-audit.md) and [`report`](reports/P5.24-00-audit-baseline.md)
10. [`backlog/LOCAL-HARMONIC-RHYTHM.md`](backlog/LOCAL-HARMONIC-RHYTHM.md)

Git realityを正とする。

## Architecture
Normalized performance notes
→ Harmonic Rhythm Evidence
→ Voice-internal Bass Lane Evidence
→ Performance Fragment Consolidation
→ Shadow Harmonic State Timeline
→ Promotion Gate
→ Feature-flagged production integration

## Safety priority
False Mergeを最重要リスクとする。
「同じコードなのに分割」より「本当のコードチェンジを消す」方が危険。

## v1 scope
- production integrationは原則4/4のみ
- Harmonic Rhythm候補: 1 / 2 / 4 / 8 quarter-note beats / unknown
- Global estimatorから開始
- mixed harmonic rhythmではunsafeなglobal推定をせずunknown/legacy fallback
- Local/section estimatorは別Phase候補

## Bass Lane
attackごとの最低音をBassとみなさない。
register / duration / strong beat / continuity / texture separation等からstable Bass Stateを推定する。

Bass PCが変わっただけではstrong changeではない。
Walking bass / passing bass / inversionを保護する。

## Fragment Consolidation
PC subset/supersetは補助証拠のみ。
subsetだけでmerge禁止。

same-state evidence:
- same harmonic-rhythm cell
- Bass State stability
- PC overlap/compatibility
- temporal continuity
- repeated support

strong-change evidence:
- persistent new PC
- persistent stable Bass State transition
- stable new texture
- metric/cell boundary + subsequent persistence

## A-K fixtures
A repeated backing → consolidate
B partial Voicing fragments → consolidate
C C→Am7 → split
D persistent structural C→Cmaj7 → split
E 2 chords/bar → split
F 1 chord/2 bars → no false split
G pedal bass + true upper change → split
H walking bass + stable harmony → no false changes
I inversion → same harmony per locked identity policy
J anticipation → no premature stable change
K mixed harmonic rhythm → low confidence/unknown/legacy fallback

## Metrics
Fragmentation Ratio = detected harmonic states / ground-truth harmonic states.
Semantic identity = exact label + normalized pitch-class set; C/D/Iはzero-tolerance。
Bass Lane promotion evidence = exact A-K equivalence + zero safety violations。
Also:
- Change Precision
- Change Recall
- False Merge Rate
- Over-segmentation Rate

Boundary matching toleranceは現行official評価契約を監査して再利用する。

## Flag semantics
Stage03 feature flagはdefault OFF。

OFF:
- affected legacy output deep equal

ON:
- Harmonic State inputが変わるため、labels/boundaries/candidatesが変化すること自体は意図された挙動
- chord vocabulary / scoring formula / candidate ranking formulaのscope creepは禁止

## Non-goals
- raw MIDI mutation
- quantization
- tempo-map rewrite
- Local harmonic rhythm
- chord vocabulary change
- candidate ranking/scoring formula change
- Vault schema/fileVersion change
- Voice Role/P5.21.1 redesign
- candidate diversification
- waveform/audio analysis
- P5.25

## Stages
P5.24-00 Audit / Failure Corpus / Metrics / Baseline
P5.24-01 Harmonic Rhythm + Bass Lane / Shadow
P5.24-02 Fragment Consolidator / Shadow
P5.24-03 Feature-flagged Integration / Real MIDI / Corpus
P5.24-04 Product Acceptance

## Next action
P5.24-01をTier 1/2とPhase固有の安全Gateで実行する。Tier 3 GateはP5.24-04まで実行しない。
