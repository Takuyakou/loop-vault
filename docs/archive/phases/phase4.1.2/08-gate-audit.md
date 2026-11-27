# Loop Vault Phase 4.1.2 — G0 Gate監査・ablation・L06調査

- 作成日: 2026-07-26
- 製品ロジックの挙動変更: **なし**（Stage Eのgeneratorを切るスイッチのみ追加。既存モードの出力は不変）
- 実行: `npx vite-node scripts/audit-selection-gates.ts`

---

## 1. 13 Gate 全列挙

### 見つかった1項目

**`chord-corpus-non-regression` は判定されていなかった。** Gate scriptが「別スクリプトで判定」と書いて `not-evaluated` を返し、その結果が書き戻されることは一度もなかった。だから13項目のリストが実質12項目になり、「13中8 PASS・4 FAIL」で1つ足りなかった。

本Stageで判定を組み込んだ。**両モードとも 100/100 一致で PASS。**

### phase4.1.2-full（A〜E）

| # | gate id | metric | threshold | actual | 判定 | failure count |
|---|---|---|---|---|---|---:|
| 1 | visible-pattern-duplicate-count-zero | visiblePatternDuplicateCount | == 0 | max 0 | **PASS** | 0 |
| 2 | visible-slot-waste-zero | visibleSlotWasteCount | == 0 | max 0 | **PASS** | 0 |
| 3 | occurrence-reachability-full | occurrenceReachability | == 1 | min 0.5 | FAIL | 2 |
| 4 | progression-precision-at-3 | progressionPrecisionAt3 | == 1（progression 3件以上時） | min 1 | **PASS** | 0 |
| 5 | no-two-bar-fragment-in-top3 | twoBarFragmentsInTop3 | == 0（同上） | max 0 | **PASS** | 0 |
| 6 | rank-constraint-top3-min-hits | top3Satisfied | 全group | 34/56 | FAIL | 22 |
| 7 | rank-constraint-all-visible-min-hits | allVisibleSatisfied | 全group | 37/56 | FAIL | 19 |
| 8 | rank-constraint-order | orderSatisfied | 全group | all | **PASS** | 0 |
| 9 | coverage-at-all-visible | allCandidateCoverage | >= 0.9 | min 0.78125 | FAIL | 1 |
| 10 | longest-uncovered-run | longestUncoveredHarmonicRun | < 8 | max 4 | **PASS** | 0 |
| 11 | runtime-ceiling | runtimeMs | <= 3000 | max 356 ms | **PASS** | 0 |
| 12 | deterministic | cards on rerun | identical | identical | **PASS** | 0 |
| 13 | **chord-corpus-non-regression** | Chord Drip fullTimeline | identical | **100/100** | **PASS** | 0 |

**9 PASS / 4 FAIL。**（従来の集計は 8 PASS / 4 FAIL / 1 未判定）

### phase4.1.2-core（A〜D）

同じ13項目で **8 PASS / 5 FAIL**。差は2つ:

| gate | core | full |
|---|---|---|
| `longest-uncovered-run < 8` | **FAIL（max 15）** | **PASS（max 4）** |
| `coverage >= 0.9` | FAIL（min 0.625） | FAIL（min 0.78125） |

**core は full より Gate通過数が少ない。** 一方で rank-constraint は core の方が良い（§2）。どちらも他方を支配していない。

---

## 2. Ablation: core（A〜D）と full（A〜E）

Stage Eのgeneratorだけを切り替えた。**他は完全に同一。**

| 指標 | core (A–D) | full (A–E) | 差 |
|---|---:|---:|---|
| candidate pool: Pattern数 | 78.3 | **235.4** | **3.00×** |
| candidate pool: Occurrence数 | 143.4 | **362.2** | **2.53×** |
| **mustShowGeneratedRecall** | 0.9702 | **1.0000** | **+0.030** |
| **mustShowSelectedRecallAmongGenerated** | **0.8658** | 0.7453 | **−0.121** |
| **top3MinHits 通過** | **39/56** | 34/56 | **−5** |
| **allVisibleMinHits 通過** | **41/56** | 37/56 | **−4** |
| allCandidateCoverage | 0.9877 | **0.9954** | +0.008 |
| reachableCandidateCoverage | 0.9983 | 0.9983 | 0 |
| longestUncoveredRun | **max 15** | **max 4** | 大幅改善 |
| uniquePatternCountAt3 | 3.00 | 3.00 | 0 |
| uniquePatternCountAt10 | 9.73 | **10.00** | +0.27 |
| runtime mean / max | 71 / 256 ms | 86 / 356 ms | +21% |
| **clean/stress selection agreement** | **0.785** | 0.700 | **−0.085** |

### 読み取れること

**Stage Eは生成を完全にした代わりに、選定と安定性を悪化させた。**

- 生成: `mustShowGeneratedRecall` 0.970 → **1.000**（14/18/20小節の生成不能が解消）
- 被覆: `longestUncoveredRun` max 15 → **4**。coreは8小節以上の未被覆区間を残す
- 選定: `selectedRecallAmongGenerated` 0.866 → **0.745**。候補プールが3倍になり goldブロックが10枠から押し出される
- 安定性: clean/stress で選ばれるPatternの一致率が 0.785 → **0.700**。プールが大きいほど僅差の入れ替わりが増える

