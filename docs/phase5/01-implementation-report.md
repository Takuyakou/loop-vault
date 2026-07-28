# Loop Vault Phase 5 Accuracy First 作業報告

## 1. 結論

Phase 5の未完了Task 1〜5を実装・評価し、すべての必須検証を通過した。
Primary Analyzerは引き続き `phase4-v1` とし、精度改善はR1、R2、E1、
Candidate Unionを個別にロールバックできる形で接続した。

- Stable: R1 ON / R2 OFF / E1 ON / Candidate Union OFF
- Accuracy First: R1 ON / R2 ON / E1 ON / Candidate Union ON
- Hybrid: 約3分MIDIの10秒Gateは通過したが、Corpus横断で修正コストを下げなかったため不採用
- Vault schema / `fileVersion` / 保存済み進行 / Voicing Memory / practice progress: 変更なし
- Live MIDI / Chord Dojoの低遅延経路: 変更なし、ベンチマークPASS

詳細な精度値は `docs/phase5/00-accuracy-first-evaluation.md`、Hybrid再評価は
`docs/phase5/02-hybrid-runtime-reassessment.md` を正とする。

## 2. PR / Commit

Phase 5は依存順のstacked PRとして分離した。各PRはmerge commitで順番に取り込む。

| PR | Branch | Commit | 内容 |
|---|---|---|---|
| #289 | `feature/p5-01-correction-log-verify` | `e635c3f` | 保存時のCorrection Log経路 |
| #290 | `feature/p5-02-accuracy-first-flags` | `f15ab8b` | R1 / R2の精度優先flag |
| #291 | `feature/p5-03-capture-speed-ui` | `be06b50` | 解析進捗とFast Label Entry |
| #292 | `eval/p5-04-accuracy-first-report` | `56a8c10` | 全Analyzer精度評価 |
| #293 | `fix/p5-e1-product-connection` | `d135367` | E1 7(b9) Product接続 |
| #294 | `eval/p5-hybrid-runtime-reassessment` | `40643a8` | Hybrid約3分MIDI再評価 |
| #295 | `feature/p5-accuracy-candidate-union` | `6c3a244` | Hybrid非依存Candidate Union |
| #296 | `fix/p5-analysis-profile-flags` | `31bf60c` | Stable / Accuracy First統一 |
| #297 | `test/p5-correction-log-integration` | `536b3fb` | Correction Log実書込統合検証 |

## 3. E1 7(b9)

`src/domain/midi/observedFlatNineCandidate.ts` をProductのPhase 4解析経路へ接続した。
既存のdominant seventh coreと、同一event内で十分に重なるobserved b9だけを使う。

- 12キー共通
- E2 / E3は未接続
- feature flag: `enableObservedFlatNineDominantCandidate`
- Stable / Accuracy Firstとも既定ON
- 既存rank 1、score、confidence、root、tie-break、先頭Top-3は不変
- 7(b9) rescue: 32/40
- false generation: 0.71%
- rank 1 regression / root change / plain 7 stolen / duplicate: 0
- provenance: 100%

## 4. R1 / R2

R1 plain/slash companionは両ProfileでON。既存winnerを置換せず、補助候補だけを追加する。

R2はConservative A1（`minimumSupportBeats=0.2`）だけを使い、StableではOFF、
Accuracy FirstではONとした。A1-primeは使用していない。

| Split | Exact before | Exact R2 | F1 before | F1 R2 |
|---|---:|---:|---:|---:|
| dev | 18.13% | 32.50% | 84.06% | 86.49% |
| validation | 25.00% | 45.83% | 79.37% | 81.52% |
| holdout | 62.50% | 66.67% | 95.85% | 96.30% |

## 5. Hybrid再評価

150〜220秒を一般的な約3分MIDIとして17 sampleを分離計測した。

- median: 7,125.4ms
- p95: 9,480.6ms
- max: 9,480.6ms
- 約3分10秒Gate: PASS
- peak observed RSS: 1,145.4MB（長尺Endlessを含む全体最大は1,169.0MB）
- 継続的なメモリ増加: 未検出
- UI: 同期解析中のmain thread blockはruntimeと同値。解析前の進捗表示は描画される

HybridはPhase 4.5 / Phase 4.7で修正コストを改善した一方、Chord Drip /
Chapter 3で悪化した。改善2 Corpus、悪化2 Corpusで、Corpus横断の修正負担を
下げる採用条件を満たさないため、両ProfileともPrimaryは `phase4-v1` を維持した。

