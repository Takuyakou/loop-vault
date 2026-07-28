# Loop Vault Phase 4.5 最終報告

## 1. 結論

**Decision Lock: B. Candidate Generationへ仕切り直し**

D1〜D5はallocation仮説を支持しなかった。したがってrank 2〜3のShadow/Product allocationは実装していない。Phase 4.5は診断完了として閉じ、候補生成不足を別Phaseで扱う。

## 2. PR / commit

| Stage | PR | Commit | 内容 |
|---|---|---|---|
| P4.5-00 | #260 | `1a08c4d` | split監査・評価契約・baseline・Gate固定 |
| P4.5-01 | #261 | `4f29341` | D1 順位別正解率 |
| P4.5-02 | #262 | `2e4fcea` | D2 Candidate Recall Funnel |
| P4.5-03 | #263 | `65e46de` | D3 Top-3 Miss Taxonomy |
| P4.5-04 | #264 | `9c3c5e9` | D4 Same-root Oracle |
| P4.5-05 | #265 | `46e77cd` | D5 Root Confidence Calibration |
| P4.5-06 | #266 | `63be93f` | Decision Lock |
| P4.5-11 | 本PR | 本PRのcommit | 最終報告・最終検証 |

Stackのbaseは一つ前のbranchで、merge順は表の上から下。

## 3. Split監査

- Dev: 40 MIDI / 320 events / 20 scenarios
- Validation: 10 MIDI / 96 events / 5 scenarios
- Holdout: 10 MIDI / 80 events / 5 scenarios
- Phase 4.3のlabel audit自体はDevのみだったが、Phase 4.3 voicing評価でValidation/HoldoutのGold chord labelが参照済み。
- Validation/Holdoutはburned diagnostic-onlyと保守的に分類した。Phase 4.5では再実行しておらず、未使用splitとして昇格判定には使っていない。

## 4. Baseline

| Metric | Dev baseline |
|---|---:|
| canonicalExact@1 | 60.9375% |
| root@1 | 94.6875% |
| top3Canonical | 70.6250% |
| top3Root | 98.1250% |
| MRR | 0.657813 |
| correctCandidateMeanRank | 1.137168 |
| correction cost mean / median / p90 | 0.768750 / 0 / 3 |
| manual input required | 12.5000% |
| root diversity@3 | 2.050000 |
| canonical diversity@3 | 3.000000 |
| duplicate canonical identity | 0 |
| representable | 100.0000% |

## 5. D1 順位分布

- rank 1: 195 / 320（60.9375%）
- rank 2: 31 / 320（9.6875%）
- rank 3: 0 / 320（0%）
- Top-3外: 94 / 320（29.3750%）
- rank 3寄与は固定Gateの1%以下で、D2へ進む条件はPASS。

## 6. D2 Candidate Recall Funnel

| Stage / metric | Result | Gate |
|---|---:|---:|
| raw candidate recall | 78.7500% | >= 90%: FAIL |
| canonical candidate recall | 78.7500% | >= 90%: FAIL |
| eligible candidate recall | 78.7500% | >= 90%: FAIL |
| same-root candidate recall | 78.7500% | >= 90%: FAIL |
| same-root Gold mean rank | 1.373016 | <= 3: PASS |
| global Gold mean rank | 1.968254 | diagnostic |
| displayed Top-3 canonical | 70.6250% | baseline一致 |

最初の脱落はraw generationが68件、allocated Top-3が26件。canonical dedup、eligibility、same-root poolそのものによる追加脱落は0件だった。

## 7. D3 Miss Taxonomy

Primary分類はTop-3 miss 94件と完全一致した。

- candidate-not-generated: 68件
- same-root-ranked-too-low: 12件
- alternative-root-allocation-loss: 14件
- ambiguous: 0件
- annotation-contract-issue: 0件
- その他primary分類: 0件

Allocationで編集可能なmissは26/94件（27.6596%）で、固定Gate 50%に未達。raw generation不足68件の内訳はA7b9 40、Dm7 6、G7sus4 6、Am9 6、Dm9 4、Em7 2、G13 2、Cmaj9 2。secondary差分はroot 17、quality family 12、seventh 30、tension under 53、tension over 25、slash bass 30。

## 8. D4 Same-root Oracle

Oracle AはGoldをallocationに使わず、rank 1を固定し、slot 2〜3だけを現在rank 1と同rootのraw上位候補に置換した。

