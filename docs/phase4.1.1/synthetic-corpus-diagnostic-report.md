# Loop Vault Synthetic Gold Corpus v1 診断レポート

- 作成日: 2026-07-25
- 起点commit: `309b23d`（P4.1.1-00 Rollback後）
- 製品コード変更: **なし**
- コーパス: `loop-vault-synthetic-gold-corpus-v1` / generatorVersion `openai-gpt-5.6-pro-deterministic-v1` / PPQ 480 / 48 MIDI / 24シナリオ

---

## 1. 結論

**不具合の起点は Selection（候補選定）である。Timeline でもブロック生成でもない。**

3 split・2モード合計 **248件**の不一致を最初の損失Stageへ分類した結果:

| Stage | 件数 | 比率 |
|---|---:|---:|
| **selection-objective** | **183** | **73.8%** |
| timeline-chord-label | 28 | 11.3% |
| ui-projection | 27 | 10.9% |
| candidate-scoring | 4 | 1.6% |
| candidate-generation | 4 | 1.6% |
| pattern-grouping | 2 | 0.8% |

決定的な数字は3つ。

1. **`mustShowBlockRecall` は dev / validation で 100%、holdout で 87.5%。** 期待ブロックはほぼすべて生成されている。生成の問題ではない。
2. **`mustShowSelectedRecall` は dev 59.38% / validation 0.00% / holdout 31.55%（phase4.1-v1）。** 生成された期待ブロックの4〜10割が**一度も選定されない**。
3. **`allCandidateCoverage` は同時に 99.51% / 100.00% / 95.12%。** 被覆は飽和している。

validation の8ファイルでは **被覆100.00%、occurrenceRecall 0.00%** が同時に成立する。**被覆と有用性は独立であり、Phase 4.1 の凍結Gateは前者だけを見ていた。**

主原因は `selectOccurrencesByCoverage` の目的関数と停止条件:

- 停止条件 `coverageTarget = 0.95` が dev 31/32・validation 8/8 で発火し、平均選定数は **1.84件 / 1.25件**。16小節曲では「曲全体1枚」で被覆100%に達し、そこで打ち切られる
- 同一Pattern再選出のペナルティが最大 **0.012**（`diversity 0.12 × 1 × 0.1`）しかなく、quality の 0.30 に埋もれる → 同一Patternが複数カードを占有
- 窓長が効用に入っていないため、短い窓が長い進行を押しのける

Timeline は独立した第2の欠陥として存在するが、S23 の症状の原因ではない。

---

## 2. 比較したmodeとcommit

| mode | 内容 | 備考 |
|---|---|---|
| `phase4-v1` | ランキング選定 + qualityEvidence | **現在の製品既定**（P4.1.1-00 でRollback済み） |
| `phase4.1-v1` | Coverage選定 + Pattern/Occurrence + extraction profile | 不具合報告時の既定 |
| `current` | `defaultAnalyzerMode` を解決した結果 | `phase4-v1` に一致したため列を重複させず記録のみ |

P4.1.1 系の未昇格モードは存在しないため比較対象は2つ。commit `309b23d`、製品コードは1行も変更していない。

計測は製品の公開関数のみを使用する（`analyzeMidi` / `analyzeMidiWithRankingScores` / `buildOccurrences` / `scoreOccurrences` / `groupIntoPatterns` / `selectOccurrencesByCoverage` / `attachSourceVoicings`）。内部ランキングスコアを使い、`confidence` は使わない（1で飽和して候補を分離できないため）。

---

## 3. コーパス整合性

```text
manifest記載 48ファイル / SHA-256照合 48件 / 不一致 0件 / byte長不一致 0件
split: dev 32 / validation 8 / holdout 8 = 48（重複・欠落なし）
```

MIDI本体は `.local-evaluation/synthetic-gold-v1/`（Git管理外）。成果物にはfingerprintとbyte長のみを記録し、絶対パス・MIDIバイト列は含まない。

### 3.1 ハーネス側の補正（重要）

初回計測で出た「境界エラー」と「root精度25%」は、いずれも**私の計測方法の誤り**だった。訂正内容を明記する。

| 補正 | 誤った初回計測 | 訂正後 |
|---|---:|---:|
| 連続同一コードのonsetを境界失敗として数えていた（製品は意図的にマージする） | boundary 96.13% | **100.00%** |
| gold の `N.C.` を「イベント欠落」として数えていた（製品は無音にイベントを出さない仕様） | 同上 | 同上 |
| gold の acceptableAlternatives のうち `E11(no3)` 等4種を解釈できず、許容読みをroot誤りとして数えていた | root 92.19% のみ | root 92.19% / **許容読み込み 96.88%** |
| Timelineが既に誤っているファイルで occurrence のroot不一致を二重計上していた | pattern-grouping 11件 | **2件** |

**訂正の結果、event-boundary Stage の失敗は 0件になった。境界検出には欠陥がない。** 4種のgold表記（`D11(no3)` / `E11(no3)` / `F#11(no3)` / `A7#5`）はハーネス側の読み取りのみで解釈し、製品のcanonical契約は変更していない。

---

## 4. dev / validation / holdout結果

### phase4.1-v1

