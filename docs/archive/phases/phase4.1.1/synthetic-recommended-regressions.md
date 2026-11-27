# Loop Vault Phase 4.1.1 — 推奨する回帰テスト

- 作成日: 2026-07-25
- 根拠: `docs/phase4.1.1/synthetic-corpus-diagnostic-report.md`
- **本書は提案であり、このStageでは実装しない。**

各原因について、最小再現fixture・追加すべきunit test・integration test・promotion gate・影響する製品ファイル・期待される改善指標・想定される副作用を示す。

---

## 0. まず追加すべき指標（これが無いと以下すべてが測れない）

### 0.1 `mustShowSelectedRecall`

生成された期待ブロックのうち、**選定リスト全体**（表示上限より前）から到達できる割合。

これが無いと「生成されなかった」と「生成されたが選ばれなかった」を区別できない。本診断で判明した主原因は後者であり、Phase 4.1 の凍結Gateにはこの指標が無かった。

```text
現状値（phase4.1-v1）: dev 59.38% / validation 0.00% / holdout 31.55%
現状値（phase4-v1）:   dev 71.09% / validation 43.75% / holdout 6.25%
```

### 0.2 `eventCountRatio`

`product timeline event count / gold event count`。

`boundaryMatchWithinTolerance` は「gold onset の近くに製品 onset があるか」しか見ないため、2コードを1つにマージした過統合を検出できない（S23 bar73: `Dm7`+`C` → `C6/9`）。

```text
現状値: dev 1.019 / validation 1.369 / holdout 0.960
最悪:   S20_stress 32/16 = 2.000（過分割）, S23 146/160 = 0.913（過統合）
```

### 0.3 `visiblePatternDuplicateCount` / `visibleSlotWasteCount`

表示カードのうち、同一 patternId が2枚目以降に消費した枠数。

**注意**: gold の `expected_card_count` チェックだけでは不十分。3 split すべてで `expectedCardCountMatch = 100%` でありながら重複は発生していた。重複は gold が列挙していない Pattern 同士で起きるため、**gold非依存の指標が必要**である。

---

## 1. 早期停止（Primary cause）

### 最小再現fixture

```text
16小節 / 4/4 / 単一harmonyトラック
bars 1-8   : Cmaj7 Am7 Fmaj7 G7 Cmaj7 Am7 Fmaj7 G7
bars 9-16  : Dm7 G7 Cmaj7 Am7 Fmaj7 G7 Cmaj7 A7
期待: 8小節ブロック2件がいずれも選定リストへ入る
```

合成コーパスの `S18_clean` がそのまま最小再現になる（validation split）。

### unit test

`src/domain/midi/coverageSelector.test.ts`

```text
it("keeps selecting after the coverage target is reached while candidates still differ")
  - harmonicActiveBars 1..16
  - occurrences: 1-16（1件で全被覆）, 1-8, 9-16
  - 期待: selected に 1-8 と 9-16 が含まれる
  - 現状: selected = [1-16] のみ、stoppedBecause = "stopped-coverage-target"

it("reports why it stopped so an early stop cannot pass silently")
  - stoppedBecause が "stopped-coverage-target" のとき selected.length を検証
```

### integration test

`src/domain/midi/coverageCandidates.test.ts`（新規）

```text
it("offers both eight-bar phrases of a sixteen-bar song")
  - 合成MIDI（上記fixtureを既存のテストヘルパで生成）
  - buildCoverageCandidates の candidates が bars 1-8 と 9-16 を含む
```

### promotion gate

| Gate | 基準 | 現状（phase4.1-v1） |
|---|---|---|
| `mustShowSelectedRecall` | = 100%（合成コーパス全splitのmust-show） | dev 59.38% / val 0.00% / holdout 31.55% |
| `meanSelectedCount` | ≥ 3（must-showが3件以上ある曲） | dev 1.84 / val 1.25 |
| `allCandidateCoverage` | 非低下（≥ 現状値） | dev 99.51% / val 100.00% |

