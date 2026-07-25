# Loop Vault Phase 4.0 — P4.0-04 Block Generation / Selection v2

- 作成日: 2026-07-25
- Branch: `feature/p40-04-block-selection-v2`（base: `master`）
- **Analyzerの主コードは変更していない**

## 1. 結論

候補ブロックの並び順を決めていたのは、和音の証拠ではなくボーナス2つだった。それを音楽的証拠に置き換え、密度クラスを選定の多様性軸に加えた。

コード数が少ないことによる減点を廃止した結果、低密度ブロックが確実に残るようになった。

| density class | recall（クラスが存在するケースのうち最終候補に残った割合） |
|---|---:|
| vamp | **100.0%**（14/14） |
| compact | 98.9%（93/94） |
| standard | 100.0%（70/70） |
| dense | 96.0%（48/50） |

## 2. 現行scoreの分解（計画書§10.5）

重みを触る前に、既存scoreの各項が実際に何をしていたかを測った。

```text
selectionScore = averageRankingScore + repeatBonus + diversityBonus
```

| 項目 | 実測 |
|---|---|
| `confidence` が 1.0 に飽和 | **3233 / 3484 events = 92.80%**（p10 = median = p90 = 1、異なる値は71種） |
| 復元した raw match score | min 0.600 / median 1.219 / p90 1.289 / max 1.300、**567の異なる値** |
| ファイル内の raw spread | median 0.197 |

P4.0-00の観察が全コーパスで裏付けられた。**ranking項は候補間で差を作っておらず、`repeatBonus` と `diversityBonus` だけが順位を決めていた。** そして `diversityBonus` は「異なるコードが多いほど加点」であり、vampとcompactを構造的に不利にしていた。

`rankingScore` の変換 `1 + raw × 1e-6` は可逆なので、raw scoreを復元して非永続の診断メタデータとして扱う（§10.6）。確率とは呼ばない。

## 3. Block quality v2

`src/domain/midi/blockQuality.ts`。

```text
total =
    0.55 × evidence      duration-weighted、正規化済みraw match score
  + 0.15 × boundary      イベントが拍子グリッドに乗っているか
  + 0.20 × repeat        構造signatureの再出現（飽和あり）
  + 0.10 × loopFitness   区間末から区間頭への接続
```

**コード数はスコアに一切入らない。** 密度は選定時の多様性クラスとして扱う（§10.5）。

### 3.1 evidence の正規化

ファイル内 min-max 正規化を使う。コーパス由来の定数を持ち込まず、選定は常に1つの解析内での比較なので十分である。全コードが同程度に支持されているファイルでは一律0.5になるが、それは「そのファイルには識別材料がない」という正直な答えである。

### 3.2 repeat の飽和

`min(1, (repeatCount - 1) / 2)`。2回出ることが信号であり、10回出ても情報は増えない。

### 3.3 loop fitness

グローバルKeyの推定に依存させない。最後のコードから最初のコードへの音程と共通音だけを見る（§10.4）。V→I を最も高く、それ以外は減点ではなく中立に寄せる。

## 4. 2小節窓の追加

生成長を `4 / 8 / 16` から **`2 / 4 / 8 / 16`** にした（§10.2）。短いループやvampが、4小節ブロックの一部としてしか見つからない状態を解消する。

### 4.1 長さ占有の上限

2小節ブロックは「収まる位置が多い」という理由だけで repeat 回数が増えるため、そのままでは選定を占有する。

| | 上限なし | 上限あり |
|---|---:|---:|
| 2小節 | 310 (58%) | **290** |
| 4小節 | 122 | **142** |
| 8小節 | 66 | 66 |
| 16小節 | 33 | 33 |

1つの長さが最終リストの `ceil(limit / 2)` を超えないようにした。埋まらない場合は上限なしの2周目で補充するので、短い長さしか存在しない曲でもリストは埋まる。

残る2小節の多さは構造的なものである。コーパスには4小節ファイルが34件あり、そこでは2小節と4小節しか作れない。

## 5. 密度クラスによる選定多様性

`vamp / compact / standard / dense` の各クラスについて、品質floor（0.35）を満たす候補があれば最低1件を選ぶ（§10.7）。

- **品質floorを先に満たす。** クラス枠を埋めるためだけに低品質候補を採用しない
- floor未満しかない場合は `rejected-by-quality-floor` として診断に記録する
- region / length / IoU の多様性は維持
- 最終上限6〜12件も維持

**1コードだから減点する処理は存在しない**（§10.8）。vampは独立クラスとして扱う。

## 6. 選定診断（§10.9）

`selectProgressionCandidates()` が任意で診断配列を受け取る。

```text
selected-by-region / selected-by-length / selected-by-density
selected-by-overall / selected-by-backfill
rejected-by-quality-floor / rejected-by-iou / rejected-by-limit / deduplicated
```

通常UIには出さない。

## 7. Reranker経路のブロックモデルを統一

