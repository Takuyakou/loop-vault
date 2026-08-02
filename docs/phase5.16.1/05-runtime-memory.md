# Phase 5.16.1 Runtime / Memory Report

## 測定target

測定対象はbase commit `3f6144f`に、P5.16.1-05の次のworking-tree code deltaを加えた状態である。report更新はruntime targetへ含めない。

| File | SHA-256 |
|---|---|
| `scripts/check-staged-files.mjs` | `1f52c1926902571f5c1c10f9cb34514d281ccf09c7514bd0b93650b22a8c3af6` |
| `scripts/p5161-release-benchmark.ts` | `378d1c0bd7bcd36937051b06bf1cc1a3ca5941155cbb184ac81411c0b7b15aad` |
| `e2e/phase5.16.1-degree-echo.spec.ts` | `85b5108e6654ad92ba26635235a831015c906a61f4b6c84411afb8d3bdb4c355` |
| `src/features/bass-practice/application/degreePracticeSession.ts` | `fd0bdd0a57ed56b80969b3f212860edabd29304aed561e198655790423094b39` |
| `src/features/bass-practice/application/degreePracticeSession.test.ts` | `e98fcec1ffa51769488dcc786dc0635896f1aa0295b66e16835281ad3d3fc051` |

tracked 4-file diff `git diff --binary 3f6144f -- <4 paths>`と、未追加benchmarkのnew-file diff `git diff --no-index --binary /dev/null scripts/p5161-release-benchmark.ts`をこの順に連結したbyte streamのSHA-256は`de19bda35dfd0b58dcbc5aad563e8710a893931b9a75322728323f570bd44907`である。実staging areaは変更せずにcode delta全体を固定した。

## Environment

- Node `v24.14.1`
- npm `11.11.0`
- Vite `7.3.6`
- OS `Windows_NT 10.0.26200`、`win32-x64`
- CPU `13th Gen Intel(R) Core(TM) i7-13700F`、24 logical processors
- benchmark中はrelease build/testを並行実行していない
- filesystem/MIDI/audio deviceはruntime workloadへ含めない

### Dependency isolation remediation verification

最終Gateでは、専用worktreeの共有`node_modules` junctionを確認済みlink pathに対する非再帰・link-only `cmd.exe /d /c rmdir`で削除し、lockfile準拠の`npm ci`で独立installへ置換した。最終`node_modules`は通常directoryであり、junction / reparse pointではない。共有先だったPhase 5.15 worktreeのdependency treeは削除前後ともtop-level 230 entries、recursive 19,694 entries（18,457 files / 1,237 directories）で不変だった。

独立install後に`npm list --depth=0`、app typecheck、lint、release-hardening対象2 files / 38 testsをPASSした。同じbenchmark commandも再実行し、deterministic `true`、全timeout 0、全5 resource runのactive handle delta 0を確認した。再実行値はgeneration 1,000件 median 34.8106 ms / p95=max 38.6129 ms、queue median 1.2956 ms / p95=max 1.6270 ms、History median 0.2057 ms / p95=max 0.3421 ms、playback median 0.9767 ms / p95=max 1.4855 msだった。これはdependency隔離の非退行確認であり、上記の固定targetとcanonical release measurementを置き換えない。

## Reproducible harnessと統計

benchmark harnessは`scripts/p5161-release-benchmark.ts`としてtargetに保存した。実行commandは次であり、`--expose-gc`がなければresource測定をfail closedする。

```powershell
node --expose-gc node_modules/vite-node/vite-node.mjs scripts/p5161-release-benchmark.ts
```

scriptは次を機械的に固定し、raw samplesをJSON出力する。

1. generator version `degree-v1`、C major、88 BPM、4-string tuning、right、fret 0〜12、even rhythmと、`p5161-fixed-0000`〜`p5161-fixed-0999`の1,000 seed。
2. generation 2,000件、queue 1回、History 1回、playback start 100回をtimed sampleから分離してwarm-up。
3. generation 1,000件を7 run。各runの1,000 `PracticeExercise`全体を`stableHash`し、全run同一であることを判定する。IDだけの比較ではない。
4. script内で固定生成する同一1,000-attempt / 100-session fixtureを用い、queueとHistoryを各9 run。History limitは100。
5. stub controllerでsession setup/disposeをtimed region外に置き、1,000回分の`startListen()` adapter時間合計を9 run。audio device latencyは含めない。
6. 1,000回のsession create → listen start → route leave → disposeを1 runとし、各run直前直後に`global.gc()`を実行して5 run。active handles、heap、RSSをrun境界で採取する。
7. medianは昇順中央、p95はnearest-rank `sorted[ceil(0.95 * n) - 1]`、maxは観測最大値。sampleは破棄せず、例外はcommand failure、timeoutは別countにする。

01/02/04のStage-local測定は別session・別warm-up境界で得た一時観測である。以下のtracked harnessによるP5.16.1-05 final release measurementを最終値として優先する。

## Runtime results

| Workload | Runs | median | p95 | max | timeout |
|---|---:|---:|---:|---:|---:|
| generation / 1,000 exercises | 7 | 33.8490 ms | 34.9613 ms | 34.9613 ms | 0 |
| generation / exercise（runの償却値） | 7 | 0.033849 ms | 0.034961 ms | 0.034961 ms | 0 |
| queue / 1,000 attempts | 9 | 1.2375 ms | 1.3609 ms | 1.3609 ms | 0 |
| History / 1,000 attempts, 100 sessions | 9 | 0.1939 ms | 0.3410 ms | 0.3410 ms | 0 |
| playback adapter / 1,000 starts | 9 | 0.9808 ms | 1.9163 ms | 1.9163 ms | 0 |

