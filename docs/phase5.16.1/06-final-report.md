# Phase 5.16.1 Final Report

## Release判定

Phase 5.16.1 Degree Echo Coreのfunctional、test、accessibility、Web/Tauri build GateはPASSした。Listen → Sing → Think → Play → Self Review → optional Transfer、deterministic generator、Hint 0〜4、local repository、Home、History、4/5-string、left/right、keyboard、accessibilityを完了した。

Git完了Gateはこのreport生成時点では未完了である。P5.16.1-05の明示path commitと、そのcommit後のclean status確認（Acceptance #35）はcommit担当が行う。したがって、現時点の判定は「実装・検証PASS、Git completion PENDING」であり、dirty worktreeをrelease完了とは表現しない。

Phase 5.16.2/5.16.3/5.17、Rhythm Echo、Bassline Echo、Vault source、DI録音、microphone、自動採点には着手していない。mainへmerge/pushしていない。

## Commit chain

| Stage | Commit |
|---|---|
| P5.16.1-00 Audit | `8661e5d` |
| P5.16.1-01 Domain / Generator | `794220f` |
| P5.16.1-02 Playback / Sing | `4a57902` |
| P5.16.1-03 UI / Home | `55ef122` |
| P5.16.1-04 Review / Storage / History | `3f6144f` |
| P5.16.1-05 Release Gates | PENDING: このreportとGate hardeningを保存する明示path commit |

## Gate status

| Gate | Result |
|---|---:|
| ESLint + class lint | PASS |
| app typecheck | PASS |
| E2E typecheck | PASS |
| full Vitest | 282 files / 2,324 tests PASS（下記fixture前提） |
| full Rust | 41/41 PASS |
| full Playwright | 40/40 PASS |
| visual / axe / keyboard / reduced motion / viewport | PASS |
| tracked release benchmark | PASS、generation 7 / queue 9 / History 9 / playback 9 / resource 5 runs |
| Web build | PASS、fixed build dateでcurrent/baseline各2/2 hash一致 |
| Tauri release build | PASS、MSI/NSIS生成確認 |
| `git diff --check` | PASS |
| tracked MIDI | 0 |
| tracked `.local-evaluation` | 0 |
| generated build/test artifact cleanup | PASS |
| dedicated dependency isolation | PASS、`node_modules`は独立した通常directory（junction / reparse pointではない） |
| dependency remediation targeted tests | 2 files / 38 tests PASS |
| Stage05 commit + post-commit clean status | PENDING（commit担当Gate） |

## Full Vitestのcorpus fixture前提

clean checkoutはPhase 5.15の非追跡317-file corpus本文を持たない。release確認は次の限定手順で実行した。

1. 許可済みlocal sourceから一時fixtureを配置した。
2. `stage01CorpusLock.test.ts` 5/5を先に実行し、`docs/phase5.15/00-baseline-lock.json`、`00-data-inventory.json`、`00-partition-lock.json`、`01-corpus-lock-binding.json`に固定された317 entryのpath/size/SHA-256/manifest/partition bindingを検証した。
3. 同じ配置のままfull Vitest 282 files / 2,324 testsをPASSさせた。corpus解析やbaseline再計算はしていない。
4. 一時fixtureを削除した。

clean checkout単独の再実行ではfixture不足により当該1 testだけがFAILし、281 files / 2,323 testsはPASSする。この差は機能退行ではなく、非追跡fixtureの実行前提である。絶対path、個人filename、MIDI本文はreportへ記録しない。

## Protected surfaces

- Vault schema、Vault repository、`fileVersion = 1`: hash不変
- existing Chord Dojo component: hash不変
- global master volume: hash不変
- Analyzer、MIDI Exporter、Live MIDI: implementation diff 0
- feature flag OFF: Home cardなし、Bass Practice tabなし、repository/audio side effectなし
- existing Home/Historyはintegration seam以外を維持し、full Vitest/Playwrightで非退行

## Acceptance 1〜38

