# Loop Vault Phase 4.0 — P4.0-00 監査・Baseline固定

- 作成日: 2026-07-25
- Branch: `docs/p40-00-audit-baseline`
- HEAD: `e99349e`（master `22cd15e` + `docs/current-midi-detection-spec.md`）
- 本Stageで製品コードは変更していない

## 1. 結論

計画書が前提とした数値はすべて再現した。そのうえで、計画書の仮説のうち2件は**測定により修正が必要**と判明した。

1. `endless endless chord.mid` の `C7` 消失と2小節持続の `N.C.` 崩れは、**検出（Full Timeline）の問題ではなく Candidate の小節代表化の問題**である。Full Timelineは両方とも正しく保持している。
2. 低密度候補が最終候補に残らない主因は **`uniqueChordCount` ボーナスではない**。支配的要因は「rankingScoreの飽和」と「6件ハードキャップ」である。

## 2. Corpus監査

| 項目 | 結果 |
|---|---|
| 正式corpus | `docs/loop-vault-evaluation-corpus/`（**gitignored / local-only**） |
| `recipeSha256` | `7991f80e...f3a6` |
| ケース数 | 100 |
| 期待イベント数 | 1058（3712拍） |
| sha256 + byteLength照合 | **100/100 一致**、不一致0、欠損0 |
| caseId重複 / MIDIハッシュ重複 | 0 / 0 |

`test/Loop Vault Evaluation Corpus 100 ＋ex/` はユーザー提供フォルダ。101件が正式corpusと**バイト単位一致**し、差分は `endless endless chord.mid` 1件のみ。重複分はGitへ追加しない。

`endless endless chord.mid` は `.local-evaluation/phase4.0/fixtures/endless-endless-chord.mid` へ配置した。正式corpus自体が既にgitignoredであるため、個人MIDIも同じ扱いとし**Gitへコミットしない**（計画書§18準拠）。

## 3. Baseline再現

計画書§6.3の期待値と照合した。

| Metric | Legacy | 計画書期待 | Reranker | 計画書期待 |
|---|---:|---:|---:|---:|
| Root | 57.7586% | 57.76% | 57.9741% | 57.97% |
| Quality | 60.8297% | 60.83% | 61.4763% | 61.48% |
| Surface Exact | 13.6853% | 13.69% | 13.7931% | 13.79% |

**すべて一致。回帰なし。** 詳細は `00-baseline-lock.json`。

### 3.1 Rerankerに関する未報告の退行

@1指標の陰で、Top-3が大きく退行している。

| Metric | Legacy | Reranker | 差 |
|---|---:|---:|---:|
| rootTop3 | 70.8513% | 62.6078% | **-8.24pp** |
| qualityTop3 | 85.1293% | 77.1013% | **-8.03pp** |
| surfaceExactTop3 | 20.0970% | 21.1207% | +1.02pp |

計画書§2.3が掲げる「機械が正解をTop-3へ含める → ユーザーが数秒で選ぶ」という目的に対し、現行rerankerは **root/qualityのTop-3到達率を8pp犠牲にして @1 を0.1〜0.65pp改善している**。P4.0-06の判断ではTop-3指標を必ず含める必要がある。

### 3.2 Runtime

| Analyzer | 時間 | 対Legacy比 |
|---|---:|---:|
| Legacy | 49.4 ms | 1.00x |
| Legacy-boundary rerank | 175.1 ms | 3.54x |
| Voice-aware rerank | 169.8 ms | 3.44x |
| Hybrid | 1429.8 ms | 28.92x |

180秒・2306バイトのsynthetic MIDIでの計測。

## 4. Label Reachability（新規診断）

`npm run eval:midi:label-reachability` を追加した（`scripts/evaluate-label-reachability.ts` → `00-label-reachability.json`）。

期待ラベルを `parseChordLabel` → `labelFromSymbol` で往復させた結果:

