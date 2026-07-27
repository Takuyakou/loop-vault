# Loop Vault Phase 4.3 Final Report

Phase 4.3は製品の検出器やボイシング抽出器を改善するPhaseではなく、
測定契約、baseline、ablation、failure taxonomyを完成させるPhaseとして完了した。

## 1. PR一覧

| Stage | PR | Base |
|---|---|---|
| P4.3-00 | [#225](https://github.com/Takuyakou/loop-vault/pull/225) | master |
| P4.3-01 | [#226](https://github.com/Takuyakou/loop-vault/pull/226) | P4.3-00 |
| P4.3-02 | [#227](https://github.com/Takuyakou/loop-vault/pull/227) | P4.3-01 |
| P4.3-03 | [#228](https://github.com/Takuyakou/loop-vault/pull/228) | P4.3-02 |
| P4.3-04 | [#229](https://github.com/Takuyakou/loop-vault/pull/229) | P4.3-03 |
| P4.3-05 | [#230](https://github.com/Takuyakou/loop-vault/pull/230) | P4.3-04 |
| P4.3-06 | [#231](https://github.com/Takuyakou/loop-vault/pull/231) | P4.3-05 |
| P4.3-07 | [#232](https://github.com/Takuyakou/loop-vault/pull/232) | P4.3-06 |
| P4.3-08 | [#233](https://github.com/Takuyakou/loop-vault/pull/233) | P4.3-07 |
| P4.3-09 | [#234](https://github.com/Takuyakou/loop-vault/pull/234) | P4.3-08 |

## 2. Commit一覧

| Stage | Commit |
|---|---|
| P4.3-00 | `eac139b` |
| P4.3-01 | `476299f` |
| P4.3-02 | `f2d109f` |
| P4.3-03 | `d8a1d67` |
| P4.3-04 | `039291d` |
| P4.3-05 | `1481479` |
| P4.3-06 | `bf4edb2` |
| P4.3-07 | `8c357d0` |
| P4.3-08 | `966fa9d` |
| P4.3-09-01 | `9352b62` |
| P4.3-09-02 | この最終報告書を追加するcommit |

開始基準は `f9e214730de96f86e274ce92768b04a5c473fa94`。

## 3. Stage F Decision Lock

F1 shadowは診断専用。F2系、F3a、F5aは非昇格、F4 Primary routingは禁止。
`defaultAnalyzerMode = phase4-v1`を維持し、factorized evidenceを製品Primaryへ
接続していない。

## 4-8. Label Alternatives Baseline

dev 40 MIDI / 320 events:

| 指標 | 結果 |
|---|---:|
| representableRate | 100.00% |
| canonicalExact@1 | 60.94% |
| root@1 | 94.69% |
| top3Canonical | 70.63% |
| top3Root | 98.13% |
| correctCandidateMeanRank | 1.137 |
| MRR | 0.658 |
| rootDiversityAt3 | 2.05 |
| canonicalDiversityAt3 | 3.00 |
| duplicate identity | 0 |
| correction cost mean / median / p90 | 0.769 / 0 / 3 |
| manual input required | 12.50% |

unsupported familyは全分類0。Top-3 missは表現不能ではなく候補採点・順位側。

## 9. Voicing Pipeline

```text
raw MIDI
→ sustain / Voice / role
→ event span
→ simultaneous（優先）/ aggregate（fallback）
→ score / coverage
→ sourceVoicing
→ chord compatibility
→ source auto / review / generated fallback
→ Capture Preview / Save / Chord Dojo
```

Source-faithful、Aggregate-harmony、Dojo-integratedを別Goldとして採点した。

## 10-11. Corpus整合性

- 60 MIDI / 30 scenario / 496 Gold events
- 6382 note instances
- SHA-256 / byteLength: 60/60一致
- clean/stress pair: 30/30
- dev / validation / holdout: 40 / 10 / 10 MIDI
- events: 320 / 96 / 80
- Gold policy 3種: 496/496完備

## 12-14. Oracle A Baseline

dev、Gold boundary / Gold role:

| 指標 | Source-faithful | Aggregate | Dojo |
|---|---:|---:|---:|
| exact | 86.25% | 84.38% | 86.25% |
| precision | 97.97% | 98.20% | 97.97% |
| recall | 96.45% | 96.13% | 96.45% |
| F1 | 97.20% | 97.15% | 97.20% |
| extra / missing | 35 / 62 | 31 / 68 | 35 / 62 |

## 15. A-D Ablation

dev Source-faithful:

| 条件 | exact | F1 | usable | fallback |
|---|---:|---:|---:|---:|
| A Gold / Gold | 86.25% | 97.20% | 81.25% | 18.75% |
| B Gold / Product | 75.94% | 96.26% | 67.81% | 32.19% |
| C Product / Gold | 86.88% | 97.43% | 80.94% | 19.06% |
| D Product / Product | 76.56% | 96.51% | 67.50% | 32.50% |

`B-A` role lossはexact -10.31pt、usable -13.44pt。`C-A` boundary lossは
exact +0.63ptで、devではboundary由来の悪化を再現しなかった。

## 16-20. 精度・Register・Representation・Contamination・Product

Source-faithful Oracle A:

- note precision / recall / F1: 97.97% / 96.45% / 97.20%
- bass / top accuracy: 100.00% / 91.56%
- register exact / octave error: 91.56% / 0.31%
- representation accuracy: 95.00%
- simultaneous exact: 90.79%
- aggregate F1: 50.84%
- aggregated-as-simultaneous: 100%
- distractor / melody leak: 2.02% / 2.60%
- passing tone leak: 0%
- source usable / fallback / review: 81.25% / 18.75% / 18.75%
- stale-after-edit: 100%

## 21-22. Clean / Stress・Scenario

Source-faithful A:

| 指標 | clean | stress |
|---|---:|---:|
| exact | 93.75% | 78.75% |
| precision | 99.76% | 96.23% |
| recall | 96.57% | 96.34% |
| F1 | 98.14% | 96.28% |
| usable | 90.63% | 71.88% |

scenario別の全値は`04-oracle-voicing-dev.json`と
`05-voicing-ablation-dev.json`へ記録した。

## 23-24. 最大Failure Cluster・Validation

最大clusterは`melody-contamination`。

- dev 60 events / validation 18 events
- 優先score 424.00
- stressへ強く偏る（dev 59/60）
- role-derived first loss: dev 38、validation 25

validationのrole lossはexact -16.67pt、usable -27.08pt。
次点はsimultaneous frame wrong、3位はfallback despite usable source。

## 25. Holdout

契約固定後に10 MIDI / 80 eventsを一度だけ実行した。再チューニングしない。

| 条件 | exact | precision | recall | F1 | register exact | usable |
|---|---:|---:|---:|---:|---:|---:|
| A | 95.00% | 99.07% | 100% | 99.53% | 100% | 95.00% |
| B | 77.50% | 95.96% | 100% | 97.94% | 85.00% | 63.75% |
| C | 95.00% | 99.07% | 100% | 99.53% | 100% | 95.00% |
| D | 77.50% | 95.96% | 100% | 97.94% | 85.00% | 63.75% |

holdoutでもrole lossはexact -17.50pt、usable -31.25pt。boundary lossは0。

## 26. Real MIDI Review Pack

Endless 12 + SURAN 12 = 24 events。自動baselineはcomplete。
A/B/C/F試聴と61鍵表示を持つローカルHTMLを生成した。
human auditory reviewはpendingで、Phase 4.4の挙動変更前に実施する。

## 27. Vocabulary Extension

未実施。representableRate 100%で非ゼロの対象familyを事前固定できなかった。
parser、serializer、editor、detectorを変更していない。

## 28-31. 回帰・Schema・Build・Privacy

- Timeline / Candidate / Capture / Chord Dojo: 全1649 Vitest PASS
- `defaultAnalyzerMode = phase4-v1`
- Vault schema変更なし、`fileVersion = 1`
- lint: PASS
- typecheck: PASS
- Vitest: 194 files / 1649 tests PASS
- Rust: 24 tests PASS
- Web build: PASS
- Tauri build: PASS
- tracked `.mid` / `.midi`: 0
- `.local-evaluation`のstageなし

配布物:

```text
src-tauri/target/release/loop-vault.exe
src-tauri/target/release/bundle/msi/Loop Vault_0.1.0_x64_en-US.msi
src-tauri/target/release/bundle/nsis/Loop Vault_0.1.0_x64-setup.exe
```

既知の警告: Viteのmain JS chunkが約1.20 MBで500 kB警告閾値を超える。

## 32. Phase 4.4推奨テーマ

`melody-contamination`だけを対象にする。最初にProduct Voice roleがmelodyを
mixed/harmonyへ残す理由を実MIDI Review Packで確認し、role evidence / note
filteringのどちらを直すかを分ける。aggregate、fallback、boundaryを同時に直さない。

## 33. Rollback

P4.3-00〜08は各Stage 1 commit、P4.3-09はholdout固定と最終報告の2 commit。
未mergeなら該当PRを閉じる。
merge後はP4.3-09から依存逆順に`git revert <merge-commit>`する。
製品schema変更が無いためdata migration rollbackは不要。

## 34. 最終PR

[PR #234](https://github.com/Takuyakou/loop-vault/pull/234)をPhase 4.3 stackの
最終入口とする。依存順は#225から#234まで番号順に保つ。