### 影響する製品ファイル

- `src/domain/midi/coverageSelector.ts` — `DEFAULT_COVERAGE_TARGET`、`while` の停止条件
- `src/domain/midi/coverageCandidates.ts` — オプションの受け渡しのみ

### 期待される改善指標

`mustShowSelectedRecall` / `mustShowTop10Recall` / `occurrenceRecall`。件数ベースでは 248件中 115件（`must-show-missing-from-top3/top10`）。

### 想定される副作用

- 候補数増 → runtime増（現在 max 322 ms、上限 3000 ms なので余裕あり）
- 弱い候補の混入 → `minimumSelectedCandidateScore` の下限を回帰項目にする
- 表示枠の競合が激化 → §2 の一意化を**先に**入れる必要がある

---

## 2. Pattern重複（ユーザーが見た症状）

### 最小再現fixture

```text
32小節 / 同一8小節進行 × 4回（bars 1-8, 9-16, 17-24, 25-32）
期待: 1カード + 4Occurrence
```

合成コーパス `S12_repeated-pattern-four-times`、より強い形で `S16_intro-verse-chorus`（chorusが4枠を占有）。

### unit test

`src/domain/midi/coverageCandidates.test.ts`（新規）

```text
it("spends one display slot per pattern and keeps every occurrence")
  - 同一relativeSignatureのOccurrenceが4件selectedに入る状況を作る
  - 期待: candidates に同一patternIdが1件のみ
  - 期待: そのpatternのoccurrencesが4件、startBar順、occurrenceIdで重複なし
  - 期待: representativeOccurrence が決定的（再実行で同一）

it("merges selected siblings instead of dropping the later ones")
  - occurrences の union であること（selected に無い出現も含む）
```

`src/components/OccurrenceList.test.tsx`

```text
it("lets each occurrence be auditioned and saved on its own")
  - 4件それぞれに data-occurrence-preview / data-occurrence-save が存在
```

### integration test

`src/views/CaptureView.test.tsx`

```text
it("does not show the same progression as three separate cards")
  - S16相当のMIDIを読み込み、カードのpatternIdが一意であること
```

### promotion gate

| Gate | 基準 | 現状 |
|---|---|---|
| `visiblePatternDuplicateCount` | = 0（合成全split + Endless + SURAN） | dev 8 / holdout 25 / Endless 3 |
| `visibleSlotWasteCount` | = 0 | 同上 |
| `occurrenceReachability` | = 100% | 既に100%（維持） |
| 同一 `normalizedProgressionIdentity` | 表示1カード | Endless で4カード |

### 影響する製品ファイル

- `src/domain/midi/coverageCandidates.ts` — `selection.selected` → `candidates` の投影
- `src/components/OccurrenceList.tsx` — 統合後のoccurrence一覧
- `src/views/CaptureView.tsx` — カード描画

### 想定される副作用

- 表示枠が減る → 被覆が下がる可能性。**`allCandidateCoverage` と `progressionCandidateCoverage` を分けて報告する**こと
- Pattern統合により representative の選び方が結果を左右する → 決定性テストを必須にする

---

## 3. 短窓・部分窓優位

### 最小再現fixture A（短断片）

```text
16小節
bars 1-2   : 2小節断片（Dmaj7/A Dm9/A）が曲中4回
bars 5-12  : 8小節進行1回
期待: 8小節進行が2小節断片より上位
```

### 最小再現fixture B（部分窓）

```text
32小節 / 8小節コーラス（Fmaj7 G7 Em7 Am7 Fmaj7 G7 Em7 Am7）× 4回
期待: 8小節版が4小節前半（Fmaj7 G7 Em7 Am7）より上位
```

合成コーパス `S16_clean` で実際に4小節版（13-16）が8小節版（13-20）を押しのけている。

### unit test

```text
src/domain/midi/coverageSelector.test.ts
it("prefers a full phrase over its own first half")
  - 同一harmonic内容で lengthBars 4 と 8 の候補
  - 4小節版のrepeatCountが高い状況を作る
  - 期待: 8小節版が先に選ばれる

it("does not put a two-bar fragment above an available progression")
```