| 指標 | dev (32) | validation (8) | holdout (8) |
|---|---:|---:|---:|
| 失敗0件のファイル | 10 / 32 | 0 / 8 | 0 / 8 |
| **mustShowBlockRecall（生成）** | **100.00%** | **100.00%** | 87.50% |
| candidateGenerationLoss | 0 | 0 | **6** |
| **mustShowSelectedRecall（選定）** | **59.38%** | **0.00%** | **31.55%** |
| 平均選定数 | **1.84** | **1.25** | 14.75 |
| stoppedBecause | coverage-target 31 / no-marginal 1 | coverage-target 8 | coverage-target 6 / limit 2 |
| mustShowTop3Recall | 70.31% | 0.00% | 50.00% |
| mustShowTop10Recall | 59.38% | 0.00% | 25.30% |
| **allCandidateCoverage** | **99.51%** | **100.00%** | **95.12%** |
| progressionCandidateCoverage | 98.34% | 98.53% | 92.62% |
| **visiblePatternDuplicateCount** | **8** | 0 | **25** |
| **occurrenceRecall** | **59.38%** | **0.00%** | **25.00%** |
| occurrenceReachability | 100.00% | 100.00% | 100.00% |
| perOccurrenceAbsoluteChordRetention | 84.38% | 100.00% | 100.00% |
| perOccurrenceVoicingRetention | 100.00% | 100.00% | 100.00% |
| runtime max | 47.8 ms | 29.2 ms | 321.6 ms |

### phase4-v1（現在の既定）

| 指標 | dev (32) | validation (8) | holdout (8) |
|---|---:|---:|---:|
| 失敗0件のファイル | **0 / 32** | 0 / 8 | 0 / 8 |
| mustShowSelectedRecall | 71.09% | 43.75% | **6.25%** |
| 平均選定数 | 6 | 6 | 10 |
| mustShowTop3Recall | 28.13% | 12.50% | 50.00% |
| **top3の2小節断片** | **57 / 96枠** | **13 / 24枠** | 6 / 24枠 |
| allCandidateCoverage | 94.39% | 100.00% | **33.26%** |
| longestUncoveredHarmonicRun | 12 | 0 | **41** |
| visiblePatternDuplicateCount | 6 | 1 | 3 |
| occurrenceRecall | 72.34% | 43.75% | **8.78%** |
| occurrenceReachability | 95.31% | 56.25% | 72.92% |
| Pattern model | **なし** | なし | なし |

**どちらのモードも48ファイル中1件も完全合格していない。** phase4-v1 は被覆が壊滅的（holdout 33.26%、最長未被覆41小節）で Pattern model を持たず、phase4.1-v1 は被覆を回復した代わりに候補リストが1〜2枚に縮んだ。

### validation は dev の原因分類を再現した

dev で特定した3つの原因（早期停止・Pattern重複・短窓優位）は validation でそのまま再現し、しかも**より極端に出た**（selRecall 0.00%）。validation は製品閾値の調整には使っていない。

### holdout（1回のみ実行）

評価コード・指標・原因分類規則・レポート章立てを固定した後に1回だけ実行した。**Gate・正解ラベル・同値関係は holdout の結果に合わせて変更していない。**

---

## 5. Timeline精度

`phase4-v1` と `phase4.1-v1` の Timeline は**全48ファイルで完全に同一**だった（Phase 4.1 はコード検出を変更していないという主張と一致する）。

| 指標 | dev | validation | holdout |
|---|---:|---:|---:|
| rootAccuracy | 92.19% | 87.50% | 98.44% |
| rootAccuracy（許容読み込み） | 96.88% | 87.50% | 98.44% |
| triadAccuracy | 91.80% | 90.63% | 98.91% |
| seventhAccuracy | 92.97% | 84.38% | 98.75% |
| slashBassAccuracy | 92.97% | 81.25% | 99.69% |
| canonicalExact | 86.52% | 71.88% | 97.03% |
| acceptableAlternativeMatch | 84.96% | 71.88% | 95.78% |
| **boundaryMatchWithinTolerance** | **100.00%** | **100.00%** | **100.00%** |

### 5.1 失敗クラスタ

| # | クラスタ | 該当 | 症状 | 最初の損失Stage |
|---|---|---|---|---|
| 1 | **ペダル/スラッシュを minor11 と読む** | S04 both, S20 both | `D/E→Em11`, `E/F#→F#m11`, `C/D→Dm11`, `E/A→Amaj9`, `F#m/A→A6` | timeline-chord-label |
| 2 | **rootless + walking bass で root が移動** | S05 stress | `Dm9→Fmaj7/E`, `Cmaj9→Em7`, `A7b9→Edim7`（root 25%） | timeline-chord-label |
| 3 | **テンション/変化音の脱落** | S06 both, S19 stress, S23 | `F6/9→F6`, `E7b9→E7`, `G9sus4→Gm11`, `Dm9→Dsus2`, `G13→G6/9` | timeline-chord-label |
| 4 | **転回形を bass ルートの6thと読む** | S07 both | `Em/G→G6`, `Em/G→G6/9` | timeline-chord-label |
| 5 | **humanized timing による音の滲み** | S14 stress | `C→C6`, `F→Fadd9` | timeline-chord-label |
| 6 | **半小節2コードのマージ** | S23 both | bar73 `Dm7`+`C` → `C6/9` 1件、bar74 `G7`+`Am` → `G13` 1件 | event-boundary（下記5.3参照） |

