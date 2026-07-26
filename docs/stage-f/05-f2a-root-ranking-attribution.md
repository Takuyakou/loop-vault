# Loop Vault Stage F2A — Root Ranking Attribution Shadow

- 作成日: 2026-07-26
- **製品出力は完全不変**。重みも閾値も変更していない
- **結論: 敗因は validation で再現しない。root 研究を終了し、`phase4-v1` root を固定して F3 へ進むことを推奨する**

---

## 1. 主評価 subset

**corpus が `walking-bass` として事前注釈した Gold subset。** 88ファイル、**357 Gold walking window**。

F1 relation と音響 heuristic は **window の選択には使わず、分類器として corpus 注釈に対して測定**した。F2W で3定義の一致が4 window しかないと分かった以上、どれを使うかが答えを決めてしまう。

---

## 2. Gold root の順位

| 指標 | 値 |
|---|---|
| Gold walking window | **357** |
| product root が正解 | **335（93.8%）** |
| Gold root 平均順位 | **2.02**（中央値 **1**） |
| shadow Top 1 | **52.1%** |
| shadow Top 3 | **86.6%** |
| shadow Top 5 | **98.0%** |
| 順位を落とした window | **171** |

**product は 93.8% 正しい。** shadow が 52.1% で、負けているのは shadow のほうである。

---

## 3. 敗因の項目別内訳（171 window）

### dominant failure component

| 項目 | window | 割合 |
|---|---|---|
| **rootPresence** | **95** | **55.6%** |
| **continuity** | **59** | **34.5%** |
| shellSkeleton | 8 | 4.7% |
| guideToneImplication | 7 | 4.1% |
| tertianSkeleton / susSkeleton / keyPrior | 0 | 0% |

### 勝者のリードに寄与した項目（重複あり）

| 項目 | 割合 |
|---|---|
| rootPresence | **88.3%** |
| continuity | 48.0% |
| shellSkeleton | 18.1% |
| guideToneImplication | 8.8% |
| **tertianSkeleton** | **0.0%** |

### 勝者の平均加重優位

| 項目 | 差 |
|---|---|
| rootPresence | **+0.0408** |
| continuity | +0.0231 |
| shellSkeleton | +0.0138 |
| guideToneImplication | +0.0097 |
| **tertianSkeleton** | **−0.0152** |

**`tertianSkeleton` は一貫して Gold root の味方をしている。** 三和音の骨格は正しく働いており、それを `rootPresence` が上回っている。

---

## 4. 誤 Top 1 の正体 — 音名ではなく音程で

| Gold root からの半音 | window | 割合 |
|---|---|---|
| **+7（完全5度）** | **72** | **42.1%** |
| **+4（長3度）** | **42** | **24.6%** |
| +10（短7度） | 24 | 14.0% |
| +3（短3度） | 19 | 11.1% |
| +9 / +2 / +1 | 14 | 8.2% |

**上位2つは和音の構成音である。** 走るベースが5度と3度を通過し、`rootPresence`（鳴っている長さで重み付け）がその通過音に票を入れている。教科書どおりの署名であり、`rootPresence` を dominant blame とする診断と整合する。

コード名は一切使っていない。すべて Gold root からの相対音程で記録している。

---

## 5. **敗因は validation で再現しない**

これが判断を決める。

| split | window | lost | top1 | dominant | **rootPresence の寄与率** |
|---|---|---|---|---|---|
| dev | 16 | 12 | 25.0% | rootPresence 66.7% | **66.7%** |
| **validation** | **32** | **15** | **53.1%** | **shellSkeleton 53.3%** | **0.0%** |
| holdout-v2 | 191 | 88 | 53.9% | rootPresence 62.5% | **98.9%** |
| regression-v3 | 118 | 56 | 52.5% | rootPresence 57.1% | **100.0%** |

**validation では `rootPresence` が敗因に1件も寄与していない（0.0%）。** 敗因は shellSkeleton（100%）と guideToneImplication（100%）に完全に入れ替わっている。

dev / holdout-v2 / regression-v3 の3 split では `rootPresence` が 66.7% / 98.9% / 100% と支配的なので、**3対1で割れている**。指示の条件は「validation でも再現した場合のみ ablation を提案する」であり、**再現していない**。

validation の losing window は15件と少ないので、これを「validation が例外」と片付けることもできる。だが**それは都合の良いほうを選ぶことであり**、事前に決めた条件は validation での再現だった。

---

## 6. clean と stress で別の現象

| variant | window | top1 | 平均順位 | dominant |
|---|---|---|---|---|
| **clean** | 179 | **93.3%** | **1.07** | shellSkeleton（lost 12件のみ） |
| **stress** | 178 | **10.7%** | 2.98 | rootPresence（lost 159件） |

**clean では shadow root も 93.3% 正しい。** 失敗のほぼ全部が stress variant に集中している。

これは重要な留保である。F2 以降 walking の問題として測ってきたものは、**実際の walking bass の性質というより stress 生成器が加えた劣化の性質**である可能性が高い。実世界の MIDI で同じことが起きる保証は無い。

---

## 7. 分類器の一致率

| 指標 | 値 |
|---|---|
| corpus 注釈 walking window | 531 |
| F1 relation = walking | 147 |
| 音響 heuristic = walking | **7** |
| **F1 relation precision** | **90.5%** |
| **F1 relation recall** | **25.0%** |
| F1 relation agreement（全 5746 window） | 92.8% |
| 音響 heuristic agreement | 90.8% |

**F1 の walking 分類は precision 90.5% / recall 25.0%。** 当てたものはほぼ正しいが、注釈された walking の4分の1しか見つけていない。

**音響 heuristic は 531 中 7 window しか拾えていない。** F2W で私が書いた判定条件（低域3音以上・3オンセット以上・上声より速い）は厳しすぎた。agreement 90.8% は真陰性が支配しているだけで、検出器としては機能していない。**F2W の「音から判定」subset が8 gold window しか持たなかったのはこれが原因**である。

---

## 8. 推奨: **root 研究を終了し、`phase4-v1` root を固定して F3 へ進む**

限定 shadow ablation は**提案しない**。理由は4つ。

1. **敗因が validation で再現しない。** 事前条件を満たさない。
2. **product が既に 93.8% 正しい。** shadow が 52.1%。直す対象は shadow のほうであり、それは製品の改善ではない。
3. **失敗が stress variant に集中している**（clean 93.3% / stress 10.7%）。実世界の性質ではなく生成器の性質を追っている可能性が高い。
4. F2 / F2R / F2W / F2A の4段階を通じて、**shadow root が製品を上回った subset は1つも無い**。

### 記録しておく価値のある観察

- `tertianSkeleton` は一貫して正しい方向に働いている（平均 −0.0152）
- 誤答の 66.7% が Gold root の5度上か長3度上、つまりベースの通過音
- `rootPresence` を持続時間で重み付けする方式は、ベースが動く素材と相性が悪い

これらは将来 root を再訪するときの出発点になるが、**いま追う根拠は無い。**

---

## 9. 変更していないもの

- **製品出力は完全不変**（`defaultAnalyzerMode` = `phase4-v1`）
- 重み（`TERM_WEIGHTS`）を変更していない
- F2R / F2W の閾値を再調整していない
- 特定コード名・fixture ID・小節位置を製品ロジックへ入れていない（誤答は音程で記録）
- 保存 schema / `fileVersion` = 1

---

## 10. 検証

`npm run lint` PASS / `npx tsc --noEmit` PASS / `npm test -- --run` **1546 passed (182 files)** / `npm run build` PASS / `cargo test` PASS / `git ls-files "*.mid"` **0 files**
