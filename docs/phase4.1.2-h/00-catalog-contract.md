# Loop Vault P4.1.2-H0 — Catalog契約とRecommendation目標の分離

- 作成日: 2026-07-26
- 製品ロジック変更: **なし**
- 既定Analyzer: `phase4-v1`（変更なし）
- Stage F: 未着手

---

## 1. なぜ分けるのか

A〜E と G0〜G2 で、次が確定した。

| 事実 | 出典 |
|---|---|
| rank failure の **93.5% が `not-selected`** | G0 taxonomy |
| プールから安全に削除できる候補は **3978件中0件** | G1 |
| 二段階Selectorは **4構成すべてで単段より悪い** | G2 |
| core は順位に強く、full は生成・被覆に強い。**どちらも他方を支配しない** | G0 ablation |

つまり、**推薦順位は未解決のままである**。そして推薦順位が未解決であることを理由に、生成済みの有効候補を10枠へ絞って残りを消す設計を続けると、ユーザーは正しく生成された候補へ永久に到達できない。

そこで契約を2つに割る。

```text
Candidate Catalog   安全性・到達可能性・非重複   → Hard Gate（全通過必須）
Recommendation      初期表示順の品質            → 改善目標（100%は昇格条件にしない）
```

**推薦アルゴリズムの100点到達を、Catalogの昇格条件にしない。** 安全網を、順位問題の人質にしない。

---

## 2. 製品構造の変更（H1以降で実装）

```text
従来:
  候補生成 → 選定 → 選ばれなかった候補はUIから消える

変更後:
  候補生成 → Pattern単位へ統合 → Candidate Catalog（全件保持）
                                    ├─ 推薦順位（非破壊な参照）
                                    ├─ すべての進行
                                    ├─ ワンコード／ヴァンプ
                                    ├─ その他の断片
                                    └─ 判定保留
```

Recommendation は Pattern を**所有しない**。推薦から外れても Catalog から消えない。

---

## 3. Catalog Hard Gate（凍結・緩和しない）

`00-catalog-hard-gates.json` に凍結した14項目。要点のみ:

| Gate | 条件 |
|---|---|
| `validPatternReachability` | 100% |
| `occurrenceReachability` | 100% |
| `visiblePatternDuplicateCount` | 0 |
| `visibleSlotWasteCount` | 0 |
| `exactDuplicateCount` | 0 |
| `mustShowCatalogRecall` | 100%（**順位ではなく在庫**） |
| `previewReachability` / `saveReachability` | 100% |
| `chordCorpusNonRegression` | 100/100 |
| `deterministic` | 3回一致 |
| `fileVersion` / 保存schema | 不変 |
| analysis runtime | ≤ 3000 ms |
| クラッシュ・データ破壊 | 0 |

`mustShowCatalogRecall` が「在庫」であることが要点である。**100番目に並んでいてもPASS**。順位は Recommendation の話であってCatalogの話ではない。

### 3.1 Recommendation Critical Guards

推薦品質を100%要求しないが、既知の重大UX不具合は再発させない。6項目を `criticalGuards` として凍結した。

1. clean 8-bar / progression 1件 → Catalog 1・推薦1・カード1・**padding 0**
2. distinct progression 2件 → 推薦2・padding 0
3. eligible 0件 → **おすすめ欄を非表示**、vamp/fragment/uncertain は各レーンへ残す
4. 同一Pattern 4 Occurrence → Catalog 1カード・Occurrence 4・推薦枠は最大1
5. Endless → `Em11/A` は1カード＋全Occurrence、重複なし、progression 3件以上なら2小節vampがTop 3を占領しない、**vampはCatalogから消さない**
6. 低品質候補による件数padding → 0件

---

## 4. 推薦件数の契約

```ts
recommendedCount = Math.min(recommendationDisplayCap, eligibleDistinctPatterns.length)
```

**`recommendationDisplayCap` は最大表示数であり、目標件数ではない。**

禁止:

- cap まで必ず埋める
- 同一Patternでpadding
- 低品質候補でpadding
- fragmentでpadding
- 同じ進行の部分窓を件数合わせに使う

期待:

