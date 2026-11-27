# Loop Vault Phase 4.1.1 — P4.1.1-00 再現と損失Stage特定

- 作成日: 2026-07-25
- 対象MIDI: 15.Endless,endless.（`sha256-c153f78e…`, 25,966 bytes、Git管理外）
- 比較対象: SURAN remix（Phase 4.1と同一fixture）
- 計測: `scripts/diagnose-candidate-usefulness.ts`

MIDI本体は `.local-evaluation/phase4.1.1/fixtures/` に置き、Gitへは追加していない。本書と成果物JSONには内容fingerprintとbyte長のみを記録する。

---

## 1. 再現

`phase4.1-v1`（不具合時の製品既定）で報告どおり再現した。

| # | 小節 | 長さ | 種別 | コード | patternId | 出現 | score | 追加被覆 | utility |
|---:|---|---:|---|---|---|---:|---:|---:|---:|
| 1 | 145–146 | 2 | vamp | Em11/A | `pattern-occ-27-28` | 4 | 0.784732 | 2 | 0.318667 |
| 2 | 27–28 | 2 | vamp | Em11/A | `pattern-occ-27-28` | 4 | 0.769560 | 2 | 0.296287 |
| 3 | 107–108 | 2 | vamp | Em11/A | `pattern-occ-27-28` | 4 | 0.769434 | 2 | 0.296292 |
| 4 | 112–127 | 16 | progression | E6/9/Ab … Bm7（22コード） | `pattern-occ-112-127` | 1 | 0.679585 | **16** | 0.294996 |
| 5 | 43–44 | 2 | vamp | Em11/A | `pattern-occ-27-28` | 4 | 0.764377 | 2 | 0.293766 |
| 6 | 21–22 | 2 | fragment | Dmaj7/A Dm9/A | `pattern-occ-21-22` | 2 | 0.746051 | 2 | 0.293244 |

報告と一致する:

- 候補1〜3がすべて Em11/A、各1コード・2小節
- 各カードが同じ「出現: 4箇所」を表示
- 4枚（1・2・3・5）が**同一 patternId**、同一 `normalizedProgressionIdentity` = `0:7680:0|minor|minor7|11||9`
- ワンコード断片が16小節進行より上位

---

## 2. 損失Stage

5段階を追跡した。

| Stage | 件数 | 異なるPattern数 | 判定 |
|---|---:|---:|---|
| 1. generated occurrences | 590 | 581 | 正常 |
| 2. scored occurrences | 590 | 581 | 正常 |
| 3. **selected occurrences** | 15 | **12** | **重複の発生源** |
| 4. grouped patterns | 581 | 581 | 正常（ただし表示へ反映されない） |
| 5. UI candidate cards | 10 | **7** | 重複がそのまま表示 |

**Stage 3（選定）で重複が入り、Stage 4・5がそれを補正しない。**

Pattern化そのものは正しく動いている。581 Occurrence が 581 Pattern に整理され、Em11/A の4出現は1つの Pattern にまとまっている。問題は、**選定が Occurrence 単位で動くのに表示枠も Occurrence 単位で消費される**ことにある。Pattern は表示の直前に計算されるが、枠の割り当てには一切関与しない。

### なぜ選定が同じPatternを4回選ぶのか

`selectOccurrencesByCoverage` の効用関数で、同一Patternの再選出に対するペナルティは

```
weights.diversity * diversityGain * 0.1  =  0.12 × 1 × 0.1  =  最大 0.012
```

しかない。一方 quality は最大 0.30 を占める。Em11/A の2小節窓は score 0.7696、16小節進行は 0.6796 で、この差が 0.012 の多様性ボーナスを容易に上回る。

utility を見ると差は決定的ではなく僅差である:

```
#2  Em11/A 2小節（新規2小節）      0.296287
#4  16小節進行（新規16小節）       0.294996   ← 0.0013 差で敗北
```

**8倍の被覆を持つ候補が、0.0013 の差で3枚目のワンコード重複に負けている。** 被覆重み 0.50 は効いているが、2小節と16小節の限界被覆差（0.007 対 0.055）を quality 差が打ち消している。

