# Phase 4.7-04 New Gold Corpus Integrity

## 結論

固定v1コーパスを結果確認前に一括生成し、Productコードを変更せずintegrityとPart A applicabilityだけを検証した。Validation / Holdoutの精度評価は実行していない。

## Corpus

- Location: `.local-evaluation/loop-vault-bass-companion-identity-gold-v1`（Git管理外）
- Version: `loop-vault-bass-companion-identity-gold-v1`
- Files / events / notes: 36 / 288 / 1930
- Bytes: 20925
- SHA-256 / byteLength: PASS
- Parser round-trip: 36/36
- Representability: 288/288
- Split duplicate: file 0, scenario 0, SHA across split 0

## Split stratification

| Split | Files | Events | Notes | Clean/Stress | Plain/Slash | Applicable/Minimum |
|---|---:|---:|---:|---:|---:|---:|
| dev | 12 | 96 | 644 | 6/6 | 48/48 | 92/24 |
| validation | 12 | 96 | 643 | 6/6 | 48/48 | 91/12 |
| holdout | 12 | 96 | 643 | 6/6 | 48/48 | 91/12 |

各splitにm7 / m9 / maj9 / 7sus4 / 13 / maj7 / dom7、8種類のbass condition、same/separate track、short/medium/long、12キーを含む。

## Applicability

- Expected by fixed design: 252
- Measured with existing parser/analyzer diagnostic API: 274
- Plan false-positive / false-negative: 30 / 8

この値はP4.7 Part Aを適用可能かだけを測る。コード検出精度、candidate recall、Top-3、Validation / Holdout Gateは未評価。

## Gates

| Gate | Result |
|---|---|
| corpusVersion | PASS |
| checksumsAndLengths | PASS |
| parserRoundTrip | PASS |
| splitOverlapZero | PASS |
| familiesStratified | PASS |
| bassConditionsStratified | PASS |
| cleanStressBalanced | PASS |
| plainSlashBalanced | PASS |
| allTwelveKeysPerSplit | PASS |
| representability | PASS |
| applicabilityMinimums | PASS |
| midiTrackedZero | PASS |
| localEvaluationTrackedZero | PASS |
| overall | PASS |

## Scope

- Product変更: なし
- Product接続: なし
- Validation / Holdout精度評価: 未実行
- MIDI / manifestのGit追加: なし
- 結果確認後の追加生成: なし