| 指標 | 値 |
|---|---:|
| expectedParseCoverage | **49.53%** |
| surfaceReachability（イベント） | 31.10% |
| surfaceReachability（拍） | **32.22%** ← Surface Exactの理論上限 |
| unsupportedイベント | 729 / 1058 |
| 相異なるunsupportedラベル | 425 |

現行実測 13.69% は、到達可能な 32.22% に対して **42.48%**。ただし計画書§1.3のとおり、この比率も表記依存であり正式KPIにはしない。

### 4.1 到達不可の内訳（拍シェア）

| 原因 | 拍シェア | 例 |
|---|---:|---|
| 括弧付きtensionをparserが拒否 | 46.01% | `Bbm7(9)`, `Abmaj7(9)`, `Dbm7(11)` |
| quality表記の不一致 | 12.28% | `A13sus` → `Asus413` |
| 異名同音の固定綴り | 5.77% | `Gbadd9` → `F#add9`, `Db6` → `C#6` |
| その他parse不能 | 3.72% | `F6/9`, `Bb6/9/F`, `Bbbmaj7/Db` |

### 4.2 独立した裏付け

`operationCorrectionCost.byCategory.unrepresentable` が Legacy / Reranker とも **534 / 1058 セグメント（50.5%）** で同一。既存の修正コストモデルが、別経路で同じ到達不能性を計測していた。

### 4.3 Representability分類（計画書§8.4）

到達不可要因は2種に分かれ、対処Stageが異なる。

**(a) parser / formatterの欠陥** — P4.0-01で製品コードのみで修正可能

- `sixNine` は **reachability 0.0% / 130拍**。`labelFromSymbol` は `C6/9` を生成できるが、slash bass正規表現が `/9` をベース音と誤認し `parseChordLabel` が `null` を返す。自アプリ生成ラベルがChord Inspectorで無効扱いになる（[ChordInspector.tsx:142](../../src/components/progression-editing/ChordInspector.tsx:142)）。
- tension連結（[chords.ts:76](../../src/domain/chords.ts:76) の `tensions.join("")`）が品質直後に括弧なしで付き、`A13sus` → `Asus413` という不正表記を生む。

**(b) 検出器の語彙欠落** — ラベル修正では解消しない

corpusの3品質が `ChordQuality` union（[types.ts:21](../../src/domain/types.ts:21)）に存在しない。

| quality | 拍 | reachability |
|---|---:|---:|
| `dom13sus` | 398 | 0.0% |
| `maj13` | 68 | 0.0% |
| `blackadder` | 32 | 68.8% |
| 計 | **498（13.42%）** | |

### 4.4 quality指標の反転バグ

[evaluate.ts:161](../../src/domain/midi/evaluation/evaluate.ts:161) の `qualityFamily()` は `dom13sus` を判定できない。

```text
"dom13sus".startsWith("min") → false
"dom13sus" === "dim" / "dim7" → false
"dom13sus".startsWith("sus") → false   ← "dom" で始まるため
"dom13sus" === "dom7sus4"    → false
"dom13sus" === "aug"         → false
→ フォールバックして "major"
```

一方、検出器が `dom7sus4` を出すと `"sus"` になる。したがって **13sus和音を正しくsusと検出すると不一致、ただのドミナントと誤検出すると一致**という反転が起きる。影響範囲は398拍＝corpusの10.72%。

`adaptChordDripManifest` は `quality: ChordQuality` として型付けしているが、実JSONはunion外の値を含む。型アサーションが実データと乖離している。

## 5. Candidate脱落診断（計画書§6.5）

`scripts/diagnose-candidate-selection.ts` を追加（→ `00-candidate-selection-diagnostic.json`）。

### 5.1 小節代表化による情報欠落

`endless-endless-chord.mid`（8小節）:

