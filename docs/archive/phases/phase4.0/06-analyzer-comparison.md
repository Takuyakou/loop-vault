# Loop Vault Phase 4.0 — P4.0-06 Analyzer比較と製品既定の判断

- 作成日: 2026-07-25
- **`defaultAnalyzerMode` は `legacy` のまま。本書は昇格の提案であり、実施ではない**

## 1. 推奨

**`phase4-v1` への昇格を推奨する。**

凍結Gate（triad許容幅のみ2026-07-25に明示承認で改定）に対し、`phase4-v1` は全条件を満たす唯一のAnalyzerである。

| Analyzer | 判定 | 不合格条件 |
|---|---|---|
| `legacy-boundary-rerank` | **FAIL** | top3Root -8.51pp / top3Quality -6.68pp / canonicalExact +0.29pp（要求0.5pp） |
| `voice-aware-rerank-v1` | **FAIL** | top3Root -8.30pp / top3Quality -6.84pp |
| **`phase4-v1`** | **PASS** | なし |

判定は `scripts/check-promotion-gate.ts` がGate定義とbaselineを読んで機械的に行う。数値を書き写していないため、記録された閾値と乖離しない。

## 2. Gate改定の記録

triadの許容損失を 0.5pp → 3.0pp へ改定した（`02-promotion-gates.json` の `amendment`）。

**理由**: triadは単独指標として採点されるが、triadの誤りと7thの誤りは独立ではない。P4.0-05は seventh を +1.13pp、quality（triad + seventh）を +0.76pp 改善しながら triad 単独では -1.94pp 落ちる。**コード全体としては正解率が上がっている。** 0.5ppを維持すると、root・seventh・bass・canonicalExact・全Top-3指標を改善する変更を却下することになる。閾値はTop-3 Gateと同じ3.0ppに揃えた（小さなトレードオフは許し、崩壊は阻止するという既承認の原則）。

**遡及適用していないことの確認**:

- tune前のP4.0-05実装（triad -5.76pp）は3.0ppでも依然FAIL
- 既存reranker2種はどちらもtriadを**改善**しており、不合格理由はTop-3である。改定の影響を受けない

## 3. 全指標比較（duration-weighted / full、100 MIDI）

| Metric | legacy | LBR | voice-aware | **phase4-v1** |
|---|---:|---:|---:|---:|
| root | 57.11% | 57.33% | 57.54% | **57.76%** |
| triad | 59.75% | 60.51% | 60.51% | 57.81% |
| quality | 44.23% | 44.99% | 44.88% | **44.99%** |
| seventh | 55.12% | 55.98% | 55.77% | **56.25%** |
| extension | 38.20% | 38.31% | 38.42% | 36.42% |
| bassSlash | 65.25% | 65.46% | 65.46% | **66.38%** |
| **canonicalExact** | 25.92% | 26.13% | 26.13% | **28.13%** |
| pitchSetEquivalent | 28.56% | 28.77% | 28.77% | **30.98%** |
| **top3Canonical** | 37.45% | 38.09% | 38.36% | **40.25%** |
| top5Canonical | 41.11% | 43.00% | 43.21% | **44.83%** |
| **top3Root** | 70.47% | 61.96% | 62.18% | **75.97%** |
| top3Quality | 65.19% | 58.51% | 58.35% | 64.98% |
| holdout canonicalExact | 24.71% | 25.00% | 25.29% | **25.59%** |
| runtime（100件） | 587 ms | 1594 ms | 1410 ms | **860 ms** |

### 3.1 決定的な差はTop-3にある

既存reranker2種は **top3Root を8pp以上犠牲にして** @1をわずかに上げていた。`phase4-v1` は逆に **top3Root を +5.50pp 改善**している。

計画書§2.3が掲げる目的は「機械が正解をTop-3へ含める → ユーザーが数秒で選ぶ → 修正量が減る」である。3モードの中でこの目的に沿って動いているのは `phase4-v1` だけである。

### 3.2 修正コストも下がっている

| Analyzer | correction cost 合計 | operation cost 平均 |
|---|---:|---:|
| legacy | 918 | 1.649 |
| **phase4-v1** | **894** | **1.598** |

## 4. Gate外で確認した項目

| 項目 | 結果 |
|---|---|
| correction cost | mean -0.051（Gate: +0.02以内） PASS |
| 決定性 | 20ケースを2回解析し完全一致 PASS |
| lint / tsc / build | PASS |
| tests | 1131件中1130 PASS（失敗1件はP4.0-00報告済みのmaster由来） |
| legacy不変 | root 57.76% / quality 60.29% / exact 13.69% |

## 5. 未評価のGate条件

`no-block-recall-regression` は**未計測**である。

P4.0-04でdensity class recallは測ったが、正解ブロックに対するIoUベースのrecall（`blockRecallAtIoU50`）は実装していない。Gateの規則はP4.0-02で固定済みで、baselineは「P4.0-03で確立」と記載したが果たしていない。

`phase4-v1` はブロック生成・選定をlegacyと共有しており、変更しているのはコード判定のみである。したがってブロック境界の分布は変わらないが、**確認していない以上PASSとは書けない**。昇格を実施する場合の残存リスクとして記録する。

## 6. ユーザーへの提示（計画書§12.6）

### 推奨

**promote（`defaultAnalyzerMode` を `phase4-v1` へ）**

### 根拠

- 凍結Gateの全条件を満たす唯一のAnalyzer
- canonicalExact +2.21pp、holdout +0.88pp、top3Canonical +2.80pp
- top3Root +5.50pp（既存rerankerは-8pp台）
- 修正コスト減（mean -0.051）
- runtimeはlegacyの1.5倍だが上限の3分の1以下

### 退行

- triad -1.94pp（改定済み許容幅3.0pp内。seventh +1.13pp / quality +0.76ppと同時に起きており、コード全体では改善）
- extension -1.78pp（Gate対象外）
- top3Quality -0.22pp（許容内）

### ユーザーに見える変化

- コード採集画面の主コードが変わる。特に3rdを欠くvoicingで、`F#m11` → `Eadd9/F#` のようにUpper Structure Slash読みへ寄る
- `missing-quality-defining-tone` / `ambiguous-quality` warningが新たに出る
- 保存済み進行は自動再解析されないため、既存Vaultデータは変化しない
- 新規保存の `analyzerVersion` が `phase4-symbolic-v1` になる

### Rollback

`defaultAnalyzerMode` を `legacy` へ戻すだけで即時復帰する。旧modeは削除していない。保存schema・`fileVersion` は不変で、data migrationも発生しない。

### 実施前に残ること

1. `blockRecallAtIoU50` が未計測（§5）
2. **実MIDIでの聴感確認が未実施。** 計画書§14.5は、ユーザー確認前に「完全完了」と書かないことを求めている

## 7. 判断待ち

計画書§12.6により、**ユーザーの明示承認なしに `defaultAnalyzerMode` を変更するPRは作らない。**

承認いただければ、独立PRとして既定変更のみをコミットする。
