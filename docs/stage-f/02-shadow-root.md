# Loop Vault Stage F2 — Shadow Factorized Root

- 作成日: 2026-07-26
- **製品Primaryに接続していない**
- **結論: F2b への前進は非推奨。** 仮説は棄却された
- `defaultAnalyzerMode` は `phase4-v1` のまま

---

## 1. 結論を先に

F2 が答えるべき問いは2つあった。

| 問い | 答え |
|---|---|
| factorized root は quality 層から**独立**しているか | **YES**（199/199ファイル、非空虚な摂動で確認） |
| factorized root は現行 root より**良い**か | **NO。全 subset で悪い**（plain-triad は同点） |

F2b の前進条件のうち「pedal / rootless / inversion のいずれかで明確な改善」が**満たされない**。3つとも悪化している。correction cost も +708 で悪化。

**したがって F2b には進まない。** これはこの Stage が shadow である理由そのもので、製品に接続する前に分かった。

---

## 2. 独立性 — Hard Gate

| Gate | 結果 |
|---|---|
| `quality-parameter-isolation` | **PASS 199/199** — quality 層を 0.7 / 1.0 / 1.3 に振っても root 列が完全一致 |
| `perturbation-not-vacuous` | **PASS 199/199** — その摂動が quality score を実際に変えたことを確認 |
| `plain-triad-no-severe-regression` | **PASS** — product 0 / shadow 0 corrections |

2つ目の Gate が要る理由: **何も読んでいないパラメータを振っても「独立」は自明に通る。** 摂動が本当に効いたことを示さなければ、どんな実装でも独立性を「証明」できてしまう。ユニットテストでは 0.1 / 1.0 / 10 の広い摂動でも確認した。

---

## 3. root 精度 — 研究結果（昇格 Gate ではない）

Gold 5962 window（Synthetic Gold + Long-form + regression-v3 + Chord Drip の生成記録）

| subset | gold | product | shadow top1 | shadow top3 | cost差 |
|---|---|---|---|---|---|
| **plain-triad** | 16 | **100.0%** | **100.0%** | 100.0% | **0** |
| clean | 2475 | 99.0% | 96.8% | 99.8% | +54 |
| humanized | 1239 | 99.7% | 86.4% | 99.6% | +164 |
| arpeggiated | 659 | 92.7% | 81.2% | 92.7% | +76 |
| half-bar-2chord | 32 | 87.5% | 71.9% | 93.8% | +5 |
| tension-rich | 32 | 93.8% | 62.5% | 93.8% | +10 |
| **inversion** | 240 | 86.7% | **57.5%** | **100.0%** | +70 |
| **pedal-slash** | 256 | 87.5% | **58.6%** | **100.0%** | +74 |
| **rootless** | 325 | 99.4% | **52.3%** | 85.2% | +153 |
| **walking-bass** | 357 | 93.8% | **52.4%** | 86.6% | +148 |
| chord-drip | 971 | 62.1% | 46.8% | 77.1% | +149 |
| **全体** | **5962** | **92.1%** | **80.2%** | **94.4%** | **+708** |

### bass relation 別

| relation | gold | product | shadow top1 | shadow top3 |
|---|---|---|---|---|
| aligned | 5152 | 95.0% | 85.7% | 97.1% |
| pedal | 698 | 72.1% | 51.0% | 80.1% |
| **walking** | 110 | 84.5% | **11.8%** | 60.9% |

---

## 4. F1 の解釈を訂正する

F1 のレポートで、shadow root と製品 root の食い違いが walking / rootless / pedal / inversion に集中し plain-triad で 0 件だったことを「**分布が仮説と一致している**」と書いた。

**Gold と突き合わせた結果、その解釈は誤りだった。** 食い違う場所は正しく特定できていたが、**そこで正しいのは製品の側**である。

- rootless: product 99.4% / shadow 52.3%
- walking-bass: product 93.8% / shadow 52.4%

F1 は「どちらが正しいか」を測っていなかったので、あの時点でこう書くべきではなかった。**差分が仮説どおりの場所に出ることは、新しい方式が正しいことの証拠にならない。** 訂正して記録する。

---

## 5. 何が分かったか — top3 は強い

失敗の形がはっきりしている。

| | top1 | top3 |
|---|---|---|
| inversion | 57.5% | **100.0%** |
| pedal-slash | 58.6% | **100.0%** |
| 全体 | 80.2% | **94.4%** |

**候補生成は機能しており、壊れているのは順位付けである。** inversion と pedal-slash では正解が必ず top3 に入っている。

walking だけは top3 でも 60.9% で、候補生成の段階から取りこぼしている。低音域の band（最低音 + 1オクターブ）に、走るベースの通過音がすべて入って票を割っているのが原因と考えられる（未検証）。

---

## 6. なぜ悪いのか（仮説、未検証）

現行の quality template 方式は、**「完成したコードとして最も辻褄が合う root」**を選ぶ。F2 の factorized 方式は、**「最も証拠のある root」**を選ぶ。転回形や pedal では、その2つが食い違い、**前者のほうが正しい**。

C/E（第一転回）を考えると、証拠だけを見れば E に3度(G)と5度(B)…はなく、C に3度(E)と5度(G)がある。実際には F2 の tertian 項はこれを正しく扱う。問題はむしろ shell / guideTone 項が、転回形の低音を別 root の構成音として拾ってしまうことにある。

**この仮説を検証してから F2 の重み付けを変えるべきで、いま数字に合わせて重みを動かすのは Gold への当てはめになる。** F2 は重みを固定したまま報告する。

---

## 7. runtime

F2 は解析経路に何も差し込んでいない。記録した runtime は既存 `phase4-v1` の実測値そのもの。

---

## 8. F2b 前進条件の判定

| 条件 | 結果 |
|---|---|
| quality parameter 摂動時の shadow root 変化率 = 0% | **PASS** |
| plain-triad 重大退行なし | **PASS**（100% / 100%） |
| Chapter 3 高精度帯で重大退行なし | **測定不能**（Chapter 3 Seed に gold root が無い） |
| Chord Drip top3Root 重大退行なし | **FAIL**（product 62.1% / shadow top1 46.8%、top3 77.1%） |
| pedal / rootless / inversion のいずれかで明確な改善 | **FAIL**（3つとも悪化） |
| correction cost 悪化なし | **FAIL**（+708） |
| runtime 許容 | PASS |
| 決定性 | PASS |

**8条件中3つが FAIL。F2b は非推奨。**

条件を満たしていても自動着手しない約束だったが、そもそも満たしていない。

---

## 9. 次に何をすべきか（提案）

数字が指しているのは **F4（bass relation routing）** である。

- 正解は top3 にほぼ必ず入っている（inversion / pedal-slash で 100%）
- 足りないのは順位付けで、順位を決める材料として最も有望なのが bass relation
- F1 で pedal が 16.6%、walking が 6.7% という実体があることは確認済み

ただし **F2 の重みを Gold に合わせて動かすことはしない**。それは shadow stage の意味を消す。

walking の top3 60.9% は候補生成の問題なので、bass band の取り方を先に検証する必要がある。

---

## 10. 実装中に直した1件

Gold の突き合わせで `startBeatInBar` に +1 していた。この値は既に1始まりなので、**全 gold キーが1拍ずれて join が完全に空振り**していた。結果は「gold 0 件」と表示され、**バグではなく「gold が無い」ように見える**。Chord Drip 側の `beatInBar` は0始まりで規約が違うため、両方に同じ規約を仮定したのが原因。両者を別々に扱う形へ直した。
