# Loop Vault Stage F2W — Walking Bass Candidate Generation Shadow

- 作成日: 2026-07-26
- **製品出力に接続していない**
- **結論: 仮説は棄却された。walking は候補生成の問題ではない。F2Wb は非推奨**
- `defaultAnalyzerMode` は `phase4-v1` のまま

---

## 1. 仮説と、それが外れたこと

F2 の walking は top1 11.8% / top3 60.9% だった。F2W はこう仮説を立てて始めた:

> 4割の window で正解 root がそもそも候補に入っていない。ランキングでは直せない生成の失敗である。

**測定はこれを否定した。**

| 指標 | 全 variant / 全 subset |
|---|---|
| **walkingCandidateRecall** | **100%** |

正解 root は**常に**12候補の中に正のスコアで存在している。**入っていないのではなく、順位で負けている。**

F2 の「top3 60.9%」は「候補に無い」ではなく「4位以下に沈んでいる」を意味していた。F2 のレポートでこれを候補生成の問題と書いたのは推測であり、今回それが誤りだったと確認できた。

---

## 2. subset を3通りで定義した — そして3つは一致しない

F1 の `relation` だけで subset を定義すると**循環**する。分類器が取りこぼした window は黙って subset から消え、測定はその分類器を実際より良く見せる。

| 定義 | window |
|---|---|
| corpus 宣言（`walking-bass` stressFeature） | 531 |
| **音から判定**（低域3音以上・3オンセット以上・上声より速い） | 265 |
| F1 relation = walking | 501 |
| **3つすべて** | **4** |
| いずれか | 938 |

**3定義の一致はわずか4 window。** これ自体が結果である。「walking bass」という subset は、いま3つの互いに独立でない基準で別々のものを指しており、**F2 の 60.9% は relation 定義に固有の数字**だった。

数値は3定義それぞれで分けて報告する。

---

## 3. 6 variant の比較（ランキングは固定）

### walking（音から判定、gold 8 window）

| variant | @1 | @3 | @5 | recall | H | −pass | −root |
|---|---|---|---|---|---|---|---|
| current | 37.5% | 87.5% | 100% | **100%** | 3.265 | 0 | 0 |
| strong-beat | 37.5% | 87.5% | 100% | 100% | 3.255 | 4 | **0** |
| long-duration | 37.5% | 87.5% | 100% | 100% | 3.263 | 2 | **2** |
| passing-tone-attenuated | 37.5% | 87.5% | 100% | 100% | 3.260 | 0 | 0 |
| faster-than-harmony | **25.0%** | 87.5% | 100% | 100% | 3.265 | 0 | 1 |
| chord-boundary-preferred | 37.5% | 87.5% | 100% | 100% | 3.265 | 0 | 0 |

gold 8 window では何も言えない。**この定義は狭すぎた。**

### walking（F1 relation、gold 110 window）

| variant | @1 | @3 | @5 | recall | −pass | −root |
|---|---|---|---|---|---|---|
| current | 10.9% | 61.8% | 91.8% | **100%** | 0 | 0 |
| **strong-beat** | 10.9% | 61.8% | **98.2%** | 100% | **83** | **0** |
| long-duration | 10.9% | 61.8% | 91.8% | 100% | 2 | 2 |
| passing-tone-attenuated | 10.9% | 61.8% | 91.8% | 100% | 0 | 0 |
| faster-than-harmony | 10.9% | 61.8% | 91.8% | 100% | 0 | 0 |
| chord-boundary-preferred | 10.9% | 61.8% | 91.8% | 100% | 0 | 0 |

### walking（corpus 宣言、gold 357 window）

| variant | @1 | @3 | @5 | recall | −pass | −root |
|---|---|---|---|---|---|---|
| current | 52.9% | 87.1% | 98.0% | **100%** | 0 | 0 |
| **strong-beat** | 52.9% | 87.1% | **100%** | 100% | **170** | **0** |
| 他4種 | 52.9% | 87.1% | 98.0% | 100% | ≤2 | ≤2 |

**@1 と @3 はどの variant でも1件も動かない。** 動くのは @5 だけである。

---

