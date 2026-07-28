# Phase 4.8 Final Report

## 1. Decision

**Non-Promotion**

Existing Devで事前登録したE1/E2/E3を比較した結果、全案がHard Gateを満たさなかった。指示書の停止規則に従い、新Gold Corpus、New Dev、Validation、Holdout、Product接続は実行していない。

主因は次のとおり。

- E1はtarget recall 80%・32/40救済・false generation 0.71%を満たしたが、runtime相対値が23.23%で上限10%を超過した。
- E2はtarget recall 60%、false generation 47.50%、平均追加候補0.9125で不合格だった。
- E3はtarget recall 57.50%、false generation 41.43%、平均追加候補0.79375で不合格だった。

## 2. PR / Commit

| Stage | Branch | Commit | PR | Status |
|---|---|---|---|---|
| P4.8-00 | `docs/p48-00-contract-baseline` | `870c24d` | #284 | Canonical契約・baseline |
| P4.8-01 | `eval/p48-01-a7b9-trace` | `a881f83` | #285 | Existing Dev trace |
| P4.8-02 | `feature/p48-02-shadow-generators` | `c93a9f7`, `911f4f8` | #286 | E1/E2/E3 Shadow |
| P4.8-03 | `eval/p48-03-dev-selection-lock` | `dede3db` | #287 | Dev Gate・Non-Promotion |
| P4.8-04〜08 | - | - | - | Gate停止により意図的に未実行 |
| P4.8-09 | `docs/p48-09-final-decision` | `f9cbd96` | #288 | 最終判断 |

## 3. Repository Audit / Intervention Lock

- Product templateは `src/domain/midi/legacy.ts` にあり、altered `b9` templateは存在しない。
- `ChordSymbol`とfactorized identityは`major + minor7 + b9`を既に表現できる。
- 変更対象は評価専用Candidate Generationだけに固定した。
- root score、quality score、tension score、confidence、tie-break、Top-3 allocation、Analyzer、Timeline、voicing、schemaは変更していない。
- Shadowは `scripts/phase48` に閉じ、Product、UI、Vaultから参照されない。

## 4. Canonical 7(b9) Contract

- canonical identity: `root + major triad + minor seventh + b9 + bass`
- aliases: `7b9` / `7(b9)` / `7♭9`
- canonical display: `7(b9)`
- complete core: root / M3 / P5 / m7
- P5 omit: root / M3 / m7。E2/E3のShadow subgroupとしてのみ許可
- root / M3 / m7欠落時: 生成禁止
- 12キーround-trip: PASS
- root position bassは省略し、非root bassはslash identityとして保持

## 5. Baseline

Existing Devは40ファイル・320イベント、A7(b9)は40イベント。

| Item | Baseline |
|---|---|
| raw candidate count | 80,640 |
| A7(b9) raw recall | 0/40 |
| A7(b9) Product Top-3 | 0/40 |
| Product median runtime | 204.018 ms / 40 files |
| rank 1 hash | `4b3fb71a7a4d93f93b6222ee3efcd066e47c91fa8fcd74f4d452a2b5dc4397bd` |
| Top-3 hash | `77883343d72c4be5277103f179391ec5f112e1cd561d4a7400728df28eff47d7` |
| candidate set hash | `e30d51ec2cc432689463237be1f6a65ca635c0bd36c9c0684ca5dbff6f317f85` |
| Analyzer hash | `c841bf9fc416a13ad7dec935fb8bd740d347a7920dec580684b0c06d073951d7` |

## 6. Existing A7(b9) Trace

| Item | Result |
|---|---:|
| clean / stress | 20 / 20 |
| root hypothesis present | 40 / 40 |
| complete dom7 core | 38 / 40 |
| observed b9 note | 38 / 40 |
| note-instance provenance complete | 40 / 40 |
| first missing stage: `alteration-generation-missing` | 40 / 40 |
| evidence class: strong / incidental | 34 / 6 |
| E1 / E2 / E3 eligible | 34 / 25 / 24 |

P5 omitでb9自体が観測されない2件、短いまたはcoreと非重複のb9を持つ4件を、完全coreと同じ扱いにはしていない。

## 7. Shadow Generator

候補契約:

- 既存dom7 coreと観測b9だけから生成
- rootごとに最大1候補、eventごとに最大2候補
- canonical duplicate 0
- core note / b9 noteの`noteInstanceId`を完全保持
- E1/E2/E3を独立実装し、結果に基づく混合なし
- b9以外のalteration生成なし
- 同一入力はbyte-deterministic

| Variant | Applicable | Rescue | Still missing | Non-target generated | Candidate count |
|---|---:|---:|---:|---:|---:|
| E1 | 36 / 320 | 32 / 40 | 8 | 2 / 280 | 38 |
| E2 | 166 / 320 | 24 / 40 | 16 | 133 / 280 | 292 |
| E3 | 147 / 320 | 23 / 40 | 17 | 116 / 280 | 254 |

全variantでduplicate 0、provenance miss 0、最大追加2/event。

## 8. Existing Dev Gate

