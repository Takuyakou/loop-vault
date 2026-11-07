# Loop Vault — Test Performance Optimization

## Status

**COMPLETE — FRESH FULL PASS / READY FOR MERGE REVIEW**. FULL-tested code HEAD: `8cbf587f467c864143de9190fd568bb7474c2495`. The following report closeout is documentation-only; it is not a claim of another FULL run on the later report commit.

- Base: local master `c611b30c0eca40275a10f66ad8c001d0d29c0f87`.
- Branch: `chore/test-performance-optimization`.
- Existing Test DX tested integration `238de21` is an ancestor of master.
- Product/test source at this base is identical to the preceding tested code `1b0e5ab9`; its historical FULL took 1235.9 seconds. Historical results are not fresh candidate results.
- Hardware observed: Intel Core i7-13700F, 24 logical processors, 63.7 GiB RAM, Windows, Node 24.14.1.
- Existing unrelated untracked reports and `Claude outputs/` are protected. The separate Jazz checkout and its uncommitted prototypes are untouched.
- No merge, push, tag, release or EXE generation in this task.

## Frozen coverage and safety

All tracked tests and assertions remain. FULL remains repository-wide with no PASS cache. Production and fixture builds are different contracts and both stay. No retry, skip, timeout or snapshot relaxation will be introduced. Local measurements and traces stay ignored.

Current baseline inventory: 710 Playwright test cases; historical normal run executes 708 and retains two existing opt-in audio measurement skips. Historical Vitest: 5263 passed, two pre-existing optional cases skipped. Candidate counts and skip reasons will be checked against the baseline, not silently rounded into full coverage.

## Stage 00 findings

- FAST/FEATURE/UI/FULL already exist in `scripts/test-dx/run.mjs`; package scripts call this runner.
- Local PASS cache applies only to FAST/FEATURE/UI. `cacheEnabled('full')` is false; FULL has no lookup/write path.
- Cache key covers HEAD, binary tracked diff, relevant untracked files, dependency/config hash, gate and command inputs. Failures are not cached.
- Playwright currently uses two local workers, one CI worker, four disjoint projects, fresh per-test contexts, retained failure traces/screenshots/video, a fixture build and a managed preview server. Normal local retries remain zero.
- Vitest in the DX runner uses four workers. FULL separately checks application/E2E types, lint, docs, privacy, production bundle, runner contracts, all unit tests and all browser tests.
- The fixture wrapper omits duplicate TypeScript only in FULL. FEATURE currently repeats the check after its own App TypeScript gate.
- A UI list containing unmapped or shared browser specs sets `selection.broad`; `runSelected` then passes an empty file list to Playwright, meaning all tests. This explains the thirteen-spec expansion documented in Jazz-00. Explicit browser invocation must be separated from changed-source ownership expansion.
- Two existing builds are required: production without fixtures, browser fixture build with fixed visual metadata. They cannot be conflated for a faster PASS.
- Local permission rules prohibit inspection of several historical scratch directories. Only allowed `test-logs` and current report outputs are used; no permission rules are changed or bypassed.

## Measurement plan

1. Preserve existing allowed logs and inventory; profile a fresh two-worker browser baseline with JSON per-test timing and host CPU/memory sampling.
2. Extract slowest 30 cases and per-spec distribution; account for explicit waits and real music timing.
3. Compare the same bounded risk set at workers 2/3/4, with identical assertions and no retries.
4. Adopt only measured improvements: precise explicit-spec selection, removal of redundant prechecks, and a stable worker setting.
5. Run fresh final FULL on a committed candidate, retain machine-readable step/per-test evidence, and compare test inventory and product-source hashes.

The 6.7-hour Jazz-00 log includes 694 passes, two failures and two existing skips. Its elapsed label alone does not establish 6.7 hours of CPU work. Suspension/wait decomposition remains under investigation; missing evidence will be reported as unavailable.

## Stage 01 — fresh baseline / ボトルネック

