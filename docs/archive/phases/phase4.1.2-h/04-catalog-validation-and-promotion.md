# Loop Vault P4.1.2-H4 — Catalog検証・holdout-v3・段階昇格判断

**結論: Catalog Hard Gate は 13/14 通過、1件 FAIL。凍結済みの昇格条件（全通過）を満たさないため、Candidate Catalog v1 の段階昇格は行わない。`defaultAnalyzerMode` は `phase4-v1` のまま。**

FAIL した1件の原因は Catalog ではなく Stage E の窓生成にある。Catalog は生成された候補を1件も落としていない（到達率 16/16 ファイルで 100%）。

---

## 1. 凍結（holdout-v3 生成前）

holdout-v3 を作る前に、以下をすべて固定した。

| 対象 | 固定内容 | 場所 |
|---|---|---|
| Catalog契約 | 14 Hard Gate + 6 Critical Guard | `00-catalog-hard-gates.json`（H0で凍結） |
| Recommendation目標 | 10目標 + 回帰下限 + 件数契約 | `00-recommendation-targets.json`（H0で凍結） |
| Catalog実装 | `candidateCatalog.ts` v1、品質フロア 0.35 | PR #192 |
| Recommendation実装 | `candidateRecommendation.ts` v1、cap 10、score係数 0.38/0.24/0.10/0.28 | PR #193 |
| UI実装 | `catalogView.ts`、`catalogPageSize = 25` | PR #194 |
| baseline | `phase4.1.2-v1` | `00-recommendation-baseline.json` |

**holdout-v3 を見てから変更したもの: なし。** Gold、Gate、Pattern identity、Recommendationルール、score、分類のいずれにも触れていない。

---

## 2. holdout-v3 コーパス

8シナリオ × clean/stress = **16 MIDI**。Long-form v1.1 とは別の調・別の区間長・別の配置で作り、チューニングに一度も使っていない。

| ID | 題材 | 小節 | BPM |
|---|---|---|---|
| H1 | 繰り返しvamp + 4つの異なる進行 | 128 | 94 |
| H2 | 4/8/16小節の入れ子 | 128 | 102 |
| H3 | 2の冪でない区間（13/19/21/16/17/22小節） | 108 | 86 |
| H4 | ルートレス + ウォーキングベース | 96 | 138 |
| H5 | アルペジオからの抽出 | 112 | 116 |
| H6 | 人間的なずれと重なり | 112 | 78 |
| H7 | 移調された繰り返し（4つの調） | 104 | 106 |
| H8 | 長い中間セクション | 160 | 90 |

生成器: `scripts/holdoutV3Scenarios.ts` / `scripts/generate-holdout-v3.ts`
指紋: `04-holdout-v3-corpus.json`（MIDI本体は `.local-evaluation/holdout-v3`、Gitへは入れない）

**実行は1回のみ。** 結果: `04-holdout-v3-results.json`

---

## 3. Catalog Hard Gate 結果（holdout-v3、16ファイル）

| Gate | 結果 | 詳細 |
|---|---|---|
| valid-pattern-reachability | PASS | 16/16 |
| paged-pattern-reachability | PASS | 16/16（ページ送りで末尾まで到達） |
| occurrence-reachability | PASS | 16/16 |
| visible-pattern-duplicate-count | PASS | 16/16（すべて0） |
| visible-slot-waste-count | PASS | 16/16（すべて0） |
| exact-duplicate-count | PASS | 16/16（すべて0） |
| **must-show-catalog-recall** | **FAIL** | **14/16（H3_clean, H3_stress）** |
| preview-reachability | PASS | 16/16 |
| save-reachability | PASS | 16/16 |
| deterministic | PASS | 16/16（3回同一） |
| analysis-runtime | PASS | 16/16（最大 190.8 ms、上限 3000 ms） |
| no-padding | PASS | 16/16（paddingCount すべて0） |
| chord-corpus-non-regression | PASS | Chord Drip 100/100 一致 |
| file-version / save-schema | PASS | `schema.ts` / `repository.ts` は master から無変更、`fileVersion` は 1 のまま |

**総合: FAIL（1件）。**

### 3.1 FAIL の原因

H3 の6区間のうち2区間（sec2 = 19小節、sec6 = 22小節）に、ちょうど一致する窓が候補プールに存在しない。

`scripts/probe-holdout-h3-recall.ts`（読み取り専用の診断、製品ロジック非変更）:

```
検出された区間: [1,30] [31,51] [52,55] [56,67] [68,71] [72,84] [85,88] [89,108]

Catalog内に存在する窓長: 2, 3, 4, 8, 12, 13, 16, 17, 20, 21, 23, 24, 25, 29, 30

gold区間      長さ  一致
sec1   1-13   13    あり
sec2  14-32   19    なし   ← 19小節の窓がどの開始位置にも存在しない
sec3  33-53   21    あり
sec4  54-69   16    あり
sec5  70-86   17    あり
sec6  87-108  22    なし   ← 22小節の窓が存在しない
```