クラスタ1は **`15.Endless,endless.` の `Em11/A` と同一の失敗様式**である。合成コーパスで `D/E`（D三和音+Eペダル、短3度なし）が `Em11` と読まれることが確認された。実MIDIの `Em11/A` 問題は特殊ケースではなく再現可能な系統的欠陥である。

### 5.2 qualityEvidence のペナルティは自らの規則を強制できていない

クラスタ1・3は `qualityEvidence`（「定義音が鳴っていない品質を名乗らせない」）が防ぐべき失敗である。dev でペナルティ値だけを振った感度測定:

| penalty | root | root(許容) | triad | 7th | bass | canonicalExact |
|---:|---:|---:|---:|---:|---:|---:|
| 0.00 | 92.19% | 96.88% | 91.41% | 92.97% | 92.97% | 86.52% |
| **0.08（製品値）** | **92.19%** | 96.88% | **91.80%** | 92.97% | 92.97% | 86.52% |
| **0.12** | **96.88%** | 96.88% | **96.48%** | **97.66%** | **97.66%** | 86.52% |
| 0.20 | 96.09% | 96.09% | 96.48% | 97.27% | 96.88% | 86.52% |
| 0.35 | 96.09% | 96.09% | 96.48% | 97.27% | 96.88% | 86.52% |

**製品値 0.08 は 0.00 とほぼ区別できない。** `min11` の定義音は `[3, 10]` で、短3度が完全に欠けていても coverage 0.5 → `missingPenalty = 0.5 × 0.08 = 0.04`。この 0.04 はテンプレート得点差を覆せない。ガードは配線されているが効いていない。

### 5.3 実コーパスは逆方向を示す（未解決の対立）

Phase 4.0 の凍結記録 `docs/phase4.0/05d-quality-evidence-tune.json`（Chord Drip tune corpus, scope=full, threshold=0.02）:

| penalty | root | triad |
|---:|---:|---:|
| 0.08 | 59.69% | 59.86% |
| **0.12** | **48.98%** | **52.98%** |

**同じ 0.12 で、合成コーパスは root +4.7pp、Chord Drip corpus は root −10.7pp。** 二つのコーパスが正反対を指している。

観察できる構造: 崩壊は root に最も強く出る（−10.7pp）。ペナルティは品質得点から引かれるため、値を上げると検出器は「品質の証拠がより揃った**別のroot**」へ乗り換える。つまり `penalty` は品質判定と root 選択の両方を同時に動かしており、**単一スカラーでは分離できない**。

したがって「0.12 にすべき」とは**言えない**。示唆されるのは、rootを先に決めてから同一root内で品質証拠ペナルティを適用する（またはroot選択を penalty の影響から切り離す）構造変更である。これは仮説であり、本Stageでは実装しない。

### 5.4 boundary metric の限界（明記）

`boundaryMatchWithinTolerance` は「gold onset の近傍に製品 onset があるか」を見るため、**製品が2つのコードを1つにマージした under-segmentation を検出できない**（S23 bar73/74）。100.00% は「境界がずれていない」ことの証明であって「イベント数が正しい」ことの証明ではない。イベント数比:

| split | gold events | product events | 比 |
|---|---:|---:|---:|
| dev | 422 | 430 | 1.019 |
| validation | 130 | 178 | **1.369** |
| holdout | 848 | 814 | 0.960 |

validation の stress 変種で 1.37 に膨らむ（S20_stress 32/16、S19_stress 28/16）。**過分割と過統合の両方が起きている。** 専用指標の追加を §14 で提案する。

---

## 6. Block生成精度

| 指標 | dev | validation | holdout |
|---|---:|---:|---:|
| mustShowBlockRecall | 100.00% | 100.00% | 87.50% |
| progressionBlockRecall | 100.00% | 100.00% | 87.50% |
| vampBlockRecall | 100.00% | 100.00% | 100.00% |
| candidateGenerationLoss | 0 | 0 | **6** |
| classificationAgreement | 98.75% | 100.00% | 100.00% |

**生成は健全である。dev と validation では期待ブロックが1つも失われていない。**

### 6.1 holdout の生成損失6件は窓長セットの構造的限界

S24 の期待ブロック長は **14 / 18 / 20小節**:

| block | 範囲 | 長さ | 生成可否 |
|---|---|---:|---|
| sec1 | 1–16 | 16 | 可 |
| sec2 | 17–32 | 16 | 可 |
| **focus** | **33–46** | **14** | **不可** |
| **sec4** | **47–64** | **18** | **不可** |
| sec5 | 65–80 | 16 | 可 |
| **sec6** | **81–100** | **20** | **不可** |

`buildOccurrences` の窓長は `[2, 4, 8, 16]` 固定。14/18/20小節の区間は**原理的に候補になれない**。clean/stress 各3件で計6件。

これは Phase 4.1 の成果報告に対する重要な訂正を含む。Phase 4.1 は「注目範囲33–46小節の被覆 0→14小節」を成果として記録したが、**33–46 という区間そのものは候補として提示できない**。16小節窓が重なって「被覆した」と数えられていただけである。ユーザーがそのセクションを掴む手段は存在しない。**ここでも被覆と有用性が乖離している。**