Baseline product/config: `c611b30c`; invocation recorded on documentation-only HEAD `290ac927`. Original browser wrapper was loaded before infrastructure edits. No competing browser/Vitest/build benchmark ran during this measurement. PASS cache was not used. Two workers, retries=0, fullyParallel=false, all four configured projects.

| 指標 | fresh 2 workers |
|---|---:|
| Wrapper wall (App TS + fixture build + browser) | 1139.4 s |
| Playwright reported wall | 1117.2 s |
| Passed / discovered | 708 / 710 |
| Existing conditional skips | 2 |
| Failed / flaky / retried | 0 / 0 / 0 |
| Sum of passed test durations (parallel work, not wall) | 2210.0 s |
| Per-test p50 / p95 / max | 1.256 / 12.376 / 33.184 s |
| Host CPU mean / host used-memory peak | 20.3% / 36.1 GiB |
| Resource sampler gaps >5 seconds | 0 |

CPU/memory are whole-host observations, not process CPU or private browser memory. They cannot exclude other applications' load. The resource sampler establishes no large sampling interruption in this fresh baseline, not in the historical Jazz run.

時間分布: <1s:254件、1–5s:345件、5–15s:76件、15s以上:33件。長い上位2 specはMaster register 282.2秒、UI scheduler 222.6秒（各テスト時間の和）。全144セル表示、12キーの独立Recall、実時間の再生完了・取消検証が中心であり、ケースやassertionを削らない。

### 変更前FULLのGate内訳

同じ製品コードの既存FULLログ（2026-10-22 06:38 UTC開始）とStage 03報告を使用。FULL 1235.9秒、Vitest 5263 PASS + 2既存skip、Playwright 708 PASS + 2既存skip。下記は連続するログの更新時刻差による概算で、専用stopwatch値ではない。

| Gate | 秒（概算） |
|---|---:|
| Repository ESLint | 11.0 |
| Class + source lint | 0.6 |
| E2E TypeScript | 3.6 |
| Phase docs + AI handoff + privacy | 2.0 |
| App TypeScript | 12.2 |
| Production build | 9.2 |
| Gallery + runner contracts | 0.2 |
| Full Vitest | 74.1 (Vitest自身は73.44) |
| Playwright wrapper | 1124.6 (fixture build込み) |

fixture buildは8.47秒、production buildは8.80秒（Vite自身の表示）。両者はフラグ・成果物が異なるため維持。旧ログではPlaywrightが約91%を占める。

### 遅いテスト上位30件（fresh 2-worker baseline）

