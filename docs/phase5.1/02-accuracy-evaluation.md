# Phase 5.1 Accuracy Evaluation

## Evaluation Contract

評価条件は`docs/phase5.1/00-evaluation-contract.md`で実装前に固定した。

| Condition | Input |
|---|---|
| A | Phase 5の既存直接解析 |
| B | 単一source、Auto、無編集でPhase 5.1 UI経路を通過 |
| C | per-Voice Gold role |
| D | `harmony-bass` preset |
| E | 全部入りsource + exact duplicateのsplit bass |

fixture MIDIは評価時に決定論的生成し、MIDIファイル自体はGitへ保存していない。
Dev/Validation完了後に実装を凍結し、Holdoutは一度だけ実行した。

## A/B Backward Equivalence

| Split | Fixture | Events | A = B deep equal | Deterministic |
|---|---:|---:|---:|---:|
| Dev | 4 | 64 | PASS | PASS |
| Validation | 4 | 64 | PASS | PASS |
| Holdout | 4 | 64 | PASS | PASS |

比較対象はevent boundary、rank 1、Top-K順、score、confidence、bass、
source voicing、provenance、candidate orderを含む解析結果全体である。
集計値だけではなく`assert.deepEqual()`で検証した。

生成fixtureは明瞭な4パート素材のため、A〜Eすべてでcanonical exact、Top-3、
candidate recallが1.0、manual input相当率が0だった。この値を一般MIDI精度の主張には使わず、
入力分離と非回帰の確認に限定する。

実測JSON:

- `docs/phase5.1/02-evaluation-dev.json`
- `docs/phase5.1/02-evaluation-validation.json`
- `docs/phase5.1/02-evaluation-holdout.json`

## Voice Isolation And Duplicate Guard

全12 fixtureで次を確認した。

- drumと`exclude`はprepared inputへ入らない
- 選択Voiceのnote数とprepared inputのnote数が一致
- 同じsessionから同じVoice順、ID、解析結果を得る
- PPQが異なるsplit bassをmaster PPQへ正規化
- exact duplicateは各fixtureで1 Voice検出し、解析入力では一度だけ使用
- split単一Voiceを全部入りsource内の同一Voiceより優先

## Existing Voicing Gold Corpus

既存60 MIDI、496イベントをDev/Validation/Holdoutに分け、既存Phase 4.3 evaluatorで再実行した。
ここでのAはGold boundary + Gold role、BはGold boundary + product roleであり、
Phase 5.1 fixtureのA/Bとは名前の意味が異なる。

| Split | Files | Events | Gold-role exact | Product-role exact | Delta | Gold-role usable | Product-role usable | Delta |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Dev | 40 | 320 | 0.8625 | 0.7594 | -0.1031 | 0.8125 | 0.6781 | -0.1344 |
| Validation | 10 | 96 | 0.9063 | 0.7396 | -0.1667 | 0.9792 | 0.7083 | -0.2708 |
| Holdout | 10 | 80 | 0.9500 | 0.7750 | -0.1750 | 0.9500 | 0.6375 | -0.3125 |

これはPhase 5.1 UIが自動的にGold精度へ到達する証明ではない。
Voice role訂正に実用上の改善余地があることを示す上限側の参照値である。

## Real MIDI

個人MIDIは読み取り専用かつGit管理外で2件評価した。
レポートには匿名aliasと集計だけを使用し、path、実file name、track name本文、bytesを残していない。

| Alias | Bars | Voices | Notes | Timeline | Candidates | A = B | Deterministic |
|---|---:|---:|---:|---:|---:|---:|---:|
| real-midi-1 | 104 | 11 | 2,736 | 179 | 10 | PASS | PASS |
| real-midi-2 | 9 | 2 | 176 | 14 | 6 | PASS | PASS |

Gold chord labelを持たないため、実MIDIではaccuracyを推測せず、
coverage、実行完了、A/B同値、決定性だけを判定した。

## Decision

- A/B backward compatibility: PASS
- Voice isolation: PASS
- exact duplicate protection: PASS
- deterministic: PASS
- Gold Corpus/実MIDI回帰実行: PASS
- Analyzer score/threshold変更: なし
- default analyzer: `phase4-v1`

Accuracy FirstではPhase 5.1を既定ONとする条件を満たした。
Stableの即時rollbackと設定上の明示OFFは維持する。
