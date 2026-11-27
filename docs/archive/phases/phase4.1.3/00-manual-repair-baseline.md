# Loop Vault P4.1.3-M0 — 現状監査と修正コスト baseline

- 作成日: 2026-07-26
- **製品コード変更: なし**
- 対象: holdout-v3 16 + Long-form v1.1 24 + Synthetic Gold v1 48 = **88ファイル**
- Analyzer: `phase4.1.2-v1`（Catalogを持つモード。既定は `phase4-v1` のまま）
- 出力: `00-manual-repair-baseline.json`

---

## 0. 結論

| 指標 | 結果 |
|---|---|
| 自動候補と完全一致しない must-show 区間 | **10件**（88ファイル中） |
| そのうち **必要なコードが Full Timeline に全部そろっている** | **9/10** |
| **現行UIで修正可能** | **0/10** |
| 範囲選択があれば2操作以内で作れる | **9/10** |
| 範囲選択の平均操作数 | **1.5** |
| 境界ドラッグの平均操作数 | 3.9 |
| 最近傍候補との bar IoU の最大値 | 0.954545（**1.0 は一度も無い**） |

**素材は足りている。足りていないのは「どの小節から どの小節まで」をユーザーが言う手段である。**

---

## 1. 何を測ったか

「19小節」「22小節」という長さをハードコードしていない。区間は**発見**している:

> must-show ブロックのうち、Catalog の occurrence に完全一致するものが1件も無いもの

この条件で3コーパス88ファイルを走査した結果が10件で、うち4件が H4 で FAIL した H3 の2区間（clean/stress）である。残り6件は Synthetic Gold v1 にあり、**H3 特有の問題ではない**ことがわかる。Long-form v1.1 は0件だった（H4 で `must-show-catalog-recall` が 24/24 PASS だったことと一致する）。

holdout-v3 の Gold へ製品ロジックを合わせてはいない。この監査は製品を1行も変えていない。

---

## 2. 区間ごとの測定結果

| コーパス | 区間 | 小節 | 長さ | Timeline完備 | 最近傍候補 | IoU | 境界差 | 現行UI | 境界ドラッグ | 範囲選択 |
|---|---|---|---|---|---|---|---|---|---|---|
| holdout-v3 | H3_clean sec2 | 14–32 | 19 | **yes** | 13–32 | 0.950 | 1小節 | **不可能** | 2操作 | **1操作** |
| holdout-v3 | H3_clean sec6 | 87–108 | 22 | **yes** | 87–107 | 0.955 | 1小節 | **不可能** | 2操作 | **1操作** |
| holdout-v3 | H3_stress sec2 | 14–32 | 19 | **yes** | 13–32 | 0.950 | 1小節 | **不可能** | 2操作 | **1操作** |
| holdout-v3 | H3_stress sec6 | 87–108 | 22 | **yes** | 87–107 | 0.955 | 1小節 | **不可能** | 2操作 | **1操作** |
| SGC v1 | S14_clean b2 | 5–8 | 4 | **yes** | 4–8 | 0.800 | 1小節 | **不可能** | 2操作 | **1操作** |
| SGC v1 | S16_clean verse | 5–12 | 8 | **yes** | 2–8 | 0.364 | 7小節 | **不可能** | 6操作 | **1操作** |
| SGC v1 | S16_clean chorus1 | 13–20 | 8 | **yes** | 13–16 | 0.500 | 4小節 | **不可能** | 5操作 | **1操作** |
| SGC v1 | S16_clean chorus2 | 25–32 | 8 | **yes** | 25–28 | 0.500 | 4小節 | **不可能** | 5操作 | **1操作** |
| SGC v1 | S16_stress verse | 5–12 | 8 | **yes** | 2–12 | 0.727 | 3小節 | **不可能** | 4操作 | **1操作** |
| SGC v1 | S24_stress sec6 | 81–100 | 20 | **NO（1種不足）** | 81–96 | 0.800 | 4小節 | **不可能** | 9操作 | 6操作 |