### 6.2 classificationAgreement の 98.75% は定義差

S16 の intro（1–4小節、`Cadd9 G Cadd9 G`）を gold は `fragment` / `exclude-from-main` とするが、構造規則（4小節以上・canonical 2種以上・変化1回以上）では `progression` になる。gold の `fragment` は「進行として不完全」という**楽曲上の判断**を含み、構造だけからは導けない。製品バグではなく分類契約の隙間として報告する。

---

## 7. Candidate選定・有用性

**ここが本体である。**

### 7.1 phase4.1-v1: 早期停止

| split | 停止理由 | 平均選定数 | 被覆 | mustShowSelectedRecall |
|---|---|---:|---:|---:|
| dev | coverage-target 31/32 | **1.84** | 99.51% | 59.38% |
| validation | coverage-target 8/8 | **1.25** | **100.00%** | **0.00%** |
| holdout | coverage-target 6/8, limit 2/8 | 14.75 | 95.12% | 31.55% |

具体例（validation, 16小節曲、期待は8小節ブロック2件）:

```text
S18_clean  選定 1件 = 1–16小節（曲全体）
           allCandidateCoverage 100.00%
           mustShowSelectedRecall 0.00%
           occurrenceRecall 0.00%
```

`coverageTarget = 0.95` は「95%被覆したら十分」を意味するが、**1枚で曲全体を覆う候補は被覆100%かつ有用性0**である。ユーザーが欲しい8小節進行は生成されており、選定が到達する前に打ち切られている。

同じ構造が dev の S11 / S13 / S14 でも起きる:

```text
S11_clean（4小節vamp + 8小節進行 + 4小節vamp）
  選定 1件 = 1–16小節
  期待3ブロック（vamp 1-4 / prog 5-12 / vamp 13-16）すべて到達不可
```

### 7.2 phase4-v1: 短窓優位

| split | top3の2小節断片 | mustShowTop3Recall |
|---|---:|---:|
| dev | **57 / 96枠（59.4%）** | 28.13% |
| validation | **13 / 24枠（54.2%）** | 12.50% |
| holdout | 6 / 24枠 | 50.00% |

dev の top3 枠の6割が2小節断片で埋まる。`progressionCandidateAvailability` は S11 で18、S01 で4あり、**4小節以上の進行は十分に存在するのに上位に出ない**。

原因は `scoreBlockQuality` の `repeat 0.20` + `loopFitness 0.10`。曲中で4回繰り返す2小節窓は repeat 上限に達し、1回しか現れない8小節進行を上回る。scoreそのものは Phase 4.0 の設計意図どおり（ヴァンプを減点しない）で誤っていない。**誤りはその score をそのまま主候補の順位に使っていること。**

### 7.3 top3SingleChordCount は 0 だった（重要な限定）

3 split・両モードすべてで `top3SingleChordCount = 0`。合成コーパスでは**ワンコードvampが上位3枠を占領する現象は再現しなかった**。

`15.Endless,endless.` では再現する（top3SingleChordCount = 3）。差は曲長と繰り返し回数にある。Endless は154小節で `Em11/A` が4箇所に現れ、2小節窓のrepeat係数が最大化される。合成コーパスの vamp シナリオ（S11）は16小節と短く、同じ増幅が起きない。

**したがって「ワンコード優位」は合成コーパスだけでは証明できない。実MIDIで確認済みの現象として扱う。**

---

## 8. Pattern / Occurrence / UI

### 8.1 Hard expectation の判定

| 期待値 | phase4.1-v1 | phase4-v1 |
|---|---|---|
| `visiblePatternDuplicateCount = 0` | **FAIL**（dev 8 / holdout 25） | **FAIL**（dev 6 / val 1 / holdout 3） |
| `visibleSlotWasteCount = 0` | **FAIL**（同数） | **FAIL**（同数） |
| `occurrenceReachability = 100%` | **PASS**（3 split すべて 100.00%） | **FAIL**（95.31% / 56.25% / 72.92%） |

### 8.2 Pattern重複の実例（S16 clean, phase4.1-v1）

```text
#1 1-2   [pattern-occ-1-2]     ← intro断片
#2 3-4   [pattern-occ-1-2]     ← 同一Pattern（重複1）
#3 29-32 [pattern-occ-13-16]   ← chorus
#4 17-20 [pattern-occ-13-16]   ← 同一Pattern（重複2）
#5 13-16 [pattern-occ-13-16]   ← 同一Pattern（重複3）
#6 25-28 [pattern-occ-13-16]   ← 同一Pattern（重複4）
#7 1-8   [pattern-occ-1-8]
#8 9-10  [pattern-occ-5-6]
#9 23-24 [pattern-occ-13-14]
```

9枠のうち4枠が `pattern-occ-13-16` に消費されている。`15.Endless,endless.` の `Em11/A` × 4 と同一構造で、合成データで gold 付きに再現できた。

なお gold の8小節chorus（13–20）ではなく**4小節の前半（13–16）が選ばれている**。4小節窓は曲中4回繰り返すため repeat 係数が高く、8小節全体（2回）を上回る。**ユーザーに提示されるのはコーラスの半分である。**

