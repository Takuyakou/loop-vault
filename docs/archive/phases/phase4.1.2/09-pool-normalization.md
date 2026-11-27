# Loop Vault Phase 4.1.2 — G1 Candidate Pool Normalization

- 作成日: 2026-07-26
- 対象モード: `phase4.1.2-v1`（**製品既定は `phase4-v1` のまま**）
- 結果: **プールから削除されたものは0件。測定による否定結果。**

---

## 1. 結論を先に書く

Stage E で候補プールが 3.00× に膨らんだため、ランキング前に整理すれば選定が楽になるはずだった。**整理できるものは1件もなかった。**

| fixture | Occurrence | Pattern | multiSource | dominated |
|---|---|---|---:|---:|
| L01 | 992 → **992** | 875 → **875** | **0** | **0** |
| L04 | 994 → **994** | 727 → **727** | **0** | **0** |
| L12 | 1686 → **1686** | 225 → **225** | **0** | **0** |
| S16 | 306 → **306** | 260 → **260** | **0** | **0** |
| **合計** | **3978 → 3978（0.0%削減）** | — | **0** | **0** |

Gate結果も指標も Stage E から**完全に不変**。

```text
mustShowGeneratedRecall              1.0000（変化なし）
mustShowSelectedRecallAmongGenerated 0.7453（変化なし）
top3MinHits                          34/56（変化なし）
allVisibleMinHits                    37/56（変化なし）
allCandidateCoverage                 0.9954（変化なし）
```

---

## 2. なぜ0件なのか

### 2.1 exact merge が0件

`buildOccurrences` はすでに span（`occ-start-end`）で一意化しており、`structuralWindows` も `startBar:lengthBars` で一意化している。**複数generatorが同じ窓を提案しても窓は1つしか作られない。**

本Stageでは提案元を捨てずに `sourceKinds[]` として保持するようにしたが、実測では**複数generatorが同一窓に衝突した例が0件**だった。generatorごとに提案する窓の形が実際に違っている。

### 2.2 strict dominance が0件

削除条件は指示どおり厳格にした。

```text
A を削除してよい条件:
  A と B が同じPattern（relativeSignature一致）
  かつ 同じコードイベント列（identityKey列一致）
  かつ A の covered bars ⊆ B の covered bars
  かつ A.score <= B.score
```

**この条件を満たす組が1つもなかった。** 窓はそれぞれ異なる小節を覆うか、異なるコード列を述べている。つまり **Stage E が増やしたのは冗長性ではなく、実際に異なる候補**である。

### 2.3 入れ子は守られている

「4/8/16小節の入れ子を、長さだけで削除してはいけない」という制約は、**コードイベント列の一致を必須にすることで構造的に満たされる**。8小節楽節の中の4小節モチーフはコード列が短いので、包含していても支配関係にならない。テストで固定した。

---

## 3. この結果が意味すること

**プール整理では rank-constraint は回復しない。** G0 の taxonomy がすでに示していたことの裏付けになる。

```text
rank failure 46件
  not-selected                       43 (93.5%)
  grouped-into-a-different-pattern    2
  selected-but-outside-visible-limit  1
  lost-to-strict-dedup                0   ← G1で確認: 削除できるものが無い
```

負担は**すべて選定（G2）にかかる**。候補が多すぎるのではなく、多い中から選ぶ規則が足りていない。

---

## 4. 何を残したか

削除は0件だが、コードは残す。

1. **`sourceKinds[]` の provenance** — どのgeneratorがその窓を提案したかが追える。将来 generator を足したときに衝突を検出できる
2. **不変条件のガード** — 「同じPattern・同じコード列・小節の部分集合・スコア以下」なら重複であるという規則を、テスト付きで明示した。新しい generator が重複を作り始めたら自動的に効く
3. **診断** — `poolMultiplier` などを before/after で取れる

`mustShowGeneratedRecall` は 1.0 のまま（低下していたらマージしない規則だったが、そもそも何もマージしていない）。

---

## 5. 追加したテスト

`src/domain/midi/candidatePool.test.ts`（5件）

```text
keeps a four-bar motif nested inside an eight-bar phrase   ← 長さだけで消さない
keeps a candidate that reaches a bar no other reaches
drops a candidate another covers with the same chords and a better score
never drops the better-scoring candidate
reports what it did
```

---

## 6. 触っていない層

Timeline / qualityEvidence / canonical identity / `blockQuality` / `groupIntoPatterns` / `attachSourceVoicing` / 保存schema / `defaultAnalyzerMode`。
