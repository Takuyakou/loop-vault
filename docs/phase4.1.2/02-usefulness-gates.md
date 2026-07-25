# Loop Vault Phase 4.1.2 — A2 有用性指標とHard Gate

- 作成日: 2026-07-25
- 製品コード変更: **なし**
- 実行: `npx vite-node scripts/check-usefulness-gates.ts`

Gateは**B〜Eを1行も書く前に凍結する**。結果に合わせて基準を動かさないため、baselineも同時に記録する。

```bash
npx vite-node scripts/check-usefulness-gates.ts
```

既定の対象は Synthetic Gold Corpus v1（dev + validation）と Long-form Corpus v1.1（dev + validation）の **56 file評価**。holdout / holdout-v2 は含めない。

---

## 1. 追加した指標13種

| 指標 | 定義 | なぜ必要か |
|---|---|---|
| `mustShowGeneratedRecall` | must-showブロックのうち生成された割合 | 生成の損失を分離する |
| `mustShowSelectedRecallAmongGenerated` | **生成されたもののうち**選定された割合 | 生成できない窓の責任を選定に負わせない（L04の14小節はStage Eの問題） |
| `rankConstraintGroupSatisfaction` | priorityGroupごとの top3MinHits / allVisibleMinHits / 順序の充足 | A0で移行した契約の判定 |
| `visiblePatternDuplicateCount` | 同一patternIdが2枚目以降で消費した枠数 | **goldに依存しない**。gold未列挙のPattern同士の重複も捉える |
| `visibleSlotWasteCount` | 同上（枠の観点） | 上と同値。別名で報告する |
| `uniquePatternCountAt3` | 上位3枚の異なるPattern数 | 3枠が何種類を提示できているか |
| `uniquePatternCountAt10` | 上位10枚の異なるPattern数 | 同上 |
| `progressionPrecisionAt3` | 上位3枚のうちprogressionの割合 | 「使えそうな進行」が主レーンに出ているか |
| `twoBarFragmentsInTop3` | 上位3枚の2小節断片数 | 短断片が上位を占めていないか |
| `occurrenceReachability` | 表示Patternの全Occurrenceへ到達できる割合 | カード1枚から他の出現へ行けるか |
| `eventCountRatio` | **両側を連続同一コードで畳んだ**イベント数比 | 境界指標が見られない過統合・過分割を捉える |
| `boundaryPrecision` | セクション境界の適合率 | 記述的 |
| `boundaryRecall` | セクション境界の再現率 | 記述的 |
| `segmentIoU` | goldセクションごとの最良一致IoUの平均 | 記述的 |

### 1.1 `eventCountRatio` は両側を畳む

3度作り直した指標である。記録しておく。

| 版 | L06（ワンコードvamp96小節）の値 | 問題 |
|---|---:|---|
| 生のgold分母 | **0.0417** | 4小節ホールドを1イベントへ統合する意図された動作を「壊滅的損失」と読む |
| goldのみ畳む | **96** | 逆に製品側の細分化を全部数える |
| **両側を畳む** | 1〜96（実測） | **コード変化の数が一致しているか**だけを測る |

両側を畳んだ形が正しい。連続同一コードのマージは仕様であり、測りたいのは「同じ数のコード変化を見つけたか」だけである。

---

## 2. Hard Gate（凍結）

| # | Gate | 基準 | baseline |
|---|---|---|---|
| 1 | `visible-pattern-duplicate-count-zero` | = 0 | **38/56 FAIL** |
| 2 | `visible-slot-waste-zero` | = 0 | **38/56 FAIL** |
| 3 | `occurrence-reachability-full` | = 100% | **55/56 FAIL** |
| 4 | `progression-precision-at-3` | progression 3 Pattern以上なら = 100% | **39/56 FAIL** |
| 5 | `no-two-bar-fragment-in-top3` | progression 3 Pattern以上なら = 0 | **40/56 FAIL** |
| 6 | `rank-constraint-top3-min-hits` | 全group充足 | **28/56 FAIL** |
| 7 | `rank-constraint-all-visible-min-hits` | 全group充足 | **23/56 FAIL** |
| 8 | `rank-constraint-order` | afterGroupの順序を守る | 56/56 PASS |
| 9 | `coverage-at-all-visible` | ≥ 90%（**Phase 4.1から変更なし**） | **52/56 FAIL** |
| 10 | `longest-uncovered-run` | < 8小節（**Phase 4.1から変更なし**） | **55/56 FAIL** |
| 11 | `runtime-ceiling` | ≤ 3000 ms | 56/56 PASS |
| 12 | `deterministic` | 再実行で同一カード | PASS |
| 13 | `chord-corpus-non-regression` | Chord Drip / Chapter 3 非退行 | 別スクリプトで判定 |

**総合 baseline: FAIL。** 13項目のうち8項目が落ちている。

