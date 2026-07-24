# Loop Vault Phase 4.0 — P4.0-02 評価指標v2

- 作成日: 2026-07-25
- Branch: `test/p40-02-evaluation-contract-v2`（base: `fix/p40-01-chord-label-contract`）
- **Analyzerは変更していない**

## 1. 結論

Analyzerの優劣を、表記ではなく音楽的構造で測れるようにした。

`surfaceExact` は表記互換性を含む過去指標として残し、主要KPIから外した。判断は `NormalizedChordIdentity` に基づく canonical 指標で行う。

同じ100 MIDI・同じAnalyzerに対して、指標を変えるだけで像が大きく変わる。

| | Surface (v1) | Canonical (v2) |
|---|---:|---:|
| Exact | 13.69% | **25.92%** |

**「不一致」の約半分は検出の誤りではなく表記の違いだった。**

## 2. 指標の分類

計画書§8.2に沿って分類した。

### Historical（過去比較用・主要KPIにしない）

`surfaceExact` — Phase 3.6系の報告と接続するためだけに残す。

### Label-system

`expectedParseCoverage` / `identityRoundTripCoverage` / `surfaceReachability` / `unsupportedExpectedCount`（P4.0-01で計測済み）。

### Chord hierarchy（本命）

`rootAccuracy` / `triadAccuracy` / `qualityAccuracy` / `seventhAccuracy` / `extensionAccuracy` / `bassSlashAccuracy` / `canonicalExactAccuracy` / `pitchSetEquivalentAccuracy`

`qualityAccuracy` は triad + seventh の一致とした。v1の4分類（major/minor/dim/sus/aug）より厳しい。

### Alternatives

`top3CanonicalAccuracy` / `top5CanonicalAccuracy` / `top3RootAccuracy` / `top3QualityAccuracy`

### Segmentation / Block / Warning

v1の `boundaryPrecision` 等を継続使用。Block指標はP4.0-03で定義する。

## 3. Canonical Exact

比較対象は `NormalizedChordIdentity`（P4.0-01で追加）。

- 異名同音は一致（`Gbadd9` = `F#add9`）
- 表記違いは一致（`Bbm7(9)` = `Bbm9`）
- slash bass差は不一致（`C6` ≠ `C6/E`）
- `N.C.` はイベント欠損と区別する

綴りの正しさは別途 `keySpellingAccuracy` として評価する方針とし、canonical指標には混ぜない。

## 4. Representability（計画書§8.4）

期待ラベルが検出器の語彙で表現可能かを分類する。**主要指標から黙って除外しない。** 分母は常に全期待イベントであり、到達不能件数を併記する。

分類の定義は厳密である。検出器は21品質を**テンション空**でしか出力しないため、

> ある identity が representable ⟺ 12 root × 21 quality（+ slash bass）のいずれかが同じ identity を生む

とした。

| 分類 | 拍 | シェア |
|---|---:|---:|
| representable | 2576 | 69.40% |
| detector-vocabulary-unsupported | 1136 | **30.60%** |
| parser-unsupported | 0 | 0.00% |

parser-unsupported が0なのはP4.0-01の成果である。

### 4.1 canonicalExactの実質的な上限

**コーパスの30.60%は、検出がどれだけ正確でも canonical identity として一致し得ない。**

したがって `canonicalExact` の上限は 69.40%、実測25.92%はその **37.35%** にあたる。

P4.0-00で測った「detector-vocabulary-unsupported 498拍」より大きいのは、あの数値が quality 名だけを見ていたためである。今回は identity 全体（テンション・変化音を含む）で判定しており、`C7(b9)` や `Emaj7(#11)` のような変化音付きも到達不能として正しく計上される。

## 5. Event-weighted と Duration-weighted

両方を出力する。短い誤分割で数値が過度に動くのを防ぐため。

legacy の例:

| 重み | canonicalExact | top3Canonical |
|---|---:|---:|
| duration | 25.92% | 37.45% |
| event | 26.09% | 37.62% |

差は小さく、現行コーパスでは重み方式の選択が結論を変えない。

## 6. 正規化baseline

Analyzerを変えずに3モードを再評価した（duration-weighted / full）。

| Metric | legacy | legacy-boundary-rerank | voice-aware-rerank |
|---|---:|---:|---:|
| root | 57.11% | 57.33% | 57.54% |
| triad | 59.75% | 60.51% | 60.51% |
| quality | 44.23% | 44.99% | 44.88% |
| seventh | 55.12% | 55.98% | 55.77% |
| extension | 38.20% | 38.31% | 38.42% |
| bassSlash | 65.25% | 65.46% | 65.46% |
| **canonicalExact** | **25.92%** | **26.13%** | **26.13%** |
| pitchSetEquivalent | 28.56% | 28.77% | 28.77% |
| top3Canonical | 37.45% | 38.09% | 38.36% |
| top5Canonical | 41.11% | 43.00% | 43.21% |
| **top3Root** | **70.47%** | **61.96%** | **62.18%** |
| **top3Quality** | **65.19%** | **58.51%** | **58.35%** |
| holdout canonicalExact | 24.71% | 25.00% | 25.29% |
| runtime (100件) | 585.6 ms | 1032.9 ms | 1006.9 ms |

`unmatchedRate` は3モードとも0.00%。全期待区間が予測区間と重なっており、指標の欠測はない。

### 6.1 Rerankerのトレードオフが確定した

P4.0-00でv1指標から見えていた Top-3 退行は、v2でも同じ向きで再現した。