同一seed/configの1,000 `PracticeExercise` content hashは全7 runで一致した。`queue`とHistoryはpure synchronous derivationで、全runが16.67 ms未満だった。長時間I/Oはrepositoryのasync boundaryにあり、UI threadへTauri file operationを直接置いていない。

### Raw samples（ms）

- generation: `34.52039999999988, 32.94920000000002, 34.96129999999994, 34.247299999999996, 33.59479999999985, 33.84900000000016, 32.929999999999836`
- queue: `1.326799999999821, 1.241700000000037, 1.2374999999997272, 1.360899999999674, 1.3047999999998865, 1.19170000000031, 1.1511000000000422, 1.1503999999999905, 1.1673000000000684`
- History: `0.3409999999998945, 0.21669999999994616, 0.1938999999997577, 0.19330000000036307, 0.21810000000004948, 0.2154000000000451, 0.171100000000024, 0.17309999999997672, 0.18100000000004002`
- playback adapter / 1,000 starts: `1.3673000000108004, 1.1536000000005515, 0.9698000000021239, 1.2473999999942862, 0.9164999999984502, 0.9808000000030006, 0.9502000000002226, 0.8962999999976091, 1.9162999999998647`

全sampleをp95/maxへ保持し、再現不能な異常終了、timeout、CPU競合は観測しなかった。最後のplayback sampleは中央値より高いが、外れ値として除外していない。

## Resource retention

1,000 session lifecycleの各runで、`heapDeltaBytes / rssDeltaBytes / activeHandleDelta`は次の通りだった。

1. `-420792 / 204800 / 0`
2. `-51888 / -1105920 / 0`
3. `-12216 / 81920 / 0`
4. `640 / 204800 / 0`
5. `5640 / 188416 / 0`

active handle deltaは全5 runで0。stop counterはwarm-up、playback workload、resource workloadを含むharness全体で28,200で、各sessionのreplacement前stopとroute-leave stopを確認した。

heap/RSSはGCとallocatorの予約・解放noiseを含むため、単一runの符号やbyte数を解放保証量にしない。固定byte Gateは置かず、(1) active handle deltaが各run 0、(2) 5 runでheap/RSSが単調増加しない、(3) lifecycle unit/E2Eが完了する、をretention Gateとした。観測上の正の最大はheap `5,640 B`、RSS `204,800 B`だが、これは製品上限ではない。process peak RSSは連続samplingしていないため報告せず、run境界deltaと明確に区別する。

## Reproducible standalone Web bundle delta

Vite configは`VITE_BUILD_DATE`未指定時に現在時刻をbundleへ埋め込むため、byte数が同じでもJS filename/SHA-256はbuildごとに変化する。uncontrolled buildのhashは再現性証拠に使わない。

currentとbaselineの両方でPowerShell process scopeへ次を設定し、同じcommandを各2回実行した。各profile内でfilename、bytes、SHA-256が2/2一致した。

```powershell
$env:VITE_BUILD_DATE = '2026-08-02T00:00:00.000Z'
npm.cmd run build
```

baselineは`git worktree add --detach <temporary> 8661e5d`で隔離し、そのtemp worktree内で`npm.cmd ci --prefer-offline --no-audit --no-fund`後に上記buildを2回実行した。dependency junctionは使用していない。計測後にtemp worktreeを削除した。

| Profile / asset | Filename | Bytes | SHA-256 | Repeat |
|---|---|---:|---|---:|
| `8661e5d` CSS | `index-fQViV25T.css` | 51,244 | `875ba2548f8f01901c8ec207d64ca216c6679b6f04da61fb1b957958d98df458` | 2/2 |
| `8661e5d` main JS | `index-NvVl7x4M.js` | 1,350,972 | `33069b3fc105c8e7addd6c75c4ba3d300f4d37fe40cd4ac63b87aec93c09b0b0` | 2/2 |
| current CSS | `index-L2ztcClD.css` | 52,000 | `dcb51b06437e6ec8c438de5732bf76febb116db75e0c75cdc2b385645e4a0021` | 2/2 |
| current main JS | `index-BPdrpvbN.js` | 1,414,639 | `92df9733627af035e865c7fbba994f094f9fa807d27a3ccb34948258425bddef` | 2/2 |
| current lazy Bass Practice JS | `BassPracticeView-DPed9pQI.js` | 39,457 | `659038f66aa3b1f32d0ad65c3882fb3ac88c325af35afb85aef57415e5ccbfdf` | 2/2 |

| Asset | Audit baseline | P5.16.1 current | Delta |
|---|---:|---:|---:|
| CSS | 51,244 B | 52,000 B | +756 B (+1.4753%) |
| main JS | 1,350,972 B | 1,414,639 B | +63,667 B (+4.7127%) |
| lazy Bass Practice JS | 0 B | 39,457 B | +39,457 B |
| total JS | 1,350,972 B | 1,454,096 B | +103,124 B (+7.6333%) |

Bass Practiceはstatic lazy importで分離され、flag OFF pathはcomponentを初期化しない。

## Tauri beforeBuild profile

Tauri release build内のbeforeBuildは別profileとしてCSS 51,862 B、main JS 1,388,630 B、lazy Bass Practice JS 38,701 Bを出力した。asset hashはその実行時に採取していない。standalone `npm.cmd run build`と値が異なる理由は未特定であり、Tauri build context/environmentの差を切り分けていない。そのため、これらの値を上記baseline deltaへ混ぜず、Tauri Gateはbuild/bundle生成PASSの証拠としてだけ扱う。
