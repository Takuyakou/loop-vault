# Loop Vault Phase 3.6 作業報告書

## 1. 結論

Phase 3.6では、MIDIコード検出を評価可能な状態にしたうえで、重み付き音符特徴、トラック役割推定、可変区間、Top-K候補、2-pass DP、区間結合、信頼度を備えた `hybrid-v1` 解析器を追加した。

100件のChord Drip評価コーパスでは、製品統合時にlegacyの主コードと境界を保護した結果、root/exact/境界精度はbaseline同値、Top-3精度は **19.67%から20.96%** へ改善した。ただし、hybrid単独の主コード精度と180秒MIDIの性能は受け入れ目標を満たさなかった。このため、現行アプリの既定解析器は `legacy` のまま維持している。

## 2. Stage別実装

### Stage 0: 評価基盤とbaseline

- Chord Dripの実manifestを読み込むアダプタを追加した。
- recipe family単位で決定的にtune 80件 / holdout 20件へ分離した。
- root、quality、tetrad、exact、Top-3、境界precision/recall、過分割/不足分割、修正コストを集計する。
- `npm run eval:midi` と `npm run eval:midi:compare` を追加した。
- baselineは同一入力で決定的に生成される。

主な実装: `src/domain/midi/evaluation/*`, `scripts/evaluate-midi-analysis.ts`

### Stage 1: 音符正規化と重み付きoverlap

- CC64 sustain、同音再発音、MIDI終端を考慮した正規化を追加した。
- 区間内の実overlap時間、拍位置、音域、velocity、役割、装飾音penaltyを集約する。
- 調整値を `AnalyzerWeights` に集約した。

主な実装: `src/domain/midi/normalize.ts`, `weights.ts`, `parser.ts`

### Stage 2: トラック役割と装飾音

- bass / chord / pad / arpeggio / melody / lead / counter / drums / unknownを推定する。
- root証拠とquality証拠を別々に重み付けする。
- passing、neighbor、chromatic approach、short upper voiceを弱め、suspension / anticipation / pedalを特徴として残す。

主な実装: `src/domain/midi/trackRoles.ts`, `ornaments.ts`

### Stage 3: 可変区間と累積特徴

- 小節、拍、onset burst、bass change、silenceから境界候補を作る。
- 条件付き半拍境界と最大区間長を含むsegment latticeを構築する。
- 任意区間を高速集計するprefix-sum feature tableを追加し、naive集計との一致をテストした。

主な実装: `src/domain/midi/segmentation.ts`, `profiles.ts`

### Stage 4: コード候補とTop-K

- 構造化 `ChordTemplate` と分解可能な `ChordCandidateScore` を追加した。
- core coverage、foreign note、root、bass、key prior等を採点しTop-8を保持する。
- C6とAm7/Cのような異名候補を早期に消さない。

主な実装: `src/domain/midi/candidates.ts`, `keyPrior.ts`

### Stage 5: 2-pass DP

- 可変長segment DAGを動的計画法で復号する。
- repeated chord、弱拍変更、root motion等を決定的に評価する。
- 1回目の経路を文脈としてsuspension / anticipationを再評価し、2回目を復号する。

主な実装: `src/domain/midi/decoder.ts`

### Stage 6: 結合と信頼度

- 同一コードを結合し、弱い境界でのみ同系統extension差を結合する。
- bass変更、major/minor変更、強境界は結合しない。
- margin、entropy、core、foreign、bass/key、temporal、boundaryから high / medium / reviewを判定する。

主な実装: `src/domain/midi/merge.ts`, `confidence.ts`

### Stage 7: 製品統合と修正ログ

- `MidiAnalyzerMode = "legacy" | "hybrid-v1"` を追加した。
- legacy実装を互換ファイルとして残し、公開ファサードからモード選択可能にした。
- Full Timelineから4/8/16小節候補を抽出する。
- 診断CLI `npm run eval:midi:inspect -- <midi>` を追加した。
- 製品統合ではlegacyの主コード・境界を採用し、hybrid候補・信頼度警告を付加する。
- 明示的なコード編集だけを `AppData/loopvault/analysis-feedback.jsonl` へ追記する。
- ログにはMIDI bytes、絶対パス、Idea名、メモを含めない。
- 設定画面からローカルログのON/OFFと削除ができる。

