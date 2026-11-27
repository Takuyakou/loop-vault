# Loop Vault Stage F3a — Quality Tri-state Shadow

- 作成日: 2026-07-26
- **製品Primaryは変更していない**
- root / bass は `phase4-v1` から**入力として受け取り、一切導出していない**
- tension 検出は無変更
- **結論: F3b は非推奨。** ただし副産物として残す価値のあるものが1つある

---

## 1. 必須不変条件 — すべて PASS

| Gate | 結果 |
|---|---|
| `root-sequence-unchanged` | **PASS 199/199** |
| `bass-sequence-unchanged` | **PASS 199/199** |
| `root-bass-invariant-under-perturbation` | **PASS 199/199**（0.7 / 1.0 / 1.3） |
| `perturbation-not-vacuous` | **PASS 199/199** |

root と bass は**入力**なので、どんなパラメータ設定でも動かない。それでも「入力だから当然」で済ませず、製品の root/bass 列と shadow の root/bass 列を**直接比較して**199/199 を確認した。

4つ目の Gate が要る理由は F2 と同じ。**何も読んでいないパラメータを振れば不変性は自明に通る。** 摂動が実際に quality スコアを動かしたことを 199/199 で確認している。

---

## 2. 三値判定は設計どおり働いている

| 指標 | 値 |
|---|---|
| 反証により除外された候補 / window | **7.12** |
| **音の欠落のまま残った候補 / window** | **1.50** |
| triad がどれも supported でない window | **11.6%** |
| seventh がどれも supported でない window | **7.9%** |

候補は11個（triad 7 + seventh 4）で、平均 7.12 が**反証によって**落ち、**1.50 は defining tone が鳴っていないまま生き残っている**。

`Cmaj` と `Cmin` は、3度がどこにも鳴っていなければ**両方生き残る**。テストで直接主張している。「音がない」で候補を除外していない。

`seventh:none` も主張として扱っている。7度が鳴っていれば contradicted、三和音が完備で7度が鳴っていなければ supported、それ以外は underdetermined。既定値ではなく判定である。

---

## 3. 精度 — shadow は製品より悪い

Gold 5962 window（product → shadow）

| 指標 | product | shadow | 差 |
|---|---|---|---|
| triad 正解率 | **91.6%** | 84.4% | −7.2pp |
| seventh 正解率 | **89.7%** | 85.6% | −4.1pp |
| quality（triad+seventh） | **86.5%** | 79.3% | −7.2pp |
| **canonicalExact** | **78.7%** | 72.8% | −5.9pp |
| **correction cost** | — | — | **+349** |

---

## 4. subset 別 — 難しいケースでは同点、簡単なケースで負ける

| subset | gold | triad | seventh | quality | **canonicalExact** | **cost差** |
|---|---|---|---|---|---|---|
| **plain-triad** | 16 | 100→**100** | 100→**100** | 100→**100** | 100→**100** | **0** |
| **pedal** | 256 | 89.1→87.5 | 90.6→89.1 | 87.5→**87.5** | 56.3→**56.3** | **0** |
| **inversion** | 240 | 88.3→86.7 | 90.0→88.3 | 86.7→**86.7** | 53.3→**53.3** | **0** |
| **rootless** | 325 | 99.4→**99.4** | 99.4→98.8 | 99.4→98.8 | 85.5→**85.5** | **0** |
| clean | 3446 | 88.0→83.0 | 88.0→85.6 | 84.4→80.3 | 77.9→75.4 | **+86** |
| **stress** | 2516 | **96.5→86.4** | 91.9→85.5 | 89.4→77.9 | 79.8→69.3 | **+263** |

**これは意味のある形をしている。** Stage F を始める動機になった4つの subset（plain-triad / pedal / inversion / rootless）では **canonicalExact が完全に同点、cost 差 0**。悪化しているのは普通の window である。

つまり三値判定は**難しいケースを助けもしないが壊しもせず、簡単なケースを壊す**。接続すれば純損失になる。

---

## 5. corpus 別

| corpus | gold | triad | **canonicalExact** | cost差 |
|---|---|---|---|---|
| Synthetic Gold | 1300 | 95.9→92.8 | 91.4→83.5 | +103 |
| Long-form v1.1 | 2423 | 97.8→90.5 | 85.3→79.5 | +140 |
| regression-v3 | 1268 | 99.7→96.8 | 90.5→88.8 | **+22** |
| **Chord Drip** | 971 | **59.7→41.9** | 29.7→21.0 | +84 |
| Endless / SURAN / Chapter 3 | 0 | Gold root 注釈なし | — | 0 |

Chord Drip が最も悪化する。regression-v3 が最も軽微（+22）。

**Endless / SURAN / Chapter 3 Seed は quality の Gold 注釈を持たない**ので精度を測れない。実行はしており、root/bass 不変条件の 199/199 には含まれている。

---

## 6. なぜ悪いのか

三値判定は defining tone の**有無**だけを見て、specificity で同点を割る。製品の quality は pitch-class 集合全体をテンプレート照合し、**持続時間と信頼度で重み付け**する。

三値化の過程で**重みの情報を捨てている**。「3度が鳴っている」は二値だが、「3度が0.2拍だけ鳴っている」と「3度が4拍鳴っている」は同じではない。stress variant で triad が 96.5% → 86.4% と大きく落ちるのはこれが原因と考えられる（劣化素材では短いゴースト音が多い）。

**この仮説を検証してから重み付けを足すべきで、いま数字に合わせて調整するのは Gold への当てはめになる。** F3a は重みを固定したまま報告する。

---

## 7. runtime

min 2.6 / mean 28.7 / **max 148.0 ms**。解析経路に何も差し込んでいないため、既存 `phase4-v1` の実測値 + shadow 計算のオーバーヘッドである。

---

## 8. F3b 推奨 / 非推奨 → **非推奨**

1. **全体で悪化する**（canonicalExact −5.9pp、cost +349）
2. **助けたい subset では同点**（pedal / inversion / rootless / plain-triad すべて cost 差 0）。接続すれば純損失
3. **stress で最も悪化**（cost +263）。三値化で重みを捨てたことが原因と推測される

### ただし1つ残す価値がある

三値判定は製品が出していない情報を出している。

| | |
|---|---|
| triad がどれも supported でない window | **11.6%** |
| seventh がどれも supported でない window | **7.9%** |
| 欠落のまま生き残った候補 / window | **1.50** |

**これは quality の決定に使うのではなく、ユーザーへ「この和音は確定していない」と伝えるための材料である。** 製品は 78.7% の canonicalExact で残り 21.3% を黙って断定しているが、そのうちどれが「根拠があって断定した」のか「根拠がないまま断定した」のかを区別する手段がいまは無い。

これは quality 選択の改善ではなく **ambiguity 表示**の話であり、F3b（quality を Primary へ）とは別の Stage として扱うべきである。着手していない。

---

## 9. 変更していないもの

- **製品Primary**（`defaultAnalyzerMode` = `phase4-v1`）
- root / bass（入力として受け取り、導出していない）
- **tension 検出**
- 保存 schema / `fileVersion` = 1
- F2R / F2W の閾値
- root 研究の各決定（`03-stage-f-decisions.md` §9 で固定済み）

subset は scenario の title と stressFeatures から導出しており、fixture ID・コード名・小節位置は使っていない。

---

## 10. 検証

`npm run lint` PASS / `npx tsc --noEmit` PASS / `npm test -- --run` **1566 passed (182 files)** / `npm run build` PASS / `cargo test` PASS / `git ls-files "*.mid"` **0 files**