### 各列の意味

- **Timeline完備** (`timelineSourceComplete`) — その区間の Gold コードがすべて Full Timeline 上に（綴りではなく識別子として）存在するか。**これが最初に確定すべきこと**で、`no` なら範囲選択をいくら作っても足りない。
- **最近傍候補** (`nearestCandidateBarIoU`) — Catalog 内の全 occurrence のうち、その区間と小節 IoU が最大のもの。
- **境界差** (`boundaryAdjustmentBars`) — 開始差 + 終了差の絶対値。
- **現行UI** (`repairableWithCurrentUi`) — 現行UIで作れるか。IoU 1.0 の候補が無ければ**作れない**（後述）。
- **境界ドラッグ** — 「自動候補の端をドラッグできるようにする」設計にした場合の操作数。境界操作 + 候補由来のコード編集。
- **範囲選択** (`manualRangeOperationCount`) — 「Full Timeline から範囲を選ぶ」設計にした場合の操作数。範囲選択1 + Timeline由来のコード編集。

---

## 3. 現行UIでは 0/10 が「不可能」

「難しい」ではなく**表現できない**。

現行UIにあるもの（`src/domain/progressionEditing/`）:

| 操作 | 有無 | 場所 |
|---|---|---|
| コードの置き換え | あり | `chordReplacement.ts` → `QuickChordEditor` / `ChordInspector` |
| コードの後ろに挿入 | あり | `splitMerge.ts: insertSuggestedEditableChordAfter` |
| コードの削除 | あり | `splitMerge.ts: deleteEditableChord` |
| コードの分割 | あり | `splitMerge.ts: splitEditableChord` |
| コードの結合 | あり | `splitMerge.ts: mergeEditableChords` |
| Undo / Redo | あり | `editHistory.ts` |
| **任意範囲からの候補作成** | **なし** | — |
| **既存候補の境界移動** | **なし** | — |

`CaptureView` の Full Timeline セクション（`src/views/CaptureView.tsx:1023` 付近）にあるのは「全体を試聴する」と「1コードをクリックして試聴する」だけで、範囲の概念そのものが無い。候補は固定された `startBar` / `endBar` を持って現れ、それを動かす経路がない。

**コード編集は充実しているのに、どの小節を編集対象にするかを言えない。** これが 0/10 の理由である。

---

## 4. 素材は足りている — 9/10 で Timeline 完備

これが M0 の中心的な発見である。

H3 の4区間では、Full Timeline のイベント数が Gold のコード数と**完全に一致**している:

| 区間 | Gold コード数 | Timeline イベント数 | 不足 |
|---|---|---|---|
| H3_clean sec2 (14–32) | 19 | 19 | 0 |
| H3_clean sec6 (87–108) | 22 | 22 | 0 |
| H3_stress sec2 | 19 | 19 | 0 |
| H3_stress sec6 | 22 | 22 | 0 |

**検出は成功している。** H4 で FAIL した `must-show-catalog-recall` は、19小節・22小節という長さの窓が生成されなかっただけで、コードそのものは全部 Timeline に載っている。ユーザーが「14小節目から32小節目まで」と言えれば、そこから正しいブロックがそのまま作れる。

### 唯一の例外: S24_stress sec6

```
Gold     : Cmaj9 A7#5 Dm9 G13 …（5回繰り返し）
Timeline : Cmaj9 A7   Dm9 G13 …（5回繰り返し）
```

`A7#5` が `A7` として検出されている（増五度を取れていない）。これは**検出の限界であって選択の問題ではない**。範囲選択だけでは直らず、既存のコード置換で5箇所直す必要がある（合計6操作）。

**手動救済は検出の代わりにはならない。** ただしこの場合も、範囲選択があれば「範囲を作る → 既存のコード編集で5箇所直す」で到達できる。現行UIでは範囲が作れないので、そもそも着手できない。

