# Preview Fade Stage 03 — Piano Startup Optimization

## 状態と作業範囲

**STAGE 03 = COMPLETE — PIANO WARM TARGET PASS / FRESH FULL PASS**

Stage 02承認後のPianoのみの実装。実装freeze commitは`a96bf9ff3bcf5db38de716def33532071fb27fd9`。merge／push／tag／release／Stage 04／Electric Piano高速化は行っていない。

- 開始時：`tmp/preview-spare-proto`、`9d0f8f52d0296ba17c75dd1752cdfd07eb44803d`。
- `feat/preview-fade`も同じcommitだったため、既存変更を持ったまま同branchへswitch。新しいworktreeは作成していない。
- 人間の正式解除指示により設定のdeny `Edit(./src/audio/chordPreview.ts)`だけを削除。JSON全体をparseして、残り41項目・他設定が一致することを確認。独立commit `870da126`。他の編集禁止は維持。
- 前セッションの`src/testing/previewFadeLab.ts`変更、未追跡のレポート・assets・出力は保護し、labおよび禁止されたTransport等は開始時hashと一致。未追跡`e2e/tmp-s2.spec.ts`には後述のFULL blockerを解消する型注釈のみの修正を実施し、元バイトを独立証拠領域へ保管。TypeScript transpile後のJSは元とbyte-identicalで、測定内容は保持した。同probeを今回のcommitへ取り込んでいない。

## 1. コード変更

製品変更は`src/audio/chordPreview.ts`のみ。

- `getPianoBuffers`：従来と同じ8個のbundled Salamander MP3をlazy fetch/decodeし、native AudioBufferを共有する。PCMを変更・複製しない。
- cache keyはTone Context identity、sampleRate、asset URL集合。productionのVite URLにはasset content hashが含まれる。
- 同時要求はsingle-flight。異contextへの切替・失敗後retryも、古い**実decode処理の終了**まで重複実行しない。1サンプル失敗時も`allSettled`で残りを回収してから枠を解放する。
- 6秒timeoutでfetchをabort。decodeAudioData自体はabort不能なので、timeout後も未終了decodeの枠は保持し、遅れて成功してもcacheへ採用しない。異context待機側にも6秒fail-safeを設けた。
- 初回の通常失敗はpartial cacheを残さず次の呼出しでretryできる。永久にsettleしないdecodeからの自動復旧は保証しない。後続要求を無期限pendingにせず失敗させ、重複decodeを防ぐ。
- viewが閉じられてもcache warmingは完了可能。既存preview generation guardにより、取り消したsessionでは発音しない。shared cacheをviewの所有物にはしない。
- 同一contextのsuspend/resumeはcache保持。context close通知でcache参照を解放。context置換時も古い結果を採用しない。アプリ終了時はJS realmとともに解放する。
- 保持上限は**50MiB、1セット**。48kHzで実データ49,533,944 bytes＝47.24MiB。高sampleRate等で上限を超えた場合はcacheに保持せず、その要求のSamplerへ渡す。再生互換性を優先するため、この場合は次回再decodeする。上限はidle cacheに対するもので、再生中Samplerやdecode作業の総メモリの上限ではない。
- `createPianoInstrument`は共有bufferから毎回新しい`Tone.Sampler`を生成し、従来と同じ`release: 1`・出力経路を使う。Pianoは`preparePreviewAudio`の楽器再利用対象から外し、notes／chord／timelineいずれも新しいSamplerを使う。予備楽器は保持しない。
- chord／timelineの旧Samplerは従来の1.1秒soft retirementで破棄する。既存契約上、このtail件数に全体固定上限を新設していない。
- app先読み1.5秒、Tone.lookAhead 100ms、15msフェード、40ms wall-clock破棄、fade枠最大2、public API／started・endedイベント、pitch／velocity／duration／音量は変更していない。Electric Piano本体も変更していない。

## 2. 実音開始遅延

Stage 02のAudioWorklet meterを再利用。48kHz、Chromium headless、Tone lookAhead 100ms。変更前は`9d0f8f52`の比較用コピー、変更後は実製品moduleを別出力へ接続。音声asset・依存libraryを変更していない。最初のabs(sample)>1e-4のframeから実音開始を計算し、message受信時刻や`onStarted`時刻とは区別した。