## 6. Candidate Union

補完性と絶対runtimeから `legacy-boundary-rerank` と
`voice-aware-rerank-v1` を採用した。HybridはProduct Unionへ含めていない。

- feature flag: `enableAccuracyCandidateUnion`
- Primaryのrank 1と既存Top-3を固定
- canonical identityでdedup
- deterministic order
- Candidate Catalog最大32件、内部hard cap 64件/event
- UIの先頭5候補は維持し、追加候補を折りたたみ表示
- Fast Label Entry / Manual Rescueから選択可能

| Corpus | Baseline catalog recall | Union recall | Rescue | Manual input | Duplicate |
|---|---:|---:|---:|---:|---:|
| Chord Drip | 46.50% | 51.32% | 69 | 32.89% | 0 |
| Chapter 3 | 99.25% | 99.25% | 1 | 0.75% | 0 |
| Phase 4.5 | 91.56% | 95.31% | 17 | 1.88% | 0 |
| Phase 4.7 | 8.68% | 13.19% | 13 | 0.00% | 0 |

全4 Corpusでrank 1、Top-3 canonical、Top-3 rootは変更なし。

## 7. Correction Log

fixture MIDIを実際に生成して解析し、Progression保存eventをJSONLへ追加する
integration testを追加した。schema validation、export、clear、opt-out、
不正event拒否、ログ失敗時のVault保存成功まで自動検証する。

ログへMIDI bytes、曲名、絶対パス、元ファイル名、Idea title、memo、
個人識別情報を保存せず、外部送信もしない。設定画面から有効化、export、
clearが可能。

## 8. 性能と回帰

Phase 5 Product構成（Phase 4 + R1 + E1 + Union）の実MIDI解析:

| Alias | 長さ | Runtime | Deterministic |
|---|---:|---:|---|
| all-instruments | 208.0s | 665.5ms | PASS |
| captured-chorus | 16.6s | 42.4ms | PASS |
| SURAN | 208.7s | 609.4ms | PASS |
| Endless | 295.7s | 880.1ms | PASS |

40-file Phase 4.5 batchは1,367.6ms。全評価Corpusでdeterministicを維持した。

Live MIDI benchmark:

- notes / Bass: p50 2ms / p90 2ms
- provisional chord: p50 27ms / p90 39ms
- confirmed chord: p50 52ms / p90 52ms
- full release: p50 182ms / p90 182ms

Chord Dojo `matchPerformance` 50,000 operations:

- p50 0.0005ms/op
- p95 0.0007ms/op
- max 0.0033ms/op

## 9. 最終検証

- ESLint / Tailwind class lint: PASS
- TypeScript `tsc --noEmit`: PASS
- Vitest: 224 files / 1,755 tests PASS
- Rust `cargo test`: 24 tests PASS
- Web production build: PASS
- Tauri production build: PASS
- `git diff --check`: PASS
- `npm run check:staged`: PASS
- tracked MIDI: 0
- tracked `.local-evaluation`: 0
- `defaultAnalyzerMode`: `phase4-v1`
- `fileVersion`: 1

Web buildには既存の1.2MB級chunk警告が残るが、build失敗ではない。

## 10. Build成果物

- `D:\dev\Loop Vault\src-tauri\target\release\loop-vault.exe`
- `D:\dev\Loop Vault\src-tauri\target\release\bundle\msi\Loop Vault_0.1.0_x64_en-US.msi`
- `D:\dev\Loop Vault\src-tauri\target\release\bundle\nsis\Loop Vault_0.1.0_x64-setup.exe`

## 11. Rollback

設定画面でStableへ切り替えるとR2とCandidate Unionが無効になる。
R1、R2、E1、Candidate Unionは、そのProfileで既定ONの機能を個別にOFFへ戻せる。
設定はVault外のlocal app settings
（localStorage key `loopvault.accuracyFirstFeatures`）に保存されるため、
Vaultデータや保存済み進行を書き換えない。

## 12. 未完了

コード、評価、テスト、buildとしてのPhase 5未完了項目はない。
採用基準に含まれる「本人の曲で2週間使い、違和感が減ったか」は自動評価できないため、
製品利用後のユーザー確認だけが残る。
