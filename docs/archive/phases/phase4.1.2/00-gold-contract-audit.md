# Loop Vault Phase 4.1.2 — A0 Gold契約監査

- 作成日: 2026-07-25
- 対象: `loop-vault-synthetic-gold-corpus-v1`（48 MIDI / 24シナリオ、Git管理外）
- 製品コード変更: **なし**
- 実行: `npx vite-node scripts/audit-gold-contract.ts`

Goldを製品結果に合わせて変更していない。**どの実装でも満たせない契約だけ**を訂正し、訂正内容は `00-gold-contract-amendments.json` としてGitに残す（コーパス本体は書き換えない）。

---

## 1. 結果

| severity | 件数 | 内容 |
|---|---:|---|
| **impossible** | 4 | S23 top3容量超過 1 / S24 生成不能 3 |
| **inconsistent** | 20 | S23 の同一span重複イベント（clean 10 + stress 10） |
| **unmeasurable** | 1 | S16 block_type と構造規則の不一致 |

---

## 2. impossible: S23 の top3 容量超過（訂正した）

```text
prog1, prog2, prog3, prog4 の4 Pattern が rank_constraint="top3"
→ 3枠に4枚は入らない。どの実装でも満たせない
```

`priorityGroup + top3MinHits + allVisibleMinHits` へ移行した。**楽曲上の意図は弱めていない。**

| group | patternIds | top3MinHits | allVisibleMinHits | afterGroup |
|---|---|---:|---:|---|
| `S23-progressions` | prog1, prog2, prog3, prog4 | **3** | **4** | — |
| `S23-vamp` | em11a-vamp | 0 | 1 | `S23-progressions` |

- 上位3枠は**すべて**progressionで埋まらなければならない（3 / 3）
- 4つのprogressionは**すべて**表示範囲から到達可能でなければならない（4 / 4）
- `Em11/A` vamp は到達可能でなければならないが、progressionより上に出てはいけない

同じ変換規則を全24シナリオへ機械的に適用した（`deriveRankConstraintGroups`）。`top3MinHits = min(distinct patterns, 3)` で上限を切るだけで、S23以外は値が変わらない。

| scenario | group | top3MinHits | allVisibleMinHits |
|---|---|---:|---:|
| S01 | S01-top3 (p1) | 1 | 1 |
| S11 | S11-top3 (prog-d) | 1 | 1 |
| S11 | S11-after-progressions (vamp-em11a) | 0 | 1 |
| S16 | S16-top3 (verse-p, chorus-p) | 2 | 2 |
| S16 | S16-top10 (bridge-p) | 0 | 1 |
| S24 | S24-top10 (sec1…sec6) | 0 | 6 |

---

## 3. inconsistent: S23 に同一spanの重複イベントが20件（訂正した）

```text
idx66  bar73  abs 288→292  Dm7
idx67  bar73  abs 288→292  C     ← 同一span
idx68  bar74  abs 292→296  G7
idx69  bar74  abs 292→296  Am    ← 同一span
（clean 10組 / stress 10組）
```

**異なる2つのコードが同じ4拍を同時に占有することはできない。** 半小節分割ではなく、注釈行の重複である。

どちらが正しいかを選ぶことは**検出器の出力からGoldを決める**ことになるため選ばない。処理:

- 同一spanの2行を1イベントへ統合し、**両方の読みを acceptable とする**
- `canonicalExact` / `triad` / `seventh` の**分母から除外する**
- 除外件数（`goldAmbiguousSpans`）を報告し、分母が縮んでいることを見えるようにする

### 3.1 これは前回診断の誤りを訂正する

`docs/phase4.1.1/synthetic-corpus-diagnostic-report.md` は bar73 / bar74 を**製品のイベント過統合**として報告した（§5.1 クラスタ6、§10 Secondary 3）。

**これは誤りだった。** 製品は1つのspanに1つのコードを出しており、正しい。重複はGold側にある。

したがって前回レポートの「Secondary 3: 半小節2コードの過統合」は S23 については取り下げる。過分割/過統合の懸念自体は validation の `eventCountRatio 1.369`（S20_stress 32/16）で別途裏付けられているため、指標としては維持する。

---

## 4. unmeasurable: S16 の block_type（訂正しない）

```text
intro 1-4 (Cadd9 G Cadd9 G)
  gold:     block_type = fragment,  usefulness = exclude-from-main
  構造規則: 4小節 / canonical 2種 → progression
```

コーパスの分類定義は `fragment` を「**barLength < 4、または進行として不完全**」としている。後半は楽曲上の判断であり、構造規則からは導出できない。したがって:

- `block_type` は **Hard Gate に使わない**（記述的計測のみ）
- レーン配置の判定は `usefulness`（`exclude-from-main`）で行う。こちらは一意に決まる

**Goldは変更しない。** 構造規則と楽曲上の判断が混在していること自体が発見であり、両者を分離して扱うのが正しい対応である。

---

## 5. impossible: S24 の生成不能ブロック（訂正しない）

```text
focus 33-46  (14小節)  ← 生成不能
sec4  47-64  (18小節)  ← 生成不能
sec6  81-100 (20小節)  ← 生成不能
（生成器の窓長は 2 / 4 / 8 / 16）
```

**これは製品の制限であり契約の誤りではない。** コーパスがセクション長の候補を要求するのは正当である。Stage E で対応する。Goldは変更しない。

---

## 6. 検査したが問題がなかった項目

| 検査 | 結果 |
|---|---|
| top10 容量（distinct card ≤ 10） | 全24シナリオ PASS |
| `expected_card_count` ≤ Occurrence数 | 全PASS |
| merge policy と card count の整合 | 全PASS |
| separate policy と Occurrence数の整合 | 全PASS |
| block が宣言済みPatternを参照 | 全PASS |
| bar範囲が 1..bars 内 | 全PASS |
| duration > 0 | 全PASS |
| split の重複 | なし（48ファイルが各1回） |
| scenario pair が split をまたがない | 全PASS |
| variant が split に欠落 | なし |

---

## 7. 方針の記録

```text
goldNeverFittedToResults      : true
onlyImpossibleConstraintsAmended : true
blockTypeExcludedFromHardGate : true
```

訂正は2件（S23 の rank constraint、S23 の同一span）。いずれも**製品の出力を見ずにコーパス単体から導出できる**。Goldのラベル・bar範囲・コード列・usefulness・boundaryToleranceBeats は一切変更していない。

---

## 成果物

```text
docs/phase4.1.2/00-gold-contract-audit.md          本書
docs/phase4.1.2/00-gold-contract-audit.json        検査結果25件と派生group
docs/phase4.1.2/00-gold-contract-amendments.json   訂正内容（凍結）
scripts/audit-gold-contract.ts                     監査
scripts/goldContract.ts                            group派生と充足判定
```
