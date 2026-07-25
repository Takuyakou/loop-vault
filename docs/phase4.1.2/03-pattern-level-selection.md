# Loop Vault Phase 4.1.2 — B Pattern-level visible selection

- 作成日: 2026-07-25
- 新規モード: `phase4.1.2-v1`（選択可能。**製品既定は `phase4-v1` のまま**）
- Timeline / qualityEvidence / canonical identity: **変更なし**

---

## 1. 何を変えたか

**表示枠を消費する単位を Occurrence から Pattern へ変えた。** それだけである。

Occurrence は証拠とスコアの単位としては正しい。各Occurrenceは自分の小節位置・絶対コード・voicingを持つ。カードの単位としては誤っている。Occurrenceを選定して1件ずつカードにしたため、`15.Endless,endless.` では同じ進行が10枠のうち4枠を占めた。

**後段UIで重複を消す実装は採らなかった。** それでは選定が依然として重複に枠を使い続け、問題が移動するだけで解決しない。

```text
src/domain/midi/patternCandidate.ts   Pattern集約
src/domain/midi/patternSelection.ts   Pattern単位の選定
src/domain/midi/phase412Analyzer.ts   新モード
```

### 1.1 Pattern集約

| 項目 | 実装 |
|---|---|
| occurrence union | 全Occurrenceを保持 |
| occurrenceId重複除去 | `Map` によるid一意化 |
| startBar順 | startBar → lengthBars → id |
| best representative | **score → startBar → lengthBars → id**（決定的） |
| absolute chord保持 | 各Occurrenceが自分のeventsを持つ。移調反復でrootが異なることをテストで固定 |
| voicing保持 | `source` timeline itemをそのまま保持。`attachSourceVoicing` は変更なし |
| covered bars | §1.2 参照 |

`groupIntoPatterns` の identity anchor（最早Occurrence）は変えていない。`transposeOffset` の意味が変わらないようにするためで、表示用の representative とは別概念として持つ。

### 1.2 被覆の計上を representative に限った理由（やり直した）

最初は `coveredBars` を全Occurrenceのunionにした。**これは失敗だった。**

| 版 | allCandidateCoverage (mean) | coverage Gate | 原因 |
|---|---:|---|---|
| union で計上 | **0.554** | **16/56** | 1回の選択で曲の大半を「被覆済み」と数えるため `coverageTarget = 0.95` が2件で発火し、候補リストが以前より短くなった |
| **representativeで計上** | 0.917 | 48/56 | カードが実際に表示する小節だけを数える |

指示は「Patternカードから到達可能な全Occurrenceを被覆として数えてよい」としているが、それを**選定の内部計上**に使うと早期停止と噛み合って逆効果になる。unionは `reachableBars` として別に保持し、報告にのみ使う。

---

## 2. Gate結果（56 file評価、Synthetic Gold v1 + Long-form v1.1 の dev+validation）

| Gate | phase4.1-v1 | **phase4.1.2-v1** |
|---|---|---|
| **`visiblePatternDuplicateCount = 0`** | 38/56 FAIL | **56/56 PASS** |
| **`visibleSlotWasteCount = 0`** | 38/56 FAIL | **56/56 PASS** |
| `occurrenceReachability = 100%` | 55/56 FAIL | 55/56 FAIL |
| `progressionPrecisionAt3 = 100%` | 39/56 FAIL | 36/56 FAIL |
| `twoBarFragmentsInTop3 = 0` | 40/56 FAIL | 37/56 FAIL |
| `rank-constraint top3MinHits` | 28/56 FAIL | 28/56 FAIL |
| `rank-constraint allVisibleMinHits` | 23/56 FAIL | 23/56 FAIL |
| `rank-constraint order` | 56/56 PASS | 56/56 PASS |
| **`coverage >= 90%`** | 52/56 FAIL | **48/56 FAIL（悪化）** |
| **`longestUncoveredRun < 8`** | 55/56 FAIL | **48/56 FAIL（悪化）** |
| `runtime <= 3000ms` | PASS | PASS |
| `deterministic` | PASS | PASS |

### 指標