| 状況 | 推薦 | Catalog |
|---|---|---|
| distinct progression 1件 | **1件** | 1 Pattern |
| distinct progression 4件 | **4件** | 4 Pattern |
| distinct progression 0件 | **おすすめ欄を非表示** | vamp/fragment/uncertain は残る |
| distinct progression 200件 | cap以内 | **200件すべて到達可能** |

Catalog の Pattern 数が cap 以下なら、「おすすめ」と「すべての候補」を分けず**単一の「候補 N件」一覧へ統合してよい**。「おすすめ1件」「すべて1件」という重複UIを作らない。

---

## 5. Recommendation Quality Target（改善目標）

`00-recommendation-targets.json` に10項目。**すべて100%であることをCatalog昇格条件にしない。**

### 5.1 回帰下限（Recommendation v1 の既定化のみを止める）

| 指標 | 下限 | 由来 |
|---|---:|---|
| `progressionPrecisionAt3` | ≥ 0.95 | baseline 1.0 − 5pp |
| `mustShowSelectedRecallAmongGenerated` | ≥ 0.6953 | baseline 0.7453 − 5pp |
| `cleanStressAgreement` | ≥ 0.65 | baseline 0.700 − 5pp |
| `twoBarFragmentsInTop3` | ≤ 0.0 | baseline より増やさない |
| Endless Critical Guard | PASS | — |
| clean 8-bar padding fixture | PASS | — |

これらに触れても **Catalog の昇格は妨げない**。

---

## 6. Recommendation baseline（凍結）

`00-recommendation-baseline.json`。既知56 file評価。

| 指標 | `phase4.1.2-v1`（full・baseline） | `phase4.1.2-core-v1`（参考） |
|---|---:|---:|
| progressionPrecisionAt3 | 1.0000 | 1.0000 |
| mustShowSelectedRecallAmongGenerated | 0.7453 | **0.8658** |
| twoBarFragmentsInTop3 | 0 | 0 |
| visiblePatternDuplicateCount | 0 | 0 |
| allCandidateCoverage | **0.99535** | 0.98772 |
| uniquePatternCountAt10 | **10.0** | 9.7321 |
| cleanStressAgreement | 0.7000 | **0.7849** |
| runtime max | 357 ms | 270 ms |

**baseline は full（`phase4.1.2-v1`）**。Catalog は Stage E の生成完全性を必要とするためで、core は `mustShowGeneratedRecall` 0.9702、最長未被覆15小節を残す。

core の数値も記録した。**どちらも他方を支配しない**という事実は、Catalog がその選択を不要にする理由そのものである——両方の候補を残すのだから。

---

## 7. 段階昇格ルール

### Candidate Catalog v1 を昇格してよい条件

1. Catalog Hard Gate 全通過
2. Endless Critical Guard 全通過
3. clean 8-bar padding fixture 全通過
4. Timeline 非回帰
5. schema 互換
6. runtime Gate 内
7. rollback 可能
8. private MIDI 混入なし

**Recommendation Quality Target の一部が100%未達でも、Catalog昇格を止めない。**

### Recommendation v1 を同時に既定化してよい条件

Critical Guard 全通過 + baseline から重大退行なし + padding 0 + Pattern重複0 + Catalog内容へ副作用なし。

### Recommendation が目標未達の場合

Catalog v1 は昇格可能。Recommendation は現行の最良単段方式を継続。`defaultAnalyzerMode` は変更しない。

---

## 8. H0 で変更していないもの

製品コードは1行も変更していない。契約と baseline の記録のみ。

`defaultAnalyzerMode` = `phase4-v1`。`qualityEvidence.penalty`、canonical identity 契約、Timeline、G2二段階Selectorの既定化——いずれも触れていない。

---

## 成果物

```text
docs/phase4.1.2-h/00-catalog-contract.md          本書
docs/phase4.1.2-h/00-catalog-hard-gates.json      14 Gate + 6 Critical Guard（凍結）
docs/phase4.1.2-h/00-recommendation-targets.json  10 目標 + 回帰下限 + 件数契約
docs/phase4.1.2-h/00-recommendation-baseline.json 既知56 file の baseline
```
