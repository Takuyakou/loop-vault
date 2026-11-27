# Phase 5.24 Work Instructions

## Mission
Performance fragmentsを直接コードチェンジとみなさず、
Harmonic Stateを推定して既存コード判定へ渡す。

Accuracy > speed.
解析時間増加は精度向上のため許容するが、runaway complexityは禁止。

## Scope
- 4/4 performance-capture MIDIのglobal Harmonic Rhythm evidence
- voice-internal Bass Lane evidence
- Performance Fragment Consolidationとshadow Harmonic State timeline
- A-K deterministic synthetic fixturesとlocked promotion gate
- promotion PASS後のみdefault-OFF production integration
- raw/display MIDI、Vault schema、既存rankingを保護した回帰検証

Intermediate StageではTest / Build Execution Optimization Policyを適用し、
Tier 1/2 focused gatesとPhase固有の安全Gateのみ実行する。
full Vitest、full Playwright、Tauri release build等のTier 3 GateはP5.24-04へ集約する。

## Non-goals
- raw MIDI mutation / quantization / tempo-map rewrite
- Local/section Harmonic Rhythm estimator
- chord vocabulary / scoring formula / candidate-ranking formula変更
- Vault schema/fileVersion変更
- Voice Role/P5.21.1 redesign
- candidate diversification
- waveform/audio analysis
- P5.25
## Start-up audit
確認:
- branch / HEAD / master
- git status
- worktrees
- merge/rebase/cherry-pick
- P5.23 completion
- P5.22 completion
- security hardening ancestry
- P5.21/P5.21.1 protected behavior
- test-output hygiene
- docs/CURRENT_STATE.md absent

推奨branch:
`feat/p524-harmonic-rhythm-fragment-consolidation`

dirtyならreset/stash/discardせず停止。

## Stage00
production変更なし。

監査:
- normalized notes→role/pre-analysis→harmonic evidence→boundary→chord candidates→ranking→UI
- timing/PPQ/beat/bar/meter
- current boundary evaluation tolerance
- current canonical metrics/corpora
- feature flag conventions
- local ignored evaluation infrastructure

固定:
- insertion seam
- A-K synthetic fixtures
- real failure anonymous registry
- 4/4 scope
- Harmonic Rhythm candidates
- Bass Lane evidence
- fragment same/change evidence
- Fragmentation/Change/False Merge metrics
- promotion thresholds
- performance methodology
- default-OFF flag

Stop.

## Harmonic Rhythm
Candidates: 1/2/4/8 quarter-note beats / unknown.

Global-first.
Allowed evidence:
- note activity
- pitch-class activity
- bass-state periodicity
- onset structure
- novelty periodicity
- within-cell consistency
- between-cell separability
- metric alignment

Detected chord identityを主入力にしない。

Fixture Kではunsafeなglobal推定をせずfallback。

## Bass Lane
attack minimumは禁止。

Evidence:
- register
- duration
- strong-beat placement
- continuity
- repeated/stepwise relation
- upper-texture separation
- compatible role prior

Single bass movement != harmonic change.
Persistent Bass State transition + contextual supportが必要。

Hard cases:
walking / passing / pedal / inversion / upper-texture minimum / true stable change.

## Fragment Consolidation
subset/superset単独mergeは禁止。

Same-state supporting evidence:
- same HR cell
- stable Bass State
- high PC compatibility
- temporal continuity
- repeated support

Strong change:
- persistent new PC
- persistent Bass State transition
- stable new texture
- cell/metric boundary + persistence

Conflictsはconservativeにsplit/fallback。

## C→Cmaj7 distinction
Persistent structural:
Bが意味ある境界で入り、新stateで持続 → split。

Transient tension flutter:
Bが短時間だけでstateを作らない → それだけでstable changeを作らない。

## Shadow outputs
Stage01:
- Harmonic Rhythm diagnostics
- Bass Lane diagnostics
を別々に評価。

Stage02:
- proposed harmonic states
- grouped fragments
- supporting/strong-change evidence
- reason
- confidence bucket if needed

persistent schema変更なし。

