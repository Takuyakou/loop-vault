# Loop Vault Phase 4.1.2 — 最終評価と昇格判定

- 作成日: 2026-07-26
- 判定: **昇格しない。製品既定は `phase4-v1` のまま維持する。**
- `phase4.1-v1` / `phase4.1.2-v1` はいずれも選択可能なまま残す

---

## 1. 判定

指示は「A〜Eの全Gateを通った場合のみ `phase4.1.2-v1` へ昇格する」。

**13 Gate中 8項目がPASS、4項目が未達。したがって昇格しない。**

Gateは1つも緩めていない。凍結時の定義と閾値のまま判定した。

---

## 2. Gate結果（dev + validation、56 file評価）

| Gate | baseline (4.1) | **最終 (4.1.2)** |
|---|---|---|
| `visiblePatternDuplicateCount = 0` | 38/56 | **56/56 PASS** |
| `visibleSlotWasteCount = 0` | 38/56 | **56/56 PASS** |
| `progressionPrecisionAt3 = 100%` | 39/56 | **56/56 PASS** |
| `twoBarFragmentsInTop3 = 0` | 40/56 | **56/56 PASS** |
| `rank-constraint order` | 56/56 | **56/56 PASS** |
| `longestUncoveredRun < 8` | 55/56 | **56/56 PASS** |
| `runtime <= 3000ms` | PASS | **PASS**（max 460 ms） |
| `deterministic` | PASS | **PASS** |
| `coverage >= 90%` | 52/56 | **55/56 FAIL** |
| `occurrenceReachability = 100%` | 55/56 | **54/56 FAIL** |
| **`rank-constraint top3MinHits`** | 28/56 | **34/56 FAIL** |
| **`rank-constraint allVisibleMinHits`** | 23/56 | **37/56 FAIL** |
| `chord-corpus-non-regression` | — | **PASS**（§4） |

### 指標

| 指標 | baseline | **最終** |
|---|---:|---:|
| **mustShowGeneratedRecall** | 0.9702 | **1.0000** |
| mustShowSelectedRecallAmongGenerated | 0.4269 | **0.7453** |
| **visiblePatternDuplicateCount** | 1.3214 | **0** |
| **uniquePatternCountAt3** | 1.4821 | **3.0000** |
| **uniquePatternCountAt10** | 2.6071 | **10.0000** |
| progressionPrecisionAt3 | 0.7887 | **1.0000** |
| twoBarFragmentsInTop3 | 0.5536 | **0.0000** |
| allCandidateCoverage | 0.9739 | **0.9954** |

---

## 3. holdout

### 3.1 holdout-v2（Long-form、8ファイル）

**2回実行した。事実として記録する。**

1回目はStage E完了直後。2回目は §5 の vamp reserve を入れた後。**変更の動機は holdout-v2 の結果ではなく、指示の Endless 必須項目「`Em11/A` は1カード＋全Occurrence」が満たせていなかったこと**である。2回の結果は Gate 判定において同一だった。

| Gate | 結果 |
|---|---|
| `visiblePatternDuplicateCount = 0` | **8/8 PASS** |
| `visibleSlotWasteCount = 0` | **8/8 PASS** |
| `occurrenceReachability = 100%` | **8/8 PASS** |
| `progressionPrecisionAt3 = 100%` | **8/8 PASS** |
| `twoBarFragmentsInTop3 = 0` | **8/8 PASS** |
| `rank-constraint order` | **8/8 PASS** |
| `coverage >= 90%` | **8/8 PASS**（全ファイル1.0） |
| `longestUncoveredRun < 8` | **8/8 PASS** |
| `runtime <= 3000ms` | **8/8 PASS**（max 461 ms） |
| `deterministic` | **PASS** |
| **`rank-constraint top3MinHits`** | **0/8 FAIL** |
| `rank-constraint allVisibleMinHits` | 5/8 FAIL |

`mustShowGeneratedRecall` は **1.0**（全8ファイル）。生成は完全。`mustShowSelectedRecallAmongGenerated` は 0.625。

**Gateも正解も holdout の結果に合わせて変更していない。**

### 3.2 Synthetic Gold holdout（8ファイル）

同じく10項目PASS、`rank-constraint` 2項目がFAIL（top3MinHits 4/8、allVisibleMinHits 0/8）。`coverage >= 90%` は 8/8 PASS。

---

## 4. コード検出の非回帰

```text
Chord Drip corpus: phase4-v1 と phase4.1.2-v1 の fullTimeline
  100 / 100 完全一致（bar, beat, durationBeats, chord.label）
```

