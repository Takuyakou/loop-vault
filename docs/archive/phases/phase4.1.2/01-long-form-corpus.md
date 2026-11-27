# Loop Vault Phase 4.1.2 — A1 Long-form Corpus v1.1

- 作成日: 2026-07-25
- 生成器: `loop-vault-p412-longform-v1`（決定的・再生成可能）
- 24 MIDI / 12シナリオ × clean/stress / **全ファイル96〜192小節**
- 配置: `.local-evaluation/long-form-v1.1/`（Git管理外）
- 製品コード変更: **なし**

```bash
npx vite-node scripts/generate-long-form-corpus.ts
```

---

## 1. なぜ長尺が必要か

Synthetic Gold Corpus v1 は48ファイル中32が8〜32小節だった。ユーザーが報告した不具合——ワンコードvampが上位を占領する——は**繰り返し回数が生む現象**であり、16小節のファイルでは「同じvampが4回現れ、その周囲に100小節の別素材がある」状態を表現できない。

前回診断で `top3SingleChordCount` が3 splitすべてで 0 だったのはこの制限による。本コーパスは全ファイルを96小節以上にしてその制限を外す。

---

## 2. シナリオとsplit

split は**シナリオ対単位**。clean と stress が split をまたがない。

| id | title | 小節 | split | stress特性 | 狙い |
|---|---|---:|---|---|---|
| L01 | endless-vamp-vs-progressions | 112 | dev | all-channel-zero, fragmented, dense-melody, voice-duplicate | 2小節ワンコード4出現 + 異なる8小節進行4件 |
| L02 | pattern-eight-occurrences | 128 | dev | different-voicing-per-occurrence, track-reorder, humanized | 同一Pattern 8出現、Occurrenceごとにvoicing変更 |
| L03 | middle-section-reachability | 144 | **holdout-v2** | section-instrumentation-change, fragmented, all-channel-zero | 曲中央セクションへの到達 |
| L04 | odd-section-lengths | 96 | dev | fragmented, dense-melody, all-channel-zero | 14/18/20小節セクション |
| L05 | phrase-vs-half-repeat | 128 | dev | humanized, overlap, voice-duplicate | 8小節進行と4小節前半反復の競合 |
| L06 | vamp-only-song | 96 | dev | fragmented, arpeggiated, ghost-notes | 1コードvampしか存在しない曲 |
| L07 | rootless-walking-bass | 96 | **holdout-v2** | rootless, walking-bass, voice-duplicate, dense-melody | rootless + walking bass |
| L08 | pedal-slash-progression | 96 | validation | voice-duplicate, all-channel-zero, fragmented | D/E・E/F#・C/Dペダル |
| L09 | arpeggiated-extraction | 112 | **holdout-v2** | arpeggiated, all-channel-zero, fragmented, ghost-notes | arpeggiated AI抽出 |
| L10 | humanized-overlap | 112 | validation | humanized, overlap, dense-melody | humanized overlap |
| L11 | transposed-repeats | 96 | **holdout-v2** | different-voicing-per-occurrence, all-channel-zero, humanized | 同一進行の移調反復 |
| L12 | nested-block-lengths | 128 | dev | dense-melody, overlap, fragmented | 4/8/16小節の入れ子 |

```text
dev         6シナリオ / 12 MIDI
validation  2シナリオ /  4 MIDI
holdout-v2  4シナリオ /  8 MIDI
```

**holdout-v2 は評価コード・Gate・実装を固定するまで実行しない。**

---

## 3. Endless型fixtureの受け入れ判定

要件: 修正前 `phase4.1-v1` で `top3SingleChordCount >= 2` **または** `visiblePatternDuplicateCount >= 2` を再現すること。

| fixture | top3SingleChordCount | **visiblePatternDuplicateCount** | 判定 |
|---|---:|---:|---|
| **L01_clean** | 0 | **5** | **PASS** |
| **L01_stress** | 0 | **5** | **PASS** |

L01_clean の上位10枚（修正前 `phase4.1-v1`）:

```text
#1  bars 3-4   (2) fragment  pattern-occ-3-4   occ=5  Dm7 G7
#2  bars 86-87 (2) fragment  pattern-occ-4-5   occ=3  G7 Cmaj7
#3  bars 7-8   (2) fragment  pattern-occ-3-4   occ=5  Dm7 G7   ← 重複1
#4  bars 89-90 (2) fragment  pattern-occ-3-4   occ=5  Dm7 G7   ← 重複2
#5  bars 85-86 (2) fragment  pattern-occ-3-4   occ=5  Dm7 G7   ← 重複3
#6  bars 4-5   (2) fragment  pattern-occ-4-5   occ=3  G7 Cmaj7 ← 重複4
#7  bars 90-91 (2) fragment  pattern-occ-4-5   occ=3  G7 Cmaj7 ← 重複5
#8  bars 9-10  (2) vamp      pattern-occ-9-10  occ=16 Abmaj7
#9  bars 21-22 (2) vamp      pattern-occ-21-22 occ=8  Bm7
#10 bars 81-82 (2) vamp      pattern-occ-81-82 occ=3  C#7
```