| Metric | Current | Oracle | Delta |
|---|---:|---:|---:|
| top3Canonical | 70.6250% | 73.1250% | +2.5000pp |
| top3Root | 98.1250% | 94.6875% | -3.4375pp |
| MRR | 0.657813 | 0.666146 | +0.008333 |
| correction mean | 0.768750 | 0.768750 | 0 |
| manual input | 12.5000% | 12.5000% | 0 |

- gained canonical rescue: 8
- lost root rescue: 11
- net rescue: -3
- lost/gained ratio: 137.5%
- rank 1 changes: 0

Gain +3pp、net rescue > 0、lost/gained <= 25%、correction mean改善の全てでFAIL。Oracle Bは、D3で単一のallocation編集可能familyが確立しなかったため未実行。

## 9. D5 Root Confidence Calibration

各eventについてroot別best raw score、Top1/2 score、raw margin、normalized margin、root entropy、candidate/note count、quality coverageを記録した。raw marginは直接thresholdに使っていない。

固定grid:

- normalized margin: 0 / .02 / .04 / .06 / .08 / .10 / .15 / .20
- root entropy: .5 / .75 / 1 / 1.25 / 1.5 / 1.75 / 2 / 2.25

Accuracy >= 98%、Wilson下限 >= 95%、48 events以上を満たす帯は最大91 eventsだったが、その帯のcanonical gainは0でloss/gain Gateを評価可能な形で満たさなかった。**全Gateを満たすhigh-confidence allocation帯は存在しない。**

## 10. Decision Lockと停止工程

Decision Bの直接根拠:

1. upstream candidate recallが78.75%で90%未達。
2. allocation編集可能missが27.66%で50%未達。
3. Oracle gainは+2.5ppで目標未達。
4. Oracleのnet rescueは-3、root救済損失がgainを上回る。
5. high-confidence allocation帯が成立しない。
6. ambiguous/annotation中心ではないため、研究停止Cではなくgeneration不足B。

未実行:

- P4.5-07 Allocation Shadow
- P4.5-08 Dev / LOSO
- P4.5-09 Validation
- P4.5-10 Holdout
- rank 2〜3 Product allocation

## 11. Product Track

- Label Correction Log: **未実装**。Core診断と独立したProduct Trackであり、Decision B到達後に混在させなかった。
- Fast Label Entry: **未実装**。同上。
- Ambiguity Reasons: **未実装**。同上。

## 12. 不変条件

- `defaultAnalyzerMode = "phase4-v1"`を維持。
- rank 1 raw label / canonical / root / bass / score変更なし。
- Product Top-3 allocation変更なし。
- Analyzer / Timeline / voicing / boundary / aggregate / fallback変更なし。
- Vault schema変更なし。
- `fileVersion = 1`を維持。
- chord label以外の製品挙動変更なし。
- Validation/Holdout再利用なし。
- Git管理下MIDI 0件、`.local-evaluation`追跡0件。

D2で追加した`diagnoseLegacyWindowCandidates()`は評価専用で、clamp前raw候補を監査へ露出する。Product analysis結果、永続化schema、UIには接続していない。

## 13. Rollback

製品allocationを変更していないためfeature rollbackは不要。Phase 4.5診断を撤回する場合は、P4.5-00〜11のstackをmergeしないことで完全に隔離できる。診断API・CLI・artifactはProduct実行経路から未参照。

## 14. 次の研究対象

別PhaseのCandidate Generationで次を扱う。

1. A7b9など、現在template集合が生成しないaltered tension候補。
2. rootは一致するがslash bass canonical identityだけが生成されるケース。
3. G7sus4、Am9、Dm9、G13などのraw canonical欠落。
4. 生成recall改善後にD1〜D5を新しい未使用Gold splitで再実行。

Phase 4.5の固定Goldやburned splitでthresholdを再調整しない。

## 15. 最終検証

- `npm run lint`: PASS
- `npx tsc --noEmit`: PASS
- `npm test -- --run`: 207 files / 1687 tests PASS
- `cargo test`: 24 tests PASS
- `npm run build`: PASS
- `npm run tauri build`: PASS
- `git diff --check`: PASS
- `npm run check:staged`: PASS
- `git ls-files "*.mid" "*.midi"`: 0 files
- `git ls-files .local-evaluation`: 0 files

生成物:

- `D:\dev\Loop Vault\src-tauri\target\release\loop-vault.exe`
- `D:\dev\Loop Vault\src-tauri\target\release\bundle\msi\Loop Vault_0.1.0_x64_en-US.msi`
- `D:\dev\Loop Vault\src-tauri\target\release\bundle\nsis\Loop Vault_0.1.0_x64-setup.exe`

既知の警告はViteの500 kB超chunk警告のみ。テスト・型・build失敗はない。