| # | Spec | Test | 秒 |
|---|---|---|---:|
| 1 | `p12-master251-register.spec.ts` | Master lower 1440x900 all144 notes, hands, fingers and keyboard are readable at one geometry | 33.184 |
| 2 | `p12-master251-register.spec.ts` | Master lower C follows exact12 study then independent Recall with isolated progress | 32.113 |
| 3 | `p12-master251-ui-scheduler.spec.ts` | Master scheduler B exact12 learning keys require independent Recall and finish explicitly | 31.844 |
| 4 | `p12-master251-register.spec.ts` | Master lower 1366x768 all144 notes, hands, fingers and keyboard are readable at one geometry | 31.814 |
| 5 | `p12-master251-register.spec.ts` | Master lower B follows exact12 study then independent Recall with isolated progress | 31.749 |
| 6 | `p12-master251-register.spec.ts` | Master lower D follows exact12 study then independent Recall with isolated progress | 31.746 |
| 7 | `p12-master251-ui-scheduler.spec.ts` | Master scheduler C exact12 learning keys require independent Recall and finish explicitly | 31.655 |
| 8 | `p12-master251-ui-scheduler.spec.ts` | Master scheduler D exact12 learning keys require independent Recall and finish explicitly | 31.626 |
| 9 | `p12-master251-register.spec.ts` | Master lower A follows exact12 study then independent Recall with isolated progress | 31.303 |
| 10 | `p12-master251-ui-scheduler.spec.ts` | Master scheduler A exact12 learning keys require independent Recall and finish explicitly | 31.224 |
| 11 | `p12-master251-register.spec.ts` | Master lower 1280x720 all144 notes, hands, fingers and keyboard are readable at one geometry | 29.103 |
| 12 | `p12-4-long.spec.ts` | "次のキー（おまかせ）" starts a pass in a key that has no record yet | 27.939 |
| 13 | `p12-4-long.spec.ts` | the card being played stays in view when the form wraps onto several rows | 25.992 |
| 14 | `p12-4-long.spec.ts` | playing every chord to the end records the key, and then waits: no key follows by itself | 25.782 |
| 15 | `preview-fade.spec.ts` | electric-piano: a chord is sounding and the next one is started: the cut is no steeper than the sound itself | 24.772 |
| 16 | `p12-4-long.spec.ts` | "同じキーでもう一度" starts another pass; the back button goes to the list | 24.355 |
| 17 | `p12-master251-ui-scheduler.spec.ts` | Master UI progression completion and stop restore pre-click ii/V/I, while replacement and Form changes cancel old restores | 24.099 |
| 18 | `p16-ear-score.spec.ts` | P16-04: 8小節・16小節の結果に進行全体の譜面が出る。1440 では行が少なく、768 では4小節ずつ。横にはみ出さない | 23.788 |
| 19 | `preview-fade.spec.ts` | piano: a chord is sounding and the next one is started: the cut is no steeper than the sound itself | 22.313 |
| 20 | `p12-master251-fingering-profile.spec.ts` | Master all48 octave-down tempo answer score and keyboard keep the fixed profile despite personal anchors | 19.749 |
| 21 | `p12-master251-fingering-profile.spec.ts` | Master all48 original recall answer score and keyboard keep the fixed profile despite personal anchors | 19.320 |
| 22 | `p12-master251-fingering-profile.spec.ts` | Master all48 original tempo answer score and keyboard keep the fixed profile despite personal anchors | 19.291 |
| 23 | `p12-master251-fingering-profile.spec.ts` | Master all48 octave-down recall answer score and keyboard keep the fixed profile despite personal anchors | 19.140 |
| 24 | `dojo-display-judge.spec.ts` | MIDI reconnect during tempo clears the old input Target and a new round accepts all answers | 18.401 |
| 25 | `p12-4-long.spec.ts` | a pass stopped half way does not record the key | 17.837 |
| 26 | `p12-3-dojo.spec.ts` | 12 clears use 12 different keys, and the 13th is round 2 key 1/12 and not the same as the 12th | 17.570 |
| 27 | `p12-master251-ui-scheduler.spec.ts` | Master UI 1366x768 keeps all144 targets legible at one geometry including hidden, Hint and held answers | 16.461 |
| 28 | `p12-master251-ui-scheduler.spec.ts` | Master UI 1280x720 keeps all144 targets legible at one geometry including hidden, Hint and held answers | 16.442 |
| 29 | `dojo-display-judge.spec.ts` | saved jazz answers in a 66-bar progression advance through the second half using rendered notes | 15.800 |
| 30 | `dojo-display-judge.spec.ts` | tempo switches exact/core per event rather than inheriting the first event policy | 15.564 |

### Jazz-00の13 spec → 全件と6.7時間

`docs/reports/jazz-00-audit.md`と保存されたUI combined logを照合。旧selectorは未登録/共有specを`broad=true`とし、runnerがファイル引数を空にしてPlaywrightを起動した。空引数は全件実行を意味する。694は指定13 specの件数ではなく、その時点の全体の成功件数（694 PASS、2 FAIL、2既存skip）。現在の全体710件とは時点が異なる。

旧combined logに個別テストの開始・終了時刻はなく、最新HTML reportも後の1件runに上書きされていた。したがって6.7時間を純粋な処理/停止待機へ正確に分離することはできない。確認可能なWindows sleep/resume区間は約2.4秒だけであり、数時間をsleepと断定する根拠はない。二つの失敗には5秒assertionと180秒test/teardownの上限があるが、それだけで6.7時間の大部分は説明できない。残余は **UNATTRIBUTED WALL TIME**。今回の新規計測とは混同しない。