```text
bar  4: rep=F#m11    sounding=[F#m11@1+2 C7@3+2]   LOST=[C7]
bar  7: rep=Gmaj9/A  sounding=[Gmaj9/A@1+8]
bar  8: rep=N.C.     sounding=[Gmaj9/A@1+8]        LOST=[Gmaj9/A]
```

**Full Timelineは `C7` も2小節持続も正しく保持している。** 欠落は [legacy.ts:445](../../src/domain/midi/legacy.ts:445) `chordLabelsByBar()` で発生する。

- 1小節2コード → 最長durationの1件だけが代表になり他は消える
- `items = timeline.filter(item => item.bar === bar)` が**開始小節のみ**を照合するため、bar 7開始で8拍持続する `Gmaj9/A` は bar 8 に一致せず `N.C.` になる

クリーンなcorpusでも同じ欠落が起きる（`cute-future-pop-d-major-9003` bar 16: `LOST=[B]`）。

### 5.2 低密度候補の脱落要因

計画書§1.6の仮説「低コード数候補が出ない主因 = uniqueChordCount bonusだけ」は**否定された**。

16小節ケース（raw 23件 → 選出6件）の実測:

| 候補 | uniq | rank | +repeat | +diversity | score | 結果 |
|---|---:|---:|---:|---:|---:|---|
| bars-3-6 | 3 | 1 | 0.08 | 0.09 | 1.17 | dropped |
| bars-5-8 | 4 | 1 | 0.08 | 0.12 | 1.20 | dropped |
| bars-13-16 | 4 | 1 | 0.08 | 0.12 | 1.20 | SELECTED |
| bars-3-10 | 5 | 1 | 0.08 | 0.15 | 1.23 | SELECTED |
| bars-4-11 | 4 | 1 | 0.08 | 0.12 | 1.20 | dropped |

測定された事実:

1. **全候補で `rank=1`。** `rankingScore` が飽和し、検出品質が選定順位に一切寄与していない。差をつけているのはボーナス（0.17〜0.23）だけである。
2. **支配的な脱落要因は6件ハードキャップ**（≤32小節 → 6件）。23件中17件が落ちる。
3. `diversityBonus` の影響は実在するが小さい（unique 1件あたり0.03、5件で上限）。uniq=4の候補も多数落ち、uniq=5が選ばれるケースもある。

したがってP4.0-04では、diversityBonus除去だけでは不十分であり、**rankingScoreの飽和解消（無校正rawスコアの平均をやめる）を先に扱う必要がある**。

### 5.3 その他確認事項

- 生成長は4/8/16のみ。**2小節窓が存在しない**（計画書§10.2の追加が必要）。
- `dedupeKey` に `summaryText`（表示文字列）を使用（[legacy.ts:313](../../src/domain/midi/legacy.ts:313)）。設計原則14に反する既存実装。
- 8小節ファイルではdedup衝突0件。より長い実データでの再測が必要。

## 6. `endless endless chord.mid` 詳細

8小節 / 125 BPM / 4-4 / 34ノート / 推定キー `A major`。

| 小節 | 期待 | Legacy主候補 | 第1代替 | 判定 |
|---:|---|---|---|---|
| 1 | Dmaj7 | Dmaj7 | Dmaj9 | OK |
| 2 | Dm7 | Dm7 | Dm9 | OK |
| 3 | C#m7 | C#m7 | C#m9 | OK |
| 4前半 | E/F# | **F#m11** | Eadd9/F# | NG（代替は妥当） |
| 4後半 | C7 | C7 | C9 | OK |
| 5 | Bm7 | Bm7 | Bm9 | OK |
| 6 | D/E | **Em11** | Dadd9/E | NG（代替は妥当） |
| 7-8 | Gmaj9/A | Gmaj9/A（+8拍） | Em11/A | OK |

### 6.1 3rd欠落の実証

6小節目の実音は `E2(40) F#3(54) A3(57) D4(62)`、pitch class `[D E F# A]`。