### なぜワンコードのscoreが高いのか

`scoreBlockQuality` の `repeat 0.20` と `loopFitness 0.10` は、1コードが4回繰り返される窓に対して最大値を返す。これは Phase 4.0 の設計意図どおり（ヴァンプを「busyな進行の劣化版」として減点しない）で、**scoreそのものは誤っていない**。誤っているのは、その score をそのまま主候補の順位に使っていることである。

---

## 3. 指標（Endless, 上位10枚）

| 指標 | phase4.1-v1 | phase4-v1 |
|---|---:|---:|
| **visiblePatternDuplicateCount** | **3** | 0 |
| visiblePatternDuplicateRate | 30.0% | 0% |
| **visibleSlotWasteCount** | **3** | 0 |
| visibleUniquePatternCount | 7 | 10 |
| **top3SingleChordCount** | **3** | 0 |
| top10SingleChordRate | 40.0% | 10.0% |
| **top3ProgressionCount** | **0** | 0 |
| top10ProgressionCount | 5 | 4 |
| progressionCandidateAvailability | 435 | 435 |
| fragmentCandidateCount | 142 | 142 |
| vampCandidateCount | 2 | 2 |
| **allCandidateCoverage** | 96.67% | 24.00% |
| **progressionCandidateCoverage** | 94.00% | 18.67% |
| coverageAtVisible（上位10枚） | **60.00%** | 24.00% |
| longestUncoveredHarmonicRun | 3 | 3 |

読み取れること:

1. `phase4.1-v1` は被覆を 24% → 96.67% へ改善しており、**この成果は失ってはならない**
2. しかし上位10枚での被覆は 60% にとどまる。**4枚がワンコード重複に使われている分がそのまま失われている**
3. `phase4-v1`（Rollback先）は重複こそ0だが上位3枚がすべて2小節断片で、`progressionCandidateAvailability` が435もあるのに4小節以上の進行を1枚も上位に出していない
4. **どちらのモードも top3ProgressionCount = 0**。これが本質的な不具合であり、Pattern重複はその一部でしかない

---

## 4. SURAN remix でも同じ構造

| 指標 | SURAN / phase4.1-v1 |
|---|---:|
| visiblePatternDuplicateCount | **1** |
| visibleUniquePatternCount | 9 |
| top3SingleChordCount | 0 |
| top3ProgressionCount | **1** |
| top10ProgressionCount | 8 |
| allCandidateCoverage | 96.94% |
| progressionCandidateCoverage | 96.94% |

上位2枚が同一Pattern（E7sus4 Bm11、30–31小節と71–72小節）の2小節断片。Endless ほど極端ではないが**同じ欠陥が同じStageで起きている**。Endless 固有の問題ではない。

---

## 5. 確定した原因

1. **Pattern重複**: 選定が Occurrence 単位で表示枠を消費する。Pattern は表示直前に計算されるが枠割り当てに関与しない（Stage 3、Stage 5で顕在化）
2. **ワンコード優位**: `scoreBlockQuality` のヴァンプ向けscoreが主候補の順位にそのまま使われ、限界被覆差を打ち消している（Stage 3）
3. **2小節断片優位**: 窓長が効用に入っておらず、4小節以上の進行が構造的に不利（Stage 3）

いずれも**コード検出Timelineの問題ではない**。同じ Timeline から作られる候補リストの組み立て方の問題である。この段階では製品ロジックを一切変更していない。

---

## 6. 凍結した成果物

```text
docs/phase4.1.1/00-reproduction.md              本書
docs/phase4.1.1/00-endless-phase4.1-v1.json     不具合の凍結記録
docs/phase4.1.1/00-endless-phase4-v1.json       Rollback先の凍結記録
docs/phase4.1.1/00-suran-phase4.1-v1.json       非退行確認用
```

再実行:

```bash
npx vite-node scripts/diagnose-candidate-usefulness.ts -- --midi <path> --mode phase4.1-v1 --output 00-endless-phase4.1-v1.json
```
