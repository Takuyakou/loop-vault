# Loop Vault Stage F2R — Selective Root Correction Shadow

- 作成日: 2026-07-26
- **製品Primaryに接続していない**
- **結論: 昇格対象なし。** 事前登録閾値のもとで規則は実質的に不活性だった
- `defaultAnalyzerMode` は `phase4-v1` のまま

---

## 1. 結論

| 指標 | 値 |
|---|---|
| **overrideCount** | **1**（7490 window 中） |
| **overridePrecision** | **0.0%**（1件中0件が正解） |
| **wrongToCorrect** | **0** |
| **correctToWrong** | **0** |
| **netCorrectionGain** | **0** |
| **abstentionRate** | **99.99%** |
| **correction cost 差** | **±0**（全 subset） |

**害も益も無い。** phase4-v1 Top 1 は既定のまま一度も損なわれず、同時に一度も改善もしなかった。

唯一発火した1件: Chord Drip の inversion window。product が G、F2R が F を提案、gold は C。**wrong-to-wrong**（間違いを別の間違いへ）で、部分的成功とは数えていない。

---

## 2. 事前登録

閾値は**測定前に**凍結した（`03-f2r-preregistered-thresholds.json`、`frozenBeforeMeasurement: true`）。導出はすべて F1 / F2 で既に公開済みの**証拠分布**からで、override の当たり外れからではない。

| 条件 | 閾値 | 導出 |
|---|---|---|
| 1. 接戦 | `contestBand = 0.05` | 公開済み rootMargin 平均 0.14444 の約1/3 |
| 2. relation 信頼度 | `relationMargin ≥ 0.25`、`bassEvidenceAmount ≥ 0.5`、`bassMargin ≥ 0.5` | relation は 0..1 スケールなので1/4が明確な差。bass 側は公開済み平均（1.030 / 0.878）の約半分 |
| 3. 代替に骨格証拠 | `tertianSkeleton > 0` かつ（`rootPresence > 0` または `shellSkeleton > 0`） | スコアが高いだけでなく正の構造的証拠 |
| 4. 現Top1に明確な反証 | `rootPresence == 0` または defining triad tone が `contradicted` | **`underdetermined` は不可**。F1 が存在する理由そのもの |
| 5. 既知候補内 | shadow Top 3 ∪ product bass ∪ product alternatives | F2 で inversion / pedal-slash の top3 が 100% だったため |
| 6. 未達なら abstain | — | abstain が既定の帰結であり、fallback ではない |

### 対象外の定義

- **walking / none**: 除外（F2W）
- **plain-triad**: 除外。**音から判定**する（Top1 の root・3度・5度が鳴り、7度が無く、最低音が root）。corpus の subset ラベルや fixture ID は使っていない — ID を鍵にすれば、それを含む実際の曲で動かなくなる

---

## 3. Hard Gate

| Gate | 結果 |
|---|---|
| `plain-triad-never-touched` | **PASS**（0 override） |
| `walking-never-touched` | **PASS**（case kind に walking なし） |
| `net-correction-gain-positive` | **中立**（0） |

---

## 4. subset 別

すべて override 0、correction cost 差 ±0。

| subset | window | gold | override | net | cost差 |
|---|---|---|---|---|---|
| pedal-slash | 272 | 256 | **0** | 0 | **0** |
| inversion | 256 | 240 | **0** | 0 | **0** |
| rootless | 483 | — | 0 | 0 | 0 |
| plain-triad | 16 | 16 | **0** | 0 | **0** |
| chord-drip | 1300 | 971 | **1** | 0 | 0 |
| Synthetic Gold / Long-form / regression-v3（clean+stress） | 5746 | 4991 | 0 | 0 | 0 |
| Endless / SURAN / Chapter 3（private） | 444 | — | 0 | 0 | 0 |

---

## 5. なぜ不活性だったか — abstain の内訳

| 理由 | 件数 | 割合 |
|---|---|---|
| **not-contested**（条件1） | **4714** | **63.0%** |
| incumbent-not-contradicted（条件4） | 1066 | 14.2% |
| relation-confidence-too-low（条件2） | 773 | 10.3% |
| relation-out-of-scope（walking / none） | 508 | 6.8% |
| plain-triad | 428 | 5.7% |

**条件1が全体の6割を止めている。**

---

## 6. 事前登録の方法論的な誤り（訂正、ただし再調整はしない）

`contestBand = 0.05` を**公開済み rootMargin の分布**から導いた。しかし rootMargin は「shadow 自身の1位と2位の差」で、条件1が測るのは「**製品の root と shadow の代替候補の差**」である。**別の量である。** 両者が一致するのは製品の root が shadow の1位と同じときだけで、F2 が示したとおりそれは全体の 77% にすぎない。

今回の実行で、正しい分布を初めて観測した:

| contestGap | 値 |
|---|---|
| p10 | **0.0591** |
| p25 | 0.1040 |
| p50 | 0.2280 |
| p90 | 0.3032 |

**事前登録した 0.05 は 10 パーセンタイルより下**で、条件1に到達した window の 9割以上を排除していた。

**これを見てから閾値を動かすことはしない。** それは契約が禁じる Gold への当てはめそのものである。分布は観測として記録し、次段の事前登録材料とする。

---

## 7. 昇格推奨

**推奨しない。昇格対象が存在しない。**

override が1件では、精度も net gain も統計的に何も言っていない。「害が無い」ことは確認できたが、それは規則が何もしていないことと区別できない。

### 次段への提案（F2R-v2）

1. 今回公開した **contestGap 分布から** `contestBand` を事前登録し直す
2. 開発は **dev split のみ**で行い、regression-v3 は触らない
3. ただし**帯を広げれば良くなるという証拠は無い**。唯一発火した1件は wrong-to-wrong だった。候補は F2 が製品より劣ると測定した shadow ランキングから来ており、帯を広げれば劣ったランキングをより多く採用することになる
4. したがって F2R-v2 に着手する前に、**F2W の候補生成の問題**（walking で top3 60.9%）を先に潰すほうが順序として正しい可能性がある

---

## 8. 検証

`npm run lint` PASS / `npx tsc --noEmit` PASS / `npm test -- --run` **1525 passed (181 files)** / `npm run build` PASS / `cargo test` PASS / `git ls-files "*.mid"` **0 files**

製品出力・保存schema・`fileVersion`・`defaultAnalyzerMode` すべて無変更。