Stage E の `derived-length` 生成器は、**セグメンタが検出した区間長とその連結長**を候補長として使う（`structuralWindows.ts`）。H3ではセグメンタの境界が実際の区間とずれており、19 と 22 が候補長リストに一度も入らない。したがって窓が作られず、Catalog に入りようがない。

**これは Catalog の欠落ではない。** Catalog は生成された候補を1件も落としていない（`unreachablePatternCount` 0、到達率100%）。生成段階（Stage E）の限界であり、H0〜H3 で持ち込んだものではない。

Long-form v1.1（チューニング用24ファイル）では同じ Gate が 24/24 PASS だった。**このコーパスに19小節・22小節の must-show 区間が無かったからで、holdout がまさにそれを見つけた。** チューニングセットが覆っていなかった穴が出た、という holdout の本来の働き方である。

### 3.2 なぜ Gate を読み替えなかったか

「the generator produced」を「窓生成器が作った」と読めば、作られなかった2区間は Gate の対象外となり PASS になる。H0 の凍結文書は、コーパス生成器を一貫して "generator" と呼んでいる（A1マニフェスト「One generator produced both the audio and the labels」）ため、gold ブロックを指すと読むのが素直である。

いずれにせよ、**結果を見てから解釈を変えれば凍結の意味が消える。** 厳しい方の読みで FAIL と記録する。

---

## 4. Critical Guard 6件（実MIDI含む）

`scripts/check-catalog-critical-guards.ts` → `04-critical-guards.json`

| Guard | 結果 | 観測 |
|---|---|---|
| clean-8bar-single-progression-no-padding | PASS | S01_clean: 推薦 **1件**、padding 0、重複0 |
| two-distinct-progressions-exactly-two | PASS | S11_clean は「進行1 + vamp1」なので **順位側**の証拠（推薦1件、padding 0、上位は progression）。**件数側**（eligible が2件なら2件だけ推薦する）は入力を厳密に構成できる `catalogView.test.ts` / `candidateRecommendation.test.ts` で検証 |
| zero-eligible-hides-recommendation | PASS | L06_stress: eligible 0 → **推薦欄は非表示**、uncertainレーンに46件が残る |
| one-pattern-four-occurrences | PASS | S12_clean: 最大パターンが **8 occurrence を1カードで保持**、重複0 |
| endless-em11a | PASS | Endless: Catalog 1777、重複0、**top3 はすべて progression（16/17/20小節）** |
| no-low-quality-padding | PASS | 観測7ファイルすべて paddingCount 0 |

**Endless の元の不具合（Em11/A の2小節vampが上位3枠を占有）は再現しない。** vampはCatalogに残ったまま、上位には出ない。

---

## 5. 推薦件数の分布（件数が固定でないことの証拠）

| ファイル | Catalog パターン数 | 推薦件数 | 停止理由 |
|---|---|---|---|
| Chapter 3 seed（5小節） | 7 | **2** | all-eligible-used |
| S01_clean（8小節） | 11 | **1** | — |
| S11_clean（16小節） | 54 | **1** | — |
| S12_clean（32小節） | 22 | **3** | — |
| L06_stress（96小節、vamp/uncertainのみ） | 46 | **0** | no-eligible-pattern |
| L06_clean | 47 | **1** | — |
| holdout-v3 全16ファイル | 218〜1052 | **10** | display-cap |
| Endless（154小節） | 1777 | 10 | display-cap |
| SURAN（100小節） | 1352 | 10 | display-cap |

0件・1件・2件・3件・10件がすべて出ている。10件は上限に当たったときだけで、**水増しは1件もない（paddingCount は全ファイル0）**。

---

## 6. Catalog 保持件数と到達率

| ファイル | Catalog | prog | vamp | frag | uncertain | 到達率 |
|---|---|---|---|---|---|---|
| Endless | 1777 | 1167 | 2 | 113 | 495 | 100% |
| SURAN | 1352 | 1102 | 0 | 134 | 116 | 100% |
| H5_stress | 1052 | 823 | 0 | 21 | 208 | 100% |
| H3_clean | 974 | 928 | 0 | 46 | 0 | 100% |
| L06_stress | 46 | 0 | 0 | 0 | 46 | 100% |

Endless の 1777 パターンは、以前なら10枠に切り詰められて 1767 が消えていた。いまは全件が Catalog に残り、レーンとページ送りで全件に到達できる（`paged-pattern-reachability` 16/16）。

---

## 7. 性能

| 指標 | 値 |
|---|---|
| 解析 runtime（holdout-v3 16ファイル） | min 88.7 / mean 143.1 / **max 190.8 ms**（上限 3000） |
| CatalogView 構築 | min 0.07 / mean 0.16 / **max 0.54 ms** |
| Endless（1777パターン）の解析 | 266.9 ms |
| 初回描画カード数 | **25**（`catalogPageSize`、Catalog規模に依存しない） |
| 最大レーンを末尾まで開くページ数 | 43 |