| 指標 | phase4.1-v1 | phase4.1.2-v1 | 差 |
|---|---:|---:|---|
| **visiblePatternDuplicateCount (mean)** | 1.3214 | **0** | **−1.32** |
| **uniquePatternCountAt3 (mean)** | 1.4821 | **1.8214** | **+0.34** |
| **uniquePatternCountAt10 (mean)** | 2.6071 | **3.6607** | **+1.05** |
| mustShowSelectedRecallAmongGenerated | 0.4269 | 0.4328 | +0.01 |
| **reachableCandidateCoverage** | 0.9861 | **0.9903** | **+0.004** |
| **allCandidateCoverage** | 0.9739 | **0.9167** | **−0.057** |
| progressionPrecisionAt3 | 0.7887 | 0.7708 | −0.018 |
| twoBarFragmentsInTop3 | 0.5536 | 0.6250 | +0.07 |

---

## 3. 正直な評価

### 達成したこと

**Pattern重複は完全に消えた。** 56ファイルすべてで `visiblePatternDuplicateCount = 0` / `visibleSlotWasteCount = 0`。Gate 1・2が baseline の 38/56 から 56/56 になった。

副作用として提示の多様性が上がった。10枠で提示できる異なるPattern数が平均 2.61 → 3.66。

### 悪化したこと

**カードが表示する小節の被覆が落ちた。** `allCandidateCoverage` 0.974 → 0.917、Gate は 52/56 → 48/56。`longestUncoveredRun < 8` も 55/56 → 48/56。

原因は単純である。同じPatternが bars 1–8 と bars 90–97 に出る場合、以前は2枚のカードが両方を表示していた。いまは1枚になり、90–97は**到達可能だが表示はされない**。`reachableCandidateCoverage` は 0.9861 → 0.9903 と微増しているので、**小節が失われたのではなく、直接表示から到達可能へ移った**。

ただし A2 で凍結した Gate は `allCandidateCoverage`（カードが表示する小節）で定義されている。**この Gate の定義を到達可能ベースへ差し替えることはしない。** 結果に合わせて凍結済みGateの意味を変えることになるからである。両方を報告し、カード表示ベースの被覆は Stage C で回復させる。

`progressionPrecisionAt3` と `twoBarFragmentsInTop3` は微減した。これらは順位の問題であり Stage C / D の対象で、B は順位付けの目的関数を一切変えていない（意図的に同じ効用関数を使っている。単位の効果だけを分離して測るため）。

### まだ達成していないこと

13 Gate のうち **PASSは4項目**。B単独では昇格しない。既定は `phase4-v1` のまま。

---

## 4. 追加したテスト

`src/domain/midi/patternCandidate.test.ts`（9件）

```text
spends one candidate per pattern and keeps every occurrence
deduplicates occurrences by id and orders them by position
leads with the highest scoring occurrence, deterministically
breaks a score tie by position rather than by input order
separates the bars the card shows from the bars it can reach
keeps each occurrence's own absolute chords          ← 移調反復でrootが異なる
never selects the same pattern twice
keeps quality as a gate rather than a currency        ← floor未満は候補数0でも入れない
produces the same selection on a rerun
```

---

## 5. 触っていない層

- `matchWindow` / `smoothTimeline` / `qualityEvidence` — Timelineは1バイトも動かない
- `chordIdentity.ts` — canonical identity契約
- `blockQuality.ts` の repeat / loopFitness 係数
- `groupIntoPatterns` の identity anchor と `transposeOffset`
- `attachSourceVoicing`
- `coverageSelector.ts`（Occurrence単位）— `phase4.1-v1` の挙動を保つため残す
- `defaultAnalyzerMode` — `phase4-v1` のまま

`phase4.1-v1` も `phase4-v1` も削除していない。3モードすべてが同じGateで比較できる。

---

## 成果物

```text
docs/phase4.1.2/03-pattern-level-selection.md   本書
docs/phase4.1.2/03-gate-phase4.1-v1.json        比較対象
docs/phase4.1.2/03-gate-phase4.1.2-v1.json      Stage B結果
```
