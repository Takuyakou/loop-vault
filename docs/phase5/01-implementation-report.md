# Loop Vault Phase 5 Accuracy First 作業報告

## 実装

- 保存成功時に `progression-save` Correction Logを1件追記する経路を追加した。
  MIDI本体、ファイル名、パス、Idea名、メモは記録しない。
- R1（自動付与された非root bassに対するplain companion）を追加候補へ接続した。
  Rank 1と既存Top-3は維持し、設定から個別にOFFへ戻せる。
- R2（Phase 4.4.2 A1 conservative melody filter）をMIDI由来ボイシング採集へ接続した。
  `minimumSupportBeats=0.2`を含む保守版だけを使用し、A1-primeは使用していない。
- R1/R2設定はVault外のlocalStorageへ保存する。`data.json`、Vault schema、
  `fileVersion`、Voicing Memory、practice progressは変更していない。
- Captureへ「MIDI読込 / 解析 / 画面準備」のindeterminate進捗表示を追加した。
  同期解析の開始前に1フレーム描画へ譲るため、長い解析でも無反応に見えない。
- Chord InspectorへFast Label Entryを追加した。
  通常のコード名に加え、`V7`、`ii7`、`4maj7`等の度数入力、
  key-aware autocomplete、直前quality優先候補を利用できる。

## 評価

詳細値は `docs/phase5/00-accuracy-first-evaluation.md` とJSONを正とする。

- Chord Drip: 100 files / 1,058 events
- Chapter 3 Seed: 100 files / 399 events
- Phase 4.5 label dev: 40 files / 320 events
- Phase 4.7 Gold: 36 files / 288 events
- 実MIDI: all-instruments / captured-chorus / SURAN / Endless
- 全モード: legacy / LBR / voice-aware / hybrid / phase4-v1
- 追加比較: phase4-v1 + R1

R1はPhase 4.5 label devでCandidate Recallを73.13%から80.00%へ、
Phase 4.7 Goldで4.51%から8.68%へ改善した。Rank 1とTop-3は不変だった。

R2はHarmony Support Goldで次の改善を確認した。

| Split | Exact before | Exact R2 | F1 before | F1 R2 |
|---|---:|---:|---:|---:|
| dev | 18.13% | 32.50% | 84.06% | 86.49% |
| validation | 25.00% | 45.83% | 79.37% | 81.52% |
| holdout | 62.50% | 66.67% | 95.85% | 96.30% |

Hybridは一部Corpusでphase4-v1を上回ったが、約296秒のEndlessで
12.6秒を要し、明示された10秒停止条件へ到達した。このためHybrid採用Stageを停止し、
それへ依存するCandidate union Stageも開始していない。defaultAnalyzerModeは
`phase4-v1`のままである。相対runtime増加ではなく、絶対停止条件による判断である。

## 検証

- ESLint / Tailwind class lint: PASS
- TypeScript `tsc --noEmit`: PASS
- Vitest: 222 files / 1,742 tests PASS
- Rust `cargo test`: 24 tests PASS
- Web production build: PASS
- Tauri production build: PASS
- Live MIDI latency benchmark: notes/Bass p50 2ms、provisional p50 27ms、
  confirmed p50 52ms、full release p50 182ms
- 実MIDIの全モード決定性: PASS
- private MIDI / `.local-evaluation`: Git未追加
- `git diff --check`: PASS

## 生成物

- `src-tauri/target/release/loop-vault.exe`
- `src-tauri/target/release/bundle/msi/Loop Vault_0.1.0_x64_en-US.msi`
- `src-tauri/target/release/bundle/nsis/Loop Vault_0.1.0_x64-setup.exe`

## 残る確認

採用基準の「本人の曲で2週間使って違和感がない」は自動検証できないため、
R1/R2を既定ON、個別rollback可能な状態でユーザー評価待ちとした。