### 8.3 occurrenceReachability 100% と occurrenceRecall 0% の同時成立

phase4.1-v1 は「表示されたPatternの全Occurrenceへ到達できる」（100%）を満たしながら、「gold が期待するOccurrenceへ到達できる」（validation 0%）を満たさない。Pattern/Occurrence モデル自体は正しく機能しており、**そのモデルに正しいOccurrenceが渡っていない**。損失はモデルより上流にある。

### 8.4 phase4-v1 には Pattern model が存在しない

`candidatePatterns` を出力しないため、カード1枚から他の出現へ到達する手段がない（27件の `ui-projection` 失敗）。holdout では occurrenceRecall 8.78%。**Rollback先である現在の既定は、この観点では phase4.1-v1 より明確に劣る。**

### 8.5 merge policy と保持は健全

| 指標 | dev | validation | holdout |
|---|---:|---:|---:|
| mergePolicyRespected | 100.00% | 100.00% | 100.00% |
| expectedCardCountMatch | 100.00% | 100.00% | 100.00% |
| perOccurrenceVoicingRetention | 100.00% | 100.00% | 100.00% |
| perOccurrenceAbsoluteChordRetention | 84.38% | 100.00% | 100.00% |

- **S13**（転調反復）: 4つの転調Occurrenceが1Patternへ統合され、絶対コードは各自保持
- **S14**（duration差）: 同じコード順で duration が異なる2区間を**誤統合していない**
- dev の 84.38% は S04 / S05s / S07（Timelineが既に誤っているファイル）由来。Timeline失敗の二重観測

`expectedCardCountMatch` が 100% でありながら重複が発生する点に注意が必要である。重複は **gold が列挙していない Pattern 同士**で起きている。gold の `expected_card_count` チェックだけでは重複を検出できない。

---

## 9. clean / stressペア差

意図上不変な項目が stress でのみ崩れたケース:

| scenario | stress特性 | canonicalExact Δ | root Δ | stress固有の失敗 |
|---|---|---:|---:|---|
| **S05** rootless-jazz | rootless-harmony + walking-bass + voice-duplicate | **−0.750** | **−0.750** | root-mismatch |
| **S19** arpeggiated | arpeggiated-harmony + all-channel-zero | **−0.500** | 0 | quality-detail-mismatch |
| **S07** two-chords-per-bar | overlap-notes + humanized-timing | −0.438 | 0 | — |
| **S14** duration-distinction | humanized-timing | −0.250 | 0 | quality-detail-mismatch |
| S20 bass-ostinato | walking-bass + dense-melody | −0.250 | 0 | — |
| S06 quality-variety | arpeggiated-harmony | −0.125 | 0 | — |
| **S12** repeated-pattern | different-voicing-per-occurrence + track-reorder | 0 | 0 | **duplicate-pattern-occupies-slots** |
| S21 long-region-decoy | fragmented + section-instrumentation-change | 0 | 0 | occurrenceRecall −0.143 |
| S22 occurrence-duplicate | different-voicing-per-occurrence | 0 | 0 | must-show-missing-from-top10 |

優先分類:

1. **rootless-harmony + walking-bass**（最大の劣化）— root が bass 側へ引かれる
2. **arpeggiated-harmony** — 同時発音がないためテンションが窓内で揃わない
3. **overlap-notes / humanized-timing** — 隣接コードの音が滲みテンションが増える
4. **different-voicing-per-occurrence** — Timeline は不変だが**選定結果が変わる**（S12 で重複が stress のみ発生、S22 で top10 recall が落ちる）
5. all-channel-zero / track-reorder 単独では劣化なし（S01 で確認）
6. section-instrumentation-change 単独では Timeline 劣化なし

**注目すべきは4番。** ボイシングが変わるだけで Timeline は同一なのに選定結果が変わる。スコアが微小差で決まっているため、演奏上の差異が候補リストを揺らす。決定性はあるが安定性がない。

---

## 10. S23不具合の Primary / Secondary cause

S23 `repeated-vamp-top3-regression`（holdout、160小節）。gold の期待:

```text
progression 4件（1-8, 33-40, 81-88, 129-136）すべて rank_constraint=top3
em11a-vamp   1Pattern + 4Occurrence（27-28, 65-66, 107-108, 145-146）expected_card_count=1
```

実測（phase4.1-v1, clean）:

```text
選定 30件（stopped-limit = 上限到達）
visiblePatternDuplicateCount  4
mustShowTop3Recall            0.00%
mustShowSelectedRecall        0.00%
occurrenceRecall              0.00%
top3ProgressionCount          3   ← 分類上は進行だが gold の進行ではない
top3SingleChordCount          0
```

### 因果連鎖

```text
Timeline は概ね正しい（root 93.75%, canonicalExact 88.13%, boundary 100%）
  → 期待ブロック4件はすべて生成されている（candidateGenerationLoss 0）
    → 選定30件のうち gold の progression は0件
      → 同一Patternが4枠を占有
        → gold の Occurrence へ到達できない（0/8）
```

