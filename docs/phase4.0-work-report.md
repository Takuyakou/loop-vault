# Loop Vault Phase 4.0 作業報告書
## MIDI Detection Engine v2

- 作成日: 2026-07-25
- 対象ブランチ: `master`
- 起点commit: `22cd15e`
- 完了時commit: `4f53a55`

---

## 1. 完了状態

```text
自動検証:              完了
100 MIDI評価:          完了（2コーパス）
独立コーパス検証:      完了
実MIDI聴感確認:        未実施
defaultAnalyzerMode:   legacy → phase4-v1（人間承認を得て変更）
Phase 4.0:             暫定完了
```

実機での聴感確認のみ未実施。計画書§14.5に従い「完全完了」とは書かない。

---

## 2. Stageとマージ

| Stage | 内容 | PR |
|---|---|---|
| P4.0-00 | 現状監査・baseline固定 | [#157](https://github.com/Takuyakou/loop-vault/pull/157) |
| P4.0-01 | コードラベル契約・製品バグ修正 | [#158](https://github.com/Takuyakou/loop-vault/pull/158) |
| P4.0-02 | 評価指標v2・promotion gate策定 | [#159](https://github.com/Takuyakou/loop-vault/pull/159) |
| P4.0-03 | Candidate Block v2 | [#160](https://github.com/Takuyakou/loop-vault/pull/160) |
| P4.0-04 | Block Generation / Selection v2 | [#161](https://github.com/Takuyakou/loop-vault/pull/161) |
| P4.0-05B/D | 品質決定音の証拠・tune探索 | [#162](https://github.com/Takuyakou/loop-vault/pull/162) |
| P4.0-06 | 製品既定の変更 | [#163](https://github.com/Takuyakou/loop-vault/pull/163) |
| P4.0-07/08 | 保存前試聴・Warning UX・最終QA | [#164](https://github.com/Takuyakou/loop-vault/pull/164) |
| P4.0-09 | 独立コーパスによる検証 | [#165](https://github.com/Takuyakou/loop-vault/pull/165) |

**05A（Upper Structure Slash候補生成）と05C（Reranker A/B接続）は実装していない。** 05Aは、P4.0-00の監査で `Eadd9/F#` / `Dadd9/E` が既に第1代替として存在すると判明し、05Bの減点だけで主候補が入れ替わったため不要になった。

---

## 3. このPhaseで最も重要だったこと

### 測れない状態を終わらせた

開始時、Analyzerの比較に使われていた `Surface Exact 13.69%` は**表記互換性を含む指標**で、理論上限が32.22%しかなかった。

| | Surface (v1) | Canonical (v2) |
|---|---:|---:|
| Exact | 13.69% | **25.92%** |

**「不一致」の約半分は検出の誤りではなく表記の違いだった。** Phase 3.6から3.6.5まで5フェーズ、この数字でAnalyzerの優劣を判断していた。Hybrid・boundary rerank・voice-awareの3世代がいずれも +0.1pp しか動かせなかった理由の一部がここにある。

### 数値の意味が変わった

Phase 4.0終盤に提供された独立コーパス（手作業注釈100 MIDI）での結果。

| | Chord Drip | Chapter 3 Seed |
|---|---:|---:|
| canonicalExact | 28.13% | **97.73%** |
| 検出器の語彙外 | **30.60%** | 1.0% |

**28.13% は検出器が無能であることを意味しない。** Chord Drip は rootless jazz を含む6種のvoicing × 8種のパターン変奏で意図的に難しく生成され、かつ3割が原理的に表現できない語彙（`dom13sus` / `maj13` / 括弧付きテンション）を要求する。

**素直なコードMIDIに対する実力は98%前後にある。**

---

## 4. 修正した製品バグ

| 症状 | 規模 | Stage |
|---|---|---|
| `C6/9` を自アプリのパーサが読めず、Chord Inspectorで無効扱い | コーパス130拍 | 01 |
| `A13sus` → `Asus413` の不正表記生成 | — | 01 |
| 1小節2コードの片方が消える | **398小節** | 03 |
| 持続中のコードが `N.C.` 表示 | **46小節** | 03 |
| dedupで構造の違う候補が衝突 | 18ブロック | 03 |
| 保存前と保存後で試聴の音が違う | 全候補 | 07 |
| 日本語UIに `Sparse Evidence` と英語が出る | — | 07 |
| `ambiguous-bass` のラベルが実条件を偽っていた | — | 07 |
| `qualityFamily()` が `dom13sus` を判定できず正誤が反転 | コーパスの10.72% | 02 |

Candidateの情報欠落はコーパス100件中**86件**で発生していた。

---

## 5. 検出精度

### 5.1 Chord Drip コーパス（duration-weighted / full）

| Metric | legacy | **phase4-v1** | Δ |
|---|---:|---:|---:|
| root | 57.11% | **57.76%** | +0.65pp |
| triad | 59.75% | 57.81% | -1.94pp |
| quality | 44.23% | **44.99%** | +0.76pp |
| seventh | 55.12% | **56.25%** | +1.13pp |
| bassSlash | 65.25% | **66.38%** | +1.13pp |
| canonicalExact | 25.92% | **28.13%** | +2.21pp |
| top3Canonical | 37.45% | **40.25%** | +2.80pp |
| **top3Root** | 70.47% | **75.97%** | **+5.50pp** |
| holdout canonicalExact | 24.71% | **25.59%** | +0.88pp |
| correction cost (mean) | 1.649 | **1.598** | -0.051 |

### 5.2 Chapter 3 Seed（独立コーパス・チューニング未使用）

| Metric | legacy | **phase4-v1** | Δ |
|---|---:|---:|---:|
| root | 98.74% | 98.74% | ±0 |
| **triad** | 98.48% | **98.74%** | **+0.25pp** |
| quality | 97.22% | **98.48%** | **+1.26pp** |
| seventh | 98.48% | **99.49%** | **+1.01pp** |
| canonicalExact | 96.46% | **97.73%** | **+1.26pp** |
| top3Root | 99.75% | 99.75% | ±0 |

**退行はひとつもない。**

### 5.3 既存rerankerとの差

| Metric | legacy | LBR | voice-aware | **phase4-v1** |
|---|---:|---:|---:|---:|
| **top3Root**（Chord Drip） | 70.47% | **61.96%** | **62.18%** | **75.97%** |
| canonicalExact（Chapter 3） | 96.46% | 96.46% | 96.46% | **97.73%** |

既存reranker2種は **top3Root を8pp以上犠牲にして** @1をわずかに上げていた。phase4-v1は逆に +5.50pp 改善している。Chapter 3 では既存2種は @1 を legacy からまったく動かせていない。

計画書§2.3が掲げる「機械が正解をTop-3へ含める → ユーザーが数秒で選ぶ」に沿って動いているのは phase4-v1 だけである。

---

## 6. Promotion Gate

### 6.1 判定

`scripts/check-promotion-gate.ts` がGate定義とbaselineを読んで機械判定する。数値を書き写さないため記録された閾値と乖離しない。

| Analyzer | 判定 | 不合格条件 |
|---|---|---|
| `legacy-boundary-rerank` | FAIL | top3Root -8.51pp / top3Quality -6.68pp / canonicalExact +0.29pp |
| `voice-aware-rerank-v1` | FAIL | top3Root -8.30pp / top3Quality -6.84pp |
| **`phase4-v1`** | **PASS** | なし |

### 6.2 Gate改定（人間承認あり）

triadの許容損失を 0.5pp → 3.0pp へ改定した。理由をGate文書へ記録済み。

**理由**: triadの誤りと7thの誤りは独立ではない。seventh +1.13pp / quality（triad+seventh） +0.76pp と同時に triad 単独が -1.94pp 落ちており、コード全体では正解率が上がっている。閾値はTop-3 Gateと同じ3.0ppへ揃えた。

**遡及適用ではない**: tune前の実装（triad -5.76pp）は3.0ppでも依然FAIL、既存reranker2種はtriadを改善しており不合格理由はTop-3。

**結果的に妥当だった**: 独立コーパスでは triad が +0.25pp 改善する。あの退行は Chord Drip 固有の現象だった可能性が高い。

---

## 7. 測定して仮説が否定された箇所

Phase 4.0では「測ってから直す」を守った結果、事前の仮説が3件否定された。

| 仮説 | 実測結果 |
|---|---|
| 低密度候補が落ちる主因は `uniqueChordCount` ボーナス | **否定**。支配的なのは rankingScore の飽和（92.8%が1.0）と6件ハードキャップ |
| 減点を3rd欠落に限定すれば副作用が減る | **否定**。`third` scope は canonicalExact を -1.02〜-2.38pp 悪化させ、`full` が一貫して良い |
| `C7` 消失と `N.C.` 崩れは検出の問題 | **否定**。Full Timelineは両方保持しており、原因は候補の小節代表化 |

減点係数には崖があり、0.10と0.12の間でroot精度が約10pp崩壊する。当初の設計値0.35はこの崖の遥か上にあった。

---

## 8. 最終検証

| 検証 | 結果 |
|---|---|
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm test -- --run` | 155ファイル / **1147件中1146 PASS** |
| `cargo test` | **24件 PASS** |
| `npm run build` | PASS |
| `npm run tauri build` | PASS |
| `git diff --check` | PASS |

失敗1件は `ProgressionDetailView.test.tsx`。**Phase 4.0開始前からmasterに存在した既存failure**で本Phaseとは無関係（Phase 3.9.3で表示ラベルが「仮クリア」→「別日確認」に変わった際にテストが追従していない）。別タスクとして起票済み。

### Runtime

| Analyzer | 開始時 | 完了時 |
|---|---:|---:|
| Legacy | 49.4 ms | 80.1 ms |
| Legacy-boundary rerank | 175.1 ms | **107.5 ms** |
| Voice-aware rerank | 169.8 ms | **108.4 ms** |
| Hybrid | 1429.8 ms | 1570.0 ms |

Legacyは2小節窓の追加分だけ遅い。rerankerはブロックモデル統一により**開始時より速くなった**。100件コーパスでのphase4-v1は約860 msで、Gate上限3000 msの3分の1以下。

途中で `countStructuredRepeats` がブロックごとに全位置を再スキャンする実装により Legacy を 390 ms（7.9倍）まで悪化させたが、長さごとに一度だけ構築する形へ直して回復させた。

---

## 9. 互換性

- `fileVersion = 1` 変更なし
- 保存schema変更なし
- 旧data.jsonをそのまま読める
- **保存済み進行を自動再解析しない**
- 旧warning文字列・旧ラベル（`Asus413` 等）を読める
- 読み込み時の一括書換なし
- Candidateは非永続のまま
- Live MIDI / Chord Dojo / LLM / Progression Advisor は変更していない

---

## 10. Rollback

`src/domain/midi/analysis.ts` の1行で復帰する。

```ts
export const defaultAnalyzerMode = "legacy" as const;
export const analyzerVersion = legacyAnalyzerVersion;
```

旧modeは1つも削除していない。data migrationは発生しない。

---

## 11. 未実施・既知の制約

1. **実MIDIでの聴感確認が未実施**（自動検証で代替できない唯一の項目）
2. Voicing source chip（`元MIDI` / `自動` の表示切替）は未実装。`resolveVoicingForUse` は `origin` を返すのでUIから判別は可能
3. repeat cycle / event-boundary / loop-return generator は未実装
4. warning calibration（`warningPrecision` / `warningRecall`）は未計測
5. `presenceThreshold` はこのコーパスでは無効なパラメータ（0.01/0.02/0.03で結果が同一）
6. 検出器の語彙外がChord Dripコーパスの30.60%を占め、canonicalExactの上限は69.40%。`Am(maj7)/G#` のようなminor-major 7thも表現できない
7. 品質floor 0.35 とblock score重みは tune corpus での探索を経ていない設計値
8. Viteはminify後チャンク約1.1 MBに対し500 kB超過警告を出す。buildは成功する

---

## 12. 追加した診断コマンド

```bash
npm run eval:midi:label-reachability
npx vite-node scripts/evaluate-metrics-v2.ts --output <name>
npx vite-node scripts/check-promotion-gate.ts --output <name>
npx vite-node scripts/evaluate-chapter3-seed.ts --output <name>
npx vite-node scripts/evaluate-block-recall.ts --output <name>
npx vite-node scripts/evaluate-density-recall.ts --output <name>
npx vite-node scripts/evaluate-dedup-collisions.ts --output <name>
npx vite-node scripts/diagnose-block-score.ts --output <name>
npx vite-node scripts/tune-quality-evidence.ts --output <name>
npx vite-node scripts/verify-phase4-gate-extras.ts
npx vite-node scripts/build-corpus-split.ts
```

Stage成果物は凍結スナップショットとして扱うため、すべて `--output` で出力先を明示する。既定名のファイルはgitignoreしている。

---

## 13. 作業上の不具合

`git add -A` を使用したことで、`test/` フォルダ（ユーザー個人MIDIを含む101ファイル）と `src-tauri/gen/` を誤ってコミットし、GitHubへpushした。

対処: コミットを作り直して意図したファイルのみに修正し、`--force-with-lease` でブランチを書き換え、リモートに個人MIDIが存在しないことを確認。`test/` と `src-tauri/gen/` を `.gitignore` へ追加。

**残存**: force-push前の旧コミット `4ef93f6` はGitHub上でSHA指定なら一定期間アクセス可能。完全な削除にはGitHubサポートへの依頼が必要。

また、診断スクリプトの再実行が前Stageの凍結成果物を2度上書きした（P4.0-01、P4.0-03）。全スクリプトへ `--output` を追加して再発を防止した。

---

## 14. 成果物

```text
docs/phase4.0-work-report.md                     本書
docs/phase4.0/00-audit.md                        監査・baseline
docs/phase4.0/01-label-contract.md               ラベル契約
docs/phase4.0/02-evaluation-contract.md          評価指標v2
docs/phase4.0/02-promotion-gates.json            Gate定義（承認済み・改定記録付き）
docs/phase4.0/02-metric-migration.md             v1→v2の読み替え
docs/phase4.0/03-candidate-block-v2.md           Candidate Block v2
docs/phase4.0/04-block-selection-v2.md           Block Selection v2
docs/phase4.0/05b-quality-evidence.md            品質決定音・tune探索
docs/phase4.0/06-analyzer-comparison.md          Analyzer比較と昇格提案
docs/phase4.0/07-capture-preview.md              保存前試聴・Warning UX
docs/phase4.0/08-final-report.md                 最終QA
docs/phase4.0/08-user-verification-checklist.md  実機確認チェックリスト
docs/phase4.0/09-independent-corpus-validation.md 独立コーパス検証
```

JSONレポート14件が同ディレクトリに同梱。いずれもMIDIバイト列・絶対パスを含まない。