- 主候補 `Em11` が要求する **G（短3度）も B（5度）も存在しない**
- 期待 `D/E` の上部構造 `D F# A` は**3音すべて実在**
- 第1代替 `Dadd9/E` は実音集合と完全一致

4小節目前半も同様に、`F#m11` の要求する A（短3度）・C#（5度）を欠き、`E/F#` の構成音 `E G# B` は実在する。

**重要**: Upper Structure Slash候補は「生成されていない」のではなく、`Eadd9/F#` / `Dadd9/E` として**既に第1代替に存在する**。したがってP4.0-05では候補生成より先に、3rd欠落時のquality減点（05B）だけで主候補が入れ替わる可能性がある。05Aの必要範囲は再評価すべきである。

## 7. Corpus split（計画書§6.7）

`scripts/build-corpus-split.ts` → `00-corpus-split.json`。

| subset | ケース数 | major/minor | 4/8/16小節 | slash含有 |
|---|---:|---|---|---:|
| tune | 70 | 30 / 40 | 27 / 26 / 17 | 62 |
| holdout | 30 | 19 / 11 | 7 / 7 / 16 | 25 |

- preset × mode の20層で層化、層内は `midiSha256` 順
- 累積配分により全体を正確に70/30へ
- 乱数不使用。再実行で同一結果、tune/holdout重複0
- **weight探索はtuneのみ。holdoutはStage完了時とpromotion判断時のみ**

## 8. 決定性

- `diagnose:midi-failures` の再生成結果は既存コミット内容とバイト一致（決定性確認）
- `build-corpus-split.ts` は再実行で同一出力

## 9. 判明した副作用

`npm run diagnose:midi-failures` は追跡対象の `docs/phase3.6.1-failure-analysis.md` を上書きする。今回は内容が同一だったため復元した。CI等で実行する場合は作業ツリーを汚す点に注意。

## 10. 停止条件の確認（計画書§6.9）

| 条件 | 結果 |
|---|---|
| baselineが再現しない | 該当なし（全一致） |
| corpusに重複・破損がある | 該当なし |
| expected labelの意味が不明 | 一部該当 → `blackadder` の定義は要確認 |
| holdout splitが偏る | 該当なし |
| 評価scriptがsilent skipしている | **該当あり** → §4.4のqualityFamilyフォールバック |

## 11. 次Stageへの申し送り

1. **P4.0-01**: `C6/9` parse、括弧付きtension、`A13sus` formatter、異名同音。§4.3(a)が対象。§4.3(b)の語彙欠落は別扱いとし、P4.0-02のrepresentability分類で明示する。
2. **P4.0-02**: `qualityFamily()` の `dom13sus` フォールバック（§4.4）を必ず修正する。修正前後でquality指標が動くため、Analyzer変更と同一commitにしない。
3. **P4.0-03**: `chordLabelsByBar()` の開始小節照合（§5.1）が `N.C.` の直接原因。
4. **P4.0-04**: diversityBonusより先に `rankingScore` 飽和（§5.2）を扱う。2小節窓の追加も必要。
5. **P4.0-05**: 05A（US Slash生成）の必要範囲を再評価（§6.1）。05B先行で解決する可能性がある。
6. **P4.0-06**: Top-3退行（§3.1）をGate条件に必ず含める。

## 12. 成果物

```text
docs/phase4.0/phase4.0-midi-detection-engine-v2-plan.md   仕様の正
docs/phase4.0/00-audit.md                                 本書
docs/phase4.0/00-baseline-lock.json                       baseline固定値
docs/phase4.0/00-corpus-split.json                        tune/holdout
docs/phase4.0/00-label-reachability.json                  到達可能性
docs/phase4.0/00-candidate-selection-diagnostic.json      候補脱落診断
scripts/evaluate-label-reachability.ts                    npm run eval:midi:label-reachability
scripts/build-corpus-split.ts
scripts/diagnose-candidate-selection.ts
.local-evaluation/phase4.0/fixtures/                      Git管理外
```