| 区分 | 原因 | Stage | 根拠 |
|---|---|---|---|
| **Primary** | **選定の目的関数が「有用性」を持たない。** 被覆と品質しか見ず、Pattern一意性・窓長・期待進行への到達を目的に含まない | `selection-objective` | 生成100% / 選定0% / 重複4 |
| **Secondary 1** | **最終Patternの一意性ガードが存在しない。** Pattern は表示直前に計算されるが表示枠の割り当てに関与しない | `ui-projection` | 同一 patternId が4枠 |
| **Secondary 2** | **repeat係数が短い部分窓を増幅する。** 8小節進行より4小節前半が上位に来る | `candidate-scoring` | S16 で 13-16 が 13-20 に優先 |
| **Secondary 3** | 半小節2コードの過統合（bar73/74） | `event-boundary` | `Dm7`+`C` → `C6/9` |

実MIDI `15.Endless,endless.` の Primary / Secondary は同一である（§16）。

**注意**: S23 では `top3SingleChordCount = 0`。合成S23はワンコードが上位を占領する形では失敗せず、「gold の進行が1つも出ない」形で失敗した。実MIDIの Endless は前者の形で失敗する。**同じ Primary cause が曲によって異なる症状を出す。** 症状ベースの回帰テストでは取りこぼす。

---

## 11. failure cluster 上位10件

両モード・3 split 合計248件。

| # | Stage / kind | 件数 | 影響 |
|---|---|---:|---|
| 1 | selection-objective / **must-show-missing-from-top3** | 59 | 欲しい進行が上位に出ない |
| 2 | selection-objective / **must-show-missing-from-top10** | 56 | 欲しい進行が表示範囲に出ない |
| 3 | selection-objective / **short-fragment-in-top3** | 49 | 2小節断片が上位を占める |
| 4 | ui-projection / **no-pattern-model-to-reach-occurrences** | 27 | 他の出現へ到達不可（phase4-v1のみ） |
| 5 | selection-objective / **duplicate-pattern-occupies-slots** | 19 | 同一Patternが複数枠を消費 |
| 6 | timeline-chord-label / quality-detail-mismatch | 14 | テンション/変化音の脱落 |
| 7 | timeline-chord-label / root-mismatch | 14 | ペダル・rootless でroot誤り |
| 8 | candidate-scoring / block-type-disagreement | 4 | 分類契約の隙間（製品バグではない） |
| 9 | candidate-generation / must-show-block-not-generated | 4 | 14/18/20小節ブロックが生成不能 |
| 10 | pattern-grouping / occurrence-lost-absolute-chords | 2 | Timeline失敗の下流 |

上位5件（210 / 248 = **84.7%**）がすべて選定と表示投影に属する。

---

## 12. どこを直すべきかの優先順位

「失敗件数」だけでなく、ユーザー影響・波及範囲・Timelineを壊さず直せるか・被覆と有用性の両立・rollback容易性で判断した。

### P1: 選定の停止条件と目的関数（最優先）

- **件数**: 164 / 248（66%）
- **ユーザー影響**: 最大。validation では欲しい進行が1つも出ない
- **波及**: 24シナリオ中16以上
- **Timeline**: 一切触らない
- **被覆との両立**: 可能。停止条件を「被覆達成」から「候補枠を使い切る／限界利得が尽きる」へ変えるだけで被覆は落ちない
- **rollback**: `coverageTarget` と目的関数の重みは定数。1箇所
- 対象: `src/domain/midi/coverageSelector.ts`

### P2: 表示枠のPattern一意化

- **件数**: 19（重複）+ 27（Pattern model欠如）
- **ユーザー影響**: 大。ユーザーが見た症状そのもの
- **波及**: S12 / S16 / S21 / S22 / S23 + Endless + SURAN
- **Timeline**: 触らない
- **rollback**: 投影層のみ
- 対象: `src/domain/midi/coverageCandidates.ts`, `src/components/OccurrenceList.tsx`

### P3: 窓長と部分窓の扱い

- **件数**: 49（短断片）+ S16 の半コーラス問題
- **ユーザー影響**: 大
- **注意**: `scoreBlockQuality` の repeat/loopFitness を**下げてはいけない**（Phase 4.0 のヴァンプ救済が壊れる）。分類と表示レーンで扱いを分ける
- 対象: 選定側のみ。`blockQuality.ts` は変更しない

### P4: 生成窓長セットの拡張（14/18/20小節）

- **件数**: 4
- **ユーザー影響**: 中〜大（セクション単位で掴めない）
- **リスク**: 窓数増加 → runtime。現在 max 322 ms、上限 3000 ms なので余裕はある
- **重要**: Phase 4.1 の「focus範囲を被覆した」という成果はこの制限により**有用性としては未達**
- 対象: `src/domain/midi/occurrence.ts`

### P5: qualityEvidence の root と品質の分離

- **件数**: 28
- **ユーザー影響**: 中（コード名が違う）
- **難易度**: 最高。**合成コーパスと Chord Drip corpus が正反対を指している**（§5.3）
- **やってはいけないこと**: 片方のコーパスだけを見て `penalty` を上げる。0.12 は Chord Drip で root −10.7pp
- **必要な作業**: root選択と品質ペナルティを分離する構造変更 + 両コーパス同時評価
- 対象: `src/domain/midi/qualityEvidence.ts`, `legacy.ts` の matchWindow

### P6: イベント過統合・過分割

- **件数**: 2（+ 指標未整備のため実数は不明）
- まず指標を追加してから判断する