## Stage 02 — 固定した改善設計

1. 明示browser specだけの要求は正確なspec集合として実行。共有/未知のsource変更やsourceとspecの混在は従来どおり安全側へ拡大。FULLにselectorを適用しない。
2. FEATURE/FAST内でApp TSが成功した場合だけ、同じrunのbrowser wrapperの重複App TSを省く。UIと直接test:e2eは省かない。
3. 同じ8 specのMIDI/音声/Transport/保存risk setをworkers 2/3/4で比較。極端に長い全144セル/全12キー/大量Home組合せだけはこの比較集合から除外し、baselineと最終FULLでは全件維持。選択式を結果を見る前にlocal worker-plan.jsonへ固定。retry=0、fullyParallel=false、同じfixture build。
4. 個別Gateとテスト時間・discovered/result件数をignored JSONへ保存。失敗ログとtrace/video/screenshot設定は維持。ゼロ件とmissing specを失敗扱いにする。

ブラウザは既にworkerごとに再利用される。context/pageを共有するとlocalStorage、MIDI、WebAudio、timerの独立性を失うため採用しない。音楽的待機/停止後に鳴らないことの確認sleep、font-ready、表示状態待ちは維持。追加モード、依存関係、製品変更、global fullyParallel、retry増加は導入しない。

### Worker比較の追加条件（結果を見る前に固定）

workers=3の同一72件は72/72 PASS、host平均CPU24.1%、最大使用メモリ35.9 GiB。まだCPU/RAMに余裕がある。2-worker baselineの合計test時間2210秒から、4 workersでは理想的でもbrowser約553秒に静的Gate約110秒が加わり、10分を超える可能性が高い。このため、4 workersの後に同じ集合・同じ条件で6 workersを1回追加比較する。6で不安定化/重大な遅延/資源圧迫が出れば採用しない。CIは1 workerを維持し、8以上への探索は行わない。

## Stage 03 — 採用した実装 / 比較結果

初回freeze `c26985e2`では製品`src/**`、既存`e2e/**`、package/lock、fixtureデータ、assertion、timeout、retry、skip、snapshotを変更していない。その後のfresh FULL failure isolationで、P16の2 specだけ入力条件・独立ケース粒度を修正した（下記）。製品ロジックと既存assertionは変更しない。

- `selection.mjs`: 手動指定されたall-spec listだけexactにする。`--changed`による自動検知は従来のowner拡張を保持（削除specもowner契約を検証）。sourceとspecの混在、shared/unknown sourceは安全側。missing explicit specはFAIL。
- `run.mjs`: 同一呼出内の成功App TSをFEATURE/FASTのbrowser wrapperへ伝達。FULLには従来どおり全Gate/全Vitest/全Playwrightを指定。毎Gateの秒数/件数/cache使用を記録、0件PASSを拒否。
- `performance-reporter.mjs`: 全discovery/result/worker/duration/失敗artifact参照をignored JSONへ出力。採点・retry・スケジュールは変更しない。
- `reporting.mjs`: conditional skipを分母から隠さず、Vitestのskipを含むsummaryも正しく集計。
- `playwright.config.ts`: local workersはlogical CPU数の1/4、下限2/上限6。このPCは6、CIは従来の1。spec内部のserial順序・per-test isolation・failure trace/video/screenshotは維持。
- cache契約testのfixture出力だけ、読取り禁止の旧scratchから許可済みtest-performance scratchへ移動。cacheアルゴリズム/無効化範囲は変更していない。

### 同一risk set / worker比較

8 specの固定72ケース。長い全組合せgeometry/12キー反復を除いた比較用集合であり、FULL削減ではない。2→3→4→6の順に実行、毎回App TS・fixture build・新server、PASS cacheなし、local retry=0。ホスト全体のCPUとメモリであり、プロセス専用指標ではない。

