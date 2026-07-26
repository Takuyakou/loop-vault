# Loop Vault Stage F5a — Independent Tension Detection Shadow

- 作成日: 2026-07-26
- **製品出力へ接続していない**
- root / bass / triad / seventh は `phase4-v1` から**入力として受け取り、一切再検討していない**
- **結論: F5b は非推奨。recall だけ上がって false positive が増えた。tension 研究を終了し F7 へ進むことを推奨する**

---

## 1. 必須不変条件 — すべて PASS

| Gate | 結果 |
|---|---|
| `core-sequence-unchanged`（root / bass / triad / seventh の4列） | **PASS 199/199** |
| `core-invariant-under-perturbation` | **PASS 199/199**（0.7 / 1.0 / 1.3） |
| `perturbation-not-vacuous` | **PASS 30/199** |

3つ目は正直に 30/199 と記録する。**閾値の境界に乗っている tension を持つファイルが 199 中 30 しかない**という意味であり、摂動が効くこと自体は確認できている。ここを「199/199」に見せる書き方はしていない。

4列は入力なので動かないが、製品の core 列と shadow の core 列を**直接比較して** 199/199 を確認した。

---

## 2. 二つの設計上の問題への対処

### 2.1 同じ音程が、下の和音次第で別の意味になる

root から6半音は、5度が鳴っていれば **`#11`**、鳴っていなければ **`b5`**。9半音は7度があれば **`13`**、なければ **`6`**。3半音は長三和音の上なら **`#9`** だが短三和音では**核**である。

そこで各候補を**固定された core に対して解釈**し、core の構成音である音程は `contradicted` にして二重計上を避けた。テーブル参照ではないので**コード名はどこにも現れない**。

### 2.2 鳴っている音が tension とは限らない

メロディの通過音、装飾音、グレースノート — どれも作曲者が拡張を書いていなくても pitch class を window に置く。

そこで4つの支持を**別々に記録**し、独立に2つ以上が一致したときだけ assert する。

| 支持 | 内容 |
|---|---|
| presence | その pitch class が鳴っているか |
| duration | window に対して鳴っている割合（melody のみなら減衰） |
| metric-position | 強拍で始まるか |
| voice-role | 最も強い役割（harmony / bass > mixed > melody） |
| sustained | 単一の音が1拍以上続くか |
| conflict with core | その音程が固定 core の構成音か |

**通過音は presence しか持たないので2に届かない。** 短い melody の音が弱拍で始まった場合は `underdetermined` に落ち、assert されない。

---

## 3. 結果 — recall は上がり precision は崩れた

Gold 5962 window（product → shadow）

| 指標 | product | shadow | 差 |
|---|---|---|---|
| tension precision | **74.6%** | 46.3% | **−28.3pp** |
| tension **recall** | 58.7% | **61.3%** | **+2.6pp** |
| tension F1 | **65.7%** | 52.7% | −13.0pp |
| **false positive / window** | **0.082** | 0.290 | **3.5倍** |
| canonicalExact | **78.7%** | 68.6% | −10.1pp |
| **correction cost** | — | — | **+601** |

**これは指示が非推奨と定めた形そのものである。**

> recall だけ上がって false positive が増える場合は非推奨

---

## 4. subset 別

| subset | gold | precision | recall | F1 | FP/window | canonicalExact | cost差 |
|---|---|---|---|---|---|---|---|
| **plain-triad** | 16 | — | — | — | **0.000→0.000** | 100→**100** | **0** |
| tension-rich | 341 | 87.2→**55.7** | 88.4→**98.2** | 87.8→71.1 | 0.109→0.651 | 85.0→42.2 | +146 |
| arpeggiated | 659 | 99.5→79.4 | 52.1→54.0 | 68.4→64.3 | 0.002→0.080 | 62.7→54.5 | +54 |
| **humanized** | 1239 | 65.7→**22.6** | 96.3→**99.0** | 78.1→36.8 | 0.121→**0.815** | 87.7→59.0 | **+356** |
| clean | 3446 | 80.6→70.5 | 54.0→55.5 | 64.7→62.1 | 0.065→0.116 | 77.9→75.2 | +94 |
| **stress** | 2516 | 65.4→**28.7** | 70.0→**75.2** | 67.7→41.5 | 0.105→0.529 | 79.8→59.6 | **+507** |

**plain-triad への tension 誤追加は product 0 / shadow 0。** 過検出の防御は効いている。

**それでも humanized と stress で precision が崩壊する。** humanized は 65.7% → 22.6%、FP/window は 0.121 → 0.815。人間的なずれを加えた素材では、装飾音と拡張の区別が2支持ルールでは足りない。

