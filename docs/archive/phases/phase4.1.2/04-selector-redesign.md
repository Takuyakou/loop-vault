# Loop Vault Phase 4.1.2 — C Selector再設計

- 作成日: 2026-07-25
- 対象モード: `phase4.1.2-v1`（**製品既定は `phase4-v1` のまま**）
- Timeline / qualityEvidence / canonical identity: **変更なし**

---

## 1. 加重和をやめて辞書式順序にした

以前の目的関数は加重和で、qualityがcoverageを上回れた。`15.Endless,endless.` では2小節vampが16小節進行に **0.0013差** で勝っていた。

加重和では「進行はvampより先」を表現できない。それを保証できる重みにすると他の項が飾りになるからである。そこで指示どおり**キーを順に比較する**形にした。

```text
1. kind          progression → vamp → fragment
2. new identity  未提示の形 > 既出の形の別位置
3. structural    どれだけ完結した楽節か
4. coverage      残りギャップのうち埋める割合（11段に量子化）
5. quality       block score
6. position      startBar → patternId
```

`quality` は5番目のキーであると同時に**ゲートのままである**。floor未満は比較の前に落ちるので、枠埋めのために弱い候補が入ることはない。

`coverage` を量子化した理由: そのまま比較すると事実上すべてのタイを決めてしまい quality が一度も効かない。近い割合を同値として扱い、後段のキーに決めさせる。

### 1.1 coverageTargetによる停止をやめた

**1枚の16小節候補で被覆100%になっても探索を続ける。** 停止するのは次のいずれかのみ:

- 表示上限に達した
- 「新しい小節を埋める」でも「未提示の形を出す」でもない候補しか残っていない

後者が「弱い候補を件数合わせで入れない」を担保する。未提示の形という理由は**表示枠が残っている間だけ**有効で、それ以降は被覆を足す候補しか入らない。

---

## 2. カードが先頭に出すOccurrenceを被覆に応じて選ぶ

Bではカードの代表を「最高スコアのOccurrence」に固定していた。その結果、同じPatternが bars 1–8 と 90–97 に出る曲でカードが 1–8 しか表示せず、**カード表示ベースの被覆が 0.974 → 0.917 へ落ちていた**。

Cでは代表をPattern選定時に決める。すでに画面にある小節を避け、**まだ埋まっていないギャップを最も埋めるOccurrence**を先頭にする。同点ならスコア、次に位置。

これで `allCandidateCoverage` は **0.9877** になった（baseline 0.9739 より高い）。全Occurrenceは従来どおりカードから到達できる。

---

## 3. Gate結果（56 file評価）

| Gate | baseline (4.1) | B | **C** |
|---|---|---|---|
| `visiblePatternDuplicateCount = 0` | 38/56 | **56/56 PASS** | **56/56 PASS** |
| `visibleSlotWasteCount = 0` | 38/56 | **56/56 PASS** | **56/56 PASS** |
| **`progressionPrecisionAt3 = 100%`** | 39/56 | 36/56 | **56/56 PASS** |
| **`twoBarFragmentsInTop3 = 0`** | 40/56 | 37/56 | **56/56 PASS** |
| `rank-constraint order` | PASS | PASS | **PASS** |
| `runtime <= 3000ms` | PASS | PASS | **PASS** |
| `deterministic` | PASS | PASS | **PASS** |
| `rank-constraint top3MinHits` | 28/56 | 28/56 | **39/56** |
| `rank-constraint allVisibleMinHits` | 23/56 | 23/56 | **41/56** |
| `coverage >= 90%` | 52/56 | 48/56 | **53/56** |
| `longestUncoveredRun < 8` | 55/56 | 48/56 | 54/56 |
| `occurrenceReachability = 100%` | 55/56 | 55/56 | 54/56 |

**PASSは7項目**（baseline 3、B 4）。

### 指標

