# Loop Vault Phase 4.0 — P4.0-02 指標移行対応表

過去レポートの数値をv2でどう読み替えるかをまとめる。

## 1. 直接比較してはいけない組み合わせ

| v1 | v2 | 比較可否 |
|---|---|---|
| `exactAccuracy` (surface) | `canonicalExactAccuracy` | **不可**。定義も分母も異なる |
| `qualityAccuracy` (4分類family) | `qualityAccuracy` (triad + seventh) | **不可**。v2の方が厳しい |
| `rootAccuracy` | `rootAccuracy` | 概ね可。v2はidentity経由でrootを取る |
| `top3Accuracy` | `top3CanonicalAccuracy` | **不可**。v1はlabel一致 |
| `rootTop3Accuracy` | `top3RootAccuracy` | 概ね可 |

## 2. 過去レポートの数値

Phase 3.6〜3.6.5 および P4.0-00 で記録された値は、いずれも **surface指標** である。

| レポート | Legacy Exact | 種別 |
|---|---:|---|
| `phase3.6-work-report.md` | 13.69% | surface |
| `phase3.6.1-reranker-report.md` | 13.69% | surface |
| `phase3.6.5-audit.md` | 13.6853% | surface |
| `phase4.0/00-baseline-lock.json` | 13.6853% | surface |
| `phase4.0/02-normalized-baseline.json` | 25.9159% | **canonical** |

surface値の系列は今後も `eval:midi:datasets` で再現でき、歴史的連続性は保たれる。

## 3. `qualityAccuracy` の断絶

v1の `qualityFamily()` バグ修正により、v1側のquality値も変わった。

| 系列 | Legacy Quality |
|---|---:|
| Phase 3.6〜P4.0-01（バグあり） | 60.83% |
| P4.0-02以降（修正後） | 60.29% |

過去レポートの60.83%は `dom13sus` を `major` として扱った結果であり、13sus和音をドミナントと誤検出した場合に加点していた。**60.29%が正しい値**である。

Phase 3.6系レポートのquality値を引用する場合は、この0.54ppの差が指標修正によるものであることを明記すること。

## 4. 分母の扱い

v1は到達不能な期待ラベルも分母に含めていたが、その事実を報告していなかった。

v2は常に次を併記する。

```text
分子 / 分母
representable / detector-vocabulary-unsupported / parser-unsupported / no-chord
```

`canonicalExact 25.92%` は「全期待区間に対する25.92%」であり、到達可能分に限れば `25.92 / 69.40 = 37.35%` である。**後者を単独のKPIとして掲げない**（分母が語彙定義に依存するため）。

## 5. 実行方法

```bash
# surface指標（歴史的系列）
npm run eval:midi:datasets

# ラベル契約
npm run eval:midi:label-reachability

# canonical指標
npx vite-node scripts/evaluate-metrics-v2.ts --output 02-normalized-baseline.json
```

Stage成果物は凍結スナップショットとして扱い、`--output` で明示的にファイル名を指定する。既定値は stage 番号を含まない `normalized-baseline.json` であり、後続実行が前Stageの記録を上書きしない。

## 6. レポート作成時の禁止事項

- surface と canonical の差分を「改善」と書かない
- 到達不能件数を伏せて精度だけを書かない
- tune の数値を holdout の数値として書かない
- Gate閾値を結果に合わせて後から動かさない