作業中に、`blocks.ts` の `extractHybridBlocks()` が**独立した候補生成経路**を持っていることが判明した。hybrid / legacy-boundary-rerank / voice-aware-rerank がこれを使っており、独自の拍グリッドラベル署名と独自のdedupキーを持っていた。

つまり P4.0-03 のイベントモデルも本Stageの2小節窓も、legacy経路にしか効いていなかった。

**P4.0-06 でAnalyzerを比較する以上、ブロック定義が違えば比較は成立しない。** そこで `extractHybridBlocks()` を Candidate Block v2 の共有機構へ寄せた。

副次的に高速化した（後述）。

## 8. Runtime

一度、大きく悪化させてから直した。

| Analyzer | P4.0-00 baseline | 最適化前 | 最適化後 |
|---|---:|---:|---:|
| Legacy | 49.4 ms | 390.2 ms | **69.5 ms** |
| Legacy-boundary rerank | 175.1 ms | 820.6 ms | **103.9 ms** |
| Voice-aware rerank | 169.8 ms | 804.7 ms | **103.3 ms** |
| Hybrid | 1429.8 ms | 2215.3 ms | **1458.4 ms** |

原因は `countStructuredRepeats()` がブロックごとに全位置のイベントを再構築していたこと。長さごとに窓を一度だけ構築して署名を集計し、repeat数を参照に変えた。

Legacyは2小節窓が増えた分だけbaselineより遅い（1.4倍）。rerankerは共有モデルの方が旧来の拍グリッド署名より軽く、**baselineより速くなった**。

Gateのruntime上限（100件あたり3000 ms）に対し、100件コーパスでのlegacyは約900 msで収まっている。

## 9. 検出精度は変わっていない

| Metric | P4.0-03 | P4.0-04 | 差 |
|---|---:|---:|---:|
| Root | 57.76% | 57.76% | 0.00 |
| Quality | 60.29% | 60.29% | 0.00 |
| Surface Exact | 13.69% | 13.69% | 0.00 |
| Corrections | 918 | 918 | 0 |

canonical指標（duration-weighted / full）も legacy root 57.11% / canonicalExact 25.92% で不変。

評価は `fullTimeline` を見るため、ブロック生成・選定の変更は精度指標に影響しない。**候補の内容と順序は変わる。** これが本Stageの目的である。

## 10. テスト

`src/domain/midi/blockSelection.test.ts`（21件）。§10.10のフィクスチャを含む。

- 8小節 × 1 / 2 / 3 / 4 / 5 / 8コード、16小節5コード、同一コード反復
- 1〜5コードだけを理由に raw 候補から消えないこと
- 2小節ループが自身の長さで候補になること
- 1小節2コードが `dense` として並記されること
- vampが最終候補に残ること
- standard / dense を壊さないこと
- 候補上限と決定性
- 長さが1種類に偏らないこと
- scoreがコード数で加点しないこと、repeatが飽和すること、loop fitnessがV→Iを高く評価すること
- 識別材料のないファイルで evidence が中立0.5になること

既存テストのうち3件は、2小節窓の追加という**意図した仕様変更**に合わせて期待値を更新した。

| テスト | 変更 |
|---|---|
| `longMidiCandidates.test.ts` | 長さ集合を `{4,8,16}` → `{2,4,8,16}` |
| `blocks.test.ts` 6/8 meter | 先頭要素ではなく長さ4のブロックを検索して検証 |
| `rankingScore.test.ts` | selectionScoreがraw値と一致する前提を、順序が保たれる検証へ変更 |

全体: **153ファイル / 1115テスト中1114 PASS**。失敗1件はP4.0-00で報告済みのmaster由来の既存失敗。

| 検証 | 結果 |
|---|---|
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS |
| `npm run eval:midi:datasets` | baseline完全一致 |
| `npm run benchmark:midi` | 上記のとおり |

## 11. 成果物

```text
docs/phase4.0/04-block-selection-v2.md         本書
docs/phase4.0/04-block-score-diagnostic.json   score分解の実測
docs/phase4.0/04-density-recall-report.json    density recall
src/domain/midi/blockQuality.ts                v2スコア
src/domain/midi/blockSelection.test.ts         21件
scripts/diagnose-block-score.ts
scripts/evaluate-density-recall.ts
```

## 12. 未実施・申し送り

1. **repeat cycle generator と event-boundary / loop-return generator は未実装**（§10.2）。本Stageでは固定窓に2小節を加え、既存の窓に対して repeat 検出を構造signatureへ置き換えるに留めた。`relativeSignature()` はP4.0-03で用意済みで、移調を含む周期検出に使える。
2. Gateの `blockRecallAtIoU50` は本Stageの構造の上で測る必要がある。density class recall は測ったが、正解ブロックに対するIoUベースのrecallは未計測。
3. 品質floor 0.35 と score重み（0.55 / 0.15 / 0.20 / 0.10）は tune corpus での探索を経ていない。現状は設計値である。holdoutでの単調性確認も未実施。
4. `boundary` 項は legacy が2拍固定窓を使う都合でほぼ一定に近い可能性がある。寄与度の実測は未実施。
