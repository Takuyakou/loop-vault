# Loop Vault P4.1.2-H2 — 動的Recommendation

- 作成日: 2026-07-26
- 既定Analyzer: `phase4-v1`（変更なし）
- `analysis.candidateRecommendation` を非永続で追加。Catalogは一切変更されない

---

## 1. 件数は素材が決める

```ts
recommendedCount = min(recommendationDisplayCap, eligibleDistinctPatterns.length)
```

`recommendationDisplayCap` は**最大表示数であり、目標件数ではない**。cap まで埋める処理を実装していない。

停止するのは次のいずれか。

| 停止理由 | 意味 |
|---|---|
| `all-eligible-used` | 適格Patternを使い切った |
| `display-cap` | 上限に達した |
| `quality-floor` | 次候補が最低品質に満たない |
| `no-eligible-pattern` | 適格Patternが0件 |

**件数を満たすための継続は存在しない。** `paddingCount` は常に0で、これを出力するのは「padding していない」を推論ではなく数字で示すためである。

---

## 2. 実測

| ファイル | Catalog | 適格 | **推薦** | padding | 停止 |
|---|---:|---:|---:|---:|---|
| S01 clean 8-bar（1進行） | 11 | 4 | **1** | 0 | all-eligible-used |
| S02 clean 8-bar | 12 | 5 | **1** | 0 | all-eligible-used |
| L06 vamp-only 96小節 | 47 | 18 | **1** | 0 | all-eligible-used |
| L01 endless型 112小節 | 872 | 796 | **10** | 0 | display-cap |
| `15.Endless,endless.` | 1777 | 1167 | **10** | 0 | display-cap |
| SURAN remix | 1352 | 1102 | **10** | 0 | display-cap |

**clean 8-bar で候補1件なら1件だけ表示する。** Catalogは11 Pattern を保持したままである。

---

## 3. 「同じ音楽」を3つの関係で抑制する

`C Am F G C Am F G` という8小節ファイルは、1つのループから**複数の形**を生む。

```text
4小節 C Am F G          （1-4, 5-8 の2出現）
8小節 C Am F G C Am F G （1-8）      ← 4小節を2回並べただけ
4小節 Am F G C          （2-5）      ← 同じループを別の位置から
4小節 F G C Am          （3-6）      ← 同じループを別の位置から
```

**どれも同じ進行である。** 提案は1つでよい。3つの関係を厳密に判定して抑制する。

| 関係 | 判定 |
|---|---|
| sub-window | 全Occurrenceが既出スパンの内側に収まる |
| repetition | コード列が既出Patternの列を整数回並べたもの |
| rotation | コード列が既出Patternの列の回転 |

**コードが同じだけでは抑制しない。** 順番が違えば別の進行である。

Catalog からは1つも消えない。抑制されるのは推薦枠だけで、`すべての進行` レーンから全部たどれる。

### 3.1 span を score に入れた理由（記録）

最初は sub-window だけで抑制していたが、S01 は3件を推薦した。抑制は**前向きにしか効かない**——8小節を先に推薦すればその半分は飛ばされるが、半分を先に取ると8小節は誰の sub-window でもないので2枠目を取る。

score に span 項（0.28）を足して長い陳述を先に出すようにし、さらに repetition と rotation を足して1件になった。

| 版 | S01 の推薦数 |
|---|---:|
| sub-window のみ | 3 |
| + span を score へ | 2 |
| **+ repetition と rotation** | **1** |

---

## 4. Critical Guard の実測（Endless）

```text
Em11/A patterns in catalog: 1
  vamp / len 2 / occ 27-28, 43-44, 107-108, 145-146
recommended Em11/A: 0
```

| Guard | 結果 |
|---|---|
| 同じ `Em11/A` カードを複数表示しない | **PASS**（Catalog に1 Pattern のみ） |
| `Em11/A` は1カード + 全Occurrence | **PASS**（4出現すべて保持） |
| progression 3件以上なら2小節vampがTop 3を占領しない | **PASS**（推薦0件） |
| 2小節vampをCatalogから削除しない | **PASS**（vampレーンに保持） |

推薦10件はすべて16〜20小節の異なる進行で、曲全体に散っている。

---

## 5. eligibility

主推薦の対象は次を満たすPatternのみ。

- distinct Pattern（同一 `normalizedProgressionIdentity` は1回）
- quality floor 以上
- `candidateKind === "progression"`
- 既出の sub-window / repetition / rotation ではない

`vamp` / `fragment` / `uncertain` は**主推薦に入らないがCatalogに残る**。H3 でそれぞれのレーンへ出す。

---

## 6. 追加したテスト（9件）

`src/domain/midi/candidateRecommendation.test.ts` — H0の6つのCritical Guardに対応。

```text
recommends one when the file contains one progression
recommends two when two distinct progressions exist
recommends nothing rather than padding when no progression is eligible
gives one pattern with four occurrences a single recommendation slot
caps the recommendation while leaving every pattern in the catalog
stops at the eligible count rather than filling with weak candidates
marks the single-candidate case in its reasons
produces the same recommendations on a rerun
never returns more recommendations than eligible patterns
```

---

## 7. 触っていない層

Timeline / `qualityEvidence` / canonical identity / `blockQuality` / 保存schema / `defaultAnalyzerMode` / `blockCandidates` の内容。

G2二段階Selectorは opt-in のまま。既存の単段Selectorも `blockCandidates` を作り続けており、**Recommendation はそれとは別経路の追加**である。UIはまだどちらも切り替えていない（H3）。

---

## 成果物

```text
docs/phase4.1.2-h/02-dynamic-recommendation.md   本書
docs/phase4.1.2-h/02-recommendation-probe.json   実測
scripts/diagnose-candidate-catalog.ts            診断
```