### promotion gate

| Gate | 基準 | 現状 |
|---|---|---|
| `twoBarFragmentsInTop3` | = 0（4小節以上のprogressionが存在する場合） | dev 5 / phase4-v1 dev 57 |
| `top3ProgressionCount` | = 3（progressionが3Pattern以上ある場合） | Endless 0 |
| 8小節版が4小節前半より上位 | 真 | S16 で偽 |

### 影響する製品ファイル

- `src/domain/midi/coverageSelector.ts` — 効用への窓長信号
- 新規の分類モジュール（progression / vamp / fragment）

### 修正してはいけない場所

**`src/domain/midi/blockQuality.ts` の `repeat 0.20` / `loopFitness 0.10` を下げてはいけない。** Phase 4.0 のヴァンプ救済がこれに依存している。scoreは正しく、誤っているのは「scoreをそのまま主候補の順位に使うこと」である。

### 想定される副作用

- vamp が下がりすぎて実質削除される → **「vampが補助レーンに存在すること」を回帰項目にする**（`Em11/A` カードが消えてはいけない）
- 短い曲では8小節候補が存在せず fragment しか無い場合がある → fallback の検証が必要

---

## 4. 生成窓長セットの不足

### 最小再現fixture

```text
100小節 / セクション長 16, 16, 14, 18, 16, 20
期待: 各セクションが候補として生成される
```

合成コーパス `S24_long-mixed-section-coverage`（holdout）。現状 14 / 18 / 20小節の3件が生成不能。

### unit test

`src/domain/midi/occurrence.test.ts`

```text
it("generates a window for a fourteen-bar section")
  - buildOccurrences に lengths を渡せること、または境界由来の窓を作れること
  - 期待: startBar 33, endBar 46 の occurrence が存在する
```

### promotion gate

| Gate | 基準 | 現状 |
|---|---|---|
| `candidateGenerationLoss` | = 0 | holdout 6 |
| runtime | ≤ 3000 ms | max 322 ms |
| 決定性 | 再実行で同一 | 維持 |

### 影響する製品ファイル

- `src/domain/midi/occurrence.ts` — `lengths` 既定 `[2, 4, 8, 16]`
- `src/domain/midi/sections.ts` — セクション境界からの窓生成を使う場合

### 重要な訂正事項

Phase 4.1 は「注目範囲33–46小節の被覆 0 → 14小節」を成果として記録したが、**33–46 という区間そのものは候補になれない**。16小節窓が重なって被覆と数えられていただけで、ユーザーがそのセクションを掴む手段はない。この項目の修正時に Phase 4.1 の記録を訂正すること。

### 想定される副作用

- 窓数増加 → Pattern数増加、dedup負荷、runtime
- 任意長を許すと候補空間が爆発する → セクション境界由来に限定するのが安全

---

## 5. qualityEvidence の root / 品質分離

### 最小再現fixture

```text
A: 8小節 / D三和音 + Eペダルベース（短3度なし）
   期待: D/E または Dadd9/E または E11(no3)。Em11 は不可
B: 8小節 / C D F G A（G bass, 短3度なし）
   期待: G9sus4。Gm11 は不可
```

合成コーパス `S04_slash-pedal-loop`（A）、`S06_quality-variety` bar4（B）。実MIDI `15.Endless,endless.` の `Em11/A` も同型。

### unit test

`src/domain/midi/qualityEvidence.test.ts`

```text
it("refuses a minor eleventh when no minor third sounds anywhere in the window")
  - histogram に短3度が 0
  - 期待: min11 が勝者にならない
  - 現状: missingPenalty = 0.5 × 0.08 = 0.04 で覆せない

it("does not let the quality penalty change which root wins")
  - 同一rootの候補間でのみペナルティが働くこと
```

### integration test

**両コーパス同時評価を必須にする。**

