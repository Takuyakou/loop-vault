# Loop Vault Phase 4.1.2 — G2 Two-pass Pattern Selection

- 作成日: 2026-07-26
- 結果: **4構成すべてで二段階選定は単段より悪い。測定による否定結果。**
- 製品既定: `phase4-v1` のまま。`phase4.1.2-v1` は**単段選定のまま**（測定で勝った方を配線）

---

## 1. 実装したもの

G0 の taxonomy が `not-selected` 93.5% を示し、G1 でプールに冗長が0件と確認された。残る仮説は「選ぶ規則が足りない」だった。

指示どおり二段階にした。**Gold固有情報は一切入れていない**（scenarioId / gold block id / 固定bar位置のハードコードなし）。

### 第1段階（主レーン、最大3枠）

progression のみを対象に、次のキーを順に比較する。

| キー | 由来 |
|---|---|
| `structuralSalience` | セクション境界との一致 / 曲が実際に繰り返す周期との一致 / 小節グリッド上の楽節位置 |
| `temporalNovelty` | すでに選ばれたスパンの中心からの距離 |
| `structuralUsefulness` | 既存 |
| `score` | 既存（**先頭ではなく同点処理**） |
| startBar → patternId | 決定的 |

### 第2段階（MMR）

```text
utility = 0.12·structuralSalience + 0.30·patternNovelty + 0.10·temporalNovelty
        + 0.30·marginalCoverage  + 0.16·candidateQuality
        − 0.18·overlapPenalty    − 0.30·kindRank
```

---

## 2. 結果 —— 4構成の比較（既知56ファイル）

| 構成 | top3MinHits | allVisibleMinHits | coverage>=90% | uncoveredRun<8 | selRecallAmongGenerated |
|---|---:|---:|---:|---:|---:|
| **core (A–D)** | **39/56** | **41/56** | 53/56 | 54/56 | **0.8658** |
| full (A–E) | 34/56 | 37/56 | **55/56** | **56/56 PASS** | 0.7453 |
| core + G2 | 37/56 | 37/56 | 53/56 | 54/56 | 0.7928 |
| full + G2 | 35/56 | 33/56 | **55/56** | **56/56 PASS** | 0.6739 |

**G2 はどの構成でも改善しなかった。**

- core に入れると top3 39→37、allVisible 41→37、selRecall 0.866→0.793
- full に入れると top3 34→35（+1）だが allVisible 37→33、selRecall 0.745→0.674

第2段階の重みを1度調整した（salience 0.26→0.12、novelty 0.20→0.30、coverage 0.22→0.30）。`allVisibleMinHits` は 33/56 のまま動かず、selRecall は 0.694→0.674 とわずかに悪化した。**既知データでこれ以上の調整はしない。** 56ファイルへの過剰適合になり、holdout-v3 の意味が消える。

---

## 3. なぜ効かなかったのか

第1段階が採る「構造的に目立つスパン」と、goldが名指しするスパンが**十分に一致していない**。

主因は `structuralSalience` の第1項がセクション境界に依存していることである。segmenter の境界精度は約8割で、1〜2小節ずれる。ずれた境界に寄せると、goldブロックではなく「境界の推定値に近いスパン」が選ばれる。

`score` を先頭キーから外したことで、これまで偶然goldと一致していた高スコアのスパンも落ちた。**片方を直して片方を壊した。**

---

## 4. 配線の判断

**測定で勝った単段選定を `phase4.1.2-v1` に残した。** 二段階は opt-in とし、`phase4.1.2-g2-v1` / `phase4.1.2-core-g2-v1` として選択できる。

負けた仮説を既定経路に配線することは、測定より仮説を優先することになる。G3 が5構成を比較する要件を出しているので、両方を残すのは要件でもある。

---

## 5. 現時点の最良構成（いずれも全Gate未達）

| | 得意 | 不得意 |
|---|---|---|
| **core (A–D)** | rank-constraint（39/41）、selRecall 0.866、安定性0.785 | `longestUncoveredRun` 54/56 FAIL、coverage 53/56 |
| **full (A–E)** | `longestUncoveredRun` 56/56 PASS、coverage 55/56、genRecall 1.0 | rank-constraint（34/37）、selRecall 0.745 |

**どちらも他方を支配していない。** G3 の holdout-v3 で決める。

---

## 6. 追加したもの

```text
src/domain/midi/patternEvidence.ts          structuralSalience / temporalNovelty / overlapPenalty
src/domain/midi/patternTwoPassSelection.ts  二段階選定
src/domain/midi/phase412G2Analyzer.ts       比較用モード2つ
```

Timeline / qualityEvidence / canonical identity / `blockQuality` / 保存schema / `defaultAnalyzerMode` は不変。
