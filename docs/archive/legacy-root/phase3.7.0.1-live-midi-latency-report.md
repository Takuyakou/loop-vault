# Loop Vault Phase 3.7.0.1 Live MIDI表示遅延 改善報告

作成日: 2026-07-17
対象ブランチ: `feature/p3-7-0-1-live-midi-latency`
Base: `fix/p3-7-0-midi-device-settings`（PR #113）

## 1. 結論

Live MIDI Mini Modeの表示経路を、40ms固定pollingから次のdeadlineに対する単一timerへ変更した。notesとBassはMIDI batch受信時に即時更新し、コード表示を`provisionalChord`と`confirmedChord`へ分離した。

決定的benchmarkでは、同じ2ms transport注入条件でconfirmed表示が変更前p50 141ms / p90 157msから、変更後52ms / 52msへ短縮された。30ms以内のcompact chordに対するprovisional表示はp50 27ms / p90 39msだった。

コード候補の採点式、MIDI file解析、PlaybackController、Vault保存、履歴commit 400msは変更していない。

## 2. 計測の追加

実装変更より先に、次の計測点を追加した。`src-tauri/src/live_midi/`, `src/liveMidi/latencyMetrics.ts`, `src/liveMidi/liveMidiStore.ts`

| Stage | 計測内容 |
|---|---|
| `rustMidiReceived` | Rustのmidir callbackでchannel messageを受信した時点。遅延原点なので0ms |
| `rustBatchEmitted` | Rust受信からTauri event emitまで |
| `frontendBatchReceived` | Rust受信からWebView event callbackまで |
| `noteStateUpdated` | Rust受信からnote state更新まで |
| `provisionalCandidateGenerated` | chordを構成する最後の入力eventから候補生成まで |
| `provisionalChordDisplayed` | chordを構成する最後の入力eventからprovisional表示まで |
| `confirmedChordDisplayed` | chordを構成する最後の入力eventからconfirmed表示まで |

Rust側はUNIX epoch millisecondを`receivedAtMs`と`emittedAtMs`として渡す。frontendは`performance.timeOrigin + performance.now()`で同じepoch上の受信時刻を記録する。domainはこれらの時計を直接参照せず、既存のMIDI timestampを引数として使用する。

各stageは直近最大256サンプルを保持し、`defaultLiveMidiStore.getState().latency`からcount / p50 / p90を取得できる。計測情報は`data.json`やVault exportへ保存しない。

## 3. 変更前の原因

Rustの`recv_timeout(10ms)`は、event受信後に10ms待ってbatch化する処理ではなかった。workerがidle時に最大10ms待つだけで、eventを受け取るとqueueをdrainして即時emitする。そのため、Rust batch間隔は主原因ではなく変更していない。`src-tauri/src/live_midi/event_batch.rs`

主な遅延要因は次の2つだった。

1. 最初のコードを表示する`stableMs = 120`
2. 40ms固定intervalがstable期限を確認するまでの位相待ち（最大約40ms）

変更前は候補自体がbatch受信直後に生成されても、confirmed表示は最後の構成音から約120-160ms後になっていた。

## 4. 実装変更

### 4.1 即時notes / Bass

storeはMIDI eventごとにnote stateと`instant` detectionを同期更新する。UIはコード名と独立して、構成音とBassを`instant`から描画する。`src/liveMidi/liveMidiStore.ts`, `src/components/LiveMidiMiniMode.tsx`

そのため、confirmed chordをrelease grace中に保持している場合でも、実際の構成音とBassは先に変化する。

### 4.2 provisional / confirmed分離

store stateを次の3段階へ分離した。

- `instant`: 現在のnote stateから毎event生成。notes / Bass表示用
- `provisionalChord`: 高速表示条件を満たした一時コード
- `confirmedChord`: stabilizerのdeadlineを通過した確定コード。履歴生成に使用

provisional高速表示条件は次のとおり。`src/domain/liveMidi/provisionalChord.ts`

- candidateが構造化コードである
- held noteだけでdistinct pitch classが3以上
- sounding pitch classとheld pitch classが一致し、sustain由来の余分な音がない
- 最初から最後のheld Note Onが30ms以内
- Top-1とTop-2のscore marginが0.03以上
- candidate Bassが最低held noteと一致する

コード採点ロジックは変更せず、既存scoreのTop-1値とmarginを表示判断へ渡すだけにした。`src/domain/liveMidi/liveChordDetector.ts`

### 4.3 単一deadline timer

40ms固定intervalを削除した。stabilizerが`nextDeadlineMs`を返し、storeが必要なdelayだけ`setTimeout`する。MIDI eventでcandidateが変わった場合は既存timerを解除して次のdeadlineへ張り直す。

履歴commitも旧40ms intervalに依存していたため、`liveChordHistoryDeadline()`を追加し、stabilizer deadlineとhistory deadlineのうち早い方を同じ単一timerへ設定する。これにより、演奏後に新しいMIDI eventがなくても400ms後に履歴へ追加される。

デバイスhotplug確認用の2秒intervalは別責務のため維持している。

### 4.4 timing変更

