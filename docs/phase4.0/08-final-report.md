# Loop Vault Phase 4.0 最終報告書

- 作成日: 2026-07-25
- 対象: MIDI Detection Engine v2

## 1. 完了状態

```text
自動検証:              完了
100 MIDI評価:          完了
実MIDI聴感確認:        未実施
defaultAnalyzerMode:   phase4-v1（人間承認を得て変更）
Phase 4.0:             暫定完了
```

実機での聴感確認は行っていない。計画書§14.5に従い「完全完了」とは書かない。

## 2. 各Stageの結果

| Stage | 内容 | PR |
|---|---|---|
| P4.0-00 | 現状監査・baseline固定 | #157 |
| P4.0-01 | コードラベル契約・製品バグ修正 | #158 |
| P4.0-02 | 評価指標v2・Gate策定 | #159 |
| P4.0-03 | Candidate Block v2 | #160 |
| P4.0-04 | Block Selection v2 | #161 |
| P4.0-05B/D | 品質決定音の証拠・tune探索 | #162 |
| P4.0-06 | 製品既定の変更 | #163 |
| P4.0-07/08 | 保存前試聴・最終QA | 本PR |

**05A（Upper Structure Slash候補生成）と05C（Reranker A/B接続）は実装していない。** 05Aは、P4.0-00の監査で `Eadd9/F#` / `Dadd9/E` が既に第1代替として存在すると判明し、05Bの減点だけで主候補が入れ替わったため不要になった。

## 3. 主要な成果

### 3.1 測れない状態を終わらせた

Phase 4.0開始時、Analyzerの比較に使われていた `Surface Exact 13.69%` は**表記互換性を含む指標**で、理論上限が32.22%しかなかった。

| | Surface (v1) | Canonical (v2) |
|---|---:|---:|
| Exact | 13.69% | **25.92%** |

**「不一致」の約半分は検出の誤りではなく表記の違いだった。** 5フェーズにわたりこの数字でAnalyzerを比較していた。

### 3.2 製品バグ2件

- `C6/9` — 検出器が出力するラベルを自アプリのパーサが読めず、Chord Inspectorで無効扱いになっていた（コーパス上130拍）
- `A13sus` → `Asus413` — テンションを括弧なしで連結し不正表記を生成していた

expectedParseCoverage は 49.53% → **100%**、identity round-trip も **100%**。

### 3.3 Candidateの情報欠落

| 現象 | 修正前 | 修正後 |
|---|---:|---:|
| 2つ目のコードを失った小節 | **398** | 0 |
| 持続中なのに `N.C.` と表示した小節 | **46** | 0 |
| dedupで構造の違う候補が衝突 | 18 (1.82%) | 0 |

コーパス100件中**86件**が影響を受けていた。

### 3.4 低密度ブロックの救済

| density class | recall |
|---|---:|
| vamp | **100.0%** |
| compact | 98.9% |
| standard | 100.0% |
| dense | 96.0% |

候補スコアから「異なるコードが多いほど加点」を取り除いた。

### 3.5 検出精度（duration-weighted / full）

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

既存reranker2種は top3Root を8pp以上犠牲にしていた。**phase4-v1は逆に5.50pp改善している。**

### 3.6 保存前後の音が一致するようになった

元MIDIのvoicing抽出が保存時にしか走っておらず、試聴と保存後で響きが違っていた。抽出を1関数へ集約し、両経路が同じ音になるようにした。

## 4. 最終検証

| 検証 | 結果 |
|---|---|
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm test -- --run` | 155ファイル / **1143件中1142 PASS** |
| `cargo test` | **24件 PASS** |
| `npm run build` | PASS |
| `npm run tauri build` | PASS |
| `npm run eval:midi:datasets` | legacy surface指標が期首と一致 |
| `npm run benchmark:midi` | 下記 |
| `git diff --check` | PASS |

失敗1件は `ProgressionDetailView.test.tsx` で、**Phase 4.0開始前からmasterに存在した既存failure**。Phase 3.9.3で表示ラベルが「仮クリア」→「別日確認」に変わった際にテストが追従していないもので、Phase 4.0の変更とは無関係。別タスクとして起票済み。

### 4.1 Runtime

| Analyzer | Phase 4.0開始時 | 現在 |
|---|---:|---:|
| Legacy | 49.4 ms | 80.1 ms |
| Legacy-boundary rerank | 175.1 ms | **107.5 ms** |
| Voice-aware rerank | 169.8 ms | **108.4 ms** |
| Hybrid | 1429.8 ms | 1570.0 ms |

Legacyは2小節窓の追加分だけ遅い。rerankerはブロックモデル統一により**開始時より速くなった**。100件コーパスでのphase4-v1は約860 msで、Gate上限3000 msの3分の1以下。

### 4.2 生成物

| 種類 | サイズ |
|---|---:|
| `src-tauri/target/release/loop-vault.exe` | 14,739,456 bytes |
| `Loop Vault_0.1.0_x64_en-US.msi` | 5,062,656 bytes |
| `Loop Vault_0.1.0_x64-setup.exe` | 3,551,166 bytes |

## 5. 互換性

- `fileVersion = 1` 変更なし
- 保存schema変更なし
- 旧data.jsonをそのまま読める
- **保存済み進行を自動再解析しない**
- 旧warning文字列・旧ラベル（`Asus413` 等）を読める
- 読み込み時の一括書換なし
- Candidateは非永続のまま
- Live MIDI / Chord Dojo / LLM / Progression Advisor は変更していない

## 6. Rollback

`src/domain/midi/analysis.ts` の1行を戻すだけでlegacyへ復帰する。

```ts
export const defaultAnalyzerMode = "legacy" as const;
export const analyzerVersion = legacyAnalyzerVersion;
```

旧modeは1つも削除していない。data migrationは発生しない。

## 7. 未実施・既知の制約

1. **実MIDIでの聴感確認が未実施。** 既定Analyzerが変わったため、3rdを欠くvoicingでは主コードの表示が変わる
2. Voicing source chip（`元MIDI` / `自動` の表示切替）は未実装。`resolveVoicingForUse` は `origin` を返すのでUIから判別は可能
3. repeat cycle / event-boundary / loop-return generator は未実装（P4.0-04）
4. warning calibration（`warningPrecision` / `warningRecall`）は未計測
5. `presenceThreshold` はこのコーパスでは無効なパラメータ（0.01/0.02/0.03で結果が同一）
6. 検出器の語彙外（`dom13sus` / `maj13` / 変化音付き）がコーパスの30.60%を占め、canonicalExactの上限は69.40%
7. Viteはminify後チャンク約1.1 MBに対し500 kB超過警告を出す。buildは成功する

## 8. Phase 4.0で追加した診断コマンド

```bash
npm run eval:midi:label-reachability
npx vite-node scripts/evaluate-metrics-v2.ts --output <name>
npx vite-node scripts/check-promotion-gate.ts --output <name>
npx vite-node scripts/evaluate-block-recall.ts --output <name>
npx vite-node scripts/evaluate-density-recall.ts --output <name>
npx vite-node scripts/evaluate-dedup-collisions.ts --output <name>
npx vite-node scripts/diagnose-block-score.ts --output <name>
npx vite-node scripts/tune-quality-evidence.ts --output <name>
npx vite-node scripts/build-corpus-split.ts
```

Stage成果物は凍結スナップショットとして扱うため、すべて `--output` で出力先を明示する。既定名のファイルはgitignoreしている。
