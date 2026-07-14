# Loop Vault Phase 3.6.1 作業報告書

## 1. 結論

Phase 3.6のraw hybridがlegacyを下回った原因を追跡し、legacyの境界を固定した軽量rerankerを追加した。

Chord Drip synthetic 100件では、境界を一切変えず、root / quality / tetrad / exact / Top-3 / correction costの全指標でlegacy以上になった。ただし実MIDI評価セットはまだ0件であり、180秒MIDIではlegacyの約5.0倍の処理時間だった。このため `defaultAnalyzerMode` は `legacy` のまま変更していない。

## 2. 失敗分析

`npm run diagnose:midi-failures` で、カテゴリ別の代表失敗に対してexpected / legacy / raw hybrid / Top-K / score breakdownを生成する。

100件、1058 expected segmentsの集計:

- Legacy exact mismatch: 918
- Raw hybrid exact mismatch: 919
- Expected exact label absent from Top-K: 822
- Expected root absent from Top-K: 336
- Expected root + quality absent from Top-K: 520
- Expected exact label in Top-K but another chord selected: 97

exact label不在822件には、`Dm9(11)/C` や `F#13sus` のような現テンプレートで同一表記を生成できないケースが含まれる。そのため、表記能力不足、root候補不足、root+quality候補不足、復号失敗を別々に数えた。

詳細: `docs/phase3.6.1-failure-analysis.md`

## 3. Ablation

以下を独立にON/OFFできる `HybridFeatureFlags` を追加した。

- track role estimation
- ornament suppression
- adaptive segmentation
- key prior
- two-pass decoding
- adjacent merge

主な結果:

- ornament suppressionを外すとroot -0.48pp、quality -0.97pp、Top-3 -0.54pp。
- track roleを外すとroot +1.08ppだが、Top-3 -0.75pp、correction +5。
- adaptive segmentationとtwo-pass decodingは、このsynthetic corpusではほぼ差がない。
- key priorを外すとTop-3 +0.32pp、correction -2。
- mergeを外すとboundary F1が69.72%から45.35%へ低下。

詳細: `docs/phase3.6.1-ablation-report.md`

## 4. Legacy-Boundary Reranker

新モード: `legacy-boundary-rerank`

処理:

1. legacy timelineを生成する。
2. legacyのstart / end / durationを固定する。
3. 各legacy区間の音符だけをhybridのweighted profileで集計する。
4. hybrid Top-8とlegacyコードを同じscore breakdownで採点する。
5. legacyコードを候補集合へ必ず残す。
6. すべての保守条件を満たす場合だけ主コードを置換する。

置換条件:

- Score lead >= 0.60
- Core coverage >= 0.62
- Root evidence >= 0.08
- Foreign-note penalty <= 0.14
- Missing-core penalty <= 0.17

key priorはrerank採点に使用していない。

## 5. 精度

### Synthetic全100件

| Metric | Legacy | Reranker | Delta |
|---|---:|---:|---:|
| Root | 57.76% | 57.97% | +0.21pp |
| Quality | 60.83% | 61.48% | +0.65pp |
| Tetrad | 38.31% | 39.06% | +0.75pp |
| Exact | 13.69% | 13.79% | +0.10pp |
| Top-3 | 19.67% | 21.55% | +1.89pp |
| Correction cost | 918 | 917 | -1 |
| Boundary precision | 76.55% | 76.55% | 0.00pp |
| Boundary recall | 90.09% | 90.09% | 0.00pp |

### Tune / Holdout

- tune 80件だけで候補閾値を順位付けした。
- tune上位の0.50はholdout qualityを悪化させたため、回帰ガードで拒否した。
- 0.60はholdoutのroot 68.18% -> 68.75%、quality 67.90% -> 68.47%、Top-3 27.84% -> 30.11%。
- holdout exactは16.76%で同値、correction costは154で同値。

## 6. Synthetic / Real-world分離

`npm run eval:midi:datasets` は次を混ぜずに評価する。

- `synthetic-labeled`: 正解ラベル付き精度を計測。
- `real-world-unlabeled`: 境界一致、置換数、legacy候補保持、決定性、処理時間を計測。

現在、`.local-evaluation/real-midi` は0件でstatusは `not-provided`。実MIDI精度は未評価であり、synthetic改善から推測していない。

## 7. 性能

180秒、2306 bytesの合成MIDIをwarm-up後5回測定した中央値:

- Legacy: 44.1ms
- Full hybrid: 1639.4ms
- Legacy-boundary reranker: 218.7ms
- Reranker / legacy: 4.96倍

rerankerはfull hybridより軽いが、legacyよりまだ遅い。

## 8. テストとビルド

- `npm run lint`: 成功
- `npm test`: 35ファイル、117テスト成功
- `npm run build`: 成功
- `npm run diagnose:midi-failures`: 成功
- `npm run ablate:midi`: 成功
- `npm run tune:midi-reranker`: 成功
- `npm run eval:midi:rerank`: 成功
- `npm run eval:midi:datasets`: 成功
- `npm run benchmark:midi`: 成功
- `npm run tauri build`: 成功（起動中の旧EXEを避けるため `CARGO_TARGET_DIR=src-tauri/target-p361` を使用）

生成物:

- `D:\dev\Loop Vault\src-tauri\target-p361\release\loop-vault.exe`
- `D:\dev\Loop Vault\src-tauri\target-p361\release\bundle\msi\Loop Vault_0.1.0_x64_en-US.msi`
- `D:\dev\Loop Vault\src-tauri\target-p361\release\bundle\nsis\Loop Vault_0.1.0_x64-setup.exe`

## 9. 既知の課題

- 実MIDIの正解ラベル付き評価は未実施。
- tension / slashの表現力不足がexactとTop-Kを強く制限している。
- track roleはroot精度へ負の寄与があり、root用とquality用の重み分離をさらに調整できる。
- adaptive segmentationとtwo-pass decodingは現コーパスで有効性を示せていない。
- rerankerはlegacyより約5.0倍遅い。
- 以上により、既定解析モードは引き続き `legacy`。