| 指標 | baseline | B | **C** |
|---|---:|---:|---:|
| **mustShowSelectedRecallAmongGenerated** | 0.4269 | 0.4328 | **0.8702** |
| **uniquePatternCountAt3** | 1.4821 | 1.8214 | **3.0000**（min=max=3） |
| **uniquePatternCountAt10** | 2.6071 | 3.6607 | **9.7321** |
| progressionPrecisionAt3 | 0.7887 | 0.7708 | **1.0000** |
| twoBarFragmentsInTop3 | 0.5536 | 0.6250 | **0.0000** |
| visiblePatternDuplicateCount | 1.3214 | 0 | **0** |
| **allCandidateCoverage** | 0.9739 | 0.9167 | **0.9877** |
| reachableCandidateCoverage | 0.9861 | 0.9903 | **0.9983** |
| runtime max (ms) | 311 | 273 | **237** |

`uniquePatternCountAt3` が全56ファイルで **3.0** になった。3枠が常に3種類の異なるPatternで埋まる。baselineは平均1.48だった。

### L01（Endless型fixture）

```text
#1  bars 29-36  (8)  progression  Fmaj7 Em7 Dm7 C ×2
#2  bars 78-93  (16) progression
#3  bars 57-72  (16) progression
...
visiblePatternDuplicateCount 0 / top3SingleChordCount 0 / allCandidateCoverage 1.0
```

10枠すべてが異なるprogression。`Em11/A` vampは上位から消え、Patternとしては保持されている。修正前は10枠すべてが2小節候補で、うち5枠が重複だった。

---

## 4. 試して却下したもの（測定による否定結果）

`structuralUsefulness` に **loop coherence** を入れる案を実装して測った。

> 楽節の途中で切れた16小節窓は、その中の8小節楽節より劣る。`loopFitnessScore` は最終コードから先頭コードへの動きでそれを測れる。

結果は**悪化**した。

| 指標 | span基準 | loop coherence追加 |
|---|---:|---:|
| `rank-constraint top3MinHits` | **39/56** | 31/56 |
| `mustShowSelectedRecallAmongGenerated` | **0.8702** | 0.7802 |

解決しない窓を降格すると、**解決しないのが正しいgoldブロックも一緒に降格する**。span基準へ戻した。同じ案を再度盲目的に試さないよう `candidateKind.ts` にコメントとして残した。

---

## 5. 残っている未達

| Gate | 未達ファイル |
|---|---|
| `rank-constraint top3MinHits` (39/56) | S08, S14, S15, S16, S17, L01, L06 ほか |
| `rank-constraint allVisibleMinHits` (41/56) | S11, S14, S15, S16, L01, L04, L06 ほか |
| `coverage >= 90%` (53/56) | S16_clean, L06_clean, L06_stress |
| `longestUncoveredRun < 8` (54/56) | S16_clean, L06_stress |
| `occurrenceReachability` (54/56) | L05_stress, L10_stress |

### L06 は2つの凍結Gateが両立しない

L06 はワンコードvampだけの96小節である。存在する異なるPatternは数個しかなく、各カードは自分の窓長（2/4/8/16小節）しか表示できない。**`visiblePatternDuplicateCount = 0` を守る限り、カード表示ベースで90%被覆に到達する方法がない。**

`reachableCandidateCoverage` は 0.906〜 で、ユーザーは全小節へ到達できる。小節が失われているのではない。

**どちらのGateも緩めない。** A2で凍結した意味のまま残し、両立しないことを事実として報告する。L04は Stage E（窓長）、S16 は窓の粒度の問題で、残りは D・E で扱う。

---

## 6. 触っていない層

`matchWindow` / `smoothTimeline` / `qualityEvidence` / `chordIdentity` / `blockQuality`（repeat・loopFitness係数）/ `groupIntoPatterns` の identity anchor / `attachSourceVoicing` / `coverageSelector.ts` / `defaultAnalyzerMode`。

`phase4-v1` と `phase4.1-v1` は削除していない。

---

## 7. 追加したテスト

`src/domain/midi/patternCandidate.test.ts`（+6件、計15件）

```text
puts a progression ahead of a vamp that scores higher
keeps looking after one candidate has covered everything
does not pad the list with candidates that add nothing
leads a card with the occurrence that closes the open gap
falls back to vamps when the song contains no progression
produces identical steps on a rerun
```