| Workers | PASS | FAIL / retry | Browser秒 | 準備込みwall秒 | 平均host CPU | peak host RAM GiB | test p95秒 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 2 | 72/72 | 0 / 0 | 110.3 | 133.1 | 15.2% | 35.1 | 8.113 |
| 3 | 72/72 | 0 / 0 | 81.8 | 103.4 | 24.1% | 35.9 | 8.090 |
| 4 | 72/72 | 0 / 0 | 67.5 | 95.5 | 37.4% | 35.6 | 8.286 |
| 6 | 72/72 | 0 / 0 | 57.9 | 81.5 | 35.2% | 36.8 | 8.431 |

6 workersのtest p95は2より約4%長い一方、wallは約39%短縮。CPU・メモリに重大な圧迫なし、全4条件288/288 PASS。資源条件と最終FULLを含めた有限観測であり、将来のflake不在の証明ではない。8以上の探索やglobal fullyParallelは採用しない。

追加で録音1920px・Voicing Loop 320px restart・Master自然終了/stop/古い再生取消を各5回、6 workersで15/15 PASS、retry=0。通常FULLとは別のbounded stability実験。

### 選択・件数・キャッシュの検証

Node runner契約36/36 PASS（既存27件を維持し9件追加）。explicit spec、Windows path、missing spec、default critical UI、shared/unknown source、source/spec混在、`--changed` owner拡張、削除file、cache key無効化、FAIL非保存、FULL cache bypass、失敗情報保持を確認。missing specとUI browser対象0件は実CLIでもexit=1。

代表13 specを手動指定したselectorと実Playwright discoveryを照合し、13 spec / 229 cases / broad=false（全710件へ拡大なし）。これは保存されていない旧Jazzの正確な13引数を復元したものではない。

### 不採用

| 案 | 不採用理由 |
|---|---|
| Production/fixture build統合 | fixture flag・gallery非混入保証が異なる |
| 全spec fullyParallel / context共有 | 順序・storage・音声/MIDI分離・固定artifact衝突を広範に再設計するリスク |
| 既存sleep一括削除 | 多くは実時間発音、count-in、停止後の非発音、font/geometry安定の保証 |
| テスト削除・skip・retry増・assertion緩和 | 品質条件に反する |
| PASS cacheをFULLへ適用 | fresh全対象検証契約に反する |
| Vitest worker変更 | 約73秒でFULLの約6%、主ボトルネックではない。audio/browserと同時実行もしない |
| browser/serverの無条件共有 | stale fixture buildや状態漏れの危険 |
| 追加テストモード | 既存FAST/FEATURE/UI/FULLで足りる |

### 初回fresh FULLの失敗と最小原因への切り分け

`c26985e2`のFULLは **FAIL**。587.3秒、Vitest 5263 PASS + 2既存skip、Playwright 706 PASS / 2 FAIL / 2既存skip。全710件を実行した。失敗をPASSに数えず、log/trace/video/screenshotをlocalに保護。6 workersの限定risk setだけで最終採用を判断できないことを確認した。

1. `p16-ear-practice.spec.ts`の16小節window test: UI位置dotは`EarRun.tsx`で`question.chords`ごとに生成される。テストは16 dotを要求する一方、`pickBankQuestion`が8個の候補から`Math.random`で選び、`X1-16-002`は16小節・17コードという正当な教材。root causeはランダムfixtureと「小節=カード」の誤った前提であり、worker数や製品の余分なdot生成ではない。coreのL1-16-01/02はいずれも16カードなので、このwindow testだけ既存UIの「追加の進行」をOFFにして入力条件を明示する。16/16、7/16、前カード非表示、current card等のassertionはすべて維持。他のextra bankテストと教材は変更しない。
2. `p16-ear-score.spec.ts`の8/16小節×1440/768表示: 独立4条件を同じpage/context上で連続再生し、30秒を共有。baseline 23.788秒だったが6-worker全件負荷でtest budgetを超過。timeoutは増やさず、4条件を独立case/contextへ展開。全4組合せ・assertion・screenshotをそのまま保持し、1件→4件（全体710→713）にする。複数結果間の保存継続を検証するテストではないため、その契約の削減はない。

