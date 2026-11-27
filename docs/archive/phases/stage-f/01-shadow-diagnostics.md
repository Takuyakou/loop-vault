# Loop Vault Stage F1 — Shadow Diagnostics

- 作成日: 2026-07-26
- **製品出力に接続していない**
- `defaultAnalyzerMode` は `phase4-v1` のまま
- 保存schema・`fileVersion`・canonical identity・`qualityEvidence` 係数 いずれも無変更

---

## 1. なぜ先に測るのか

いまの検出器の間違い — pedal を root と読む、rootless voicing を bass から命名する — は**出力を見ても分からない**。分かるのは、検出器が手にしていた材料の側である。F1 はそれを露出させるだけで、何も判断しない。

## 2. 設計が立っている2つの規則

### 2.1 「音が無い」は「否定された」ではない

短3度がどこにも鳴っていないなら、そのコードは「minor ではない」のではなく、**minor と他の何かの間で未確定**である。minor を否定するのは、長3度が明確に鳴っているときだけ。

この2つを1つの「absent」へ潰すと、**根拠の無いコードに自信を持つ検出器**になる。実測でも効いている（§5）。

### 2.2 現行仮説を判断に使わない

現行のコード仮説は比較用の参照として持ち歩くだけで、どのスコアの入力にもしていない。使えば**evidence が、evidence であるはずの当の答えの関数**になる。テストで直接主張している。

`bassChordToneRatio` は hard routing に使っていない。guide tone だけで root を一意に決めていない（Top3 と `rootless-inferred` を保持する）。

---

## 3. Hard Gate 結果

| Gate | 結果 |
|---|---|
| `product-timeline-unchanged` | **PASS 199/199** |
| `candidate-rank-unchanged` | **PASS 199/199** |
| `warnings-unchanged` | **PASS 199/199** |
| 保存schema | 無変更 |
| deterministic | PASS（domain 30件 + 製品2回実行の一致） |
| private MIDI 混入 | **0 files**、診断JSONに絶対パス・個人ファイル名なし |

対象: **199ファイル、7490 window**（Synthetic Gold 48 / Long-form 24 / regression-v3 16 / Chord Drip 100 / private 11）

---

## 4. bass-upper relation 分布

| relation | 件数 | 割合 |
|---|---|---|
| aligned | 5742 | **76.7%** |
| pedal | 1240 | **16.6%** |
| walking | 501 | 6.7% |
| none | 7 | 0.1% |

**6件に1件が pedal。** bass と upper が別のことを言っている window がこれだけあるという事実が、bass relation routing（F4）の前提になる。

---

## 5. defining tone 分布 — 「未確定」は捨てられていない

| quality | supported | contradicted | **underdetermined** |
|---|---|---|---|
| major | 49.6% | 39.0% | **11.4%** |
| minor | 32.5% | 50.4% | **17.1%** |
| minor7 | 59.9% | 28.6% | **11.5%** |
| major7 | 32.5% | 56.0% | **11.5%** |
| diminished7 | 2.0% | 86.5% | **11.5%** |

**minor が未確定の window が 17.1%。** これを「否定」に丸めていたら、その1280 window すべてで根拠の無い断定をしていたことになる。

---

## 6. ambiguity 分布

| ambiguity | 件数 | 割合 |
|---|---|---|
| `rootless-inferred` | 1850 | 24.7% |
| `pedal-or-root` | 1298 | 17.3% |
| `inversion-or-added` | 929 | 12.4% |
| `tension-uncertain` | 861 | 11.5% |
| `quality-underdetermined` | 551 | 7.4% |

F1 では **UI に一切出していない**。どれが発火するかを先に知っておくことで、後続 Stage が「対処する価値のある対象があるか」を実装前に判断できる。

---

## 7. root evidence 分布と差分台帳

| | 値 |
|---|---|
| 製品 root がある window | 7490 |
| shadow root と**不一致** | **1698**（22.7%） |
| 一致率 | **77.3%** |

### subset 別（ここが本題）

| subset | window | root 不一致 | 割合 | rootless |
|---|---|---|---|---|
| **plain-triad** | 16 | **0** | **0.0%** | 0 |
| clean | 2512 | 92 | **3.7%** | 162 |
| humanized | 1459 | 183 | 12.5% | 451 |
| arpeggiated | 1011 | 258 | 25.5% | 316 |
| tension-rich | 36 | 12 | 33.3% | 21 |
| half-bar-2chord | 33 | 12 | 36.4% | 18 |
| chord-drip | 1300 | 519 | 39.9% | 365 |
| **pedal-slash** | 272 | 130 | **47.8%** | 69 |
| **inversion** | 256 | 126 | **49.2%** | 59 |
| private（Endless/SURAN/Chapter3） | 444 | 232 | 52.3% | 201 |
| **rootless** | 483 | 265 | **54.9%** | 190 |
| **walking-bass** | 531 | 304 | **57.3%** | 210 |

**分布が仮説と一致している。** shadow root が製品と食い違うのは、bass が何かしている（walking / pedal / inversion）か root が鳴っていない（rootless）場所に集中し、**plain-triad では1件も食い違わない**。

「新しい方式が単に別のことを言っているだけ」なら、plain-triad でも食い違うはずである。

---

## 8. subset の決め方

scenario の **title と stressFeatures から導出**しており、`S16` や `H3` のような fixture ID では判定していない。ID を鍵にするのは契約が禁じる hard-coding であり、scenario 名を変えた瞬間に壊れる。

---

## 9. 実装中に直した2件

いずれもテストで露見した。

### 9.1 plain triad が rootless minor7 と読まれていた

C-E-G の G を「A の短7度」と数え、**幻の root A が本物とほぼ同点**になっていた。`shellSkeleton` と `guideToneImplication` が、候補 root が鳴っていなくても満点を取れていたのが原因。**推定された root は、聞こえている root より弱い証拠である**という当たり前のことを式に入れた（tertian 項が既に使っていたのと同じ 0.6 の割引）。

tritone 両義性は保持されている（E+Bb だけなら C と Gb が同点 → `rootless-inferred`）。

### 9.2 `quality-underdetermined` が root+5th で発火しなかった

root と 5th は `power` を supported にするので「どれかの triad が supported」条件を満たしてしまっていた。**問われているのは3度**なので、major と minor が両方 underdetermined かを見る形へ変えた。

---

## 10. runtime

F1 は解析経路に何も差し込んでいないため、記録した runtime は既存 `phase4-v1` の実測値そのもの。

---

## 11. F2 への引き渡し

evidence が揃い、それが製品を1バイトも動かさないことが 199ファイルで確認できた。F2 は `rootPresence` / `tertianSkeleton` / `susSkeleton` / `shellSkeleton` / `guideToneImplication` / weak keyPrior / capped continuity だけから **quality template に依存しない root** を shadow 計算し、quality 層のパラメータを ±30% 動かしても結果が完全一致することを検証する。
