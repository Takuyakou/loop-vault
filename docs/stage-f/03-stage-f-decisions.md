# Loop Vault Stage F — 確定した決定

- 更新日: 2026-07-26

---

## 1. F2b — **不採用（固定）**

factorized root を製品 Primary へ接続する F2b は**採用しない**。この判断は固定であり、再検討には新しい証拠を要する。

根拠（Stage F2、gold 5962 window）:

| | product | shadow top1 |
|---|---|---|
| 全体 | **92.1%** | 80.2% |
| rootless | **99.4%** | 52.3% |
| walking-bass | **93.8%** | 52.4% |
| inversion | **86.7%** | 57.5% |
| pedal/slash | **87.5%** | 58.6% |

correction cost **+708**。改善した subset は**ひとつも無い**（plain-triad が同点）。

---

## 2. F4 bass relation routing — **製品 Primary への直接接続を禁止**

bass relation を root 決定へ直結してはならない。F1 で relation の実体（pedal 16.6%、walking 6.7%）は確認できたが、**relation が正しいことと、relation を根拠に root を差し替えてよいことは別**である。F2 は、relation が最もはっきりしている場所（walking）で shadow root が最も外れる（top1 11.8%）ことを示した。

接続するなら shadow 段階で net gain を先に示すこと。

---

## 3. F2R — 実施済み、**昇格対象なし**

詳細は `03-f2r-selective-root-correction.md`。事前登録閾値のもとで override は 7490 window 中 **1件**、net gain **0**。害も益も無い。

---

## 4. F2W — **未着手**

walking bass は F2R から除外し、別 Stage とする。F2 の実測: shadow top1 **11.8%** / top3 **60.9%**（gold 110 window）。**top3 の時点で取りこぼしている**ので、順位付けではなく候補生成の問題である。

推測（未検証）: 低音バンドを「最低音 + 1オクターブ」で取っているため、走るベースの通過音がすべて入って票を割っている。F2W はまずこの仮説の検証から始めるべきで、重み調整から始めてはならない。

---

## 5. 変わっていないもの

- `defaultAnalyzerMode` = `phase4-v1`
- 製品 Primary のコード名
- 保存 schema / `fileVersion` = 1
- canonical identity 契約 / `qualityEvidence` 係数 / global penalty
- P4.1.3 Manual Candidate Rescue
- `derived-length` generator / Candidate Catalog / Recommendation

---

## 6. F2R — **非昇格（固定）**

F2R の非昇格判断を固定する。再検討には新しい証拠を要する。

事前登録閾値のもとで override は 7490 window 中 **1件**、netCorrectionGain **0**、abstention **99.99%**、correction cost 差は全 subset で **±0**。唯一の発火は wrong-to-wrong。

**害が無いことは確認できたが、規則が何もしていないことと区別できない。** 統計的に何も言えていないものを昇格させない。

`contestBand` の事前登録が誤った分布（rootMargin）から導かれていたことは `03-f2r-selective-root-correction.md` §6 に記録した。**その観測を見てから閾値を動かすことはしない。**

---

## 7. F2W — **否定結果を固定**、F2Wb は非推奨（固定）

walking の失敗は**候補生成ではない**。`walkingCandidateRecall` は全 variant 全 subset で **100%**。正解 root は常に12候補の中に正のスコアで存在しており、順位で負けているだけである。

bass 重み付けの6 variant はどれも **@1 と @3 を1件も動かさない**。`strong-beat` は通過音を170件落として正解 root を0件しか落とさないが、**それが順位を変えないという事実が、通過音は元々問題ではなかったことを示している**。全体はどの variant でもわずかに悪化する。

F2Wb（bass 候補生成の改良）は**無い問題を直すことになる**ので進まない。

補足: walking subset の3定義（corpus 宣言 531 / 音から判定 265 / F1 relation 501）の一致は**わずか4 window**。F2 の 60.9% は relation 定義に固有の数字だった。

---

## 8. F2A — root 研究の終了を推奨

敗因は **`rootPresence` 55.6% / `continuity` 34.5%** に集中しており、誤答の 66.7% は Gold root の5度上か長3度上（走るベースの通過音）。診断としては明快である。

**しかし validation で再現しない。** dev 66.7% / holdout-v2 98.9% / regression-v3 100% に対し **validation は 0.0%**。事前に決めた条件は「validation でも再現した場合のみ ablation を提案する」であり、満たしていない。

加えて product は Gold walking window で **93.8%** 正しく、shadow は 52.1%。失敗は **stress variant に集中**している（clean 93.3% / stress 10.7%）。

**推奨: root 研究を終了し、`phase4-v1` root を固定して F3 へ進む。**

---

## 9. root 研究 — **終了（固定）**

| 項目 | 決定 |
|---|---|
| **製品 root** | **`phase4-v1` の root を製品 root として固定** |
| **F2b**（factorized root を Primary へ） | **非昇格（固定）** |
| **F2R**（selective root correction） | **非昇格（固定）** |
| **F2Wb**（bass 候補生成の改良） | **非昇格（固定）** |
| **F4 Primary root routing** | **禁止**。bass relation を root 決定へ直結してはならない |
| **F0〜F2A** | **診断基盤として残す**。製品経路へは接続しない |
| **F2W の音響 heuristic** | **製品判断へ使用しない**。531 の注釈 walking window のうち7しか拾えず、検出器として機能していない |

根拠の要約: F2 / F2R / F2W / F2A の4段階を通じて、**shadow root が製品を上回った subset は1つも無い**。Gold walking window で product は 93.8%、shadow は 52.1%。F2A の敗因診断は明快だったが validation で再現せず、失敗は stress variant に集中していた（clean 93.3% / stress 10.7%）。

将来 root を再訪する場合の出発点は `05-f2a-root-ranking-attribution.md` §8 に記録した。

---

## 10. F3a — F3b は非推奨

root / bass を `phase4-v1` から入力として固定し、同一 root 内でのみ quality を比較する三値判定を shadow 実装した。不変条件は4つすべて PASS（root 列 199/199、bass 列 199/199、摂動下の不変 199/199、非空虚 199/199）。

三値判定は設計どおり働いている（反証による除外 7.12/window、**欠落のまま生存 1.50/window**）が、精度は製品より悪い（canonicalExact 78.7% → 72.8%、cost **+349**）。

**形が重要**: 助けたい subset（plain-triad / pedal / inversion / rootless）では **cost 差 0 の同点**で、悪化は普通の window に集中する。**接続すれば純損失。**

原因の推測: 三値化の過程で持続時間・信頼度の重みを捨てている（stress で triad 96.5% → 86.4%）。

**残す価値があるもの**: triad がどれも supported でない window が 11.6%、seventh が 7.9%。これは quality 決定ではなく **ambiguity 表示**の材料であり、別 Stage として扱う。未着手。