製品変更なし、期待値緩和なし、skip/retry/timeout変更なし。新たな最終freeze前にP16両specを6 workersで3反復し、その後に改めてfresh FULLを実行する。初回FAILを消したりcacheから再利用したりしない。

P16修正後は両spec全24ケースを3反復し、6 workersで72/72 PASS、FAIL/skip/retry=0。最大ケース16.147秒、p95=8.976秒、準備込み90.2秒。全組合せのassertionを維持したまま通常30秒枠内に収まった。これは新たなfreeze前のdirty candidate確認であり、最終fresh FULLとは別に記録する。

## Stage 04 — 最終自動検証 / Closeout

Final fresh FULL tested HEAD: `8cbf587f467c864143de9190fd568bb7474c2495`. 実行開始時のtracked変更0件。`node scripts/test-dx/run.mjs full`（`npm run test:full`と同じentry）。PASS cache=false、全step cached=false、retry=0。production/fixtureは両方fresh build。通常のOS・変換cacheは消去していないが、PASS結果の再利用・テスト結果の省略はない。計測中に別browser/Vitest/build benchmarkは実行していない。

| Gate | Result | Seconds | Counts |
|---|---|---:|---|
| Repository ESLint | PASS (cacheなし) | 10.9 |  |
| Class lint | PASS (cacheなし) | 0.5 |  |
| Source contracts | PASS (cacheなし) | 0.1 |  |
| E2E TypeScript | PASS (cacheなし) | 3.5 |  |
| Phase docs | PASS (cacheなし) | 0.6 |  |
| AI handoff | PASS (cacheなし) | 0.2 |  |
| Privacy scan | PASS (cacheなし) | 1.2 |  |
| App TypeScript | PASS (cacheなし) | 12.1 |  |
| Production build | PASS (cacheなし) | 8.7 |  |
| Gallery excluded | PASS (cacheなし) | 0.1 |  |
| Runner contracts | PASS (cacheなし) | 0.1 | 36/36 |
| Vitest full | PASS (cacheなし) | 73.8 | 5263/5265 |
| Playwright full | PASS (cacheなし) | 474.4 | 711/713 (2 existing/conditional skips) |
| Git diff --check (branch / worktree) | PASS | — | — |

FULL wall **586.3秒 (9.77分)**。既存同一製品コードの1235.9秒から **52.6%短縮**。Browser自体はfresh 2-worker baseline 1117.2秒 → 464.7秒。実行順・OS cache・host負荷の影響を含む各1回のFULL測定であり、統計的な性能保証ではない。

10分以内の目標を達成。

| 対象 | 変更前 | 最終 | 検証 |
|---|---|---|---|
| Vitest | 5263 PASS + 2 conditional skip / 5265 | 同じ | 既存全551 files対象 |
| Playwright | 708 PASS + 2 conditional skip / 710 | 711 PASS + 2 conditional skip / 713 | 旧1ケースを4表示条件へ展開する対応を明示し、それ以外のfile/title/project multisetは完全一致 |
| Runner contracts | 27 PASS | 36 PASS | 既存を維持、9件追加 |
| Playwright unexpected / retry / unrun | 0 / 0 / 0 | 0 / 0 / 0 | 全713 discoveredに結果1件ずつ、重複なし |

既存skipはVitestのprivate-input任意テスト2件、PlaywrightのPREVIEW_PROBE opt-in計測2件。新規skipは0。通常環境で実行可能な全テストはPASSしたが、これらを実行済みPASSに数えていない。private入力の調達・計測モードへの変更はしていない。