```text
scripts/probe-quality-evidence-penalty.ts（本診断で追加、dev専用）
scripts/tune-quality-evidence.ts（既存、Chord Drip tune corpus）
→ 両方を1つのGateチェックに束ねる
```

### promotion gate

| Gate | 基準 |
|---|---|
| 合成コーパス triad | ≥ 96%（0.12相当の水準） |
| **Chord Drip corpus root** | **非低下（≥ 59.69%、tolerance 0.5pp）** |
| Chord Drip corpus triad | 非低下（≥ 59.86%、tolerance 3pp） |
| Chapter 3 Seed canonicalExact | 非低下（≥ 97.74%） |

**片方のコーパスだけの改善では昇格しない。** これが本項目の最重要条件である。

### 影響する製品ファイル

- `src/domain/midi/qualityEvidence.ts` — `definingIntervals`、`attenuateRootBonus`
- `src/domain/midi/legacy.ts` — `matchWindowWithRankingScore` のroot選択とペナルティ適用順
- `src/domain/midi/phase4Analyzer.ts` — `phase4QualityEvidence` 定数

### 想定される副作用

- root選択の分離は matchWindow の構造変更であり、**Timeline全体が動く**。Chord Drip 100件のtimeline完全一致は成立しなくなる
- したがって §1〜§4 とは**独立のPR・独立のGate**で進める。混ぜると原因が絞れない

### 絶対にやってはいけないこと

`phase4QualityEvidence.penalty` を 0.08 → 0.12 に上げる単独変更。Chord Drip corpus で root −10.71pp / triad −6.88pp。合成コーパスだけを見ればPASSするため、**Gateの構成を誤ると通ってしまう**。

---

## 6. イベント過統合 / 過分割

### 最小再現fixture

```text
A（過統合）: 8小節 / 半小節ごとに Cmaj7 G/B Am7 Em/G ...
             期待: 16イベント。現状 S23 bar73 で Dm7+C → C6/9 の1件
B（過分割）: 8小節 / humanized timing + overlap notes
             期待: 8イベント。現状 S20_stress は 32/16 = 2.0倍
```

### unit test

`src/domain/midi/segmentation.test.ts` / `merge.ts`

```text
it("keeps both chords of a half-bar pair")
it("does not split a sustained chord into repeated events")
```

### promotion gate

| Gate | 基準 | 現状 |
|---|---|---|
| `eventCountRatio` | 0.9 ≤ ratio ≤ 1.1 | dev 1.019 / val 1.369 / holdout 0.960 |

**まず指標を追加し、現状値を凍結してから**改善に着手する。指標が無い状態での修正は評価できない。

---

## 7. clean / stress 安定性（横断項目）

診断で判明した重要な性質: **ボイシングが変わるだけでTimelineは同一なのに選定結果が変わる**（S12 で重複が stress のみ発生、S22 で top10 recall が低下）。選定がスコアの微小差で決まっているためである。

### promotion gate

| Gate | 基準 |
|---|---|
| clean / stress の `visiblePatternDuplicateCount` 差 | = 0 |
| clean / stress の `mustShowSelectedRecall` 差 | = 0 |
| clean / stress の選定Pattern集合 | 一致 |

決定性（同一入力で同一出力）は既にPASSしているが、**安定性（意味的に同じ入力で同じ出力）は未検証**である。選定の重みを変更するすべてのPRでこれを見る必要がある。

---

## 8. 実装順序（推奨）

```text
0（指標追加・製品変更なし）
  ↓
2（Pattern一意化）      ← Timelineに触らない、最小リスク
  ↓
1（早期停止）           ← Timelineに触らない
  ↓
3（レーン分離）
  ↓
4（窓長セット）
  ↓
6（イベント境界）

5（qualityEvidence）    ← 上と並行・完全に独立。Timelineが動くため別Gate
```

2 と 1 で失敗248件のうち約210件（84.7%）を対象にできる。どちらも Timeline / canonical契約 / Pattern-Occurrenceモデル本体に触らない。