実行環境：Windows x64、Node 24.14.1、Playwright 1.57.0 / Chromium 143.0.7499.4、Tone 15.1.22、standardized-audio-context 25.3.77。計測用browserはautoplay許可flag付き、headless標準のmute付き。内部tapはmute前の信号を観測する。

集計はStage 02と同じ実装で、昇順配列のp50は`floor(N*0.5)`番目（0始まり、偶数Nではupper median）、p95は`ceil(N*0.95)-1`番目。

要求時刻はAudioContext時計へ写像している。この環境では時計更新に約10.7msの量子化があり、Warmの同値観測を物理的jitterゼロとは解釈しない。

**ブラウザ内部のpre-mute render観測であり、OS／DAC／スピーカー出力遅延の保証ではない。** 全て公開合成notes。private MIDI／録音／Vaultは使用していない。

| 条件 | N | 内部実音 p50 / p95 / max (ms) | onStarted p50 / p95 / max (ms) |
| --- | ---: | --- | --- |
| 変更前・同contextで毎回decode | 30 | 165.9 / 176.5 / 197.9 | 68.5 / 75.8 / 94.6 |
| 変更後・最初のdecoded-cold | 1 | 176.5 / 176.5 / 176.5 | 66.1 / 66.1 / 66.1 |
| 変更後・Warm | 30 | 101.9 / 101.9 / 101.9 | 0.2 / 0.4 / 0.4 |
| 変更後・EP生成／破棄からPianoへ戻る | 30 | 101.9 / 101.9 / 101.9 | 0.2 / 0.3 / 0.4 |
| 変更前・isolated matched decoded-cold | 30 | 176.5 / 187.2 / 187.2 | 73.5 / 86.3 / 89.0 |
| 変更後・isolated matched decoded-cold | 30 | 176.5 / 187.2 / 187.2 | 75.6 / 86.6 / 86.8 |

Warm内部実音p95は目標120ms以内。p95改善量74.7ms。onStartedは従来どおり論理的な開始通知で、物理発音通知へ意味を変更していない。

初期Cold反復では28回まで保存した後、ページ再読込がload timeout。補完して30回の観測は保持したが、さらにcontext明示close付きの同page再読込比較も17観測後にnavigation timeout。サーバー自体はHTTP 200で応答していた。これを製品decode failureと断定しない一方、長時間page再読込の問題を解決したとも扱わない。

最終Cold比較では**各pairでbrowserを作成・終了し、旧／新とも別page・新context、終了時にcontextをclose**する測定手順へ揃え、30pair/60観測を完了。表のmatched Coldを前後比較に使用する。Cold実音開始のp50/p95/maxはこの観測では同等で、Cold高速化の成果は主張しない。最初の失敗と途中データは保存した。pair内では旧→新の固定順で通常のHTTP cacheを共有するため、その順序効果までは除去していない。**decoded-coldと厳密なネットワークcold比較を混同しない**。

## 3. 音色・波形・包絡

旧URL-based Samplerと実製品の新factoryを48kHz stereo OfflineAudioContextで各3秒render。低音〜高音、単音群、同時和音、velocity .2/.45/.72/1、音価 .18/.5/.9/1.35秒を含む4fixtureを比較。release tailも含め全sampleを比較した。

| Fixture | 最大絶対sample差 | 相対RMS差 | 旧／新 peak |
| --- | ---: | ---: | --- |
| 広音域5音 | 1.49e-8 | 5.54e-8 | .131984 / .131984 |
| 6音和音 | 1.19e-7 | 6.44e-8 | .943323 / .943323 |
| 半音を含む3音 | 5.96e-8 | 4.52e-8 | .817923 / .817923 |
| 5音保存型和音 | 5.96e-8 | 6.03e-8 | .577183 / .577183 |

量子化・浮動小数演算程度の差で、音量peak・音価・release包絡を含むrenderが一致。実スピーカーや全音域／全velocityの聴感検査を行ったという意味ではない。

## 4. 50〜500ms連打

各条件30要求。実APIの通知・中断と、factoryごとの独立出力を併用。factory比較側はgeneration/latest-wins・既存15ms/40msフェードを使う計測モデルであり、製品schedulerを差し替えたものではない。