FULL時host CPU平均 49.1%、host使用RAM peak 38.0 GiB、5秒超sampling gap 0。プロセス単体のCPU/RAMや将来flake不在は保証しない。全case結果はignored `.local-evaluation/test-logs/2026-10-22T07-52-15-912Z-playwright-full-timing.json`、Gate provenanceは`.local-evaluation/test-logs/2026-10-22T07-52-15-912Z-full-metrics.json`、比較集計はignored `.local-evaluation/test-performance/final-summary.json`に保持。生の音声・private MIDIは使用/追加していない。

### FAST / FEATURE / UI / failure観測

| 実行 | 実測wall | 対象 / 結果 |
|---|---:|---|
| FAST fresh (Text Intake CSS owner) | 18.0秒 | Vitest 4/4 + App TS/source/class PASS |
| FEATURE before (旧runner、同じ現行code/settings) | 53.1秒 | Vitest 24/24 + Playwright 5/5 |
| FEATURE after fresh | 42.7秒 | 同じ24 + 5、約19.5%短縮 |
| UI explicit fresh (unmapped MIDI spec) | 74.1秒 | 指定1 spec / 27/27、全件へ拡大なし |
| 6 workers反復 | 15/15 PASS | 3 risk cases × 5、retry=0 |

FEATURE比較の旧runnerはbase版をignored scratchへ読み出し、import位置だけ調整したもの。同じ現行selector・reporting・製品・worker設定を使用したため、CSS ownerの選択件数は一致。純粋な変更前FULLの再実行ではなく、重複App TSの効果を分離する比較。これらsmokeはfreeze前のdirty candidate測定であり、現在HEADのfresh FULL結果として流用していない。

制御された合成assertion failureを別のignored testDirで1件実行し、期待どおりexit=1、failed status/error count、screenshot/video/error-context/traceの実ファイルを確認。negative controlをPASSテストとして加算していない。最終FULLのe2e対象へ混入なし。

### 品質 / 安定性 / 制約

- `src/**`・package/lock・教材データはbaseと同一。E2EはP16の2 specのfixture入力/4-case展開だけ変更。既存assertion、timeout、retry、skipは維持。P16のexpect行は95/95・34/34一致し、4-condition検証本体はbyte-identicalと機械比較した。製品変更0、テスト削除0。FULL選択削減0、PASS cache hit 0。
- 新設定の観測は固定risk set、追加反復、最終全件FULL。CPU数が少ないPCは2–5 workers、CIは1。今回の6-worker最適性は対象PCの測定範囲での判断であり、別PCへの保証ではない。既存のlocal PASS cacheはHEAD/差分/config/引数が対象で、任意の環境・機材変更まで網羅しないため、その比較には--freshを使う（今回の全測定はcacheなし）。
- Jazz-00の6.7時間の正確な内訳はログ欠落により未確定。新reporterで今後はGate/test別時間を残す。
- 全組合せgeometry/real-time音声・取消検証は残る。10分のために削減していない。追加最適化/テスト再設計は今回行わない。
- 元から存在した未追跡資料/別作業checkoutを保持。masterはbaseのまま、merge/push/tag/releaseなし。

### 推奨する開発運用

1. 編集中は`npm run test:fast -- <変更source>`、機能checkpointは`test:feature -- <変更source>`。必要なら`--fresh`。共有/未知sourceの拡大は意図した安全動作。
2. UIを絞って確認するときは`npm run test:ui -- e2e/<対象>.spec.ts --fresh`。無引数UIは従来の9-spec critical set。specだけの明示実行を変更branch全体の保証と混同しない。
3. 最終候補では`npm run test:full`をfresh実行。集計JSONでdiscovered/result件数、skip理由、cache=falseを確認。失敗はlog/traceから調べ、retry/閾値緩和で隠さない。

**TEST PERFORMANCE OPTIMIZATION = COMPLETE / QUALITY PRESERVED / FRESH FULL PASS / READY FOR MERGE REVIEW**

Git補足: local masterは c611b30c のまま。cached origin/masterに対してlocal masterは251 commits ahead / 0 behind。remoteとの同期は行っていない。最終FULL後の変更は本報告書のみのdocumentation closeoutとする。