| Metric | E1 | E2 | E3 |
|---|---:|---:|---:|
| target7b9Recall | 80.00% | 60.00% | 57.50% |
| generated rescue | 32 | 24 | 23 |
| negative false generation | 0.71% | 47.50% | 41.43% |
| average added / event | 0.11875 | 0.91250 | 0.79375 |
| maximum added / event | 2 | 2 | 2 |
| runtime relative | 23.23% | 23.62% | 25.35% |
| runtime absolute / file | 1.1496 ms | 1.1689 ms | 1.2545 ms |
| deterministic | 100% | 100% | 100% |
| Gate | **FAIL** | **FAIL** | **FAIL** |

runtimeはJIT warm-up後9回のmedian。Productは197.936 ms / 40 files、E1 Shadowは45.986 ms / 40 filesだった。絶対10ms/fileは満たすが、相対10%を満たさない。

E1の評価rows serialized sizeは160,147 bytes。heap常駐化は行っておらず、Shadow結果は評価処理内だけで破棄される。

## 9. Counterfactual Risk

既存raw scoreを保持し、Productのscore降順・label tie-breakを変えずに仮想挿入した。

| Metric | E1 |
|---|---:|
| rank 1 changed / improved / regressed / neutral | 0 / 0 / 0 / 0 |
| root changed | 0 |
| plain 7 stolen | 0 |
| Top-3 canonical before / after | 73.125% / 81.250% |
| Top-3 root before / after | 96.250% / 96.250% |
| MRR before / after | 0.674845 / 0.716021 |

Counterfactual改善は確認できるが、runtime Hard Gateを免除する根拠には使用していない。

## 10. Product Invariants

- Product Analyzer hash before / after: 完全一致
- Product rank 1 / Top-3 / score / confidence: 不変
- Analyzer / Timeline / voicing / boundary / aggregate / fallback: 不変
- `defaultAnalyzerMode = "phase4-v1"`
- `fileVersion = 1`
- Vault schema: 不変
- feature flag: 未実装
- Product接続: なし
- rollback: Product変更がないため不要。Shadow commitsを外せば完全にbaselineへ戻る

## 11. Skipped Stages

| Stage | Status | Reason |
|---|---|---|
| New Gold Corpus integrity | NOT RUN | Existing Dev全案FAIL |
| New Dev | NOT RUN | Corpus未構築 |
| Validation | NOT RUN | Existing Dev Gate停止 |
| Holdout | NOT RUN | Validation未到達 |
| Product connection | NOT RUN | Promotion条件未成立 |

これは欠測ではなく、Validation/Holdoutの再利用とGate緩和を防ぐための規定どおりの停止である。

## 12. Gate Table

| Gate | Status | Evidence |
|---|---|---|
| G1 canonical contract | PASS | P4.8-00 |
| G2 12-key round-trip | PASS | canonical unit test |
| G3 dom7 core + observed b9 only | PASS | Shadow contract/tests |
| G4 no root hardcode | PASS | 12-key loop |
| G5 no tension powerset | PASS | fixed `["b9"]` |
| G6 Product rank 1 unchanged | PASS | hash/counterfactual |
| G7 Product Top-3 unchanged | PASS | Product未接続 |
| G8 Product score/confidence unchanged | PASS | Intervention Lock |
| G9 Dev target recall >=80% | PASS for E1 | 32/40 |
| G10 Validation/Holdout >=75% | NOT RUN | Gate停止 |
| G11 false generation <=5% | PASS for E1 | 2/280 |
| G12 Inertness 100% | PASS | Product hash一致 |
| G13 counterfactual regression 0 | PASS | 0 |
| G14 plain 7 stolen 0 | PASS | 0 |
| G15 root changed 0 | PASS | 0 |
| G16 duplicate 0 | PASS | 0 |
| G17 provenance 100% | PASS | 100% |
| G18 max added <=2 | PASS | 2 |
| G19 runtime relative <=10% | **FAIL** | E1 23.23% |
| G20 runtime absolute <=10ms | PASS | E1 1.1496ms/file |
| G21 deterministic 100% | PASS | 3 hashes一致 |
| G22 Analyzer/Timeline/voicing unchanged | PASS | Product未変更 |
| G23 boundary/aggregate/fallback unchanged | PASS | Product未変更 |
| G24 fileVersion 1 | PASS | schema literal |
| G25 default phase4-v1 | PASS | analysis constant |
| G26 private MIDI tracked 0 | PASS | final `git ls-files` |
| G27 Validation/Holdout once | PASS | 0回 |
| G28 full verification | PASS | lint/typecheck/tests/cargo/build/Tauri |
| G29 feature flag rollback | N/A | Product未接続 |
| G30 no other alteration | PASS | fixed b9 test |

## 13. Final Scope

残すもの:

- Canonical 7(b9)契約
- 40件のnote-instance trace
- E1/E2/E3 Shadow generator
- Existing Dev Gate evaluator
- Non-Promotion判断と再現可能な評価artifact

残さないもの:

- Product候補
- UI表示
- Vault永続化
- feature flag
- New Gold / Validation / Holdoutの結果

次の`#9`、`b13`、`#11`、`13(b9)` familyへ自動拡張しない。各familyは別Phaseで事前契約・独立Gateを設定する。