10枠すべてが2小節候補、うち5枠が重複、gold進行4件は**1件も到達不可**（`mustShowSelectedRecall = 0`, `occurrenceRecall = 0`）。実MIDI `15.Endless,endless.` と同じ形である。

---

## 4. 修正前 dev baseline（phase4.1-v1）

| scenario | top3vamp | dup | top3prog | 2barFrag | selRecall | occRecall |
|---|---:|---:|---:|---:|---:|---:|
| L01_clean | 0 | **5** | 0 | 3 | 0.00 | 0.00 |
| L01_stress | 0 | **5** | 0 | 3 | 0.00 | 0.00 |
| L02_clean | 0 | **6** | 1 | 2 | 1.00 | 1.00 |
| L02_stress | 0 | **8** | 3 | 0 | 1.00 | 1.00 |
| L04_clean | 0 | 0 | 3 | 0 | 0.00 | 0.00 |
| L04_stress | 0 | 1 | 1 | 2 | 0.00 | 0.00 |
| L05_clean | 0 | **3** | 2 | 1 | 1.00 | 1.00 |
| L05_stress | 0 | **4** | 2 | 1 | 0.00 | 0.00 |
| L06_clean | **3** | **4** | 0 | 0 | 0.00 | 0.00 |
| L06_stress | 0 | **4** | 3 | 0 | 0.00 | 0.00 |
| L12_clean | 0 | **8** | 0 | 3 | 0.00 | 0.00 |
| L12_stress | 0 | **3** | 1 | 2 | 0.33 | 0.00 |

集計:

```text
mustShowGeneratedRecall     86.11%  （L04の14/18/20小節が生成不能: 損失10件）
mustShowSelectedRecall      27.78%
visiblePatternDuplicateCount  51
occurrenceRecall            25.00%
allCandidateCoverage        90.77%
progressionCandidateCoverage 73.11%
boundaryMatchWithinTolerance 100.00%
runtime max                 307 ms
```

**12ファイル中0件が完全合格。** 6シナリオすべてが少なくとも1つの失敗を再現しており、回帰fixtureとして採用する。

---

## 5. 生成の設計判断（記録）

### 5.1 filler が候補を支配しないようにする

最初は7コード周期のfillerを使った。**これは失敗だった**: 7周期は7小節離れた窓を同一にするため、filler の8小節窓が occurrence 10件を獲得し、上位10枠すべてを filler が占めた。シナリオが「対象ブロック」ではなく「filler」を試験していた。

修正: 固定seedのaperiodicな歩行に変更し、さらに L01 では**4小節ホールドのpad filler**にした。1小節1コードでは2小節窓が「2コード断片」になり relative signature が衝突して occurrence 3〜5 を獲得し、対象のvampを上回ってしまう。4小節ホールドなら filler の2小節窓は1コード形になり、4出現を持つ Em11/A vamp が最強の短候補になる——実ファイルが作る状況そのものである。

### 5.2 決定性

同一seedから同一バイト列。2回生成して24ファイルすべての sha256 が一致することを確認した（`deterministic regeneration: PASS`）。

### 5.3 Gold は音と同時に書く

`realiseScenario` は notes と gold events を**1パスで生成する**。イベントはその音が書かれた瞬間に記録されるため、ラベルが音からずれることが構造的に起こらない。

### 5.4 ドラムは必ずチャンネル9に残す

`all-channel-zero` stress でもドラムはチャンネル9に残す。ドラムをチャンネル0へ潰すと打楽器が和声になり、それは別のシナリオになってしまう。

---

## 6. 既知の限界

1. **Gold by construction。** 独立した専門家の採譜ではない
2. **生成器が音とラベルの両方を作っている。** 生成器の癖はGoldにも入る
3. **filler が人工的。** 実曲の「つなぎ」はこれほど整っていない。§5.1 の調整は fixture を目的に合わせるための操作であり、実MIDIの分布を再現するものではない
4. **L04 の14/18/20小節は現行生成器では原理的に候補にならない。** Stage E の対象であり、A1時点で `mustShowGeneratedRecall 86.11%` は仕様どおりの値
5. **holdout-v2 は4シナリオ8ファイル。** 頻度推定には使えない

昇格判断では本コーパス単独を根拠にしない。Synthetic Gold Corpus v1 / SURAN remix / `15.Endless,endless.` / Chapter 3 Seed / Chord Drip corpus を併用する。

---

## 成果物

```text
docs/phase4.1.2/01-long-form-corpus.md            本書
docs/phase4.1.2/01-long-form-corpus.json          24ファイルのfingerprintとsplit
docs/phase4.1.2/01-longform-dev-baseline.json     修正前dev baseline
scripts/longFormCorpus.ts                         音とGoldの生成
scripts/longFormScenarios.ts                      12シナリオ定義
scripts/generate-long-form-corpus.ts              書き出し
```

MIDI本体はGitに入れない。`scripts/generate-long-form-corpus.ts` を実行すれば同一バイト列が再生成される。