---

## 13. 修正してはいけない層

1. **`scoreBlockQuality` の repeat / loopFitness 係数** — Phase 4.0 のヴァンプ救済が依存している。有用性は選定側で解決する
2. **canonical identity 契約**（`chordIdentity.ts`）— merge policy は 3 split すべて100%。壊す理由がない
3. **`qualityEvidence.penalty` の単独引き上げ** — Chord Drip で root −10.7pp。§5.3
4. **Pattern / Occurrence モデル本体**（`occurrence.ts` の grouping）— `occurrenceReachability` 100%、`mergePolicyRespected` 100%、`perOccurrenceVoicingRetention` 100%。正しく動いている
5. **`attachSourceVoicing`** — 全 split で 100%
6. **gold ラベルと boundaryToleranceBeats** — 評価結果に合わせた変更は禁止
7. **Timeline 平滑化の無効化** — 連続同一コードのマージは仕様。§3.1 の boundary 100% はこれを前提にしている
8. **Phase 4.1 の被覆Gate** — 緩和ではなく**有用性Gateの追加**で対応する

---

## 14. 推奨する回帰テスト

詳細は `docs/phase4.1.1/synthetic-recommended-regressions.md`。要約:

| 原因 | 最小再現 | 追加するGate |
|---|---|---|
| 早期停止 | 16小節・8小節進行2件 | `mustShowSelectedRecall = 100%` |
| Pattern重複 | 32小節・同一進行4回 | `visiblePatternDuplicateCount = 0` |
| 短窓優位 | 2小節断片 + 8小節進行 | `twoBarFragmentsInTop3 = 0` |
| 部分窓優位 | 8小節進行の4小節前半が4回 | 8小節版が4小節版より上位 |
| 窓長不足 | 14小節セクション | `candidateGenerationLoss = 0` |
| 過統合 | 半小節2コード | `eventCountRatio ∈ [0.9, 1.1]`（新規指標） |

**必須の新規指標**: `mustShowSelectedRecall`（生成と表示の間の損失を分離する）と `eventCountRatio`（境界指標が見られない過統合/過分割を捉える）。

---

## 15. 想定される副作用

| 変更 | 副作用 | 検出方法 |
|---|---|---|
| 停止条件の緩和 | 候補数増 → runtime増、弱い候補の混入 | `minimumSelectedCandidateScore` 下限、runtime上限3000ms |
| Pattern一意化 | 表示枠が減り被覆が下がる可能性 | `allCandidateCoverage` と `progressionCandidateCoverage` を分けて報告 |
| 窓長を効用に入れる | 短いvampが下がりすぎ Phase 4.0 のヴァンプ救済が実質失効 | vamp が補助レーンに**存在すること**を検証（削除されていないこと） |
| 窓長セット拡張（14/18/20） | 窓数increase、dedup負荷、Pattern数増 | runtime、`groupedPatterns`、決定性 |
| qualityEvidence 構造変更 | Chord Drip / Chapter 3 Seed の回帰 | 両コーパス同時評価を必須化 |
| section信号の選定接続 | 境界誤りが候補を除外する | Phase 4.1 で既に否定結果。接続しない |

**最も注意すべき副作用**: §9-4 で見たとおり、選定はスコアの微小差で決まっている。重みを変えると**ボイシング差だけで候補リストが入れ替わる**現象が強まりうる。clean/stress ペアの選定一致を回帰項目に入れる必要がある。

---

## 16. 実世界MIDIとの整合

合成コーパスの結果だけで実世界一般化は主張しない。

### 16.1 `15.Endless,endless.`（154小節、Git管理外）

| 確認項目 | phase4.1-v1 | phase4-v1（現既定） |
|---|---|---|
| 候補1〜3が同じ `Em11/A` カードにならない | **FAIL**（1–3すべて `pattern-occ-27-28`） | PASS（重複0） |
| `Em11/A` の4出現が1カードに統合される | **FAIL**（4枠を占有） | 該当なし（Pattern model なし） |
| 4/8/16小節progressionがTop 3で優先される | **FAIL**（top3ProgressionCount 0） | **FAIL**（top3 は2小節断片3件） |
| top3SingleChordCount | **3** | 0 |
| allCandidateCoverage | 96.67% | 24.00% |
| progressionCandidateCoverage | 94.00% | 18.67% |
| 上位10枚での被覆 | **60.00%** | 24.00% |
| progressionCandidateAvailability | 435 | 435 |

合成S16 / S23 と同一の Primary cause が同一の Stage で確認された。**Endless の `Em11/A` 検出自体も合成S04で再現する**（`D/E → Em11`）。

### 16.2 SURAN remix（100小節、Git管理外）

| 指標 | phase4.1-v1 |
|---|---:|
| visiblePatternDuplicateCount | 1 |
| top3ProgressionCount | 1 |
| top3SingleChordCount | 0 |
| allCandidateCoverage | 96.94% |
| progressionCandidateCoverage | 96.94% |

Endless ほど極端ではないが同じ欠陥が同じStageで出る。Endless固有ではない。

### 16.3 Chapter 3 Seed（100 MIDI、AI支援アノテーション、Git管理外）

