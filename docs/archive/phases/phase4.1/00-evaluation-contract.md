# Loop Vault Phase 4.1 — P4.1-00 評価契約とbaseline固定

- 作成日: 2026-07-25
- **製品の候補選定は変更していない**

## 1. 結論

「サビが候補に出ない」は、**候補生成の問題でもdedupの問題でもなく、ランキング選定の問題**である。

| Stage | 注目範囲33–46の被覆 |
|---|---:|
| 候補生成後（oracle） | **14 / 14小節** |
| dedup後 | **14 / 14小節** |
| 選定後 | **0 / 14小節** |

窓は生成されており、dedupでも失われていない。**選定が全て捨てている。**

## 2. 分母の定義（固定）

以降のStageはすべてこの定義で測る。

| 対象 | 扱い |
|---|---|
| 和声証拠音が鳴っている小節 | **分母に含める** |
| 無音小節 | 分子・分母とも除外 |
| ドラムのみの小節 | 除外（被覆すべき和声がない） |
| 証拠閾値未満 | 除外（解析器と同じ `selectChordEvidenceNotes` で判定） |
| pickup・不完全小節 | 証拠音があれば通常小節として扱う |
| 拍子変更 | 解析器は最初の拍子を使う。本コーパスは全編4/4 |

SURAN remix: 全100小節中 **98小節が和声アクティブ**（1–2小節目のみ無音）。

## 3. 測定結果

| 指標 | 値 |
|---|---:|
| oracleCandidateCoverage | **100.00%** |
| dedupedCoverage | **100.00%** |
| selectedCoverageAt10 | **28.57%** |
| selectedCoverageAtAllVisible | **28.57%** |
| longestUncoveredHarmonicRun | **16小節** |
| sectionRecallAt10 | 55.00% |
| sectionRecallAtAllVisible | 55.00% |
| coverageRedundancy | 1.6429 |
| minimumSelectedCandidateScore | 0.670448 |
| groupedVisibleCoverage | 30.61% |

### 3.1 損失の分解

| Stage | 損失 |
|---|---|
| candidateGenerationLoss | **0小節** |
| dedupLoss | 1窓（**0小節**） |
| **selectionLoss** | **70小節** |

98小節中70小節が選定で失われている。

### 3.2 選定が16小節に集中している

選ばれた10件の位置。

```text
17-18  17-32  19-22  21-22  21-28  30-31   ← 6件が17-32小節に集中
10-13  49-50  66-67  83-86
33-48  ← 1件もない
```

**10件中6件が16小節幅の同じ領域に重なっている。** その一方で33–48小節には1件もない。`coverageRedundancy 1.64` は全体平均なので、この局所的な重複を過小に見せている。

原因は候補上限（100小節 → 10件）ではなく、**選定が被覆を目的関数に持っていない**ことである。region quotaは25小節固定で、100小節の曲では4領域にしか分割されない。

## 4. セクション定義

**このコーパスに人手のセクション注釈は存在しない。** 提供された注釈ファイルにもセクション欄はない。

そこで4小節窓のchroma新規性から導出した。bar activityは3–100小節が一様に高密度で、休符による区切りが存在しないため、活動量では分割できない。和声内容の変化だけが使える信号だった。

```text
window: 4小節
novelty threshold: 0.45（chroma L1距離 / 2）
結果: 20セクション
```

33–46小節が `Dm9 / G13 / Bb13 / F6` とフラット側へ移り、他区間（D major / B minor 中心）と明確に異なることは、この方法で境界として検出できている。

**これは仮の定義である。** P4.1-03で本格的なsegmentationに置き換える。ここでは `sectionRecall` に固定・再現可能な分母を与えるためだけに存在する。定義はGateと一緒に凍結する。

## 5. Gate（凍結）

指示書の自動設定ルールを適用した。

```text
oracleCandidateCoverage = 100% >= 95%
  → selectedCoverageAtAllVisible >= 90%
```

**緩和分岐は適用しない。** 候補生成もdedupも上限を作っていないため、90%目標をそのまま課すのが正しい。

| Gate | 基準 | baseline |
|---|---:|---:|
| selectedCoverageAtAllVisible | **>= 90%** | 28.57% |
| sectionRecallAtAllVisible | **= 100%** | 55.00% |
| longestUncoveredHarmonicRun | **< 8小節** | 16小節 |
| 注目範囲33–46の被覆 | **>= 1小節** | 0小節 |

ガードレール:

| 項目 | 条件 |
|---|---|
| minimumSelectedCandidateScore | baseline比 -0.15 以内（被覆を弱い候補で買わない） |
| runtime | 3000 ms以内 |
| 決定性 | 再実行で同一 |
| Chord Drip / Chapter 3 Seed | Phase 4.0の指標を回帰させない |

`docs/phase4.1/00-coverage-gates.json` に凍結。**以後変更しない。**

## 6. プライバシー

- MIDI本体は `.local-evaluation/phase4.1/fixtures/` に置き、**Gitへ追加しない**
- レポートには内容fingerprintとbyte長のみ記録し、**絶対パスもファイル名も含めない**
- P4.0-CLOSEで追加した staged file guard が `.mid` の混入を拒否する

## 7. 成果物

```text
docs/phase4.1/00-evaluation-contract.md   本書
docs/phase4.1/00-suran-baseline.json      凍結baseline
docs/phase4.1/00-coverage-gates.json      凍結Gate
scripts/diagnose-coverage-pipeline.ts     被覆分解の診断
```

## 8. 次Stageへの申し送り

1. **P4.1-02が本丸。** 生成もdedupも健全なので、直すのは選定だけである
2. 固定25小節region quotaは100小節の曲で4領域にしかならず、被覆の役に立っていない
3. `occurrenceRecall` と `groupedVisibleCoverage` はP4.1-01のOccurrenceモデル導入後に正式化する。本Stageでは構造signatureベースの暫定値
4. セクション定義はP4.1-03で置き換えるが、**Gateの分母としては本Stageの定義を凍結して使う**