**core を単純に採用すれば済む話ではない。** core は `longest-uncovered-run` を落とす。

---

## 3. rank failure taxonomy

full の未達46件を、最初の損失地点で分類した。

| 原因 | 件数 | 比率 |
|---|---:|---:|
| **not-selected** | **43** | **93.5%** |
| grouped-into-a-different-pattern | 2 | 4.3% |
| selected-but-outside-visible-limit | 1 | 2.2% |
| not-generated | 0 | 0% |
| lost-to-strict-dedup | 0 | 0% |
| constraint-impossible | 0 | 0% |
| harness-misjudgement | 0 | 0% |

**生成でもdedupでもgroupingでもない。93.5%が「生成され、正しくPatternへまとまったが、選定が選ばなかった」である。**

`not-generated` が0件なのは Stage E の成果であり、`constraint-impossible` が0件なのは A0 の契約訂正が効いている。修正すべき層は**選定のみ**で、G1（プール整理）とG2（二段階選定）が正しい対象である。

---

## 4. L06 の真因 —— 前回報告の訂正

### 4.1 前回の記述は誤りだった

`docs/phase4.1.2/07-final-assessment.md` §6.2 に次のように書いた。

> coverage未達は **L06_stress 1件のみ**。ワンコードvampだけの曲で、`visiblePatternDuplicateCount = 0` を守る限りカード表示ベースで90%に到達する方法がない。**2つの凍結Gateが数学的に両立しない。**

**これは誤りである。** 実際の未達ファイルは **S16_clean（0.78125）のみ**で、L06 は clean 0.958 / stress ともに通過している。Stage C 時点の未達リストを見て、vamp reserve 投入後に確認し直さなかったことが原因である。

### 4.2 L06_stress の実測

| 指標 | 実測 |
|---|---:|
| Pattern数 | 46 |
| 表示カード | 10 |
| **visiblePatternDuplicateCount** | **0** |
| **occurrenceReachability** | **1.0** |
| **representativeOccurrenceCoverage** | **1.0** |
| **reachableOccurrenceCoverage** | **1.0** |
| groupedVisibleCoverage | 1.0 |

**L06 はすべて満たしている。** 評価実装の不具合でも製品実装の不具合でもない。前回の私の確認漏れだった。

### 4.3 ただしL06_stressには別の発見がある

カードの中身がこうなっている。

```text
49-72 (24) progression occ=2
1-18  (18) progression occ=2
74-89 (16) progression occ=32
```

L06 は**ワンコードvampだけの曲**である。にもかかわらず全カードが `progression` に分類されている。stress変種の arpeggiated harmony が単一コードを多数の別コードに割ってしまい、検出器から見ると「コードが変わり続ける曲」になっている。

これは A2 で記録した `eventCountRatio` 最大値96と同じ現象で、**Timelineの堅牢性の問題**である。Stage F の対象で、G1〜G3では触らない。

### 4.4 真の coverage 未達は S16_clean

S16 は32小節の intro-verse-chorus-bridge-chorus で、chorus は 13–20 と 25–32 の2箇所に出る同一Pattern。Pattern一意化により1カードは片方しか表示できず、`allCandidateCoverage` が 25/32 = **0.78125** になる。

`reachableCandidateCoverage` は高い（カードから両方へ到達できる）。**§4.1で L06 について主張した構造そのものは正しく、当てはまるファイルが違っていた。**

これは G2 の temporal diversity で改善しうる。凍結Gateは変更しない。

---

## 5. coverage契約 v1 と v2

旧Gateファイル（`02-usefulness-gates.json`）は**変更していない**。

| 契約 | 定義 | 用途 |
|---|---|---|
| **v1（凍結・変更なし）** | `allCandidateCoverage` = カードが**自分で表示する**小節 | Hard Gate の判定 |
| v2（記述のみ） | `reachableCandidateCoverage` = カードから**到達できる**小節（兄弟Occurrence含む） | 併記して差を示す |

v2 を Gate に採用していない。凍結後に定義を差し替えることは、結果に合わせて基準を動かすことになる。両方を報告し、差そのものを情報として扱う。

現状の差: v1 0.9954 / v2 0.9983。

---

## 6. 次段への含意

| Stage | 対象 | 根拠 |
|---|---|---|
| **G1** | 候補プールの正規化 | プールが3.00×に膨張し、選定と安定性を悪化させている |
| **G2** | 二段階選定 | rank failure の **93.5% が not-selected** |
| G3 | holdout-v3 と昇格判定 | core / full どちらも他方を支配しない。実測で決める |

Stage F（Timeline）は L06_stress の分類崩れと `eventCountRatio` に対応するが、**G3終了後の別ブランチ**とする。

---

## 成果物

```text
docs/phase4.1.2/08-gate-audit.md    本書
docs/phase4.1.2/08-gate-audit.json  13 Gate×2モード、ablation、taxonomy、L06/S16 trace
scripts/audit-selection-gates.ts    監査
src/domain/midi/phase412CoreAnalyzer.ts  ablation用モード（既定に影響しない）
```
