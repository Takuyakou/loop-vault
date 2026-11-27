# Loop Vault Phase 4.1 — P4.1-07 最終検証と昇格

- 作成日: 2026-07-25
- `defaultAnalyzerMode`: `phase4-v1` → **`phase4.1-v1`**

## 1. 判定

**PASS。** 凍結Gateの全項目を満たし、コード検出コーパスは1件も動かなかった。

## 2. 構成比較（SURAN remix）

| 構成 | 候補 | 被覆 | sectionRecall | 最長未被覆 | 33–46 | Occurrence保持 | runtime | 決定性 |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| phase4.0-ranking | 10 | 28.57% | 55.00% | 16 | 0 | 0 | 163 ms | OK |
| coverage | 10 | **97.96%** | 100.00% | 1 | 14 | 374 | 259 ms | OK |
| **coverage+extraction** | 10 | **96.94%** | **100.00%** | **1** | **14** | **374** | **176 ms** | OK |

`coverage` 単体の方が被覆が1.02pp高いが、extraction profile はAI抽出MIDIのrole推定を正す。誤発動0件・非対象コーパス±0という採用条件を満たすため両方を有効にした。

## 3. 凍結Gate

| Gate | 基準 | 実測 | 判定 |
|---|---:|---:|---|
| selectedCoverageAtAllVisible | ≥ 90% | **96.94%** | PASS |
| sectionRecallAtAllVisible | = 100% | **100.00%** | PASS |
| longestUncoveredHarmonicRun | < 8 | **1** | PASS |
| 33–46帯の被覆 | ≥ 1小節 | **14小節** | PASS |

**Gateは一度も変更していない。**

## 4. コード検出の非回帰

| 項目 | 結果 |
|---|---|
| Chord Drip 100件のtimeline一致 | **100 / 100** |
| extraction profile 誤発動 | **0件** |
| Root / Quality / Exact / Corrections | 57.76% / 60.29% / 13.69% / 918（不変） |

Phase 4.1 は**コード検出を一切変えていない**。変えたのは候補リストの作り方だけである。

## 5. 採用しなかったもの

**section-aware selection。** P4.1-04で実測した結果、coverage-only と被覆・sectionRecall が同値で候補数だけ増えた。coverage-only が既に sectionRecall 100% に達しており改善余地がない。実装は残すが既定では使わない。

## 6. 最終検証

| 検証 | 結果 |
|---|---|
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm test -- --run` | **1215件 全PASS** |
| `cargo test` | 24件 PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS |

## 7. Rollback

`src/domain/midi/analysis.ts` の2行で戻る。

```ts
export const defaultAnalyzerMode = phase40DefaultAnalyzerMode;
export const analyzerVersion = phase4AnalyzerVersion;
```

`phase40DefaultAnalyzerMode` を rollback 用定数として残してある。旧モードは1つも削除していない。`fileVersion = 1` 不変、保存schema不変、data migration なし。

## 8. 聴感確認

```text
automated-validation: complete
human-audition: deferred
release-blocking: false
reason: subjective auditory assessment cannot be fully automated
```

自動昇格は止めない。主観評価を「自動PASS」とは書かない。

## 9. 既知の制約

1. ミニマップ上の全Occurrence表示とセクションレーンは未実装（Occurrenceへの到達手段を優先）
2. セクション境界の precision は 82.6%。選定へは接続していないため候補には影響しない
3. `coverage` 単体より 1.02pp 被覆が低い構成を選んでいる（extraction profile の副作用）
4. Gateの分母となるセクション定義は P4.1-00 の暫定版（4小節chroma新規性）を凍結して使用
5. SURAN remix 1曲での検証。長尺・生演奏・他のAI抽出MIDIでの確認は未実施