---

## 5. 二つの設計の比較

| | 境界ドラッグ | 範囲選択 |
|---|---|---|
| 平均操作数 | **3.9** | **1.5** |
| 最悪 | 9操作（S24_stress） | 6操作（S24_stress） |
| 2操作以内 | 4/10 | **9/10** |
| 出発点 | 最近傍の自動候補 | Full Timeline |
| 継承する誤り | 候補の余分・不足コード（最大4件） | なし |

境界ドラッグが不利なのは、**間違った窓から出発するとその窓の誤りまで引き継ぐ**ためである。S16_clean chorus1 は候補が 13–16（4小節）で Gold が 13–20（8小節）なので、端を動かしたうえで4つのコードを足すことになる。Full Timeline から 13–20 を選べば、その4つは最初からそこにある。

**M1 の `createCandidateFromTimelineRange` は範囲選択側の設計**であり、この測定がそれを支持する。

---

## 6. 指標の定義（再現可能性のため）

| 指標 | 定義 |
|---|---|
| `nearestCandidateBarIoU` | Catalog 全 occurrence に対する `overlapBars / unionBars` の最大値 |
| `boundaryAdjustmentBars` | `abs(候補start − gold start) + abs(候補end − gold end)` |
| `boundaryOperationCount` | 開始がずれていれば1、終了がずれていれば1（最大2） |
| `missingChordEventCount` | 最近傍候補の系列 → Gold 系列 の挿入数 |
| `extraChordEventCount` | 同 削除数 |
| `replacementChordCount` | 同 置換数 |
| `rangeMissing/Extra/ReplacementChordCount` | Timeline 範囲の系列 → Gold 系列 の挿入・削除・置換数 |
| `splitMergeCount` | `abs(Timelineイベント数 − Goldコード数)`（連続重複を畳んだ後） |
| `manualRepairOperationCount` | 現行UIでの操作数。IoU が 1.0 でなければ **null**（不可能） |
| `boundaryMoveOperationCount` | `boundaryOperationCount` + 候補由来のコード編集数 |
| `manualRangeOperationCount` | 1（範囲選択） + Timeline由来のコード編集数 |
| `timelineSourceComplete` | Gold の全コード識別子が Full Timeline の範囲内に存在するか |
| `repairableWithCurrentUi` | `nearestCandidateBarIoU === 1` |
| `repairableWithin2Edits` / `5Edits` | `manualRangeOperationCount <= 2` / `<= 5` |

コードの同一判定は綴りに依存しない `chordIdentityKey`（製品の `src/domain/chordIdentity.ts`）で行い、Gold 側の綴り（`A7#5`、`D11(no3)`）は既存の `parseGoldLabel` で読む。連続する同一コードは、検出器が意図的に併合するため畳んでから比較する。

### 測定の訂正

最初の実装では `manualRangeOperationCount` を**最近傍候補**基準のコード編集数で計算していたため、H3 の4区間が 1操作ではなく2操作と出ていた。範囲選択はコードを Timeline から取るので候補の誤りを継承しない。両方の基準を別々に記録する形へ直した（`rangeMissing/Extra/ReplacementChordCount` を追加）。

---

## 7. M1 への引き渡し

M0 が確定させたこと:

1. **必要なコードは Full Timeline に既にある**（9/10）。範囲を切り出せれば足りる。
2. **現行UIには範囲を言う手段が無い**（0/10 が表現不能）。これが唯一の欠落である。
3. **範囲選択は境界ドラッグより安い**（1.5 対 3.9 操作）。M1 は範囲選択側で進める。
4. **手動救済は検出の代わりではない**（S24_stress）。コードが間違って検出されている場合は既存のコード編集が必要で、それは既にある。

M1 では `createCandidateFromTimelineRange` を純関数として追加し、非永続の `CandidateOccurrence` を返す。この段階では UI にも保存にも触れない。