主な実装: `src/domain/midi/analysis.ts`, `hybrid.ts`, `legacy.ts`, `blocks.ts`, `feedback.ts`, `src/storage/analysisFeedbackStorage.ts`

### Stage 8: tune / holdout / 性能

- 3候補の決定的小規模探索をtune 80件だけで実行した。
- `bass-root-up`を選択し、holdout 20件を探索終了後に評価した。
- 選定値 `bassRoleRootWeight: 1.5`, `bassRoleQualityWeight: 0.55` を反映した。
- 180秒の決定的な合成MIDIを生成する性能スクリプトを追加した。

主な実装: `scripts/tune-midi-weights.ts`, `scripts/benchmark-midi-analysis.ts`

## 3. 評価結果

### 全100件

| 指標 | legacy baseline | 製品統合hybrid-v1 |
|---|---:|---:|
| Root accuracy | 57.76% | 57.76% |
| Exact accuracy | 13.69% | 13.69% |
| Top-3 accuracy | 19.67% | 20.96% |
| Boundary precision | 76.55% | 76.55% |
| Correction cost | 918 | 918 |

### tune / holdout

- tune 80件: 選定候補のTop-3 18.68%
- holdout 20件: 選定候補のTop-3 30.68%
- holdoutは重み選定には使用していない。

### 性能

180秒、2306 bytesの合成MIDIを同一プロセスで測定した。

- legacy: 66.3ms
- hybrid-v1: 1508.5ms
- 比率: 22.75倍
- hybridの観測ヒープ増分: 50.79MB

絶対時間は約1.5秒だが、計画上の「baselineの2倍以内」は未達である。UIメインスレッドを長時間ブロックする可能性もあるため、hybridを既定に切り替えていない。

## 4. テストとビルド

- `npm run lint`: 成功
- `npm test`: 34ファイル、113テスト成功
- `npm run build`: 成功
- `npm run eval:midi:compare`: 成功
- `npm run tune:midi-weights`: 成功
- `npm run benchmark:midi`: 成功
- `npm run tauri build`: 成功

生成物:

- `D:\dev\Loop Vault\src-tauri\target\release\loop-vault.exe`
- `D:\dev\Loop Vault\src-tauri\target\release\bundle\msi\Loop Vault_0.1.0_x64_en-US.msi`
- `D:\dev\Loop Vault\src-tauri\target\release\bundle\nsis\Loop Vault_0.1.0_x64-setup.exe`

## 5. PRスタック

1. PR #29: 評価基盤とbaseline
2. PR #30: 音符正規化と重み付きoverlap
3. PR #31: トラック役割と装飾音
4. PR #32: 可変区間と累積特徴
5. PR #33: 候補採点とTop-K
6. PR #34: 2-pass DP / Viterbi
7. PR #35: 区間結合と信頼度
8. PR #36: 製品統合と修正ログ
9. Stage 8: tune / holdout / 性能 / 本報告書

各PRは直前のStageブランチをbaseにした積み上げ構成である。

## 6. 既知の課題と判断

- **精度未達**: hybrid単独の主コード判定は100件コーパスでlegacyを下回った。製品統合では主コード・境界をlegacyへフォールバックしている。
- **性能未達**: 180秒MIDIで22.75倍。segment lattice、候補採点、2-pass DPのプロファイルと最適化が必要。
- **既定モード**: `defaultAnalyzerMode` は意図的に `legacy` のまま。Top-3改善だけでは切替条件を満たさないと判断した。
- **評価範囲**: 数値評価はChord Drip synthetic 100件。ユーザー所有FL Studio MIDI、長尺full-song、Neo-Soul/Jazzの人手評価は未実施。
- **修正ログ**: ローカルJSONL保存は実装済みだが、ログを自動で再学習・再調整へ取り込む機能は未実装。
- **時刻**: 解析結果の決定性を維持するためhybridの `analyzedAt` は固定値。実行時刻を記録する場合は純粋解析の外側で付与する必要がある。

## 7. 次の推奨作業

1. 実MIDIを使った人手確認を行い、synthetic以外の失敗パターンを修正ログへ蓄積する。
2. Stage別プロファイルを追加し、特にsegment latticeと候補採点を最適化する。
3. hybrid単独でroot/quality/境界がbaseline以上になった時点で既定モード切替を再評価する。
4. 長尺解析をWeb WorkerまたはTauri commandへ移し、UIブロックを避ける。
