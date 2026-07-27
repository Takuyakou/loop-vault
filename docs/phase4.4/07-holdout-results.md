# Phase 4.4 Holdout Status

## 判定

**未実行（Validation Gate未達のため規定どおり停止）**

P4.4-06の固定Validationでは次の必須Gateを満たさなかった。

- melody contamination reduction: 0%（必要条件: 25%以上）
- melody leak improvement: 0%（必要条件: 改善方向）
- Exact delta: 0pp（Devでの改善方向と一致せず）

一方、Usableは25.00%から39.58%へ改善し、Recall / Bass / Top / Registerの退行、新規major failure、sourceにないnote追加はなかった。

## Holdout規律

- 専用holdout MIDIは解析していない
- 専用holdoutの件数・指標は出力していない
- Validation結果を見た後の閾値変更はしていない
- Gateを緩和していない
- 既存60 MIDIの旧holdoutも新規昇格判定には使用していない

根拠: `docs/phase4.4/06-validation-results.json`
