# Phase 5.1 Evaluation Contract

## Purpose

Phase 5.1は新しいコード検出器ではなく、既存`phase4-v1`へ渡すVoiceとroleを
解析前に選択する入力基盤である。評価は精度改善の主張より先に、既存経路の不変性と
入力分離の正しさを証明する。

## Frozen conditions

| ID | Condition |
|---|---|
| A | Phase 5 baseline。現行auto role、解析準備sessionなし |
| B | Phase 5.1 UIを通過。単一source、auto、手動変更なし、重複処理なし |
| C | Gold per-voice role。改善余地を測る参照条件のみ |
| D | presetまたは手動role override |
| E | 全部入りMIDI + split MIDI + exact duplicate除外 |

## Mandatory gates

### A = B backward equivalence

同じMIDI bytesについて以下をdeep equalで比較する。

- event boundary
- rank 1 canonical chord
- Top-3 canonical chord order
- Top-3 root order
- score
- confidence
- bass
- source voicing
- provenance
- deterministic candidate order

不一致が1件でもあればP5.1-04で停止する。期待値を書き換えて通過させない。

### Voice isolation

- selected Voice以外のnoteは解析入力へ入らない。
- `exclude`とdrumは解析入力へ入らない。
- `harmony`、`bass`、`melody-weak`は既存下流のrole表現を維持する。
- 同一入力から同一Voice順、同一ID、同一解析結果を得る。

### Duplicate protection

- PPQ正規化後のpitch/onset/duration fingerprint完全一致だけをexact duplicateとする。
- exact duplicateは解析入力で一度だけ使用する。
- near duplicateは警告のみで自動除外しない。
- split単一Voiceを全部入りsourceより優先し、それ以外はsource追加順で決定する。

### Safety

- `src/domain/schema.ts`のSHA-256と`fileVersion = 1`を維持する。
- raw MIDI、bytes、絶対path、runtime file name、track name本文をログへ保存しない。
- tracked MIDIとtracked `.local-evaluation`は0件を維持する。
- Live MIDIとChord Dojoの既存テストを維持する。

## Metrics

- canonical exact
- usable
- root / quality / seventh / tension / slash bass accuracy
- rank 1 adoption
- Top-3 canonical
- candidate recall
- manual input相当率
- correction cost
- duplicate count
- deterministic result
- pre-scan time
- piano roll first render
- multi-MIDI add time
- analyzer runtime median / p95 / max
- peak memory
- role correction count
- auto role disagreement rate

## Data split policy

1. 実装前baselineは`docs/phase5.1/00-baseline-lock.json`で固定する。
2. devとvalidationで実装を固定する。
3. holdoutは固定後に一度だけ実行する。
4. holdout結果を見てthresholdやheuristicを変更しない。
5. 個人MIDIは`.local-evaluation`だけで使用し、Gitへ追加しない。
6. fixture MIDIはテスト実行中に決定論的に生成する。

## Performance policy

- pre-scanとCanvas描画をAnalyzer本体と別々に測る。
- 相対runtimeだけで機能を不採用にしない。
- UI操作不能、継続memory増加、一般的な3分MIDIで10秒超の重大退行は停止条件。
- 測定前の大規模Worker化やthreshold調整は行わない。

## Rollout

- `enablePreAnalysisSourceSelection`はVault外local settingsに置く。
- 開発中はOFF。
- 全Gate通過後にAccuracy First既定ONを検討する。
- StableはOFFで既存Phase 5経路へ即時rollbackできる。