| | legacy | LBR | 差 |
|---|---:|---:|---:|
| top3Root | 70.47% | 61.96% | **-8.51pp** |
| top3Quality | 65.19% | 58.51% | **-6.68pp** |
| top3Canonical | 37.45% | 38.09% | +0.64pp |
| canonicalExact | 25.92% | 26.13% | +0.21pp |

Rerankerは **full identity の精度を +0.2〜0.6pp 上げる代わりに、候補リストで正しいルートに辿り着く率を 8.5pp 失っている。**

計画書§2.3が掲げる目的は「機械が正解をTop-3へ含める → ユーザーが数秒で選ぶ → 修正量が減る」である。ルートの修正はユーザーが最も省略できない操作であり、この交換は製品目的に対して割に合わない可能性が高い。

## 7. Surface Exactとの関係

```text
Surface Exact:
  表記互換性を含む過去指標。上限は45.58%（P4.0-01時点）。

Canonical Exact:
  音楽的identityの完全一致。上限は69.40%。

両者を直接「+Xポイント改善」と比較しない。
```

13.69% と 25.92% は**異なる分母・異なる定義の指標**であり、差分をとることに意味はない。

## 8. tune / holdout

P4.0-00で固定した分割（tune 70 / holdout 30）を適用する。`adaptChordDripManifest` が持つ独自splitはP4.0の分割で上書きする。

- weight・閾値探索は **tuneのみ**
- holdoutはStage完了時とpromotion判断時のみ
- レポートに subset を明示する

## 9. Paired comparison

同じcase単位で legacy と比較し、improved / regressed / unchanged を出力する。対象指標は canonicalExact / root / quality / top3Canonical。`02-normalized-baseline.json` の `pairedVsLegacy` に記録した。

## 10. v1 `qualityFamily()` のバグ修正

P4.0-00で報告した反転バグを修正した。

```text
修正前: "dom13sus" は sus 判定に到達せず "major" へフォールバック
修正後: sus を含む品質を先に判定
```

影響:

| Metric | 修正前 | 修正後 | 差 |
|---|---:|---:|---:|
| Legacy Quality | 60.83% | 60.29% | -0.54pp |
| Reranker Quality | 61.48% | 61.05% | -0.43pp |

Root / Exact / Top-3 / Corrections は不変。

**これは退行ではなく是正である。** 修正前は、13sus和音を `dom7sus4` と正しく検出すると不一致、ただのドミナントと誤検出すると一致になっていた。60.83%は誤りに加点した値だった。

`surfaceExact` は `qualityFamily()` を使わないため、Phase 3.6系との歴史的接続は保たれる。

## 11. Promotion Gate

`02-promotion-gates.json` に定義した。**現時点では人間承認待ちである。**

Gateは以降変更しない。後続の結果に合わせて閾値を動かさない（計画書§8.10）。

### 11.1 現行Analyzerのgate評価

Gateを現在の2つのrerankerへ適用すると、**どちらも不合格**になる。

| Analyzer | 判定 | 主な不合格理由 |
|---|---|---|
| legacy-boundary-rerank | FAIL | top3Root -8.51pp / top3Quality -6.68pp / holdout canonicalExact +0.29pp（要求1.0pp） |
| voice-aware-rerank-v1 | FAIL | top3Root -8.30pp / top3Quality -6.84pp / holdout canonicalExact +0.58pp（要求1.0pp） |

これはP4.0-06の結論を先取りするものではないが、**Gateを承認した場合、既存rerankerを製品既定へ昇格させる根拠は現時点で存在しない**ことを意味する。

### 11.2 承認が必要な判断

1. 0.5pp / 1.0pp の許容幅は妥当か。評価は決定的なのでノイズは存在せず、0を超える許容は「トレードオフの意図的な容認」を意味する。
2. requireAny の holdout 1.0pp 改善という基準は、製品既定を変えるハードルとして妥当か。
3. `top3Root` / `top3Quality` をハードGateにするか、参考指標に留めるか。ハードGateにすると既存rerankerは昇格不可能になる。

## 12. 成果物

```text
docs/phase4.0/02-evaluation-contract.md      本書
docs/phase4.0/02-normalized-baseline.json    3モードの正規化baseline
docs/phase4.0/02-promotion-gates.json        Gate定義（承認待ち）
docs/phase4.0/02-metric-migration.md         v1→v2の移行対応
src/domain/midi/evaluation/metricsV2.ts      v2指標
src/domain/midi/evaluation/metricsV2.test.ts 18件
scripts/evaluate-metrics-v2.ts               npx vite-node ... --output <name>
```

## 13. 次Stageへの申し送り

1. **P4.0-03** — Block指標（`blockRecallAtIoU50` 等）の baseline をここで確立する。Gateの規則は固定済みで、値のみ後から入る。
2. **P4.0-04** — weight探索は tune のみ。holdout を見て調整しない。
3. **P4.0-05** — 到達不能30.60%の内訳（変化音付き・13sus・maj13）は、語彙拡張なしには canonical 一致し得ない。語彙を増やすかは Analyzer 設計の判断であり、増やす場合は本Stageの representability 定義も再計算が必要。
4. **P4.0-06** — Gate承認が前提。未承認のまま昇格判断へ進まない。
5. key-aware spelling を検出器へ適用するかは未決のまま。適用すると `summaryText` と dedupeKey が変わるため、P4.0-03のstructured signature導入と併せて判断するのが安全。