A〜E は**コード検出を1バイトも変えていない**ことを直接確認した。Chapter 3 Seed は同じ Timeline から算出されるため、この一致をもって非回帰とする。

---

## 5. 実MIDIでの必須項目

### 5.1 `15.Endless,endless.`（154小節）

| 必須項目 | 結果 |
|---|---|
| 同じ `Em11/A` カードが複数表示されない | **PASS**（`visiblePatternDuplicateCount = 0`） |
| `Em11/A` は1カード + 全Occurrence | **PASS**（カード#10 = bars 27–28、occ=4） |
| progressionが3件以上あればTop 3はprogression | **PASS**（上位9枚すべてprogression） |
| 2小節候補はvampレーン | **PASS**（主レーンに2小節候補なし） |

`allCandidateCoverage 1.0` / `progressionCandidateCoverage 1.0` / `top3SingleChordCount 0`。

**修正前**（`phase4.1-v1`）は10枠すべてが2小節候補、うち5枠が重複、gold進行は到達不可だった。

#### vamp reserve を追加した

kind を第1キーにしたため、progression が1556 Pattern ある Endless では **vampレーンが永久に空**になり、`Em11/A` カードがどこにも出なくなっていた。progression が表示上限以上ある場合にかぎり、可視10枠のうち1枠を vamp に確保する。vamp しかない曲では確保しない（自力で埋まるため）。

この変更で dev+validation の Gate 判定は変化しなかった。

### 5.2 SURAN remix（100小節）

`visiblePatternDuplicateCount 0` / `top3SingleChordCount 0` / `allCandidateCoverage 1.0` / `progressionCandidateCoverage 1.0`。

---

## 6. 未達の内訳と原因

### 6.1 `rank-constraint` 2項目（最大の未達）

goldが指定する **特定のスパン** が表示10枠に入らない。原因は Stage E の副作用である。

```text
Stage C  : top3MinHits 39/56, selectedRecallAmongGenerated 0.870
Stage E  : top3MinHits 34/56, selectedRecallAmongGenerated 0.745
```

Stage E は生成不能を解消して `mustShowGeneratedRecall` を 0.970 → **1.000** にしたが、候補プールが 2.7〜3.8倍になり、gold ブロックが10枠から押し出された。**生成を増やすと選定が難しくなる。**

選定側の残課題であり、Gateを緩めて通す種類の問題ではない。

### 6.2 `coverage >= 90%` 55/56 と `occurrenceReachability` 54/56

- coverage未達は **L06_stress 1件のみ**。ワンコードvampだけの曲で、`visiblePatternDuplicateCount = 0` を守る限りカード表示ベースで90%に到達する方法がない（`reachableCandidateCoverage` は 0.9以上で、ユーザーは全小節へ到達できる）。**2つの凍結Gateが数学的に両立しない。**
- reachability未達は L05_stress / L10_stress の2件。

---

## 7. 触っていない層

`matchWindow` / `smoothTimeline` / `qualityEvidence`（定数・scope・閾値）/ `chordIdentity` の canonical契約 / `blockQuality` の repeat・loopFitness係数 / `attachSourceVoicing` / 保存schema（`fileVersion = 1`）/ `coverageSelector.ts` / `segmentSections`。

`defaultAnalyzerMode` は `phase4-v1` のまま。`phase4.1-v1` も削除していない。3モードすべてが同じGateで比較できる。

---

## 8. Rollback

昇格していないため rollback は不要である。`phase4.1.2-v1` を試すには `analyzeMidi(bytes, { mode: "phase4.1.2-v1" })` を指定する。

---

## 9. 次に必要なこと

1. **`rank-constraint` の回復** — Stage E で増えた候補プールに選定が追いついていない。表示10枠の配分をセクション/位置で分散させる案が候補
2. **L06型の Gate 衝突の裁定** — カード表示ベース被覆と Pattern 一意性は単一コード曲で両立しない。どちらを優先するかは製品判断
3. **Stage F（Timeline研究）** — 本作業では未着手。A〜Eと混ぜない前提のため別ブランチ・別Gateで実施する

---

## 成果物

```text
docs/phase4.1.2/07-final-assessment.md          本書
docs/phase4.1.2/07-gate-final.json              dev+validation 56件
docs/phase4.1.2/07-holdout-v2.json              holdout-v2 8件
docs/phase4.1.2/07-gold-holdout.json            Synthetic Gold holdout 8件
docs/phase4.1.2/07-timeline-non-regression.json Chord Drip 100/100一致
docs/phase4.1.1/07-endless-phase412.json        Endless 必須4項目
docs/phase4.1.1/07-suran-phase412.json          SURAN
```