### 2.1 既存coverage Gateは緩和しない

Gate 9 / 10 は Phase 4.1 のものをそのまま持ち込んでいる。**現時点で既に落ちている**（新コーパスに対して 52/56、55/56）。緩和せず、B〜E後に通すべき対象として扱う。被覆を犠牲にして有用性を買うことはしない。

### 2.2 `eventCountRatio` はGateにしない

指標としては記録するが Hard Gate には入れない。指示のGate一覧に含まれていないこと、そして現状値の意味（下記§3.2）がまだ確定していないことの両方が理由である。まず測り、基準は後で決める。

---

## 3. Baseline 指標（phase4.1-v1、56 file評価）

| 指標 | min | mean | max |
|---|---:|---:|---:|
| mustShowGeneratedRecall | 0.1667 | 0.9702 | 1 |
| **mustShowSelectedRecallAmongGenerated** | **0** | **0.4269** | 1 |
| **visiblePatternDuplicateCount** | 0 | **1.3214** | **8** |
| visibleSlotWasteCount | 0 | 1.3214 | 8 |
| **uniquePatternCountAt3** | **1** | **1.4821** | 3 |
| uniquePatternCountAt10 | 1 | 2.6071 | 10 |
| progressionPrecisionAt3 | 0 | 0.7887 | 1 |
| twoBarFragmentsInTop3 | 0 | 0.5536 | 3 |
| occurrenceReachability | 0.5714 | 0.9923 | 1 |
| eventCountRatio | 0.8182 | 2.8070 | **96** |
| boundaryPrecision | 0 | 0.2695 | 1 |
| boundaryRecall | 0 | 0.4188 | 1 |
| segmentIoU | 0.25 | 0.6810 | 1 |
| allCandidateCoverage | 0.5969 | 0.9739 | 1 |
| progressionCandidateCoverage | 0 | 0.9203 | 1 |
| runtimeMs | 11.1 | 78.9 | 311.5 |

### 3.1 `uniquePatternCountAt3` の mean 1.48 が本質

3枠あるのに平均1.48種類しか提示できていない。原因は2つが重なっている:

- **早期停止**で候補が1〜2件しか出ないファイルがある（枠が埋まらない）
- **Pattern重複**で3枠が1〜2種類に潰れるファイルがある

`mustShowSelectedRecallAmongGenerated` の mean 0.4269 が示すのは、**生成できた期待ブロックのうち6割弱が選定に到達していない**こと。生成の制限（L04の14/18/20小節）を除いた純粋な選定の損失である。

### 3.2 `eventCountRatio max 96` は L06_stress

ワンコードvamp96小節に arpeggiated + fragmented + ghost-notes をかけた変種で、gold のコード変化2回に対し製品が192回の変化を出している。

アルペジオでは2拍窓に和音の1〜2音しか鳴らないため、窓ごとに別のコードが最良一致になる。**これはTimelineの堅牢性の問題であり、B〜Eの対象ではない。** Stage F（別PR・別Gate）で扱う。clean変種では起きない（clean/stress metamorphic failure）。

B〜E でこの値を「直そうとしてはいけない」。選定の修正と混ぜると原因が絞れなくなる。

---

## 4. Gate違反ファイル（baseline、抜粋）

| Gate | 主な違反 |
|---|---|
| 重複 | S12_stress, S16_clean/stress, L01_clean/stress, L02_clean/stress, L04_stress, L05_clean/stress, L06_clean/stress, L12_clean |
| progressionPrecisionAt3 | S08_clean, S16_clean/stress, S17_clean/stress, L01_clean/stress, L02_clean, L04_stress, L05_clean/stress, L06_clean |
| top3MinHits | S08, S11, S14, S15, S16, S17 …（28/56のみ通過） |
| allVisibleMinHits | S08, S11, S12, S13, S14, S15 …（23/56のみ通過） |
| occurrenceReachability | L10_stress のみ |
| coverage ≥ 90% | S16_clean, L01_stress, L05_stress, L12_clean |
| longestUncoveredRun < 8 | L05_stress のみ |

---

## 5. 方針

```text
gatesFrozenBeforeImplementation : true
coverageGatesRelaxed            : false
eventCountRatioGated            : false（指標のみ）
holdoutIncluded                 : false
```

B〜E の各PRはこのGateに対して測る。**基準は動かさない。** 未達のGateが残る場合は既定を `phase4-v1` のまま維持する。

---

## 成果物

```text
docs/phase4.1.2/02-usefulness-gates.md            本書
docs/phase4.1.2/02-usefulness-gates.json          Gate定義（凍結）
docs/phase4.1.2/02-usefulness-gate-baseline.json  修正前baseline（56 file評価）
docs/phase4.1.2/02-usefulness-gate-check.json     最新実行結果
scripts/check-usefulness-gates.ts                 Gate判定
```
