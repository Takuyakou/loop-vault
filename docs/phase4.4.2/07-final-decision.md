# Loop Vault Phase 4.4.2 最終判定

## 1. 判定

**非昇格で完了**とする。

DevとValidationではロック済みA1（Relative Support）がGateを通過したが、
新コーパスHoldoutではPrimary 8イベントすべてでfilterが発火せず、
melody contaminationとmelody leakが改善しなかった。

Holdout確認後の閾値変更、再評価、別候補への差し替えは行っていない。
選択案は製品経路へ接続せず、既存Phase 4.4 filterもshadowのまま維持する。

## 2. PR / commit

| Stage | PR | Commit | 内容 |
|---|---:|---|---|
| P4.4.1 | #244 | `481187c` | Validation pipeline trace |
| P4.4.2-00 | #245 | `fd32753` | Corpus integrity / baseline |
| P4.4.2-01 | #246 | `d25fb8e` | Failure matrix |
| P4.4.2-02 | #247 | `e16f566` | Hypothesis A shadow |
| P4.4.2-03 | #248 | `2c035aa` | Hypothesis B shadow |
| P4.4.2-04 | #249 | `81e700f` | Intervention lock |
| P4.4.2-05 | #250 | `6abb2be` | Validation |
| P4.4.2-06 | #251 | `e2b42fa` | Holdout |

P4.4.2は上記を依存順に積んだstacked PRであり、mainへは未マージ。

## 3. Corpus integrity

`test/loop-vault-voicing-harmony-support-gold-v1`を評価時だけ読み込んだ。

- MIDI: 32 files
- Events: 256
- Notes: 1,472
- Scenarios: 16
- Dev / Validation / Holdout: 20 / 6 / 6 files
- clean / stress pair、SHA-256、byteLength、Gold voicing、track/note role、
  support count / duration metadata: 全件整合
- MIDI本体はGitへ追加していない

根拠: `docs/phase4.4.2/00-corpus-integrity.md`,
`docs/phase4.4.2/00-baseline.json`

## 4. Baseline

| Split | Events | Contamination | Melody leak | Exact | Note F1 | Usable |
|---|---:|---:|---:|---:|---:|---:|
| Dev | 160 | 59 | 36.88% | 18.13% | 84.06% | 16.25% |
| Validation | 48 | 36 | 75.00% | 25.00% | 79.37% | 0.00% |
| Holdout | 48 | 18 | 18.75% | 62.50% | 95.85% | 33.33% |

Baseline計測では改善案を適用していない。

## 5. Failure matrix

Dev 160イベントの分類:

- support count 0 / 1 / 2 / 3 / 4+: 8 / 24 / 32 / 64 / 32
- role-is-bass: 8
- no-harmony: 8
- status-only change: 7
- pitch-fidelity change: 8
- Primary: 88
- Diagnostic-only: 16
- Other: 56

all-channel-zero、stem型track、Harmony/Melody voiceのBass誤分類、
support count 0は改善対象にせず、P4.4.3へ残した。

根拠: `docs/phase4.4.2/01-failure-matrix.json`

## 6. Hypothesis A / B

### A: Relative Support

| ID | Coverage | Primary contamination減 | Leak減 | Recall差 | Exact差 | General F1差 |
|---|---:|---:|---:|---:|---:|---:|
| A1 | 0.25 | 100% | 100% | +0.25pp | +17.05pp | +1.28pp |
| A2 | 0.50 | 100% | 100% | +0.25pp | +17.05pp | +1.28pp |
| A3 | 0.75 | 100% | 100% | 0.00pp | +17.05pp | +0.78pp |

### B: Count x Duration

| ID | Minimum mass | Primary contamination減 | Leak減 | Recall差 | Exact差 | General F1差 |
|---|---:|---:|---:|---:|---:|---:|
| B1 | 0.20 | 100% | 100% | +0.25pp | +17.05pp | +0.75pp |
| B2 | 0.40 | 100% | 100% | +0.25pp | +17.05pp | +0.75pp |
| B3 | 0.60 | 100% | 100% | +0.25pp | +17.05pp | +0.75pp |

全候補でBass Accuracyは非退行、source note additionは0、
chord label / Timelineは不変だった。

根拠: `docs/phase4.4.2/02-relative-support-shadow.json`,
`docs/phase4.4.2/03-count-duration-shadow.json`

## 7. 選択案

事前登録済みの辞書式順位でA1を選択した。

- minimumRoleConfidence: 0.65
- minimumSupportPitchCount: 1
- minimumCoverageRatio: 0.25
- minimumSupportBeats: 0.2

A1とA2は登録済み指標で完全同点だったため、最後のみcandidate ID昇順で
決定性を確保した。Gateや閾値は変更していない。

根拠: `docs/phase4.4.2/04-intervention-lock.json`

## 8. Dev内訳

### Support count別（A1、全subset）