| 間隔ms | 旧／新の観測発音N | 旧 p50 / p95 / max ms | 新 p50 / p95 / max ms |
| ---: | --- | --- | --- |
| 50 | 1 / 1 | 175.3 / 175.3 / 175.3 | 100.6 / 100.6 / 100.6 |
| 100 | 1 / 30 | 164.6 / 164.6 / 164.6 | 100.7 / 103.3 / 105.7 |
| 150 | 3 / 30 | 167.0 / 175.3 / 175.3 | 100.6 / 102.6 / 103.2 |
| 300 | 30 / 30 | 164.6 / 177.3 / 196.6 | 100.6 / 102.6 / 105.3 |
| 500 | 30 / 30 | 167.2 / 186.0 / 196.6 | 100.6 / 103.3 / 103.3 |

50msは100ms lookAheadより短く、途中要求が発音前に取り消されるのは既存latest-wins契約。最後の要求は全条件で期待pitchと一致。N=1/3のp95は安定した分布推定ではない。全条件、旧楽器のretire 45ms後のpeakは0で、未来予約音の復活なし。

全体destination上の連続音から最新要求のonsetを読んだ最初の試行は、前の音が混入して負値も出たため**採用していない**。元値をinvalidとして残し、表は楽器別出力で測定した値だけを使用する。

Worker→main dispatchをMIDI入力待ちのproxyとして測定。新方式連打のp95 .1〜.2ms、max .9〜2ms、rAF最大16.8ms。Warm定常時のdispatch max17.1ms、rAF max16.8ms。EP→Piano試験にはEP同期構築によるrAF最大133.4msが含まれ、EP高速化の成果とは扱わない。実ハードウェアMIDIの遅延ではない。実製品のMIDI入力経路は下記P16／Dojo関連E2Eで回帰確認する。

## 5. メモリ・native node・lifecycle

Piano 1,000回（100回×10）、各要求に未来noteを含め開始後5msでstop。cacheの追加decodeなし。計測counterは旧方式のdecode量も累積するため、累積decoded bytesをcache常駐bytesと誤解しない。

- cache常駐47.24MiB、native AudioBufferを8個だけ共有、SamplerのdisposeでPCMは変更しない。
- native nodeはCDPで計測開始後の作成／破棄差分。100回後700、300〜1,000回で概ね1,250前後の一時残存、10秒settle＋GC後**0**。既存Context初期graphを含めた全node数という意味ではない。
- 1,000回直後JS heap約10.1MiB、settle後約8.0MiB。AudioBufferのnative PCMはJS heapの数字へ含まれるとは限らないため、heap量だけからcache容量を推定しない。
- fade待ち最大2は従来どおり。予約済みSamplerを再利用せず、未使用予備0。soft-tail R、active、decode中の一時参照はcache上限とは別に存在する。
- unit testsでfailed init/retry、並行12要求、decode中stop／次要求、context置換、suspend/resume/close、timeout、永続未完了decodeのfail-safe、50MiB超非cacheを検証。

## 6. テスト・独立レビュー

- focused Unit/Integration：5 files、100/100 PASS。Piano cache追加7testを含む。chordPreview／outputFade／textTransport／playbackController／ProgressionVoicingTransport。
- App/E2E TypeScript、変更対象ESLint、git diff --check：PASS。
- 新E2E：native AudioContext.decodeAudioDataを独立計数し、複数の実音previewでもPiano assetが8回だけであること・実際に音が出ること・stop後静かになることを検証。製品UIへtest-only処理を追加していない。
- 初回関連E2Eは94 PASS / 1 FAIL。新規計数の実値9を調査したところ、8個のMP3と依存library `standardized-audio-context/helpers/test-promise-support.js`の48バイトempty WAV probe 1個だった。全12wordが既知probeと一致する場合だけ別分類するよう観測を修正。期待するPiano decode数8は変更せず、修正後の音声E2E **3/3 PASS**。旧Piano stop step中央値.0108（音自身.0191）、EP .0022（音自身.0051）。既存音響thresholdは変更していない。
- 独立レビュー：読み取り専用subagentで初回・修正後を実施。異context待機の無期限pending指摘を6秒fail-safe＋deterministic testで修正。再レビューでblocking findingなし。高sampleRate非cacheと永久未settle時の制限を明記。
- 関連E2Eは最初の94/95 PASS＋計数修正後の音声3/3 PASS。最終コードの全件E2Eは下記fresh FULLで675件PASS。P16、Dojo、Vault/Home、Text transport、Correction Workspace、Bass Practice、Voicing Loop、keyboard/accessibilityを含む。
- 報告書と数値JSONの独立照合も実施し、blocking findingなし。分位点定義を明記した。