## 4. `wrongPassingToneRemoved` / `correctRootRemoved`

`strong-beat` だけがはっきり働いている。

| 定義 | −pass | −root |
|---|---|---|
| walking（relation） | **83** | **0** |
| walking（宣言） | **170** | **0** |
| pedal-slash | 12 | 0 |
| plain-triad | **0** | **0** |
| 全体 | 176 | **1** |

**通過音を大量に落として正解 root をほぼ落としていない。** 除去の精度としては良い。それでも @1 と @3 が動かないので、**除去された通過音は最初から上位を占めてはいなかった**ということになる。

`long-duration` は −pass 107 に対し −root 2 で、除去の質が劣る。

---

## 5. 非回帰

| subset | 全 variant |
|---|---|
| **plain-triad** | @1 **100%** / @3 100% / −root **0**（6 variant すべて） |
| **pedal-slash** | @3 **100%**（6 variant すべて）、@1 61.7% で不変 |
| **inversion** | @3 **100%**（6 variant すべて）、@1 59.2% で不変 |
| non-walking | @1 86.6% → 86.1〜86.5%（**わずかに悪化**） |
| 全体 | @1 83.5% → 83.1〜83.4%（**わずかに悪化**） |

**どの variant も全体を改善していない。** 最良でも横ばい、多くはわずかに悪い。

---

## 6. rootCandidateEntropy

| subset | current | 最小 |
|---|---|---|
| plain-triad | 2.840 | 2.840（全 variant 同一） |
| pedal-slash | 3.229 | 3.227 |
| walking（relation） | 3.317 | 3.310 |

エントロピーはほぼ動かない。**証拠の尖り方が変わっていない**ので、重み付けを変えても分布の形が変わっていないことが分かる。plain-triad が最も低い（証拠が1候補を名指ししている）のは期待どおり。

---

## 7. runtime / 決定性

| | |
|---|---|
| runtime | min 2.5 / mean 34.6 / **max 176.1 ms** |
| deterministic | **199/199 PASS**（同一入力で3回同一） |

F2W は解析経路に何も差し込んでいないため、runtime は既存 `phase4-v1` の実測値 + shadow 計算のオーバーヘッドである。

---

## 8. F2Wb 推奨 / 非推奨 → **非推奨**

理由は3つ。

1. **直そうとした対象が存在しなかった。** candidateRecall が 100% なので、候補生成に失敗は無い。F2Wb（bass 候補生成の改良）は無い問題を直すことになる。
2. **6 variant のどれも @1 / @3 を1件も動かさない。** @5 だけが `strong-beat` で改善するが、@5 は製品のどこにも使われていない。
3. **全体はわずかに悪化する。** walking を助けて他を壊さない variant は無く、最良でも横ばいである。

### 唯一の収穫

`strong-beat` は通過音を 170 件落として正解 root を **0 件**しか落とさない。除去規則としては筋が良い。ただし**それが順位を変えないという事実**が、通過音は元々問題ではなかったことを示している。

---

## 9. 次に何を見るべきか（提案、着手しない）

walking の真の問題は **@1 10.9% と @3 61.8% の間**にある。正解は候補にあり、正のスコアを持ち、しかし3位以内に入らない。

見るべきは、**walking window で1〜3位を占めているのが何か**である。それは通過音ではない（落としても順位が変わらないので）。おそらく上声側の解釈か、`tertianSkeleton` / `shellSkeleton` の相対重みである。

**その前に subset の定義を1つに決める必要がある。** 3定義の一致が4 window しかない状態では、どの数字を改善したのかを誰も検証できない。

---

## 10. 変更していないもの

- 製品 Primary / `defaultAnalyzerMode` = `phase4-v1`
- F2R 閾値（再調整していない）
- pedal / inversion / quality / tension / segmentation
- 保存 schema / `fileVersion` = 1
- Gold 情報を製品ロジックへ入れていない（Gold は評価スクリプト側のみ）

---

## 11. 検証

`npm run lint` PASS / `npx tsc --noEmit` PASS / `npm test -- --run` **1546 passed (182 files)** / `npm run build` PASS / `cargo test` PASS / `git ls-files "*.mid"` **0 files**
