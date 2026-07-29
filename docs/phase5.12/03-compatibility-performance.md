# Phase 5.12 Compatibility / Performance

## Backward Equivalence

`src/domain/midi/preAnalysis/analyzerInput.test.ts`の
`keeps the untouched single-source auto path deep-equal to Phase 5`が次を実行する。

1. 単一source / auto / manual変更なしのsessionを生成
2. `buildSessionAnalysisRequest()`を実行
3. Phase 5 optionsで直接解析した結果と、session経由の結果を`toEqual()`で比較

このdeep equalはboundary、event、candidate、score、confidence、bass、
voicing source、provenance、deterministic orderを含む解析結果オブジェクト全体に対する
比較であり、PASSした。

Phase 5.12はAnalyzer option、candidate ranking、threshold、weightを変更していない。

## Feature Flag / Profile

| Setting | 実際の動作 |
|---|---|
| Stable + ON | pre-analysis。simpleはcompact、complexはexpanded |
| Accuracy First + ON | pre-analysis。simpleはcompact、complexはexpanded |
| OFF | 旧Phase 5直接解析 |

保存keyは既存の`loopvault.preAnalysisSourceSelection`、version 1のまま。
`alwaysShowPreAnalysis`は既存保存値の読込互換のため型とstorageには残し、製品UIからは
廃止した。rollback判断は`enablePreAnalysisSourceSelection`だけで行う
(`src/storage/preAnalysisSettings.ts`)。

## Runtime

今回の変更はpre-scan後のroutingとpresentationであり、Phase 5.1 Analyzer本体の
性能値は変えていない。

| Gate | 実測 / 結果 |
|---|---|
| all-in E2E | 当該test 301ms。drop、pre-scan、11 Voice表示、Analyze、結果遷移を含む |
| Capture product E2E 5件 | 838ms |
| PreAnalysisWorkspace 8件 | 484ms |
| 全Vitest | 13.60s、1,817 tests PASS |
| 100,000 notes | Canvas 1、note DOM 0、3,000ms未満Gate PASS |
| mobile layout | 390pxでhorizontal overflow 0 |

Phase 5.1で計測済みの104小節実MIDIはpre-scan 33.34ms、
session解析502.23ms、peak 100.12MiB
(`docs/phase5.1/03-runtime-memory.md`)。Phase 5.12では同じpre-scan /
Analyzer実装を使用する。

Phase 5.12単独のJS heap peakは新規計測していない。したがって新しいpeak値は主張しない。
代わりにnote DOM 0、Canvas 1、同一workspace維持、全回帰testで継続増加やstuck noteを
検出していないことをGateとしている。

## Isolation

- Live MIDI / Chord Dojoのsource変更なし。
- Playback stateはVoice/session変更時に既存stop処理を通す。
- pre-analysis session、MIDI bytes、file nameはruntime-only。
- `rankingScore`、Vault export、repositoryへ追加情報を渡さない。
- `src/domain/schema.ts`、`src/domain/types.ts`、`fileVersion`を変更していない。

## Build Identity

`vite.config.ts`で次をcompile-time defineし、`src/buildInfo.ts`からSettingsへ表示する。

- package version
- Git short SHA
- build日時
- Pre-Analysis Part Selection ON / OFF

`VITE_BUILD_COMMIT` / `VITE_BUILD_DATE`を指定した再現buildにも対応し、未指定時は
現在HEADとISO日時を使用する。