`tension-rich` で recall が 88.4% → 98.2% に上がるのは狙いどおりだが、**precision が 87.2% → 55.7% に落ちて canonicalExact が 85.0% → 42.2% になる**ので、正味では大きな損失である。

---

## 5. corpus 別

| corpus | gold | precision | recall | canonicalExact | cost差 |
|---|---|---|---|---|---|
| Synthetic Gold | 1300 | 64.2→43.5 | 86.5→92.1 | 91.4→86.5 | +64 |
| Long-form v1.1 | 2423 | 76.0→39.7 | 81.9→84.9 | 85.3→69.5 | **+382** |
| regression-v3 | 1268 | 88.0→54.4 | 85.1→88.4 | 90.5→78.5 | +153 |
| **Chord Drip** | 971 | 64.5→58.7 | 26.2→27.7 | 29.7→**29.5** | **+2** |
| Endless / SURAN / Chapter 3 | 0 | tension の Gold 注釈なし | — | — | 0 |

Chord Drip はほぼ横ばい（cost +2）。Long-form が最も悪化する。

**Endless / SURAN / Chapter 3 Seed は tension の Gold 注釈を持たない**ので精度を測れない。実行しており、core 不変の 199/199 には含まれている。

---

## 6. alteration だけの精度 — 両者とも実用水準にない

| | precision | recall |
|---|---|---|
| product | **測定不能**（alteration を1つも予測していない） | **0.0%** |
| shadow | **6.3%** | 18.1% |

**製品は alteration を一切検出していない。** `b9` / `#9` / `#11` / `b13` / `b5` / `#5` の recall が 0.0% である。これは既知の弱点（`A7#5` → `A7`）の定量化でもある。

shadow は recall 18.1% まで上げるが precision 6.3%、つまり**16件当てるために15件外す**。これは改善ではない。

---

## 7. その他の観測

| | |
|---|---|
| Gold に tension が無い window への誤追加 | product **301** → shadow **577** |
| `underdetermined` / window | **6.00**（候補10スロット中） |
| runtime | min 2.5 / mean 30.3 / **max 146.8 ms** |

`underdetermined` が平均6件というのは、**assert しない判断が大量に出ている**ことを意味する。過検出の防御としては働いているが、同時に**識別力が弱い**ことも示している。

---

## 8. F5b 推奨 / 非推奨 → **非推奨**

指示の判定基準に照らすと:

| 条件 | 結果 |
|---|---|
| precision と recall の**両方**が改善し correction cost が下がる → 推奨 | **満たさない**（precision −28.3pp、cost +601） |
| **recall だけ上がって false positive が増える → 非推奨** | **これに該当**（recall +2.6pp、FP/window 3.5倍） |
| 明確な改善がなければ tension 研究を終了し F7 へ | **該当** |

**F5b は非推奨。tension 研究を終了し、F7 へ進むことを推奨する。**

---

## 9. 記録に残す価値のある発見

1. **製品は alteration を1つも検出していない**（recall 0.0%）。既知の `A7#5` → `A7` は個別の不具合ではなく、alteration 検出が存在しないことの一例である。
2. **通過音の防御は効いた**。plain-triad への誤追加は 0 のまま。2支持ルールは過検出を防ぐ方向には働いている。
3. **足りないのは識別力**。humanized で precision が 22.6% まで落ちるのは、装飾音と拡張を分けるには「2つ以上の支持」が粗すぎるということである。
4. **同じ音程の二重解釈は正しく扱えた**（`#11`/`b5`、`13`/`6`、`#9`/核）。core を固定したからこそ可能で、これは F5 系の設計として正しかった部分である。

F7（曖昧性表示）は、この4番目と F3a の三値判定を合わせて**「この和音は確定していない」と伝える**方向であり、精度を上げる方向ではない。**Stage F を通じて一貫して、製品の判断を置き換える試みはすべて悪化させ、判断の不確かさを伝える材料だけが残った。**

---

## 10. 変更していないもの

- **製品Primary**（`defaultAnalyzerMode` = `phase4-v1`）
- root / bass / triad / seventh（入力として受け取り、再検討していない）
- quality template 同士の再競合（させていない）
- extension penalty（製品経路から削除していない）
- 保存 schema / `fileVersion` = 1
- F3a の三値情報を tension の正解判定へ流用していない
- Gold は評価のみに使用

subset は scenario の title と stressFeatures から導出しており、fixture ID・コード名・小節位置は使っていない。

---

## 11. 検証

`npm run lint` PASS / `npx tsc --noEmit` PASS / `npm test -- --run` **1592 passed (183 files)** / `npm run build` PASS / `cargo test` PASS / `git ls-files "*.mid"` **0 files**