| Count | Melody leak | Exact | Note F1 | Trigger |
|---:|---:|---:|---:|---:|
| 1 | 6.25% | 0.00% | 73.44% | 75.00% |
| 2 | 22.92% | 25.00% | 79.01% | 50.00% |
| 3 | 0.00% | 33.33% | 92.31% | 83.33% |
| 4 | 25.00% | 75.00% | 97.56% | 75.00% |

Devで実測されたsupport duration groupは`0.45 beat`のみで、
melody leak 13.13%、Exact 32.50%、F1 86.49%、Trigger 70.00%だった。

### Texture別（A1、全subset）

| Texture | Melody leak | Exact | Note F1 | Trigger |
|---|---:|---:|---:|---:|
| Block | 1.56% | 25.00% | 88.35% | 75.00% |
| Arpeggio | 25.00% | 12.50% | 79.79% | 62.50% |
| Rootless | 12.50% | 87.50% | 98.25% | 75.00% |

## 9. Pitch Fidelity / Status

Dev PrimaryのA1:

- contamination: 88件から0件
- melody leak: 100%減
- Note Precision: 100%
- Note Recall: +0.25pp
- Note F1: 86.35%
- Voicing Exact: +17.05pp
- Bass Accuracy: 100%を維持
- Top / Register: 各+12.50pp
- source note addition: 0
- status-only change rate: 5.68%

Status-only改善はPitch Fidelityより優先せず、別集計として保持した。

## 10. 既存Corpus回帰

Devの一般320イベント:

- Product F1: 96.26%
- A1 Shadow F1: 97.54%
- Plain block Exact: 93.75% -> 100%
- Rootless Exact: 93.75% -> 100%
- Arpeggio F1: 74.74% -> 76.39%
- source note addition: 0

Validationの一般96イベント:

- Product F1: 96.99%
- A1 Shadow F1: 97.44%
- plain block / rootless / arpeggio個別カテゴリは0イベントのためnot-applicable

旧専用Holdoutは指示どおり開いていない。

## 11. Validation

A1を新コーパスValidationへ1回だけ適用した。

| Primary metric | Baseline | A1 | 差 |
|---|---:|---:|---:|
| Contamination events | 16 | 8 | -50% |
| Melody leak | 100% | 50% | -50% |
| Exact | 0% | 50% | +50pp |
| Note Recall | 62.50% | 62.50% | 0pp |
| Note F1 | 66.67% | 71.43% | +4.76pp |
| Bass Accuracy | 100% | 100% | 0pp |
| Top / Register | 0% | 50% | +50pp |

Validation Gate: **PASS**。

最初のGate集計で0イベントカテゴリの`null - null`をFAIL扱いしたため、
MIDIを再評価せず保存済み結果だけからnot-applicableへ再分類した。
Validation execution countは1のまま。

根拠: `docs/phase4.4.2/05-validation-results.json`

## 12. Holdout

A1を新コーパスHoldoutへ1回だけ適用した。

| Primary metric | Baseline | A1 | 差 |
|---|---:|---:|---:|
| Events | 8 | 8 | - |
| Contamination events | 8 | 8 | 0% |
| Melody leak | 100% | 100% | 0% |
| Exact | 0% | 0% | 0pp |
| Note F1 | 88.89% | 88.89% | 0pp |
| Filter trigger | 0% | 0% | 0pp |

Holdout Gate: **FAIL**。

Primary 8件はすべてProduct上で`melody`、role confidence 1.0、
support count 3、coverage ratio 1.0だった。一方、実測support durationは
全件`0.179167 beat`で、ロック済みA1の`minimumSupportBeats = 0.2`を
下回った。このためfilterは0/8件で発火しなかった。

Holdout後の閾値調整、別候補評価、再実行は行っていない。

根拠: `docs/phase4.4.2/06-holdout-results.json`

## 13. 不変条件とrollback

- `defaultAnalyzerMode = "phase4-v1"`: 維持
- `fileVersion = 1`: 維持
- Vault schema: 不変
- Analyzer / root / quality / tension: 不変
- Timeline / boundary / aggregate / fallback / chord label: 不変
- 製品経路: 不変
- Relative Support / Count x Duration: shadow評価コードのみ
- rollback: 製品接続していないため不要。stacked PRを取り込まなければ現行挙動は完全維持

## 14. P4.4.3への引き継ぎ

次の課題は今回と混ぜず、P4.4.3で扱う。

- all-channel-zero
- stem型track
- Harmony voice / Melody voiceのBass誤分類
- support count 0
- `missing-harmony-dominant`
- `0.2 beat`境界付近のMIDI量子化差は、Holdoutを見た後の調整になるため
  今回は変更せず、次Phaseの事前登録課題として扱う

## 15. 最終結論

弱いharmony supportを扱うA/B両仮説はDevで明確な改善を示し、A1は
Validationでも再現した。しかしHoldoutでは固定duration条件により再現せず、
完成条件を満たさない。よってP4.4.2は**正常な非昇格**として終了する。