1〜17（Degree flow、determinism、Hints、sing dwell/skip/reference、review/queue/Transfer/Home/History/restore/5-string/left/keyboard）はPASS。18〜23（Chord Dojo、fake score 0、microphone 0、Vault schema、Analyzer、Exporter）はPASS。24〜33（lint/typecheck/Vitest/Rust/Playwright/visual/accessibility/Web/Tauri）は上記corpus fixture前提を含めPASS。34はtracked MIDI 0。35はPENDINGで、generated artifact cleanup後の明示path commitとpost-commit clean status確認をcommit担当Gateとする。36はmain unmerged。37〜38はRhythm/Bassline/Phase 5.17未着手。

## Release Gate repairs

1. CRLF checkout時にVite Nodeが先頭shebangをtransform後へ残すためfull Vitestが構文errorになった。明示的にNodeで呼ぶstaged-file guardから不要なshebangを削除し、20/20 testsで固定した。
2. singing dwell timerがdeadline直前にearly fireするとcompletionが永久disabledになる可能性を修正し、remaining time再schedule testを追加した。
3. Windows 200% scale smokeをPlaywrightへ追加した。
4. 一時harnessを廃止し、fixed fixture、warm-up、raw sample、nearest-rank p95、resource boundaryを持つ`scripts/p5161-release-benchmark.ts`を追加した。generation determinismはIDではなく1,000 `PracticeExercise` content全体を比較する。
5. Vite build dateを固定しないbuildは同じbyte数でもJS filename/SHAが変わるため、current/baselineとも`VITE_BUILD_DATE=2026-08-02T00:00:00.000Z`で各2回再buildし、再現可能なhashを`05-runtime-memory.md`へ記録した。

## Resource safety incidentと復旧

baseline隔離buildの初回手順でdependency junctionを使い、PowerShellで一時junctionをcleanupした際、linkだけでなく共有先である元のPhase 5.15 worktreeのignored `node_modules`内容を削除した。tracked/staged source、未コミットStage01実装、personal corpus、local evaluationには操作していない。

検出直後、元worktreeの既存`package-lock.json`を使って`npm ci --prefer-offline --no-audit --no-fund`を実行し、311 packagesを再installした。元worktreeのbranch/HEADは`fix/p515-01-exact-evidence-dedup` / `97b03f4`のままで、専用worktreeからNode、npm、TypeScript 5.9.3の動作を確認した。以後のbaseline測定はjunctionを廃止し、隔離temp worktree内の独立`npm ci`へ変更した。junction cleanupを再実行していない。

final dependency isolationでは、専用worktreeの`node_modules`がJunctionであり、共有先が元worktreeの`node_modules`と完全一致すること、両directoryが存在することをread-onlyで先に確認した。PowerShell `Remove-Item`は使用せず、確認済みの専用worktree側linkだけを`cmd.exe /d /c rmdir`で非再帰・link-only削除した。削除前後で共有先はtop-level 230 entries、recursive 19,694 entries（18,457 files / 1,237 directories）のまま一致し、共有先の内容を辿って削除していない。上段の「junction cleanupを再実行していない」は事故を起こしたPowerShell cleanupを指す。

その後、専用worktreeでlockfile準拠の`npm ci`を実行し、311 packagesを独立installした。最終状態の専用`node_modules`は通常directoryで、junction / reparse pointではない。専用worktreeでは`npm list --depth=0`、app typecheck、lint、release-hardening対象2 files / 38 tests、tracked benchmarkをPASSした。元worktreeでも`npm list --depth=0`とTypeScript 5.9.3の起動を確認し、branch / HEAD / tracked / staged statusに本remediation由来の変更がないことを再確認した。最終状態として共有dependency junctionは廃止済みであり、tracked source、未コミットStage01実装、personal corpus、local evaluationへの影響は0である。

## Stop point

commit担当がP5.16.1-05の12 intended pathを明示pathでcommitし、clean statusを確認した時点でPhase 5.16.1を終了して停止する。Phase 5.16.2へ自動で進まない。