| analyzer | root | triad | quality | canonicalExact |
|---|---:|---:|---:|---:|
| legacy | 98.75% | 98.50% | 97.24% | 96.49% |
| **phase4** | **98.75%** | **98.75%** | **98.50%** | **97.74%** |

phase4 は legacy に対し quality +1.26pp / canonicalExact +1.26pp。回帰なし。

### 16.4 Chord Drip corpus（凍結記録）

`penalty 0.08 → 0.12` で root 59.69% → 48.98%（−10.71pp）、triad 59.86% → 52.98%（−6.88pp）。§5.3 の対立の根拠。

### 16.5 合成コーパスの限界（明記）

1. **Gold by construction**。独立した専門家の採譜ではなく、意図した通りに鳴らした音を意図した通りに正解としている
2. **曲が短い**（8〜32小節が32/48）。Endless の「154小節で4回繰り返すワンコードがrepeat係数を最大化する」現象は再現しない。**§7.3 の top3SingleChordCount = 0 はこの限界による**
3. **実分布を代表しない**。Chord Drip corpus の canonicalExact は 29.6%、合成 dev は 86.5%。難易度が2桁違う
4. **stress変種は列挙された変形のみ**。実際のAI抽出MIDIの崩れ方を網羅しない
5. **同一生成器由来**。生成器の癖が正解にも入る（`N.C.` を明示イベントにする、連続同一コードを別イベントにするなど、製品の表現と食い違う箇所が §3.1 の補正を必要とした）
6. **holdout 8件は少ない**。S24 の生成損失6件は1シナリオ由来であり、頻度の推定には使えない

**昇格判断では合成コーパス単独を根拠にしない。** SURAN remix / Endless / Chapter 3 Seed / Chord Drip corpus を併用する。

---

## 17. 次の実装Stage案

本Stageでは実装しない。順序と各Stageの検証条件のみ示す。

### Stage A: 有用性指標とGateの追加（製品ロジック変更なし）

`mustShowSelectedRecall` / `visiblePatternDuplicateCount` / `twoBarFragmentsInTop3` / `eventCountRatio` を評価系へ追加し、合成コーパスの回帰テストを整備する。**まず測れるようにする。** Gate値は現状値で凍結する。

### Stage B: 表示枠のPattern一意化（P2）

同一 patternId が消費する表示枠を1つに制限し、Occurrenceは全数保持する。

検証: `visiblePatternDuplicateCount = 0`（合成 + Endless + SURAN）、`occurrenceReachability = 100%`、被覆が下がらないこと、Chord Drip timeline 完全一致。

### Stage C: 停止条件と目的関数（P1）

`coverageTarget` による早期停止をやめ、候補枠を使うか限界利得が尽きるまで選定する。窓長と「gold進行への到達」に相当する信号を効用へ入れる。

検証: `mustShowSelectedRecall` 大幅改善、`allCandidateCoverage` 非低下、`minimumSelectedCandidateScore` 下限維持、runtime ≤ 3000 ms、clean/stress の選定一致。

### Stage D: 候補分類と二段階レーン（P3）

progression / vamp / fragment を分類し、主レーンは progression 優先、vamp は補助レーンへ。**vampは削除しない。**

検証: `twoBarFragmentsInTop3 = 0`、`top3ProgressionCount = 3`（進行が3件以上ある場合）、Endless の `Em11/A` が1カード + 4Occurrence として**残る**こと。

### Stage E: 窓長セットの拡張（P4）

14/18/20小節など非2冪長への対応、またはセクション境界からの窓生成。

検証: `candidateGenerationLoss = 0`、runtime、決定性、Pattern数の膨張。

### Stage F: qualityEvidence の root/品質分離（P5、独立）

**A〜Eとは独立に進める。** 選定の修正と混ぜると原因が絞れなくなる。root選択を品質ペナルティから切り離す構造変更を試み、合成コーパスと Chord Drip corpus を**同時に**評価する。片方だけの改善では昇格しない。

### 提案する順序

```text
A（測る） → B（重複を消す） → C（早期停止を直す） → D（レーン分離） → E（窓長）
                                                    F（qualityEvidence、並行・独立）
```

B と C は独立に検証可能で、どちらも Timeline に触らない。最小のリスクで最大の失敗件数（210 / 248）を消せる。

---

## 成果物

```text
docs/phase4.1.1/synthetic-corpus-diagnostic-report.md      本書
docs/phase4.1.1/synthetic-corpus-diagnostic-report.json    集計
docs/phase4.1.1/synthetic-dev.json                         dev 32件
docs/phase4.1.1/synthetic-validation.json                  validation 8件
docs/phase4.1.1/synthetic-holdout.json                     holdout 8件（1回のみ実行）
docs/phase4.1.1/synthetic-failure-cases.jsonl              248件の失敗台帳
docs/phase4.1.1/synthetic-recommended-regressions.md       回帰テスト案
docs/phase4.1.1/quality-evidence-penalty-probe.json        penalty感度測定
```

再実行:

```bash
npx vite-node scripts/evaluate-synthetic-gold-corpus.ts -- --corpus .local-evaluation/synthetic-gold-v1 --split dev --modes phase4-v1,phase4.1-v1,current --output docs/phase4.1.1/synthetic-dev.json
```

MIDIバイト列・絶対パス・展開先ファイル名は成果物へ含めていない。