## 7. 未解決事項

- **Electric PianoのTone.CrossFade由来native StereoPanner残存は未解決**。Stage 02の3個/factoryの結果を取り消さない。音源構成・協調生成は一切変更していない。
- 50MiBを超えるsampleRate/asset集合はcache対象外。PCMの再sample・音色変更で上限へ押し込まない。
- browserがdecodeを永久に完了させない場合、重複開始を防ぎつつtimeoutを返す。無条件の自己修復・context強制置換は実装していない。
- 実OS出力／実MIDI機器／Tauriでの音質・遅延は今回の内部AudioWorklet測定からは保証しない。
- privateデータ、Stage 04、EP高速化、merge、push、tag、releaseは対象外。

## 8. 最終Gate / Closeout

以下は実行済みの確定結果。報告書の後続commitはdocumentation-onlyで、テストした製品HEADを変更したという意味ではない。

- 許可設定の独立commit：`870da126`。
- 製品・自動テスト3ファイルのfreeze：`a96bf9ff3bcf5db38de716def33532071fb27fd9`。
- fresh FULL第1回：Repository ESLintでFAIL。既存の未追跡`e2e/tmp-s2.spec.ts`に3箇所の`no-explicit-any`違反。以降のGateはこの回では未実行。失敗ログを保存。
- probe元バイトを保管し、3箇所を`unknown`＋明示interfaceの型castへ変更。出力JS完全一致・focused ESLint・E2E TypeScript PASS。製品・テストcommitへ無関係な調査コードを混ぜず、未追跡のまま保持。
- 同一製品HEADでfresh FULLを最初から再実行。PASS cacheは使用しない。

| fresh FULL第2回・`a96bf9ff` | 結果 |
| --- | --- |
| Repository ESLint / class lint / source-contract lint | PASS |
| App / E2E TypeScript | PASS |
| phase-doc / AI-handoff validation | PASS |
| privacy/security scan | PASS |
| production web build / gallery excluded | PASS |
| runner contracts | 27/27 PASS |
| Full Vitest | 4,860/4,860 PASS（85.7秒） |
| repository-wide Playwright | **675/675 PASS、0 FAIL**（1,102.4秒） |
| 最終git diff --check / FULL結果 | **PASS** |

FULLは`npm run test:full -- --fresh`、総wall time **1,226.7秒**。PASS cache使用なし。raw logs 48,569 bytes。ログ識別子`2026-10-19T09-32-50-032Z-full.log`。Playwright discoveryは677件で、既存の`PREVIEW_PROBE`環境変数が必要な計測専用2件は従来どおりskip。675件の製品回帰は全実行・全PASSで、新しいskip／retry追加／threshold緩和は行っていない。

最終tracked dirtyは開始時からの`src/testing/previewFadeLab.ts`だけ。前セッションの未追跡成果物とprobeを保持。probeの型注釈差分および元ファイル保管は上記のとおり。masterは開始時の`e8cfee036af3940a6426a2fef0c71b7ead012e92`、`tmp/preview-spare-proto`は`9d0f8f52`のまま。merge／push／tag／release／EXE生成なし。Stage 03 closeoutで停止する。

### 計測証拠・cleanup

独立計測領域`preview-s03-measure`に`s3-results.json`、最終matched比較`s3-cold-isolated.json`、途中失敗`s3-cold-matched.json`、関連E2E／probe切り分けログ、元scratch probeを保持。PCM音声・private MIDIは保存していない。

再現sourceは`stage03-measurement-source.zip`（15,857 bytes）、SHA-256 `42f848115bbd1038eda0b7d205d0a1d11252b3206babf714612625689302d436`。source manifestも保存。音声asset／node_modulesは含まない。計測専用サーバー4192は所有PIDのcommandを確認して停止し、今回の展開済み試作・cacheをパスとreparse point確認後に削除した。Stage 02のarchive／原本は変更していない。