## Metrics
Fragmentation Ratio:
detected harmonic states / ground-truth harmonic states.

Change Precision:
maximum-cardinality one-to-one matched predicted changes / predicted changes。

Change Recall:
maximum-cardinality one-to-one matched predicted changes / expected changes。
current official boundary toleranceを再利用するが、Jの早期stable boundaryは別Gateで禁止。
expected changeが空でpredicted changeがある場合はprecision=0 / recall=1。

False Merge:
最重要Safety。

Over-segmentation:
Product improvement。

Historical metric値をcurrent baselineとしてコピペしない。

## Promotion gate
結果を見る前に固定。

Hard safety:
- C/D/E/G true changes protected
- J premature stable boundary禁止
- K unsafe global confidence禁止
- exact unique complete A-K metricsとderived aggregate必須
- truth cardinalityはA1/B1/C2/D2/E4/F2/G2/H1/I1/J2/K6 statesに固定
- Bass evidence照合はPC別interval index/sweepでO(N log N + S log S + declared transient evidence)、state-by-note全走査禁止
- non-finite / out-of-range metricsはfail closed
- Stage00 scriptsは npx tsc -p scripts/p524/tsconfig.json でstrict typecheckする
- promotion runtime booleanは === true、legacy fallbackはexact string arrayでなければfail closed
- malformed/incomplete top-level・nested promotion evidenceはthrowせずfail-stopを返す
- predicted Harmonic Stateのlabel + normalized PC identityがA-K truthと一致
- Harmonic Rhythmはexact A-K、A-J supported、Kのみunknown+fallback
- Bass Lane resultはexact A-K、full coverage、equivalent、安全違反0
- benchmarkはE x128 / 3072 notes / warmup durations 3 / sample durations+ratios 7 / derived median+max / timeout enforcement 10000 msのmeasured provenance必須
- False Merge <= locked limit
- Change Recall non-regressing

Product:
- A/B/F fragmentation improved
- real failure improves when available

Technical:
- deterministic
- bounded runtime
- raw MIDI unchanged
- OFF deep equal
- Vault schema/fileVersion unchanged

FAILならStage03へ進まない。

## Stage01
Harmonic Rhythm + Bass Lane Shadow only。
production import/useなし。

## Stage02
Fragment Consolidator Shadow only。
A-K全評価。

## Stage03
PASS後のみ。
default-OFF flag。
OFF deep equal。
ONではupstream Harmonic State変更によるlabels/boundaries/candidates差分は許容。
scoring/vocabulary/ranking algorithmのscope creepは禁止。

## Stage04
Full release/product acceptance readiness。

## Performance
全note O(N²)を避ける。
sorted events / interval sweep / beat-bar index / bounded neighborhoodを優先。

Benchmark:
- dense synthetic
- long local performance capture if available
- warm-up + multiple samples
- deterministic
- timeout/resource checks

## Human acceptance
1. backing re-strikes consolidate
2. partial fragments consolidate
3. C→Am7 remains
4. 2 chords/bar remains
5. pedal bass does not hide upper changes
6. walking bass does not create false changes
7. anticipation not premature
8. transient tensions do not flicker
9. persistent C→Cmaj7 can remain distinct
10. timeline reads as chord changes
11. flag OFF restores legacy

## Definition of Done
- P5.24-00〜03の各Stageが独立commitで閉じ、required Tier 1/2とPhase固有安全GateがPASS
- Stage02 promotion gateがPASSしない限りStage03 integrationを行わない
- default-OFFでaffected legacy outputがdeep equal
- P5.24-04でfull Vitest / full Playwright / Tauri release build等のTier 3 GateがPASS
- artifact integrity、security、dependency、privacy、generated-output hygieneがPASS
- Human Acceptance項目を明示した `READY FOR PRODUCT ACCEPTANCE — Harmonic Rhythm & Performance Fragment Consolidation` で停止
- merge / push / tag / release / P5.25は別承認まで実行しない
## Commit rules
Each Stage:
- status/diff/diff-check
- explicit paths
- no git add -A
- no git add .
- staged review
- independent commit
- report/state
- clean status

No merge/push/P5.25.