| Timing | 変更前 | 変更後 |
|---|---:|---:|
| gather | 80ms | 40ms |
| stable | 120ms | 50ms |
| release grace | 250ms | 200ms |
| full release | 300ms | 180ms |
| history commit | 400ms | 400ms（変更なし） |
| bass grace定数 | 120ms | 120ms（変更なし） |

音が増えるsuperset方向は40ms、root・quality・Bassなどの変更は50ms、音が減るsubset方向は200msとして扱う。

## 5. p50 / p90

`npm run benchmark:live-midi`で、変更前後へ同一の2ms transportを注入した決定的scheduler benchmarkを実行した。これはアルゴリズムとtimer設計の比較であり、物理鍵盤・driver・WebView schedulingの実測値ではない。

| Stage | 変更前 p50 | 変更前 p90 | 変更後 p50 | 変更後 p90 |
|---|---:|---:|---:|---:|
| Rust MIDI受信 | 0ms | 0ms | 0ms | 0ms |
| Rust batch emit | 1ms | 1ms | 1ms | 1ms |
| frontend batch受信 | 2ms | 2ms | 2ms | 2ms |
| notes / Bass更新 | 2ms | 2ms | 2ms | 2ms |
| provisional candidate生成 | 2ms | 2ms | 2ms | 2ms |
| block chord provisional表示 | 未実装 | 未実装 | 27ms | 39ms |
| confirmed表示 | 141ms | 157ms | 52ms | 52ms |

補足シナリオ:

| シナリオ | 変更後結果 |
|---|---:|
| 同時押鍵block chord provisional | 42ms（2ms transportを含む） |
| 30ms分散押鍵 provisional | 最後の音から12ms、最初の音から42ms |
| 80ms arpeggio confirmed | 最後の音から52ms、最初の音から132ms |
| full release | 182ms |

受け入れ目標との比較:

- notes/Bass p50 <=20ms、p90 <=40ms: benchmark PASS
- block chord provisional p50 <=70ms、p90 <=110ms: benchmark PASS
- confirmed p50 <=110ms、p90 <=150ms: benchmark PASS
- arpeggioを最後の構成音から150ms以内: benchmark PASS
- full release後200ms以内: benchmark PASS

物理鍵盤によるruntime p50 / p90は、今回の自動確認中にNote On/Offが発生していないためサンプル0件であり、**未測定**。推測値を実測値として扱わない。最新EXEにはruntime計測が組み込まれているため、実演奏後にstoreのlatency reportを取得できる。

## 6. ちらつき対策

- provisionalとconfirmedが同じコードの場合、UI上のラベルは変わらないため可視切替は`— -> chord`の1回だけ。
- passing toneは既存held noteとのNote On spanが30msを超えるためfast provisionalにならない。40ms以内に消えた場合はconfirmedへ進まない。
- extension追加はsupersetとして40msで処理する。
- root、quality、Bass変更は50msでconfirmedへ進める。
- 部分releaseは200ms保持する。
- sustain由来の音がheld setへ混在する場合、fast provisionalを抑止する。
- full releaseは180ms後に`—`へ戻す。

## 7. 追加テスト

追加・更新したテストは次を検証する。

- 3音block chord
- 4音block chord
- 30ms以内の分散押鍵
- 80ms arpeggio
- passing tone
- extension追加
- root変更
- Bass変更
- 部分release
- full release
- sustain
- provisionalからconfirmed
- timer deadline
- history commit deadline
- notes/Bassの即時UI反映
- p50 / p90 benchmark
- deterministic
- latency trackerのsample上限とpercentile

## 8. 検証結果

| 検証 | 結果 |
|---|---|
| `npm run lint` | PASS |
| `npm test -- --run` | PASS: 101 files / 589 tests |
| `npx tsc --noEmit` | PASS |
| `cargo test` | PASS: 1 test |
| `npm run build` | PASS |
| `npm run tauri build` | PASS |
| `npm run benchmark:live-midi` | PASS |
| Windows mini遷移 | PASS: 340 x 200、overflowなし |
| Windows MIDI接続 | PASS: `Roland Digital Piano` / 接続済み |

生成物:

- `src-tauri/target/release/loop-vault.exe`
- `src-tauri/target/release/bundle/msi/Loop Vault_0.1.0_x64_en-US.msi`
- `src-tauri/target/release/bundle/nsis/Loop Vault_0.1.0_x64-setup.exe`

既知の警告はJavaScript chunkが500kBを超えていること。今回の変更に固有のbuild errorやtest failureはない。

## 9. 非変更範囲

- chord detectorの採点式
- Rust transportの即時emit方式
- MIDI file解析
- PlaybackController
- Vault repository / autosave / backup
- SavedProgressionBlock schema
- `fileVersion = 1`
- `defaultAnalyzerMode = legacy`

## 10. 残る確認

物理鍵盤で20回以上block chord、arpeggio、部分release、sustainを演奏し、runtime reportの各stage count / p50 / p90を採取する必要がある。特にdriverとWebViewを含む`frontendBatchReceived`、実timer jitterを含む`provisionalChordDisplayed` / `confirmedChordDisplayed`は、実演奏値で最終評価する。