1777 パターンでも DOM に一度に載るのは1ページ25枚。**表示上限とCatalog保持件数を切り離したので、性能のために候補を捨てる必要がなくなった。**

---

## 8. Recommendation Quality Target（測定のみ、昇格条件ではない）

holdout-v3 16ファイル:

| 指標 | n | min | mean | max | 回帰下限 | 判定 |
|---|---|---|---|---|---|---|
| progressionPrecisionAt3 | 16 | 1.0 | **1.0** | 1.0 | ≥ 0.95 | OK |
| twoBarFragmentsInTop3 | 16 | 0 | **0** | 0 | ≤ 0 | OK |
| cleanStressAgreement | 8 | 0 | **0.357** | 1.0 | ≥ 0.65 | **未達** |
| mustShowRecommendedRecall | 16 | 0 | 0.104 | 1.0 | （下限なし） | 低い |
| patternDiversity | 16 | 1.0 | **1.0** | 1.0 | — | OK |
| temporalDiversity | 16 | 0.2 | 0.55 | 0.8 | — | — |
| paddingCount | 16 | 0 | **0** | 0 | = 0 | OK |

`cleanStressAgreement` と `mustShowRecommendedRecall` は低い。数百の progression から10件を選ぶ以上、gold の6区間が上位10件に入る保証はなく、stress版で順位が入れ替わるのも当然である。**これは Recommendation の順位品質の問題であり、H の設計はまさにそれを昇格条件から外している** — 順位を外しても候補は Catalog に残り、レーンから到達できる。

`00-recommendation-targets.json` の回帰下限のうち `cleanStressAgreement` が未達なので、**Recommendation v1 を既定の唯一の提示手段にはしない**。Catalog レーンと併置する現在の形（H3 の実装）を維持する。

---

## 9. 昇格判断

凍結済みの条件:

> Catalog Hard Gate 全通過かつ重大回帰なしの場合、Candidate Catalog v1 を段階昇格する。

**全通過していない（`must-show-catalog-recall` 14/16）ため、段階昇格は行わない。**

| 項目 | 判断 |
|---|---|
| `defaultAnalyzerMode` | **`phase4-v1` のまま**（変更なし） |
| Candidate Catalog v1 | **昇格しない**。`phase4.1.2-v1` 系のモードで opt-in のまま |
| Recommendation | 単段方式のまま。G2（two-pass）は opt-in のまま |
| Stage F | **未着手のまま** |
| `phase4.1-v1` | 削除していない |

### 9.1 昇格を再判定する条件

1. Stage E の `derived-length` 生成器が、セグメンタの境界がずれた場合でも実在する区間長を候補にできるようにする（Stage F の範囲）。
2. その修正は **Long-form v1.1（dev/validation）だけで**開発・検証する。
3. 修正後に holdout-v3 をもう一度だけ実行する。**これは2回目の実行なので、holdout としての価値はその分下がる**ことを明記した上で行う。
4. 14 Gate 全通過なら段階昇格を再提案する。

holdout-v3 のコーパス自体（`04-holdout-v3-corpus.json` の指紋）は変更しない。

---

## 10. 回帰していないことの確認

| 対象 | 結果 |
|---|---|
| Chord Drip fullTimeline（`phase4-v1` vs `phase4.1.2-v1`） | **100/100 完全一致**（`04-timeline-non-regression.json`） |
| 保存スキーマ / `fileVersion` | master から無変更、`fileVersion` は 1 |
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm test -- --run` | **1282 passed / 169 files** |
| `npm run build` | PASS |
| `cargo test` | PASS |
| クラッシュ・データ破損 | 0 |

---

## 11. 成果物

```
scripts/holdoutV3Scenarios.ts             holdout-v3 8シナリオ
scripts/generate-holdout-v3.ts            16 MIDI 生成
scripts/evaluate-catalog-holdout.ts       Catalog Hard Gate 評価
scripts/check-catalog-critical-guards.ts  Critical Guard 6件
scripts/probe-holdout-h3-recall.ts        FAIL原因の読み取り専用診断
docs/phase4.1.2-h/04-holdout-v3-corpus.json        指紋16件
docs/phase4.1.2-h/04-holdout-v3-results.json       1回だけの実行結果
docs/phase4.1.2-h/04-critical-guards.json          Guard結果
docs/phase4.1.2-h/04-timeline-non-regression.json  100/100
```

`scripts/longFormCorpus.ts` は `split` に `"holdout-v3"` を足しただけ、`scripts/verify-timeline-non-regression.ts` は出力先を `--output` で選べるようにしただけで、いずれも既存の挙動を変えていない。

---

## 12. rollback

このPRは製品の既定を何も変えていない（`defaultAnalyzerMode` は `phase4-v1` のまま）。取り消す場合はマージコミットを revert すれば足りる。評価用スクリプトとドキュメントのみが消える。
